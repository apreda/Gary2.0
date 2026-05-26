import { normalizeTeamAbbreviation } from './agentic/agenticUtils.js';

/**
 * Tank01 Fantasy Stats DFS Service
 * Fetches accurate DFS salaries from Tank01 RapidAPI for NBA and NFL
 *
 * Endpoints:
 * - /getNBADFS?date=YYYYMMDD - NBA DFS salaries (FanDuel + DraftKings) ✅ Working
 * - /getNFLDFS?date=YYYYMMDD - NFL DFS salaries (FanDuel + DraftKings) ⚠️ May return 404 if no games
 *
 * Response Structure (both sports):
 * {
 *   statusCode: 200,
 *   body: {
 *     date: "YYYYMMDD",
 *     draftkings: [{ pos, team, salary, playerID, longName, allValidPositions }, ...],
 *     fanduel: [{ pos, team, salary, playerID, longName, allValidPositions }, ...],
 *     yahoo: [...]
 *   }
 * }
 * 
 * This replaces the unreliable Gemini Grounding approach for salary data.
 */

const TANK01_BASE_URL = 'https://tank01-fantasy-stats.p.rapidapi.com';
const TANK01_HOST = 'tank01-fantasy-stats.p.rapidapi.com';

/**
 * Get the Tank01 RapidAPI key from environment
 * @returns {string|null} API key or null if not set
 */
function getApiKey() {
  return process.env.TANK01_RAPIDAPI_KEY || 
         process.env.VITE_TANK01_RAPIDAPI_KEY ||
         null;
}

/**
 * Format date for Tank01 API (YYYYMMDD format)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {string} Date in YYYYMMDD format
 */
function formatDateForApi(dateStr) {
  // If already in YYYYMMDD format, return as-is
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr;
  }
  // Convert YYYY-MM-DD to YYYYMMDD
  return dateStr.replace(/-/g, '');
}

/**
 * Make a request to the Tank01 API
 * @param {string} endpoint - API endpoint (e.g., '/getNBADFS')
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} API response
 */
async function makeApiRequest(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Tank01 RapidAPI key not configured (TANK01_RAPIDAPI_KEY)');
  }

  const url = new URL(`${TANK01_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  console.log(`[Tank01 DFS] 🔍 Fetching: ${endpoint}?${url.searchParams.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': TANK01_HOST
    }
  });

  if (!response.ok) {
    // 404 usually means no DFS slate for this date
    if (response.status === 404) {
      console.warn(`[Tank01 DFS] ⚠️ No DFS slate found for this date (404)`);
      return { body: {} }; // Return empty body, will result in 0 players
    }
    
    const errorText = await response.text();
    console.error(`[Tank01 DFS] ❌ API error ${response.status}: ${errorText}`);
    throw new Error(`Tank01 API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// SALARY CACHE — one API call per day per platform
// Tank01 returns the SAME salary data for all slates on a given day+platform.
// Cache the raw API response so multiple slates reuse it without extra calls.
// ═══════════════════════════════════════════════════════════════════════════
const _salaryCache = new Map(); // key: "NBA_fanduel_2026-02-21" → { data, parsedByPlatform, at }
const SALARY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch NBA DFS salaries from Tank01
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Promise<Array>} Array of players with salaries
 */
async function fetchNbaDfsSalaries(dateStr, platform = 'draftkings') {
  const cacheKey = `NBA_${dateStr}`;
  const now = Date.now();
  const cached = _salaryCache.get(cacheKey);

  // If we already fetched this day's data, parse for the requested platform
  if (cached && (now - cached.at) < SALARY_CACHE_TTL) {
    // Check if we already parsed for this platform
    if (cached.parsedByPlatform[platform]) {
      const players = cached.parsedByPlatform[platform];
      console.log(`[Tank01 DFS] Using cached NBA salary data for ${platform} (${players.length} players)`);
      return {
        players,
        source: 'Tank01 API (cached)',
        platform,
        date: dateStr,
        fetchTimeMs: 0
      };
    }
    // Cached raw data but need to parse for this platform
    const players = parseNbaResponse(cached.data, platform);
    cached.parsedByPlatform[platform] = players;
    console.log(`[Tank01 DFS] Parsed cached NBA data for ${platform}: ${players.length} players`);
    return {
      players,
      source: 'Tank01 API (cached)',
      platform,
      date: dateStr,
      fetchTimeMs: 0
    };
  }

  const startTime = Date.now();

  try {
    const apiDate = formatDateForApi(dateStr);
    const data = await makeApiRequest('/getNBADFS', { date: apiDate });

    const duration = Date.now() - startTime;
    console.log(`[Tank01 DFS] ✅ NBA DFS response in ${duration}ms`);

    // Parse for requested platform
    const players = parseNbaResponse(data, platform);
    console.log(`[Tank01 DFS] 📊 Found ${players.length} NBA players for ${platform}`);

    // Cache the raw response + parsed result for reuse across slates
    _salaryCache.set(cacheKey, {
      data,
      parsedByPlatform: { [platform]: players },
      at: now
    });

    return {
      players,
      source: 'Tank01 API',
      platform,
      date: dateStr,
      fetchTimeMs: duration
    };

  } catch (error) {
    console.error(`[Tank01 DFS] ❌ NBA fetch failed: ${error.message}`);
    return {
      players: [],
      source: 'Tank01 API',
      platform,
      date: dateStr,
      error: error.message
    };
  }
}

/**
 * Fetch NFL DFS salaries from Tank01
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Promise<Array>} Array of players with salaries
 */
async function fetchNflDfsSalaries(dateStr, platform = 'draftkings') {
  const startTime = Date.now();
  
  try {
    const apiDate = formatDateForApi(dateStr);
    const data = await makeApiRequest('/getNFLDFS', { date: apiDate });
    
    const duration = Date.now() - startTime;
    console.log(`[Tank01 DFS] ✅ NFL DFS response in ${duration}ms`);
    
    // Parse and map the response to our expected format
    const players = parseNflResponse(data, platform);
    console.log(`[Tank01 DFS] 📊 Found ${players.length} NFL players for ${platform}`);
    
    return {
      players,
      source: 'Tank01 API',
      platform,
      date: dateStr,
      fetchTimeMs: duration
    };
    
  } catch (error) {
    console.error(`[Tank01 DFS] ❌ NFL fetch failed: ${error.message}`);
    return {
      players: [],
      source: 'Tank01 API',
      platform,
      date: dateStr,
      error: error.message
    };
  }
}

/**
 * Parse NBA DFS response from Tank01
 * Maps Tank01 format to our internal player format
 * 
 * Tank01 NBA response structure:
 * {
 *   statusCode: 200,
 *   body: {
 *     date: "20250120",
 *     draftkings: [{pos, team, salary, playerID, longName, allValidPositions}, ...],
 *     fanduel: [{pos, team, salary, playerID, longName, allValidPositions}, ...],
 *     yahoo: [...]
 *   }
 * }
 * 
 * @param {Object} data - Raw API response
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Parsed player array
 */
function parseNbaResponse(data, platform) {
  const players = [];
  
  // Tank01 NBA response: data.body contains platform-specific arrays
  const body = data?.body;
  if (!body) {
    console.warn('[Tank01 DFS] No body in NBA response');
    return players;
  }
  
  // Get platform-specific player array
  const platformKey = platform === 'fanduel' ? 'fanduel' : 'draftkings';
  const rawPlayers = body[platformKey];
  
  if (!rawPlayers || !Array.isArray(rawPlayers)) {
    console.warn(`[Tank01 DFS] No ${platformKey} array in NBA response`);
    return players;
  }
  
  console.log(`[Tank01 DFS] Parsing ${rawPlayers.length} ${platformKey} NBA players`);
  
  for (const p of rawPlayers) {
    if (!p) continue;
    
    // Salary is already platform-specific (string format like "10300")
    const salary = parseSalary(p.salary);
    
    // Skip players without salary
    if (!salary || salary <= 0) continue;
    
    // Map position to standard format
    // Use allValidPositions[0] if available, otherwise use pos
    const primaryPos = p.allValidPositions?.[0] || p.pos;
    const position = normalizeNbaPosition(primaryPos);
    
    // Parse injury status
    const status = parseInjuryStatus(p.injury || p.injuryStatus || p.status);
    
    players.push({
      name: p.longName || p.playerName || p.name,
      team: normalizeTeamAbbreviation(p.team || p.teamAbv),
      position,
      salary,
      status,
      // Additional data
      playerId: p.playerID || p.playerId,
      positions: p.allValidPositions || [position],
      teamId: p.teamID,
      projection: 0 // Will be calculated by dfsLineupService using BDL stats
    });
  }
  
  return players;
}

/**
 * Parse NFL DFS response from Tank01
 * Maps Tank01 format to our internal player format
 * 
 * Expected Tank01 NFL response structure (similar to NBA):
 * {
 *   statusCode: 200,
 *   body: {
 *     date: "20250105",
 *     draftkings: [{pos, team, salary, playerID, longName, allValidPositions}, ...],
 *     fanduel: [{pos, team, salary, playerID, longName, allValidPositions}, ...],
 *     yahoo: [...]
 *   }
 * }
 * 
 * @param {Object} data - Raw API response
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Parsed player array
 */
function parseNflResponse(data, platform) {
  const players = [];
  
  // Tank01 NFL response: data.body contains platform-specific arrays
  const body = data?.body;
  if (!body) {
    console.warn('[Tank01 DFS] No body in NFL response');
    return players;
  }
  
  // Get platform-specific player array
  const platformKey = platform === 'fanduel' ? 'fanduel' : 'draftkings';
  const rawPlayers = body[platformKey];
  
  if (!rawPlayers || !Array.isArray(rawPlayers)) {
    console.warn(`[Tank01 DFS] No ${platformKey} array in NFL response`);
    return players;
  }
  
  console.log(`[Tank01 DFS] Parsing ${rawPlayers.length} ${platformKey} NFL players`);
  
  for (const p of rawPlayers) {
    if (!p) continue;
    
    // Salary is already platform-specific
    const salary = parseSalary(p.salary);
    
    // Skip players without salary
    if (!salary || salary <= 0) continue;
    
    // Map position to standard format
    const primaryPos = p.allValidPositions?.[0] || p.pos;
    const position = normalizeNflPosition(primaryPos);
    
    // Parse injury status
    const status = parseInjuryStatus(p.injury || p.injuryStatus || p.status);
    
    players.push({
      name: p.longName || p.playerName || p.name,
      team: normalizeTeamAbbreviation(p.team || p.teamAbv),
      position,
      salary,
      status,
      // Additional data
      playerId: p.playerID || p.playerId,
      positions: p.allValidPositions || [position],
      teamId: p.teamID,
      projection: 0 // Will be calculated by dfsLineupService
    });
  }
  
  return players;
}

/**
 * Parse salary value - handles string with $ and commas
 * @param {string|number} value - Salary value
 * @returns {number} Parsed salary as integer
 */
function parseSalary(value) {
  if (!value) return 0;
  if (typeof value === 'number') return Math.round(value);
  
  // Remove $ and commas, parse as integer
  const cleaned = String(value).replace(/[$,]/g, '').trim();
  return parseInt(cleaned, 10) || 0;
}

/**
 * Normalize NBA position to standard format
 * @param {string} position - Raw position string
 * @returns {string} Normalized position (PG, SG, SF, PF, C, G, F, UTIL)
 */
function normalizeNbaPosition(position) {
  if (!position) return 'UTIL';
  
  const pos = position.toUpperCase().trim();
  
  // Standard positions
  if (['PG', 'SG', 'SF', 'PF', 'C'].includes(pos)) return pos;
  
  // Combo positions
  if (pos === 'G' || pos === 'GUARD') return 'G';
  if (pos === 'F' || pos === 'FORWARD') return 'F';
  if (pos.includes('/')) {
    // Handle "PG/SG" format
    const parts = pos.split('/');
    return parts[0]; // Return primary position
  }
  if (pos === 'C/F' || pos === 'F/C') return 'PF';
  if (pos === 'G/F' || pos === 'F/G') return 'SF';
  
  return 'UTIL';
}

/**
 * Normalize NFL position to standard format
 * @param {string} position - Raw position string
 * @returns {string} Normalized position (QB, RB, WR, TE, K, DST, FLEX)
 */
function normalizeNflPosition(position) {
  if (!position) return 'FLEX';
  
  const pos = position.toUpperCase().trim();
  
  // Standard positions
  if (['QB', 'RB', 'WR', 'TE', 'K'].includes(pos)) return pos;
  
  // Defense variations
  if (pos === 'DST' || pos === 'DEF' || pos === 'D/ST' || pos === 'D') return 'DST';
  
  // Kicker variations
  if (pos === 'PK' || pos === 'KICKER') return 'K';
  
  return 'FLEX';
}


/**
 * Parse injury status to standard format
 * @param {string} status - Raw injury status
 * @returns {string} Normalized status (HEALTHY, OUT, GTD, QUESTIONABLE, DOUBTFUL)
 */
function parseInjuryStatus(status) {
  if (!status) return 'HEALTHY';
  
  const statusUpper = status.toUpperCase().trim();
  
  if (statusUpper.includes('OUT') || statusUpper === 'O') return 'OUT';
  if (statusUpper.includes('DOUBTFUL') || statusUpper === 'D') return 'DOUBTFUL';
  if (statusUpper.includes('QUESTIONABLE') || statusUpper === 'Q') return 'QUESTIONABLE';
  if (statusUpper.includes('GTD') || statusUpper.includes('GAME TIME')) return 'GTD';
  if (statusUpper.includes('PROBABLE') || statusUpper === 'P') return 'PROBABLE';
  if (statusUpper.includes('IR') || statusUpper.includes('INJURED RESERVE')) return 'OUT';
  if (statusUpper.includes('SUSP') || statusUpper.includes('SUSPENDED')) return 'OUT';
  
  return 'HEALTHY';
}

/**
 * Fetch MLB DFS salaries from Tank01
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Promise<Object>} Salary data result
 */
async function fetchMlbDfsSalaries(dateStr, platform = 'draftkings') {
  const cacheKey = `MLB_${dateStr}`;
  const now = Date.now();
  const cached = _salaryCache.get(cacheKey);

  if (cached && (now - cached.at) < SALARY_CACHE_TTL) {
    if (cached.parsedByPlatform[platform]) {
      const players = cached.parsedByPlatform[platform];
      console.log(`[Tank01 DFS] Using cached MLB salary data for ${platform} (${players.length} players)`);
      return { players, source: 'Tank01 API (cached)', platform, date: dateStr, fetchTimeMs: 0 };
    }
    const players = parseMlbResponse(cached.data, platform);
    cached.parsedByPlatform[platform] = players;
    console.log(`[Tank01 DFS] Parsed cached MLB data for ${platform}: ${players.length} players`);
    return { players, source: 'Tank01 API (cached)', platform, date: dateStr, fetchTimeMs: 0 };
  }

  const startTime = Date.now();

  try {
    const apiDate = formatDateForApi(dateStr);
    const data = await makeApiRequest('/getMLBDFS', { date: apiDate });

    const duration = Date.now() - startTime;
    console.log(`[Tank01 DFS] ✅ MLB DFS response in ${duration}ms`);

    const players = parseMlbResponse(data, platform);
    console.log(`[Tank01 DFS] 📊 Found ${players.length} MLB players for ${platform}`);

    _salaryCache.set(cacheKey, {
      data,
      parsedByPlatform: { [platform]: players },
      at: now
    });

    return { players, source: 'Tank01 API', platform, date: dateStr, fetchTimeMs: duration };
  } catch (error) {
    console.error(`[Tank01 DFS] ❌ MLB fetch failed: ${error.message}`);
    return { players: [], source: 'Tank01 API', platform, date: dateStr, error: error.message };
  }
}

/**
 * Parse MLB DFS response from Tank01
 * @param {Object} data - Raw API response
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Parsed player array
 */
function parseMlbResponse(data, platform) {
  const players = [];

  const body = data?.body;
  if (!body) {
    console.warn('[Tank01 DFS] No body in MLB response');
    return players;
  }

  const platformKey = platform === 'fanduel' ? 'fanduel' : 'draftkings';
  const rawPlayers = body[platformKey];

  if (!rawPlayers || !Array.isArray(rawPlayers)) {
    console.warn(`[Tank01 DFS] No ${platformKey} array in MLB response`);
    return players;
  }

  console.log(`[Tank01 DFS] Parsing ${rawPlayers.length} ${platformKey} MLB players`);

  for (const p of rawPlayers) {
    if (!p) continue;

    const salary = parseSalary(p.salary);
    if (!salary || salary <= 0) continue;

    const primaryPos = p.allValidPositions?.[0] || p.pos;
    const position = normalizeMlbPosition(primaryPos);
    const status = parseInjuryStatus(p.injury || p.injuryStatus || p.status);

    players.push({
      name: p.longName || p.playerName || p.name,
      team: normalizeTeamAbbreviation(p.team || p.teamAbv),
      position,
      salary,
      status,
      playerId: p.playerID || p.playerId,
      positions: (p.allValidPositions || [position]).map(normalizeMlbPosition),
      teamId: p.teamID,
      projection: 0
    });
  }

  return players;
}

/**
 * Normalize MLB position to standard format
 * @param {string} position - Raw position string
 * @returns {string} Normalized position
 */
function normalizeMlbPosition(position) {
  if (!position) return 'UTIL';

  const pos = position.toUpperCase().trim();

  // Pitchers
  if (pos === 'SP' || pos === 'RP' || pos === 'P' || pos === 'PITCHER') return 'P';

  // Standard positions
  if (['C', '1B', '2B', '3B', 'SS', 'DH'].includes(pos)) return pos;

  // Outfield variations
  if (pos === 'OF' || pos === 'LF' || pos === 'CF' || pos === 'RF') return 'OF';

  // Catcher variations
  if (pos === 'CATCHER') return 'C';

  return 'UTIL';
}

/**
 * Main function to fetch DFS salaries for any sport
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Promise<Object>} Salary data result
 */
export async function fetchDfsSalaries(sport, dateStr, platform = 'draftkings') {
  console.log(`[Tank01 DFS] Fetching ${sport} ${platform} salaries for ${dateStr}`);
  
  if (sport.toUpperCase() === 'NBA') {
    return fetchNbaDfsSalaries(dateStr, platform);
  } else if (sport.toUpperCase() === 'NFL') {
    return fetchNflDfsSalaries(dateStr, platform);
  } else if (sport.toUpperCase() === 'MLB') {
    return fetchMlbDfsSalaries(dateStr, platform);
  } else {
    return {
      players: [],
      source: 'Tank01 API',
      platform,
      date: dateStr,
      error: `Unsupported sport: ${sport}`
    };
  }
}

// ============================================================================
// NBA TEAM ROSTER DATA (Player enrichment: TS%, eFG%, injury context, etc.)
// ============================================================================

// Cache roster data per team (30 min TTL — doesn't change mid-session)
const _rosterCache = new Map();
const ROSTER_CACHE_TTL = 30 * 60 * 1000;

/**
 * Fetch NBA team roster with player averages from Tank01
 * Returns per-player: injury details, lastGamePlayed, TS%, eFG%, full stat line
 *
 * @param {string} teamAbv - Team abbreviation (e.g., "CHA", "ATL")
 * @returns {Promise<Array>} Array of player objects with enriched stats
 */
// Reverse mapping: standard abbreviations → Tank01's expected format
const TANK01_ABV_MAP = {
  'SAS': 'SA',
  'GSW': 'GS',
  'NOP': 'NO',
  'PHX': 'PHO'
};

function toTank01Abv(standardAbv) {
  const upper = (standardAbv || '').toUpperCase();
  return TANK01_ABV_MAP[upper] || upper;
}

async function fetchNbaTeamRoster(teamAbv) {
  const key = teamAbv.toUpperCase();
  const tank01Key = toTank01Abv(key);
  const now = Date.now();
  const cached = _rosterCache.get(key);
  if (cached && (now - cached.at) < ROSTER_CACHE_TTL) {
    return cached.data;
  }

  try {
    const data = await makeApiRequest('/getNBATeamRoster', {
      teamAbv: tank01Key,
      statsToGet: 'averages'
    });

    const roster = data?.body?.roster || [];
    const players = roster.map(p => ({
      longName: p.longName || `${p.espnName || ''}`,
      team: key,
      pos: p.pos || '',
      injury: p.injury || null,
      lastGamePlayed: p.lastGamePlayed || null,
      stats: p.stats || null,
      nbaComHeadshot: p.nbaComHeadshot || null,
      playerID: p.playerID || null,
      bDay: p.bDay || null,
      exp: p.exp || null
    }));

    _rosterCache.set(key, { data: players, at: now });
    console.log(`[Tank01 DFS] Roster for ${key}: ${players.length} players`);
    return players;
  } catch (err) {
    console.warn(`[Tank01 DFS] Roster fetch failed for ${key}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch roster data for multiple teams in staggered batches
 * Batches 4 teams at a time with 300ms delay between batches to avoid Tank01 rate limits
 * @param {string[]} teamAbvs - Array of team abbreviations
 * @returns {Promise<Map<string, Array>>} Map of team → players
 */
export async function fetchNbaRostersForTeams(teamAbvs) {
  const results = new Map();
  const BATCH_SIZE = 4;
  const BATCH_DELAY_MS = 300;

  for (let i = 0; i < teamAbvs.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    const batch = teamAbvs.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (team) => {
      const roster = await fetchNbaTeamRoster(team);
      results.set(team.toUpperCase(), roster);
    }));
  }
  return results;
}

/**
 * Extract enrichment data for a specific player from Tank01 roster
 * Returns: TS%, eFG%, injury context, lastGamePlayed, minutes, games played
 *
 * @param {Object} rosterPlayer - Tank01 roster player object
 * @returns {Object} Enrichment data to merge into DFS player
 */
export function extractPlayerEnrichment(rosterPlayer) {
  if (!rosterPlayer) return null;

  const stats = rosterPlayer.stats || {};
  const injury = rosterPlayer.injury || {};

  return {
    tsPercent: stats.trueShootingPercentage ? parseFloat(stats.trueShootingPercentage) : null,
    efgPercent: stats.effectiveShootingPercentage ? parseFloat(stats.effectiveShootingPercentage) : null,
    avgMinutes: stats.mins ? parseFloat(stats.mins) : null,
    gamesPlayed: stats.gamesPlayed ? parseInt(stats.gamesPlayed, 10) : null,
    fgPercent: stats.fgp ? parseFloat(stats.fgp) : null,
    threePtPercent: stats.tptfgp ? parseFloat(stats.tptfgp) : null,
    ftPercent: stats.ftp ? parseFloat(stats.ftp) : null,
    turnovers: stats.TOV ? parseFloat(stats.TOV) : null,
    // Injury context
    injuryDesignation: injury.designation || null,
    injuryDescription: injury.description || null,
    injuryReturnDate: injury.injReturnDate || null,
    // Last game played (trade/return detection)
    lastGamePlayed: rosterPlayer.lastGamePlayed || null
  };
}

// ============================================================================
// NBA TEAM DEFENSE (DvP — Defense vs Position)
// ============================================================================

let _teamStatsCache = null;
let _teamStatsCachedAt = 0;
const TEAM_STATS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch all NBA team stats including defensive stats by position (DvP)
 * One call returns all 30 teams.
 *
 * @returns {Promise<Map<string, Object>>} Map of teamAbv → team stats with defensiveStats
 */
export async function fetchNbaTeamDefenseStats() {
  const now = Date.now();
  if (_teamStatsCache && (now - _teamStatsCachedAt) < TEAM_STATS_CACHE_TTL) {
    console.log(`[Tank01 DFS] Using cached team defense stats`);
    return _teamStatsCache;
  }

  try {
    const data = await makeApiRequest('/getNBATeams', { teamStats: 'true' });
    const teams = data?.body || [];

    const teamMap = new Map();
    for (const team of teams) {
      const abv = normalizeTeamAbbreviation(team.teamAbv || '');
      if (!abv || abv === 'UNK') continue;

      teamMap.set(abv, {
        teamAbv: abv,
        teamName: team.teamName || '',
        teamCity: team.teamCity || '',
        defensiveStats: team.defensiveStats || null,
        offensiveStats: team.offensiveStats || null,
        wins: team.wins || '0',
        losses: team.loss || '0'
      });
    }

    _teamStatsCache = teamMap;
    _teamStatsCachedAt = now;
    console.log(`[Tank01 DFS] Team defense stats loaded for ${teamMap.size} teams`);
    return teamMap;
  } catch (err) {
    console.warn(`[Tank01 DFS] Team defense fetch failed: ${err.message}`);
    return new Map();
  }
}

/**
 * Get DvP (Defense vs Position) data for a player's matchup
 *
 * @param {string} opponentAbv - Opponent team abbreviation
 * @param {string} position - Player position (PG, SG, SF, PF, C)
 * @param {Map} teamStatsMap - Pre-fetched team stats map
 * @returns {Object|null} DvP data: { oppDvpPts, oppDvpReb, oppDvpAst, oppDvpStl, oppDvpBlk }
 */
export function getPlayerDvP(opponentAbv, position, teamStatsMap) {
  if (!opponentAbv || !position || !teamStatsMap) return null;

  const oppStats = teamStatsMap.get(opponentAbv.toUpperCase());
  if (!oppStats?.defensiveStats) return null;

  const dvp = oppStats.defensiveStats;
  const pos = position.toUpperCase();

  // Map DFS positions to DvP positions
  // G → PG (guard), F → SF (forward), UTIL → ignore
  const dvpPos = pos === 'G' ? 'PG' : pos === 'F' ? 'SF' : pos;
  if (!['PG', 'SG', 'SF', 'PF', 'C'].includes(dvpPos)) return null;

  return {
    oppDvpPts: dvp.pts?.[dvpPos] ? parseFloat(dvp.pts[dvpPos]) : null,
    oppDvpReb: dvp.reb?.[dvpPos] ? parseFloat(dvp.reb[dvpPos]) : null,
    oppDvpAst: dvp.ast?.[dvpPos] ? parseFloat(dvp.ast[dvpPos]) : null,
    oppDvpStl: dvp.stl?.[dvpPos] ? parseFloat(dvp.stl[dvpPos]) : null,
    oppDvpBlk: dvp.blk?.[dvpPos] ? parseFloat(dvp.blk[dvpPos]) : null,
    oppDvpTotalPts: dvp.pts?.Total ? parseFloat(dvp.pts.Total) : null,
    oppGamesPlayed: dvp.gamesPlayed ? parseInt(dvp.gamesPlayed, 10) : null,
    position: dvpPos
  };
}

// ============================================================================
// NBA PROJECTIONS (Benchmark — Gary makes his own, this is sanity check)
// ============================================================================

let _projectionsCache = null;
let _projectionsCachedAt = 0;
const PROJECTIONS_CACHE_TTL = 30 * 60 * 1000;

/**
 * Fetch NBA player projections from Tank01
 * These are BENCHMARKS — Gary makes his OWN projections using Socratic reasoning.
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<Map<string, Object>>} Map of playerName → projection data
 */
export async function fetchNbaProjections(dateStr) {
  const now = Date.now();
  if (_projectionsCache && (now - _projectionsCachedAt) < PROJECTIONS_CACHE_TTL) {
    console.log(`[Tank01 DFS] Using cached projections`);
    return _projectionsCache;
  }

  try {
    const apiDate = formatDateForApi(dateStr);
    // Tank01 requires numOfDays=7 or numOfDays=14 (1 returns empty body)
    const data = await makeApiRequest('/getNBAProjections', {
      numOfDays: '7',
      date: apiDate
    });

    const projections = data?.body?.playerProjections || {};
    const projMap = new Map();

    // Tank01 returns 7-day TOTALS, not per-game projections.
    // Estimate games per player in 7-day window: NBA plays ~3.2 games/week.
    // Use games_remaining field if available, otherwise default to 3.
    const DEFAULT_GAMES_IN_WINDOW = 3;

    for (const [id, proj] of Object.entries(projections)) {
      const name = (proj.longName || '').trim().toLowerCase();
      if (!name) continue;

      const gamesInWindow = proj.games ? parseInt(proj.games) : DEFAULT_GAMES_IN_WINDOW;
      const divisor = Math.max(gamesInWindow, 1); // prevent division by zero

      projMap.set(name, {
        playerID: id,
        longName: proj.longName,
        team: normalizeTeamAbbreviation(proj.team || ''),
        pos: proj.pos || '',
        projPts: proj.pts ? parseFloat(proj.pts) / divisor : 0,
        projReb: proj.reb ? parseFloat(proj.reb) / divisor : 0,
        projAst: proj.ast ? parseFloat(proj.ast) / divisor : 0,
        projStl: proj.stl ? parseFloat(proj.stl) / divisor : 0,
        projBlk: proj.blk ? parseFloat(proj.blk) / divisor : 0,
        projTov: proj.TOV ? parseFloat(proj.TOV) / divisor : 0,
        projFpts: proj.fantasyPoints ? parseFloat(proj.fantasyPoints) / divisor : 0
      });

      // Sanity cap: no single-game projection should exceed 100 FPTS
      const entry = projMap.get(name);
      if (entry.projFpts > 100) {
        console.warn(`[Tank01 DFS] ⚠️ Projection sanity cap: ${proj.longName} had ${entry.projFpts} FPTS — zeroing out (likely cumulative data)`);
        entry.projFpts = 0;
      }
    }

    _projectionsCache = projMap;
    _projectionsCachedAt = now;
    console.log(`[Tank01 DFS] Projections loaded for ${projMap.size} players`);
    return projMap;
  } catch (err) {
    console.warn(`[Tank01 DFS] Projections fetch failed: ${err.message}`);
    return new Map();
  }
}

// ============================================================================
// TANK01 BOX SCORES — Full per-player box scores with usage%, plus/minus
// Better than BDL for DFS: includes usage% per game, shooting splits, plus/minus
// ============================================================================

/**
 * Fetch box score for a specific game from Tank01
 * @param {string} gameID - Game ID format: YYYYMMDD_AWAY@HOME (e.g., "20260319_CLE@CHI")
 * @returns {Promise<Object>} Box score with playerStats, teamStats, scores
 */
async function fetchBoxScore(gameID) {
  try {
    const data = await makeApiRequest('/getNBABoxScore', { gameID });
    const body = data?.body || {};
    if (!body.playerStats) {
      return { gameID, error: 'No player stats in box score', players: [] };
    }

    const players = Object.values(body.playerStats).map(p => ({
      name: p.longName,
      team: p.teamAbv,
      minutes: parseInt(p.mins) || 0,
      pts: parseInt(p.pts) || 0,
      reb: parseInt(p.reb) || 0,
      ast: parseInt(p.ast) || 0,
      stl: parseInt(p.stl) || 0,
      blk: parseInt(p.blk) || 0,
      tov: parseInt(p.TOV) || 0,
      fg: `${p.fgm}/${p.fga}`,
      fgPct: parseFloat(p.fgp) || 0,
      threePt: `${p.tptfgm}/${p.tptfga}`,
      threePtPct: parseFloat(p.tptfgp) || 0,
      ft: `${p.ftm}/${p.fta}`,
      ftPct: parseFloat(p.ftp) || 0,
      offReb: parseInt(p.OffReb) || 0,
      defReb: parseInt(p.DefReb) || 0,
      plusMinus: p.plusMinus || '0',
      usage: parseFloat(p.usage) || 0,
      fouls: parseInt(p.PF) || 0,
      playerID: p.playerID,
    }));

    return {
      gameID,
      gameDate: body.gameDate,
      home: body.home,
      away: body.away,
      homeScore: parseInt(body.homePts) || 0,
      awayScore: parseInt(body.awayPts) || 0,
      arena: body.arena,
      players,
    };
  } catch (err) {
    console.warn(`[Tank01 DFS] Box score fetch failed for ${gameID}: ${err.message}`);
    return { gameID, error: err.message, players: [] };
  }
}

// ============================================================================
// TANK01 SCHEDULE — Full team schedule with next game lookahead
// Useful for: B2B detection, rest decisions, look-ahead spots
// ============================================================================

// Cache per team (schedule doesn't change within a day)
const _scheduleCache = new Map();
const SCHEDULE_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Fetch team schedule and return next-game context
 * @param {string} teamAbv - Team abbreviation (e.g., "BOS")
 * @param {string} dateStr - Today's date in YYYY-MM-DD format
 * @returns {Promise<Object>} Schedule context with next game info
 */
async function fetchTeamScheduleContext(teamAbv, dateStr) {
  const cacheKey = `${teamAbv}_${dateStr}`;
  const cached = _scheduleCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < SCHEDULE_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Tank01 uses different abbreviations for some teams
    const tank01Abv = teamAbv === 'GSW' ? 'GS' : teamAbv === 'NOP' ? 'NO' : teamAbv === 'SAS' ? 'SA' : teamAbv === 'PHX' ? 'PHO' : teamAbv;
    const data = await makeApiRequest('/getNBATeamSchedule', { teamAbv: tank01Abv });
    const schedule = data?.body?.schedule || [];

    const todayNum = dateStr.replace(/-/g, '');
    const todayGame = schedule.find(g => g.gameDate === todayNum);
    const futureGames = schedule.filter(g => g.gameDate > todayNum).sort((a, b) => a.gameDate.localeCompare(b.gameDate));
    const pastGames = schedule.filter(g => g.gameDate < todayNum && g.gameStatusCode === '2').sort((a, b) => b.gameDate.localeCompare(a.gameDate));
    const nextGame = futureGames[0] || null;
    const lastGame = pastGames[0] || null;

    // Check if tomorrow is a game (B2B lookahead)
    const tomorrow = new Date(dateStr + 'T12:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowNum = tomorrow.toISOString().split('T')[0].replace(/-/g, '');
    const playsTomorrow = futureGames.some(g => g.gameDate === tomorrowNum);

    const result = {
      team: teamAbv,
      todayGame: todayGame ? { opponent: todayGame.home === tank01Abv ? todayGame.away : todayGame.home, isHome: todayGame.home === tank01Abv, gameTime: todayGame.gameTime } : null,
      nextGame: nextGame ? { date: nextGame.gameDate, opponent: nextGame.home === tank01Abv ? nextGame.away : nextGame.home, isHome: nextGame.home === tank01Abv } : null,
      playsTomorrow,
      lastGame: lastGame ? { date: lastGame.gameDate, opponent: lastGame.home === tank01Abv ? lastGame.away : lastGame.home, result: lastGame.homeResult === 'W' && lastGame.home === tank01Abv ? 'W' : lastGame.awayResult === 'W' && lastGame.away === tank01Abv ? 'W' : 'L', score: `${lastGame.awayPts}-${lastGame.homePts}` } : null,
      // Recent games played (for B2B/rest context)
      gamesInLast7Days: pastGames.filter(g => {
        const gDate = `${g.gameDate.slice(0,4)}-${g.gameDate.slice(4,6)}-${g.gameDate.slice(6,8)}`;
        const diff = (new Date(dateStr) - new Date(gDate)) / (1000*60*60*24);
        return diff <= 7;
      }).length,
    };

    _scheduleCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[Tank01 DFS] Schedule fetch failed for ${teamAbv}: ${err.message}`);
    return { team: teamAbv, error: err.message };
  }
}

/**
 * Fetch game IDs for a date (needed to fetch box scores)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of { gameID, home, away }
 */
async function fetchGameIDsForDate(dateStr) {
  try {
    const apiDate = formatDateForApi(dateStr);
    const data = await makeApiRequest('/getNBAGamesForDate', { gameDate: apiDate });
    const games = data?.body || [];
    if (!Array.isArray(games)) return [];
    return games.map(g => ({ gameID: g.gameID, home: g.home, away: g.away, date: g.gameDate }));
  } catch (err) {
    console.warn(`[Tank01 DFS] Game IDs fetch failed: ${err.message}`);
    return [];
  }
}

// ============================================================================
// TANK01 TEAM L-STATS — L1/L3/L5/L10 team-level stats from box scores
// Computes per-game averages for shooting, pace, paint scoring, turnovers, etc.
// ============================================================================

const _teamLStatsCache = new Map();
const TEAM_LSTATS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Compute team-level stats for last N games using Tank01 box scores
 * Returns full shooting, pace, paint, fast break, rebounds, turnovers, and opponent stats
 *
 * @param {string} teamAbv - Team abbreviation (e.g., "BOS")
 * @param {number} numGames - Number of recent games (1, 3, 5, 10)
 * @param {string} dateStr - Reference date YYYY-MM-DD (games on or before this date)
 * @returns {Promise<Object>} Team L-stats with per-game averages
 */
async function fetchTeamLStats(teamAbv, numGames = 5, dateStr = null) {
  const today = dateStr || new Date().toISOString().split('T')[0];
  const todayNum = today.replace(/-/g, '');
  const cacheKey = `${teamAbv}_L${numGames}_${todayNum}`;
  const cached = _teamLStatsCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < TEAM_LSTATS_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Tank01 uses different abbreviations
    const tank01Abv = teamAbv === 'GSW' ? 'GS' : teamAbv === 'NOP' ? 'NO' : teamAbv === 'SAS' ? 'SA' : teamAbv === 'PHX' ? 'PHO' : teamAbv;

    // Step 1: Get team schedule to find last N game IDs
    const schedData = await makeApiRequest('/getNBATeamSchedule', { teamAbv: tank01Abv });
    const schedule = schedData?.body?.schedule || [];
    const recentGames = schedule
      .filter(g => g.gameStatusCode === '2' && g.gameDate <= todayNum)
      .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
      .slice(0, numGames);

    if (recentGames.length === 0) {
      return { team: teamAbv, error: 'No recent completed games found', games: 0 };
    }

    // Step 2: Fetch box scores for each game
    const teamGameStats = [];
    const oppGameStats = [];

    for (const g of recentGames) {
      try {
        const boxData = await makeApiRequest('/getNBABoxScore', { gameID: g.gameID });
        const ts = boxData?.body?.teamStats;
        if (!ts) continue;

        const isHome = g.home === tank01Abv;
        const oppAbv = isHome ? g.away : g.home;
        const teamBox = ts[tank01Abv];
        const oppBox = ts[oppAbv];
        if (!teamBox) continue;

        const parse = (obj, field) => parseFloat(obj?.[field]) || 0;

        teamGameStats.push({
          date: g.gameDate,
          opp: oppAbv,
          isHome,
          pts: parse(teamBox, 'pts'),
          fgm: parse(teamBox, 'fgm'), fga: parse(teamBox, 'fga'),
          fg3m: parse(teamBox, 'tptfgm'), fg3a: parse(teamBox, 'tptfga'),
          ftm: parse(teamBox, 'ftm'), fta: parse(teamBox, 'fta'),
          reb: parse(teamBox, 'reb'), oreb: parse(teamBox, 'OffReb'), dreb: parse(teamBox, 'DefReb'),
          ast: parse(teamBox, 'ast'), tov: parse(teamBox, 'TOV'),
          stl: parse(teamBox, 'stl'), blk: parse(teamBox, 'blk'),
          pf: parse(teamBox, 'PF'),
          pace: parse(teamBox, 'numberOfPossessions'),
          paintPts: parse(teamBox, 'pointsInPaint'),
          fastBreak: parse(teamBox, 'fastBreakPts'),
          ptsOffTov: parse(teamBox, 'ptsOffTOV'),
        });

        if (oppBox) {
          oppGameStats.push({
            pts: parse(oppBox, 'pts'),
            fgm: parse(oppBox, 'fgm'), fga: parse(oppBox, 'fga'),
            fg3m: parse(oppBox, 'tptfgm'), fg3a: parse(oppBox, 'tptfga'),
            ftm: parse(oppBox, 'ftm'), fta: parse(oppBox, 'fta'),
            reb: parse(oppBox, 'reb'), oreb: parse(oppBox, 'OffReb'),
            ast: parse(oppBox, 'ast'), tov: parse(oppBox, 'TOV'),
            paintPts: parse(oppBox, 'pointsInPaint'),
          });
        }
      } catch (boxErr) {
        console.warn(`[Tank01] Box score fetch failed for ${g.gameID}: ${boxErr.message}`);
      }
    }

    const n = teamGameStats.length;
    if (n === 0) return { team: teamAbv, error: 'No box scores available', games: 0 };

    const sum = (arr, key) => arr.reduce((s, g) => s + (g[key] || 0), 0);
    const avg = (arr, key) => (sum(arr, key) / arr.length).toFixed(1);
    const totalFgm = sum(teamGameStats, 'fgm'), totalFga = sum(teamGameStats, 'fga');
    const total3m = sum(teamGameStats, 'fg3m'), total3a = sum(teamGameStats, 'fg3a');
    const totalFtm = sum(teamGameStats, 'ftm'), totalFta = sum(teamGameStats, 'fta');
    const oppTotalFgm = sum(oppGameStats, 'fgm'), oppTotalFga = sum(oppGameStats, 'fga');
    const oppTotal3m = sum(oppGameStats, 'fg3m'), oppTotal3a = sum(oppGameStats, 'fg3a');

    // eFG% = (FGM + 0.5 * 3PM) / FGA
    const efgPct = totalFga > 0 ? (((totalFgm + 0.5 * total3m) / totalFga) * 100).toFixed(1) : '0.0';
    const oppEfgPct = oppTotalFga > 0 ? (((oppTotalFgm + 0.5 * oppTotal3m) / oppTotalFga) * 100).toFixed(1) : '0.0';

    const result = {
      team: teamAbv,
      period: `L${numGames}`,
      games: n,
      dateRange: { first: teamGameStats[n - 1]?.date, last: teamGameStats[0]?.date },
      opponents: teamGameStats.map(g => g.opp),
      // Per-game averages
      ppg: avg(teamGameStats, 'pts'),
      fgPct: totalFga > 0 ? ((totalFgm / totalFga) * 100).toFixed(1) : '0.0',
      fg3Pct: total3a > 0 ? ((total3m / total3a) * 100).toFixed(1) : '0.0',
      ftPct: totalFta > 0 ? ((totalFtm / totalFta) * 100).toFixed(1) : '0.0',
      efgPct,
      fga: avg(teamGameStats, 'fga'),
      fg3a: avg(teamGameStats, 'fg3a'),
      fta: avg(teamGameStats, 'fta'),
      reb: avg(teamGameStats, 'reb'),
      oreb: avg(teamGameStats, 'oreb'),
      dreb: avg(teamGameStats, 'dreb'),
      ast: avg(teamGameStats, 'ast'),
      tov: avg(teamGameStats, 'tov'),
      stl: avg(teamGameStats, 'stl'),
      blk: avg(teamGameStats, 'blk'),
      pace: avg(teamGameStats, 'pace'),
      paintPts: avg(teamGameStats, 'paintPts'),
      fastBreak: avg(teamGameStats, 'fastBreak'),
      ptsOffTov: avg(teamGameStats, 'ptsOffTov'),
      // Net rating estimate
      netMargin: (sum(teamGameStats, 'pts') / n - sum(oppGameStats, 'pts') / oppGameStats.length).toFixed(1),
      // Opponent stats (what opponents did AGAINST this team)
      opp: {
        ppg: avg(oppGameStats, 'pts'),
        fgPct: oppTotalFga > 0 ? ((oppTotalFgm / oppTotalFga) * 100).toFixed(1) : '0.0',
        fg3Pct: oppTotal3a > 0 ? ((oppTotal3m / oppTotal3a) * 100).toFixed(1) : '0.0',
        efgPct: oppEfgPct,
        reb: avg(oppGameStats, 'reb'),
        oreb: avg(oppGameStats, 'oreb'),
        ast: avg(oppGameStats, 'ast'),
        tov: avg(oppGameStats, 'tov'),
        paintPts: avg(oppGameStats, 'paintPts'),
      },
      // Per-game breakdown (for context — who they played, scores, key stats)
      gameLog: teamGameStats.map(g => ({
        date: g.date,
        opp: g.opp,
        isHome: g.isHome,
        pts: g.pts,
        oppPts: oppGameStats[teamGameStats.indexOf(g)]?.pts || 0,
        fgPct: g.fga > 0 ? ((g.fgm / g.fga) * 100).toFixed(1) : '0',
        fg3Pct: g.fg3a > 0 ? ((g.fg3m / g.fg3a) * 100).toFixed(1) : '0',
        pace: g.pace,
        tov: g.tov,
      })),
    };

    _teamLStatsCache.set(cacheKey, { data: result, ts: Date.now() });
    console.log(`[Tank01] ✅ L${numGames} team stats for ${teamAbv}: ${n} games, ${result.ppg} PPG, ${result.pace} pace`);
    return result;
  } catch (err) {
    console.warn(`[Tank01] Team L-stats failed for ${teamAbv}: ${err.message}`);
    return { team: teamAbv, error: err.message, games: 0 };
  }
}

// ============================================================================
// TANK01 DEPTH CHARTS — Who replaces who at each position
// ============================================================================

let _depthChartCache = null;
let _depthChartCachedAt = 0;
const DEPTH_CHART_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Fetch NBA depth chart for a specific team
 * @param {string} teamAbv - Team abbreviation (e.g., "BOS", "DET")
 * @returns {Promise<Object>} Depth chart by position with starter → backup ordering
 */
async function fetchDepthChart(teamAbv) {
  const now = Date.now();
  if (!_depthChartCache || (now - _depthChartCachedAt) > DEPTH_CHART_CACHE_TTL) {
    try {
      const data = await makeApiRequest('/getNBADepthCharts');
      _depthChartCache = data?.body || {};
      _depthChartCachedAt = now;
      console.log(`[Tank01] Depth charts loaded for ${Object.keys(_depthChartCache).length} teams`);
    } catch (err) {
      console.warn(`[Tank01] Depth chart fetch failed: ${err.message}`);
      return { team: teamAbv, error: err.message };
    }
  }

  const tank01Abv = teamAbv === 'GSW' ? 'GS' : teamAbv === 'NOP' ? 'NO' : teamAbv === 'SAS' ? 'SA' : teamAbv === 'PHX' ? 'PHO' : teamAbv;

  for (const team of Object.values(_depthChartCache)) {
    if (team.teamAbv === tank01Abv) {
      const dc = team.depthChart || {};
      const formatted = {};
      for (const [pos, players] of Object.entries(dc)) {
        formatted[pos] = players.map(p => ({
          depth: p.depthPosition,
          name: p.longName,
          playerID: p.playerID,
        }));
      }
      return { team: teamAbv, depthChart: formatted };
    }
  }
  return { team: teamAbv, error: 'Team not found in depth charts' };
}

// ============================================================================
export default {
  fetchDfsSalaries,
  fetchNbaRostersForTeams,
  extractPlayerEnrichment,
  fetchNbaTeamDefenseStats,
  getPlayerDvP,
  fetchNbaProjections,
  fetchBoxScore,
  fetchTeamScheduleContext,
  fetchGameIDsForDate,
  fetchTeamLStats,
  fetchDepthChart,
};

