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

// toEST/formatInEST/getCurrentEST/getTodayEST removed — dead code, replaced by getESTDate/getESTHour

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
 * Format a season for display (e.g., "2024-2025")
 *
 * @param {number} seasonYear - The season year (e.g., 2024)
 * @returns {string} Formatted season (e.g., "2024-2025")
 */
export function formatSeason(seasonYear) {
  return `${seasonYear}-${seasonYear + 1}`;
}

// formatShortDate, getEasternDate, getYesterdayDateFromParams removed — dead code

/**
 * Format a game time string to a readable format
 * @param {string} timeString - ISO timestamp or time string
 * @returns {string} Formatted time string (e.g., "7:10 PM EST")
 */
export const formatGameTime = (timeString) => {
  if (!timeString) return '';
  
  try {
    const gameDate = new Date(timeString);
    // Format as 1:36 PM EST
    return gameDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
      hour12: true
    }) + ' EST';
  } catch (e) {
    return timeString; // Return original if parsing fails
  }
};

// getPicksQueryDate removed — dead code (was built on removed getEasternDate/getYesterdayDateFromParams)

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
 * Get current timestamp in EST timezone as ISO string
 * @returns {string} ISO timestamp string adjusted for EST
 */
export const getESTTimestamp = () => {
  const now = new Date();
  const estTimestamp = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
  return estTimestamp.toISOString();
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
 * Get EST date for a specific number of days offset from today
 * @param {number} daysOffset - Number of days to offset (positive for future, negative for past)
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getESTDateOffset = (daysOffset = 0) => {
  const now = new Date();
  now.setDate(now.getDate() + daysOffset);
  return toESTDate(now);
};

/**
 * Check if a date string is today in EST
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if the date is today in EST
 */
export const isESTToday = (dateString) => {
  return dateString === getESTDate();
};

/**
 * Format a date for display in EST timezone
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export const formatESTDate = (date, options = {}) => {
  const dateObj = new Date(date);
  const defaultOptions = { 
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(dateObj);
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

/**
 * Check if it's currently a specific time range in EST
 * @param {number} startHour - Start hour (0-23)
 * @param {number} endHour - End hour (0-23)
 * @returns {boolean} True if current EST time is within the range
 */
export const isESTTimeInRange = (startHour, endHour) => {
  const currentHour = getESTHour();
  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    // Handle overnight ranges (e.g., 22 to 6)
    return currentHour >= startHour || currentHour < endHour;
  }
};

export function getYesterdayDate() {
  // Use local date instead of UTC to avoid timezone issues
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// formatLocalDate removed — dead code, replaced by getESTDate/toESTDate
