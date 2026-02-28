/**
 * Shared utility functions for Gary 2.0 scripts
 * Eliminates duplication of common helpers across TD, props, and picks scripts
 */

/**
 * Parse CLI arguments into an object
 * Supports --key=value and --flag (boolean true) formats
 * @param {string[]} argv - process.argv.slice(2) or custom
 * @returns {Object} - Parsed arguments
 */
export function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    acc[key.replace(/^--/, '')] = value ?? true;
    return acc;
  }, {});
}

/**
 * Format an ISO date string to a human-readable EST time
 * @param {string} isoString - ISO 8601 date string
 * @returns {string} - Formatted time like "Tue, Feb 25, 7:30 PM"
 */
export function formatGameTimeEST(isoString) {
  if (!isoString) return 'TBD';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return 'TBD';
  }
}
