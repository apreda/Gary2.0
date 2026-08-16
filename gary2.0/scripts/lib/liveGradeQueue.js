import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_LIVE_GRADE_QUEUE_DIR = '/tmp/gary-live-grade-queue';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function exactGradeGame(value, fallbackDate = null) {
  const date = clean(value?.date) ?? clean(fallbackDate);
  const league = clean(value?.league)?.toUpperCase() ?? null;
  const gameId = clean(value?.game_id ?? value?.gameId);
  if (!DATE_RE.test(date ?? '') || !league || !gameId) return null;
  return { date, league, game_id: gameId };
}

export function gradeGameKey(value, fallbackDate = null) {
  const game = exactGradeGame(value, fallbackDate);
  return game ? `${game.date}|${game.league}|${game.game_id}` : null;
}

export function normalizeGradeRequest(request) {
  const date = clean(request?.date);
  if (!DATE_RE.test(date ?? '') || !Array.isArray(request?.leagues)) {
    throw new Error('Malformed pending live-grade request');
  }
  const leagues = [...new Set(request.leagues
    .map((league) => clean(league)?.toUpperCase())
    .filter(Boolean))];
  const games = [];
  const seen = new Set();
  for (const value of Array.isArray(request?.games) ? request.games : []) {
    const game = exactGradeGame(value, date);
    if (!game) throw new Error('Malformed exact game in pending live-grade request');
    const key = gradeGameKey(game);
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(game);
    if (!leagues.includes(game.league)) leagues.push(game.league);
  }
  if (!leagues.length && !games.length) {
    throw new Error('Pending live-grade request has no league or exact game');
  }
  return {
    ...request,
    date,
    leagues,
    games,
  };
}

function requestFilenameFromTemp(name) {
  return `${name.slice(1, -4)}.json`;
}

/** Recover a request whose process stopped after fsync/write but before rename. */
export function recoverPendingGradeTemps(queueDir = DEFAULT_LIVE_GRADE_QUEUE_DIR) {
  mkdirSync(queueDir, { recursive: true });
  for (const name of readdirSync(queueDir).filter((value) => /^\..+\.tmp$/.test(value))) {
    const tempPath = join(queueDir, name);
    normalizeGradeRequest(JSON.parse(readFileSync(tempPath, 'utf8')));
    renameSync(tempPath, join(queueDir, requestFilenameFromTemp(name)));
  }
}

export function pendingGradeFiles(queueDir = DEFAULT_LIVE_GRADE_QUEUE_DIR) {
  recoverPendingGradeTemps(queueDir);
  return readdirSync(queueDir)
    .filter((name) => name.endsWith('.json') || name.includes('.work-'));
}

export function readPendingGradeRequests(queueDir = DEFAULT_LIVE_GRADE_QUEUE_DIR) {
  // A detached worker may rename `.json` -> `.work-*` or unlink a successful
  // claim between readdir and read. Retry the snapshot once instead of making
  // the score poll fail on that harmless queue lifecycle race.
  let snapshot = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    snapshot = [];
    let changed = false;
    for (const name of pendingGradeFiles(queueDir)) {
      try {
        snapshot.push({
          name,
          request: normalizeGradeRequest(JSON.parse(readFileSync(join(queueDir, name), 'utf8'))),
        });
      } catch (error) {
        if (error?.code === 'ENOENT') {
          changed = true;
          continue;
        }
        throw error;
      }
    }
    if (!changed) return snapshot;
  }
  return snapshot;
}

export function requestCoversGame(request, value) {
  const game = exactGradeGame(value);
  if (!game) return false;
  const normalized = normalizeGradeRequest(request);
  if (normalized.games.some((candidate) => gradeGameKey(candidate) === gradeGameKey(game))) {
    return true;
  }
  // Compatibility with requests queued before exact game ids were added. A
  // legacy date+league request still owns that date-wide grader invocation;
  // once it finishes, the next poll re-evaluates exact database coverage.
  return normalized.games.length === 0
    && normalized.date === game.date
    && normalized.leagues.includes(game.league);
}

/**
 * Append one durable request after excluding games already pending/claimed.
 * `.work-*` claims remain visible to this check, so a poll that runs while the
 * detached worker is alive cannot enqueue a duplicate exact game.
 */
export function queueExactGradeRequest({
  date,
  games,
  reason = 'final-transition',
  queueDir = DEFAULT_LIVE_GRADE_QUEUE_DIR,
  now = Date.now,
  pid = process.pid,
  random = Math.random,
} = {}) {
  if (!DATE_RE.test(String(date ?? ''))) throw new Error(`Invalid live-grade date: ${date}`);
  const normalizedGames = [];
  const seen = new Set();
  for (const value of Array.isArray(games) ? games : []) {
    const game = exactGradeGame(value, date);
    if (!game) throw new Error('Live-grade queue requires exact date/league/game_id');
    const key = gradeGameKey(game);
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedGames.push(game);
  }
  if (!normalizedGames.length) return { queued: [], covered: [] };

  const pending = readPendingGradeRequests(queueDir).map(({ request }) => request);
  const covered = normalizedGames.filter((game) => pending.some((request) => requestCoversGame(request, game)));
  const queued = normalizedGames.filter((game) => !covered.some((candidate) => gradeGameKey(candidate) === gradeGameKey(game)));
  if (!queued.length) return { queued, covered };

  const identity = `${date}-${now()}-${pid}-${random().toString(36).slice(2, 8)}`;
  const request = normalizeGradeRequest({
    date,
    leagues: [...new Set(queued.map((game) => game.league))],
    games: queued,
    reason,
  });
  mkdirSync(queueDir, { recursive: true });
  const tempPath = join(queueDir, `.${identity}.tmp`);
  const finalPath = join(queueDir, `${identity}.json`);
  writeFileSync(tempPath, JSON.stringify(request));
  renameSync(tempPath, finalPath);
  return { queued, covered, path: finalPath };
}

export default {
  exactGradeGame,
  gradeGameKey,
  normalizeGradeRequest,
  pendingGradeFiles,
  queueExactGradeRequest,
  readPendingGradeRequests,
  recoverPendingGradeTemps,
  requestCoversGame,
};
