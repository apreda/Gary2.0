#!/usr/bin/env node
/**
 * THE SHADOW READ (founder GO, Sep 3 2026): grade the shadow model's MLB
 * picks from the official finals, read them on the same closing-line ruler
 * as Gary's, and print Gary vs the shadow for a date or range:
 *
 *   node scripts/run-shadow-read.js                 # yesterday (ET)
 *   node scripts/run-shadow-read.js 2026-09-03
 *   node scripts/run-shadow-read.js 2026-09-03 2026-09-24
 *
 * Also runs after nightly grading from run-all-results.js. Nothing here
 * reaches Gary or a fan.
 */
import '../src/loadEnv.js';
import { readPick } from '../src/services/closingLine.js';
import { getMlbSchedule } from '../src/services/mlbStatsApiService.js';

const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
const db = supabaseAdmin || supabase;

function etYesterday() {
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function dateRange(a, b) {
  const out = [];
  for (let t = new Date(`${a}T12:00:00Z`).getTime(); t <= new Date(`${b}T12:00:00Z`).getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
const unitsOf = (price, result) => {
  if (result === 'won') return Number(price) > 0 ? Number(price) / 100 : 100 / Math.abs(Number(price));
  return result === 'lost' ? -1 : 0;
};

/** Grade one shadow row from an official final (home/away runs). */
export function gradeShadow(row, homeRuns, awayRuns) {
  if (!Number.isFinite(homeRuns) || !Number.isFinite(awayRuns) || homeRuns === awayRuns) return null;
  const mine = row.side === 'home' ? homeRuns : awayRuns;
  const theirs = row.side === 'home' ? awayRuns : homeRuns;
  if (row.bet_type === 'spread') {
    const margin = mine - theirs + Number(row.point || 0);
    return margin > 0 ? 'won' : margin < 0 ? 'lost' : 'push';
  }
  return mine > theirs ? 'won' : 'lost';
}

export async function readShadow(dates) {
  const { data: rows, error } = await db.from('shadow_picks').select('*').in('game_date', dates);
  if (error) throw error;
  if (!rows?.length) return [];
  // Finals from the official schedule (linescore rides the schedule call).
  const finals = new Map();
  for (const d of dates) {
    const sched = await getMlbSchedule(d).catch(() => []);
    for (const g of sched || []) {
      const st = String(g?.status?.detailedState || '');
      if (!/final|completed|game over/i.test(st)) continue;
      const hr = Number(g?.linescore?.teams?.home?.runs);
      const ar = Number(g?.linescore?.teams?.away?.runs);
      if (g?.gamePk != null) finals.set(String(g.gamePk), { hr, ar });
    }
  }
  const { data: snaps } = await db.from('odds_snapshots')
    .select('game_date, game_id, moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, line_vendor, seen_at')
    .eq('sport', 'baseball_mlb').in('game_date', dates);
  const snapsByGame = new Map();
  for (const s of snaps || []) {
    const k = `${s.game_date}|${String(s.game_id)}`;
    if (!snapsByGame.has(k)) snapsByGame.set(k, []);
    snapsByGame.get(k).push(s);
  }
  const { data: slate } = await db.from('daily_slate').select('date, bdl_game_id, commence_time').in('date', dates).eq('league', 'MLB');
  const startOf = new Map((slate || []).map((s) => [`${s.date}|${String(s.bdl_game_id)}`, s.commence_time]));

  const updates = [];
  for (const r of rows) {
    const fin = r.game_pk ? finals.get(String(r.game_pk)) : null;
    const result = fin ? gradeShadow(r, fin.hr, fin.ar) : r.result ?? null;
    const units = result ? unitsOf(r.price, result) : null;
    const gameSnaps = snapsByGame.get(`${r.game_date}|${r.game_id}`) || [];
    const pickLike = {
      pick: r.pick_text, type: r.bet_type, odds: r.price, spread: r.point,
      moneylineHome: r.board?.moneyline_home, moneylineAway: r.board?.moneyline_away,
      homeTeam: r.home_team, awayTeam: r.away_team, bestLineBook: r.board?.line_vendor || null,
      game_date: r.game_date, league: 'MLB', game_id: r.game_id,
    };
    const read = readPick(pickLike, gameSnaps, { commenceTime: startOf.get(`${r.game_date}|${r.game_id}`) || null });
    updates.push({ ...r, result, units, clv_pts: read.clv_pts, open_to_close_pts: read.open_to_close_pts, graded_at: result ? new Date().toISOString() : r.graded_at });
  }
  const { error: e2 } = await db.from('shadow_picks').upsert(updates.map(({ id, ...u }) => u), { onConflict: 'game_date,league,game_id' });
  if (e2) throw e2;
  return updates;
}

/** Gary's graded MLB picks for the same dates, keyed by game id. */
async function garyRows(dates) {
  const { data: days } = await db.from('daily_picks').select('date, picks').in('date', dates);
  const { data: results } = await db.from('game_results').select('game_date, game_id, pick_text, result').in('game_date', dates);
  const res = new Map((results || []).map((r) => [`${r.game_date}|${String(r.game_id)}|${r.pick_text}`, r.result]));
  const out = new Map();
  for (const d of days || []) {
    for (const p of d.picks || []) {
      if (String(p?.league || '').toUpperCase() !== 'MLB' || p?.game_id == null) continue;
      const result = res.get(`${d.date}|${String(p.game_id)}|${p.pick}`) ?? null;
      out.set(`${d.date}|${String(p.game_id)}`, { pick: p.pick, odds: Number(p.odds), result, units: result ? unitsOf(p.odds, result) : null });
    }
  }
  return out;
}

const rec = (rs) => {
  const g = rs.filter((r) => r.result === 'won' || r.result === 'lost');
  const w = g.filter((r) => r.result === 'won').length;
  const u = Math.round(g.reduce((s, r) => s + (r.units || 0), 0) * 100) / 100;
  return { n: g.length, w, l: g.length - w, units: u };
};
const fmtRec = (r) => `${r.w}-${r.l} (${r.units >= 0 ? '+' : ''}${r.units}u)`;
const rightRate = (rs, key) => {
  const x = rs.filter((r) => r[key] != null);
  if (!x.length) return 'none read';
  const right = x.filter((r) => r[key] > 0).length;
  return `${right}/${x.length} right side`;
};

export async function printShadowRead(rows, dates, label) {
  const gary = await garyRows(dates);
  const paired = rows.map((r) => ({ r, g: gary.get(`${r.game_date}|${r.game_id}`) || null }));
  const shadowRec = rec(rows);
  const garyRec = rec(paired.filter((p) => p.g).map((p) => p.g));
  const agree = paired.filter((p) => p.g && p.r.agree_with_gary === true).length;
  const disagree = paired.filter((p) => p.g && p.r.agree_with_gary === false);
  const shadowOnDisagree = rec(disagree.map((p) => p.r));
  const garyOnDisagree = rec(disagree.map((p) => p.g));
  console.log(`\n🧪 SHADOW vs GARY — ${label}: ${rows.length} shadow picks, ${paired.filter((p) => p.g).length} with a Gary pick`);
  console.log(`  shadow: ${fmtRec(shadowRec)} · ${rightRate(rows, 'clv_pts')} pick→close · ${rightRate(rows, 'open_to_close_pts')} open→close`);
  console.log(`  gary:   ${fmtRec(garyRec)} (same games)`);
  console.log(`  same side ${agree} · different side ${disagree.length} → on those, shadow ${fmtRec(shadowOnDisagree)} vs gary ${fmtRec(garyOnDisagree)}`);
  const drivers = new Map();
  for (const r of rows) for (const d of r.drivers || []) {
    const k = d.name;
    if (!drivers.has(k)) drivers.set(k, { n: 0, agree: 0 });
    const e = drivers.get(k);
    if (r.clv_pts != null && d.pts) { e.n += 1; if (Math.sign(d.pts) === Math.sign((r.side === 'home' ? 1 : -1) * r.clv_pts)) e.agree += 1; }
  }
  if (drivers.size) console.log(`  drivers vs the close: ${[...drivers.entries()].map(([k, v]) => `${k} ${v.agree}/${v.n}`).join(' · ')}`);
  for (const p of paired.sort((a, b) => String(a.r.game_date).localeCompare(String(b.r.game_date)))) {
    const s = p.r;
    console.log(`  ${s.game_date} ${s.matchup.padEnd(36)} shadow ${s.pick_text.padEnd(22)} ${s.result || '—'}${s.clv_pts != null ? ` (${s.clv_pts >= 0 ? '+' : ''}${s.clv_pts} pts)` : ''}  · gary ${p.g ? `${p.g.pick} ${p.g.result || '—'}` : '—'}  ${s.agree_with_gary === false ? '≠' : ''}`);
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const [a, b] = process.argv.slice(2);
  const dates = a ? dateRange(a, b || a) : [etYesterday()];
  const rows = await readShadow(dates);
  await printShadowRead(rows, dates, dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`);
  process.exit(0);
}
