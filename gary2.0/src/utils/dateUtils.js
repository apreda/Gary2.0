/**
 * Date utility functions with EST timezone support
 */

const EST_OFFSET = -5 * 60 * 60 * 1000; // EST is UTC-5
const EDT_OFFSET = -4 * 60 * 60 * 1000; // EDT is UTC-4

/**
 * Checks if a date is in Eastern Daylight Time (EDT)
 * @param {Date} date - The date to check
 * @returns {boolean} True if date is in EDT, false if in EST
 */
function isEDT(date) {
  // Check if date is in EDT (second Sunday in March to first Sunday in November)
  const year = date.getFullYear();

  // Find second Sunday in March (ranges from March 8-14)
  // Start at March 1, find first Sunday, then add 7 days
  let dstStart = new Date(Date.UTC(year, 2, 1)); // March 1
  while (dstStart.getUTCDay() !== 0) {
    dstStart.setUTCDate(dstStart.getUTCDate() + 1);
  }
  dstStart.setUTCDate(dstStart.getUTCDate() + 7); // Second Sunday

  // Find first Sunday in November
  let dstEnd = new Date(Date.UTC(year, 10, 1)); // November 1
  while (dstEnd.getUTCDay() !== 0) {
    dstEnd.setUTCDate(dstEnd.getUTCDate() + 1);
  }

  return date >= dstStart && date < dstEnd;
}

/**
 * Gets the current date in EST/EDT timezone (used internally by season helpers)
 * @returns {Date} Current date in EST/EDT
 * @private
 */
function getCurrentEST() {
  const now = new Date();
  const offset = isEDT(now) ? EDT_OFFSET : EST_OFFSET;
  return new Date(now.getTime() + offset);
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
export function nbaSeason() {
  const now = getCurrentEST();
  const month = now.getMonth();  // Jan=0 … Dec=11
  const year = now.getFullYear();
  
  // NBA "2024" season = 2024-25; it begins in October (month 9)
  return month >= 9 ? year : year - 1;
}

/**
 * Get the current NHL season year.
 * NHL season starts in October, same as NBA.
 * @returns {number} The NHL season year (e.g., 2025 for the 2025-2026 season)
 */
export function nhlSeason() {
  const now = getCurrentEST();
  const month = now.getMonth(); // 0-indexed
  return month >= 9 ? now.getFullYear() : now.getFullYear() - 1; // Oct+
}

/**
 * Get the current NFL season year.
 * NFL regular season starts in September.
 * @returns {number} The NFL season year (e.g., 2025 for the Sep 2025 - Feb 2026 season)
 */
export function nflSeason() {
  const now = getCurrentEST();
  const month = now.getMonth(); // 0-indexed
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1; // Sep+
}

/**
 * Get the current NCAAB season year.
 * NCAAB season starts in November (Nov 2025 - Apr 2026 = "2025" season).
 * @returns {number} The NCAAB season year (e.g., 2025 for the Nov 2025 - Apr 2026 season)
 */
export function ncaabSeason() {
  const now = getCurrentEST();
  const month = now.getMonth(); // 0-indexed
  // Nov-Dec → current year, Jan-Oct → prev year
  return month >= 10 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Get the current NCAAF season year.
 * NCAAF season starts in August (Aug 2025 - Jan 2026 = "2025" season).
 * @returns {number} The NCAAF season year (e.g., 2025 for the Aug 2025 - Jan 2026 season)
 */
export function ncaafSeason() {
  const now = getCurrentEST();
  const month = now.getMonth(); // 0-indexed
  // Aug-Dec → current year, Jan-Jul → prev year
  return month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
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
export function mlbSeason() {
  const now = getCurrentEST();
  const year = now.getFullYear();
  // MLB season = calendar year (2026 games = 2026 season)
  return year;
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
  const month = date.getMonth(); // 0-indexed
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

// formatGameTime removed — dead export (3 other files define their own local versions)

/**
 * Date utilities for consistent EST timezone handling across the application
 */

/**
 * Get current date in EST timezone formatted as YYYY-MM-DD
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getESTDate = () => {
  const now = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = now.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Convert any date to EST date string (YYYY-MM-DD)
 * @param {Date|string} date - Date to convert
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const toESTDate = (date) => {
  const dateObj = new Date(date);
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = dateObj.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

/**
 * Get the current hour in EST (0-23)
 * @returns {number} Current hour in EST
 */
export const getESTHour = () => {
  const now = new Date();
  const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  return estTime.getHours();
};


