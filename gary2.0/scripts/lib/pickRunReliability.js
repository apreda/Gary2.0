export const PICK_RUN_OUTCOME_PREFIX = '@@GARY_PICK_OUTCOME@@';

const ALLOWED_OUTCOMES = new Set(['stored', 'dry_run']);
const EXACT_FOOTBALL_SPORTS = new Set([
  'americanfootball_nfl',
  'americanfootball_ncaaf',
]);

export function formatPickRunOutcome(outcome) {
  if (!outcome || !ALLOWED_OUTCOMES.has(outcome.status)) {
    throw new Error(`Invalid pick run outcome: ${outcome?.status ?? 'missing'}`);
  }
  return `${PICK_RUN_OUTCOME_PREFIX}${JSON.stringify(outcome)}`;
}

export function parsePickRunOutcome(output) {
  const line = String(output || '')
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(PICK_RUN_OUTCOME_PREFIX));
  if (!line) return null;
  try {
    const outcome = JSON.parse(line.slice(PICK_RUN_OUTCOME_PREFIX.length));
    return ALLOWED_OUTCOMES.has(outcome?.status) ? outcome : null;
  } catch {
    return null;
  }
}

/**
 * Only scheduler football runs may turn a provider id into exact transport
 * scope. Other sports and manual no-id runs keep their established discovery
 * behavior.
 */
export function exactFootballGameDiscoveryOptions(sportKey, gameId) {
  if (!EXACT_FOOTBALL_SPORTS.has(String(sportKey || '')) || gameId == null || String(gameId).trim() === '') {
    return {};
  }
  return { gameId: String(gameId) };
}

/**
 * Final write-time guard. A desk can legitimately spend several minutes on
 * research, so filtering the slate before analysis is not enough: the game
 * may start while the child is still running. Production storage must fail
 * closed instead of publishing an in-play "pregame" pick.
 */
export function assertPicksStillPregame(picks, nowMs = Date.now()) {
  for (const pick of picks || []) {
    const rawStart = pick?.commence_time;
    const startMs = rawStart == null ? Number.NaN : new Date(rawStart).getTime();
    const gameLabel = pick?.game || `${pick?.awayTeam || 'Away'} @ ${pick?.homeTeam || 'Home'}`;

    if (!Number.isFinite(startMs)) {
      throw new Error(`Pregame storage blocked for ${gameLabel}: missing or invalid commence_time`);
    }
    if (startMs <= nowMs) {
      throw new Error(`Pregame storage blocked for ${gameLabel}: game has already started`);
    }
  }
}
