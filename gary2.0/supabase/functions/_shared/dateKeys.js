// Calendar keys and instants are different types. UTC is only an arithmetic
// anchor here; it never decides which Eastern date owns an instant.
const easternDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23',
});

/** @param {string} date @param {number} days */
export function shiftDateKey(date, days) {
  const base = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)
    || !Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Expected a real YYYY-MM-DD calendar date and integer day offset');
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** @param {Date|string|number} [value] */
export function easternDate(value = new Date()) {
  // A provider's date-only key has no time zone to convert.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return shiftDateKey(value, 0);
  return easternDay.format(new Date(value));
}

/** @param {Date|string|number} [value] */
export function easternHour(value = new Date()) {
  return Number(easternClock.format(new Date(value)));
}

/** @param {number} [days] @param {Date|string|number} [now] */
export function easternDateOffset(days = 0, now = new Date()) {
  return shiftDateKey(easternDate(now), days);
}
