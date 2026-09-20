/** Pick write boundaries: test isolation, pregame checks and durable production spools. */
import { assertMlbPublicationReadiness } from '../../../src/services/mlbDataReadiness.js';
import { assertPicksStillPregame as defaultAssertPregame } from '../pickRunReliability.js';

export function createPickStorage({ picksService, useTestTable = false, testName, dateFilter,
  loadOutbox = () => import('../pickOutbox.js'),
  loadPickService = () => import('../../../src/services/picksService.js'),
  assertPicksStillPregame = defaultAssertPregame,
  process = globalThis.process, console = globalThis.console }) {
  async function checkExistingPick(league, homeTeam, awayTeam, gameDate = null, gameId = null) {
    try {
      // NFL uses weekly table, other sports use daily table
      if (league === 'NFL') {
        const { nflGameAlreadyHasPick } = await loadPickService();
        if (typeof nflGameAlreadyHasPick === 'function') {
          const result = await nflGameAlreadyHasPick(homeTeam, awayTeam, gameDate, gameId);
          if (result.exists) {
            return result.existingPick;
          }
        }
      } else {
        const { gameAlreadyHasPick } = await loadPickService();
        if (typeof gameAlreadyHasPick === 'function') {
          const result = await gameAlreadyHasPick(league, homeTeam, awayTeam, gameDate, gameId);
          if (result.exists) {
            return result.existingPick;
          }
        }
      }
    } catch (e) {
      // Function may not exist, continue
    }
    return null;
  }

  async function storePicks(picks) {
    picks.forEach(assertMlbPublicationReadiness);
    // DRY RUN MODE - skip storage if --dry-run flag is passed
    if (process.argv.includes('--dry-run')) {
      console.log(`🧪 DRY RUN MODE - Skipping storage of ${picks.length} picks`);
      return;
    }

    // TEST MODE - store to test_daily_picks instead of production tables
    if (useTestTable) {
      console.log(`🧪 TEST MODE - Storing ${picks.length} picks to test_daily_picks table`);
      // The row is keyed by date and shared across same-day runs, so stamp each
      // pick with its arm — test queries separate arms by test_arm, not by the
      // row's (last-writer-wins) test_name.
      const armLabel = testName || process.env.GARY_MODEL_OVERRIDE || 'default';
      for (const p of picks) p.test_arm = armLabel;
      const testDate = dateFilter && !dateFilter.includes(',') ? dateFilter.trim() : undefined;
      const result = await picksService.storeTestPicks(picks, testName, `Test run at ${new Date().toISOString()}`, { date: testDate });
      if (!result.success) {
        throw new Error(`TEST storage failed: ${result.error || result.message || 'unknown error'}`);
      }
      console.log(`✅ TEST: Stored ${result.count} picks in test_daily_picks (mode: ${result.mode})`);
      return result;
    }

    // Re-check at the actual write boundary. Research can be long-running and
    // a game that was upcoming when this process started may now be live.
    assertPicksStillPregame(picks);

    // Separate NFL picks (go to weekly table) from other picks (go to daily table)
    const nflPicks = picks.filter(p => p.league === 'NFL');
    const otherPicks = picks.filter(p => p.league !== 'NFL');

    // WRITE-AHEAD SPOOL (Aug 24 2026, Aug 23 outage post-mortem): the generated
    // pick becomes durable ON DISK before the network write, and the spool is
    // deleted only after the atomic RPC confirms it. If storage stays down
    // through every retry — or the scheduler SIGKILLs this child mid-retry —
    // the pick survives in logs/pick-outbox/ and the next run's flush stores it
    // in seconds instead of re-running research. Spooling failure never blocks
    // the live write.
    const { writeSpool, removeSpool } = await loadOutbox();
    const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    // Store NFL picks in weekly table
    if (nflPicks.length > 0) {
      const nflSpool = writeSpool('nfl_weekly', etToday, nflPicks);
      console.log(`🏈 Storing ${nflPicks.length} NFL picks in weekly table...`);
      const nflResult = await picksService.storeWeeklyNFLPicks(nflPicks, {
        beforeRetry: () => assertPicksStillPregame(nflPicks),
      });
      if (!nflResult.success) {
        throw new Error(`NFL storage failed: ${nflResult.error || nflResult.message || 'unknown error'}`);
      }
      removeSpool(nflSpool);
      console.log(`✅ NFL: Stored ${nflResult.count} new picks (${nflResult.total || nflResult.count} total for week)`);
    }

    // Store other sports in daily table
    if (otherPicks.length > 0) {
      const dailySpool = writeSpool('daily', dateFilter || etToday, otherPicks);
      const result = await picksService.storeDailyPicksInDatabase(otherPicks, dateFilter || null, {
        beforeRetry: () => assertPicksStillPregame(otherPicks),
      });
      if (!result.success) {
        throw new Error(`Daily-picks storage failed: ${result.error || result.message || 'unknown error'}`);
      }
      removeSpool(dailySpool);
      console.log(`✅ Successfully stored ${otherPicks.length} picks in daily table`);
    }
    return { success: true, count: picks.length };
  }
  return { checkExistingPick, storePicks };
}
