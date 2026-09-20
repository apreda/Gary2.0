/**
 * Date utility functions with EST timezone support
 */

import { easternDate, easternHour } from '../../supabase/functions/_shared/dateKeys.js';
export { easternDateOffset, shiftDateKey } from '../../supabase/functions/_shared/dateKeys.js';

function seasonStartingIn(month, date) {
  const [year, currentMonth] = easternDate(date).split('-').map(Number);
  return currentMonth >= month ? year : year - 1;
}

/**
 * Calculate the current NBA season year in EST
 * 
 * NBA seasons span two calendar years (e.g., 2024-2025 season)
 * The "season year" is the first year (2024 in this example)
 * 
 * The NBA season typically begins in October, so:
 * - If current month is October-December: use current year
 * - If current month is January-September: use previous year
 * 
 * @returns {number} The NBA season year (e.g., 2024 for the 2024-2025 season)
 */
export function nbaSeason(date = new Date()) {
  return seasonStartingIn(10, date);
}

/**
 * Get the current NHL season year.
 * NHL season starts in October, same as NBA.
 * @returns {number} The NHL season year (e.g., 2025 for the 2025-2026 season)
 */
export function nhlSeason(date = new Date()) {
  return seasonStartingIn(10, date);
}

/**
 * Get the current NFL season year.
 * NFL preseason starts in August.
 * @param {Date} [date] Instant whose Eastern season should be resolved.
 * @returns {number} The NFL season year (e.g., 2026 for Aug 2026 - Feb 2027)
 */
export function nflSeason(date = new Date()) {
  return seasonStartingIn(8, date);
}

/**
 * Get the current NCAAB season year.
 * NCAAB season starts in November (Nov 2025 - Apr 2026 = "2025" season).
 * @returns {number} The NCAAB season year (e.g., 2025 for the Nov 2025 - Apr 2026 season)
 */
export function ncaabSeason(date = new Date()) {
  return seasonStartingIn(11, date);
}

/**
 * Get the current NCAAF season year.
 * NCAAF season starts in August (Aug 2025 - Jan 2026 = "2025" season).
 * @returns {number} The NCAAF season year (e.g., 2025 for the Aug 2025 - Jan 2026 season)
 */
export function ncaafSeason(date = new Date()) {
  return seasonStartingIn(8, date);
}

/**
 * Format a season for display (e.g., "2024-2025")
 *
 * @param {number} seasonYear - The season year (e.g., 2024)
 * @returns {string} Formatted season (e.g., "2024-2025")
 */
export function formatSeason(seasonYear) {
  return `${seasonYear}-${seasonYear + 1}`;
}

/**
 * Get the current MLB season year.
 * MLB regular season runs late March-October.
 * @returns {number} The MLB season year (e.g., 2026 for the 2026 season)
 */
export function mlbSeason(date = new Date()) {
  return Number(easternDate(date).slice(0, 4));
}

/**
 * Truthful one-line description of the US sports calendar for a given date.
 *
 * Feeds the grounding Freshness Protocol's "Season Context" line. Before
 * Jul 8 2026 that line hardcoded "(NBA/NHL mid-season, NFL playoffs)" — built
 * once from the NBA calendar and false from roughly February onward, so every
 * summer grounding call carried January misdirection. Month-derived and
 * deliberately coarse: its job is to orient the search model toward the right
 * leagues, not to be a schedule.
 *
 * @param {Date} date - The date to describe (defaults to now)
 * @returns {string} e.g. "MLB regular season; NBA and NHL off-season; ..."
 */
export function describeSportsCalendar(date = new Date()) {
  const month = Number(easternDate(date).slice(5, 7)) - 1;
  const byMonth = [
    'NFL playoffs; NBA, NHL, and NCAAB mid-season; MLB off-season',                          // Jan
    'NBA and NHL mid-season; NCAAB late season; Super Bowl early in the month; MLB spring training begins', // Feb
    'NCAAB March Madness; NBA and NHL late regular season; MLB spring training',             // Mar
    'MLB regular season opens; NBA and NHL playoffs begin; NFL draft',                       // Apr
    'MLB regular season; NBA and NHL playoffs',                                              // May
    'MLB regular season; NBA Finals and NHL Stanley Cup Final conclude',                     // Jun
    'MLB regular season (All-Star break mid-month); NBA and NHL off-season',                 // Jul
    'MLB regular season; NFL training camp and preseason',                                   // Aug
    'NFL and college football underway; MLB pennant races',                                  // Sep
    'MLB postseason; NFL and NCAAF mid-season; NBA and NHL seasons open',                    // Oct
    'NFL and NCAAF; NBA and NHL early season; NCAAB opens',                                  // Nov
    'NFL late season; NBA and NHL; NCAAB non-conference; college bowl season',               // Dec
  ];
  return byMonth[month];
}

/** Eastern calendar date, independent of the machine's time zone. */
export const getESTDate = easternDate;

/** Timestamp to Eastern date; existing date-only keys retain their date. */
export const toESTDate = easternDate;

/** Eastern wall-clock hour (0–23), without reparsing a localized Date. */
export const getESTHour = easternHour;
