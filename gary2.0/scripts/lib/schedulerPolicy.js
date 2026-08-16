const DEFAULT_BATCH_WINDOW_MS = 15 * 60 * 1000;
const SPORT_FETCH_RETRY_MAX_MS = 20 * 60 * 1000;
const DEFAULT_CHILD_MAX_RUNTIME_MS = 45 * 60 * 1000;
const DEFAULT_CHILD_DEADLINE_SAFETY_MS = 2 * 60 * 1000;

function asMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

export function scheduleEntryKey(entry) {
  if (entry?.kind === 'sport_fetch_retry') {
    return `fetch:${entry?.sport?.key || 'unknown'}:${entry?.dateStr || 'unknown'}`;
  }
  return `${entry?.sport?.key || entry?.sport?.label || 'unknown'}:${entry?.gameId ?? 'unknown'}`;
}

export function sportFetchRetryDelayMs(attempt = 1) {
  const normalized = Math.max(1, Math.trunc(Number(attempt)) || 1);
  return Math.min(SPORT_FETCH_RETRY_MAX_MS, 60_000 * (2 ** (normalized - 1)));
}

export function makeSportFetchRetryEntry({ sport, dateStr, attempt = 1, now = Date.now() }) {
  const clock = asMillis(now);
  if (!sport?.key || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || '')) || !Number.isFinite(clock)) {
    throw new TypeError('makeSportFetchRetryEntry requires sport.key, an ET date, and a valid clock');
  }
  const normalizedAttempt = Math.max(1, Math.trunc(Number(attempt)) || 1);
  return {
    kind: 'sport_fetch_retry',
    sport,
    dateStr,
    attempt: normalizedAttempt,
    triggerTime: new Date(clock + sportFetchRetryDelayMs(normalizedAttempt)),
  };
}

export function isSportFetchRetryEntry(entry) {
  return entry?.kind === 'sport_fetch_retry';
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
  const ordered = [...entries].sort((a, b) => asMillis(a.triggerTime) - asMillis(b.triggerTime));
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
    const key = scheduleEntryKey(entry);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  const kept = [];
  const skipped = [];
  for (const group of grouped.values()) {
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
