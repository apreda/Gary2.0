import {
  NCAAF_KICKOFF_STATUS,
  ncaafSlateDateForInstant,
  ncaafSlateDateForKickoff,
  resolveNcaafKickoff,
} from '../../src/services/ncaafGamePolicy.js';
import {
  NFL_KICKOFF_STATUS,
  nflSlateDateForKickoff,
  resolveNflKickoff,
} from '../../src/services/nflGamePolicy.js';

const DEFAULT_BATCH_WINDOW_MS = 15 * 60 * 1000;
const SPORT_FETCH_RETRY_MAX_MS = 20 * 60 * 1000;
const DEFAULT_CHILD_MAX_RUNTIME_MS = 45 * 60 * 1000;
const DEFAULT_CHILD_DEADLINE_SAFETY_MS = 2 * 60 * 1000;

function asMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

function etCalendarDate(value) {
  const clock = asMillis(value);
  if (!Number.isFinite(clock)) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(clock));
}

/**
 * Scheduler date ownership differs only for NCAAF's overnight window. Every
 * other sport keeps the existing ET calendar-day contract unchanged.
 */
export function schedulerSlateDateForSport(sportKey, value = Date.now()) {
  return sportKey === 'americanfootball_ncaaf'
    ? ncaafSlateDateForInstant(value)
    : etCalendarDate(value);
}

/** Carry stable slate identity on entries whose background guards persist it. */
export function schedulerEntrySlateIdentity(sportKey, slateDate) {
  if (sportKey !== 'baseball_mlb' && sportKey !== 'americanfootball_ncaaf') return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(slateDate || ''))) {
    throw new TypeError(`${sportKey} scheduler entry requires a canonical slate date`);
  }
  return { slateDate };
}

/** A prior NCAAF slate is still active only from midnight through 5:59:59 ET. */
export function activeNcaafRecoverySlateDate(value = Date.now()) {
  const calendarDate = etCalendarDate(value);
  const slateDate = ncaafSlateDateForInstant(value);
  return calendarDate && slateDate && calendarDate !== slateDate ? slateDate : null;
}

/** Keep retry entries alive through the owning sport's actual slate boundary. */
export function sportFetchRetryIsCurrent(entry, now = Date.now()) {
  if (!isSportFetchRetryEntry(entry)) return false;
  if (entry?.sport?.key !== 'americanfootball_ncaaf') {
    return schedulerSlateDateForSport(entry?.sport?.key, now) === entry.dateStr;
  }
  // The 5 AM build intentionally arms the upcoming calendar-day college slate
  // before Gary's display rolls at 6. During that one-hour overlap, both the
  // still-active prior slate and the already-planned next slate may retry.
  return new Set([
    schedulerSlateDateForSport(entry.sport.key, now),
    etCalendarDate(now),
  ]).has(entry.dateStr);
}

/**
 * Carry the stable NCAAF slate key into exact child processes. Missing slate
 * identity fails closed instead of letting a post-midnight child write into a
 * different day's row. Other sports receive their historical arguments.
 */
export function schedulerChildArgs(entry, args = []) {
  const result = [...args];
  if (entry?.sport?.key !== 'americanfootball_ncaaf') return result;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry?.slateDate || ''))) {
    throw new TypeError('NCAAF scheduler entry requires a canonical slateDate');
  }
  return [...result, '--date', entry.slateDate];
}

export function scheduleEntryKey(entry) {
  if (entry?.kind === 'sport_fetch_retry') {
    const gameIds = Array.isArray(entry?.gameIds) ? entry.gameIds : [];
    const base = `fetch:${entry?.sport?.key || 'unknown'}:${entry?.dateStr || 'unknown'}`;
    return gameIds.length > 0 ? `${base}:${gameIds.map(String).sort().join(',')}` : base;
  }
  return `${entry?.sport?.key || entry?.sport?.label || 'unknown'}:${entry?.gameId ?? 'unknown'}`;
}

export function scheduleTierKey(entry) {
  if (isSportFetchRetryEntry(entry)) return scheduleEntryKey(entry);
  const tier = entry?.tier ?? (entry?.leadMin == null ? 'fixed' : `lead-${entry.leadMin}`);
  return `${scheduleEntryKey(entry)}:tier-${tier}`;
}

export function sportFetchRetryDelayMs(attempt = 1) {
  const normalized = Math.max(1, Math.trunc(Number(attempt)) || 1);
  return Math.min(SPORT_FETCH_RETRY_MAX_MS, 60_000 * (2 ** (normalized - 1)));
}

export function makeSportFetchRetryEntry({
  sport,
  dateStr,
  attempt = 1,
  now = Date.now(),
  gameIds = [],
}) {
  const clock = asMillis(now);
  if (!sport?.key || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || '')) || !Number.isFinite(clock)) {
    throw new TypeError('makeSportFetchRetryEntry requires sport.key, an ET date, and a valid clock');
  }
  const normalizedAttempt = Math.max(1, Math.trunc(Number(attempt)) || 1);
  const normalizedGameIds = [...new Set(
    (Array.isArray(gameIds) ? gameIds : [])
      .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
      .map(String),
  )].sort();
  return {
    kind: 'sport_fetch_retry',
    sport,
    dateStr,
    attempt: normalizedAttempt,
    ...(normalizedGameIds.length > 0 ? { gameIds: normalizedGameIds } : {}),
    triggerTime: new Date(clock + sportFetchRetryDelayMs(normalizedAttempt)),
  };
}

export function isSportFetchRetryEntry(entry) {
  return entry?.kind === 'sport_fetch_retry';
}

export function isScheduleEntryHeld(entry) {
  return !isSportFetchRetryEntry(entry) && Boolean(entry?.scheduleHold);
}

export function isScheduleEntryRetired(entry) {
  return !isSportFetchRetryEntry(entry) && Boolean(entry?.scheduleRetired);
}

/** Hold or release only the still-pending tiers for one exact scheduled game. */
export function setGameScheduleHold(entries, exemplar, reason = null) {
  const gameKey = scheduleEntryKey(exemplar);
  const nextReason = reason == null ? null : String(reason).trim().toLowerCase();
  let changed = 0;
  for (const entry of entries || []) {
    if (scheduleEntryKey(entry) !== gameKey || isSportFetchRetryEntry(entry)) continue;
    const previous = entry.scheduleHold || null;
    if (nextReason) entry.scheduleHold = nextReason;
    else delete entry.scheduleHold;
    if (previous !== (entry.scheduleHold || null)) changed += 1;
  }
  return changed;
}

/** Permanently suppress the remaining pregame tiers for a game on this slate. */
export function retireGameSchedule(entries, exemplar, reason) {
  const gameKey = scheduleEntryKey(exemplar);
  const retirement = String(reason || 'retired').trim().toLowerCase();
  let changed = 0;
  for (const entry of entries || []) {
    if (scheduleEntryKey(entry) !== gameKey || isSportFetchRetryEntry(entry)) continue;
    if (entry.scheduleRetired !== retirement) changed += 1;
    entry.scheduleRetired = retirement;
    delete entry.scheduleHold;
  }
  return changed;
}

export function gameHasStarted(entry, now = Date.now()) {
  if (isSportFetchRetryEntry(entry)) return false;
  const start = asMillis(entry?.startTime);
  const clock = asMillis(now);
  return Number.isFinite(start) && Number.isFinite(clock) && start <= clock;
}

export function hasUrgentUpcomingTrigger(entries, now = Date.now(), horizonMs = 20 * 60_000) {
  const clock = asMillis(now);
  return (entries || []).some((entry) => {
    if (isScheduleEntryHeld(entry) || isScheduleEntryRetired(entry)) return false;
    const start = asMillis(entry?.startTime);
    const trigger = asMillis(entry?.triggerTime);
    return Number.isFinite(start) && Number.isFinite(trigger)
      && start > clock
      && trigger <= clock + horizonMs;
  });
}

export function partitionStartedEntries(entries, now = Date.now()) {
  const runnable = [];
  const stale = [];
  for (const entry of entries || []) {
    (gameHasStarted(entry, now) ? stale : runnable).push(entry);
  }
  return { runnable, stale };
}

/**
 * Convert only provider-confirmed NCAAF instants into execution clocks.
 * Date-only/unknown values remain public-slate data and return as exact-id
 * retry candidates; they never receive a guessed kickoff.
 */
export function partitionNcaafKickoffReadiness(games = [], etDateStr) {
  const confirmed = [];
  const pending = [];
  const outsideDate = [];
  let retryAll = false;

  for (const game of games || []) {
    const kickoff = resolveNcaafKickoff(game);
    const slateDate = ncaafSlateDateForKickoff(game);
    if (slateDate && slateDate !== etDateStr) {
      outsideDate.push(game);
      continue;
    }

    const exactStart = kickoff.status === NCAAF_KICKOFF_STATUS.CONFIRMED && kickoff.iso
      ? new Date(kickoff.iso)
      : null;
    if (exactStart && !Number.isNaN(exactStart.getTime())) {
      confirmed.push({ raw: game, startTime: exactStart });
      continue;
    }

    pending.push({ raw: game, kickoff });
    if (game?.id === null || game?.id === undefined || String(game.id).trim() === '') {
      retryAll = true;
    }
  }

  return {
    confirmed,
    pending,
    outsideDate,
    retryAll,
    retryGameIds: [...new Set(
      pending
        .map(({ raw }) => raw?.id)
        .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
        .map(String),
    )].sort(),
  };
}

/**
 * NFL uses the ordinary ET calendar slate, but shares NCAAF's precision law:
 * only a provider-confirmed instant may become an execution clock. Date-only
 * and unknown games remain exact-id retry candidates.
 */
export function partitionNflKickoffReadiness(games = [], etDateStr) {
  const confirmed = [];
  const pending = [];
  const outsideDate = [];
  let retryAll = false;

  for (const game of games || []) {
    const kickoff = resolveNflKickoff(game);
    const slateDate = nflSlateDateForKickoff(game);
    if (slateDate && slateDate !== etDateStr) {
      outsideDate.push(game);
      continue;
    }

    const exactStart = kickoff.status === NFL_KICKOFF_STATUS.CONFIRMED && kickoff.iso
      ? new Date(kickoff.iso)
      : null;
    if (exactStart && !Number.isNaN(exactStart.getTime())) {
      confirmed.push({ raw: game, startTime: exactStart });
      continue;
    }

    pending.push({ raw: game, kickoff });
    if (game?.id === null || game?.id === undefined || String(game.id).trim() === '') {
      retryAll = true;
    }
  }

  return {
    confirmed,
    pending,
    outsideDate,
    retryAll,
    retryGameIds: [...new Set(
      pending
        .map(({ raw }) => raw?.id)
        .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
        .map(String),
    )].sort(),
  };
}

/**
 * Merge recovered game tiers without replaying a game/tier already present in
 * the day's schedule. `existingEntries` deliberately includes fired entries:
 * an exact-game retry that returns the same confirmed game must not recreate
 * earlier tiers after they have already run.
 */
export function newScheduleEntries(existingEntries = [], candidateEntries = []) {
  const seen = new Set((existingEntries || []).map(scheduleTierKey));
  const fresh = [];
  for (const entry of candidateEntries || []) {
    const key = scheduleTierKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(entry);
  }
  return fresh;
}

/**
 * Select one still-pending NCAAF tier per exact provider game id for the
 * periodic kickoff refresh. This stays bounded and excludes fetch retries,
 * other sports, invalid clocks, and games that have already started.
 */
export function pendingNcaafKickoffRefreshEntries(
  entries = [],
  now = Date.now(),
  maxGames = 100,
) {
  const clock = asMillis(now);
  const limit = Math.max(0, Math.trunc(Number(maxGames)) || 0);
  if (!Number.isFinite(clock) || limit === 0) return [];

  const seen = new Set();
  const selected = [];
  for (const entry of entries || []) {
    if (isSportFetchRetryEntry(entry)) continue;
    if (entry?.sport?.key !== 'americanfootball_ncaaf') continue;
    if (entry?.gameId === null || entry?.gameId === undefined) continue;
    const start = asMillis(entry?.startTime);
    if (!Number.isFinite(start) || start <= clock) continue;
    const key = scheduleEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(entry);
    if (selected.length >= limit) break;
  }
  return selected;
}

/**
 * Give one child only the wall-clock time that is actually available before
 * the scheduler must service another deadline. The absolute deadline is the
 * earliest of:
 *   - the child's own game start,
 *   - the next queued trigger, and
 *   - the normal hard runtime cap.
 *
 * The safety buffer belongs to the scheduler, not the child: it leaves time
 * to terminate/reap a slow process, record its structured failure, and advance
 * the queue. A zero timeout means no safe execution window remains; callers
 * should fail fast and leave the later retry tier intact.
 */
export function childExecutionBudget({
  entry,
  pendingEntries = [],
  now = Date.now(),
  maxRuntimeMs = DEFAULT_CHILD_MAX_RUNTIME_MS,
  safetyBufferMs = DEFAULT_CHILD_DEADLINE_SAFETY_MS,
} = {}) {
  const clock = asMillis(now);
  const maxRuntime = Number(maxRuntimeMs);
  const safety = Math.max(0, Number(safetyBufferMs) || 0);
  if (!Number.isFinite(clock) || !Number.isFinite(maxRuntime) || maxRuntime <= 0) {
    throw new TypeError('childExecutionBudget requires a valid clock and positive maxRuntimeMs');
  }

  const candidates = [{ reason: 'hard_cap', at: clock + maxRuntime }];
  const gameStart = asMillis(entry?.startTime);
  if (Number.isFinite(gameStart)) {
    candidates.push({ reason: 'game_start', at: gameStart - safety });
  }

  const nextTrigger = (pendingEntries || [])
    .filter((candidate) => !isScheduleEntryHeld(candidate) && !isScheduleEntryRetired(candidate))
    .filter((candidate) => isSportFetchRetryEntry(candidate) || !gameHasStarted(candidate, clock))
    .map((candidate) => asMillis(candidate?.triggerTime))
    .filter(Number.isFinite)
    .reduce((earliest, trigger) => Math.min(earliest, trigger), Infinity);
  if (Number.isFinite(nextTrigger)) {
    candidates.push({ reason: 'next_trigger', at: nextTrigger - safety });
  }

  candidates.sort((a, b) => a.at - b.at);
  const limiting = candidates[0];
  return {
    timeoutMs: Math.max(0, Math.floor(limiting.at - clock)),
    deadlineAt: new Date(limiting.at),
    limitingReason: limiting.reason,
    nextTriggerAt: Number.isFinite(nextTrigger) ? new Date(nextTrigger) : null,
  };
}

/**
 * Return the pending clocks that can block the current decision lane. A clock
 * from another lane may be ignored only while that lane is enrolled/running
 * in the same batch. Otherwise it remains a hard deadline for the top-level
 * dispatcher, which must return in time to launch that lane. Same-lane clocks
 * always remain blockers so retry tiers retain their exact cadence.
 */
export function pendingEntriesForDecisionLane(entry, pendingEntries = [], activeBatchLaneKeys = new Set()) {
  const laneKey = decisionLaneKey(entry);
  return (pendingEntries || []).filter((candidate) => {
    if (isScheduleEntryHeld(candidate) || isScheduleEntryRetired(candidate)) return false;
    const candidateLaneKey = decisionLaneKey(candidate);
    return candidateLaneKey === laneKey || !activeBatchLaneKeys.has(candidateLaneKey);
  });
}

/**
 * MLB research is allowed to finish until its own first pitch (or the normal
 * hard runtime cap). A later retry or another game's trigger is not a reason
 * to terminate a healthy MLB child; the independent schedule dispatchers keep
 * football clocks moving without using MLB child cancellation as a timer.
 */
export function pendingEntriesForChildBudget(entry, pendingEntries = [], activeBatchLaneKeys = new Set()) {
  if (entry?.sport?.key === 'baseball_mlb') return [];
  return pendingEntriesForDecisionLane(entry, pendingEntries, activeBatchLaneKeys);
}

export function decisionLaneKey(entry) {
  const sportKey = entry?.sport?.key;
  return sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf'
    ? sportKey
    : 'shared';
}

export function partitionDecisionLaneSchedules(entries = []) {
  const byLane = new Map();
  for (const entry of entries || []) {
    const laneKey = decisionLaneKey(entry);
    if (!byLane.has(laneKey)) byLane.set(laneKey, []);
    byLane.get(laneKey).push(entry);
  }
  return [...byLane.entries()].map(([laneKey, laneEntries]) => ({ laneKey, entries: laneEntries }));
}

export function laneOwnsMlbDriftGuard(laneKey, entries = []) {
  return laneKey === 'shared'
    && (entries || []).some((entry) => entry?.sport?.key === 'baseball_mlb');
}

export async function runIndependentScheduleLanes(entries = [], runLane) {
  if (typeof runLane !== 'function') {
    throw new TypeError('runIndependentScheduleLanes requires a lane runner');
  }
  const lanes = partitionDecisionLaneSchedules(entries);
  await Promise.all(lanes.map(({ laneKey, entries: laneEntries }) => runLane(laneEntries, laneKey)));
}

export function nextTriggerBatch(entries, options = DEFAULT_BATCH_WINDOW_MS) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const config = typeof options === 'number'
    ? { windowMs: options }
    : (options || {});
  const windowMs = Math.max(0, Number(config.windowMs ?? DEFAULT_BATCH_WINDOW_MS) || 0);
  const clock = asMillis(config.now ?? Date.now());
  const crossLaneLookaheadMs = Math.max(0, Number(config.crossLaneLookaheadMs) || 0);
  const ordered = entries
    .filter((entry) => !isScheduleEntryHeld(entry) && !isScheduleEntryRetired(entry))
    .sort((a, b) => asMillis(a.triggerTime) - asMillis(b.triggerTime));
  if (ordered.length === 0) return [];
  const anchor = asMillis(ordered[0].triggerTime);
  const anchored = ordered.filter((entry) => asMillis(entry.triggerTime) - anchor <= windowMs);
  const anchoredLanes = new Set(anchored.map(decisionLaneKey));
  const lookaheadBoundary = clock + crossLaneLookaheadMs;
  const seenGames = new Set();
  return ordered.filter((entry) => {
    const inAnchoredWindow = asMillis(entry.triggerTime) - anchor <= windowMs;
    const isImminentMissingLane = crossLaneLookaheadMs > 0
      && !isSportFetchRetryEntry(entry)
      && !anchoredLanes.has(decisionLaneKey(entry))
      && asMillis(entry.triggerTime) <= lookaheadBoundary;
    if (!inAnchoredWindow && !isImminentMissingLane) return false;
    const key = scheduleEntryKey(entry);
    if (seenGames.has(key)) return false;
    seenGames.add(key);
    return true;
  });
}

/**
 * A wake or long desk can leave several retry tiers for one still-upcoming
 * game overdue. Replaying all of them wastes the remaining pregame window.
 * Keep only the newest overdue tier for each game, plus every future tier.
 */
export function coalesceOverdueTiers(entries, now = Date.now()) {
  const clock = asMillis(now);
  const grouped = new Map();
  for (const entry of entries || []) {
    if (isScheduleEntryRetired(entry)) continue;
    const key = scheduleEntryKey(entry);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const kept = [];
  const skipped = [];
  for (const group of grouped.values()) {
    if (group.some(isScheduleEntryHeld)) {
      // Interruption time is not a pick deadline. Preserve every unfired tier;
      // a resumed exact time will reanchor only these live queue entries.
      kept.push(...group);
      continue;
    }
    const overdue = group
      .filter((entry) => asMillis(entry.triggerTime) <= clock)
      .sort((a, b) => asMillis(a.triggerTime) - asMillis(b.triggerTime));
    const newestOverdue = overdue.at(-1);
    for (const entry of group) {
      const isOverdue = asMillis(entry.triggerTime) <= clock;
      if (!isOverdue || entry === newestOverdue) kept.push(entry);
      else skipped.push(entry);
    }
  }

  kept.sort((a, b) => asMillis(a.triggerTime) - asMillis(b.triggerTime));
  return { entries: kept, skipped };
}

/**
 * Re-anchor every unfired lead-time tier for one game to a newly verified
 * start. Entries are mutated deliberately: the scheduler's wall-clock wait
 * holds a reference to the same Date, so a moved-earlier or moved-later game
 * takes effect on the next one-minute wake without burning stale tiers.
 */
export function reanchorGameSchedule(entries, exemplar, officialStart) {
  const gameKey = scheduleEntryKey(exemplar);
  const nextStartMs = asMillis(officialStart);
  if (!Number.isFinite(nextStartMs)) throw new TypeError('officialStart must be a valid date');

  let changed = 0;
  for (const entry of entries || []) {
    if (scheduleEntryKey(entry) !== gameKey) continue;
    if (entry.leadMin == null) continue;
    const triggerMs = nextStartMs - Number(entry.leadMin) * 60 * 1000;
    if (entry.startTime instanceof Date) entry.startTime.setTime(nextStartMs);
    else entry.startTime = new Date(nextStartMs);
    if (entry.triggerTime instanceof Date) entry.triggerTime.setTime(triggerMs);
    else entry.triggerTime = new Date(triggerMs);
    changed += 1;
  }
  return changed;
}

export function isFinalPendingTier(entry, pendingEntries) {
  const key = scheduleEntryKey(entry);
  return !(pendingEntries || []).some((candidate) => scheduleEntryKey(candidate) === key);
}

/**
 * Run independent sport lanes concurrently while preserving the only ordering
 * each lane requires: its own game decisions must finish before its own props.
 * A slow shared MLB/NBA lane therefore cannot hold NFL/NCAAF props hostage.
 */
export async function runIndependentDecisionLanes(lanes = []) {
  await Promise.all((lanes || []).map(async (lane) => {
    if (typeof lane?.runGames !== 'function' || typeof lane?.runProps !== 'function') {
      throw new TypeError('Each decision lane requires runGames and runProps functions');
    }
    await lane.runGames();
    await lane.runProps();
  }));
}

/**
 * Size the NCAAF worker pool for a clustered Saturday slate. Three workers are
 * enough for a small window, but a fixed pool leaves dozens of independent
 * model runs queued behind one another when many games share a kickoff. The
 * BDL transport remains independently serialized by bdlRequestGate; this only
 * permits bounded overlap of model/context work.
 */
export function ncaafClusterConcurrency(gameCount, {
  minWorkers = 3,
  maxWorkers = 12,
  targetGamesPerWorker = 4,
} = {}) {
  const count = Math.max(0, Math.trunc(Number(gameCount)) || 0);
  if (count === 0) return 0;
  const minimum = Math.max(1, Math.trunc(Number(minWorkers)) || 1);
  const maximum = Math.max(minimum, Math.trunc(Number(maxWorkers)) || minimum);
  const target = Math.max(1, Math.trunc(Number(targetGamesPerWorker)) || 1);
  return Math.min(count, maximum, Math.max(minimum, Math.ceil(count / target)));
}

/**
 * Run a bounded per-game decision pipeline. Props for one game start only
 * after that exact game's game-pick decision completes; they do not wait for
 * every other game in a large kickoff cluster.
 */
export async function runPerGameDecisionPipeline({
  entries = [],
  concurrency = 1,
  runGame,
  runProps,
} = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  if (typeof runGame !== 'function' || typeof runProps !== 'function') {
    throw new TypeError('runPerGameDecisionPipeline requires runGame and runProps functions');
  }
  const workerCount = Math.max(1, Math.min(Math.trunc(concurrency) || 1, entries.length));
  let nextIndex = 0;
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < entries.length) {
      const entry = entries[nextIndex++];
      await runGame(entry);
      await runProps(entry);
    }
  }));
}
