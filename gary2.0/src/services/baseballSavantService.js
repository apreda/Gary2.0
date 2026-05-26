/**
 * Baseball Savant xStats Service
 *
 * Free public CSV endpoints — no API key needed.
 * Returns expected stats (xBA, xSLG, xWOBA, xERA) for all MLB pitchers and batters.
 * These measure expected performance based on contact quality (exit velo, launch angle)
 * rather than actual results — the gap between actual and expected signals regression.
 *
 * Cached in memory with 24hr TTL (data changes daily during season).
 * Two calls cache the entire league: ~873 pitchers + ~673 batters.
 */

const SAVANT_BASE = 'https://baseballsavant.mlb.com/leaderboard/expected_statistics';

// In-memory cache — one entry per type per year
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

/**
 * Parse CSV text into array of objects
 */
function parseCsv(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  // Remove BOM and quotes from headers
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j];
      // Try to parse numbers
      const num = parseFloat(val);
      obj[headers[j]] = !isNaN(num) && val !== '' ? num : val;
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Fetch xStats for all pitchers or batters for a given season.
 * @param {'pitcher'|'batter'} type
 * @param {number} year - Season year (e.g., 2025, 2026)
 * @returns {Promise<Array>} Array of player xStats objects
 */
async function fetchXStats(type, year) {
  const key = `xstats_${type}_${year}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[Savant] Using cached ${type} xStats for ${year} (${cached.length} records)`);
    return cached;
  }

  try {
    const url = `${SAVANT_BASE}?type=${type}&year=${year}&position=&team=&min=1&csv=true`;
    console.log(`[Savant] Fetching ${type} xStats for ${year}...`);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Got HTML instead of CSV — endpoint may be blocked');
    }
    const data = parseCsv(text);
    console.log(`[Savant] Loaded ${data.length} ${type} xStats for ${year}`);
    setCache(key, data);
    return data;
  } catch (e) {
    console.warn(`[Savant] Failed to fetch ${type} xStats: ${e.message}`);
    return [];
  }
}

/**
 * Get pitcher xStats for a season (cached daily).
 * Returns: { player_id, name, era, xera, era_minus_xera_diff, ba (opp), est_ba (xBA), woba, est_woba, ... }
 */
export async function getPitcherXStats(year) {
  return fetchXStats('pitcher', year || new Date().getFullYear());
}

/**
 * Get batter xStats for a season (cached daily).
 * Returns: { player_id, name, ba, est_ba, slg, est_slg, woba, est_woba, ... }
 */
export async function getBatterXStats(year) {
  return fetchXStats('batter', year || new Date().getFullYear());
}

/**
 * Look up a specific player's xStats by name or BDL player_id.
 * @param {'pitcher'|'batter'} type
 * @param {string|number} nameOrId - Player name (partial match) or Savant player_id
 * @param {number} year
 * @returns {Object|null} Player's xStats or null
 */
export async function getPlayerXStats(type, nameOrId, year) {
  const data = await fetchXStats(type, year || new Date().getFullYear());
  if (!data.length) return null;

  const search = String(nameOrId).toLowerCase().trim();

  // Try by player_id first (exact match)
  const byId = data.find(d => String(d.player_id) === search);
  if (byId) return byId;

  // Try by name — Savant CSV splits into last_name + first_name fields
  return data.find(d => {
    const last = (d.last_name || '').toLowerCase();
    const first = (d.first_name || '').toLowerCase();
    return search.includes(last) || last.includes(search) || `${first} ${last}`.includes(search) || `${last}, ${first}`.includes(search);
  }) || null;
}

/**
 * Get xStats for multiple players at once (batch lookup).
 * @param {'pitcher'|'batter'} type
 * @param {Array<string>} names - Player names to look up
 * @param {number} year
 * @returns {Object} Map of name → xStats
 */
export async function getBatchXStats(type, names, year) {
  const data = await fetchXStats(type, year || new Date().getFullYear());
  if (!data.length) return {};

  const results = {};
  for (const name of names) {
    const search = name.toLowerCase().trim();
    const lastName = search.split(' ').pop()?.toLowerCase();
    const match = data.find(d => (d.last_name || '').toLowerCase() === lastName);
    if (match) results[name] = match;
  }
  return results;
}

export default {
  getPitcherXStats,
  getBatterXStats,
  getPlayerXStats,
  getBatchXStats,
};
