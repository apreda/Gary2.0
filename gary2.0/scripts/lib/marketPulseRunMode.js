/**
 * Market Pulse run-mode: which (date, isToday) passes a scheduled run performs.
 *
 * THE SETTLING GAP THIS CLOSES (Aug 26 2026): the launchd stage calls
 * run-market-pulse.js with no flags, so every scheduled run was today-anchored.
 * A weekday West-Coast slate finishes after midnight ET, which means no
 * today-anchored run can ever see the full day — the row froze at whatever the
 * last same-day run counted (usually the 0-state). Sunday day-game slates
 * settled by accident; weekdays never did (Aug 24 + Aug 25 rows sat at zeros).
 *
 * Flagless runs now key off the ET hour:
 *   - before 06:00 ET  → settle YESTERDAY only (the 2:00 AM slot: every final
 *     is in, including West-Coast enders past midnight ET)
 *   - 06:00–09:59 ET   → re-settle YESTERDAY (covers an extra-inning marathon
 *     still live at 2 AM), then write TODAY's 0-state as before
 *   - 10:00 ET onward  → TODAY only (the live strip, rolling up as games grade)
 *
 * Explicit flags keep their exact old meaning and always win:
 *   --date YYYY-MM-DD → that single date;  --yesterday → yesterday only.
 */

/** Yesterday relative to an EST YYYY-MM-DD (noon-UTC anchor avoids rollover). */
export function yesterdayOf(estDate) {
  const d = new Date(`${estDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {object} opts
 * @param {string|undefined} opts.dateArg   explicit --date value (wins outright)
 * @param {boolean} opts.yesterdayFlag      --yesterday
 * @param {number} opts.etHour              current hour in ET, 0-23
 * @param {string} opts.today               today in EST (YYYY-MM-DD)
 * @returns {Array<{date: string, isToday: boolean}>} passes, in run order
 */
export function computePulsePasses({ dateArg, yesterdayFlag, etHour, today }) {
  if (dateArg) return [{ date: dateArg, isToday: false }];
  if (yesterdayFlag) return [{ date: yesterdayOf(today), isToday: false }];
  if (etHour < 6) return [{ date: yesterdayOf(today), isToday: false }];
  if (etHour < 10) {
    return [
      { date: yesterdayOf(today), isToday: false },
      { date: today, isToday: true },
    ];
  }
  return [{ date: today, isToday: true }];
}
