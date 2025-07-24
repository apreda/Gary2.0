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

/**
 * Date utility functions for handling Eastern Time conversions
 * and date formatting across the application
 */

/**
 * Get the current date in Eastern Time zone
 * @returns {object} Object containing formatted date string and hour
 */
export const getEasternDate = () => {
  const now = new Date();
  
  // Convert to Eastern Time zone properly
  const easternTimeOptions = { timeZone: "America/New_York" };
  const easternDateString = now.toLocaleDateString('en-US', easternTimeOptions);
  const easternTimeString = now.toLocaleTimeString('en-US', easternTimeOptions);
  
  // Parse the date and time components
  const [month, day, year] = easternDateString.split('/');
  const [time, period] = easternTimeString.match(/([\d:]+)\s(AM|PM)/).slice(1);
  const [hours, minutes] = time.split(':');
  
  // Calculate the 24-hour format hour
  let easternHour = parseInt(hours);
  if (period === 'PM' && hours !== '12') {
    easternHour += 12;
  } else if (period === 'AM' && hours === '12') {
    easternHour = 0;
  }
  
  // Format the date string properly (YYYY-MM-DD)
  const dateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  // Format full time for logging
  const fullEasternTimeString = `${month}/${day}/${year} ${hours}:${minutes} ${period}`;
  
  return {
    dateString,
    easternHour,
    fullTimeString: fullEasternTimeString,
    month: parseInt(month),
    day: parseInt(day),
    year: parseInt(year)
  };
};

/**
 * Get yesterday's date from a given date object
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} day - Day
 * @returns {string} Yesterday's date in YYYY-MM-DD format
 */
export const getYesterdayDateFromParams = (year, month, day) => {
  const yesterdayDate = new Date(year, month - 1, day);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  
  const yesterdayYear = yesterdayDate.getFullYear();
  const yesterdayMonth = (yesterdayDate.getMonth() + 1).toString().padStart(2, '0');
  const yesterdayDay = yesterdayDate.getDate().toString().padStart(2, '0');
  
  return `${yesterdayYear}-${yesterdayMonth}-${yesterdayDay}`;
};

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

/**
 * Determine which date to use for loading picks based on current Eastern time
 * @returns {string} The date to query for picks in YYYY-MM-DD format
 */
export const getPicksQueryDate = () => {
  const eastern = getEasternDate();
  
  // Before 10am EST, use yesterday's date
  if (eastern.easternHour < 10) {
    return getYesterdayDateFromParams(eastern.year, eastern.month, eastern.day);
  }
  
  return eastern.dateString;
};

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
  const today = new Date();
  today.setDate(today.getDate() - 1);
  return today.toISOString().split('T')[0];
}
