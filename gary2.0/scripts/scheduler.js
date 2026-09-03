#!/usr/bin/env node
/**
 * Gary Auto-Scheduler — Per-Game Scheduling
 *
 * Runs 24/7 on the local Mac. Every night at midnight ET, checks BDL for
 * tomorrow's games, and schedules EACH GAME individually 90 minutes before
 * its start time. Game picks run first, then props for the same game.
 *
 * This ensures lineups/injuries are as fresh as possible for each game.
 *
 * Usage:
 *   node scripts/scheduler.js          # Run the 24/7 scheduler
 *   node scripts/scheduler.js --now    # Run all today's sports immediately
 *   node scripts/scheduler.js --plan   # Show tomorrow's schedule without running
 *   node scripts/scheduler.js --plan --today  # Show today's schedule
 */

import '../src/loadEnv.js';
import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  activeNcaafRecoverySlateDate,
  childExecutionBudget,
  coalesceOverdueTiers,
  decisionLaneKey,
  gameHasStarted,
  hasUrgentUpcomingTrigger,
  isFinalPendingTier,
  isScheduleEntryHeld,
  isScheduleEntryRetired,
  isSportFetchRetryEntry,
  makeSportFetchRetryEntry,
  clusterConcurrency,
  nextTriggerBatch,
  laneOwnsMlbDriftGuard,
  newScheduleEntries,
  pendingMlbSlateDates,
  pendingNcaafKickoffRefreshEntries,
  pendingEntriesForChildBudget,
  partitionNcaafKickoffReadiness,
  partitionNflKickoffReadiness,
  partitionStartedEntries,
  reanchorGameSchedule,
  retireGameSchedule,
  runIndependentDecisionLanes,
  runIndependentScheduleLanes,
  runPerGameDecisionPipeline,
  schedulerChildArgs,
  schedulerEntrySlateIdentity,
  scheduleEntryKey,
  setGameScheduleHold,
  sportFetchRetryIsCurrent,
} from './lib/schedulerPolicy.js';
import { requireNonFootballStart } from './lib/schedulerSourcePolicy.js';
import { parsePropRunOutcome } from './lib/propsRunReliability.js';
import { parsePickRunOutcome } from './lib/pickRunReliability.js';
import {
  classifyNcaafFbsGames,
  ncaafSlateDateForKickoff,
  resolveNcaafKickoff,
} from '../src/services/ncaafGamePolicy.js';
import {
  nflSlateDateForKickoff,
  resolveNflKickoff,
} from '../src/services/nflGamePolicy.js';
import {
  isInterruptedMlbGameStatus,
  normalizeMlbGameStatus,
} from '../supabase/functions/_shared/mlbGameStatus.js';

const PROJECT_DIR = join(import.meta.dirname, '..');
const LOG_DIR = join(PROJECT_DIR, 'logs', 'scheduler');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
// Multi-tier retry windows. Most teams post lineups 2-3 hours before first
// pitch (some — Pirates, Marlins, Rockies — closer to 60-90 min). The scout
// report HARD FAILs when batting orders aren't posted (checking BDL, then the
// official MLB Stats API), so games whose triggers all fire before lineups
// exist anywhere get no pick. To catch late posters without sacrificing early
// picks for on-time teams, we fire up to four triggers per game: T-90, T-60,
// T-30, T-15. The existing dedup in run-agentic-picks.js ("🚫 GAME ALREADY
// HAS PICK") makes subsequent triggers instant short-circuits once a pick has
// landed — cost per skip is the script startup overhead (~$0.001).
const LEAD_TIME_MINUTES = 90;       // Primary trigger (kept for any external reference)
const RETRY_LEAD_TIMES_MINUTES = [90, 60, 30, 15]; // First → fallbacks → final

// Football fires EARLY (founder, Aug 20): starters and depth charts are known
// days out — college publishes no inactives report at all, and the NFL's
// official inactives land at exactly T-90, which is why the old ladder began
// there. Waiting cost the page the whole afternoon. Football's first attempt
// now fires at T-240; T-90 stays in the ladder so a slate whose earlier tiers
// failed still gets a look at the inactives moment, with T-30 as the final
// net. MLB's ladder is untouched — its T-90 start is the LINEUP gate, not a
// preference.
const FOOTBALL_RETRY_LEAD_TIMES_MINUTES = [240, 180, 90, 30];
function retryLeadTimesFor(sportKey) {
  return (sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf')
    ? FOOTBALL_RETRY_LEAD_TIMES_MINUTES
    : RETRY_LEAD_TIMES_MINUTES;
}

const SPORTS = [
  { key: 'americanfootball_nfl', flag: '--nfl', label: 'NFL', propsScript: 'run-agentic-nfl-props.js' },
  // NCAAF PROPS = THE PIGGYBACK (founder, Aug 25 2026): college props ride the
  // game-pick lane — run-agentic-picks asks Gary for at most two menu props
  // right after each NCAAF game pick and stores them on the production prop
  // rails. The standalone desk lane (run-agentic-ncaaf-props.js) is PARKED, so
  // this entry deliberately carries no propsScript; the scheduler's props slot
  // skips sports without one. NFL keeps its full desk below.
  { key: 'americanfootball_ncaaf', flag: '--ncaaf', label: 'NCAAF' },
  // NBA PROPS: no lane until the relaunch builds one on the props desk
  // (Sep 2 2026 — the orchestrator props brain it used was deleted with the
  // old props system; the scheduler's props slot skips sports without a
  // propsScript). Game picks unchanged.
  { key: 'basketball_nba', flag: '--nba', label: 'NBA' },
  // NHL PARKED (Jul 13 2026): the BDL NHL tier lapsed, so every fetch 401s. That
  // permanent failure set fetchFailed=true on every daily build, which on the
  // all-sports-dark All-Star break made buildPlanResilient treat a legitimate
  // 0-game day as a fetch outage — it retried for 90 minutes and never published
  // the (empty) daily slate or tomorrow board, so the app showed a blank void
  // instead of an honest dark day. No NHL games until October; restore this entry
  // with the BDL All-Access decision.
  // { key: 'icehockey_nhl', flag: '--nhl', label: 'NHL' },
  { key: 'baseball_mlb', flag: '--mlb', label: 'MLB', propsScript: 'run-agentic-mlb-props.js' },
];

// Within a shared trigger window, process lightweight/time-sensitive slates
// before MLB's full picks+props block. Lower number = runs earlier.
// This orders the shared daily-ledger lane; NFL and NCAAF decisions use the
// separate bounded per-game lanes defined below.
const SPORT_RUN_PRIORITY = {
  americanfootball_nfl: 1,
  americanfootball_ncaaf: 2,
  basketball_nba: 3,
  icehockey_nhl: 4,
  baseball_mlb: 5,
};

// Spaced retries for fixed-trigger sports, as minutes AFTER the fixed time
// (10:00 → 10:45 → 11:30 ET). Like the lead-time tiers, every retry after a
// successful pick hits run-agentic-picks.js's "already has pick" dedup and
// exits in ~1s, so the extra triggers are a cheap reliability net.
const FIXED_TRIGGER_RETRY_OFFSETS_MINUTES = [0, 45, 90];

// NFL game picks and props write through atomic RPCs, so each worker can move
// directly from one exact game's pick decision into that game's props/TD
// decision. Keep the complete per-game pipeline capped at three workers.
const NFL_GAME_DECISION_CONCURRENCY = 3;

// NCAAF Saturdays routinely put dozens of games into the same kickoff
// cluster. Scale the bounded model/context pool with the cluster rather than
// leaving every large slate behind three workers. The cross-process BDL gate
// remains authoritative and serializes provider transports independently.
const NCAAF_CLUSTER_MIN_CONCURRENCY = 3;
const NCAAF_CLUSTER_MAX_CONCURRENCY = 12;
const NCAAF_TARGET_GAMES_PER_WORKER = 4;
// Shared MLB/NBA daily lane: serial on a normal night (≤4 games in a window),
// TWO bounded workers on a fat start cluster. Aug 25 2026: six West-Coast MLB
// picks at 11-22 min each vs a 95-min T-90 runway — serial missed Reds @
// Giants in a way NO ordering could fix (98 min of work, 95 of runway). The
// daily ledger's atomic date-lock path already absorbs concurrent writers
// (NCAAF runs up to 12 through it); two keeps CLI-quota pressure modest.
const SHARED_LANE_MAX_CONCURRENCY = 2;
const SHARED_LANE_TARGET_GAMES_PER_WORKER = 4;

// A child may research for a long time, but it may not own the scheduler past
// the next queued trigger or its own kickoff/first pitch. Two minutes lets the
// parent terminate and reap a slow child, record a retryable failure, and move
// to the next batch before that batch's wall-clock window opens.
const CHILD_MAX_RUNTIME_MS = 45 * 60 * 1000;
const CHILD_DEADLINE_SAFETY_MS = 2 * 60 * 1000;
const CHILD_TERMINATION_GRACE_MS = 5 * 1000;
// An overdue lane can start just before another independent lane's clock and
// otherwise hold the top-level loop past that trigger. Enroll only missing
// lanes inside this small horizon; their own wall-clock guard still waits for
// the exact trigger before starting a child.
const CROSS_LANE_TRIGGER_LOOKAHEAD_MS = 3 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════
function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    const logFile = join(LOG_DIR, `scheduler-${getTodayETDateStr()}.log`);
    appendFileSync(logFile, line + '\n');
  } catch {}
  beat();
}

// THE HEARTBEAT (Sep 3 2026). On Sep 2 the scheduler printed "Trigger window:
// 4 runnable game(s)" at 7:10 PM and never wrote another line until a hand
// restart at 9:26 AM — no error, no exit, no KeepAlive respawn, two games
// never picked. Same shape as Sep 1 (8 PM → 10:50 AM) and Jun 21 (the
// live-scores job after a laptop-sleep event). A process that is alive
// touches this file every 30 seconds; com.gary.scheduler-watchdog (launchd,
// every 120s) reloads the job when the file is older than five minutes.
// The plan rebuilds on start and stored games are skipped, so a reload is
// always safe. Outside the repo on purpose: the watchdog reads it whether or
// not this checkout is healthy.
const HEARTBEAT_FILE = join(process.env.HOME || '/Users/adam.preda', 'Library', 'Logs', 'Gary2.0', 'scheduler', 'heartbeat');
function beat() {
  try { writeFileSync(HEARTBEAT_FILE, `${Date.now()} pid=${process.pid}\n`); } catch {}
}
function startHeartbeat() {
  beat();
  setInterval(beat, 30_000).unref();
}

// ─────────────────────────────────────────────────────────────────────────
// PICK WHEN BOTH LINEUPS POST (founder GO, Sep 3 2026)
// ─────────────────────────────────────────────────────────────────────────
import { bothLineupsPosted } from './lib/schedulerPolicy.js';

/** Set when a trigger was pulled earlier; the sleeping main loop wakes and re-plans. */
let queueWake = false;
const LINEUP_WATCH_LEAD_MS = 240 * 60 * 1000;
const lineupFiredGames = new Set();

/**
 * From T-240, when MLB's official boxscore carries a full lineup for both
 * clubs, pull the game's earliest unfired tier to NOW. Runs inside the drift
 * guard's 10-minute check with the official match already in hand. Facts
 * only: a partial lineup is not a lineup; a failed feed waits for the ladder.
 */
async function fireOnPostedLineups(livePending, entry, match, now) {
  try {
    if (entry?.sport?.key !== 'baseball_mlb' || !match?.gamePk) return;
    const key = scheduleEntryKey(entry);
    if (lineupFiredGames.has(key)) return;
    const leadMs = entry.startTime.getTime() - now;
    if (leadMs <= 0 || leadMs > LINEUP_WATCH_LEAD_MS) return;
    const tiers = (livePending || []).filter((e) => scheduleEntryKey(e) === key && !isScheduleEntryHeld(e) && !isScheduleEntryRetired(e));
    const first = tiers.sort((a, b) => a.triggerTime - b.triggerTime)[0];
    if (!first || first.triggerTime.getTime() <= now) return; // already due or fired
    if (first.tier !== 1) return; // the primary already ran; retries keep their own clocks
    // A restart rebuilds every tier; a game whose pick is already stored
    // has nothing to fire early (the child would only exit on its dedup).
    const { picksService } = await import('../src/services/picksService.js');
    const stored = await picksService.pickAlreadyStoredByGameId(entry.sport.name || 'MLB', entry.slateDate || getTodayETDateStr(), entry.gameId).catch(() => null);
    if (stored?.exists) { lineupFiredGames.add(key); return; }
    const { getConfirmedLineups } = await import('../src/services/mlbStatsApiService.js');
    const lineups = await getConfirmedLineups(match.gamePk);
    if (!bothLineupsPosted(lineups)) return;
    lineupFiredGames.add(key);
    const wasET = first.triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
    first.triggerTime = new Date(now);
    queueWake = true;
    log(`📋 LINEUPS POSTED: ${entry.matchup} — both clubs' nine are official ${Math.round(leadMs / 60000)} min before first pitch; firing the game pick now instead of ${wasET} ET (id ${entry.gameId})`);
  } catch (e) {
    log(`⚠️ lineup watch skipped for ${entry?.matchup || '?'} (${e.message}) — the T-90 ladder stands`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// THE CLOSING BOARD (founder GO, Sep 3 2026): one odds fetch per game at
// first pitch, recorded to odds_snapshots (every book), so the closing-line
// read has a real close instead of the last pick tier's board.
// ─────────────────────────────────────────────────────────────────────────
const closingWatch = new Map(); // `${sport.key}:${gameId}` → { sport, dateStr, gameId, startTime, matchup, done }
const CLOSING_CAPTURE_SPORTS = new Set(['baseball_mlb', 'americanfootball_nfl', 'americanfootball_ncaaf']);
let closingTimer = null;

function registerClosingCapture(entries) {
  for (const e of entries || []) {
    if (!e?.sport?.key || !CLOSING_CAPTURE_SPORTS.has(e.sport.key) || e.gameId == null || !(e.startTime instanceof Date)) continue;
    const key = `${e.sport.key}:${e.gameId}`;
    if (!closingWatch.has(key)) closingWatch.set(key, { sport: e.sport, dateStr: e.slateDate || e.dateStr || getTodayETDateStr(), gameId: e.gameId, startTime: e.startTime, matchup: e.matchup, done: false });
  }
}

async function captureClosingBoards() {
  const now = Date.now();
  for (const [key, w] of closingWatch) {
    if (w.done) continue;
    const start = w.startTime.getTime();
    if (now < start - 90_000) continue;            // not yet: capture inside the last 90 seconds
    if (now > start + 20 * 60_000) { w.done = true; continue; } // too late to call it a close
    w.done = true;
    try {
      const games = await fetchGamesForETDate(w.sport.key, w.dateStr, { gameIds: [w.gameId] });
      const { recordOddsSnapshots } = await import('../src/services/oddsSnapshots.js');
      const n = await recordOddsSnapshots(w.sport.key, Array.isArray(games) ? games : []);
      log(`📏 CLOSING BOARD: ${w.matchup} — ${n} book board(s) recorded at first pitch (id ${w.gameId})`);
    } catch (e) {
      log(`⚠️ closing board skipped for ${w.matchup} (${e.message})`);
    }
  }
  for (const [key, w] of closingWatch) if (w.done && Date.now() > w.startTime.getTime() + 6 * 3600_000) closingWatch.delete(key);
}

function startClosingCapture() {
  if (closingTimer) return;
  closingTimer = setInterval(() => { captureClosingBoards().catch(() => {}); }, 60_000);
  closingTimer.unref();
}

// A 24/7 daemon must SURVIVE transient network blips. Waking from sleep often
// hits the network before DNS is ready — `getaddrinfo ENOTFOUND ...supabase.co`
// — and on Jun 21 2026 exactly that crashed the scheduler mid-morning (main()'s
// .catch exited the process), zeroing the whole day's picks until a manual
// restart. These handlers log and KEEP RUNNING for transient errors so a blip in
// one tick can't kill the process; the next scheduled tick re-fetches. A truly
// unexpected error still exits(1) for a clean watchdog restart with fresh state.
const TRANSIENT_NET = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETDOWN|ENETUNREACH|EHOSTUNREACH|socket hang up|fetch failed|network|getaddrinfo/i;
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  log(`⚠️ unhandledRejection (non-fatal — scheduler stays up): ${msg}`);
});
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  if (TRANSIENT_NET.test(msg)) {
    log(`⚠️ Transient network error (non-fatal — scheduler stays up, next tick retries): ${msg}`);
    return;
  }
  log(`🔥 uncaughtException — exiting(1) for a clean watchdog restart: ${msg}`);
  console.error(err);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════════════════
// BDL: FETCH GAMES
// ═══════════════════════════════════════════════════════════════════════════

// Per-sport game start time field. Explicit, no fallbacks — if the field is
// missing the game is broken upstream and we want to know about it.
function extractStartTimeIso(game, sportKey) {
  if (sportKey === 'basketball_nba') return game.datetime;
  if (sportKey === 'icehockey_nhl') return game.start_time_utc;
  if (sportKey === 'baseball_mlb') return game.date;
  if (sportKey === 'americanfootball_nfl') return resolveNflKickoff(game).iso;
  if (sportKey === 'americanfootball_ncaaf') return resolveNcaafKickoff(game).iso;
  throw new Error(`extractStartTimeIso: unknown sportKey ${sportKey}`);
}

function getETDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Fetch games whose ET game-day matches `etDateStr`. We query both the ET date
// and the next UTC date, because late ET games can live under tomorrow's UTC
// provider date. Then we filter by actual ET start time.
async function fetchGamesForETDate(sportKey, etDateStr, { gameIds = [] } = {}) {
  const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
  const dates = [etDateStr, addDaysISO(etDateStr, 1)];
  const supportsExactKickoffRetry = sportKey === 'americanfootball_ncaaf'
    || sportKey === 'americanfootball_nfl';
  const exactFootballGameIds = supportsExactKickoffRetry
    ? [...new Set(
        (Array.isArray(gameIds) ? gameIds : [])
          .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
          .map(String),
      )].sort()
    : [];
  const params = exactFootballGameIds.length > 0
    ? { game_ids: exactFootballGameIds, per_page: 100 }
    : { dates, per_page: 100 };
  // BDL's NFL games endpoint defaults away from preseason. August would then
  // look like a dark league even while real games are on the board.
  if (sportKey === 'americanfootball_nfl' && exactFootballGameIds.length === 0) {
    params.season_type = [1, 2, 3];
  }
  let games;
  try {
    games = await ballDontLieService.getGames(
      sportKey,
      params,
      exactFootballGameIds.length > 0 ? 0 : 10,
    );
  } catch (e) {
    const scope = exactFootballGameIds.length > 0
      ? `game_ids ${exactFootballGameIds.join(',')}`
      : dates.join(',');
    log(`  ❌ ${sportKey}: BDL fetch failed for ${scope}: ${e.message}`);
    return null; // null = transport failed; a result object may still carry exact pending IDs
  }
  if (!Array.isArray(games)) games = [];

  const retryGameIds = [];
  let retryAll = false;
  if (supportsExactKickoffRetry && exactFootballGameIds.length > 0) {
    const returnedIds = new Set(games
      .filter((game) => game?.id !== null && game?.id !== undefined)
      .map((game) => String(game.id)));
    for (const id of exactFootballGameIds) {
      if (!returnedIds.has(id)) retryGameIds.push(id);
    }
  }
  if (sportKey === 'americanfootball_nfl') {
    const targetDateGames = games.filter((game) => {
      const kickoff = resolveNflKickoff(game);
      const slateDate = nflSlateDateForKickoff(game);
      return !kickoff.scheduledDate || slateDate === etDateStr;
    });
    const readiness = partitionNflKickoffReadiness(targetDateGames, etDateStr);
    retryGameIds.push(...readiness.retryGameIds);
    retryAll ||= readiness.retryAll;
    for (const { raw, kickoff } of readiness.pending) {
      const reason = kickoff.scheduledDate ? 'TIME TBD' : 'kickoff date unavailable';
      log(`  ⏳ ${sportKey} game ${raw?.id}: ${reason} — retrying this exact id without scheduling a deadline`);
    }

    const seen = new Set();
    return {
      games: readiness.confirmed.filter(({ raw }) => {
        const key = String(raw.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      retryGameIds: [...new Set(retryGameIds)].sort(),
      retryAll,
    };
  }
  if (sportKey === 'americanfootball_ncaaf') {
    // The adjacent UTC-date query can include tomorrow's daytime games. Keep
    // those out before FBS classification so one unrelated row cannot block
    // today's confirmed slate. Unknown dates remain retryable by exact id.
    const targetDateGames = games.filter((game) => {
      const kickoff = resolveNcaafKickoff(game);
      const slateDate = ncaafSlateDateForKickoff(game);
      return !kickoff.scheduledDate || slateDate === etDateStr;
    });
    let classified = classifyNcaafFbsGames(targetDateGames);
    if (classified.unresolved.length > 0) {
      try {
        const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
        classified = classifyNcaafFbsGames(targetDateGames, teams);
      } catch (error) {
        // Embedded provider identity can still verify part of the slate. Keep
        // those games schedulable and retry only the unresolved exact ids.
        log(`  ⚠️ ${sportKey}: team-directory lookup failed; retaining verified games and retrying unresolved ids (${error.message})`);
      }
    }
    if (classified.unresolved.length > 0) {
      for (const game of classified.unresolved) {
        if (game?.id !== null && game?.id !== undefined) retryGameIds.push(String(game.id));
        else retryAll = true;
      }
      log(`  ⏳ ${sportKey}: ${classified.unresolved.length} game(s) lack provider-grounded FBS identity — confirmed games stay scheduled; unresolved ids retry independently`);
    }
    if (classified.rejected.length > 0) {
      log(`  ⏭️ ${sportKey}: excluded ${classified.rejected.length} non-FBS matchup(s)`);
    }
    const readiness = partitionNcaafKickoffReadiness(classified.accepted, etDateStr);
    retryGameIds.push(...readiness.retryGameIds);
    retryAll ||= readiness.retryAll;
    for (const { raw, kickoff } of readiness.pending) {
      const reason = kickoff.scheduledDate ? 'TIME TBD' : 'kickoff date unavailable';
      log(`  ⏳ ${sportKey} game ${raw?.id}: ${reason} — retrying this exact id without scheduling a deadline`);
    }

    const seen = new Set();
    return {
      games: readiness.confirmed.filter(({ raw }) => {
        const key = String(raw.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      retryGameIds: [...new Set(retryGameIds)].sort(),
      retryAll,
    };
  }

  const filtered = [];
  try {
    for (const g of games) {
      const startIso = extractStartTimeIso(g, sportKey);
      const start = requireNonFootballStart(g, sportKey, startIso);
      if (getETDateStr(start) !== etDateStr) continue;
      filtered.push({ raw: g, startTime: start });
    }
  } catch (error) {
    // A decoded provider row is part of the authoritative sport snapshot. If
    // its required clock is malformed, treating that row as absent creates a
    // false clean slate and permanently drops its pick windows. Fail only this
    // sport so buildPlan queues the same isolated retry used for transport
    // failures; football's explicit date-only/exact-id policy above is intact.
    log(`  ❌ ${sportKey}: malformed schedule snapshot — isolated sport retry queued (${error.message})`);
    return null;
  }
  // Dedupe in case a game appears in both UTC date queries (rare but possible)
  const seen = new Set();
  const dedupedGames = filtered.filter(({ raw }) => {
    const key = String(raw.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    games: dedupedGames,
    retryGameIds: [...new Set(retryGameIds)].sort(),
    retryAll,
  };
}

function scheduleGamesForSport(sport, games, etDateStr, { logGames = true } = {}) {
  const entries = [];
  for (const { raw: game, startTime } of games) {
    const homeTeam = game.home_team?.full_name || game.home_team?.name || 'Home';
    const awayTeam = game.visitor_team?.full_name || game.away_team?.full_name || game.visitor_team?.name || game.away_team?.name || 'Away';
    const matchup = `${awayTeam} @ ${homeTeam}`;
    const startET = startTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
    const tierLabels = [];
    const slateIdentity = schedulerEntrySlateIdentity(sport.key, etDateStr);
    const mlbStatus = sport.key === 'baseball_mlb'
      ? normalizeMlbGameStatus(game.game_status ?? game.status)
      : null;
    const scheduleState = mlbStatus?.status === 'delayed'
      ? { scheduleHold: 'delayed' }
      : mlbStatus?.interrupted
        ? { scheduleRetired: mlbStatus.status }
        : {};

    if (sport.fixedTriggerET) {
      const base = instantForETDate(etDateStr, sport.fixedTriggerET.hour, sport.fixedTriggerET.minute);
      const latest = new Date(startTime.getTime() - 15 * 60 * 1000);
      for (let i = 0; i < FIXED_TRIGGER_RETRY_OFFSETS_MINUTES.length; i++) {
        let triggerTime = new Date(base.getTime() + FIXED_TRIGGER_RETRY_OFFSETS_MINUTES[i] * 60 * 1000);
        if (triggerTime > latest) {
          if (i === 0) triggerTime = latest;
          else continue;
        }
        entries.push({ sport, matchup, homeTeam, awayTeam, startTime, triggerTime, gameId: game.id, tier: i + 1, leadMin: null, ...slateIdentity, ...scheduleState });
        const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
        tierLabels.push(`fixed=${triggerET}`);
      }
    } else {
      const leadTimes = retryLeadTimesFor(sport.key);
      for (let i = 0; i < leadTimes.length; i++) {
        const leadMin = leadTimes[i];
        const triggerTime = new Date(startTime.getTime() - leadMin * 60 * 1000);
        entries.push({ sport, matchup, homeTeam, awayTeam, startTime, triggerTime, gameId: game.id, tier: i + 1, leadMin, ...slateIdentity, ...scheduleState });
        const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
        tierLabels.push(`T${leadMin}=${triggerET}`);
      }
    }
    if (logGames) log(`    ${matchup} | Game: ${startET} | ${tierLabels.join(' / ')} | id: ${game.id}`);
  }
  return entries;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN: Build per-game schedule for the day
// ═══════════════════════════════════════════════════════════════════════════
async function buildPlan(etDateStr) {
  log(`\n═══════════════════════════════════════════════════════════`);
  log(`🗓️  Building per-game plan for ${etDateStr} (ET)`);
  log(`═══════════════════════════════════════════════════════════`);

  const schedule = [];
  let fetchFailed = false; // true if ANY sport's fetch threw (vs. empty slate)

  for (const sport of SPORTS) {
    const result = await fetchGamesForETDate(sport.key, etDateStr);
    if (result === null) {
      const retry = makeSportFetchRetryEntry({ sport, dateStr: etDateStr, attempt: 1 });
      schedule.push(retry);
      log(`  ${sport.label}: fetch FAILED — queued an isolated retry in 1m; healthy sports continue`);
      fetchFailed = true;
      continue;
    }
    const { games, retryGameIds, retryAll } = result;
    if (games.length === 0) {
      log(`  ${sport.label}: ${retryAll || retryGameIds.length > 0 ? 'No confirmed kickoff times yet' : 'No games'}`);
    } else {
      log(`  ${sport.label}: ${games.length} games`);
      schedule.push(...scheduleGamesForSport(sport, games, etDateStr));
    }

    if (retryAll || retryGameIds.length > 0) {
      schedule.push(makeSportFetchRetryEntry({
        sport,
        dateStr: etDateStr,
        attempt: 1,
        gameIds: retryAll ? [] : retryGameIds,
      }));
      const scope = retryAll ? 'the unresolved slate' : `${retryGameIds.length} exact game id(s)`;
      log(`  ${sport.label}: ${scope} queued for isolated kickoff/identity retry; confirmed games remain armed`);
    }
  }

  schedule.sort((a, b) => a.triggerTime - b.triggerTime);
  registerClosingCapture(schedule);
  // schedule.length is trigger ENTRIES, not unique games. Each game produces
  // up to RETRY_LEAD_TIMES_MINUTES.length entries (currently 4: T-90/60/30/15),
  // but only the first successful tier actually generates a pick — the rest
  // hit the picks-script dedup and exit in ~1 second.
  const gameEntries = schedule.filter((entry) => !isSportFetchRetryEntry(entry));
  const uniqueGameIds = new Set(gameEntries.map(e => `${e.sport.key}:${e.gameId}`));
  const retryCount = schedule.length - gameEntries.length;
  log(`\n📋 Total: ${gameEntries.length} trigger entries across ${uniqueGameIds.size} unique games (up to ${RETRY_LEAD_TIMES_MINUTES.length} retries per game)${retryCount ? ` + ${retryCount} sport fetch retry` : ''}`);
  return { schedule, fetchFailed };
}

// Publish the day's full slate (all games + opening lines) to the daily_slate
// table so the app shows the whole schedule from the morning, with Gary's
// picks overlaying later. NON-FATAL by design — a slate-write failure must
// never block pick generation.
async function writeDailySlateNonFatal(dateStr) {
  try {
    const { writeDailySlate } = await import('../src/services/dailySlateService.js');
    const res = await writeDailySlate(dateStr);
    const summary = Object.entries(res.byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
    log(`📋 Daily slate published: ${res.total} game(s)${summary ? ` (${summary})` : ''}`);
    return { ok: true, result: res };
  } catch (e) {
    const partial = e?.result;
    if (partial) {
      const failed = (partial.failures || []).map((f) => `${f.league}: ${f.error}`).join(' | ');
      log(`⚠️ Daily slate PARTIAL (non-fatal, healthy leagues persisted; failed leagues remain retryable): ${partial.total} game(s); ${failed || e.message}`);
    } else {
      log(`⚠️ Daily slate write failed (non-fatal, picks unaffected): ${e.message}`);
    }
    return { ok: false, error: e, result: partial || null };
  }
}

// Pre-assemble TOMORROW's board (slate + line snapshot, ranked big games,
// by-sport probable starters, best-effort key returns, earliest-game countdown)
// into the `tomorrow_board` table for the app's TOMORROW tab. daily_slate only
// ever carries today, so the Tomorrow tab needs this dedicated snapshot. NON-FATAL
// by design — never blocks the daily build. Idempotent upsert on (date); the
// evening re-run refreshes overnight-posted lines.
async function writeTomorrowBoardNonFatal(tomorrowDateStr) {
  try {
    const { writeTomorrowBoard } = await import('../src/services/tomorrowService.js');
    const r = await writeTomorrowBoard(tomorrowDateStr);
    log(`🗓️ Tomorrow board published: ${r.game_count} game(s), ${r.big_games.length} big game(s), ${r.starters.length} starter(s) (lines ${r.any_lines ? 'posted' : 'open soon'})`);
    return { ok: true, result: r };
  } catch (e) {
    const partial = e?.result;
    if (partial) {
      const failed = (partial.failures || []).map((f) => `${f.league}: ${f.error}`).join(' | ');
      log(`⚠️ Tomorrow board PARTIAL (non-fatal, healthy leagues refreshed; same-date last-good rows retained where available): ${failed || e.message}`);
    } else {
      log(`⚠️ Tomorrow board write failed (non-fatal): ${e.message}`);
    }
    return { ok: false, error: e, result: partial || null };
  }
}

// Build the plan, but ride out transient fetch outages. A wifi/API failure at
// build time used to return an empty plan that then slept 24h — the bug that
// silently killed a whole slate (see Friday's "Sleeping 21.22 hours" log).
// Here, an empty plan caused by fetch FAILURES retries with backoff up to
// `maxWaitMs`. A clean empty (fetches succeeded, no games) returns at once; a
// partial result (some sport failed but others have games) proceeds rather
// than holding a good slate hostage to one flaky sport. The failed sport is
// represented by a retry entry in the same live queue, so it gets another shot
// in minutes without rebuilding or duplicating healthy leagues.
// The last ET date a plan was actually BUILT for — the hibernation guard's
// ledger. A laptop that sleeps through a day boundary mid-execution wakes,
// finishes the stale day, and must NOT sleep to the next 5 AM while the
// current day sits unplanned (Jul 11 2026: woke 11:11 AM having finished
// Jul 10's plan, slept to Jul 12 — both WC semis + 16 MLB games unplanned).
let lastPlannedDate = null;

async function buildPlanResilient(dateStr, { maxWaitMs = 90 * 60 * 1000 } = {}) {
  lastPlannedDate = dateStr;
  const start = Date.now();
  let attempt = 0;
  while (true) {
    attempt++;
    const { schedule, fetchFailed } = await buildPlan(dateStr);
    if (schedule.length > 0 || !fetchFailed) {
      const urgent = hasUrgentUpcomingTrigger(schedule, Date.now());
      if (urgent) {
        // On a midday restart/wake, board refreshes can make many odds calls.
        // The slate is already persisted by the morning build; do not hold an
        // imminent pick window behind non-critical snapshot enrichment.
        log('⏩ Urgent pick window detected — deferring daily/tomorrow board refreshes until the next scheduled build');
        return schedule;
      }
      if (fetchFailed) {
        log('🔁 Partial provider failure remains queued inside today’s live plan; public-board snapshots will keep the healthy leagues while that sport retries');
      }
      // Plan built (or genuinely no games) — snapshot the public slate for the app.
      await writeDailySlateNonFatal(dateStr);
      // Refresh TODAY's board at the 5 AM plan build too. The snapshot was
      // first written the prior evening, before many MLB probable starters,
      // series results and weather fields had landed; without this refresh a
      // thin evening row stayed thin all day even though the sources improved.
      if (schedule.length > 0) await writeTomorrowBoardNonFatal(dateStr);
      // Also pre-assemble TOMORROW's board (daily_slate only carries today).
      await writeTomorrowBoardNonFatal(addDaysISO(dateStr, 1));
      return schedule;
    }
    if (Date.now() - start >= maxWaitMs) {
      log(`⚠️ Plan still empty after ${attempt} attempts / ${Math.round((Date.now() - start) / 60000)}m of fetch failures — proceeding empty.`);
      // Publish what we know even on give-up. Before Jul 13 2026 this path
      // returned without writing the slate/tomorrow board, so a day stuck in
      // "empty from fetch failures" left the app with NO board at all — a dark
      // day and a dead pipeline looked identical. Both writers are non-fatal.
      await writeDailySlateNonFatal(dateStr);
      await writeTomorrowBoardNonFatal(addDaysISO(dateStr, 1));
      return schedule;
    }
    const backoff = Math.min(20 * 60 * 1000, 60 * 1000 * 2 ** (attempt - 1)); // 1,2,4,8,16,20,20…m
    log(`🔁 Empty plan from fetch failures — retry in ${Math.round(backoff / 60000)}m (attempt ${attempt})`);
    await sleepUntilWallClock(new Date(Date.now() + backoff));
  }
}

/**
 * A daemon restart between midnight and 6 AM ET must not abandon a late NCAAF
 * game that still belongs to yesterday's Gary slate. Build today's normal
 * all-sport plan first, then add only the still-active prior NCAAF slate. No
 * other league's date contract changes.
 */
async function addActiveNcaafRecovery(schedule, now = new Date()) {
  const slateDate = activeNcaafRecoverySlateDate(now);
  if (!slateDate) return schedule;

  const sport = SPORTS.find((candidate) => candidate.key === 'americanfootball_ncaaf');
  if (!sport) return schedule;
  log(`🏈 NCAAF overnight recovery: checking active ${slateDate} slate before the 6:00 AM ET rollover`);

  const result = await fetchGamesForETDate(sport.key, slateDate);
  const recovery = [];
  if (result === null) {
    recovery.push(makeSportFetchRetryEntry({ sport, dateStr: slateDate, attempt: 1, now }));
  } else {
    const upcomingGames = result.games.filter(({ startTime }) => startTime.getTime() > now.getTime());
    recovery.push(...scheduleGamesForSport(sport, upcomingGames, slateDate));
    if (result.retryAll || result.retryGameIds.length > 0) {
      recovery.push(makeSportFetchRetryEntry({
        sport,
        dateStr: slateDate,
        attempt: 1,
        now,
        gameIds: result.retryAll ? [] : result.retryGameIds,
      }));
    }
  }

  const fresh = newScheduleEntries(schedule, recovery);
  if (fresh.length === 0) return schedule;
  log(`🏈 NCAAF overnight recovery armed ${fresh.length} prior-slate trigger/retry entr${fresh.length === 1 ? 'y' : 'ies'}`);
  return [...schedule, ...fresh].sort((a, b) => a.triggerTime - b.triggerTime);
}

async function buildCurrentPlanResilient(dateStr = getTodayETDateStr()) {
  const schedule = await buildPlanResilient(dateStr);
  return addActiveNcaafRecovery(schedule);
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN: Execute a single script
// ═══════════════════════════════════════════════════════════════════════════
class SchedulerChildDeadlineError extends Error {
  constructor({ scriptPath, timeoutMs, deadlineAt, limitingReason }) {
    const deadline = deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt);
    const deadlineText = Number.isFinite(deadline.getTime()) ? deadline.toISOString() : 'unknown';
    super(`Child deadline reached before ${limitingReason} (${scriptPath}; budget ${Math.round(timeoutMs / 1000)}s; deadline ${deadlineText})`);
    this.name = 'SchedulerChildDeadlineError';
    this.code = 'SCHEDULER_CHILD_DEADLINE';
    this.retryable = true;
    this.scriptPath = scriptPath;
    this.timeoutMs = timeoutMs;
    this.deadlineAt = deadlineText;
    this.limitingReason = limitingReason;
  }
}

function signalChildProcessGroup(proc, signal) {
  // Each runner owns a process group so its model/search subprocesses cannot
  // outlive a deadline and keep researching or writing after the queue moves.
  try {
    if (Number.isInteger(proc?.pid)) process.kill(-proc.pid, signal);
  } catch {
    try { proc?.kill(signal); } catch {}
  }
}

function runScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Math.floor(Number(options.timeoutMs)))
      : CHILD_MAX_RUNTIME_MS;
    const limitingReason = options.limitingReason || 'hard_cap';
    const deadlineAt = options.deadlineAt instanceof Date
      ? options.deadlineAt
      : new Date(Date.now() + timeoutMs);
    const deadlineError = () => new SchedulerChildDeadlineError({
      scriptPath,
      timeoutMs,
      deadlineAt,
      limitingReason,
    });

    // Do not start a process that cannot finish inside a safe wall-clock
    // window. Its untouched later tier remains in the dynamic queue.
    if (timeoutMs <= 0) {
      reject(deadlineError());
      return;
    }

    log(`  📡 Running: node ${scriptPath} ${args.join(' ')}`);
    const proc = spawn('node', [scriptPath, ...args], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, NODE_OPTIONS: '' }
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      for (const line of data.toString().split('\n')) {
        if (line.includes('[Cost]') || line.includes('Total Picks') || line.includes('✅') || line.includes('❌')) {
          log(`    ${line.trim()}`);
        }
      }
    });
    proc.stderr.on('data', (data) => { output += data.toString(); });

    let settled = false;
    let timedOut = false;
    let killTimer = null;
    const persistOutput = () => {
      try {
        const logFile = join(LOG_DIR, `${getTodayETDateStr()}-${args.join('-')}.log`);
        appendFileSync(logFile, output);
      } catch {}
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      signalChildProcessGroup(proc, 'SIGTERM');
      // Do not advance the queue while a timed-out writer is still alive.
      // Wait through the grace period even if the direct Node child closes:
      // model/search descendants share the group and must be gone too.
      killTimer = setTimeout(() => {
        signalChildProcessGroup(proc, 'SIGKILL');
        if (settled) return;
        settled = true;
        persistOutput();
        log(`  ⏱️ Deadline stopped child tree before ${limitingReason}; later tier remains eligible`);
        reject(deadlineError());
      }, CHILD_TERMINATION_GRACE_MS);
    }, timeoutMs);

    proc.on('error', (error) => {
      if (settled) return;
      if (timedOut) return; // deadline timer owns group cleanup + rejection
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });

    proc.on('close', (code) => {
      if (settled) return;
      if (timedOut) return; // wait for the group cleanup grace period
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      persistOutput();
      if (code === 0) {
        log(`  ✅ Done`);
        resolve(output);
      } else {
        log(`  ❌ Failed (exit ${code})`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE: Process the full schedule
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// MLB START-TIME DRIFT GUARD
// ═══════════════════════════════════════════════════════════════════════════
// The morning slate freezes trigger times from BDL's schedule, but first
// pitches MOVE (Aug 13 2026: Reds @ White Sox went 2:10 → 1:10 ET after the
// plan was built, turning our T-90 into a real T-30 — the pick landed with 21
// minutes to spare). Every 10 minutes, re-check today's un-started MLB games
// against MLB's official schedule API. If a game moves in either direction,
// every remaining tier is re-anchored to the verified start so a delay cannot
// burn all retries early and a moved-up game cannot wait on stale clocks.

const DRIFT_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DRIFT_MIN_DELTA_MS = 5 * 60 * 1000;
let activeDriftTimer = null; // singleton — a supervise() in-process restart must not stack timers

async function fetchOfficialMlbStarts(etDateStr) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${etDateStr}`);
  if (!res.ok) throw new Error(`statsapi HTTP ${res.status}`);
  const data = await res.json();
  const games = [];
  for (const day of data.dates || []) {
    for (const g of day.games || []) {
      const start = new Date(g.gameDate);
      if (Number.isNaN(start.getTime())) continue;
      const normalizedStatus = normalizeMlbGameStatus(g.status);
      games.push({
        gamePk: g.gamePk ?? null,
        home: g.teams?.home?.team?.name || '',
        away: g.teams?.away?.team?.name || '',
        start,
        status: normalizedStatus.status,
      });
    }
  }
  return games;
}

// BDL names are short ("White Sox"); statsapi names are full ("Chicago White
// Sox") — containment matching, both sides required. Doubleheaders produce two
// candidates: take the one closest to our recorded start.
function matchOfficialGame(officialGames, entry) {
  const home = entry.homeTeam.toLowerCase();
  const away = entry.awayTeam.toLowerCase();
  const candidates = officialGames.filter(
    (g) => g.home.toLowerCase().includes(home) && g.away.toLowerCase().includes(away)
  );
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => Math.abs(a.start - entry.startTime) - Math.abs(b.start - entry.startTime)
  );
  return candidates[0];
}

function markOfficialMlbStatus(entries, exemplar, status, commenceTime = null) {
  const gameKey = scheduleEntryKey(exemplar);
  for (const entry of entries || []) {
    if (scheduleEntryKey(entry) !== gameKey) continue;
    entry.officialMlbStatus = status;
    entry.officialMlbCommenceTime = commenceTime;
  }
}

async function persistOfficialMlbStatusTransition(
  entries,
  entry,
  status,
  { commenceTime = null } = {},
) {
  if (
    entry.officialMlbStatus === status
    && entry.officialMlbCommenceTime === commenceTime
  ) return true;
  try {
    const { patchDailySlateMlbStatus } = await import('../src/services/dailySlateService.js');
    await patchDailySlateMlbStatus({
      date: entry.slateDate,
      gameId: entry.gameId,
      status,
      ...(commenceTime ? { commenceTime } : {}),
    });
    markOfficialMlbStatus(entries, entry, status, commenceTime);
    log(`📋 MLB STATUS SYNCED: ${entry.matchup} — ${status.toUpperCase()} on exact slate id ${entry.gameId}`);
    return true;
  } catch (error) {
    log(`❌ MLB STATUS SYNC FAILED: ${entry.matchup} ${status.toUpperCase()} (id ${entry.gameId}) — ${error.message}; schedule state was not relaxed, and the next official check will retry`);
    return false;
  }
}

async function startMlbDriftGuard(getPendingEntries) {
  if (activeDriftTimer) { clearInterval(activeDriftTimer); activeDriftTimer = null; }
  const initialMlb = getPendingEntries().filter(
    (entry) => entry?.sport?.key === 'baseball_mlb' && !isScheduleEntryRetired(entry),
  );
  if (initialMlb.length === 0) return;
  let checking = false;
  const fmtET = (d) => d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const now = Date.now();
      const pendingByGame = new Map();
      for (const entry of getPendingEntries()) {
        if (entry?.sport?.key !== 'baseball_mlb' || isScheduleEntryRetired(entry)) continue;
        if (!isScheduleEntryHeld(entry) && entry.startTime.getTime() <= now - 60 * 60 * 1000) continue;
        if (!pendingByGame.has(scheduleEntryKey(entry))) {
          pendingByGame.set(scheduleEntryKey(entry), entry);
        }
      }
      const pending = [...pendingByGame.values()];
      if (pending.length === 0) return;
      // A delayed late game can keep this queue alive across midnight. Query
      // the stable slate date carried by each pending entry, never the new
      // wall-clock "today", or the prior-day game becomes unmatchable and its
      // hold can block the shared lane (and therefore the next daily plan)
      // forever.
      const officialBySlateDate = new Map();
      for (const slateDate of pendingMlbSlateDates(pending)) {
        officialBySlateDate.set(slateDate, await fetchOfficialMlbStarts(slateDate));
      }
      for (const entry of pending) {
        const match = matchOfficialGame(officialBySlateDate.get(entry.slateDate) || [], entry);
        if (!match) continue;

        const livePending = getPendingEntries();
        if (match.status === 'delayed') {
          const held = setGameScheduleHold(livePending, entry, 'delayed');
          if (held > 0) {
            log(`⏸️ MLB DELAY HOLD: ${entry.matchup} — ${held} remaining tier(s) paused; no replacement first-pitch time was assumed (id ${entry.gameId})`);
          }
          await persistOfficialMlbStatusTransition(livePending, entry, match.status);
          continue;
        }
        if (isInterruptedMlbGameStatus(match.status)) {
          setGameScheduleHold(livePending, entry, match.status);
          const persisted = await persistOfficialMlbStatusTransition(
            livePending,
            entry,
            match.status,
          );
          if (!persisted) continue;
          const retired = retireGameSchedule(livePending, entry, match.status);
          if (retired > 0) {
            log(`⛔ MLB ${match.status.toUpperCase()}: ${entry.matchup} — ${retired} remaining pregame tier(s) retired for this slate (id ${entry.gameId})`);
          }
          continue;
        }
        if (match.status === 'live' || match.status === 'final') {
          setGameScheduleHold(livePending, entry, match.status);
          const persisted = await persistOfficialMlbStatusTransition(
            livePending,
            entry,
            match.status,
          );
          if (!persisted) continue;
          retireGameSchedule(livePending, entry, match.status);
          continue;
        }

        // PICK WHEN BOTH LINEUPS POST (founder GO, Sep 3 2026): most clubs
        // post two to four hours out; a fixed T-90 waited on the last of
        // them and took the price after the crowd had reacted. From T-240,
        // once the official boxscore carries nine batters a side, the
        // game's first tier fires now; the T-90 ladder stays as the fallback.
        await fireOnPostedLineups(livePending, entry, match, now);
        const deltaMs = match.start.getTime() - entry.startTime.getTime();
        if (isScheduleEntryHeld(entry)) {
          const persisted = await persistOfficialMlbStatusTransition(
            livePending,
            entry,
            match.status,
            { commenceTime: match.start.toISOString() },
          );
          if (!persisted) continue;
          const previousStart = new Date(entry.startTime);
          const changed = reanchorGameSchedule(livePending, entry, match.start);
          const released = setGameScheduleHold(livePending, entry, null);
          log(`▶️ MLB DELAY RESOLVED: ${entry.matchup} — official exact start ${fmtET(match.start)} ET; ${released} held tier(s) released (id ${entry.gameId})`);
          if (changed > 0 && previousStart.getTime() !== match.start.getTime()) {
            log(`🧭 DRIFT RE-ANCHORED: ${entry.matchup} — ${changed} remaining tier(s) moved from ${fmtET(previousStart)} ET to ${fmtET(match.start)} ET`);
          }
          continue;
        }
        await persistOfficialMlbStatusTransition(
          livePending,
          entry,
          match.status,
          { commenceTime: match.start.toISOString() },
        );
        if (Math.abs(deltaMs) < DRIFT_MIN_DELTA_MS) continue;
        log(`🕐 START-TIME DRIFT: ${entry.matchup} — planned ${fmtET(entry.startTime)} ET, official now ${fmtET(match.start)} ET (${Math.round(deltaMs / 60000)} min)`);
        const changed = reanchorGameSchedule(livePending, entry, match.start);
        log(`🧭 DRIFT RE-ANCHORED: ${entry.matchup} — ${changed} unfired tier(s) now follow the official ${fmtET(match.start)} ET start (id ${entry.gameId})`);
      }
    } catch (e) {
      log(`⚠️ Drift guard check failed (non-fatal, next tick retries): ${e.message}`);
    } finally {
      checking = false;
    }
  };

  activeDriftTimer = setInterval(check, DRIFT_CHECK_INTERVAL_MS);
  // Resolve the first official frame before the dynamic queue can consume an
  // already-due stale tier. Later checks remain on the existing interval.
  await check();
  log(`🕐 Drift guard armed: re-checking MLB exact pending games vs statsapi every ${DRIFT_CHECK_INTERVAL_MS / 60000} min`);
}

// NCAAF providers can replace a confirmed morning kickoff with a different
// exact instant later in the day. Re-fetch only exact still-pending ids, at a
// bounded cadence and batch size, then move only their unfired tiers. A
// date-only response is never converted into an execution clock.
const NCAAF_KICKOFF_CHECK_INTERVAL_MS = 10 * 60 * 1000;
const NCAAF_KICKOFF_MIN_DELTA_MS = 60 * 1000;
const NCAAF_KICKOFF_MAX_GAMES = 100;
let activeNcaafKickoffTimer = null;

function startNcaafKickoffGuard(getPendingEntries) {
  // The existing getter already observes the lane's live queue, including
  // later exact-id recoveries. Do not reset an active async interval and risk
  // overlapping the in-flight refresh with a second timer.
  if (activeNcaafKickoffTimer) return;
  const initial = pendingNcaafKickoffRefreshEntries(
    getPendingEntries(),
    Date.now(),
    NCAAF_KICKOFF_MAX_GAMES,
  );
  if (initial.length === 0) return;

  let checking = false;
  const fmtET = (date) => date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  activeNcaafKickoffTimer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const pending = pendingNcaafKickoffRefreshEntries(
        getPendingEntries(),
        Date.now(),
        NCAAF_KICKOFF_MAX_GAMES,
      );
      if (pending.length === 0) return;

      const pendingBySlate = new Map();
      for (const entry of pending) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.slateDate || ''))) {
          throw new Error(`NCAAF kickoff refresh entry ${entry.gameId} has no canonical slate date`);
        }
        if (!pendingBySlate.has(entry.slateDate)) pendingBySlate.set(entry.slateDate, []);
        pendingBySlate.get(entry.slateDate).push(entry);
      }

      for (const [slateDate, slateEntries] of pendingBySlate) {
        const gameIds = slateEntries.map((entry) => String(entry.gameId));
        const result = await fetchGamesForETDate(
          'americanfootball_ncaaf',
          slateDate,
          { gameIds },
        );
        if (result === null) throw new Error(`exact BDL kickoff refresh failed for ${slateDate}`);
        const confirmedById = new Map(result.games.map(({ raw, startTime }) => [
          String(raw.id),
          startTime,
        ]));

        for (const entry of slateEntries) {
          const nextStart = confirmedById.get(String(entry.gameId));
          if (!nextStart) {
            if (result.retryGameIds.includes(String(entry.gameId))) {
              log(`⏳ NCAAF kickoff refresh: ${entry.matchup} is TIME TBD; keeping the last confirmed clock until an exact instant returns (id ${entry.gameId})`);
            }
            continue;
          }
          const deltaMs = nextStart.getTime() - entry.startTime.getTime();
          if (Math.abs(deltaMs) < NCAAF_KICKOFF_MIN_DELTA_MS) continue;
          const previousStart = new Date(entry.startTime);
          const livePending = getPendingEntries();
          const changed = reanchorGameSchedule(livePending, entry, nextStart);
          if (changed === 0) continue;
          log(`🏈 NCAAF KICKOFF MOVED: ${entry.matchup} — ${fmtET(previousStart)} ET → ${fmtET(nextStart)} ET (${Math.round(deltaMs / 60000)} min)`);
          log(`🧭 NCAAF RE-ANCHORED: ${entry.matchup} — ${changed} remaining tier(s) now follow exact game id ${entry.gameId}`);
        }
      }
    } catch (error) {
      log(`⚠️ NCAAF kickoff refresh failed (non-fatal, next tick retries): ${error.message}`);
    } finally {
      checking = false;
    }
  }, NCAAF_KICKOFF_CHECK_INTERVAL_MS);
  activeNcaafKickoffTimer.unref?.();
  log(`🏈 NCAAF kickoff guard armed: re-checking up to ${NCAAF_KICKOFF_MAX_GAMES} exact pending id(s) every ${NCAAF_KICKOFF_CHECK_INTERVAL_MS / 60000} min`);
}

async function executeSchedule(schedule) {
  if (schedule.length === 0) {
    log('No games scheduled — nothing to run.');
    return;
  }
  await runIndependentScheduleLanes(schedule, async (laneSchedule, laneKey) => {
    await executeDecisionLaneSchedule(laneSchedule, {
      ownsMlbDriftGuard: laneOwnsMlbDriftGuard(laneKey, laneSchedule),
      ownsNcaafKickoffGuard: laneKey === 'americanfootball_ncaaf',
    });
  });
}

async function executeDecisionLaneSchedule(schedule, {
  ownsMlbDriftGuard = false,
  ownsNcaafKickoffGuard = false,
} = {}) {
  if (schedule.length === 0) {
    log('No games scheduled — nothing to run.');
    return;
  }
  // Keep the queue dynamic. The official MLB drift guard mutates the same Date
  // objects when a first pitch moves, so each loop re-sorts and forms the next
  // anchored 15-minute batch from current truth. A moved-later game no longer
  // burns all four retries against its stale morning start time.
  let pendingEntries = [...schedule];
  if (ownsMlbDriftGuard) await startMlbDriftGuard(() => pendingEntries);
  if (ownsNcaafKickoffGuard) startNcaafKickoffGuard(() => pendingEntries);
  log(`\n📦 Dynamic trigger queue armed for ${schedule.length} entries`);

  // Coverage tracking. A game is a confirmed MISS once its FINAL retry tier has
  // fired and no pick is stored. We check the instant that last tier completes —
  // not at end-of-day — so an early slate surfaces by late morning instead of
  // after the night's last MLB game. (log + rollup; no real-time push.)
  const uniqueGameIds = new Set(
    schedule.filter((entry) => !isSportFetchRetryEntry(entry)).map(scheduleEntryKey),
  );
  const missedGames = [];
  const gameOutcomeByGame = new Map();
  // Props-miss tracking: the child must emit a structured stored/pass outcome.
  // A later tier's accepted outcome clears an earlier technical failure.
  const propsFailedByGame = new Map(); // gameId -> last error message
  const propsOutcomeByGame = new Map(); // game key -> stored | pass
  const missedProps = [];
  const skippedStartedGames = new Set();
  const coverageCheckedGames = new Set();
  const deferredSlateRefreshDates = new Set();
  let holdWaitLogged = false;
  let gameAlreadyHasPick = null;
  let nflGameAlreadyHasPick = null;
  try { ({ gameAlreadyHasPick, nflGameAlreadyHasPick } = await import('../src/services/picksService.js')); }
  catch (e) { log(`⚠️ Coverage check disabled — picksService load failed: ${e.message}`); }

  while (pendingEntries.length > 0) {
    pendingEntries = pendingEntries.filter((entry) => !isScheduleEntryRetired(entry));
    if (pendingEntries.length === 0) break;
    const overdue = coalesceOverdueTiers(pendingEntries, Date.now());
    pendingEntries = overdue.entries;
    for (const entry of overdue.skipped) {
      const tierTag = entry.leadMin == null ? 'fixed retry' : `T-${entry.leadMin}`;
      log(`⏭️ SUPERSEDED WINDOW SKIPPED: ${entry.sport.label} ${entry.matchup} ${tierTag} — a newer tier remains (id ${entry.gameId})`);
    }

    let batch = nextTriggerBatch(pendingEntries, {
      now: Date.now(),
      crossLaneLookaheadMs: CROSS_LANE_TRIGGER_LOOKAHEAD_MS,
    });
    if (batch.length === 0) {
      if (!holdWaitLogged) {
        const heldGames = new Set(
          pendingEntries.filter(isScheduleEntryHeld).map(scheduleEntryKey),
        ).size;
        log(`⏸️ ${heldGames} interrupted MLB game(s) held without an assumed start; awaiting official resume/cancellation state`);
        holdWaitLogged = true;
      }
      await sleepUntilWallClock(new Date(Date.now() + 60_000));
      continue;
    }
    holdWaitLogged = false;
    const triggerTime = batch[0].triggerTime;
    const now = Date.now();
    const waitMs = triggerTime.getTime() - now;

    if (waitMs > 60000) { // More than 1 min away
      const waitMin = (waitMs / 1000 / 60).toFixed(0);
      const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
      log(`\n⏳ Next batch: ${batch.length} game(s) at ${triggerET} ET (${waitMin} min)`);
      log(`   Games: ${batch.map(e => e.matchup).join(', ')}`);
      await sleepUntilWallClock(triggerTime);
    }

    // A drift correction (or a lineup-post fire) may have re-ordered the
    // queue while we slept.
    queueWake = false;
    batch = nextTriggerBatch(pendingEntries, {
      now: Date.now(),
      crossLaneLookaheadMs: CROSS_LANE_TRIGGER_LOOKAHEAD_MS,
    });
    const batchSet = new Set(batch);
    pendingEntries = pendingEntries.filter((entry) => !batchSet.has(entry));

    // A partial provider outage lives in this same dynamic queue. Retry only
    // the failed sport, then inject its recovered game tiers without rebuilding
    // or duplicating healthy sports. Exponential retries continue while the ET
    // game day is current; incomplete FBS identity is retryable, never guessed.
    const fetchRetries = batch.filter(isSportFetchRetryEntry);
    batch = batch.filter((entry) => !isSportFetchRetryEntry(entry));
    for (const retry of fetchRetries) {
      if (!sportFetchRetryIsCurrent(retry, Date.now())) {
        log(`⏭️ ${retry.sport.label} fetch retry expired at the ET day boundary (${retry.dateStr})`);
        continue;
      }
      const exactScope = Array.isArray(retry.gameIds) && retry.gameIds.length > 0
        ? ` exact id(s) ${retry.gameIds.join(',')}`
        : ' slate';
      log(`🔁 ${retry.sport.label} isolated${exactScope} retry ${retry.attempt} for ${retry.dateStr}`);
      const result = await fetchGamesForETDate(retry.sport.key, retry.dateStr, {
        gameIds: retry.gameIds,
      });
      if (result === null) {
        const nextRetry = makeSportFetchRetryEntry({
          sport: retry.sport,
          dateStr: retry.dateStr,
          attempt: retry.attempt + 1,
          gameIds: retry.gameIds,
        });
        pendingEntries.push(nextRetry);
        const waitMin = Math.round((nextRetry.triggerTime.getTime() - Date.now()) / 60_000);
        log(`  ❌ ${retry.sport.label} still unavailable — next isolated retry in ${waitMin}m`);
        continue;
      }

      const { games, retryGameIds, retryAll } = result;
      if (retryAll || retryGameIds.length > 0) {
        const nextRetry = makeSportFetchRetryEntry({
          sport: retry.sport,
          dateStr: retry.dateStr,
          attempt: retry.attempt + 1,
          gameIds: retryAll ? [] : retryGameIds,
        });
        pendingEntries.push(nextRetry);
        const waitMin = Math.round((nextRetry.triggerTime.getTime() - Date.now()) / 60_000);
        const scope = retryAll ? 'unresolved slate' : `${retryGameIds.length} exact id(s)`;
        log(`  ⏳ ${retry.sport.label}: ${scope} still pending — next isolated retry in ${waitMin}m`);
      }

      const upcomingGames = games.filter(({ startTime }) => startTime.getTime() > Date.now());
      const candidates = scheduleGamesForSport(retry.sport, upcomingGames, retry.dateStr);
      const recovered = newScheduleEntries(schedule, candidates);
      pendingEntries.push(...recovered);
      schedule.push(...recovered);
      for (const entry of recovered) uniqueGameIds.add(scheduleEntryKey(entry));
      if (ownsMlbDriftGuard && retry.sport.key === 'baseball_mlb' && recovered.length > 0) {
        await startMlbDriftGuard(() => pendingEntries);
      }
      if (ownsNcaafKickoffGuard && recovered.length > 0) {
        startNcaafKickoffGuard(() => pendingEntries);
      }
      log(`  ✅ ${retry.sport.label} recovered: ${upcomingGames.length} upcoming game(s), ${recovered.length} trigger tier(s) inserted`);
      if (candidates.length > recovered.length) {
        log(`  ⏭️ ${retry.sport.label}: ${candidates.length - recovered.length} duplicate game tier(s) already existed and were not reinserted`);
      }
      if (games.length > upcomingGames.length) {
        log(`  ⏭️ ${retry.sport.label}: ${games.length - upcomingGames.length} already-started game(s) were not backfilled`);
      }
      if (!hasUrgentUpcomingTrigger(recovered, Date.now())) {
        await writeDailySlateNonFatal(retry.dateStr);
      } else {
        deferredSlateRefreshDates.add(retry.dateStr);
        log(`  ⏩ ${retry.sport.label} recovered inside a live pick window — slate refresh deferred so the pick runs first`);
      }
    }

    if (batch.length === 0) continue;

    // Laptop wake/catch-up safety: never replay a betting task after the game
    // has started. This applies equally to game picks and props.
    const coverageBatch = batch;
    const { runnable: runnableBatch, stale } = partitionStartedEntries(batch, Date.now());
    for (const entry of stale) {
      const key = scheduleEntryKey(entry);
      if (!skippedStartedGames.has(key)) {
        skippedStartedGames.add(key);
        log(`⏭️ STALE WINDOW SKIPPED: ${entry.sport.label} ${entry.matchup} already started — no game pick or props will run (id ${entry.gameId})`);
      }
    }
    batch = runnableBatch;

    log(`\n🔔 Trigger window: ${batch.length} runnable game(s), ${stale.length} stale skip(s)`);

    // A pending clock from another lane can be ignored by child budgets only
    // while that lane is genuinely enrolled in this batch. Lanes remove
    // themselves after their complete game+props work finishes.
    const activeBatchLaneKeys = new Set(batch.map(decisionLaneKey));

    // Group this batch by sport so we run game picks for the same sport together
    // (better for disk cache — all NHL picks, then all NHL props)
    const bySport = new Map();
    for (const entry of batch) {
      const key = entry.sport.key;
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key).push(entry);
    }

    // Process sports by SPORT_RUN_PRIORITY. NFL writes through its atomic
    // weekly ledger; NCAAF and the shared daily lane write through the atomic
    // daily ledger. That lets the two football slates use bounded research
    // pools without losing a concurrently completed MLB/NBA decision.
    const orderedSports = [...bySport.entries()].sort(
      (a, b) => (SPORT_RUN_PRIORITY[a[0]] ?? 99) - (SPORT_RUN_PRIORITY[b[0]] ?? 99)
    );
    // The three decision lanes start together. Inside each lane, game calls
    // lead props; there is deliberately no cross-lane barrier. A long shared
    // MLB/NBA decision therefore cannot delay NFL/NCAAF props, and a football
    // props run cannot delay the shared lane's next game decision.
    const runGameDecision = async (entry) => {
      const sport = entry.sport;
      // Never fire a tier before its own clock — a retry that runs early
      // hits the closed lineup gate, stores nothing, and is spent. (Catch-up
      // after a long prior run is the normal case: past-due entries don't wait.)
      if (entry.triggerTime.getTime() > Date.now()) {
        await sleepUntilWallClock(entry.triggerTime);
      }
      if (gameHasStarted(entry, Date.now())) {
        const key = scheduleEntryKey(entry);
        skippedStartedGames.add(key);
        log(`  ⏭️ Game-pick window expired while earlier work ran: ${entry.sport.label} ${entry.matchup} (id ${entry.gameId})`);
        return;
      }
      const tierWord = entry.tier > 1 ? 'retry' : 'primary';
      const tierTag = entry.leadMin == null ? ` [${tierWord}, fixed 10AM]` : ` [${tierWord} T-${entry.leadMin}]`;
      try {
        log(`  📊 Game picks: ${entry.matchup}${tierTag} (id ${entry.gameId})`);
        const childBudget = childExecutionBudget({
          entry,
          pendingEntries: pendingEntriesForChildBudget(entry, pendingEntries, activeBatchLaneKeys),
          maxRuntimeMs: CHILD_MAX_RUNTIME_MS,
          safetyBufferMs: CHILD_DEADLINE_SAFETY_MS,
        });
        // Exact BDL id only — never a matchup substring (doubleheader-safe).
        const output = await runScript(
          'scripts/run-agentic-picks.js',
          schedulerChildArgs(entry, [sport.flag, '--game-id', String(entry.gameId)]),
          childBudget,
        );
        const outcome = parsePickRunOutcome(output);
        const targetStored = outcome?.status === 'stored'
          && outcome?.game_ids?.map(String).includes(String(entry.gameId));
        if (!targetStored) {
          throw new Error(`Game-pick runner returned no verified stored outcome for game ${entry.gameId}`);
        }
        gameOutcomeByGame.set(scheduleEntryKey(entry), 'stored');
        log(`  🧾 Game-pick outcome: stored for ${entry.matchup}`);
      } catch (e) {
        log(`  ❌ Game picks failed: ${entry.matchup}${tierTag}: ${e.message}`);
      }
    };

    const nflGames = bySport.get('americanfootball_nfl') || [];

    const ncaafGames = bySport.get('americanfootball_ncaaf') || [];

    // Shared MLB/NBA lane: the same per-game pipeline the football lanes use —
    // each worker finishes one game's pick, then that same game's props, so a
    // fat cluster's props stop expiring behind the full pick sweep. Batches
    // arrive trigger-sorted from nextTriggerBatch (≈ deadline order within a
    // tier), and clusterConcurrency stays at ONE worker on a normal night.
    const runSharedDailyDecisionLane = async () => {
      for (const [sportKey, games] of orderedSports) {
        if (sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf') continue;
        const sport = games[0].sport;
        const workers = clusterConcurrency(games.length, {
          maxWorkers: SHARED_LANE_MAX_CONCURRENCY,
          targetGamesPerWorker: SHARED_LANE_TARGET_GAMES_PER_WORKER,
        });
        log(`\n── ${sport.label}: ${games.length} per-game decision pipeline(s), ${workers} bounded worker(s), atomic daily-ledger writes ──`);
        await runPerGameDecisionPipeline({
          entries: games,
          concurrency: workers,
          runGame: runGameDecision,
          runProps: runPropDecision,
        });
      }
    };

    // Each sport lane keeps its own game-before-props ordering. Football props
    // no longer wait for an unrelated slow MLB/NBA game decision: NFL, NCAAF,
    // and the shared daily-ledger lane advance independently, while every
    // writer still uses its atomic sport/date storage path.
    const runPropDecision = async (entry) => {
      const sport = entry.sport;
      if (!sport.propsScript) return;
      // Same early-fire guard as game picks above.
      if (entry.triggerTime.getTime() > Date.now()) {
        await sleepUntilWallClock(entry.triggerTime);
      }
      const gameKey = scheduleEntryKey(entry);
      if (gameHasStarted(entry, Date.now())) {
        skippedStartedGames.add(gameKey);
        log(`  ⏭️ Props window expired while earlier work ran: ${entry.sport.label} ${entry.matchup} (id ${entry.gameId})`);
        return;
      }
      const tierWord = entry.tier > 1 ? 'retry' : 'primary';
      const tierTag = entry.leadMin == null ? ` [${tierWord}, fixed 10AM]` : ` [${tierWord} T-${entry.leadMin}]`;
      try {
        log(`  🎯 Props: ${entry.matchup}${tierTag} (id ${entry.gameId})`);
        const childBudget = childExecutionBudget({
          entry,
          pendingEntries: pendingEntriesForChildBudget(entry, pendingEntries, activeBatchLaneKeys),
          maxRuntimeMs: CHILD_MAX_RUNTIME_MS,
          safetyBufferMs: CHILD_DEADLINE_SAFETY_MS,
        });
        const output = await runScript(
          `scripts/${sport.propsScript}`,
          schedulerChildArgs(entry, ['--game-id', String(entry.gameId)]),
          childBudget,
        );
        const outcome = parsePropRunOutcome(output);
        const targetCovered = outcome?.game_ids?.map(String).includes(String(entry.gameId));
        if (!outcome || !['stored', 'pass'].includes(outcome.status) || !targetCovered) {
          throw new Error(`Props runner returned no accepted stored/pass outcome for game ${entry.gameId}`);
        }
        propsOutcomeByGame.set(gameKey, outcome.status);
        propsFailedByGame.delete(gameKey);
        log(`  🧾 Props outcome: ${outcome.status} for ${entry.matchup} (${outcome.pick_count || 0} pick(s))`);
      } catch (e) {
        log(`  ❌ Props failed: ${entry.matchup}${tierTag}: ${e.message}`);
        propsFailedByGame.set(gameKey, e.message);
      }
    };

    const runNFLDecisionLane = async () => {
      if (nflGames.length === 0) return;
      const workers = Math.min(NFL_GAME_DECISION_CONCURRENCY, nflGames.length);
      log(`\n── NFL: ${nflGames.length} per-game decision pipeline(s), ${workers} bounded worker(s) ──`);
      await runPerGameDecisionPipeline({
        entries: nflGames,
        concurrency: NFL_GAME_DECISION_CONCURRENCY,
        runGame: runGameDecision,
        runProps: runPropDecision,
      });
    };

    const runNCAAFDecisionLane = async () => {
      if (ncaafGames.length === 0) return;
      const workers = clusterConcurrency(ncaafGames.length, {
        minWorkers: NCAAF_CLUSTER_MIN_CONCURRENCY,
        maxWorkers: NCAAF_CLUSTER_MAX_CONCURRENCY,
        targetGamesPerWorker: NCAAF_TARGET_GAMES_PER_WORKER,
      });
      log(`\n── NCAAF: ${ncaafGames.length} per-game decision pipeline(s), ${workers} bounded worker(s) ──`);
      await runPerGameDecisionPipeline({
        entries: ncaafGames,
        concurrency: workers,
        runGame: runGameDecision,
        runProps: runPropDecision,
      });
    };

    const trackedLane = (laneKey, lane) => ({
      runGames: async () => {
        try {
          await lane.runGames();
        } catch (error) {
          activeBatchLaneKeys.delete(laneKey);
          throw error;
        }
      },
      runProps: async () => {
        try {
          await lane.runProps();
        } finally {
          activeBatchLaneKeys.delete(laneKey);
        }
      },
    });

    await runIndependentDecisionLanes([
      trackedLane('americanfootball_nfl', {
        // The three-worker NFL cap applies to the entire exact-game pipeline:
        // game decision first, then that same game's props/TD decision.
        runGames: runNFLDecisionLane,
        runProps: async () => {},
      }),
      trackedLane('americanfootball_ncaaf', {
        // One college worker completes the exact game's decision before
        // starting that same game's props. There is no full-slate barrier, so
        // an early-completing game is not held behind dozens of peers sharing
        // its kickoff cluster.
        runGames: runNCAAFDecisionLane,
        runProps: async () => {},
      }),
      trackedLane('shared', {
        // Per-game pipeline: each bounded worker runs the exact game's pick,
        // then that game's props, before taking the next game.
        runGames: runSharedDailyDecisionLane,
        runProps: async () => {},
      }),
    ]);

    // Coverage: any game in this window whose FINAL tier just fired with no
    // stored pick is a confirmed miss — flag it now (picks store synchronously
    // during runScript above, so the DB read here is accurate). Checked once per
    // game (only at its last tier), so no duplicate warnings.
    for (const entry of coverageBatch) {
      if (!isFinalPendingTier(entry, pendingEntries)) continue;
      const gameKey = scheduleEntryKey(entry);
      if (coverageCheckedGames.has(gameKey)) continue;
      coverageCheckedGames.add(gameKey);
      if (typeof gameAlreadyHasPick === 'function') {
        const etDate = entry.sport.key === 'americanfootball_ncaaf'
          ? entry.slateDate
          : entry.startTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        try {
          const res = entry.sport.label === 'NFL' && typeof nflGameAlreadyHasPick === 'function'
            ? await nflGameAlreadyHasPick(entry.homeTeam, entry.awayTeam, entry.startTime, entry.gameId)
            : await gameAlreadyHasPick(entry.sport.label, entry.homeTeam, entry.awayTeam, etDate, entry.gameId);
          if (!res?.exists) {
            missedGames.push(entry);
            log(`⚠️ MISSED PICK: ${entry.sport.label} ${entry.matchup} — 0 stored after all retry tiers (id ${entry.gameId})`);
          }
        } catch (e) {
          log(`⚠️ Coverage check failed for ${entry.sport.label} ${entry.matchup}: ${e.message}`);
        }
      }
      // Props coverage does not depend on the picksService helper loading.
      // The child outcome is already held in memory, so keep this warning live
      // even if the later database coverage import is unavailable.
      if (entry.sport.propsScript && !propsOutcomeByGame.has(gameKey)) {
        missedProps.push(entry);
        const reason = propsFailedByGame.get(gameKey) || 'no stored/pass outcome';
        log(`⚠️ MISSED PROPS: ${entry.sport.label} ${entry.matchup} — no accepted stored/pass outcome after all retry tiers (id ${entry.gameId}): ${reason}`);
      }
    }

    if (deferredSlateRefreshDates.size > 0 && !hasUrgentUpcomingTrigger(pendingEntries, Date.now())) {
      for (const dateStr of deferredSlateRefreshDates) {
        await writeDailySlateNonFatal(dateStr);
        deferredSlateRefreshDates.delete(dateStr);
      }
    }
  }

  // A long final decision can cross every later trigger. Do not leave a
  // successfully recovered sport absent from the public slate in that case.
  for (const dateStr of deferredSlateRefreshDates) await writeDailySlateNonFatal(dateStr);

  if (ownsMlbDriftGuard && activeDriftTimer) {
    clearInterval(activeDriftTimer);
    activeDriftTimer = null;
  }
  if (ownsNcaafKickoffGuard && activeNcaafKickoffTimer) {
    clearInterval(activeNcaafKickoffTimer);
    activeNcaafKickoffTimer = null;
  }

  log('\n🏁 All games complete for today.');

  // End-of-day rollup from the per-game checks logged above (the Jun 5/8/10 NBA
  // outages were all silent — this makes a dead slate announce itself).
  const covered = uniqueGameIds.size - missedGames.length;
  if (missedGames.length === 0) {
    log(`📊 Daily pick coverage: ${covered}/${uniqueGameIds.size} games covered — no misses ✅`);
  } else {
    log(`📊 Daily pick coverage: ${covered}/${uniqueGameIds.size} covered — ${missedGames.length} MISSED: ${missedGames.map(g => `${g.sport.label} ${g.matchup}`).join(' | ')}`);
  }
  if (missedProps.length === 0) {
    log(`📊 Daily props coverage: every props game produced a verified stored/pass outcome ✅`);
  } else {
    log(`📊 Daily props coverage: ${missedProps.length} game(s) ended without a verified stored/pass outcome: ${missedProps.map(g => `${g.sport.label} ${g.matchup}`).join(' | ')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function runBounded(items, concurrency, worker) {
  if (!Array.isArray(items) || items.length === 0) return;
  const workerCount = Math.max(1, Math.min(Math.trunc(concurrency) || 1, items.length));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      // JavaScript runs this read/increment synchronously before the await, so
      // each worker receives one distinct item without another coordination
      // primitive.
      const item = items[nextIndex++];
      await worker(item);
    }
  }));
}

function getTodayETDateStr() {
  return getETDateStr(new Date());
}

function getTomorrowETDateStr() {
  return addDaysISO(getTodayETDateStr(), 1);
}

// Returns the UTC instant for "12:05 AM ET on `etDateStr`". DST-safe: we use
// formatToParts to read what UTC offset ET has at that civil time, then build
// the instant from the parts.
function instantForETDate(etDateStr, hourET, minuteET) {
  // Start with a candidate UTC instant assuming ET is UTC-5, then correct.
  let candidate = new Date(`${etDateStr}T${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}:00Z`);
  // Loop twice to settle DST boundaries (one correction is enough except at
  // the spring-forward instant; two is bulletproof).
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(candidate);
    const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const civilET = `${obj.year}-${obj.month}-${obj.day}T${obj.hour === '24' ? '00' : obj.hour}:${obj.minute}:${obj.second}`;
    const targetCivil = `${etDateStr}T${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}:00`;
    const driftMs = new Date(targetCivil + 'Z').getTime() - new Date(civilET + 'Z').getTime();
    if (driftMs === 0) break;
    candidate = new Date(candidate.getTime() + driftMs);
  }
  return candidate;
}

// Sleep until a wall-clock target, polling every 60s so laptop sleep can't
// kill a multi-hour setTimeout. The next 60s tick fires the moment macOS
// resumes the process — naturally self-recovering after sleep.
async function sleepUntilWallClock(targetDate) {
  while (Date.now() < targetDate.getTime()) {
    // A lineup-post fire (Sep 3 2026) pulls a trigger earlier while the loop
    // sleeps toward a later one; the loop re-plans the batch on every wake.
    if (queueWake) return;
    const remaining = targetDate.getTime() - Date.now();
    await new Promise(r => setTimeout(r, Math.min(60_000, remaining)));
  }
}

async function sleepUntilPlanTime() {
  // Build each day's plan at 5:00 AM ET — early enough that no game trigger
  // is missed (earliest MLB triggers are ~10:30 AM ET for 12 PM games).
  const todayET = getTodayETDateStr();
  let target = instantForETDate(todayET, 5, 0); // 5:00 AM ET today
  // If 5 AM today has already passed, aim for 5 AM tomorrow
  if (target.getTime() <= Date.now()) {
    const tomorrowET = getTomorrowETDateStr();
    target = instantForETDate(tomorrowET, 5, 0);
  }
  const waitMs = Math.max(target.getTime() - Date.now(), 60_000);
  const waitHrs = (waitMs / 1000 / 60 / 60).toFixed(2);
  log(`\n💤 Sleeping ${waitHrs} hours until 5:00 AM ET (${target.toISOString()})`);
  await sleepUntilWallClock(target);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  startHeartbeat();
  startClosingCapture();
  const args = process.argv.slice(2);

  if (args.includes('--now')) {
    log('🚀 Running all sports NOW');
    const schedule = await addActiveNcaafRecovery(
      (await buildPlan(getTodayETDateStr())).schedule,
    );
    for (const entry of schedule) entry.triggerTime = new Date();
    await executeSchedule(schedule);
    return;
  }

  if (args.includes('--plan')) {
    const dateStr = args.includes('--today') ? getTodayETDateStr() : getTomorrowETDateStr();
    const { schedule } = await buildPlan(dateStr);
    if (args.includes('--today')) await addActiveNcaafRecovery(schedule);
    return;
  }

  // 24/7 scheduler
  log('═══════════════════════════════════════════════════════════');
  log('🐻 GARY AUTO-SCHEDULER STARTED (per-game mode)');
  log('═══════════════════════════════════════════════════════════');
  // Node caches modules at boot, so a long-running scheduler keeps executing the
  // code it started with — a stale process silently defeats every later fix. Log
  // the commit it's actually running so drift is visible at a glance in the logs.
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: PROJECT_DIR }).toString().trim() ? ' (+uncommitted changes)' : '';
    log(`🔖 Running commit: ${sha}${dirty} — restart the scheduler after pulling/committing to pick up code changes`);
  } catch { log('🔖 Running commit: (unavailable — not a git checkout)'); }
  // ERA LIVE — the folder this daemon launches picks from, and the prompt eras
  // a fresh run from it will stamp. Jul 29 – Aug 12 2026 the daemon ran a
  // SECOND clone of the repo and two weeks of shipped work never picked; this
  // line makes "which code is production" a matter of reading the log.
  try {
    const { diskEras } = await import('./lib/eraTruth.js');
    const eras = diskEras();
    log(`🧬 ERA LIVE: game ${eras.game} · props ${eras.props} @ ${PROJECT_DIR}`);
  } catch (e) { log(`🧬 ERA LIVE: (unavailable — ${e.message})`); }
  log(`Lead time: ${LEAD_TIME_MINUTES} min before each game`);
  log(`Sports: ${SPORTS.map(s => s.label).join(', ')}`);

  // Check today first
  const todaySchedule = await buildCurrentPlanResilient(getTodayETDateStr());
  // Filter by GAME start time, not trigger time — if the game itself hasn't started, run picks
  // even if the 90-min lead window has already passed (picks just trigger immediately).
  const upcoming = todaySchedule.filter(e => isSportFetchRetryEntry(e) || e.startTime > new Date());
  if (upcoming.length > 0) {
    log(`\n⚡ ${upcoming.length} game(s) still upcoming today — running`);
    await executeSchedule(upcoming);
  } else {
    log('No upcoming games today.');
  }

  // Main loop — after each day's games complete, check if we've crossed into
  // a new day (late West Coast games can finish at 1-3 AM ET). If so, build
  // today's plan immediately instead of sleeping through it.
  while (true) {
    // HIBERNATION GUARD: if the previous execution crossed a day boundary in
    // its sleep (dead battery, lid closed overnight), today's plan was never
    // built — build and run it NOW instead of sleeping to the next 5 AM.
    const wakeDate = getTodayETDateStr();
    if (lastPlannedDate !== null && wakeDate !== lastPlannedDate) {
      log(`\n⚡ ${wakeDate} was never planned (execution slept across the day boundary) — building it now`);
      const recovered = await buildCurrentPlanResilient(wakeDate);
      const stillUpcoming = recovered.filter(e => isSportFetchRetryEntry(e) || e.startTime > new Date());
      if (stillUpcoming.length > 0) {
        log(`⚡ ${stillUpcoming.length} game(s) still upcoming today — running`);
        await executeSchedule(stillUpcoming);
      } else {
        log('No upcoming games remain today.');
      }
      continue; // re-check: tonight's run may itself cross midnight
    }

    const planDateBefore = getTodayETDateStr();
    await sleepUntilPlanTime();
    const schedule = await buildCurrentPlanResilient(getTodayETDateStr());
    await executeSchedule(schedule);

    // If execution ran past midnight into a new ET day, immediately build
    // and run that day's plan instead of sleeping past it.
    let currentDate = getTodayETDateStr();
    while (currentDate !== planDateBefore && currentDate !== getTomorrowETDateStr()) {
      log(`\n⚡ Execution spanned into ${currentDate} — building today's plan immediately`);
      const todaySchedule = await buildCurrentPlanResilient(currentDate);
      // Filter by GAME start time, not trigger time — if the game itself hasn't started, run picks
  // even if the 90-min lead window has already passed (picks just trigger immediately).
  const upcoming = todaySchedule.filter(e => isSportFetchRetryEntry(e) || e.startTime > new Date());
      if (upcoming.length > 0) {
        log(`⚡ ${upcoming.length} game(s) still upcoming — running`);
        await executeSchedule(upcoming);
      } else {
        log('No upcoming games for today.');
      }
      currentDate = getTodayETDateStr();
      // If we're still on the same date after execution, break to normal sleep
      break;
    }
  }
}

// Supervise main()'s loop. A transient network error (DNS not ready after wake,
// a BDL/Supabase blip) should NOT end the scheduler — restart its loop in-process
// after a short backoff so it self-heals without waiting on the watchdog. Only a
// genuine non-transient fault exits(1), and the watchdog then restarts a fresh
// process. This is the fix for Jun 21 2026, when a single `getaddrinfo ENOTFOUND`
// killed the scheduler for the whole morning and zeroed the day's picks.
async function supervise() {
  for (let attempt = 1; ; attempt++) {
    try {
      await main();
      log('Scheduler main() returned — exiting cleanly.');
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      if (TRANSIENT_NET.test(msg)) {
        const waitMs = Math.min(15000 * attempt, 60000);
        log(`⚠️ Transient network error — restarting the scheduler loop in ${Math.round(waitMs / 1000)}s (NOT exiting; common right after a wake): ${msg}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      log(`💀 Scheduler crashed (non-transient): ${msg} — exiting(1) for a clean watchdog restart`);
      console.error(e);
      process.exit(1);
    }
  }
}
supervise();
