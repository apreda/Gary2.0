export const PROP_RUN_OUTCOME_PREFIX = '@@GARY_PROP_OUTCOME@@';

const ALLOWED_OUTCOMES = new Set(['stored', 'pass', 'dry_run']);

export function formatPropRunOutcome(outcome) {
  if (!outcome || !ALLOWED_OUTCOMES.has(outcome.status)) {
    throw new Error(`Invalid props run outcome: ${outcome?.status ?? 'missing'}`);
  }
  return `${PROP_RUN_OUTCOME_PREFIX}${JSON.stringify(outcome)}`;
}

export function parsePropRunOutcome(output) {
  const line = String(output || '')
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(PROP_RUN_OUTCOME_PREFIX));
  if (!line) return null;
  try {
    const outcome = JSON.parse(line.slice(PROP_RUN_OUTCOME_PREFIX.length));
    return ALLOWED_OUTCOMES.has(outcome?.status) ? outcome : null;
  } catch {
    return null;
  }
}

export function propGameRejectionReason(game, {
  now,
  useESTDayFiltering,
  todayStart,
  tomorrowStart,
  windowMs,
  gameIdFilter = null,
  matchupFilter = null,
}) {
  const tip = new Date(game?.commence_time).getTime();
  if (Number.isNaN(tip)) return 'invalid_tip';
  // This guard is deliberately independent of filtering mode. ET-day mode
  // describes which calendar's slate to inspect, never permission to bet a
  // game after first pitch.
  if (tip <= now) return 'started';
  if (useESTDayFiltering) {
    if (tip < todayStart || tip >= tomorrowStart) return 'outside_et_day';
  } else if (windowMs != null && tip > now + windowMs) {
    return 'outside_window';
  }

  if (gameIdFilter != null) {
    const gameId = String(game?.bdl_game_id ?? game?.id ?? '');
    if (gameId !== String(gameIdFilter)) return 'different_game_id';
  }

  if (matchupFilter) {
    const needle = String(matchupFilter).toLowerCase();
    const home = String(game?.home_team || '').toLowerCase();
    const away = String(game?.away_team || '').toLowerCase();
    if (!home.includes(needle) && !away.includes(needle)) return 'different_matchup';
  }
  return null;
}

/**
 * Keep scheduler exact-game prop retries on the requested game's ET slate.
 * Manual runs without --game-id intentionally retain each sport runner's
 * existing discovery window (NFL's weekly board, for example).
 */
export function propGameDiscoveryOptions({ sportKey, nocache = false, gameIdFilter = null, etDate }) {
  const exactFootballGame = ['americanfootball_nfl', 'americanfootball_ncaaf'].includes(String(sportKey || ''))
    && gameIdFilter != null
    && String(gameIdFilter).trim() !== '';
  return {
    nocache,
    ...(gameIdFilter != null ? { targetDate: etDate } : {}),
    ...(exactFootballGame ? { gameId: String(gameIdFilter) } : {}),
  };
}

function addIsoDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function instantForETDate(dateStr) {
  let candidate = new Date(`${dateStr}T00:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(candidate);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const localHour = values.hour === '24' ? '00' : values.hour;
    const localCivil = `${values.year}-${values.month}-${values.day}T${localHour}:${values.minute}:${values.second}`;
    const targetCivil = `${dateStr}T00:00:00`;
    const driftMs = Date.parse(`${targetCivil}Z`) - Date.parse(`${localCivil}Z`);
    if (driftMs === 0) break;
    candidate = new Date(candidate.getTime() + driftMs);
  }
  return candidate;
}

export function etDayBounds(dateStr) {
  const start = instantForETDate(dateStr);
  const end = instantForETDate(addIsoDays(dateStr, 1));
  return { start: start.getTime(), end: end.getTime() };
}

export function reconcilePropTeam(modelTeam, providerTeam) {
  const provider = String(providerTeam || '').trim();
  if (provider && !['mlb', 'unknown'].includes(provider.toLowerCase())) return provider;
  const model = String(modelTeam || '').trim();
  return model || null;
}

export function propPickGameId(pick) {
  const value = pick?.game_id ?? pick?.bdl_game_id;
  if (value == null || String(value).trim() === '') return null;
  return String(value);
}

export function samePropGame(left, right) {
  const leftId = propPickGameId(left);
  const rightId = propPickGameId(right);
  if (leftId != null || rightId != null) {
    return leftId != null && rightId != null && leftId === rightId;
  }
  const leftMatchup = String(left?.matchup || '').trim().toLowerCase();
  const rightMatchup = String(right?.matchup || '').trim().toLowerCase();
  return Boolean(leftMatchup && rightMatchup && leftMatchup === rightMatchup);
}

export function propPickDedupeKey(pick) {
  const gameId = propPickGameId(pick);
  const matchup = String(pick?.matchup || '').trim().toLowerCase();
  const gameIdentity = gameId != null ? `game:${gameId}` : `legacy:${matchup}`;
  const player = String(pick?.player || '').trim().toLowerCase();
  const propType = String(pick?.prop || pick?.prop_type || '').split(' ')[0].toLowerCase();
  return `${gameIdentity}|${player}|${propType}`;
}
