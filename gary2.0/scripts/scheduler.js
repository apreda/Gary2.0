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
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import {
  childExecutionBudget,
  coalesceOverdueTiers,
  decisionLaneKey,
  gameHasStarted,
  hasUrgentUpcomingTrigger,
  isFinalPendingTier,
  isSportFetchRetryEntry,
  makeSportFetchRetryEntry,
  ncaafClusterConcurrency,
  nextTriggerBatch,
  laneOwnsMlbDriftGuard,
  pendingEntriesForChildBudget,
  partitionStartedEntries,
  reanchorGameSchedule,
  runIndependentDecisionLanes,
  runIndependentScheduleLanes,
  runPerGameDecisionPipeline,
  scheduleEntryKey,
} from './lib/schedulerPolicy.js';
import { parsePropRunOutcome } from './lib/propsRunReliability.js';
import { parsePickRunOutcome } from './lib/pickRunReliability.js';
import { classifyNcaafFbsGames, resolveNcaafKickoff } from '../src/services/ncaafGamePolicy.js';

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

const SPORTS = [
  { key: 'americanfootball_nfl', flag: '--nfl', label: 'NFL', propsScript: 'run-agentic-nfl-props.js' },
  // Live college props come from The Odds API and are BDL roster/stat
  // validated. A missing/deactivated server key fails this lane loudly; it
  // never manufactures a market from stats.
  { key: 'americanfootball_ncaaf', flag: '--ncaaf', label: 'NCAAF', propsScript: 'run-agentic-ncaaf-props.js' },
  { key: 'basketball_nba', flag: '--nba', label: 'NBA', propsScript: 'run-agentic-nba-props.js' },
  // NHL PARKED (Jul 13 2026): the BDL NHL tier lapsed, so every fetch 401s. That
  // permanent failure set fetchFailed=true on every daily build, which on the
  // all-sports-dark All-Star break made buildPlanResilient treat a legitimate
  // 0-game day as a fetch outage — it retried for 90 minutes and never published
  // the (empty) daily slate or tomorrow board, so the app showed a blank void
  // instead of an honest dark day. No NHL games until October; restore this entry
  // with the BDL All-Access decision.
  // { key: 'icehockey_nhl', flag: '--nhl', label: 'NHL', propsScript: 'run-agentic-nhl-props.js' },
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
const NCAAF_CLUSTER_MAX_CONCURRENCY = 12;
const NCAAF_TARGET_GAMES_PER_WORKER = 4;

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
  if (sportKey === 'americanfootball_nfl') return game.date;
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
async function fetchGamesForETDate(sportKey, etDateStr) {
  const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
  const dates = [etDateStr, addDaysISO(etDateStr, 1)];
  const params = { dates, per_page: 100 };
  // BDL's NFL games endpoint defaults away from preseason. August would then
  // look like a dark league even while real games are on the board.
  if (sportKey === 'americanfootball_nfl') params.season_type = [1, 2, 3];
  let games;
  try {
    games = await ballDontLieService.getGames(sportKey, params);
  } catch (e) {
    log(`  ❌ ${sportKey}: BDL fetch failed for ${dates.join(',')}: ${e.message}`);
    return null; // null = fetch FAILED (retryable); [] = genuinely no games
  }
  if (!Array.isArray(games)) return [];

  if (sportKey === 'americanfootball_ncaaf' && games.length > 0) {
    let classified = classifyNcaafFbsGames(games);
    if (classified.unresolved.length > 0) {
      const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
      classified = classifyNcaafFbsGames(games, teams);
    }
    if (classified.unresolved.length > 0) {
      log(`  ❌ ${sportKey}: ${classified.unresolved.length} game(s) lack provider-grounded FBS identity — retrying the sport instead of publishing a partial slate`);
      return null;
    }
    if (classified.rejected.length > 0) {
      log(`  ⏭️ ${sportKey}: excluded ${classified.rejected.length} non-FBS matchup(s)`);
    }
    games = classified.accepted;
  }

  const filtered = [];
  for (const g of games) {
    const ncaafKickoff = sportKey === 'americanfootball_ncaaf'
      ? resolveNcaafKickoff(g)
      : null;
    const startIso = ncaafKickoff?.iso ?? extractStartTimeIso(g, sportKey);
    if (!startIso) {
      log(`  ⚠️ ${sportKey} game ${g.id}: missing start time field — skipping`);
      continue;
    }
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) {
      log(`  ⚠️ ${sportKey} game ${g.id}: unparseable start time "${startIso}" — skipping`);
      continue;
    }
    if (getETDateStr(start) !== etDateStr) continue;
    // Date-only NCAAF values are safe for a public-slate placeholder but not
    // for execution. Never build T-90/T-60/T-30/T-15 jobs from the explicit
    // 3 PM display estimate. `null` routes this sport through the existing
    // isolated retry queue while healthy sports keep their own schedules.
    if (ncaafKickoff?.estimated) {
      log(`  ❌ ${sportKey} game ${g.id}: exact kickoff not posted — retrying NCAAF instead of scheduling from the display estimate`);
      return null;
    }
    filtered.push({ raw: g, startTime: start });
  }
  // Dedupe in case a game appears in both UTC date queries (rare but possible)
  const seen = new Set();
  return filtered.filter(({ raw }) => {
    if (seen.has(raw.id)) return false;
    seen.add(raw.id);
    return true;
  });
}

function scheduleGamesForSport(sport, games, etDateStr, { logGames = true } = {}) {
  const entries = [];
  for (const { raw: game, startTime } of games) {
    const homeTeam = game.home_team?.full_name || game.home_team?.name || 'Home';
    const awayTeam = game.visitor_team?.full_name || game.away_team?.full_name || game.visitor_team?.name || game.away_team?.name || 'Away';
    const matchup = `${awayTeam} @ ${homeTeam}`;
    const startET = startTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
    const tierLabels = [];

    if (sport.fixedTriggerET) {
      const base = instantForETDate(etDateStr, sport.fixedTriggerET.hour, sport.fixedTriggerET.minute);
      const latest = new Date(startTime.getTime() - 15 * 60 * 1000);
      for (let i = 0; i < FIXED_TRIGGER_RETRY_OFFSETS_MINUTES.length; i++) {
        let triggerTime = new Date(base.getTime() + FIXED_TRIGGER_RETRY_OFFSETS_MINUTES[i] * 60 * 1000);
        if (triggerTime > latest) {
          if (i === 0) triggerTime = latest;
          else continue;
        }
        entries.push({ sport, matchup, homeTeam, awayTeam, startTime, triggerTime, gameId: game.id, tier: i + 1, leadMin: null });
        const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
        tierLabels.push(`fixed=${triggerET}`);
      }
    } else {
      for (let i = 0; i < RETRY_LEAD_TIMES_MINUTES.length; i++) {
        const leadMin = RETRY_LEAD_TIMES_MINUTES[i];
        const triggerTime = new Date(startTime.getTime() - leadMin * 60 * 1000);
        entries.push({ sport, matchup, homeTeam, awayTeam, startTime, triggerTime, gameId: game.id, tier: i + 1, leadMin });
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
    const games = await fetchGamesForETDate(sport.key, etDateStr);
    if (games === null) {
      const retry = makeSportFetchRetryEntry({ sport, dateStr: etDateStr, attempt: 1 });
      schedule.push(retry);
      log(`  ${sport.label}: fetch FAILED — queued an isolated retry in 1m; healthy sports continue`);
      fetchFailed = true;
      continue;
    }
    if (games.length === 0) {
      log(`  ${sport.label}: No games`);
      continue;
    }

    log(`  ${sport.label}: ${games.length} games`);

    schedule.push(...scheduleGamesForSport(sport, games, etDateStr));
  }

  schedule.sort((a, b) => a.triggerTime - b.triggerTime);
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
  } catch (e) {
    log(`⚠️ Daily slate write failed (non-fatal, picks unaffected): ${e.message}`);
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
  } catch (e) {
    log(`⚠️ Tomorrow board write failed (non-fatal): ${e.message}`);
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
      games.push({ home: g.teams?.home?.team?.name || '', away: g.teams?.away?.team?.name || '', start });
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

function startMlbDriftGuard(schedule) {
  if (activeDriftTimer) { clearInterval(activeDriftTimer); activeDriftTimer = null; }
  const mlbPrimaries = schedule.filter((e) => e.sport.key === 'baseball_mlb' && e.tier === 1);
  if (mlbPrimaries.length === 0) return;
  let checking = false;
  const fmtET = (d) => d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

  activeDriftTimer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const now = Date.now();
      const pending = mlbPrimaries.filter((e) => e.startTime.getTime() > now - 60 * 60 * 1000);
      if (pending.length === 0) return;
      const official = await fetchOfficialMlbStarts(getTodayETDateStr());
      for (const entry of pending) {
        const match = matchOfficialGame(official, entry);
        if (!match) continue;
        const deltaMs = match.start.getTime() - entry.startTime.getTime();
        if (Math.abs(deltaMs) < DRIFT_MIN_DELTA_MS) continue;
        log(`🕐 START-TIME DRIFT: ${entry.matchup} — planned ${fmtET(entry.startTime)} ET, official now ${fmtET(match.start)} ET (${Math.round(deltaMs / 60000)} min)`);
        const changed = reanchorGameSchedule(schedule, entry, match.start);
        log(`🧭 DRIFT RE-ANCHORED: ${entry.matchup} — ${changed} unfired tier(s) now follow the official ${fmtET(match.start)} ET start (id ${entry.gameId})`);
      }
    } catch (e) {
      log(`⚠️ Drift guard check failed (non-fatal, next tick retries): ${e.message}`);
    } finally {
      checking = false;
    }
  }, DRIFT_CHECK_INTERVAL_MS);
  log(`🕐 Drift guard armed: re-checking ${mlbPrimaries.length} MLB start time(s) vs statsapi every ${DRIFT_CHECK_INTERVAL_MS / 60000} min`);
}

async function executeSchedule(schedule) {
  if (schedule.length === 0) {
    log('No games scheduled — nothing to run.');
    return;
  }
  await runIndependentScheduleLanes(schedule, async (laneSchedule, laneKey) => {
    await executeDecisionLaneSchedule(laneSchedule, {
      ownsMlbDriftGuard: laneOwnsMlbDriftGuard(laneKey, laneSchedule),
    });
  });
}

async function executeDecisionLaneSchedule(schedule, { ownsMlbDriftGuard = false } = {}) {
  if (schedule.length === 0) {
    log('No games scheduled — nothing to run.');
    return;
  }
  if (ownsMlbDriftGuard) startMlbDriftGuard(schedule);

  // Keep the queue dynamic. The official MLB drift guard mutates the same Date
  // objects when a first pitch moves, so each loop re-sorts and forms the next
  // anchored 15-minute batch from current truth. A moved-later game no longer
  // burns all four retries against its stale morning start time.
  let pendingEntries = [...schedule];
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
  let gameAlreadyHasPick = null;
  let nflGameAlreadyHasPick = null;
  try { ({ gameAlreadyHasPick, nflGameAlreadyHasPick } = await import('../src/services/picksService.js')); }
  catch (e) { log(`⚠️ Coverage check disabled — picksService load failed: ${e.message}`); }

  while (pendingEntries.length > 0) {
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

    // A drift correction may have re-ordered the queue while we slept.
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
      if (getTodayETDateStr() !== retry.dateStr) {
        log(`⏭️ ${retry.sport.label} fetch retry expired at the ET day boundary (${retry.dateStr})`);
        continue;
      }
      log(`🔁 ${retry.sport.label} isolated slate retry ${retry.attempt} for ${retry.dateStr}`);
      const games = await fetchGamesForETDate(retry.sport.key, retry.dateStr);
      if (games === null) {
        const nextRetry = makeSportFetchRetryEntry({
          sport: retry.sport,
          dateStr: retry.dateStr,
          attempt: retry.attempt + 1,
        });
        pendingEntries.push(nextRetry);
        const waitMin = Math.round((nextRetry.triggerTime.getTime() - Date.now()) / 60_000);
        log(`  ❌ ${retry.sport.label} still unavailable — next isolated retry in ${waitMin}m`);
        continue;
      }

      const upcomingGames = games.filter(({ startTime }) => startTime.getTime() > Date.now());
      const recovered = scheduleGamesForSport(retry.sport, upcomingGames, retry.dateStr);
      pendingEntries.push(...recovered);
      schedule.push(...recovered);
      for (const entry of recovered) uniqueGameIds.add(scheduleEntryKey(entry));
      if (ownsMlbDriftGuard && retry.sport.key === 'baseball_mlb' && recovered.length > 0) {
        startMlbDriftGuard(schedule);
      }
      log(`  ✅ ${retry.sport.label} recovered: ${upcomingGames.length} upcoming game(s), ${recovered.length} trigger tier(s) inserted`);
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
          [sport.flag, '--game-id', String(entry.gameId)],
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

    const runSharedDailyGameLane = async () => {
      for (const [sportKey, games] of orderedSports) {
        if (sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf') continue;
        const sport = games[0].sport;
        log(`\n── ${sport.label}: ${games.length} game decision(s), sequential daily-ledger lane ──`);
        for (const entry of games) {
          await runGameDecision(entry);
        }
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
          ['--game-id', String(entry.gameId)],
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
      const workers = ncaafClusterConcurrency(ncaafGames.length, {
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

    const runSharedPropLane = async () => {
      for (const [sportKey, games] of orderedSports) {
        if (sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf') continue;
        const sport = games[0].sport;
        if (!sport.propsScript) continue;
        log(`\n── ${sport.label}: ${games.length} prop decision(s), sequential lane ──`);
        for (const entry of games) await runPropDecision(entry);
      }
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
        runGames: runSharedDailyGameLane,
        runProps: runSharedPropLane,
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
        const etDate = entry.startTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
  const args = process.argv.slice(2);

  if (args.includes('--now')) {
    log('🚀 Running all sports NOW');
    const { schedule } = await buildPlan(getTodayETDateStr());
    for (const entry of schedule) entry.triggerTime = new Date();
    await executeSchedule(schedule);
    return;
  }

  if (args.includes('--plan')) {
    const dateStr = args.includes('--today') ? getTodayETDateStr() : getTomorrowETDateStr();
    await buildPlan(dateStr);
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
  const todaySchedule = await buildPlanResilient(getTodayETDateStr());
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
      const recovered = await buildPlanResilient(wakeDate);
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
    const schedule = await buildPlanResilient(getTodayETDateStr());
    await executeSchedule(schedule);

    // If execution ran past midnight into a new ET day, immediately build
    // and run that day's plan instead of sleeping past it.
    let currentDate = getTodayETDateStr();
    while (currentDate !== planDateBefore && currentDate !== getTomorrowETDateStr()) {
      log(`\n⚡ Execution spanned into ${currentDate} — building today's plan immediately`);
      const todaySchedule = await buildPlanResilient(currentDate);
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
