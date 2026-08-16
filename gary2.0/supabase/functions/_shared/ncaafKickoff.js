const ET_TIME_ZONE = 'America/New_York';

// Gary's public board does not roll at midnight. A confirmed NCAAF kickoff in
// the overnight window still belongs to the prior betting slate, matching the
// app's 6:00 AM ET rollover. Date-only fixtures cannot safely use this rule
// because their hour is unknown; they remain on the provider calendar date.
export const NCAAF_SLATE_ROLLOVER_HOUR_ET = 6;

export const NCAAF_KICKOFF_STATUS = Object.freeze({
  CONFIRMED: 'confirmed',
  DATE_ONLY: 'date_only',
  UNKNOWN: 'unknown',
});

function etPartsForInstant(instant) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function etDateForInstant(instant) {
  const values = etPartsForInstant(instant);
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftCalendarDate(dateString, days) {
  const instant = new Date(`${dateString}T12:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/** Return the 6am-aware Gary slate date for one exact kickoff instant. */
export function ncaafSlateDateForInstant(value) {
  if (value == null || value === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = etPartsForInstant(instant);
  const calendarDate = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  if (!Number.isInteger(hour)) return null;
  return hour < NCAAF_SLATE_ROLLOVER_HOUR_ET
    ? shiftCalendarDate(calendarDate, -1)
    : calendarDate;
}

/**
 * Resolve BDL's NCAAF kickoff without manufacturing a time.
 *
 * A provider YYYY-MM-DD value is calendar precision only. It remains on that
 * ET slate through `scheduledDate`, while `iso` stays null so no caller can
 * accidentally build a countdown or decision deadline from an invented hour.
 */
export function resolveNcaafKickoff(gameOrValue) {
  const value = typeof gameOrValue === 'object' && gameOrValue !== null
    ? gameOrValue.start_time_utc
      ?? gameOrValue.datetime
      ?? gameOrValue.game_date
      ?? gameOrValue.date
      ?? gameOrValue.commence_time
    : gameOrValue;
  if (value == null || value === '') {
    return {
      iso: null,
      scheduledDate: null,
      status: NCAAF_KICKOFF_STATUS.UNKNOWN,
      estimated: false,
    };
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return {
      iso: null,
      scheduledDate: raw,
      status: NCAAF_KICKOFF_STATUS.DATE_ONLY,
      // Compatibility for older internal callers while the explicit precision
      // field rolls through persisted contracts.
      estimated: true,
    };
  }
  const instant = new Date(raw);
  return Number.isNaN(instant.getTime())
    ? {
        iso: null,
        scheduledDate: null,
        status: NCAAF_KICKOFF_STATUS.UNKNOWN,
        estimated: false,
      }
    : {
        iso: instant.toISOString(),
        scheduledDate: etDateForInstant(instant),
        status: NCAAF_KICKOFF_STATUS.CONFIRMED,
        estimated: false,
      };
}

/**
 * Return the public NCAAF slate date without manufacturing a kickoff.
 * Confirmed instants use the 6am rollover; date-only values retain the exact
 * provider date and unknown values remain null.
 */
export function ncaafSlateDateForKickoff(gameOrValue) {
  const kickoff = resolveNcaafKickoff(gameOrValue);
  if (kickoff.status === NCAAF_KICKOFF_STATUS.CONFIRMED && kickoff.iso) {
    return ncaafSlateDateForInstant(kickoff.iso);
  }
  return kickoff.scheduledDate;
}
