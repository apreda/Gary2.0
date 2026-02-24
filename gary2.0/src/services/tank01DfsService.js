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
export async function fetchNbaDfsSalaries(dateStr, platform = 'draftkings') {
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
export async function fetchNflDfsSalaries(dateStr, platform = 'draftkings') {
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

export async function fetchNbaTeamRoster(teamAbv) {
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
    const data = await makeApiRequest('/getNBAProjections', {
      numOfDays: '1',
      date: apiDate
    });

    const projections = data?.body?.playerProjections || {};
    const projMap = new Map();

    for (const [id, proj] of Object.entries(projections)) {
      const name = (proj.longName || '').trim().toLowerCase();
      if (!name) continue;

      projMap.set(name, {
        playerID: id,
        longName: proj.longName,
        team: normalizeTeamAbbreviation(proj.team || ''),
        pos: proj.pos || '',
        projPts: proj.pts ? parseFloat(proj.pts) : 0,
        projReb: proj.reb ? parseFloat(proj.reb) : 0,
        projAst: proj.ast ? parseFloat(proj.ast) : 0,
        projStl: proj.stl ? parseFloat(proj.stl) : 0,
        projBlk: proj.blk ? parseFloat(proj.blk) : 0,
        projTov: proj.TOV ? parseFloat(proj.TOV) : 0,
        projFpts: proj.fantasyPoints ? parseFloat(proj.fantasyPoints) : 0
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
// NBA NEWS (Breaking headlines — injury updates, trades, rest decisions)
// ============================================================================

let _newsCache = null;
let _newsCachedAt = 0;
const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 min (news changes frequently)

/**
 * Fetch recent NBA news/headlines from Tank01
 *
 * @param {number} maxItems - Max number of headlines to fetch
 * @returns {Promise<Array>} Array of news items with title, link, playerIDs
 */
export async function fetchNbaNews(maxItems = 30) {
  const now = Date.now();
  if (_newsCache && (now - _newsCachedAt) < NEWS_CACHE_TTL) {
    console.log(`[Tank01 DFS] Using cached news (${_newsCache.length} items)`);
    return _newsCache;
  }

  try {
    const data = await makeApiRequest('/getNBANews', {
      recentNews: 'true',
      maxItems: String(maxItems)
    });

    const news = data?.body || [];
    _newsCache = news;
    _newsCachedAt = now;
    console.log(`[Tank01 DFS] News loaded: ${news.length} headlines`);
    return news;
  } catch (err) {
    console.warn(`[Tank01 DFS] News fetch failed: ${err.message}`);
    return [];
  }
}

/**
 * Match news headlines to players on today's slate
 * Returns a Map of playerName → array of relevant headlines
 *
 * @param {Array} newsItems - Raw news from fetchNbaNews
 * @param {Map} playerIdMap - Map of Tank01 playerID → playerName (from roster data)
 * @returns {Map<string, string[]>} Map of playerName → headline strings
 */
export function matchNewsToPlayers(newsItems, playerIdMap) {
  const newsMap = new Map();

  for (const item of newsItems) {
    const title = item.title || '';
    const playerIDs = item.playerIDs || [];

    for (const pid of playerIDs) {
      const playerName = playerIdMap.get(String(pid));
      if (!playerName) continue;

      if (!newsMap.has(playerName)) {
        newsMap.set(playerName, []);
      }
      newsMap.get(playerName).push(title);
    }
  }

  return newsMap;
}

// ============================================================================
// NBA GAME TIMES (Fallback for slate discovery if DK API fails)
// ============================================================================

/**
 * Fetch NBA game times from Tank01's scores endpoint
 * Returns gameTime and gameTime_epoch per game
 *
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of game objects with time data
 */
export async function fetchNbaGameTimes(dateStr) {
  try {
    const apiDate = formatDateForApi(dateStr);
    const data = await makeApiRequest('/getNBAScoresOnly', { gameDate: apiDate });

    const games = data?.body || {};
    const result = [];

    for (const [gameId, game] of Object.entries(games)) {
      result.push({
        gameID: gameId,
        away: normalizeTeamAbbreviation(game.away || ''),
        home: normalizeTeamAbbreviation(game.home || ''),
        gameTime: game.gameTime || null,
        gameTimeEpoch: game.gameTime_epoch ? parseFloat(game.gameTime_epoch) : null,
        gameStatus: game.gameStatus || 'Unknown'
      });
    }

    console.log(`[Tank01 DFS] Game times for ${dateStr}: ${result.length} games`);
    return result;
  } catch (err) {
    console.warn(`[Tank01 DFS] Game times fetch failed: ${err.message}`);
    return [];
  }
}

export default {
  fetchDfsSalaries,
  fetchNbaDfsSalaries,
  fetchNflDfsSalaries,
  // New NBA DFS enrichment functions
  fetchNbaTeamRoster,
  fetchNbaRostersForTeams,
  extractPlayerEnrichment,
  fetchNbaTeamDefenseStats,
  getPlayerDvP,
  fetchNbaProjections,
  fetchNbaNews,
  matchNewsToPlayers,
  fetchNbaGameTimes
};

