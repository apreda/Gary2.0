/** @param {unknown} value */
function normalizeLeague(value) {
  return String(value ?? '').trim().toUpperCase();
}

/** @param {unknown} values */
function supportedLeagueList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeLeague)
    .filter(Boolean))];
}

/**
 * @param {string} mode
 * @param {string} reason
 * @param {string[]} supportedLeagues
 */
function fallbackGate(mode, reason, supportedLeagues) {
  return {
    mode,
    authoritative: false,
    leagues: supportedLeagues,
    counts: Object.fromEntries(supportedLeagues.map((league) => [league, 0])),
    reason,
  };
}

/**
 * Decide which live-score sources may run from an exact-date daily_slate read.
 *
 * A non-empty, well-shaped slate is authoritative: a league absent from it has
 * no games on that ET date and its source is not called. An unavailable, empty,
 * or malformed read fails open to every supported source. That fallback costs
 * requests, but it cannot silently hide scheduled football while daily_slate is
 * being populated or recovering from a read failure.
 *
 * @param {{
 *   rows?: unknown,
 *   error?: unknown,
 *   supportedLeagues?: string[],
 * }} [options]
 */
export function resolveLiveScoreSourceGate({ rows, error = null, supportedLeagues = [] } = {}) {
  const supported = supportedLeagueList(supportedLeagues);
  if (error) {
    return fallbackGate('fallback-unavailable', String(error), supported);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return fallbackGate('fallback-empty', 'daily_slate returned no rows', supported);
  }

  const leagues = rows.map((row) => normalizeLeague(row?.league));
  if (leagues.some((league) => !league)) {
    return fallbackGate('fallback-malformed', 'daily_slate contained a row without a league', supported);
  }

  const counts = Object.fromEntries(supported.map((league) => [league, 0]));
  for (const league of leagues) {
    if (Object.hasOwn(counts, league)) counts[league] += 1;
  }
  const expected = supported.filter((league) => counts[league] > 0);

  return {
    mode: 'daily-slate',
    authoritative: true,
    leagues: expected,
    counts,
    reason: null,
  };
}

/**
 * Select source descriptors without invoking their loaders. Keeping selection
 * separate from execution makes the no-request-for-absent-leagues contract
 * explicit and testable in both Node and Deno callers.
 *
 * @template {{ name?: unknown }} T
 * @param {{ leagues?: string[] } | undefined} gate
 * @param {T[]} sources
 * @returns {T[]}
 */
export function selectLiveScoreSources(gate, sources) {
  const enabled = new Set(supportedLeagueList(gate?.leagues));
  return sources.filter((source) => enabled.has(normalizeLeague(source?.name)));
}

/**
 * Return true only when an authoritative daily_slate proves that every exact
 * supported game for the ET date already has a FINAL live_scores row.
 *
 * Counting only the stored rows is unsafe on mixed-sport days: the early MLB
 * window can finish before an NFL/NCAAF game has produced its first score row.
 * Exact slate identity makes that later window visible without spending a
 * provider request until its normal polling window opens.
 *
 * @param {{
 *   gate?: { authoritative?: boolean, counts?: Record<string, number> },
 *   slateRows?: unknown,
 *   storedRows?: unknown,
 * }} [options]
 */
export function isAuthoritativeSlateFullyFinal({ gate, slateRows = [], storedRows = [] } = {}) {
  if (!gate?.authoritative || !Array.isArray(slateRows) || !Array.isArray(storedRows)) {
    return false;
  }

  const supported = new Set(Object.keys(gate.counts || {}).map(normalizeLeague).filter(Boolean));
  const expected = new Set();
  for (const row of slateRows) {
    const league = normalizeLeague(row?.league);
    if (!supported.has(league)) continue;
    const gameId = String(row?.bdl_game_id ?? row?.game_id ?? '').trim();
    // Missing provider identity cannot prove final coverage, so fail open.
    if (!gameId) return false;
    expected.add(`${league}|${gameId}`);
  }
  if (expected.size === 0) return false;

  const final = new Set(
    storedRows
      .filter((row) => String(row?.status || '').trim().toLowerCase() === 'final')
      .map((row) => {
        const league = normalizeLeague(row?.league);
        const gameId = String(row?.game_id ?? row?.bdl_game_id ?? '').trim();
        return league && gameId ? `${league}|${gameId}` : null;
      })
      .filter(Boolean),
  );
  return [...expected].every((key) => final.has(key));
}

const DEFAULT_MAX_GAME_MINUTES = Object.freeze({
  MLB: 6 * 60,
  NFL: 5 * 60,
  NCAAF: 5 * 60,
  NBA: 4 * 60,
  NHL: 4 * 60,
});

const RECOVERABLE_INTERRUPTION_STATUSES = new Set([
  'delayed',
  'postponed',
  'suspended',
]);

function liveScoreIdentity(row) {
  const league = normalizeLeague(row?.league ?? row?.row?.league);
  const gameId = String(row?.game_id ?? row?.row?.game_id ?? '');
  return league && gameId ? `${league}|${gameId}` : null;
}

/** Count exact games whose fresh status is new or differs from stored state. */
export function countLiveScoreStateChanges(freshGames = [], storedRows = []) {
  const stored = new Map();
  for (const row of Array.isArray(storedRows) ? storedRows : []) {
    const identity = liveScoreIdentity(row);
    if (!identity) continue;
    stored.set(identity, String(row?.status || '').toLowerCase());
  }

  let changed = 0;
  for (const game of Array.isArray(freshGames) ? freshGames : []) {
    const identity = liveScoreIdentity(game);
    if (!identity) continue;
    const status = String(game?.status ?? game?.row?.status ?? '').toLowerCase();
    if (!stored.has(identity) || stored.get(identity) !== status) changed += 1;
  }
  return changed;
}

/**
 * Narrow an authoritative daily-slate gate to leagues that can actually be
 * live soon. This runs before any provider request. A game already stored as
 * final is ignored; invalid/missing schedule fields fail open for that league.
 *
 * @param {{ authoritative?: boolean, leagues?: string[] }} gate
 * @param {{ rows?: unknown, storedRows?: unknown, nowMs?: number, imminentMinutes?: number, maxGameMinutes?: Record<string, number> }} options
 */
export function constrainLiveScoreGateToWindow(gate, {
  rows = [],
  storedRows = [],
  nowMs = Date.now(),
  imminentMinutes = 20,
  maxGameMinutes = DEFAULT_MAX_GAME_MINUTES,
} = {}) {
  if (!gate?.authoritative) return gate;
  const enabled = new Set(supportedLeagueList(gate.leagues));
  const finalGames = new Set(
    (Array.isArray(storedRows) ? storedRows : [])
      .filter((row) => String(row?.status || '').toLowerCase() === 'final')
      .map((row) => `${normalizeLeague(row?.league)}|${String(row?.game_id ?? '')}`),
  );
  const interruptedGames = new Set(
    (Array.isArray(storedRows) ? storedRows : [])
      .filter((row) => RECOVERABLE_INTERRUPTION_STATUSES.has(String(row?.status || '').toLowerCase()))
      .map((row) => `${normalizeLeague(row?.league)}|${String(row?.game_id ?? '')}`),
  );
  const storedStatusByGame = new Map(
    (Array.isArray(storedRows) ? storedRows : []).map((row) => [
      `${normalizeLeague(row?.league)}|${String(row?.game_id ?? '')}`,
      String(row?.status || '').toLowerCase(),
    ]),
  );
  const active = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const league = normalizeLeague(row?.league);
    if (!enabled.has(league) || active.has(league)) continue;
    const gameId = String(row?.bdl_game_id ?? row?.game_id ?? '');
    if (gameId && finalGames.has(`${league}|${gameId}`)) continue;
    const slateStatus = String(row?.game_status ?? row?.status ?? '').toLowerCase();
    if (slateStatus === 'cancelled') {
      // Poll once to replace a stale live_scores frame, then treat cancelled as
      // terminal instead of spending provider calls forever.
      if (storedStatusByGame.get(`${league}|${gameId}`) !== 'cancelled') active.add(league);
      continue;
    }
    if (
      RECOVERABLE_INTERRUPTION_STATUSES.has(slateStatus)
      || (gameId && interruptedGames.has(`${league}|${gameId}`))
    ) {
      // Keep polling through an interruption even after the old start window
      // expires. This is how a resumed exact time replaces the held state.
      active.add(league);
      continue;
    }
    const startMs = Date.parse(String(row?.commence_time ?? ''));
    if (!Number.isFinite(startMs)) {
      active.add(league); // malformed schedule: fail open for this league
      continue;
    }
    const untilStartMinutes = (startMs - nowMs) / 60000;
    const maxMinutes = Number(maxGameMinutes?.[league] ?? 6 * 60);
    if (untilStartMinutes <= imminentMinutes && untilStartMinutes >= -maxMinutes) {
      active.add(league);
    }
  }

  return {
    ...gate,
    mode: 'daily-slate-window',
    leagues: [...enabled].filter((league) => active.has(league)),
    windowed: true,
  };
}

/**
 * Merge all fulfilled source rows while retaining every source failure.
 * An authoritative daily_slate source that returns zero games is itself a
 * failure: the slate proved games exist, so an empty provider response must not
 * be mistaken for an off day. `alwaysRequiredLeagues` preserves callers whose
 * fallback-mode contract already treats a failed football feed as fatal.
 *
 * @template T
 * @param {{
 *   gate?: { authoritative?: boolean, counts?: Record<string, number> },
 *   sources?: Array<{ name?: unknown }>,
 *   settled?: Array<PromiseSettledResult<T[]>>,
 *   alwaysRequiredLeagues?: string[],
 * }} [options]
 */
export function evaluateLiveScoreSourceResults({
  gate,
  sources = [],
  settled = [],
  alwaysRequiredLeagues = [],
} = {}) {
  const requiredInFallback = new Set(supportedLeagueList(alwaysRequiredLeagues));
  /** @type {T[]} */
  const items = [];
  /** @type {Array<{ name: string, message: string, required: boolean }>} */
  const failures = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const name = normalizeLeague(source?.name);
    const result = settled[index];
    const required = Boolean(gate?.authoritative) || requiredInFallback.has(name);
    let message = null;

    if (!result) {
      message = 'source did not produce a settled result';
    } else if (result.status === 'rejected') {
      message = result.reason?.message || String(result.reason);
    } else if (!Array.isArray(result.value)) {
      message = 'source returned a non-array payload';
    } else if (gate?.authoritative && Number(gate?.counts?.[name] || 0) > 0
      && result.value.length === 0) {
      message = `daily_slate expects ${gate.counts[name]} game(s), but the source returned none`;
    } else {
      items.push(...result.value);
    }

    if (message) failures.push({ name, message, required });
  }

  return {
    items,
    failures,
    requiredFailures: failures.filter((failure) => failure.required),
  };
}
