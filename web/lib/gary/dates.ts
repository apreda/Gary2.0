const EST = 'America/New_York';

/** yyyy-MM-dd in America/New_York. en-CA locale gives ISO ordering. */
export function estDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: EST });
}

function estHour(d: Date): number {
  return parseInt(d.toLocaleString('en-US', { timeZone: EST, hour: '2-digit', hour12: false }), 10) % 24;
}

/**
 * Port of iOS SupabaseAPI.todayEST (SupabaseAPI.swift:64).
 * Before 3am EST, "today" is still yesterday — keeps last night's slate up
 * until the morning grading run.
 */
export function todayEST(now: Date = new Date()): string {
  if (estHour(now) < 3) {
    return estDateStr(new Date(now.getTime() - 86400000));
  }
  return estDateStr(now);
}

/** Port of iOS hubGradedDateEST: the day before todayEST (graded record day). */
export function hubGradedDateEST(now: Date = new Date()): string {
  const today = todayEST(now);
  const [y, m, d] = today.split('-').map(Number);
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12)); // noon avoids TZ edge
  return estDateStr(new Date(noonUTC.getTime() - 86400000));
}
