#!/usr/bin/env node
/**
 * Rationale Fact Checks — manual / backfill runner
 *
 * Grades Gary's RATIONALE claim-by-claim against what actually happened, for
 * game picks that already have a graded row in game_results. The nightly path
 * (scripts/run-all-results.js) does this automatically right after grading —
 * this CLI exists for backfills and re-runs.
 *
 * Joins daily_picks (the rationale) to game_results (the graded outcome) by
 * pick_text, builds the evidence pack (final score + BDL MLB per-game stats
 * when available), makes ONE Flash call per pick via src/services/factCheck.js,
 * and writes pick_fact_checks rows. Idempotent: matchups already fact-checked
 * for the date are skipped (use --force to redo them).
 *
 * NOTE: covers game_results only — weekly NFL picks (nfl_results) are handled
 * by the nightly path. Props are never fact-checked.
 *
 * Usage:
 *   node scripts/run-fact-checks.js --date 2026-06-09                # one date, all leagues
 *   node scripts/run-fact-checks.js --date 2026-06-09 --league MLB   # one league
 *   node scripts/run-fact-checks.js --date 2026-06-09 --force        # redo existing rows
 *   node scripts/run-fact-checks.js --date 2026-06-09 --dry-run      # no writes
 */

import { createClient } from '@supabase/supabase-js';
import { factCheckPick, buildGameEvidence } from '../src/services/factCheck.js';
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
  console.error('❌ Missing GEMINI_API_KEY — fact checks need Flash.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ── Arg parsing (mirrors run-wire-items.js) ─────────────────────────────────
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
const leagueArg = getArgValue('--league')?.toUpperCase() || null;
const targetDate = getArgValue('--date') || (() => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
})();

if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

// ── Evidence helpers ─────────────────────────────────────────────────────────

/** One cheap BDL fetch: per-game MLB player stats (pitcher lines, HRs, hits). */
async function fetchMlbStatsForGame(gameId) {
  if (!BDL_API_KEY || gameId == null) return null;
  try {
    const res = await fetch(
      `https://api.balldontlie.io/mlb/v1/stats?game_ids[]=${gameId}&per_page=100`,
      { headers: { 'Authorization': BDL_API_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.length ? data.data : null;
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 RATIONALE FACT CHECKS — date=${targetDate}` +
    (leagueArg ? ` league=${leagueArg}` : '') + (dryRun ? ' (DRY RUN)' : '') + (force ? ' (FORCE)' : ''));

  // The picks (rationales)
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
  // Key by pick_text AND matchup: pick texts repeat across games/days inside the
  // 2-day window ("Over 2.5 -150" twice in one WC slate, same ML price two nights
  // running), and a pick_text-only key wired the WRONG game's result + final score
  // into the fact-check evidence (source of the Jul 5 "Giants defeated 6-4" row).
  const resultByPickText = new Map((results || []).map((r) => [`${r.pick_text}|${r.matchup}`, r]));

  let done = 0, skipped = 0, failed = 0;

  for (const pick of picks) {
    const league = pick.league?.toUpperCase();
    if (leagueArg && league !== leagueArg) continue;
    if (!pick.rationale || !String(pick.rationale).trim()) { skipped++; continue; }

    const matchup = `${pick.awayTeam} @ ${pick.homeTeam}`;
    const graded = resultByPickText.get(`${pick.pick}|${matchup}`);
    if (!graded) {
      console.log(`  ⏭️  ${league} ${matchup}: no graded result row — skipping`);
      skipped++;
      continue;
    }
    const gameDate = graded.game_date;

    // Idempotency (mirrors the nightly path). Also re-sync: game_results re-grades
    // every run, so a fact-check written before a grade flip goes stale — when the
    // stored result no longer matches the graded result, regenerate the row.
    // pick_text is part of the identity: WC ships TWO picks per match (side +
    // total) — without it the two picks overwrite each other's fact-check row
    // and ping-pong "result drift" forever.
    const { data: exist, error: dedupErr } = await supabase
      .from('pick_fact_checks').select('id, result')
      .eq('game_date', gameDate).eq('league', graded.league).eq('matchup', matchup).eq('pick_text', pick.pick)
      .maybeSingle();
    if (dedupErr) {
      console.error(`  ❌ ${league} ${matchup}: dedup check failed: ${dedupErr.message}`);
      failed++;
      continue;
    }
    if (exist) {
      const resultDrift = exist.result !== graded.result;
      if (!force && !resultDrift) {
        console.log(`  ⏩ ${league} ${matchup}: fact-check exists — skipping (use --force to redo)`);
        skipped++;
        continue;
      }
      if (resultDrift) {
        console.log(`  🔁 ${league} ${matchup}: result drift (fact-check "${exist.result}" vs graded "${graded.result}") — regenerating`);
      }
      if (!dryRun) {
        await supabase.from('pick_fact_checks').delete().eq('id', exist.id);
      }
    }

    // final_score is stored "away-home" (`${vs}-${hs}` in run-all-results.js)
    const [awayScore, homeScore] = String(graded.final_score || '').split('-').map(Number);

    const mlbStats = league === 'MLB' ? await fetchMlbStatsForGame(pick.game_id) : null;
    const evidence = buildGameEvidence({
      league,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      homeScore,
      awayScore,
      mlbStats,
    });

    try {
      const fc = await factCheckPick({ pick, result: graded.result, evidence });
      if (!fc) {
        console.warn(`  ⚠️ ${league} ${matchup}: no claims produced`);
        failed++;
        continue;
      }

      const row = {
        game_date: gameDate,
        league: graded.league,
        matchup,
        pick_text: pick.pick,
        result: graded.result,
        claims: fc.claims,
        right_count: fc.right_count,
        wrong_count: fc.wrong_count,
      };

      if (dryRun) {
        console.log(`  🧪 ${league} ${matchup} (${graded.result}):`);
        console.log(JSON.stringify(row, null, 2));
        done++;
        continue;
      }

      const { error: insertErr } = await supabase.from('pick_fact_checks').insert(row);
      if (insertErr) {
        console.error(`  ❌ ${league} ${matchup}: insert failed: ${insertErr.message}`);
        failed++;
        continue;
      }
      const unclear = fc.claims.length - fc.right_count - fc.wrong_count;
      console.log(`  🔍 ${league} ${matchup} [${graded.result.toUpperCase()} ${graded.final_score}]: ` +
        `${fc.right_count} right / ${fc.wrong_count} wrong / ${unclear} unclear`);
      for (const c of fc.claims) {
        console.log(`      [${c.verdict.toUpperCase()}] ${c.claim}${c.note ? ` — ${c.note}` : ''}`);
      }
      done++;
    } catch (e) {
      console.error(`  ❌ ${league} ${matchup}: fact-check failed: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`FACT CHECKS FOR ${targetDate}: ${done} written, ${skipped} skipped, ${failed} failed`);
  console.log(`════════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error('\n❌ FATAL ERROR:', err);
  process.exit(1);
});
