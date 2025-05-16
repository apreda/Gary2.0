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
  
  // Find second Sunday in March
  let dstStart = new Date(Date.UTC(year, 2, 8)); // March 8
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
 * Converts a date to EST/EDT timezone
 * @param {Date|string} date - The date to convert
 * @returns {Date} The date in EST/EDT
 */
export function toEST(date) {
  const d = new Date(date);
  const offset = isEDT(d) ? EDT_OFFSET : EST_OFFSET;
  return new Date(d.getTime() + offset);
}

/**
 * Formats a date in EST/EDT timezone
 * @param {Date|string} date - The date to format
 * @param {Object} options - Options for toLocaleString
 * @returns {string} Formatted date string
 */
export function formatInEST(date, options = {}) {
  const d = new Date(date);
  const estDate = toEST(d);
  
  const defaultOptions = {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  };
  
  return estDate.toLocaleString('en-US', { ...defaultOptions, ...options });
}

/**
 * Gets the current date in EST/EDT timezone
 * @returns {Date} Current date in EST/EDT
 */
export function getCurrentEST() {
  return toEST(new Date());
}

/**
 * Gets today's date string in YYYY-MM-DD format in EST/EDT
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getTodayEST() {
  return formatInEST(new Date(), { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: undefined,
    minute: undefined,
    hour12: false
  }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2');
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
 * Format a season for display (e.g., "2024-2025")
 * 
 * @param {number} seasonYear - The season year (e.g., 2024)
 * @returns {string} Formatted season (e.g., "2024-2025")
 */
export function formatSeason(seasonYear) {
  return `${seasonYear}-${seasonYear + 1}`;
}

/**
 * Formats a date to a short string (e.g., "May 15")
 * @param {Date|string} date - The date to format
 * @returns {string} Formatted date string (e.g., "May 15")
 */
export function formatShortDate(date) {
  return formatInEST(date, { 
    month: 'short', 
    day: 'numeric',
    year: undefined,
    hour: undefined,
    minute: undefined
  });
}
