#!/usr/bin/env node
// Load environment variables FIRST: the BDL transport reads its key at module load (Sep 21 2026).
import '../src/loadEnv.js';
import { sportsbookRowsFromGame } from '../src/services/backupGameOdds.js';
/**
 * Agentic Pick Generation Script
 * 
 * This script runs Gary's agentic system to generate picks.
 * Usage:
 *   node scripts/run-agentic-picks.js --nba
 *   node scripts/run-agentic-picks.js --nfl
 *   node scripts/run-agentic-picks.js --ncaaf
 *   node scripts/run-agentic-picks.js --mlb
 *   node scripts/run-agentic-picks.js --all
 */

// MUST load env vars FIRST before any other imports
import { createPickOdds, formatOddsForStorage } from './lib/picks/odds.js';
import { createSlateRecovery } from './lib/picks/slate.js';
import { createPickGameDiscovery } from './lib/picks/discovery.js';
import { pickGameDate } from './lib/picks/calendar.js';
import { buildToolStats, tokenToIosKey } from './lib/picks/stats.js';
import { createPickStorage } from './lib/picks/storage.js';
import { createMlbJuneLane } from './lib/picks/mlbJuneLane.js';
import { createNcaafPropRecovery } from './lib/picks/ncaafProps.js';
import { createGamePublication } from './lib/picks/publication.js';
import { ncaafSlateDateForInstant } from '../src/services/ncaafGamePolicy.js';
import {
  assertPicksStillPregame,
  formatPickRunOutcome,
} from './lib/pickRunReliability.js';
import { exitAfterFlushing } from './lib/processLifecycle.js';
import { easternDateOffset } from '../src/utils/dateUtils.js';
import { countRealStats } from '../src/services/agentic/statsSubstance.js';
import { classifyPickMarketSide } from './lib/pickSideClassification.js';
import { footballCaseSnapshot } from './lib/footballCaseSnapshot.js';
import { exactFootballMarketBook } from './lib/footballMarketReceipt.js';
import { SPORT_CONFIG, selectPickSports } from './lib/pickRunSports.js';
import { recordMlbDataFailure, resolveMlbDataFailure } from './lib/mlbDataFailure.js';

// Reject retired lanes before provider initialization or the era-run ledger.
const args = process.argv.slice(2);
let sportsToRun;
try {
  sportsToRun = selectPickSports(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Now import modules that depend on env vars
const { analyzeGame } = await import('../src/services/agentic/orchestrator/index.js');
// THE JUNE ENGINE (founder, Sep 11 2026): MLB games enter the June 15 tree,
// verbatim, models adapted — never the September orchestrator above.
const { analyzeGame: analyzeGameJune } = await import('../src/services/agentic/mlbJuneEra/index.js');
const { oddsService } = await import('../src/services/oddsService.js');
const { picksService } = await import('../src/services/picksService.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
const { findStaleInjuryMentions } = await import('../src/services/agentic/orchestrator/statAudit.js');
const { writeGaryBrief } = await import('../src/services/pickdesk/garyBrief.js');
const { writeGaryBets, betRecord } = await import('../src/services/pickdesk/garyBet.js');
const { GAME_PICK_MODEL, MLB_JUNE_BRAIN_MODEL, GAME_FALLBACK_MODELS } = await import('../src/services/agentic/orchestrator/orchestratorConfig.js');
const { runGameBrainCascade, gameBrainRoutes } = await import('../src/services/agentic/orchestrator/gameBrainRouting.js');
// EVERY COLLEGE PICK RUNS OPUS (founder, Sep 22 2026: "all ncaaf picks should
// be on Opus not Fable or Astra"). Opus on the Claude subscription at xhigh is
// the college brain; its recovery rungs are the GPT Sol logins, never Fable or
// Astra. The other game lanes retain their policy.
const brainFor = league => league === 'americanfootball_ncaaf'
  ? { model: 'claude-opus-5-5', thinkingLevel: 'xhigh' }
  : { model: GAME_PICK_MODEL, thinkingLevel: 'xhigh' };
// BRAIN PREFLIGHT (founder, Sep 9 2026: "why did it go through the whole
// process just to hit the cap when we could check that up front"): one
// one-word turn per bridge brain before any desk is built or research bought.
// Every brain capped → the game waits for its next tier, and the child says so.
const { preflightBrains, describePreflight } = await import('../src/services/agentic/orchestrator/providerAdapters/brainPreflight.js');
const _brainPreflights = new Map();
let cappedGames = 0;
async function brainPreflightOnce(models) {
  const key = JSON.stringify(models);
  if (!_brainPreflights.has(key)) _brainPreflights.set(key, await preflightBrains(models));
  return _brainPreflights.get(key);
}
// ERA LIVE — this is a fresh process, so its module cache IS disk truth. One
// line + a ledger append make every pick run auditable by folder/commit/era,
// and the grading-side drift check (checkEraDrift) verifies that every era
// stamped in the database came from a run recorded here. Fail-open.
// (The pickdesk game era is gone with the pickdesk game lane — founder,
// Aug 27: one pick system. The June era is THE game era.)
try {
  const { recordEraRun, gitStamp, PROJECT_DIR } = await import('./lib/eraTruth.js');
  const { junePromptSha: juneEra } = await import('../src/services/agentic/orchestrator/junePromptSha.js');
  const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  console.log(`🧬 ERA LIVE: game ${juneEra()} · commit ${gitStamp()} @ ${PROJECT_DIR}`);
  recordEraRun('game', etToday, juneEra());
} catch (e) { console.log(`🧬 ERA LIVE: (unavailable — ${e.message})`); }

// ═══════════════════════════════════════════════════════════════════════════
// JUNE ENGINE (MLB) — Aug 18 2026 restoration (founder GO after the ledger
// post-mortem: June +26u/58% on the agentic engine, negative every week since
// the Jul 22-26 pickdesk cutover). MLB game picks return to the orchestrator:
// scout report → subscription research briefing (checklist, hard-fail) → Sol brain
// WITH tools → bilateral cases → Pass 2 decision (ML or RL, Gary's choice)
// → Pass 3 + statAudit. THE lane, unconditionally (founder, Aug 27) —
// Research uses Sonnet → Luna subscriptions, then paid Haiku research only
// when both included routes are unavailable (founder authorization Sep 12).
// ═══════════════════════════════════════════════════════════════════════════
// ONE LANE (founder, Aug 27): MLB runs the June engine unconditionally —
// no pickdesk fallback. June's original research briefing runs before Pass 1,
// through Sonnet then Luna subscriptions before metered Haiku research.
const { GAME_RESEARCH_MODEL } = await import('../src/services/agentic/orchestrator/orchestratorConfig.js');
const { juneResearchModels } = await import('../src/services/agentic/orchestrator/juneResearchSession.js');
const researcherOff = String(process.env.GARY_RESEARCHER || 'on').toLowerCase() === 'off';
console.log(`[JuneEngine] ⚾ MLB games run the June engine (brain: ${MLB_JUNE_BRAIN_MODEL}, researcher: ${juneResearchModels().join(' → ')} (shared subscription account order), brain cascade: ${GAME_FALLBACK_MODELS.join(' → ')}).`);
console.log(`[Researcher] 🏈 NFL uses a factual research briefing before the decision; college game decisions run Opus.`);
console.log(`[NbaWinningEra] 🏀 NBA games run the Apr 8 2026 winning-era prompts (brain: ${GAME_PICK_MODEL}, researcher: ${researcherOff ? 'OFF (GARY_RESEARCHER=off)' : GAME_RESEARCH_MODEL})`);

const { supabase, supabaseAdmin: winnersAdmin } = await import('../src/supabaseClient.js');
const { classOf, classWinRates, winnersScore } = await import('../src/services/pickdesk/winnersScore.js');
const { enqueueWinnersCandidate, isProductionWinnersRun, confirmedPublishedGame } = await import('../src/services/pickdesk/winnersAdmissions.js');

// WINNERS SCORE v1 (founder GO, Aug 10): trailing-30d class rates from the
// graded MLB ledger, fetched once per run. The classes are MLB shapes (run
// line, favorite/dog moneyline), so only MLB picks carry the score. A failed
// fetch scores every pick from the neutral base — never blocks storage.
let _winnersClassRates = null;
async function getWinnersClassRates() {
  if (_winnersClassRates) return _winnersClassRates;
  try {
    const since = easternDateOffset(-30);
    const { data } = await supabase.from('game_results')
      .select('pick_text, result')
      .eq('league', 'MLB')
      .gte('game_date', since)
      .limit(1000);
    _winnersClassRates = classWinRates(data || []);
  } catch { _winnersClassRates = {}; }
  return _winnersClassRates;
}
// Shutdown handler. Picks stored before the signal are already safe in
// Supabase (incremental storage); the run itself was stopped, so it exits
// with the conventional signal code rather than reporting success.
process.on('SIGTERM', () => {
  console.log('\n⚠️ Received SIGTERM — shutting down...');
  process.exit(143);
});
process.on('SIGINT', () => {
  console.log('\n⚠️ Received SIGINT — shutting down...');
  process.exit(130);
});

// Simple system: Gary picks SPREAD or ML.
// ═══════════════════════════════════════════════════════════════════════════
// GARY PICK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PICK LOGGING & TRANSPARENCY
// ═══════════════════════════════════════════════════════════════════════════
// 
// Gary evaluates the full slate and makes a pick.
// We do not filter by confidence or apply hard rules here.
// This section only provides transparency tags (e.g., rest, injuries, traps).
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════

// In-memory tracking to prevent duplicate processing in same run session
// This prevents race conditions where DB check passes but pick is already being generated
const processedGamesThisSession = new Set();
const existingPickGameIds = new Set();

function getGameKey(homeTeam, awayTeam) {
  return `${homeTeam}|${awayTeam}`.toLowerCase().trim();
}

// Parse arguments
function getArgValue(flag) {
  // Supports: --flag value  |  --flag=value
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

function parseBoolish(val, defaultValue = true) {
  if (val === undefined || val === null) return defaultValue;
  const v = String(val).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
}

const shouldStore = parseBoolish(getArgValue('--store'), true);

// --matchup flag to run a single specific game (e.g., "Bengals @ Dolphins" or "Cincinnati")
const matchupFilter = getArgValue('--matchup');
// --game-id flag to run exactly one game by BDL game id (used by the scheduler).
// This is unambiguous — no substring collisions, no doubleheader issues.
const gameIdFilter = getArgValue('--game-id');
// --force flag to skip deduplication check (for re-running specific games)
const forceRerun = args.includes('--force');
// --date flag to filter games to specific date(s) (e.g., "2025-12-25" or "2025-12-25,2025-12-26")
// Scheduler exact-game runs are always for the current ET slate. Supplying an
// exact game id without a date used to reopen NFL's entire rolling week, spend
// eight BDL requests, and then lose the requested game to 429s. Derive today's
// ET date for that exact-id path; manual weekly runs without --game-id retain
// the existing weekly behavior.
const requestedDateFilter = getArgValue('--date');
const dateFilter = requestedDateFilter || (gameIdFilter
  ? (args.includes('--ncaaf')
      ? ncaafSlateDateForInstant(new Date())
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()))
  : undefined);
// --test flag to store picks in test_daily_picks table instead of production (for testing)
const useTestTable = args.includes('--test');
// --test-name flag to label the test run (e.g., "Sharp Betting Reference Test")
const testName = getArgValue('--test-name');
// --limit flag to limit number of games to analyze (useful for testing)
const gameLimit = parseInt(getArgValue('--limit'), 10) || null;
// --offset flag to skip N games before applying limit (for parallel terminals)
const gameOffset = parseInt(getArgValue('--offset'), 10) || 0;
// --time flag to filter games by start time in EST (e.g., "12" for 12pm, "12,1" for 12pm and 1pm)
const timeFilter = getArgValue('--time');

if (sportsToRun.length === 0) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                 🐻 GARY AGENTIC PICKS GENERATOR                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Usage:                                                          ║
║    node scripts/run-agentic-picks.js --nba                       ║
║    node scripts/run-agentic-picks.js --nfl                       ║
║    node scripts/run-agentic-picks.js --ncaaf                     ║
║    node scripts/run-agentic-picks.js --mlb                       ║
║    node scripts/run-agentic-picks.js --all                       ║
║                                                                  ║
║  Or combine sports:                                              ║
║    node scripts/run-agentic-picks.js --nba --nfl                 ║
║                                                                  ║
║  Advanced options:                                               ║
║    --date 2025-12-25           (filter to specific date)         ║
║    --date 2025-12-25,2025-12-26 (multiple dates)                 ║
║    --time 12                   (filter to 12pm EST games)        ║
║    --time 12,13                (filter to 12pm and 1pm EST)      ║
║    --limit 5                   (limit to N games)                ║
║    --force                     (skip deduplication)              ║
║    --store false               (analyze only, don't save)        ║
║    --test                      (store to test_daily_picks table) ║
║    --test-name "My Test"       (label the test run)              ║
║    --matchup "Chicago"         (run single game only)            ║
║    --fresh                     (clear cache for fresh data)      ║
║                                                                  ║
║  Gary's Pick System:                                             ║
║    - Gary always picks a side (SPREAD or MONEYLINE)              ║
║    - No PASS, no totals — spread/ML only                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
  console.error('[Runner] no sport flag given (--mlb, --nfl, --ncaaf, --nba) — nothing ran'); process.exit(2);
}

// Check environment variables
function checkEnv() {
  const checks = [
    // Model credentials come from the configured subscription sessions.
    { name: 'SUPABASE_URL', alts: ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', alts: ['SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'] }
  ];
  const missing = [];

  for (const check of checks) {
    let value = process.env[check.name];
    if (!value) {
      for (const alt of check.alts) {
        if (process.env[alt]) {
          value = process.env[alt];
          break;
        }
      }
    }
    if (!value) {
      missing.push(check.name);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(k => console.error(`   - ${k}`));
    console.error('\nMake sure you have a .env file with these variables.');
    process.exit(1);
  }
}

const { fetchSportsbookOdds } = createPickOdds({ ballDontLieService });
const { fetchDailySlateGame } = createSlateRecovery({ supabase });
const { discoverPickGames } = createPickGameDiscovery({ oddsService, picksService, ballDontLieService, fetchDailySlateGame });

const { checkExistingPick, storePicks } = createPickStorage({ picksService, useTestTable, testName, dateFilter });

const runMlbJuneEngine = createMlbJuneLane({ analyzeGameJune, runGameBrainCascade,
  MLB_JUNE_BRAIN_MODEL, GAME_FALLBACK_MODELS });
const { completeNcaafProp } = createNcaafPropRecovery({ supabase, winnersAdmin, fetchDailySlateGame });

const { publishGame } = createGamePublication({ picksService, winnersAdmin, storePicks,
  enqueueWinnersCandidate, confirmedPublishedGame });

// Main execution
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              🐻 GARY AGENTIC PICKS GENERATOR 🐻                  ║
║                                                                  ║
║        Stats-First Analysis | Tool-Calling Research              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  checkEnv();

  // OUTBOX FLUSH (Aug 24 2026, Aug 23 outage post-mortem): a pick generated
  // during a storage outage is spooled to disk instead of discarded (see
  // picks/storage.js). Flushing here — before any research — means a retry
  // tier after an outage lands the rescued pick in seconds instead of
  // re-running the whole pipeline, and the exact-game preflight then sees it
  // stored. No-ops in dry-run/test modes and when the outbox is empty.
  if (shouldStore && !useTestTable && !process.argv.includes('--dry-run')) {
    try {
      const { flushOutbox } = await import('./lib/pickOutbox.js');
      const etToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const flushed = await flushOutbox({
        dateStr: etToday,
        assertStillPregame: assertPicksStillPregame,
        storeDaily: (spooledPicks, spoolDate) => picksService.storeDailyPicksInDatabase(
          spooledPicks,
          spoolDate || null,
          { beforeRetry: () => assertPicksStillPregame(spooledPicks) },
        ),
        storeNflWeekly: (spooledPicks) => picksService.storeWeeklyNFLPicks(spooledPicks, {
          beforeRetry: () => assertPicksStillPregame(spooledPicks),
        }),
      });
      for (const flushedId of flushed.flushed) existingPickGameIds.add(String(flushedId));
    } catch (e) {
      console.warn(`⚠️ [Outbox] flush pass failed (non-fatal): ${e.message}`);
    }
  }

  // Clear cache if --nocache or --fresh flag is passed (ensures fresh injury/lineup data)
  if (process.argv.includes('--nocache') || process.argv.includes('--fresh')) {
    console.log('🔄 Bypassing shared provider and scout caches for fresh injury/lineup data...');
    process.env.GARY_BDL_SHARED_CACHE_DISABLED = '1';
    ballDontLieService.clearCache();
    console.log('✅ Cache cleared - fetching fresh data from APIs\n');
  }

  const startTime = Date.now();
  const allPicks = [];
  const summary = {};

  for (const sportShort of sportsToRun) {
    const config = SPORT_CONFIG[sportShort];
    const sportStartTime = Date.now();

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`${config.emoji} STARTING ${config.name} ANALYSIS`);
    console.log(`${'═'.repeat(70)}\n`);

    try {
      // Scheduler retries are exact-game runs. If that provider game id is
      // already durably stored, stop before touching BDL or the model. The old
      // path fetched the full slate first, so a harmless retry could spend
      // minutes in the shared rate-limit queue and delay the next live game.
      // `--force`, dry runs and test-table runs intentionally bypass this.
      if (gameIdFilter && !forceRerun && shouldStore && !useTestTable) {
        const preflightDate = dateFilter?.split(',')[0]?.trim();
        const stored = await picksService.pickAlreadyStoredByGameId(
          config.name,
          preflightDate,
          gameIdFilter,
        );
        if (stored?.exists) {
          console.log(`[${config.name}] ⏭️ Exact game ${gameIdFilter} is already stored (${stored.source}); skipping upstream fetch and analysis`);
          existingPickGameIds.add(String(gameIdFilter));
          if (config.name === 'NCAAF') {
            await completeNcaafProp(stored.storedPick, { date: preflightDate });
          }
          summary[config.name] = {
            games: 1,
            picks: 0,
            existing: 1,
            time: (Date.now() - sportStartTime) / 1000,
          };
          continue;
        }
      }

      const finalGames = await discoverPickGames(config, {
        dateFilter, gameIdFilter, matchupFilter, timeFilter, gameLimit, gameOffset,
      });

      if (!finalGames || finalGames.length === 0) {
        console.log(`[${config.name}] No games found for today.`);
        summary[config.name] = { games: 0, picks: 0, time: 0 };
        continue;
      }

      console.log(`[${config.name}] Found ${finalGames.length} games\n`);

      // ═══════════════════════════════════════════════════════════════
      // TRUE MEMORY SESSION: Gary maintains memory across all games
      // ═══════════════════════════════════════════════════════════════
      // Create a session that persists Gary's analysis memory across games.
      // This enables organic ranking based on true conviction rather than
      // re-reading summaries of his own picks.
      // ═══════════════════════════════════════════════════════════════
      
      // Build system prompt for this sport
      console.log(`[${config.name}] 🎯 Processing ${finalGames.length} games`);

      // Process each game
      const sportPicks = [];
      // Picks already written by the per-game store; the end-of-sport pass
      // only retries the ones whose immediate store failed.
      const storedImmediately = new Set();
      for (let i = 0; i < finalGames.length; i++) {
        const game = finalGames[i];

        console.log(`\n[${i + 1}/${finalGames.length}] ${game.away_team} @ ${game.home_team}`);

        // Create game key for deduplication. Include BDL game id when present
        // so MLB doubleheaders (same teams + date, different game ids) don't collide.
        const bdlGameId = game.bdl_game_id ?? game.id ?? null;
        const gameKey = bdlGameId != null
          ? `${getGameKey(game.home_team, game.away_team)}|${bdlGameId}`
          : getGameKey(game.home_team, game.away_team);

        // Skip deduplication checks if --force flag is set (for re-running specific games)
        if (!forceRerun) {
        // FIRST: Check in-memory set (prevents race conditions within same run)
        if (processedGamesThisSession.has(gameKey)) {
          console.log(`⏭️  Already processed in this session: "${gameKey}"`);
          continue;
        }

        // SECOND: Check database for existing pick (use game's EST date, not today)
        const gameESTDate = game.commence_time
          ? pickGameDate(config.key, game.commence_time)
          : null;
        // A public pick cannot satisfy a test run: Gary must generate and
        // persist a fresh result in the test table even if production exists.
        const existingPick = useTestTable ? null
          : await checkExistingPick(config.name, game.home_team, game.away_team, gameESTDate, bdlGameId);
        if (existingPick) {
          console.log(`⏭️  Already have pick for this game: "${existingPick}"`);
          if (bdlGameId != null) existingPickGameIds.add(String(bdlGameId));
          processedGamesThisSession.add(gameKey); // Mark as processed
          if (config.name === 'NCAAF' && shouldStore) {
            const stored = await picksService.pickAlreadyStoredByGameId('NCAAF', gameESTDate, bdlGameId);
            await completeNcaafProp(stored.storedPick, { game, date: gameESTDate });
          }
          continue;
          }
        } else {
          console.log(`🔄 Force re-run enabled - skipping deduplication for "${gameKey}"`);
        }

        // Mark as being processed BEFORE we start (prevents race condition)
        processedGamesThisSession.add(gameKey);

        // Fetch sportsbook odds BEFORE analysis so Gary sees available lines
        let preSportsbookOdds = null;
        try {
          const preGameId = game.bdl_game_id || game.id;
          if (preGameId) {
            console.log(`   Fetching sportsbook odds comparison (pre-analysis)...`);
            preSportsbookOdds = game.market_source === 'the_odds_api'
              ? sportsbookRowsFromGame(game)
              : await fetchSportsbookOdds(config.key, preGameId, game.home_team, game.away_team);
            if (preSportsbookOdds?.length > 0) {
              console.log(`   Found odds from ${preSportsbookOdds.length} sportsbooks`);
            }
          }
        } catch (oddsPreErr) {
          console.log(`   Could not fetch pre-analysis sportsbook odds: ${oddsPreErr.message}`);
        }

        // Run agentic analysis (each game is independent)
        const runnerOptions = {
          nocache: process.argv.includes('--nocache') || process.argv.includes('--fresh'),
          sportsbookOdds: preSportsbookOdds, // Pass multi-book odds for scout report
        };
        let result;
        try {
          // MLB game picks: THE June engine, unconditionally (founder,
          // Aug 27 — the separate pickdesk system is retired; model
          // failures cascade inside runMlbJuneEngine). Other sports route
          // through analyzeGame as before.
          const brainPlan = config.key === 'baseball_mlb' ? MLB_JUNE_BRAIN_MODEL : brainFor(config.key).model;
          const routes = gameBrainRoutes([brainPlan, ...GAME_FALLBACK_MODELS], { league: config.key });
          const preflight = await brainPreflightOnce(routes);
          if (!preflight.ok) {
            const label = `${game.away_team?.name || game.away_team?.full_name || game.away_team} @ ${game.home_team?.name || game.home_team?.full_name || game.home_team}`;
            console.warn(`⏸️  Every brain is capped right now (${describePreflight(preflight)}) — leaving ${label} to the next tier; no desk built, no research bought`);
            cappedGames += 1;
            continue;
          }
          if (config.key === 'baseball_mlb') {
            result = await runMlbJuneEngine(game, runnerOptions, preflight);
          } else {
            // ONE BRAIN PER PICK, every sport (founder, Aug 27): a failed or
            // quota-dead brain never hands THIS game's context to another
            // model mid-stream — the next brain re-runs the whole game.
            const brain = brainFor(config.key);
            const brainOptions = brain.thinkingLevel ? { thinkingLevel: brain.thinkingLevel } : {};
            result = await runGameBrainCascade([brain.model, ...GAME_FALLBACK_MODELS],
              (model, accountOptions) => analyzeGame(game, config.key, { ...runnerOptions, ...brainOptions, ...accountOptions, modelOverride: model }),
              { signal: runnerOptions.signal, preflight, routes });
            if (['required_data_unavailable', 'market_unavailable'].includes(result?.code)) {
              recordMlbDataFailure(game, result, { league: config.name });
            }
          }
        } catch (err) {
          if (err.message?.includes('USER_ABORTED') || err.message?.includes('aborted')) {
            console.log(`\n⚠️  Request aborted for ${game.away_team} @ ${game.home_team}. Skipping...`);
            continue;
          }
          throw err; // Re-throw other errors
        }

        if (result && !result.error && result.pick) {
          if(['americanfootball_nfl','americanfootball_ncaaf'].includes(config.key)) {
            Object.assign(result,footballCaseSnapshot(result,game.home_team,game.away_team));
          }
          // Unique investigated tokens — excludes rejected ones (quality: 'unavailable').
          const allTokens = (result.toolCallHistory || [])
            .filter(t => t.token && t.quality !== 'unavailable')
            .map(t => t.token);
          const uniqueTokens = [...new Set(allTokens)];
          const statsCount = uniqueTokens.length;

          console.log(`\n✅ PICK: ${result.pick}`);
          console.log(`   Type: ${result.type}`);
          // Stale-injury telemetry (Jul 22 2026, founder: monitor that old
          // injuries never carry a pick's case). Log-only, never blocks.
          try {
            const staleInj = findStaleInjuryMentions(result.rationale, typeof result.injuries === 'string' ? result.injuries : '');
            if (staleInj.length) console.warn(`   [InjuryWatch] card cites ESTABLISHED absences: ${staleInj.join(', ')} — review whether they carry the case.`);
          } catch { /* telemetry must never break the run */ }
          if (result.toolCallHistory) {
            // Show UNIQUE stats only (not duplicates)
            console.log(`   Stats Requested (${statsCount} unique): ${uniqueTokens.join(', ')}`);
            
            // 📊 INVESTIGATION AUDIT - Show what Gary actually investigated
            const tokens = allTokens;
            // Count player stats: tokens containing PLAYER_, _PLAYER, GAME_LOGS, or specific player stat patterns
            const playerStatsCount = tokens.filter(t => 
              t && (t.includes('PLAYER_') || 
              t.includes('_PLAYER') || 
              t.includes('GAME_LOGS') ||
              t.match(/^(NBA|NFL|NCAAF)_PLAYER_STATS/))
            ).length;
            const teamStatsCount = tokens.filter(t => 
              t && !t.includes('PLAYER_') && 
              !t.includes('_PLAYER') && 
              !t.includes('GAME_LOGS') &&
              !t.match(/^(NBA|NFL|NCAAF)_PLAYER_STATS/)
            ).length;
            
            // Key investigation areas for the lanes that define them. Football
            // logs its team/player counts only (the generic list was basketball's).
            const investigatedAreas = config.key === 'baseball_mlb' ? {
              startingPitchers: tokens.some(t => t && (t.includes('STARTING_PITCHER') || t.includes('PITCHER_SEASON') || t.includes('PITCHER_SCOUTING'))),
              bullpen: tokens.some(t => t && (t.includes('BULLPEN') || t.includes('CLOSER'))),
              lineup: tokens.some(t => t && (t.includes('LINEUP') || t.includes('KEY_HITTERS'))),
              platoonSplits: tokens.some(t => t && (t.includes('SPLITS') || t.includes('BATTER_VS'))),
              standings: tokens.some(t => t && (t.includes('STANDINGS') || t.includes('TEAM_RECORD'))),
              parkWeather: tokens.some(t => t && (t.includes('PARK') || t.includes('WEATHER'))),
              injuries: tokens.some(t => t && t.includes('INJUR')),
              odds: tokens.some(t => t && t.includes('ODDS'))
            } : config.key === 'basketball_nba' ? {
              homeAwaySplits: tokens.some(t => t && (t.includes('HOME_AWAY') || t.includes('SPLITS'))),
              recentForm: tokens.some(t => t && (t.includes('RECENT_FORM') || t.includes('LAST_'))),
              h2hHistory: true, // H2H is preloaded in the scout report
              pace: tokens.some(t => t && t.includes('PACE')),
              efficiency: tokens.some(t => t && (t.includes('RATING') || t.includes('EFG'))),
              clutchStats: tokens.some(t => t && t.includes('CLUTCH')),
              benchDepth: tokens.some(t => t && t.includes('BENCH')),
              playerLogs: playerStatsCount > 0
            } : null;

            console.log(`\n📊 INVESTIGATION AUDIT:`);
            console.log(`   Team Stats: ${teamStatsCount} | Player Stats: ${playerStatsCount}`);
            if (investigatedAreas) {
              const coveredCount = Object.values(investigatedAreas).filter(v => v).length;
              const totalAreas = Object.keys(investigatedAreas).length;
              console.log(`   Coverage: ${coveredCount}/${totalAreas} key areas`);
              console.log(`   Areas: ${Object.entries(investigatedAreas).map(([k, v]) => `${v ? '✓' : '✗'}${k.replace(/([A-Z])/g, ' $1').trim()}`).join(' | ')}`);
            }
          }
          // Log the full rationale (no truncation)
          const rationale = result.rationale || result.analysis || '';
          if (rationale) {
            console.log(`\n📝 RATIONALE:\n${rationale}\n`);
          } else if (result.rawAnalysis) {
            // Extract rationale from raw response if not parsed
            const raw = result.rawAnalysis;
            const rationaleMatch = raw.match(/"rationale"\s*:\s*"([^"]+)"/s);
            if (rationaleMatch) {
              console.log(`\n📝 RATIONALE:\n${rationaleMatch[1]}\n`);
            }
          }

          const statsData = buildToolStats(result, config);

          // ALWAYS use verifiedTaleOfTape when available — toolCallHistory is inconsistent
          if (result.verifiedTaleOfTape?.rows) {
            const sportLabel = config.name;
            console.log(`   📊 ${sportLabel}: Using verified Tale of Tape (${result.verifiedTaleOfTape.rows.length} rows) for pick card`);

            // The shared token map also serves the downstream substantive-stat check.

            // Clear any toolCallHistory stats and use the verified rows instead
            statsData.length = 0;
            for (const row of result.verifiedTaleOfTape.rows) {
              // Skip injuries row (shown separately)
              if (row.name === 'Key Injuries') continue;
              // Extract value from nested structure: { team: "Name", value: "3.45" }
              // CRITICAL: iOS StatValues.from(dict:) casts with `as? String` — numbers silently fail
              // Always convert to String so iOS can parse them
              const rawHome = typeof row.home === 'object' ? row.home.value : row.home;
              const rawAway = typeof row.away === 'object' ? row.away.value : row.away;
              const homeValue = rawHome != null ? String(rawHome) : 'N/A';
              const awayValue = rawAway != null ? String(rawAway) : 'N/A';
              const homeTeam = typeof row.home === 'object' ? row.home.team : result.homeTeam;
              const awayTeam = typeof row.away === 'object' ? row.away.team : result.awayTeam;
              // Map token to iOS-compatible property name
              const iosKey = tokenToIosKey[row.token] || row.token.toLowerCase();
              statsData.push({
                name: row.name,
                token: row.token,
                home: { team: homeTeam, [iosKey]: homeValue },
                away: { team: awayTeam, [iosKey]: awayValue },
                // NFL prior-season baselines must remain visibly attributable
                // after the verified tape is reshaped for storage/iOS.
                ...(row.statProvenance ? { statProvenance: row.statProvenance } : {})
              });
            }
            console.log(`   ✓ ${sportLabel}: Added ${statsData.length} stats from verified Tale of Tape`);

            // Per-sport expected row counts — drift is a silent iOS rendering bug
            // MLB = 16 since Jul 22 2026 (team-stats block restored after the
            // gp<100 date-bomb fix; 15 when BDL lacks batting_r for Runs/Game).
            const expectedRowCount = { 'NBA': 15, 'MLB': 16, 'NFL': 6, 'NCAAF': 7 }[sportLabel];
            if (expectedRowCount && statsData.length !== expectedRowCount) {
              console.warn(`   ⚠️ ${sportLabel}: Expected ${expectedRowCount} Tale of Tape rows, got ${statsData.length} — check scout report builder`);
            }
          }

          // The token names Gary requested, each once.
          const statsUsed = result.toolCallHistory
            ? [...new Set(result.toolCallHistory.map(t => t.token).filter(Boolean))]
            : [];

          // Use pre-fetched sportsbook odds (already fetched before analysis)
          let sportsbookOdds = null;
          let bestLine = null;
          try {
            const rawOdds = preSportsbookOdds; // Reuse pre-analysis odds — no duplicate API call
            if (rawOdds && rawOdds.length > 0) {
              // Format odds for the picked team
              sportsbookOdds = formatOddsForStorage(rawOdds, result.pick, result.homeTeam, result.awayTeam);
              console.log(`   Found odds from ${sportsbookOdds?.length || 0} sportsbooks`);

              // BEST LINE SELECTION: Find the best spread for Gary's pick.
              // MLB is exempt (Jul 26 2026, founder: one standard book —
              // Gary quotes the chosen book's line; electing a different
              // book's price here would contradict the card).
              // FOOTBALL is exempt too (founder, Aug 24: "so NFL is as good
              // as MLB" — one-book quoting brought to MLB's shape). The
              // preseason audit showed election-after-compose made 11/16
              // cards argue a different number than their ticket; the desk's
              // posted line is the ticket. Gary’s wording is published as written.
              const electionExempt = config.key === 'baseball_mlb'
                || config.key === 'americanfootball_nfl'
                || config.key === 'americanfootball_ncaaf';
              if (!electionExempt && sportsbookOdds && sportsbookOdds.length > 0 && result.type === 'spread') {
                const validOdds = sportsbookOdds.filter(o => typeof o.spread === 'number' && !isNaN(o.spread));
                if (validOdds.length > 0) {
                  const firstSpread = validOdds[0].spread;
                  const isUnderdog = firstSpread > 0;

                  // Compute median spread to filter outliers (e.g., Kalshi +32.5 vs consensus +17.5)
                  const sortedSpreads = validOdds.map(o => o.spread).sort((a, b) => a - b);
                  const medianSpread = sortedSpreads[Math.floor(sortedSpreads.length / 2)];
                  const MAX_DEVIATION = 4; // Max points away from median to be considered valid
                  const inRangeOdds = validOdds.filter(o => Math.abs(o.spread - medianSpread) <= MAX_DEVIATION);
                  const searchOdds = inRangeOdds.length > 0 ? inRangeOdds : validOdds;

                  let best = searchOdds[0];
                  for (const odds of searchOdds) {
                    // Better number first (+18.5 > +17.5 = more cushion; -16.5 > -17.5 =
                    // fewer to cover); on the SAME number, better price wins — MLB run
                    // lines are -1.5 at every book, so without the price tie-break the
                    // stored odds came from whichever book listed first and could
                    // contradict the pick text (caught on Sol launch review, Jul 22).
                    if (odds.spread > best.spread) best = odds;
                    else if (odds.spread === best.spread &&
                             (odds.spread_odds ?? -Infinity) > (best.spread_odds ?? -Infinity)) best = odds;
                  }

                  bestLine = {
                    book: best.book,
                    spread: best.spread,
                    spreadOdds: best.spread_odds
                  };

                  const defaultSpread = result.spread;
                  if (defaultSpread !== null && best.spread !== defaultSpread) {
                    console.log(`   Best line: ${best.spread > 0 ? '+' : ''}${best.spread} @ ${best.book} (default was ${defaultSpread > 0 ? '+' : ''}${defaultSpread})`);
                  }
                }
              }
            }
          } catch (oddsErr) {
            console.log(`   Could not process sportsbook odds: ${oddsErr.message}`);
          }

          // Create clean pick object without large/unnecessary fields
          // Use best available line if found, otherwise fall back to default.
          // iOS GaryPick types spread/spreadOdds as Double? — a string here
          // (result.spread parsed from pick text) poisons the WHOLE picks-array
          // decode on the phone (Aug 18 "BOARD DATA UNAVAILABLE" incident).
          const asStoredNumber = (v) => {
            const n = typeof v === 'string' ? parseFloat(v) : v;
            return Number.isFinite(n) ? n : null;
          };
          const finalSpread = asStoredNumber(bestLine?.spread ?? result.spread);
          const finalSpreadOdds = asStoredNumber(bestLine?.spreadOdds ?? result.spreadOdds);
          const isFootballPick = config.key === 'americanfootball_nfl' || config.key === 'americanfootball_ncaaf';
          const exactFootballBook = isFootballPick
            ? exactFootballMarketBook(sportsbookOdds,
              { ...result, spread: finalSpread, spreadOdds: finalSpreadOdds }, game.line_vendor)
            : null;
          const bestLineBook = isFootballPick ? exactFootballBook : (bestLine?.book ?? result.book ?? null);
          // AFTER GARY receipt: seal the exact elected football market beside
          // the pick. First-writer-wins storage makes this immutable; later
          // proof refreshes compare only this vendor to that same vendor.
          const footballPublishedAt = isFootballPick ? new Date().toISOString() : null;
          const quotedMarketSource = sportsbookOdds?.find(row => row.book === bestLineBook);
          const footballPublishedMarket = isFootballPick ? {
            market_type: result.type,
            vendor: bestLineBook,
            line: result.type === 'spread'
              ? finalSpread
              : (result.type === 'total' ? result.total : null),
            odds: result.type === 'spread'
              ? (finalSpreadOdds ?? result.odds)
              : result.odds,
            ...(quotedMarketSource?.source ? {
              source: quotedMarketSource.source,
              source_event_id: quotedMarketSource.source_event_id,
              source_updated_at: quotedMarketSource.source_updated_at,
            } : {}),
          } : null;

          // Update pick text to reflect best available line (not just Gary's raw output).
          // F-5: the stored odds are the ELECTED board line, so the pick text must say
          // the same thing — rewrite on a price-only election too, not just a number
          // change (Jul 23 Tigers: every book sat at -1.5, the price tie-break stored
          // -108 while the text kept the prose "-110").
          let finalPickText = result.pick;
          if (bestLine && result.type === 'spread' && finalPickText) {
            // Replace the spread number + price in the pick text
            // e.g., "Washington Wizards +6.0 -114" → "Washington Wizards +6.5 -110"
            const spreadStr = finalSpread > 0 ? `+${finalSpread}` : `${finalSpread}`;
            const oddsStr = typeof finalSpreadOdds === 'number' ? ` ${finalSpreadOdds > 0 ? '+' + finalSpreadOdds : finalSpreadOdds}` : '';
            // Match pattern: team name followed by spread number and optional odds
            const pickMatch = finalPickText.match(/^(.+?)\s*[+-]\d+\.?\d*\s*[+-]?\d*$/);
            if (pickMatch) {
              const rewritten = `${pickMatch[1].trim()} ${spreadStr}${oddsStr}`;
              if (rewritten !== finalPickText) {
                finalPickText = rewritten;
                console.log(`   📝 Pick text updated: "${result.pick}" → "${finalPickText}"`);
              }
            }
          }

          // Format game time for UI display
          const gameTimeEST = game.commence_time
            ? new Date(game.commence_time).toLocaleString('en-US', {
                timeZone: 'America/New_York',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })
            : 'TBD';

          // Winners reviews the exact stored ticket in its independent worker.

          const cleanPick = {
            ...(config.name === 'MLB' ? { input_readiness: result._inputReadiness } : {}),
            pick: finalPickText,
            type: result.type,
            odds: result.type === 'spread' ? (finalSpreadOdds || result.odds) : result.odds,
            // Gary's conviction in the bet (0.50-1.00). NEVER defaulted: a
            // missing score stores as null (Jul 30 — `|| 0.65` FABRICATED a
            // conviction Gary never stated, and the ledger read it as real).
            // The loud warn below is the founder-ordered alert for that case.
            confidence: result.confidence ?? null,
            // Historical class diagnostics (MLB shapes); these do not select Winners.
            ...(config.key === 'baseball_mlb' ? {
              winners_class: classOf(finalPickText),
              winners_score: winnersScore(finalPickText, result.confidence ?? null, await getWinnersClassRates()),
            } : {}),
            // THE BLIND SPLIT (Aug 5): the sealed pre-lines read — the winner
            // Gary named before any price reached the session, and his why.
            // Null on non-desk lanes; the ledger reads ticket-vs-read crossings.
            read_winner: result.read_winner ?? null,
            game_read: result.game_read ?? null,
            // THE BLIND REPORT (Aug 12): both win paths ride every pick.
            path_away: result.path_away ?? null,
            path_home: result.path_home ?? null,
            case_last: result.case_last ?? null,
            homeTeam: result.homeTeam,
            awayTeam: result.awayTeam,
            // UI display fields
            game: `${result.awayTeam} @ ${result.homeTeam}`,
            time: gameTimeEST,
            spread: finalSpread, // Best available line (not just the first sportsbook)
            spreadOdds: finalSpreadOdds,
            bestLineBook: bestLineBook, // Which sportsbook has the best line
            ...(isFootballPick ? {
              published_at: footballPublishedAt,
              published_market: footballPublishedMarket,
              season_type: game?.season_type ?? null,
              // The odds-feed game carries its teams as STRINGS, so the
              // object read below is only ever true on a provider game; the
              // stamped fields (attachNcaafGameMetadata) are what actually
              // fill college cards. Without one the card prints the whole
              // school name and the meta row truncates.
              homeTeamAbbreviation: game?.home_team?.abbreviation ?? game?.homeAbbreviation ?? null,
              awayTeamAbbreviation: (game?.away_team ?? game?.visitor_team)?.abbreviation ?? game?.awayAbbreviation ?? null,
            } : {}),
            moneylineHome: result.moneylineHome,
            moneylineAway: result.moneylineAway,
            total: result.total,
            rationale: result.rationale,
            // Audit trail: rationale numbers that didn't trace to provided data
            // (null when all traced). Visibility/filtering hook — was being dropped.
            statAuditWarnings: result._statAuditWarnings ?? null,
            // Which brain produced this pick — without it the DB can't distinguish
            // model eras (the Sol cutover review had to infer brains from timestamps).
            // _modelUsed = the RESPONDER after any cascade; the configured
            // primary is only the fallback for lanes that don't report one.
            model: result._modelUsed ?? GAME_PICK_MODEL,
            // Which CONTRACT wording produced it — prompt-era hash (Jul 29);
            // joins against prompt_eras for pre-registered before/after reads.
            prompt_sha: result._promptSha ?? null,
            // The NFL market-awareness receipt rides the stored pick the way
            // props carry jev.run_id (Sep 21 2026): version, status, receipt id,
            // model. Later analysis joins on it; nothing else reads it.
            // (Sep 25 2026: the receipt lives on the analysis result's
            // _context; the old top-level read never found it.)
            ...((result._context?.nflMarketAssessment ?? result._context?.ncaafMarketAssessment)?.metadata
              ? { jev: (result._context.nflMarketAssessment ?? result._context.ncaafMarketAssessment).metadata } : {}),
            ...(config.key === 'baseball_mlb' ? { decision_policy: result.decision_policy } : {}),
            league: config.name,
            sport: config.key,
            pick_id: `agentic-${config.key}-${game.id || Date.now()}`,
            // BDL game id — disambiguates doubleheaders for dedupe
            bdl_game_id: game.bdl_game_id ?? game.id ?? null,
            // Football's weekly storage must follow the scheduled game, not
            // the wall clock of whichever machine ran the process.
            season: game.season ?? null,
            week: game.week ?? null,
            commence_time: game.commence_time,
            // Venue/tournament context (for NBA Cup, playoffs, NFL primetime, etc.)
            venue: result.venue || null,
            isNeutralSite: result.isNeutralSite || false,
            tournamentContext: result.tournamentContext || null,
            gameSignificance: result.gameSignificance || null,
            // College-only fields: playoff round and seeds, AP rankings (stamped
            // on the game object by attachNcaafGameMetadata — Aug 25 2026) and
            // conferences for the app's college filters. Other sports carry none.
            ...(config.key === 'americanfootball_ncaaf' ? {
              cfpRound: result.cfpRound || null,
              homeSeed: result.homeSeed || null,
              awaySeed: result.awaySeed || null,
              homeRanking: result.homeRanking ?? game.homeRanking ?? null,
              awayRanking: result.awayRanking ?? game.awayRanking ?? null,
              homeConference: result.homeConference ?? game.homeConference ?? null,
              awayConference: result.awayConference ?? game.awayConference ?? null,
              // Single conference field for app filtering (based on which team is in the pick).
              // Longest whole-word match wins (shared-mascot class, Aug 19 sweep): a bare
              // last-word join reads "Michigan State" and "Ohio State" as the same school.
              conference: (() => {
                const pickText = (result.pick || '').toLowerCase();
                const matchLen = (teamName) => {
                  const name = String(teamName || '').toLowerCase().trim();
                  if (!name) return 0;
                  const words = name.split(' ');
                  // Full name, name-minus-last-word, last word — most specific first.
                  const forms = [name, words.slice(0, -1).join(' '), words.slice(-1)[0]].filter(Boolean);
                  for (const f of forms) {
                    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    if (new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`).test(pickText)) return f.length;
                  }
                  return 0;
                };
                const h = matchLen(result.homeTeam);
                const a = matchLen(result.awayTeam);
                const homeConf = result.homeConference ?? game.homeConference ?? null;
                const awayConf = result.awayConference ?? game.awayConference ?? null;
                if (h > a) return homeConf;
                if (a > h) return awayConf;
                // Tie or no match: use home conference if available
                return homeConf || awayConf;
              })(),
            } : {}),
            statsUsed: statsUsed, // Token names Gary requested
            statsData: statsData, // Full stat data with values for Tale of the Tape
            // Pre-computed Tale of the Tape from the scout report (BDL verified stats)
            verifiedTaleOfTape: result.verifiedTaleOfTape || null,
            // Structured injury data from BDL. iOS types this TeamInjuries? —
            // the June engine's dossier carries injuries as a TEXT block, and a
            // string in this field breaks the phone's whole-array decode
            // (Aug 18 incident). Objects only; anything else stores null.
            injuries: (result.injuries && typeof result.injuries === 'object') ? result.injuries : null,
            sportsbook_odds: sportsbookOdds, // Multi-book odds comparison (ML + Spread)
          };

          // HARD FAIL: a pick whose Tale of the Tape carries no real values means the
          // stats pipeline returned nothing for this game (every row "N/A") — Gary
          // cannot have analyzed it, so the rationale is ungrounded. Never store a
          // no-stats pick.
          const realStatCount = countRealStats(statsData, tokenToIosKey);
          const minRealStats = 1;
          if (realStatCount < minRealStats) {
            console.error(`\n🛑 [${config.name}] HARD FAIL: "${result.pick}" — only ${realStatCount} real performance stat(s) (need ${minRealStats}). Tale of the Tape is metadata-only; the pick is ungrounded. REJECTING — no pick stored.`);
            if (i < finalGames.length - 1) { await sleep(2000); }
            continue;
          }

          // (Plain-language re-register REMOVED — founder ruling, Aug 12:
          // "Gary makes the pick. He writes the rationale... I never
          // authorized a middleman." One organic rationale, nothing else.)

          // Founder-ordered alert (Jul 30): a missing confidence must be LOUD,
          // never silently papered over — ⚠️ lines surface in scheduler logs.
          if (cleanPick.confidence == null) {
            console.warn(`⚠️ [Pick] ${cleanPick.pick} stored with NO confidence_score — the brain omitted it; check the contract/parse`);
          }

          // Gary's brief (founder, Sep 23 2026): after the full case, he breaks it
          // down himself into three short reasons and a summary for the Winners
          // unveil. Same brain, from the case alone; the case is never touched.
          if (cleanPick.type !== 'pass' && cleanPick.pick !== 'PASS' && cleanPick.rationale) {
            const brief = await writeGaryBrief({
              pick: cleanPick.pick,
              matchup: cleanPick.awayTeam && cleanPick.homeTeam ? `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}` : null,
              rationale: cleanPick.rationale,
              model: cleanPick.model,
            });
            if (brief) {
              cleanPick.brief = { reasons: brief.reasons, summary: brief.summary };
              console.log(`\n🗒️  BRIEF (${brief.model}):\n  - ${brief.reasons.join('\n  - ')}\n  ${brief.summary}\n`);
            } else {
              console.warn(`⚠️ [Brief] ${cleanPick.pick}: no brief; the unveil falls back to the stored reasons`);
            }

            // GARY'S BET (founder GO, Sep 24 2026): the same brain decides if it
            // is betting this ticket with real money, and how much, seeing cash
            // on hand and today's plays already made. Stored on the pick before
            // it publishes so the Winners gate reads it. A failure is a pass.
            if (isProductionWinnersRun({shouldStore,useTestTable,dryRun:args.includes('--dry-run')})) {
              const { bets, model: betModel } = await writeGaryBets({ league: config.name, model: cleanPick.model, tickets: [{
                id: 'ticket', pick: cleanPick.pick, price: Number(cleanPick.odds), rationale: cleanPick.rationale,
                matchup: cleanPick.awayTeam && cleanPick.homeTeam ? `${cleanPick.awayTeam} @ ${cleanPick.homeTeam}` : null,
                starts: cleanPick.commence_time || null,
                case_home: cleanPick.path_home || null, case_away: cleanPick.path_away || null,
              }], date: cleanPick.commence_time ? new Date(cleanPick.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null });
              cleanPick.gary_bet = betRecord(bets.get('ticket'), betModel);
              console.log(`\n💵 GARY'S BET (${betModel}): ${cleanPick.gary_bet.play ? `$${cleanPick.gary_bet.stake_dollars} on ${cleanPick.pick}` : `pass on ${cleanPick.pick}`}${cleanPick.gary_bet.why ? ` — ${cleanPick.gary_bet.why}` : ''}${cleanPick.gary_bet.parlay ? `\n🎟️  PARLAY: yes — ${cleanPick.gary_bet.parlay_line}` : ''}\n`);
            }
          }

          const picksForGame = [cleanPick];

          // Add to picks
          sportPicks.push(...picksForGame);

          // Store each pick immediately so it appears in the app as soon as it's ready
          // Skip immediate store in test mode — test picks are stored in batch at the end
          if (isProductionWinnersRun({shouldStore,useTestTable,dryRun:args.includes('--dry-run')}) && cleanPick.type !== 'pass' && cleanPick.pick !== 'PASS') {
            try {
              await publishGame({ config, picksForGame, cleanPick, result, game });
              storedImmediately.add(cleanPick);
            } catch (storeErr) {
              console.log(`⚠️  [${config.name}] Immediate store failed (will retry at end): ${storeErr.message}`);
            }
          }

          // One college prop follows the game decision. A retry fills a missing
          // prop without asking Gary to make the game pick again.
          if (config.name === 'NCAAF' && shouldStore && !args.includes('--dry-run')
              && cleanPick.type !== 'pass' && cleanPick.pick !== 'PASS') {
            await completeNcaafProp(cleanPick, { game, date: dateFilter, toTestTable: useTestTable });
          }
        } else if (result.error) {
          console.log(`\n⚠️  Error: ${result.error}`);
        } else {
          console.log(`\n⚠️  No pick generated for this game`);
        }

        // Small delay between games
        if (i < finalGames.length - 1) {
          await sleep(2000);
        }
      }

      // Store picks for this sport
      let storedPicksCount = 0;

      if (sportPicks.length > 0) {
        if (!shouldStore) {
          console.log(`\n[${config.name}] Storage disabled (--store false). Generated ${sportPicks.length} pick(s) but will NOT write to Supabase.`);
        } else {
          console.log(`\n[${config.name}] Processing ${sportPicks.length} picks...`);

          // ═══════════════════════════════════════════════════════════════
          // GARY'S PICKS SUMMARY
          // ═══════════════════════════════════════════════════════════════
          console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
          console.log(`║  🏈 GARY'S ${config.name} PICKS (${sportPicks.length} picks)                   `);
          console.log(`╠══════════════════════════════════════════════════════════════════╣`);
          for (let i = 0; i < sportPicks.length; i++) {
            const p = sportPicks[i];
            const typeTag = p.type === 'moneyline' ? 'ML' : 'SPREAD';
            const pickStr = (p.pick || '').slice(0, 30).padEnd(30);
            console.log(`║  ${pickStr} | ${typeTag.padEnd(6)}`);
          }
          console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);

          const qualifiedPicks = sportPicks.filter(p => {
            // Filter out totals (over/under) - game picks are spread/ML only.
            if (p.type === 'total') {
              console.log(`  ❌ Filtered: ${p.pick} (totals not included for game picks)`);
              return false;
            }
            // Defense-in-depth: catch PASS if orchestrator didn't
            if (p.type === 'pass' || (p.pick && p.pick.toUpperCase() === 'PASS')) {
              console.log(`  ❌ Filtered: PASS pick (Gary must always pick a side)`);
              return false;
            }

            // Classify the actual market side. Searching the rendered pick for
            // "+" also sees plus-money juice (for example -0.5 +100) and used
            // to mislabel favorites as dogs in the production audit log.
            const marketSide = classifyPickMarketSide(p);
            const pickType = p.type === 'moneyline' ? '💰ML' : '📊SPREAD';
            const sideTag = marketSide === 'underdog'
              ? '🐕DOG'
              : marketSide === 'favorite'
                ? '🏆FAV'
                : marketSide === 'pickem'
                  ? 'PK'
                  : 'UNKNOWN';
            console.log(`  ✅ PICK: ${p.pick} [${pickType}] [${sideTag}]`);

            return true;
          });

          // ═══════════════════════════════════════════════════════════════
          // STORE PICKS — Gary's output is final (no sport post-filters).
          // A pick the per-game store already wrote is not written again.
          // ═══════════════════════════════════════════════════════════════
          const finalPicks = qualifiedPicks;

          if (finalPicks.length > 0) {
            const picksToStore = finalPicks.filter(p => !storedImmediately.has(p));
            if (picksToStore.length > 0) {
              console.log(`\n[${config.name}] Storing ${picksToStore.length} pick(s)`);
              await storePicks(picksToStore);
            }
            allPicks.push(...finalPicks);
            storedPicksCount = finalPicks.length;
          } else {
            console.log(`\n[${config.name}] No picks to store`);
          }
        }
      }

      const sportTime = ((Date.now() - sportStartTime) / 1000).toFixed(1);

      const pickCount = sportPicks.length;

      summary[config.name] = {
        games: finalGames.length,
        picks: pickCount,
        stored: storedPicksCount,
        time: sportTime
      };

      console.log(`\n${config.emoji} ${config.name} COMPLETE: ${storedPicksCount} stored (${pickCount} picks) in ${sportTime}s`);

    } catch (error) {
      console.error(`\n❌ Error processing ${config.name}:`, error.message);
      summary[config.name] = { error: error.message };
    }
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                       📊 FINAL SUMMARY                           ║
╠══════════════════════════════════════════════════════════════════╣`);

  for (const [sport, data] of Object.entries(summary)) {
    if (data.error) {
      console.log(`║  ${sport.padEnd(8)} Error: ${data.error.slice(0, 40)}`);
    } else {
      console.log(`║  ${sport.padEnd(8)} ${String(data.games).padStart(3)} games -> ${String(data.stored || 0).padStart(2)} stored (${data.picks} picks) (${data.time}s)`);
    }
  }

  console.log(`╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Total Picks: ${String(allPicks.length).padStart(3)}                                               ║
║  Total Time: ${totalTime.padStart(6)}s                                            ║
║                                                                  ║
║  ${allPicks.length > 0 ? (useTestTable ? '✅ Test picks saved in test_daily_picks.' : '✅ Picks are now live in Supabase!') : 'ℹ️  No picks stored this run — see per-game detail in the log above.'}
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  // ═══════════════════════════════════════════════════════════════════════════
  // GRACEFUL EXIT
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n🐻 Gary is signing off. Session complete!');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  // Give time for any pending async operations (Supabase connections, etc.) to complete
  await sleep(2000);

  const failedSports = Object.entries(summary).filter(([, data]) => data?.error);
  if (failedSports.length > 0) {
    throw new Error(`Pick run failed: ${failedSports.map(([sport, data]) => `${sport}: ${data.error}`).join(' | ')}`);
  }

  const storedGameIds = allPicks
    .map((pick) => pick?.bdl_game_id ?? pick?.game_id)
    .filter((id) => id != null)
    .map(String);
  const coveredGameIds = [...new Set([...existingPickGameIds, ...storedGameIds])];
  // A no-store run (--store=false) that produced a pick is a successful dry run,
  // not a missing pick (Sep 9 2026: the NFL rehearsals exited 1 on success).
  if (gameIdFilter && shouldStore && cappedGames === 0 && !coveredGameIds.includes(String(gameIdFilter))) {
    throw new Error(`Exact game ${gameIdFilter} completed without a verified stored pick`);
  }

  const outcome = {
    status: (allPicks.length === 0 && cappedGames > 0) ? 'capped' : (shouldStore ? 'stored' : 'dry_run'),
    ...(cappedGames > 0 ? { capped_games: cappedGames } : {}),
    game_ids: coveredGameIds,
    pick_count: allPicks.length,
    ...(useTestTable ? { storage_target: 'test_daily_picks' } : {}),
  };
  console.log(formatPickRunOutcome(outcome));
  console.log('✅ Process complete. Exiting cleanly...');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Football exact-game children must exit explicitly after a successful
// decision so open provider sockets or SDK timers cannot delay that game's
// props. Preserve the existing termination behavior for every other sport.
const exitRunner = (code) => (
  args.includes('--nfl') || args.includes('--ncaaf')
    ? exitAfterFlushing(code)
    : process.exit(code)
);

main()
  .then(() => exitRunner(0))
  .catch(error => {
    console.error('Fatal error:', error);
    return exitRunner(1);
  });
