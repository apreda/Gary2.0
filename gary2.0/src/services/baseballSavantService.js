import { recordPickDataFailure } from './pickDataIntegrity.js';
/**
 * Baseball Savant xStats Service
 *
 * Free public CSV endpoints — no API key needed.
 * Returns expected stats (xBA, xSLG, xWOBA) for all MLB pitchers and batters,
 * plus per-pitch average velocity arsenals (the one pitcher metric BDL doesn't carry).
 * Expected stats measure performance based on contact quality (exit velo, launch angle)
 * rather than actual results — the gap between actual and expected signals regression.
 *
 * Cached in memory with 24hr TTL (data changes daily during season).
 * Two calls cache the entire league: ~873 pitchers + ~673 batters.
 */

import { stripXeraFields } from './mlbMetricPolicy.js';

const SAVANT_BASE = 'https://baseballsavant.mlb.com/leaderboard/expected_statistics';
const SAVANT_ARSENAL_BASE = 'https://baseballsavant.mlb.com/leaderboard/pitch-arsenals';

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
async function fetchXStats(type, year, juneEra = false) {
  const key = `xstats_${type}_${year}${juneEra ? '_june' : ''}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[Savant] Using cached ${type} xStats for ${year} (${cached.length} records)`);
    return cached;
  }

  try {
    const url = `${SAVANT_BASE}?type=${type}&year=${year}&position=&team=&min=1&csv=true`;
    console.log(`[Savant] Fetching ${type} xStats for ${year}...`);
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Got HTML instead of CSV — endpoint may be blocked');
    }
    const rows = parseCsv(text);
    const data = juneEra ? rows : stripXeraFields(rows);
    console.log(`[Savant] Loaded ${data.length} ${type} xStats for ${year}`);
    setCache(key, data);
    return data;
  } catch (e) {
    recordPickDataFailure('Baseball Savant', e);
    console.warn(`[Savant] Failed to fetch ${type} xStats: ${e.message}`);
    return [];
  }
}

/**
 * Get pitcher xStats for a season (cached daily).
 * Returns: { player_id, name, era, ba (opp), est_ba (xBA), woba, est_woba, ... }
 */
export async function getPitcherXStats(year) {
  return fetchXStats('pitcher', year || new Date().getFullYear());
}

// September 13 founder direction preserves June's original xERA inputs.
// Only the restored June report imports this reader; the shared/default
// reader and its cache retain the other surfaces' metric policy.
export async function getJunePitcherXStats(year) {
  return fetchXStats('pitcher', year || new Date().getFullYear(), true);
}

/**
 * Get batter xStats for a season (cached daily).
 * Returns: { player_id, name, ba, est_ba, slg, est_slg, woba, est_woba, ... }
 */
export async function getBatterXStats(year) {
  return fetchXStats('batter', year || new Date().getFullYear());
}

/**
 * Find a pitcher row by MLBAM id or name. The leading "last_name, first_name"
 * CSV column splits into last_name + first_name fields (same shift the xStats
 * lookups rely on), so match against those.
 * @param {Array} data - parsed CSV rows
 * @param {string|number} nameOrId - MLBAM id or player name
 * @param {string} idField - CSV id column ('pitcher' or 'player_id')
 */
function findPitcherRow(data, nameOrId, idField) {
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const search = String(nameOrId ?? '').trim();
  if (/^\d+$/.test(search)) return data.find(row => String(row[idField]) === search) || null;
  const key = normalize(search);
  const matches = data.filter(row => key && [row.name, `${row.first_name || ''} ${row.last_name || ''}`, `${row.last_name || ''}, ${row.first_name || ''}`].some(name => normalize(name) === key));
  if (matches.length > 1) throw new Error(`Ambiguous Savant player name: ${search}`);
  return matches[0] || null;
}

// Savant arsenal CSV columns are <code>_avg_speed; map codes to display names
const PITCH_CODE_NAMES = {
  ff: '4-Seam Fastball', si: 'Sinker', fc: 'Cutter', sl: 'Slider', ch: 'Changeup',
  cu: 'Curveball', fs: 'Splitter', kn: 'Knuckleball', st: 'Sweeper', sv: 'Slurve',
};

/**
 * Fetch per-pitch average velocity for all pitchers for a season (cached daily).
 * Source: Savant pitch-arsenals leaderboard CSV — keyed by MLBAM pitcher id.
 * Returns: Array of { 'last_name, first_name', pitcher, ff_avg_speed, si_avg_speed, ... }
 */
export async function getPitcherArsenals(year) {
  const season = year || new Date().getFullYear();
  const key = `arsenal_${season}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[Savant] Using cached pitch arsenals for ${season} (${cached.length} pitchers)`);
    return cached;
  }

  try {
    const url = `${SAVANT_ARSENAL_BASE}?year=${season}&min=1&type=avg_speed&hand=&csv=true`;
    console.log(`[Savant] Fetching pitch arsenals (velocity) for ${season}...`);
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Got HTML instead of CSV — endpoint may be blocked');
    }
    const data = stripXeraFields(parseCsv(text));
    console.log(`[Savant] Loaded pitch arsenals for ${data.length} pitchers (${season})`);
    setCache(key, data);
    return data;
  } catch (e) {
    recordPickDataFailure('Baseball Savant', e);
    console.warn(`[Savant] Failed to fetch pitch arsenals: ${e.message}`);
    return [];
  }
}

/**
 * Look up one pitcher's velocity arsenal by MLBAM id or name.
 * Returns { pitches: [{ code, name, mph }], fastballMph } or null.
 * fastballMph prefers 4-seam, falls back to sinker, then cutter.
 */
export async function getPitcherArsenal(nameOrId, year) {
  const data = await getPitcherArsenals(year);
  if (!data.length) return null;

  const row = findPitcherRow(data, nameOrId, 'pitcher');
  if (!row) return null;

  const pitches = [];
  for (const [code, name] of Object.entries(PITCH_CODE_NAMES)) {
    const mph = row[`${code}_avg_speed`];
    if (typeof mph === 'number' && mph > 0) pitches.push({ code: code.toUpperCase(), name, mph });
  }
  if (!pitches.length) return null;

  const byCode = Object.fromEntries(pitches.map(p => [p.code, p.mph]));
  const fastballMph = byCode.FF ?? byCode.SI ?? byCode.FC ?? null;
  return { pitches, fastballMph };
}

const SAVANT_STATCAST_BASE = 'https://baseballsavant.mlb.com/leaderboard/statcast';

/**
 * Fetch season contact-quality-allowed profiles for all pitchers (cached daily).
 * Source: Savant statcast leaderboard CSV — keyed by MLBAM player_id.
 * Carries barrels allowed (brl_percent of BBE), hard-hit allowed (ev95percent), etc.
 */
export async function getPitcherStatcastProfiles(year) {
  const season = year || new Date().getFullYear();
  const key = `statcast_pitcher_${season}`;
  const cached = getCached(key);
  if (cached) {
    console.log(`[Savant] Using cached pitcher statcast profiles for ${season} (${cached.length} pitchers)`);
    return cached;
  }

  try {
    const url = `${SAVANT_STATCAST_BASE}?type=pitcher&year=${season}&position=&team=&min=1&csv=true`;
    console.log(`[Savant] Fetching pitcher statcast profiles for ${season}...`);
    const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Got HTML instead of CSV — endpoint may be blocked');
    }
    const data = stripXeraFields(parseCsv(text));
    console.log(`[Savant] Loaded pitcher statcast profiles for ${data.length} pitchers (${season})`);
    setCache(key, data);
    return data;
  } catch (e) {
    recordPickDataFailure('Baseball Savant', e);
    console.warn(`[Savant] Failed to fetch pitcher statcast profiles: ${e.message}`);
    return [];
  }
}

/**
 * Season contact-quality profiles for all batters (cached daily), the same
 * Savant statcast leaderboard as the pitchers': batted balls, barrels, balls
 * hit 95+ mph, average exit velocity. Keyed by MLBAM player_id.
 */
export async function getBatterStatcastProfiles(year) {
  const season = year || new Date().getFullYear();
  const key = `statcast_batter_${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const resp = await fetch(`${SAVANT_STATCAST_BASE}?type=batter&year=${season}&position=&team=&min=1&csv=true`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.includes('<!DOCTYPE') || text.includes('<html')) throw new Error('Got HTML instead of CSV — endpoint may be blocked');
    const data = parseCsv(text);
    setCache(key, data);
    return data;
  } catch (e) {
    console.warn(`[Savant] Failed to fetch batter statcast profiles: ${e.message}`);
    return [];
  }
}

/**
 * Look up one pitcher's contact-quality-allowed profile by MLBAM id or name.
 * Returns { brlPercent, ev95Percent, avgHitSpeed, battedBallEvents } or null.
 */
export async function getPitcherStatcastProfile(nameOrId, year) {
  const data = await getPitcherStatcastProfiles(year);
  if (!data.length) return null;
  const row = findPitcherRow(data, nameOrId, 'player_id');
  if (!row) return null;
  const num = (v) => (typeof v === 'number' ? v : null);
  return {
    brlPercent: num(row.brl_percent),
    ev95Percent: num(row.ev95percent),
    avgHitSpeed: num(row.avg_hit_speed),
    battedBallEvents: num(row.attempts),
  };
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

  return findPitcherRow(data, nameOrId, 'player_id');
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
    const match = findPitcherRow(data, name, 'player_id');
    if (match) results[name] = match;
  }
  return results;
}

export default {
  getPitcherXStats,
  getBatterXStats,
  getPlayerXStats,
  getBatchXStats,
  getPitcherArsenals,
  getPitcherArsenal,
  getPitcherStatcastProfiles,
  getPitcherStatcastProfile,
};
