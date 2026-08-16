const ET_TIME_ZONE = 'America/New_York';

function instantForETCivilDate(dateStr, hour, minute) {
  let candidate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ET_TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(candidate);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const civil = `${values.year}-${values.month}-${values.day}T${values.hour === '24' ? '00' : values.hour}:${values.minute}:${values.second}`;
    const target = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    const drift = Date.parse(`${target}Z`) - Date.parse(`${civil}Z`);
    if (drift === 0) break;
    candidate = new Date(candidate.getTime() + drift);
  }
  return candidate;
}

/**
 * Resolve BDL's NCAAF kickoff. A date-only row means time is not posted yet;
 * use the product's explicit 3:00 PM ET estimate without shifting ET dates.
 */
export function resolveNcaafKickoff(gameOrValue) {
  const value = typeof gameOrValue === 'object' && gameOrValue !== null
    ? gameOrValue.start_time_utc
      ?? gameOrValue.datetime
      ?? gameOrValue.game_date
      ?? gameOrValue.date
      ?? gameOrValue.commence_time
    : gameOrValue;
  if (value == null || value === '') return { iso: null, estimated: false };
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { iso: instantForETCivilDate(raw, 15, 0).toISOString(), estimated: true };
  }
  const instant = new Date(raw);
  return Number.isNaN(instant.getTime())
    ? { iso: null, estimated: false }
    : { iso: instant.toISOString(), estimated: false };
}
