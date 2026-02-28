/**
 * Shared helpers for NFL TD picker scripts (TNF, MNF, Sunday).
 * Extracts duplicated utility functions into one reusable module.
 */
import { createClient } from '@supabase/supabase-js';

// ── Date / Time Helpers ─────────────────────────────────────────────────────

/**
 * Get today's date in YYYY-MM-DD format, EST/EDT-safe.
 */
export function getESTDate() {
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Format an ISO timestamp to a readable EST string (e.g. "Thu, Dec 5, 8:15 PM").
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

/**
 * Check if today is a specific day of the week in EST.
 * @param {number} dayNum - 0 = Sunday, 1 = Monday, … 4 = Thursday, 6 = Saturday
 */
export function isDayOfWeekEST(dayNum) {
  const now = new Date();
  const estDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return estDate.getDay() === dayNum;
}

/**
 * Check if a game's commence_time falls on today (EST).
 */
export function isGameToday(commenceTime) {
  if (!commenceTime) return false;
  const gameDate = new Date(commenceTime);
  const todayEST = getESTDate();

  const gameEST = new Date(gameDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const gameYear = gameEST.getFullYear();
  const gameMonth = String(gameEST.getMonth() + 1).padStart(2, '0');
  const gameDay = String(gameEST.getDate()).padStart(2, '0');
  const gameDateStr = `${gameYear}-${gameMonth}-${gameDay}`;

  return gameDateStr === todayEST;
}

// ── CLI Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse CLI arguments into a key/value object.
 * Supports `--key=value` and bare `--flag` (value defaults to `true`).
 */
export function parseArgs() {
  return process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    acc[key.replace(/^--/, '')] = value ?? true;
    return acc;
  }, {});
}

// ── TD Prop Filtering ────────────────────────────────────────────────────────

/**
 * Filter raw prop odds for anytime TD props.
 */
export function filterAnytimeTDProps(props) {
  return props.filter(p => {
    const propType = (p.prop_type || '').toLowerCase();
    return propType === 'anytime_td' ||
           propType === 'player_anytime_td' ||
           propType === 'player_tds_over' ||
           propType === 'tds_over' ||
           (propType.includes('td') && !propType.includes('pass_td') && !propType.includes('1st_td') && !propType.includes('first_td'));
  });
}

/**
 * Filter raw prop odds for first TD scorer props.
 */
export function filterFirstTDProps(props) {
  return props.filter(p => {
    const propType = (p.prop_type || '').toLowerCase();
    return propType === 'first_td' ||
           propType === 'player_1st_td' ||
           propType === '1st_td';
  });
}

// ── Supabase Helpers ─────────────────────────────────────────────────────────

/**
 * Create a Supabase client for CLI script usage (service-role key, no session).
 * Returns null if credentials are missing.
 */
export function createScriptSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Merge new TD picks into prop_picks and store.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} dateParam - YYYY-MM-DD date key
 * @param {Array}  newPicks  - Array of pick objects to add
 * @param {Function} keepFilter - Predicate applied to existing picks to decide what to KEEP
 *                                (e.g., `p => !p.tnf_pick` removes old TNF picks before merge)
 */
export async function mergeAndStorePicks(supabase, dateParam, newPicks, keepFilter) {
  const { data: existingData } = await supabase
    .from('prop_picks')
    .select('picks')
    .eq('date', dateParam)
    .single();

  let existingPicks = [];
  if (existingData?.picks) {
    existingPicks = existingData.picks.filter(keepFilter);
  }

  const mergedPicks = [...existingPicks, ...newPicks];

  await supabase.from('prop_picks').delete().eq('date', dateParam);

  const { error: insertError } = await supabase
    .from('prop_picks')
    .insert({
      date: dateParam,
      picks: mergedPicks,
      created_at: new Date().toISOString()
    });

  if (insertError) {
    console.error(`❌ Insert error: ${insertError.message}`);
    return false;
  }
  return true;
}
