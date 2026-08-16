import {
  NCAAF_KICKOFF_STATUS,
  ncaafSlateDateForKickoff,
  resolveNcaafKickoff,
} from './ncaafKickoff.js';

const ET_TIME_ZONE = 'America/New_York';

/** Return YYYY-MM-DD in America/New_York for an ISO game start. */
export function footballEtDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Add UTC calendar days to a YYYY-MM-DD string without host-time-zone drift. */
export function addUtcDateDays(dateString, days = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) {
    throw new Error(`Invalid calendar date: ${dateString}`);
  }
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** One-request BDL configuration for an exact ET football slate. */
export function footballBdlRequest(league, targetDate) {
  const normalizedLeague = String(league || '').toUpperCase();
  if (!['NFL', 'NCAAF'].includes(normalizedLeague)) {
    throw new Error(`Unsupported football league: ${league}`);
  }
  const params = {
    dates: [targetDate, addUtcDateDays(targetDate)],
    per_page: '100',
  };
  if (normalizedLeague === 'NFL') params.season_type = ['1', '2', '3'];
  return {
    path: normalizedLeague === 'NFL' ? '/nfl/v1/games' : '/ncaaf/v1/games',
    sportKey: normalizedLeague === 'NFL' ? 'americanfootball_nfl' : 'americanfootball_ncaaf',
    params,
  };
}

function statusToken(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Normalize the status vocabularies used by the 2026 NFL and NCAAF feeds.
 * Unknown past-game statuses fail closed instead of being guessed as live.
 */
export function normalizeFootballStatus(raw, { startAt = null, nowMs = Date.now() } = {}) {
  const token = statusToken(raw);

  if (/^\d{4}-\d{2}-\d{2}t/i.test(String(raw ?? ''))) return 'scheduled';
  if (['final', 'final ot', 'complete', 'completed', 'closed', 'post', 'game over'].includes(token)
      || token.startsWith('final ')) return 'final';
  if (['in', 'live', 'in progress', 'inprogress', 'ongoing', 'halftime', 'half time'].includes(token)
      || /^(q[1-4]|ot\d*|\d+(st|nd|rd|th) (quarter|qtr))\b/.test(token)) return 'live';
  if (['pre', 'scheduled', 'not started', 'pregame', 'pre game', 'tbd', 'tba',
    'postponed', 'delayed', 'suspended', 'cancelled', 'canceled'].includes(token)) return 'scheduled';

  const startMs = Date.parse(String(startAt || ''));
  if (Number.isFinite(startMs) && startMs > nowMs) return 'scheduled';
  if (!token) throw new Error('Football game status is missing after kickoff');
  throw new Error(`Unsupported football game status: ${String(raw)}`);
}

function hasValue(value) {
  return value !== null && value !== undefined;
}

function inferredFootballPeriod(game) {
  const explicit = Number(game?.period ?? game?.quarter);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  if (hasValue(game?.home_team_ot) || hasValue(game?.visitor_team_ot)
      || hasValue(game?.home_score_ot) || hasValue(game?.away_score_ot)) return 5;

  for (let quarter = 4; quarter >= 1; quarter -= 1) {
    if (hasValue(game?.[`home_team_q${quarter}`]) || hasValue(game?.[`visitor_team_q${quarter}`])
        || hasValue(game?.[`home_score_q${quarter}`]) || hasValue(game?.[`away_score_q${quarter}`])) {
      return quarter;
    }
  }
  return null;
}

function periodLabel(period) {
  if (!Number.isFinite(period) || period <= 0) return null;
  if (period <= 4) return `Q${period}`;
  if (period === 5) return 'OT';
  return `${period - 4}OT`;
}

function cleanClock(value) {
  if (value === null || value === undefined) return null;
  const clock = String(value).trim();
  if (!clock || /^(final|null|undefined)$/i.test(clock)) return null;
  return clock;
}

/** Build the short iOS-ready football state, such as "Q3 4:12" or "HALF". */
export function footballDetail(game, status) {
  if (status === 'final') return 'FINAL';
  if (status !== 'live') return null;

  const rawStatus = statusToken(game?.status);
  if (rawStatus === 'halftime' || rawStatus === 'half time') return 'HALF';

  const label = periodLabel(inferredFootballPeriod(game));
  const clock = cleanClock(game?.time ?? game?.clock ?? game?.clock_display);
  if (label && clock) return `${label} ${clock}`;
  return label || (clock ? `LIVE ${clock}` : 'LIVE');
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Normalize one BDL football game. Returning null means it belongs to a
 * different ET slate date; malformed data throws so callers can report it.
 */
export function normalizeFootballGame(game, { league, targetDate, nowMs = Date.now() }) {
  const normalizedLeague = String(league || '').toUpperCase();
  if (!['NFL', 'NCAAF'].includes(normalizedLeague)) {
    throw new Error(`Unsupported football league: ${league}`);
  }
  if (!game || game.id === null || game.id === undefined) {
    throw new Error(`${normalizedLeague} game is missing an id`);
  }

  const ncaafKickoff = normalizedLeague === 'NCAAF'
    ? resolveNcaafKickoff(game)
    : null;
  const startAt = ncaafKickoff?.iso
    ?? (normalizedLeague === 'NFL' && typeof game.date === 'string' ? game.date : null);
  const etDate = normalizedLeague === 'NCAAF'
    ? ncaafSlateDateForKickoff(game)
    : footballEtDate(startAt);
  if (!etDate) throw new Error(`${normalizedLeague} game ${game.id} has an invalid date`);
  if (etDate !== targetDate) return null;

  const status = ncaafKickoff?.status === NCAAF_KICKOFF_STATUS.DATE_ONLY
    && !String(game.status ?? '').trim()
    ? 'scheduled'
    : normalizeFootballStatus(game.status, { startAt, nowMs });
  const awayTeam = game.visitor_team ?? game.away_team ?? null;
  const homeTeam = game.home_team ?? null;

  return {
    startAt,
    row: {
      _etDate: etDate,
      league: normalizedLeague,
      game_id: String(game.id),
      away_abbr: awayTeam?.abbreviation ?? null,
      home_abbr: homeTeam?.abbreviation ?? null,
      away_score: numberOrNull(game.visitor_team_score ?? game.away_score ?? game.visitor_score),
      home_score: numberOrNull(game.home_team_score ?? game.home_score),
      status,
      detail: footballDetail(game, status),
      outs: null,
      bases: null,
    },
  };
}

/** Normalize, exact-ET filter, and game-id dedupe a football API page. */
export function normalizeFootballGames(games, options) {
  if (!Array.isArray(games)) throw new Error(`${options?.league || 'Football'} games payload is not an array`);
  const rows = [];
  const issues = [];
  const seen = new Set();

  for (const game of games) {
    try {
      const normalized = normalizeFootballGame(game, options);
      if (!normalized) continue;
      const key = normalized.row.game_id;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(normalized);
    } catch (error) {
      issues.push({ gameId: game?.id == null ? null : String(game.id), message: error?.message || String(error) });
    }
  }

  return { rows, issues };
}
