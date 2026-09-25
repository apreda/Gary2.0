/** Date/mode coordinator for settlement and the existing nightly follow-up jobs. */
import { FOOTBALL_SETTLEMENT_SPORTS, nflWeekStartForDate, runFootballSettlementDates } from '../resultsRunMode.js';
import { buildFootballSettlementOutcome, assertFootballSettlementCoverage } from '../resultsGradingReliability.js';
import { easternDateOffset as estDate } from '../../../supabase/functions/_shared/dateKeys.js';
import { writeStreaks as defaultWriteStreaks } from '../../../src/services/streaksService.js';
import { writeNflStreaks as defaultWriteNflStreaks } from '../../../src/services/nflStreaksService.js';
import { gradeDarts as defaultGradeDarts } from '../../../src/services/darts/dartsGrade.js';

const defaultLoaders = {
  era: () => import('../eraTruth.js'),
  lanes: () => import('../../run-rationale-lanes.js'),
  closing: () => import('../../run-closing-line.js'),
  autopsy: () => import('../../run-autopsies.js'),
};

export function createResultsRunner({ supabase, apiKey: BDL_API_KEY, runOptions: RUN_OPTIONS = {},
  processPropBets, processGenericGames, dateAtOffset = estDate,
  writeStreaks = defaultWriteStreaks, writeNflStreaks = defaultWriteNflStreaks,
  gradeDarts = defaultGradeDarts,
  loaders = defaultLoaders, console = globalThis.console }) {
  // Explicit CLI date wins; otherwise use the shared cloud grader's ET-yesterday.
  const getTargetDate = () => {
    if (RUN_OPTIONS.explicitDate) return RUN_OPTIONS.explicitDate;
    return dateAtOffset(-1);
  };

  // When no CLI date is passed, cover TODAY + YESTERDAY (ET) just like the cloud
  // grade-results function (dateAtOffset(0)/dateAtOffset(-1)). The cloud grader settles
  // today's games as they finish, but game_recaps (the Home marquee headline
  // TEXT) is written only by this local path — so grading+recapping today AS
  // games settle rolls the headline same-day instead of waiting for the 2am
  // yesterday-only pass. Every step here is idempotent per date.
  const getTargetDates = () => {
    if (RUN_OPTIONS.explicitDate) return [RUN_OPTIONS.explicitDate];
    return [dateAtOffset(0), dateAtOffset(-1)];
  };

  /**
   * Narrow cloud-safe settlement pass used only by the manual GitHub backstop.
   *
   * It deliberately reuses the exact same provider identity, finality, grading,
   * dedup, and write paths as the full nightly job, but only opens the two
   * football lanes. Editorial work (recaps/fact checks), MLB/NBA/NHL fetches,
   * night highlights, streaks, and era auditing remain on the existing full
   * cadence. The normal owner remains the established local results lifecycle;
   * this mode exists for an explicitly requested emergency/backfill run.
   */
  async function mainFootballSettlements(targetDate) {
    console.log(`\n🏈 FOOTBALL SETTLEMENT DATE: ${targetDate}`);
    const footballSports = new Set(FOOTBALL_SETTLEMENT_SPORTS);

    const props = await processPropBets(targetDate, footballSports, { settlementOnly: true });
    const ncaaf = await processGenericGames('daily_picks', targetDate, 'NCAAF', { settlementOnly: true });
    const weekStart = nflWeekStartForDate(targetDate);
    const nfl = await processGenericGames('weekly_nfl_picks', weekStart, 'NFL', { settlementOnly: true });

    const outcome = buildFootballSettlementOutcome(targetDate, { ncaaf, nfl, props });

    console.log(`\n────────────────────────────────────────`);
    console.log(`FOOTBALL SETTLEMENT SUMMARY FOR ${targetDate}`);
    console.log(`NCAAF: ${ncaaf.w}W - ${ncaaf.l}L - ${ncaaf.p}P`);
    console.log(`NFL:   ${nfl.w}W - ${nfl.l}L - ${nfl.p}P`);
    console.log(`Props: ${props.w}W - ${props.l}L - ${props.p}P`);
    console.log(`────────────────────────────────────────\n`);

    try {
      assertFootballSettlementCoverage(outcome);
    } catch (error) {
      console.log(`FOOTBALL_SETTLEMENT_OUTCOME=${JSON.stringify(outcome)}`);
      throw error;
    }
    console.log(`FOOTBALL_SETTLEMENT_OUTCOME=${JSON.stringify(outcome)}`);
    return outcome;
  }

  async function main(targetDate = getTargetDate()) {
    console.log(`\n📅 TARGET DATE: ${targetDate}`);

    // Props grade FIRST: the betting recaps written during game grading enrich
    // their evidence pack with the night's graded props (real prices for the
    // slide bullets), so prop_results rows must exist before recaps run.
    const props = await processPropBets(targetDate);

    const daily = await processGenericGames('daily_picks', targetDate);

    // Weekly NFL - use the same Tue–Mon ET publication key as storage.
    const weekStart = nflWeekStartForDate(targetDate);

    const weeklyNFL = await processGenericGames('weekly_nfl_picks', weekStart, 'NFL');

    // Streaks: active team W/L + O/U runs and player hit/hitless/HR-game runs
    // as of the night just graded ($0 — BDL + statsapi data fetches only).
    // Idempotent (delete-then-insert per date) and never fatal to grading.
    try {
      await writeStreaks({ supabase, bdlApiKey: BDL_API_KEY, date: targetDate });
    } catch (e) {
      console.warn(`  ⚠️ Streaks failed (non-fatal): ${e.message}`);
    }
    // NFL streaks for the Darts page (Sep 22 2026): team W/L and ATS runs,
    // player TD and 100-yard runs, carried across from last regular season.
    // Two nflverse CSVs, no BDL; never fatal to grading.
    try {
      await writeNflStreaks({ supabase, date: targetDate });
    } catch (e) {
      console.warn(`  ⚠️ NFL streaks failed (non-fatal): ${e.message}`);
    }
    // Darts results (Sep 23 2026): each lean marked hit, miss or void from the
    // box score for the Darts page's "yesterday" hits. Never the Billfold,
    // never a model, never fatal to grading.
    try {
      await gradeDarts({ supabase, bdlApiKey: BDL_API_KEY, date: targetDate, console });
    } catch (e) {
      console.warn(`  ⚠️ Darts grading failed (non-fatal): ${e.message}`);
    }

    // ERA-DRIFT GUARD (Aug 12 2026): read back the eras stamped on today's
    // stored picks and verify every one came from a pick run recorded in THIS
    // folder's ledger (logs/era-runs.log). A stamp no local run produced means
    // another writer — another clone, Railway, a stale process — is making
    // production picks; that exact failure ran unnoticed Jul 29 – Aug 12. Loud
    // WARN lines in the scheduler-log style, never fatal to grading.
    try {
      const { checkEraDrift, PROJECT_DIR } = await loaders.era();
      const problems = [];
      const { data: dpRow } = await supabase.from('daily_picks').select('picks').eq('date', targetDate).maybeSingle();
      problems.push(...checkEraDrift('game', targetDate, (dpRow?.picks || []).map(p => p?.prompt_sha)));
      const { data: ppRow } = await supabase.from('prop_picks').select('picks').eq('date', targetDate).maybeSingle();
      problems.push(...checkEraDrift('props', targetDate, (ppRow?.picks || []).map(p => p?.prompt_sha)));
      if (problems.length) {
        for (const p of problems) console.warn(`🚨 ERA DRIFT: ${p}`);
      } else {
        console.log(`🧬 Era check ${targetDate}: all stored pick eras trace to runs from ${PROJECT_DIR}`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Era-drift check failed (non-fatal): ${e.message}`);
    }

    // RATIONALE LANES (Sep 1 2026): read each graded rationale for the desk
    // lanes it leaned on and ledger it — the measurement behind every desk
    // decision. Never reaches Gary. Non-fatal.
    try {
      const { tagRationaleLanes, printLaneTable } = await loaders.lanes();
      // The target date AND the day before: an afternoon pass runs before the
      // night's picks exist, and the overnight passes may target today — either
      // way last night's board gets tagged (upserts, so re-tagging is free).
      const dayBefore = new Date(new Date(`${targetDate}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      const laneRows = await tagRationaleLanes([dayBefore, targetDate]);
      printLaneTable(laneRows, `${dayBefore} → ${targetDate}`);
    } catch (e) {
      console.warn(`  ⚠️ Rationale lanes failed (non-fatal): ${e.message}`);
    }

    // THE CLOSING-LINE READ (Sep 3 2026): each pick's price against its own
    // ticket's price at first pitch and against the day's open — the ruler
    // every desk test is read on. Never reaches Gary. Non-fatal.
    try {
      const { readClosingLines, printClosingLine } = await loaders.closing();
      const dayBefore = new Date(new Date(`${targetDate}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      const lineRows = await readClosingLines([dayBefore, targetDate]);
      printClosingLine(lineRows, `${dayBefore} → ${targetDate}`);
    } catch (e) {
      console.warn(`  ⚠️ Closing-line read failed (non-fatal): ${e.message}`);
    }

    // THE AUTOPSIES (Sep 3 2026, back on their own Sep 24): Gary's graded MLB
    // game picks read back against the game, for the nightly ledger only.
    // Never reaches Gary. Non-fatal.
    try {
      const { runAutopsies } = await loaders.autopsy();
      const dayBefore = new Date(new Date(`${targetDate}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
      for (const d of [dayBefore, targetDate]) {
        const r = await runAutopsies(d);
        if (r.jobs) console.log(`  🩺 ${d}: ${r.done}/${r.jobs} autopsies written`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Autopsies failed (non-fatal): ${e.message}`);
    }

    console.log(`\n════════════════════════════════════════`);
    console.log(`SUMMARY FOR ${targetDate}`);
    console.log(`Daily:  ${daily.w}W - ${daily.l}L`);
    console.log(`Weekly: ${weeklyNFL.w}W - ${weeklyNFL.l}L`);
    console.log(`Props:  ${props.w}W - ${props.l}L`);
    if ((props.hrW || 0) + (props.hrL || 0) > 0) console.log(`HR Bets (fun lane, not official): ${props.hrW}W - ${props.hrL}L`);
    console.log(`TOTAL:  ${daily.w + weeklyNFL.w + props.w}W - ${daily.l + weeklyNFL.l + props.l}L`);
    console.log(`════════════════════════════════════════\n`);
  }

  // The full grade+recap run remains TODAY then YESTERDAY (ET), so the Home
  // marquee rolls to today's finished games same-day. The manual football-only
  // backstop deliberately reverses that default: yesterday's late finals
  // are attempted first, and a failure on either date cannot skip the other.
  // Every path is idempotent per date.
  async function run() {
    const dates = getTargetDates();
    if (RUN_OPTIONS.footballSettlements) {
      await runFootballSettlementDates(dates, mainFootballSettlements);
      return;
    }
    for (const date of dates) {
      await main(date);
    }
  }

  return { run, main, mainFootballSettlements, getTargetDates };
}
