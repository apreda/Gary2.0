#!/usr/bin/env node
/**
 * READ-ONLY backtest of stored NBA DFS lineups (dfs_lineups table)
 * against actual BDL box scores.
 *
 * - SELECT only (no DB writes), no Gemini/AI calls.
 * - Scoring formulas mirror src/services/dfsLineupService.js:
 *     DK: pts(1), 3PM(+0.5), reb(1.25), ast(1.5), stl(2), blk(2), TO(-0.5),
 *         DD(+1.5), TD(+3 additional) — categories = pts/reb/ast/stl/blk >= 10
 *     FD: pts(1), reb(1.2), ast(1.5), stl(3), blk(3), TO(-1), no bonuses
 *
 * Usage: node scripts/backtest-dfs-lineups.js
 * Output: stdout report + outputs/dfs-backtest-results.json
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

await import('../src/loadEnv.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY =
  process.env.BALLDONTLIE_API_KEY ||
  process.env.VITE_BALLDONTLIE_API_KEY ||
  process.env.VITE_BALL_DONT_LIE_API_KEY ||
  process.env.BALL_DONT_LIE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase credentials'); process.exit(1); }
if (!BDL_API_KEY) { console.error('Missing BallDontLie API key'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const FIX_DATE = '2026-03-21'; // projections pipeline fixed March 20-21, 2026

// ── helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.replace(/[.'’\-]/g, ' ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // strip suffixes
  s = s.replace(/\b(jr|sr|iii|ii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

function firstInitialLast(normName) {
  const parts = normName.split(' ');
  if (parts.length < 2) return null;
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

function parseMinutes(min) {
  if (min == null) return 0;
  const s = String(min);
  const m = s.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function dkPoints(s) {
  let pts =
    (s.pts || 0) * 1 +
    (s.fg3m || 0) * 0.5 +
    (s.reb || 0) * 1.25 +
    (s.ast || 0) * 1.5 +
    (s.stl || 0) * 2 +
    (s.blk || 0) * 2 -
    (s.turnover || 0) * 0.5;
  const cats = [s.pts, s.reb, s.ast, s.stl, s.blk].filter((v) => (v || 0) >= 10).length;
  if (cats >= 2) pts += 1.5;
  if (cats >= 3) pts += 3.0;
  return Math.round(pts * 100) / 100;
}

function fdPoints(s) {
  const pts =
    (s.pts || 0) * 1 +
    (s.reb || 0) * 1.2 +
    (s.ast || 0) * 1.5 +
    (s.stl || 0) * 3 +
    (s.blk || 0) * 3 -
    (s.turnover || 0) * 1;
  return Math.round(pts * 100) / 100;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function stdev(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

// ── BDL stats fetch (per date, paginated, 429 retry) ────────────────────────

async function fetchStatsForDate(date) {
  const rows = [];
  let cursor;
  let page = 0;
  while (page < 15) {
    const params = new URLSearchParams();
    params.append('dates[]', date);
    params.append('per_page', '100');
    if (cursor != null) params.append('cursor', String(cursor));
    const url = `https://api.balldontlie.io/nba/v1/stats?${params.toString()}`;

    let resp;
    for (let attempt = 0; attempt < 5; attempt++) {
      resp = await fetch(url, { headers: { Authorization: BDL_API_KEY } });
      if (resp.status === 429) {
        const wait = 1500 * (attempt + 1);
        console.log(`  [BDL] 429 on ${date} page ${page + 1}, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      break;
    }
    if (!resp.ok) throw new Error(`BDL ${resp.status} for ${date}: ${(await resp.text()).slice(0, 200)}`);
    const json = await resp.json();
    rows.push(...(json.data || []));
    cursor = json.meta?.next_cursor;
    page++;
    if (cursor == null) break;
    await sleep(120);
  }
  return rows;
}

function buildNameMap(statRows) {
  // exact normalized name -> stat row (sum if multiple rows for same player, e.g. shouldn't happen per date)
  const exact = new Map();
  for (const row of statRows) {
    const full = `${row.player?.first_name || ''} ${row.player?.last_name || ''}`;
    const key = normalizeName(full);
    if (!key) continue;
    if (exact.has(key)) {
      // duplicate name on same date (rare) — keep the one with more minutes
      const prev = exact.get(key);
      if (parseMinutes(row.min) > parseMinutes(prev.min)) exact.set(key, row);
    } else {
      exact.set(key, row);
    }
  }
  // first-initial + last name -> list of exact keys
  const fil = new Map();
  for (const key of exact.keys()) {
    const f = firstInitialLast(key);
    if (!f) continue;
    if (!fil.has(f)) fil.set(f, []);
    fil.get(f).push(key);
  }
  return { exact, fil };
}

function matchPlayer(name, maps) {
  const norm = normalizeName(name);
  if (maps.exact.has(norm)) return maps.exact.get(norm);
  const f = firstInitialLast(norm);
  if (f && maps.fil.has(f)) {
    const candidates = maps.fil.get(f);
    if (candidates.length === 1) return maps.exact.get(candidates[0]);
  }
  return null;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('READ-ONLY DFS LINEUP BACKTEST (NBA)');
  console.log('====================================');

  // 1. Fetch all NBA lineups (SELECT only)
  const all = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('dfs_lineups')
      .select('id, date, platform, slate_name, contest_type, total_salary, salary_cap, projected_points, ceiling_projection, lineup')
      .eq('sport', 'NBA')
      .order('date', { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(`Supabase: ${error.message}`);
    all.push(...data);
    if (data.length < 500) break;
  }
  console.log(`Fetched ${all.length} NBA lineups (${all[0]?.date} → ${all[all.length - 1]?.date})`);

  // 2. Group by date, fetch box scores per date
  const dates = [...new Set(all.map((l) => l.date))].sort();
  console.log(`Distinct dates: ${dates.length}`);

  const statMapsByDate = {};
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const rows = await fetchStatsForDate(d);
    statMapsByDate[d] = buildNameMap(rows);
    console.log(`  [${i + 1}/${dates.length}] ${d}: ${rows.length} stat lines`);
    await sleep(150);
  }

  // 3. Grade each lineup
  const graded = [];
  const unmatchedNames = {};
  for (const lu of all) {
    const maps = statMapsByDate[lu.date];
    const platform = String(lu.platform || '').toLowerCase();
    const scorer = platform === 'fanduel' ? fdPoints : dkPoints;
    const players = Array.isArray(lu.lineup) ? lu.lineup : [];

    let actualTotal = 0;
    let dnpCount = 0;
    let unmatchedCount = 0;
    const playerResults = [];

    for (const p of players) {
      const stat = matchPlayer(p.player, maps);
      if (!stat) {
        unmatchedCount++;
        unmatchedNames[p.player] = (unmatchedNames[p.player] || 0) + 1;
        playerResults.push({ player: p.player, matched: false });
        continue;
      }
      const mins = parseMinutes(stat.min);
      const fp = mins === 0 ? 0 : scorer(stat);
      if (mins === 0) dnpCount++;
      actualTotal += fp;
      playerResults.push({
        player: p.player,
        matched: true,
        min: mins,
        actual: fp,
        projected: p.projected_pts ?? null
      });
    }

    const projectedTotal =
      lu.projected_points ??
      players.reduce((a, p) => a + (p.projected_pts || 0), 0);
    const salary = lu.total_salary || players.reduce((a, p) => a + (p.salary || 0), 0);

    graded.push({
      id: lu.id,
      date: lu.date,
      month: lu.date.slice(0, 7),
      platform,
      slate_name: lu.slate_name ?? null,
      contest_type: lu.contest_type ?? null,
      nPlayers: players.length,
      totalSalary: salary,
      salaryCap: lu.salary_cap ?? null,
      projectedTotal: Math.round(projectedTotal * 10) / 10,
      ceilingProjection: lu.ceiling_projection ?? null,
      actualTotal: Math.round(actualTotal * 100) / 100,
      error: Math.round((actualTotal - projectedTotal) * 100) / 100,
      dnpCount,
      unmatchedCount,
      clean: unmatchedCount === 0,
      players: playerResults
    });
  }

  // 4. Aggregates
  function aggregate(lineups, label) {
    const clean = lineups.filter((l) => l.clean);
    const actuals = clean.map((l) => l.actualTotal);
    const projs = clean.map((l) => l.projectedTotal);
    const errs = clean.map((l) => l.error);
    const ptsPer1k = clean
      .filter((l) => l.totalSalary > 0)
      .map((l) => l.actualTotal / (l.totalSalary / 1000));
    const dnps = clean.map((l) => l.dnpCount);

    const agg = {
      label,
      nLineups: lineups.length,
      nClean: clean.length,
      nWithUnmatched: lineups.length - clean.length,
      meanActual: r1(mean(actuals)),
      medianActual: r1(median(actuals)),
      meanProjected: r1(mean(projs)),
      meanBias_actualMinusProjected: r1(mean(errs)),
      stdevActual: r1(stdev(actuals)),
      meanPtsPer$1K: r1(mean(ptsPer1k)),
      avgDnpPerLineup: r1(mean(dnps))
    };
    const plat = label.toLowerCase();
    if (plat.includes('draftkings') || plat.includes('overall')) {
      agg.pctDK_gte240 = pct(actuals.filter((a) => a >= 240).length, actuals.length);
      agg.pctDK_gte260 = pct(actuals.filter((a) => a >= 260).length, actuals.length);
    }
    if (plat.includes('fanduel')) {
      agg.pctFD_gte280 = pct(actuals.filter((a) => a >= 280).length, actuals.length);
      agg.pctFD_gte310 = pct(actuals.filter((a) => a >= 310).length, actuals.length);
    }
    return agg;
  }

  const platforms = [...new Set(graded.map((l) => l.platform))].sort();
  const aggs = {
    overall: aggregate(graded, 'Overall'),
    byPlatform: Object.fromEntries(
      platforms.map((p) => [p, aggregate(graded.filter((l) => l.platform === p), p)])
    )
  };

  // thresholds make sense per platform; overall threshold numbers are DK-scale, mark as such
  delete aggs.overall.pctDK_gte240;
  delete aggs.overall.pctDK_gte260;

  // Monthly trend (clean lineups only)
  const months = [...new Set(graded.map((l) => l.month))].sort();
  const monthly = months.map((m) => {
    const rows = graded.filter((l) => l.month === m && l.clean);
    const byPlat = {};
    for (const p of platforms) {
      const pr = rows.filter((l) => l.platform === p);
      if (pr.length) byPlat[p] = { n: pr.length, meanActual: r1(mean(pr.map((l) => l.actualTotal))), meanProjected: r1(mean(pr.map((l) => l.projectedTotal))) };
    }
    return {
      month: m,
      n: rows.length,
      meanActual: r1(mean(rows.map((l) => l.actualTotal))),
      meanProjected: r1(mean(rows.map((l) => l.projectedTotal))),
      meanBias: r1(mean(rows.map((l) => l.error))),
      byPlatform: byPlat
    };
  });

  // Pre/post March 21 2026 split
  const pre = graded.filter((l) => l.date < FIX_DATE);
  const post = graded.filter((l) => l.date >= FIX_DATE);
  const prePost = {
    fixDate: FIX_DATE,
    pre: {
      overall: aggregate(pre, 'Pre overall'),
      byPlatform: Object.fromEntries(platforms.map((p) => [p, aggregate(pre.filter((l) => l.platform === p), `Pre ${p}`)]))
    },
    post: {
      overall: aggregate(post, 'Post overall'),
      byPlatform: Object.fromEntries(platforms.map((p) => [p, aggregate(post.filter((l) => l.platform === p), `Post ${p}`)]))
    }
  };

  const unmatchedTotalSlots = graded.reduce((a, l) => a + l.unmatchedCount, 0);
  const totalSlots = graded.reduce((a, l) => a + l.nPlayers, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    fixDate: FIX_DATE,
    nLineups: graded.length,
    nDates: dates.length,
    dateRange: [dates[0], dates[dates.length - 1]],
    dataQuality: {
      totalPlayerSlots: totalSlots,
      unmatchedPlayerSlots: unmatchedTotalSlots,
      unmatchedRatePct: pct(unmatchedTotalSlots, totalSlots),
      lineupsExcludedFromCleanAggs: graded.filter((l) => !l.clean).length,
      unmatchedNames: Object.entries(unmatchedNames).sort((a, b) => b[1] - a[1])
    },
    aggregates: aggs,
    prePostMarch21: prePost,
    monthlyTrend: monthly,
    lineups: graded
  };

  // 5. Write JSON
  const outDir = path.resolve(process.cwd(), 'outputs');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dfs-backtest-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // 6. Print report
  const P = (o) => console.log(JSON.stringify(o, null, 2));
  console.log('\n================ AGGREGATE REPORT ================');
  console.log('\n--- OVERALL ---'); P(aggs.overall);
  for (const p of platforms) { console.log(`\n--- ${p.toUpperCase()} ---`); P(aggs.byPlatform[p]); }
  console.log('\n--- PRE vs POST 2026-03-21 (projection-pipeline fix) ---');
  console.log('\nPRE overall:'); P(prePost.pre.overall);
  for (const p of platforms) { console.log(`PRE ${p}:`); P(prePost.pre.byPlatform[p]); }
  console.log('\nPOST overall:'); P(prePost.post.overall);
  for (const p of platforms) { console.log(`POST ${p}:`); P(prePost.post.byPlatform[p]); }
  console.log('\n--- MONTHLY TREND (clean lineups) ---');
  for (const m of monthly) {
    console.log(`${m.month}: n=${m.n} meanActual=${m.meanActual} meanProj=${m.meanProjected} bias=${m.meanBias}`);
  }
  console.log('\n--- DATA QUALITY ---');
  console.log(`Unmatched player slots: ${unmatchedTotalSlots}/${totalSlots} (${report.dataQuality.unmatchedRatePct}%)`);
  console.log(`Lineups excluded from clean aggregates: ${report.dataQuality.lineupsExcludedFromCleanAggs}`);
  if (report.dataQuality.unmatchedNames.length) {
    console.log('Unmatched names (count):');
    for (const [n, c] of report.dataQuality.unmatchedNames) console.log(`  ${n}: ${c}`);
  }
  console.log(`\nFull JSON written to ${outPath}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
