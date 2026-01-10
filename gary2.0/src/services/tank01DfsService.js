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

/**
 * Fetch NBA DFS salaries from Tank01
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Promise<Array>} Array of players with salaries
 */
export async function fetchNbaDfsSalaries(dateStr, platform = 'draftkings') {
  const startTime = Date.now();
  
  try {
    const apiDate = formatDateForApi(dateStr);
    const data = await makeApiRequest('/getNBADFS', { date: apiDate });
    
    const duration = Date.now() - startTime;
    console.log(`[Tank01 DFS] ✅ NBA DFS response in ${duration}ms`);
    
    // Parse and map the response to our expected format
    const players = parseNbaResponse(data, platform);
    console.log(`[Tank01 DFS] 📊 Found ${players.length} NBA players for ${platform}`);
    
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
      team: normalizeTeam(p.team || p.teamAbv),
      position,
      salary,
      status,
      // Additional data
      playerId: p.playerID || p.playerId,
      allPositions: p.allValidPositions || [position],
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
      team: normalizeTeam(p.team || p.teamAbv),
      position,
      salary,
      status,
      // Additional data
      playerId: p.playerID || p.playerId,
      allPositions: p.allValidPositions || [position],
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
 * Normalize team abbreviation
 * @param {string} team - Team name or abbreviation
 * @returns {string} Normalized team abbreviation
 */
function normalizeTeam(team) {
  if (!team) return 'UNK';
  
  const teamUpper = team.toUpperCase().trim();
  
  // Common variations
  const teamMap = {
    'GS': 'GSW', 'GOLDEN STATE': 'GSW',
    'NY': 'NYK', 'NEW YORK KNICKS': 'NYK',
    'BRK': 'BKN', 'BROOKLYN': 'BKN',
    'SA': 'SAS', 'SAN ANTONIO': 'SAS',
    'NO': 'NOP', 'NEW ORLEANS': 'NOP',
    'PHO': 'PHX', 'PHOENIX': 'PHX',
    'LA': 'LAL', 'LOS ANGELES LAKERS': 'LAL',
    'LAC': 'LAC', 'LOS ANGELES CLIPPERS': 'LAC',
    'UTAH': 'UTA',
    // NFL teams
    'JAC': 'JAX', 'JACKSONVILLE': 'JAX',
    'KC': 'KC', 'KANSAS CITY': 'KC',
    'TB': 'TB', 'TAMPA BAY': 'TB',
    'NE': 'NE', 'NEW ENGLAND': 'NE',
    'SF': 'SF', 'SAN FRANCISCO': 'SF',
    'LV': 'LV', 'LAS VEGAS': 'LV', 'OAK': 'LV',
    'LAR': 'LAR', 'LA RAMS': 'LAR',
    'WSH': 'WAS', 'WASHINGTON': 'WAS'
  };
  
  return teamMap[teamUpper] || teamUpper;
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

export default {
  fetchDfsSalaries,
  fetchNbaDfsSalaries,
  fetchNflDfsSalaries
};

