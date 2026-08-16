const ET_TIME_ZONE = 'America/New_York';

export const NFL_KICKOFF_STATUS = Object.freeze({
  CONFIRMED: 'confirmed',
  DATE_ONLY: 'date_only',
  UNKNOWN: 'unknown',
});

function etDateForInstant(instant) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Resolve BDL's NFL kickoff precision without manufacturing an execution
 * clock. A bare YYYY-MM-DD is fixture metadata only: it may be displayed on
 * that calendar slate, but it cannot own a countdown, pick deadline, or live
 * transition until the provider posts an exact instant.
 */
export function resolveNflKickoff(gameOrValue) {
  const value = typeof gameOrValue === 'object' && gameOrValue !== null
    ? gameOrValue.datetime
      ?? gameOrValue.start_time_utc
      ?? gameOrValue.date
      ?? gameOrValue.game_date
      ?? gameOrValue.commence_time
    : gameOrValue;

  if (value == null || value === '') {
    return {
      iso: null,
      scheduledDate: null,
      status: NFL_KICKOFF_STATUS.UNKNOWN,
      estimated: false,
    };
  }

  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return {
      iso: null,
      scheduledDate: raw,
      status: NFL_KICKOFF_STATUS.DATE_ONLY,
      // Retain the established compatibility signal, but never attach an ISO
      // value. New consumers use kickoff_status as the authoritative field.
      estimated: true,
    };
  }

  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) {
    return {
      iso: null,
      scheduledDate: null,
      status: NFL_KICKOFF_STATUS.UNKNOWN,
      estimated: false,
    };
  }

  return {
    iso: instant.toISOString(),
    scheduledDate: etDateForInstant(instant),
    status: NFL_KICKOFF_STATUS.CONFIRMED,
    estimated: false,
  };
}

/** NFL owns the ordinary ET calendar day; unlike NCAAF it has no 6 AM roll. */
export function nflSlateDateForKickoff(gameOrValue) {
  return resolveNflKickoff(gameOrValue).scheduledDate;
}
