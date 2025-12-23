/**
 * DFS Agentic Context Builder
 * Uses Gemini 3 Flash with Google Search Grounding to fetch real-time:
 * - DraftKings/FanDuel player salaries
 * - Injury statuses and late scratches
 * - Lineup news and player updates
 * 
 * This bridges the gap between BDL historical stats and real-time DFS data
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ballDontLieService } from '../ballDontLieService.js';

// Get API key from environment
function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || 
         process.env.VITE_GEMINI_API_KEY || 
         null;
}

// Initialize Gemini client
function getGeminiClient() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('[DFS Context] GEMINI_API_KEY not set - Grounding disabled');
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
}

// Safety settings for sports content
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Fetch DFS salaries and injury data using Gemini Grounding
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} slateDate - Date string (e.g., 'December 23, 2025')
 * @param {Array} teams - Array of team names playing on this slate
 * @returns {Object} Player salaries and statuses
 */
export async function fetchDFSSalariesWithGrounding(platform, sport, slateDate, teams = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - returning empty salaries');
    return { players: [], groundingUsed: false };
  }
  
  const platformName = platform === 'draftkings' ? 'DraftKings' : 'FanDuel';
  const teamsStr = teams.length > 0 ? teams.join(', ') : 'all teams';
  
  // Use Flash model for DFS (high volume, avoid quota issues)
  const modelName = process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash';
  
  try {
    console.log(`[DFS Context] 🔍 Fetching ${platformName} ${sport} salaries for ${slateDate}`);
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{
        google_search: {} // Gemini grounding with Google Search
      }],
      safetySettings: SAFETY_SETTINGS
    });
    
    let prompt;
    if (sport === 'NBA') {
      prompt = `Search for today's ${platformName} NBA DFS main slate salaries and injury report for ${slateDate}.

I need the following information for the top 60 players on today's main slate:

1. PLAYER SALARIES: For each player, provide:
   - Full name
   - Team abbreviation (e.g., LAL, BOS, MIA)
   - Position (PG, SG, SF, PF, C)
   - ${platformName} salary (in dollars, e.g., $9,800)
   - Injury status: HEALTHY, OUT, GTD (Game Time Decision), QUESTIONABLE, or DOUBTFUL

2. LATE SCRATCHES: Any players ruled OUT in the last 24 hours

3. REST DAYS: Any stars sitting for load management

Focus on teams playing today: ${teamsStr}

Return the data in this exact JSON format:
{
  "slate_info": {
    "platform": "${platformName}",
    "sport": "NBA",
    "date": "${slateDate}",
    "games_count": <number>
  },
  "players": [
    {
      "name": "LeBron James",
      "team": "LAL",
      "position": "SF",
      "salary": 10500,
      "status": "HEALTHY",
      "notes": ""
    }
  ],
  "late_scratches": ["Player Name if any"],
  "rest_days": ["Player Name if any"]
}

Only include players actually on today's ${platformName} slate. Be accurate with salaries.`;
    } else if (sport === 'NFL') {
      prompt = `Search for today's ${platformName} NFL DFS main slate salaries and injury report for ${slateDate}.

I need the following information for the top 80 players on today's main slate:

1. PLAYER SALARIES: For each player, provide:
   - Full name
   - Team abbreviation (e.g., KC, BUF, PHI)
   - Position (QB, RB, WR, TE, DST)
   - ${platformName} salary (in dollars, e.g., $7,800)
   - Injury status: HEALTHY, OUT, QUESTIONABLE, DOUBTFUL, or IR

2. LATE SCRATCHES: Any players ruled OUT in the last 24 hours

3. QB CHANGES: Any backup QBs starting due to injury

4. WEATHER ALERTS: Any games with weather concerns (wind, rain, snow)

Focus on teams playing today: ${teamsStr}

Return the data in this exact JSON format:
{
  "slate_info": {
    "platform": "${platformName}",
    "sport": "NFL",
    "date": "${slateDate}",
    "games_count": <number>
  },
  "players": [
    {
      "name": "Patrick Mahomes",
      "team": "KC",
      "position": "QB",
      "salary": 8200,
      "status": "HEALTHY",
      "notes": ""
    }
  ],
  "late_scratches": ["Player Name if any"],
  "qb_changes": ["Team - New Starter replacing Original Starter"],
  "weather_alerts": ["Game - Weather concern"]
}

Only include players actually on today's ${platformName} slate. Be accurate with salaries.`;
    }
    
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Gemini Grounding response in ${duration}ms`);
    
    const response = result.response;
    const text = response.text();
    
    // Log grounding metadata if available
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries?.length > 0) {
      console.log(`[DFS Context] 🔍 Grounded searches: "${groundingMetadata.webSearchQueries.join('", "')}"`);
    }
    
    // Parse JSON from response
    const parsed = parseGroundingResponse(text);
    
    return {
      ...parsed,
      groundingUsed: !!groundingMetadata?.webSearchQueries?.length,
      rawResponse: text.substring(0, 500) // For debugging
    };
    
  } catch (error) {
    console.error(`[DFS Context] Gemini Grounding failed: ${error.message}`);
    return { players: [], groundingUsed: false, error: error.message };
  }
}

/**
 * Parse Gemini grounding response to extract JSON
 * @param {string} text - Raw response text
 * @returns {Object} Parsed player data
 */
function parseGroundingResponse(text) {
  try {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }
    
    // If no JSON found, try to parse the whole thing
    return JSON.parse(text);
  } catch (e) {
    console.warn(`[DFS Context] Failed to parse JSON response: ${e.message}`);
    
    // Return empty structure if parsing fails
    return {
      slate_info: {},
      players: [],
      late_scratches: [],
      error: 'Failed to parse response'
    };
  }
}

/**
 * Fetch player stats from Ball Don't Lie API
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @returns {Array} Player stats
 */
export async function fetchPlayerStatsFromBDL(sport, dateStr) {
  try {
    if (sport === 'NBA') {
      // Get today's games
      const games = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr] }, 5);
      
      if (!games || games.length === 0) {
        console.log('[DFS Context] No NBA games found for today');
        return [];
      }
      
      // Get team IDs from games
      const teamIds = new Set();
      for (const game of games) {
        if (game.home_team?.id) teamIds.add(game.home_team.id);
        if (game.visitor_team?.id) teamIds.add(game.visitor_team.id);
      }
      
      // Fetch players for these teams
      const players = await ballDontLieService.getPlayersGeneric('basketball_nba', {
        team_ids: Array.from(teamIds),
        per_page: 100
      });
      
      // Get current season
      const now = new Date();
      const season = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
      
      // Fetch season averages
      const playerIds = players.map(p => p.id).filter(Boolean).slice(0, 100);
      const seasonAverages = await ballDontLieService.getNbaSeasonAverages({
        season,
        player_ids: playerIds
      });
      
      // Merge stats with players
      const statsMap = new Map();
      (seasonAverages || []).forEach(entry => {
        const pid = entry?.player?.id;
        if (pid) statsMap.set(pid, entry);
      });
      
      return players.map(p => {
        const stats = statsMap.get(p.id) || {};
        return {
          name: `${p.first_name} ${p.last_name}`,
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: p.position || 'G',
          seasonStats: {
            ppg: stats.pts || 0,
            rpg: stats.reb || 0,
            apg: stats.ast || 0,
            spg: stats.stl || 0,
            bpg: stats.blk || 0,
            tpg: stats.fg3m || 0,
            mpg: stats.min ? parseFloat(stats.min) : 0
          }
        };
      });
      
    } else if (sport === 'NFL') {
      // Get NFL games for today
      const games = await ballDontLieService.getGames('americanfootball_nfl', { dates: [dateStr] }, 5);
      
      if (!games || games.length === 0) {
        console.log('[DFS Context] No NFL games found for today');
        return [];
      }
      
      // Get team IDs
      const teamIds = new Set();
      for (const game of games) {
        if (game.home_team?.id) teamIds.add(game.home_team.id);
        if (game.away_team?.id) teamIds.add(game.away_team.id);
      }
      
      // Fetch players (NFL has different API structure)
      const players = await ballDontLieService.getPlayersGeneric('americanfootball_nfl', {
        team_ids: Array.from(teamIds),
        per_page: 150
      });
      
      return players.map(p => ({
        name: `${p.first_name} ${p.last_name}`,
        team: p.team?.abbreviation || p.team?.name || 'UNK',
        position: p.position || 'FLEX'
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`[DFS Context] BDL fetch error: ${error.message}`);
    return [];
  }
}

/**
 * Merge BDL stats with Grounding salary data
 * @param {Array} bdlPlayers - Players with stats from BDL
 * @param {Array} groundedPlayers - Players with salaries from Grounding
 * @returns {Array} Merged player pool
 */
export function mergePlayerData(bdlPlayers, groundedPlayers) {
  // Create lookup map for grounded players
  const salaryMap = new Map();
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    salaryMap.set(key, {
      salary: p.salary,
      status: p.status,
      notes: p.notes
    });
  }
  
  // Merge data
  const merged = [];
  for (const p of bdlPlayers) {
    const key = normalizePlayerName(p.name);
    const salaryData = salaryMap.get(key);
    
    if (salaryData && salaryData.salary > 0) {
      merged.push({
        ...p,
        salary: salaryData.salary,
        status: salaryData.status || 'HEALTHY',
        notes: salaryData.notes || ''
      });
    }
  }
  
  // Also add grounded players not in BDL (like DST for NFL)
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const exists = merged.some(m => normalizePlayerName(m.name) === key);
    if (!exists && p.salary > 0) {
      merged.push({
        name: p.name,
        team: p.team,
        position: p.position,
        salary: p.salary,
        status: p.status || 'HEALTHY',
        notes: p.notes || '',
        seasonStats: {} // No BDL stats available
      });
    }
  }
  
  return merged;
}

/**
 * Normalize player name for matching
 */
function normalizePlayerName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get teams playing on a specific date
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @returns {Array} Team names
 */
export async function getTeamsPlayingToday(sport, dateStr) {
  try {
    const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
    const games = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5);
    
    const teams = new Set();
    for (const game of games || []) {
      if (game.home_team?.abbreviation) teams.add(game.home_team.abbreviation);
      if (game.home_team?.name) teams.add(game.home_team.name);
      if (game.visitor_team?.abbreviation) teams.add(game.visitor_team.abbreviation);
      if (game.visitor_team?.name) teams.add(game.visitor_team.name);
      if (game.away_team?.abbreviation) teams.add(game.away_team.abbreviation);
      if (game.away_team?.name) teams.add(game.away_team.name);
    }
    
    return Array.from(teams);
  } catch (error) {
    console.error(`[DFS Context] Failed to get teams: ${error.message}`);
    return [];
  }
}

/**
 * Build complete DFS context for lineup generation
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @returns {Object} Complete player pool with salaries and stats
 */
export async function buildDFSContext(platform, sport, dateStr) {
  const start = Date.now();
  console.log(`\n[DFS Context] Building ${platform} ${sport} context for ${dateStr}`);
  
  // Format date for display
  const dateObj = new Date(dateStr + 'T12:00:00');
  const slateDate = dateObj.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  // Get teams playing today
  const teams = await getTeamsPlayingToday(sport, dateStr);
  console.log(`[DFS Context] Teams playing: ${teams.join(', ') || 'None found'}`);
  
  if (teams.length === 0) {
    return {
      platform,
      sport,
      date: dateStr,
      players: [],
      gamesCount: 0,
      error: 'No games found for this date'
    };
  }
  
  // Parallel fetch: BDL stats + Gemini Grounding salaries
  const [bdlPlayers, groundedData] = await Promise.all([
    fetchPlayerStatsFromBDL(sport, dateStr),
    fetchDFSSalariesWithGrounding(platform, sport, slateDate, teams)
  ]);
  
  console.log(`[DFS Context] BDL players: ${bdlPlayers.length}`);
  console.log(`[DFS Context] Grounded players: ${groundedData.players?.length || 0}`);
  
  // Merge data sources
  const mergedPlayers = mergePlayerData(bdlPlayers, groundedData.players || []);
  console.log(`[DFS Context] Merged player pool: ${mergedPlayers.length}`);
  
  const duration = Date.now() - start;
  console.log(`[DFS Context] Context built in ${duration}ms`);
  
  return {
    platform,
    sport,
    date: dateStr,
    slateDate,
    players: mergedPlayers,
    gamesCount: Math.ceil(teams.length / 2),
    lateScratches: groundedData.late_scratches || [],
    weatherAlerts: groundedData.weather_alerts || [],
    groundingUsed: groundedData.groundingUsed,
    buildTimeMs: duration
  };
}

export default {
  fetchDFSSalariesWithGrounding,
  fetchPlayerStatsFromBDL,
  mergePlayerData,
  getTeamsPlayingToday,
  buildDFSContext
};

