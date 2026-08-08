#!/usr/bin/env node
/**
 * Betting Recaps — manual / backfill runner
 *
 * Writes the 2-4 sentence ESPN-style betting recap (headline + body) for game
 * picks that already have a graded row in game_results. The nightly path
 * (scripts/run-all-results.js) does this automatically right after grading —
 * this CLI exists for backfills and re-runs.
 *
 * Joins daily_picks (the pick + odds) to game_results (the graded outcome) by
 * pick_text, builds the evidence pack (final score + BDL MLB per-game stats
 * when available + the game's graded props with their real prices, so the
 * slide bullets can carry the betting lens), makes ONE Flash call per pick via
 * src/services/gameRecap.js, and writes game_recaps rows (headline + recap +
 * bullets). Idempotent: matchups already recapped for the date are skipped
 * (use --force to redo them).
 *
 * NOTE: covers game_results only — weekly NFL picks (nfl_results) are handled
 * by the nightly path. Props are never recapped.
 *
 * Usage:
 *   node scripts/run-game-recaps.js --date 2026-06-09                # one date, all leagues
 *   node scripts/run-game-recaps.js --date 2026-06-09 --league MLB   # one league
 *   node scripts/run-game-recaps.js --date 2026-06-09 --force        # redo existing rows
 *   node scripts/run-game-recaps.js --date 2026-06-09 --repair-headlines-only
 *   node scripts/run-game-recaps.js --date 2026-06-09 --dry-run      # no writes
 */

import { createClient } from '@supabase/supabase-js';
import {
  generateRecap, filterPropsForGame, buildBoxLine, gameOnlyHeadline, headlineNeedsRepair,
} from '../src/services/gameRecap.js';
import { buildGameEvidence } from '../src/services/factCheck.js';
// Load environment variables FIRST (centralized)
await import('../src/loadEnv.js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || process.env.BALL_DONT_LIE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY — recaps need Flash.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Arg parsing (mirrors run-fact-checks.js) ────────────────────────────────
const args = process.argv.slice(2);
function getArgValue(flag) {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const repairHeadlinesOnly = args.includes('--repair-headlines-only');
const leagueArg = getArgValue('--league')?.toUpperCase() || null;
const explicitDate = getArgValue('--date');

// ET-anchored date (mirrors the cloud grader's estDate so recap dates line up
// with how game_results files games — game_date IS the ET slate day).
function estDate(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// When no --date is passed, cover TODAY + YESTERDAY (ET) just like the cloud
// grade-results function (estDate(0)/estDate(-1)). Today's games get graded by
// the cloud grader as they finish, but game_recaps (the Home marquee headline
// TEXT) is written only here — so recapping today AS games settle rolls the
// headline same-day instead of waiting for the 2am yesterday-only pass.
const targetDates = explicitDate ? [explicitDate] : [estDate(0), estDate(-1)];

for (const d of targetDates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error(`❌ Invalid date "${d}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }
}

// ── Evidence helpers ─────────────────────────────────────────────────────────

/**
 * Fetch a slate's MLB player stats as one cursor-paginated request. The old
 * backfill made one request per game, which needlessly hit BDL's rate limit and
 * left later cards with score-only headlines. One slate normally takes 4-6
 * pages and every returned row is then grouped by game_id locally.
 */
async function fetchMlbStatsForGames(gameIds) {
  const ids = [...new Set((gameIds || []).filter((id) => id != null).map(String))];
  const byGame = new Map();
  if (!BDL_API_KEY || !ids.length) return byGame;

  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ per_page: '100' });
    for (const id of ids) params.append('game_ids[]', id);
    if (cursor != null) params.set('cursor', String(cursor));

    try {
      const res = await fetch(`https://api.balldontlie.io/mlb/v1/stats?${params}`, {
        headers: { 'Authorization': BDL_API_KEY },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.warn(`  ⚠️ MLB slate stats page ${page + 1} unavailable (${res.status})`);
        break;
      }
      const payload = await res.json();
      for (const row of payload?.data || []) {
        const key = String(row.game_id ?? '');
        if (!key) continue;
        if (!byGame.has(key)) byGame.set(key, []);
        byGame.get(key).push(row);
      }
      cursor = payload?.meta?.next_cursor ?? null;
      if (cursor == null) break;
    } catch (error) {
      console.warn(`  ⚠️ MLB slate stats timed out: ${error.message}`);
      break;
    }
  }
  return byGame;
}



/**
 * THE MENU, BACK OUT (founder, Aug 5: "very few have odds"). propsBrain
 * snapshots every priced market at seal time; this hands those prices to the
 * recap writer so a bullet about a prop Gary never took can still say what it
 * would have paid. The writer's own rule does the rest — a price rides along
 * ONLY where that exact price appears in the evidence, so nothing is invented
 * for a game with no snapshot.
 */
async function propMenuEvidence(gameDate, matchup) {
  try {
    const { data } = await supabase
      .from('prop_menu').select('markets')
      .eq('game_date', gameDate).eq('matchup', matchup).maybeSingle();
    const rows = data?.markets;
    if (!Array.isArray(rows) || !rows.length) return '';
    const fmt = (o) => (o == null ? null : (o > 0 ? `+${o}` : `${o}`));
    const lines = rows.slice(0, 60).map((m) => {
      const over = fmt(m.over), under = fmt(m.under);
      const price = over && under ? `Over ${over} / Under ${under}`
        : over ? `Over ${over}` : under ? `Under ${under}` : null;
      return price ? `- ${m.player} ${m.prop_type} ${m.line}: ${price}` : null;
    }).filter(Boolean);
    if (!lines.length) return '';
    return `\n\nPROP PRICES OFFERED BEFORE THIS GAME (pregame board):\n${lines.join('\n')}`;
  } catch { return ''; }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(targetDate) {
  console.log(`\n📰 BETTING RECAPS — date=${targetDate}` +
    (leagueArg ? ` league=${leagueArg}` : '') + (dryRun ? ' (DRY RUN)' : '') + (force ? ' (FORCE)' : ''));

  // The picks (pick text + odds)
  const { data: pickRows, error: pickErr } = await supabase
    .from('daily_picks').select('picks').eq('date', targetDate);
  if (pickErr) {
    console.error(`❌ daily_picks fetch failed: ${pickErr.message}`);
    process.exit(1);
  }
  const picks = (pickRows || []).flatMap((row) =>
    typeof row.picks === 'string' ? JSON.parse(row.picks) : (row.picks || []));
  if (!picks.length) {
    console.log('No picks found for this date.');
    return;
  }

  // The graded outcomes. game_date can drift one day from the pick date (ET
  // normalization at grading time), so search a 2-day window and key by pick_text.
  const next = new Date(`${targetDate}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);
  const { data: results, error: resErr } = await supabase
    .from('game_results').select('game_date, league, matchup, pick_text, result, final_score')
    .in('game_date', [targetDate, nextStr]);
  if (resErr) {
    console.error(`❌ game_results fetch failed: ${resErr.message}`);
    process.exit(1);
  }
  const resultByPickText = new Map((results || []).map((r) => [r.pick_text, r]));

  // Fetch the whole MLB slate once. This is both faster and materially more
  // reliable than doing network I/O while rendering each recap one at a time.
  const mlbStatsByGame = await fetchMlbStatsForGames(
    picks.filter((p) => p.league?.toUpperCase() === 'MLB').map((p) => p.game_id),
  );

  // The night's graded props (real betting prices) — same 2-day window. Each
  // game's subset goes into the evidence pack so bullets can carry the lens.
  const { data: propRows, error: propErr } = await supabase
    .from('prop_results')
    .select('player_name, prop_type, line_value, actual_value, result, bet, odds, matchup')
    .in('game_date', [targetDate, nextStr]);
  if (propErr) {
    console.warn(`⚠️ prop_results fetch failed (bullets will omit prop prices): ${propErr.message}`);
  }

  let done = 0, skipped = 0, failed = 0;

  for (const pick of picks) {
    const league = pick.league?.toUpperCase();
    if (leagueArg && league !== leagueArg) continue;

    const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;
    const graded = resultByPickText.get(pick.pick);
    if (!graded) {
      console.log(`  ⏭️  ${league} ${matchup}: no graded result row — skipping`);
      skipped++;
      continue;
    }
    const gameDate = graded.game_date;

    // Idempotency (mirrors the nightly path)
    let { data: exist, error: dedupErr } = await supabase
      .from('game_recaps').select('id, headline')
      .eq('game_date', gameDate).eq('league', graded.league).eq('matchup', matchup)
      .maybeSingle();
    // Older rows sometimes stored short team names ("Mariners @ Orioles")
    // while daily_picks later carried the full names. The immutable pick text
    // is the reliable identity fallback, and prevents a valid old recap from
    // being mistaken for a missing one during repair/backfill.
    if (!dedupErr && !exist) {
      ({ data: exist, error: dedupErr } = await supabase
        .from('game_recaps').select('id, headline')
        .eq('game_date', gameDate).eq('league', graded.league).eq('pick_text', pick.pick)
        .maybeSingle());
    }
    if (dedupErr) {
      console.error(`  ❌ ${league} ${matchup}: dedup check failed: ${dedupErr.message}`);
      failed++;
      continue;
    }
    const editorialRepair = !!exist && headlineNeedsRepair(exist.headline);
    if (repairHeadlinesOnly && !exist) {
      console.log(`  ⏭️  ${league} ${matchup}: no existing recap — repair pass skips creation`);
      skipped++;
      continue;
    }
    if (exist) {
      if (!force && !editorialRepair) {
        console.log(`  ⏩ ${league} ${matchup}: recap exists — skipping (use --force to redo)`);
        skipped++;
        continue;
      }
      console.log(`  🔧 ${league} ${matchup}: ${force ? 'forced rewrite' : 'repairing non-editorial headline'}`);
    }

    // final_score is stored "away-home" (`${vs}-${hs}` in run-all-results.js)
    const [awayScore, homeScore] = String(graded.final_score || '').split('-').map(Number);

    const mlbStats = league === 'MLB'
      ? (mlbStatsByGame.get(String(pick.game_id)) || null)
      : null;
    const gradedProps = filterPropsForGame(propRows || [], pick.homeTeam, pick.awayTeam);
    const evidence = buildGameEvidence({
      league,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      homeScore,
      awayScore,
      mlbStats,
      gradedProps,
    }) + (league === 'MLB' ? await propMenuEvidence(gameDate, matchup) : '');

    // Historical headline repair is deterministic and evidence-only. The
    // existing recap body/bullets are already grounded and do not need another
    // model rewrite; replace only the bad headline from the fresh box dossier.
    if (exist && editorialRepair && !force) {
      const headline = gameOnlyHeadline(exist.headline, evidence);
      if (!headline) {
        console.warn(`  ⚠️ ${league} ${matchup}: headline repair had no evidence`);
        failed++;
        continue;
      }
      if (dryRun) {
        console.log(`  🧪 ${league} ${matchup}: ${headline}`);
      } else {
        const { error: repairErr } = await supabase.from('game_recaps')
          .update({ headline }).eq('id', exist.id);
        if (repairErr) {
          console.error(`  ❌ ${league} ${matchup}: headline repair failed: ${repairErr.message}`);
          failed++;
          continue;
        }
        console.log(`  📰 ${league} ${matchup}: ${headline}`);
      }
      done++;
      continue;
    }

    try {
      const recap = await generateRecap({ pick, result: graded.result, evidence });
      if (!recap) {
        console.warn(`  ⚠️ ${league} ${matchup}: no recap produced`);
        failed++;
        continue;
      }

      const row = {
        game_date: gameDate,
        league: graded.league,
        matchup,
        pick_text: pick.pick,
        result: graded.result,
        headline: recap.headline,
        recap: recap.recap,
        bullets: recap.bullets || [],
      };
      const box = buildBoxLine({
        mlbStats, awayTeam: pick.awayTeam, homeTeam: pick.homeTeam, awayScore, homeScore,
      });
      if (box) row.box = box;

      if (dryRun) {
        console.log(`  🧪 ${league} ${matchup} (${graded.result}):`);
        console.log(JSON.stringify(row, null, 2));
        done++;
        continue;
      }

      let writeQuery = exist
        ? supabase.from('game_recaps').update(row).eq('id', exist.id)
        : supabase.from('game_recaps').insert(row);
      let { error: insertErr } = await writeQuery;
      // The box column ships ahead of its migration in some environments —
      // a recap is worth more than its box line, so retry without it rather
      // than losing the row.
      if (insertErr && /box/i.test(insertErr.message || '') && row.box) {
        console.warn(`  ⚠️ ${league} ${matchup}: no box column yet — writing recap without it`);
        const { box: _dropped, ...withoutBox } = row;
        writeQuery = exist
          ? supabase.from('game_recaps').update(withoutBox).eq('id', exist.id)
          : supabase.from('game_recaps').insert(withoutBox);
        ({ error: insertErr } = await writeQuery);
      }
      if (insertErr) {
        console.error(`  ❌ ${league} ${matchup}: insert failed: ${insertErr.message}`);
        failed++;
        continue;
      }
      console.log(`  📰 ${league} ${matchup} [${graded.result.toUpperCase()} ${graded.final_score}]`);
      console.log(`      ${recap.headline}`);
      console.log(`      ${recap.recap}`);
      for (const b of recap.bullets || []) console.log(`      • ${b}`);
      done++;
    } catch (e) {
      console.error(`  ❌ ${league} ${matchup}: recap failed: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`BETTING RECAPS FOR ${targetDate}: ${done} written, ${skipped} skipped, ${failed} failed`);
  console.log(`════════════════════════════════════════\n`);
}

// Run each target date through the (idempotent) recap pass. Today first so the
// Home marquee headline rolls to today's finished games as soon as possible;
// yesterday second to backfill any late finals the cloud grader settled
// overnight. Already-recapped matchups are skipped (see dedup above), so this is
// a no-op / $0 when nothing new has finished.
async function run() {
  for (const d of targetDates) {
    await main(d);
  }
}

run().catch((err) => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
