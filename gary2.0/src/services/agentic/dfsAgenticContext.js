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
 * ═══════════════════════════════════════════════════════════════════════════
 * DFS MODEL CONFIGURATION - Gemini 3 Flash for Gary's Fantasy
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Model: gemini-3-flash-preview (high volume, low latency for DFS)
 * Temperature: 1.1 (High Creativity/Variance for diverse lineup builds)
 * Reasoning_Level: HIGH (Enable full chain-of-thought thinking blocks)
 * Grounding: ENABLED (Use Google Search tool for all sports/real-time data)
 * 
 * This configuration enables Gary to:
 * - Search for live DraftKings/FanDuel salaries via Google
 * - Find injury reports and late scratches
 * - Discover narrative context (revenge games, usage spikes, etc.)
 * - Generate creative lineup strategies with high variance
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
const DFS_MODEL_CONFIG = {
  model: process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview',
  temperature: 1.1,
  reasoningLevel: 'HIGH',
  grounding: 'ENABLED',
  maxOutputTokens: 8192,
  topP: 0.95
};

console.log(`[DFS Context] Initialized with MODEL_CONFIG:`, {
  model: DFS_MODEL_CONFIG.model,
  temp: DFS_MODEL_CONFIG.temperature,
  reasoning: DFS_MODEL_CONFIG.reasoningLevel,
  grounding: DFS_MODEL_CONFIG.grounding
});

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
  
  // Apply DFS_MODEL_CONFIG for salary fetching
  try {
    console.log(`[DFS Context] 🔍 Fetching ${platformName} ${sport} salaries for ${slateDate}`);
    console.log(`[DFS Context] MODEL_CONFIG: ${DFS_MODEL_CONFIG.model} | temp=${DFS_MODEL_CONFIG.temperature} | reasoning=${DFS_MODEL_CONFIG.reasoningLevel} | grounding=${DFS_MODEL_CONFIG.grounding}`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{
        google_search: {} // Grounding: ENABLED - Use Google Search for all sports/real-time data
      }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: DFS_MODEL_CONFIG.temperature,
        topP: DFS_MODEL_CONFIG.topP,
        maxOutputTokens: DFS_MODEL_CONFIG.maxOutputTokens,
        // Reasoning_Level: HIGH - Enable full chain-of-thought thinking blocks
        thinkingConfig: {
          includeThoughts: true
        }
      }
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
      
      // Get current NBA season (2025-26 season = 2025)
      // NBA season starts in October, so Oct-Dec = current year, Jan-Sept = previous year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
      const season = currentMonth >= 9 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NBA season ${season}-${season + 1} stats`);
      
      // Fetch season averages from BDL
      const playerIds = players.map(p => p.id).filter(Boolean).slice(0, 100);
      const seasonAverages = await ballDontLieService.getNbaSeasonAverages({
        season,
        player_ids: playerIds
      });
      
      console.log(`[DFS Context] Retrieved ${seasonAverages?.length || 0} player season averages`);
      
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
        if (game.visitor_team?.id) teamIds.add(game.visitor_team.id);
        if (game.away_team?.id) teamIds.add(game.away_team.id);
      }
      
      // Fetch active players for these teams
      const players = await ballDontLieService.getPlayersGeneric('americanfootball_nfl', {
        team_ids: Array.from(teamIds),
        per_page: 150
      });
      
      // Get current NFL season (2025 season runs Sept 2025 - Feb 2026)
      // NFL season starts in September, so Sept-Dec = current year, Jan-Aug = previous year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
      const season = currentMonth >= 8 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NFL ${season} season stats`);
      
      // Fetch NFL season stats from BDL
      // BDL NFL Season Stats provides: passing_yards, rushing_yards, receiving_yards, 
      // passing_touchdowns, rushing_touchdowns, receiving_touchdowns, receptions, etc.
      const playerIds = players.map(p => p.id).filter(Boolean).slice(0, 50);
      let seasonStats = [];
      
      try {
        // BDL NFL season_stats endpoint - fetch in parallel batches
        const batchSize = 10;
        for (let i = 0; i < playerIds.length; i += batchSize) {
          const batch = playerIds.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(pid => 
              ballDontLieService.getNflPlayerSeasonStats?.({ playerId: pid, season })
                .catch(() => [])
            )
          );
          seasonStats.push(...batchResults.flat());
        }
      } catch (e) {
        console.warn(`[DFS Context] NFL season stats fetch failed: ${e.message}`);
      }
      
      // Create stats map
      const statsMap = new Map();
      (seasonStats || []).forEach(entry => {
        const pid = entry?.player?.id;
        if (pid) statsMap.set(pid, entry);
      });
      
      return players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const position = (p.position_abbreviation || p.position || '').toUpperCase();
        
        // Map BDL NFL stats to our DFS format
        // Fields from BDL docs: passing_yards_per_game, passing_touchdowns, passing_interceptions,
        // rushing_yards_per_game, rushing_touchdowns, receptions, receiving_yards_per_game, etc.
        return {
          name: `${p.first_name} ${p.last_name}`,
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position === 'QUARTERBACK' ? 'QB' :
                   position === 'RUNNING BACK' ? 'RB' :
                   position === 'WIDE RECEIVER' ? 'WR' :
                   position === 'TIGHT END' ? 'TE' :
                   position || 'FLEX',
          seasonStats: {
            // QB stats
            passing_yards_per_game: stats.passing_yards_per_game || 0,
            passing_touchdowns: stats.passing_touchdowns || 0,
            passing_interceptions: stats.passing_interceptions || 0,
            passing_completion_pct: stats.passing_completion_pct || 0,
            // Rushing stats
            rushing_yards_per_game: stats.rushing_yards_per_game || 0,
            rushing_touchdowns: stats.rushing_touchdowns || 0,
            rushing_attempts: stats.rushing_attempts || 0,
            rushing_fumbles_lost: stats.rushing_fumbles_lost || 0,
            // Receiving stats
            receptions: stats.receptions || 0,
            receiving_yards_per_game: stats.receiving_yards_per_game || 0,
            receiving_touchdowns: stats.receiving_touchdowns || 0,
            receiving_targets: stats.receiving_targets || 0,
            receiving_fumbles_lost: stats.receiving_fumbles_lost || 0,
            // Games played
            games_played: stats.games_played || 0
          }
        };
      });
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
 * Fetch DFS narrative context using Gemini Grounding
 * This is what separates Gary from a "math bot" - understanding the STORY
 * 
 * Key narratives to identify:
 * - Revenge games (vs former teams)
 * - Injury impacts (elevated usage rates)
 * - Back-to-back situations (fatigue)
 * - Weather/dome factors (NFL)
 * - Vegas lines (high-scoring games)
 * - Hot streaks (recent performance)
 * - Minutes/usage trends
 * - Historical matchups vs defenses
 */
export async function fetchDFSNarrativeContext(sport, slateDate, games = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - skipping narrative context');
    return { narratives: [], targetPlayers: [], fadePlayers: [] };
  }
  
  const gameDescriptions = games.map(g => 
    `${g.visitor_team || g.away_team} @ ${g.home_team}`
  ).join(', ');
  
  // Apply DFS_MODEL_CONFIG for narrative context
  try {
    console.log(`[DFS Context] 📖 Fetching narrative context for ${sport} games`);
    console.log(`[DFS Context] MODEL_CONFIG: ${DFS_MODEL_CONFIG.model} | temp=${DFS_MODEL_CONFIG.temperature} | reasoning=${DFS_MODEL_CONFIG.reasoningLevel} | grounding=${DFS_MODEL_CONFIG.grounding}`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{ google_search: {} }], // Grounding: ENABLED
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: DFS_MODEL_CONFIG.temperature,
        topP: DFS_MODEL_CONFIG.topP,
        maxOutputTokens: DFS_MODEL_CONFIG.maxOutputTokens,
        // Reasoning_Level: HIGH - Enable thinking blocks
        thinkingConfig: {
          includeThoughts: true
        }
      }
    });
    
    const prompt = sport === 'NBA' 
      ? `Search for DFS narrative context for tonight's NBA games on ${slateDate}:
${gameDescriptions}

Identify and return as JSON:
{
  "game_narratives": [
    {
      "game": "Team @ Team",
      "vegas_total": 225.5,
      "narratives": [
        "Specific narrative (revenge game, injury impact, etc)"
      ]
    }
  ],
  "target_players": [
    {
      "name": "Player Name",
      "team": "TM",
      "reason": "Why they're a strong DFS play today",
      "narrative_type": "injury_boost|revenge|hot_streak|usage_spike|matchup"
    }
  ],
  "fade_players": [
    {
      "name": "Player Name", 
      "team": "TM",
      "reason": "Why to avoid in DFS",
      "narrative_type": "rest|blowout_risk|tough_matchup|cold_streak"
    }
  ]
}

Focus on:
1. **Usage Rate Spikes**: Key player OUT = teammate gets +15-25% usage boost
2. **Revenge Games**: Players facing former teams (extra motivation)
3. **Back-to-Backs**: 2nd night of B2B = fade veterans, target role players
4. **Vegas Totals**: Games >230 = stack opportunities, <215 = lower ceilings
5. **Hot Streaks**: Players exceeding season average by 20%+ in last 5 games
6. **Minutes Trends**: Recent increases (30+ min last 3 games vs 25 season avg)`

      : `Search for DFS narrative context for today's NFL games on ${slateDate}:
${gameDescriptions}

Identify and return as JSON:
{
  "game_narratives": [
    {
      "game": "Team @ Team",
      "vegas_total": 48.5,
      "weather": "Dome/Clear/Rain/Wind",
      "narratives": [
        "Specific narrative (injury impact, revenge game, etc)"
      ]
    }
  ],
  "target_players": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "QB/RB/WR/TE",
      "reason": "Why they're a strong DFS play today",
      "narrative_type": "injury_boost|revenge|hot_streak|usage_spike|matchup|weather_benefit"
    }
  ],
  "fade_players": [
    {
      "name": "Player Name",
      "team": "TM", 
      "reason": "Why to avoid in DFS",
      "narrative_type": "weather|tough_matchup|game_script|cold_streak"
    }
  ]
}

Focus on:
1. **Injury Boosts**: WR1 OUT = WR2/WR3 target share spike
2. **Weather**: Wind >15mph = fade deep passers, target RBs
3. **Game Script**: Heavy favorites run more, trailing teams pass more
4. **Red Zone Usage**: Who gets the TDs (goal-line backs, red zone WRs)
5. **Revenge Games**: Players vs former teams
6. **Vegas Totals**: Games >50 = shootout stacks, <40 = game stacks risky`;

    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Narrative context fetched in ${duration}ms`);
    
    const text = result.response.text();
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        narratives: parsed.game_narratives || [],
        targetPlayers: parsed.target_players || [],
        fadePlayers: parsed.fade_players || []
      };
    }
    
    return { narratives: [], targetPlayers: [], fadePlayers: [] };
    
  } catch (error) {
    console.error(`[DFS Context] Narrative context error: ${error.message}`);
    return { narratives: [], targetPlayers: [], fadePlayers: [] };
  }
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
  
  // Get game info for narrative context
  const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  const games = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5) || [];
  const gameList = games.map(g => ({
    home_team: g.home_team?.abbreviation || g.home_team?.name,
    visitor_team: g.visitor_team?.abbreviation || g.visitor_team?.name,
    away_team: g.away_team?.abbreviation || g.away_team?.name
  }));
  
  // Parallel fetch: BDL stats + Gemini Grounding salaries + Narrative context
  const [bdlPlayers, groundedData, narrativeContext] = await Promise.all([
    fetchPlayerStatsFromBDL(sport, dateStr),
    fetchDFSSalariesWithGrounding(platform, sport, slateDate, teams),
    fetchDFSNarrativeContext(sport, slateDate, gameList)
  ]);
  
  console.log(`[DFS Context] BDL players: ${bdlPlayers.length}`);
  console.log(`[DFS Context] Grounded players: ${groundedData.players?.length || 0}`);
  console.log(`[DFS Context] Narratives: ${narrativeContext.narratives?.length || 0} games, ${narrativeContext.targetPlayers?.length || 0} targets`);
  
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
    gamesCount: games.length,
    games: gameList,
    // Late-breaking info
    lateScratches: groundedData.late_scratches || [],
    weatherAlerts: groundedData.weather_alerts || [],
    qbChanges: groundedData.qb_changes || [],
    // Narrative context (what separates Gary from a math bot)
    narratives: narrativeContext.narratives || [],
    targetPlayers: narrativeContext.targetPlayers || [],
    fadePlayers: narrativeContext.fadePlayers || [],
    // Metadata
    groundingUsed: groundedData.groundingUsed,
    buildTimeMs: duration
  };
}

export default {
  fetchDFSSalariesWithGrounding,
  fetchDFSNarrativeContext,
  fetchPlayerStatsFromBDL,
  mergePlayerData,
  getTeamsPlayingToday,
  buildDFSContext
};

