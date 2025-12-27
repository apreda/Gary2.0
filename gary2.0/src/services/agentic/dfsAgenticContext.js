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
    
    // For salary fetching with grounding - DO NOT use responseMimeType as it breaks grounding
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash', // Use stable model for structured data
      tools: [{
        google_search: {} // Grounding: ENABLED - Use Google Search for salaries
      }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 0.5, // Slightly higher temp for better grounding results
        topP: 0.95,
        maxOutputTokens: DFS_MODEL_CONFIG.maxOutputTokens
        // Note: responseMimeType: 'application/json' breaks grounding - don't use it here
      }
    });
    
    let prompt;
    if (sport === 'NBA') {
      prompt = `Search the web for ${platformName} NBA DFS salaries for ${slateDate}.

Find the ACTUAL ${platformName} salary prices for NBA players on today's slate. I need at least 40-60 players.

For each player found, provide in this EXACT JSON format:
{
  "slate_info": {
    "platform": "${platformName}",
    "sport": "NBA",
    "date": "${slateDate}",
    "games_count": <number of games>
  },
  "players": [
    {"name": "Player Name", "team": "TEAM", "position": "POS", "salary": 9500, "status": "HEALTHY"},
    ...more players
  ],
  "late_scratches": ["Player Name"],
  "rest_days": ["Player Name"]
}

IMPORTANT RULES:
- Search for "${platformName} NBA salaries ${slateDate}" or similar queries
- salary must be a NUMBER (not string), e.g. 9500 not "$9,500"
- Teams playing today: ${teamsStr}
- Include ALL salary tiers from $3000 to $12000+
- Position should be: PG, SG, SF, PF, or C
- Status: HEALTHY, OUT, GTD, QUESTIONABLE, or DOUBTFUL

Return ONLY valid JSON. Start with { and end with }. No explanation text.

Example player entry:
{"name": "LeBron James", "team": "LAL",
      "position": "SF",
      "salary": 10500,
      "status": "HEALTHY",
      "notes": ""
    }
  ],
  "late_scratches": ["Player Name if any"],
  "rest_days": ["Player Name if any"]
}

Only include players actually on today's ${platformName} slate. Be accurate with salaries.

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation text. Start your response with { and end with }`;
    } else if (sport === 'NFL') {
      // Determine if this is a small slate (2-4 teams = Saturday games)
      const teamCount = teams.length;
      const isSmallSlate = teamCount <= 8; // 4 teams = 2 games = small slate
      const slateType = isSmallSlate ? 'Saturday 2-game' : 'Sunday main';
      
      prompt = `Search the web for ${platformName} NFL DFS salaries AND injury reports for ${slateDate}.

THIS IS A ${slateType.toUpperCase()} SLATE with ${teamCount / 2} games.

Teams playing: ${teamsStr}

Find the ACTUAL ${platformName} salary prices AND current injury status for NFL players.

**CRITICAL: INJURY STATUS IS ESSENTIAL**
Search for "NFL injury report ${slateDate}" and "NFL Week 17 inactive list"
For each player, determine their EXACT status:
- OUT = Ruled out, will NOT play → Must exclude from lineups
- DOUBTFUL = Very unlikely to play (<25% chance) → Must exclude from lineups
- QUESTIONABLE = May or may not play → Note if "expected to play" or "game-time decision"
- HEALTHY = No injury designation → Include

**KNOWN INJURIES TO VERIFY:**
- Lamar Jackson (BAL) - Check if OUT/DOUBTFUL (hip injury reported)
- Jordan Love (GB) - Check status

IMPORTANT PRICING GUIDANCE FOR ${isSmallSlate ? 'SMALL' : 'MAIN'} SLATE:
${isSmallSlate ? `
- Elite QBs (Herbert, etc.): $7,800 - $8,500
- Elite RBs (Henry, Jacobs): $7,500 - $8,400
- WR1s (Collins, Allen, Flowers): $6,500 - $8,000
- TEs: $4,500 - $6,500
- DST: $3,500 - $4,500
- Kickers: $4,000 - $5,000
` : `
- Elite QBs: $7,000 - $8,500
- RB1s: $6,500 - $8,000
- WR1s: $6,000 - $8,000
- TEs: $4,000 - $6,500
`}

Search queries to try:
1. "${platformName} NFL salaries ${slateDate}"
2. "NFL injury report Week 17 ${slateDate}"
3. "Lamar Jackson injury status ${slateDate}"

For each player found, provide in this EXACT JSON format:
{
  "slate_info": {
    "platform": "${platformName}",
    "sport": "NFL",
    "date": "${slateDate}",
    "slate_type": "${slateType}",
    "games_count": ${teamCount / 2}
  },
  "players": [
    {"name": "Justin Herbert", "team": "LAC", "position": "QB", "salary": 8200, "status": "HEALTHY", "notes": ""},
    {"name": "Lamar Jackson", "team": "BAL", "position": "QB", "salary": 8500, "status": "DOUBTFUL", "notes": "Hip injury - unlikely to play"},
    {"name": "Derrick Henry", "team": "BAL", "position": "RB", "salary": 7800, "status": "HEALTHY", "notes": ""},
    ...more players
  ],
  "confirmed_out": ["Lamar Jackson (BAL) - Hip", "Jordan Love (GB) - Elbow"],
  "game_time_decisions": ["Player Name (TEAM) - Injury - Expected to play/sit"],
  "qb_changes": ["BAL - Tyler Huntley starting for Lamar Jackson"],
  "weather_alerts": ["Game @ Location - Weather concern"]
}

IMPORTANT RULES:
- salary must be a NUMBER (not string), e.g. 7800 not "$7,800"
- Status MUST be accurate: OUT, DOUBTFUL, QUESTIONABLE, or HEALTHY
- Include notes for injured players explaining their situation
- Position should be: QB, RB, WR, TE, K, or DST

Return ONLY valid JSON. Start with { and end with }. No explanation text.`;
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
    // Step 0: Clean up markdown formatting
    let cleanText = text.trim();
    
    // Remove leading/trailing markdown code block markers
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/, '');
    }
    
    // Step 1: Find balanced JSON by counting braces
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      let endPos = -1;
      
      for (let i = firstBrace; i < cleanText.length; i++) {
        const char = cleanText[i];
        
        if (escape) {
          escape = false;
          continue;
        }
        
        if (char === '\\' && inString) {
          escape = true;
          continue;
        }
        
        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              endPos = i;
              break;
            }
          }
        }
      }
      
      if (endPos > firstBrace) {
        const jsonStr = cleanText.substring(firstBrace, endPos + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (e) {
          console.warn(`[DFS Context] Balanced brace parse failed: ${e.message}`);
        }
      }
    }
    
    // Step 2: Try direct parse
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      // Continue to other methods
    }
    
    // Step 3: Try regex for JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn(`[DFS Context] Regex JSON parse failed: ${e.message}`);
      }
    }
    
    // Step 4: Try to extract salary data from natural language response
    // This handles cases where Gemini grounding returns prose with embedded salary info
    console.log(`[DFS Context] Attempting to extract salaries from natural language response...`);
    const extractedPlayers = extractSalariesFromText(text);
    if (extractedPlayers.length > 0) {
      console.log(`[DFS Context] ✅ Extracted ${extractedPlayers.length} players from natural language`);
      return {
        slate_info: {},
        players: extractedPlayers,
        late_scratches: [],
        extracted: true // Flag that this was extracted, not parsed
      };
    }
    
    console.warn(`[DFS Context] All JSON parsing methods failed`);
    return {
      slate_info: {},
      players: [],
      late_scratches: [],
      error: 'Failed to parse response'
    };
    
  } catch (e) {
    console.warn(`[DFS Context] JSON parsing error: ${e.message}`);
    return {
      slate_info: {},
      players: [],
      late_scratches: [],
      error: 'Failed to parse response'
    };
  }
}

/**
 * Extract salary data from natural language text
 * Handles cases like: "Nikola Jokic (DEN) - $12,500" or "Jokic with a salary of $12,500"
 * @param {string} text - Natural language text containing salary info
 * @returns {Array} Extracted player objects
 */
function extractSalariesFromText(text) {
  const players = [];
  
  // Common team abbreviations
  const teamAbbrs = {
    // NBA
    'Lakers': 'LAL', 'Celtics': 'BOS', 'Warriors': 'GSW', 'Nuggets': 'DEN', 'Suns': 'PHX',
    'Heat': 'MIA', 'Bucks': 'MIL', 'Cavaliers': 'CLE', 'Nets': 'BKN', 'Knicks': 'NYK',
    'Hawks': 'ATL', 'Bulls': 'CHI', 'Clippers': 'LAC', 'Mavericks': 'DAL', 'Grizzlies': 'MEM',
    'Pelicans': 'NOP', 'Thunder': 'OKC', 'Kings': 'SAC', 'Timberwolves': 'MIN', 'Trail Blazers': 'POR',
    'Rockets': 'HOU', 'Jazz': 'UTA', 'Spurs': 'SAS', 'Magic': 'ORL', 'Pacers': 'IND',
    'Pistons': 'DET', 'Hornets': 'CHA', 'Wizards': 'WAS', '76ers': 'PHI', 'Raptors': 'TOR',
    // NFL
    'Chiefs': 'KC', 'Bills': 'BUF', 'Eagles': 'PHI', 'Cowboys': 'DAL', 'Ravens': 'BAL',
    'Bengals': 'CIN', 'Dolphins': 'MIA', 'Browns': 'CLE', 'Steelers': 'PIT', 'Titans': 'TEN',
    'Colts': 'IND', 'Jaguars': 'JAX', 'Texans': 'HOU', 'Broncos': 'DEN', 'Raiders': 'LV',
    'Chargers': 'LAC', 'Packers': 'GB', 'Vikings': 'MIN', 'Bears': 'CHI', 'Lions': 'DET',
    '49ers': 'SF', 'Seahawks': 'SEA', 'Rams': 'LAR', 'Cardinals': 'ARI', 'Giants': 'NYG',
    'Commanders': 'WAS', 'Saints': 'NO', 'Buccaneers': 'TB', 'Falcons': 'ATL', 'Panthers': 'CAR'
  };
  
  // Patterns to match salary mentions
  // Pattern 1: "Player Name (TEAM) - $X,XXX" or "Player Name (TEAM) with salary of $X,XXX"
  const pattern1 = /([A-Z][a-z]+(?:\s+[A-Z][a-z.']+)+)\s*\(([A-Z]{2,4})\)[^\$]*\$(\d{1,2},?\d{3})/gi;
  // Pattern 2: "Player Name ... salary of $X,XXX" or "Player Name ... $X,XXX salary"
  const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z][a-z.']+)+)[^$]{1,50}(?:salary of |priced at |costing |at )\$?(\d{1,2},?\d{3})/gi;
  // Pattern 3: "Player Name - TEAM: $X,XXX"
  const pattern3 = /([A-Z][a-z]+(?:\s+[A-Z][a-z.']+)+)\s*[-–]\s*([A-Z]{2,4})[:\s]+\$?(\d{1,2},?\d{3})/gi;
  
  const seen = new Set();
  
  // Try pattern 1
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const name = match[1].trim();
    const team = match[2].toUpperCase();
    const salary = parseInt(match[3].replace(',', ''));
    
    const key = name.toLowerCase();
    if (!seen.has(key) && salary >= 3000 && salary <= 15000) {
      seen.add(key);
      players.push({
        name,
        team,
        position: guessPosition(name, text),
        salary,
        status: 'HEALTHY'
      });
    }
  }
  
  // Try pattern 3 if we didn't get many from pattern 1
  if (players.length < 10) {
    while ((match = pattern3.exec(text)) !== null) {
      const name = match[1].trim();
      const team = match[2].toUpperCase();
      const salary = parseInt(match[3].replace(',', ''));
      
      const key = name.toLowerCase();
      if (!seen.has(key) && salary >= 3000 && salary <= 15000) {
        seen.add(key);
        players.push({
          name,
          team,
          position: guessPosition(name, text),
          salary,
          status: 'HEALTHY'
        });
      }
    }
  }
  
  console.log(`[DFS Context] Extracted ${players.length} players from text: ${players.slice(0, 5).map(p => `${p.name} $${p.salary}`).join(', ')}${players.length > 5 ? '...' : ''}`);
  return players;
}

/**
 * Guess player position from context
 * @param {string} name - Player name
 * @param {string} text - Full text to search for context
 * @returns {string} Position abbreviation
 */
function guessPosition(name, text) {
  // Look for position mentions near the player name
  const nameIndex = text.toLowerCase().indexOf(name.toLowerCase());
  if (nameIndex === -1) return 'UTIL';
  
  const context = text.substring(Math.max(0, nameIndex - 50), Math.min(text.length, nameIndex + name.length + 50)).toLowerCase();
  
  // NFL positions
  if (context.includes('quarterback') || context.includes(' qb ')) return 'QB';
  if (context.includes('running back') || context.includes(' rb ')) return 'RB';
  if (context.includes('wide receiver') || context.includes(' wr ')) return 'WR';
  if (context.includes('tight end') || context.includes(' te ')) return 'TE';
  
  // NBA positions
  if (context.includes('point guard') || context.includes(' pg ')) return 'PG';
  if (context.includes('shooting guard') || context.includes(' sg ')) return 'SG';
  if (context.includes('small forward') || context.includes(' sf ')) return 'SF';
  if (context.includes('power forward') || context.includes(' pf ')) return 'PF';
  if (context.includes('center') || context.includes(' c ')) return 'C';
  
  // Default based on salary (very rough heuristic)
  return 'UTIL';
}

/**
 * Fetch ACTIVE players from BDL with current team assignments
 * This is the source of truth for rosters - more accurate than Gemini search
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} teamIds - Team IDs to filter by
 * @returns {Array} Active players with current teams
 */
export async function fetchActivePlayersFromBDL(sport, teamIds = []) {
  const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  
  try {
    console.log(`[DFS Context] 📋 Fetching ACTIVE ${sport} players from BDL (team_ids: ${teamIds.join(', ')})`);
    
    // Use Active Players endpoint - this has CURRENT team assignments
    const players = await ballDontLieService.getPlayersActive(sportKey, {
      team_ids: teamIds,
      per_page: 100
    });
    
    console.log(`[DFS Context] ✅ Found ${players?.length || 0} active players`);
    return players || [];
  } catch (error) {
    console.error(`[DFS Context] Active players fetch failed: ${error.message}`);
    return [];
  }
}

/**
 * Fetch player injuries from BDL
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} teamIds - Team IDs to filter by
 * @returns {Array} Injured players with status
 */
export async function fetchInjuriesFromBDL(sport, teamIds = []) {
  try {
    console.log(`[DFS Context] 🏥 Fetching ${sport} injuries from BDL for teams: ${teamIds.join(', ')}`);
    
    let injuries = [];
    
    if (sport === 'NBA') {
      // Use the correct method name
      injuries = await ballDontLieService.getNbaPlayerInjuries(teamIds);
    } else if (sport === 'NFL') {
      // NFL uses different method - may need to implement
      const sportKey = 'americanfootball_nfl';
      try {
        injuries = await ballDontLieService.getPlayerInjuries(sportKey, {
          team_ids: teamIds,
          per_page: 100
        });
      } catch (e) {
        console.warn(`[DFS Context] NFL injuries not available: ${e.message}`);
      }
    }
    
    console.log(`[DFS Context] ✅ Found ${injuries?.length || 0} injury reports`);
    
    // Log critical injuries (season-ending)
    const seasonEnding = (injuries || []).filter(inj => 
      inj.description?.toLowerCase().includes('season-ending') ||
      inj.description?.toLowerCase().includes('entire') ||
      inj.return_date?.includes('Oct 1')
    );
    if (seasonEnding.length > 0) {
      console.log(`[DFS Context] ⚠️ SEASON-ENDING injuries: ${seasonEnding.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`);
    }
    
    return injuries || [];
  } catch (error) {
    console.error(`[DFS Context] Injuries fetch failed: ${error.message}`);
    return [];
  }
}

/**
 * Fetch player stats from Ball Don't Lie API
 * Uses ACTIVE PLAYERS endpoint for accurate current team assignments
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @returns {Array} Player stats with accurate team info
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
      const teamIds = [];
      const teamAbbreviations = new Map();
      for (const game of games) {
        if (game.home_team?.id) {
          teamIds.push(game.home_team.id);
          teamAbbreviations.set(game.home_team.id, game.home_team.abbreviation);
        }
        if (game.visitor_team?.id) {
          teamIds.push(game.visitor_team.id);
          teamAbbreviations.set(game.visitor_team.id, game.visitor_team.abbreviation);
        }
      }
      
      console.log(`[DFS Context] Teams playing today: ${[...teamAbbreviations.values()].join(', ')}`);
      
      // ⭐ Use ACTIVE PLAYERS endpoint - this has CURRENT team assignments after trades
      const players = await fetchActivePlayersFromBDL('NBA', teamIds);
      
      // Fetch injuries to mark players as OUT
      const injuries = await fetchInjuriesFromBDL('NBA', teamIds);
      const injuredPlayerIds = new Set(
        injuries
          .filter(i => i.status === 'Out' || i.status === 'OUT')
          .map(i => i.player?.id)
          .filter(Boolean)
      );
      
      console.log(`[DFS Context] 🏥 ${injuredPlayerIds.size} players marked OUT`);
      
      // Get current NBA season (consistent with rest of codebase: 1-indexed months)
      // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed for consistency
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NBA season ${season}-${season + 1} stats`);
      
      // Fetch season averages from BDL
      const playerIds = players.map(p => p.id).filter(Boolean).slice(0, 100);
      const seasonAverages = await ballDontLieService.getNbaSeasonAverages({
        season,
        player_ids: playerIds
      });
      
      console.log(`[DFS Context] Retrieved ${seasonAverages?.length || 0} player season averages`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FETCH L5 GAME LOGS FOR TREND ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════════
      // Get last 5 games for each player to calculate hot/cold streaks
      // This provides REAL data instead of relying on Gemini search
      const l5StatsMap = new Map();
      try {
        // Use getPlayerStats method which calls client.nba.getStats internally
        const recentStats = await ballDontLieService.getPlayerStats('basketball_nba', {
          seasons: [season],
          player_ids: playerIds.slice(0, 30), // Limit to top 30 to avoid rate limits
          per_page: 100
        });
        
        // Group by player and take last 5 games
        const playerGames = new Map();
        (recentStats || []).forEach(stat => {
          const pid = stat.player?.id;
          if (!pid) return;
          if (!playerGames.has(pid)) playerGames.set(pid, []);
          playerGames.get(pid).push(stat);
        });
        
        // Calculate L5 averages for each player
        for (const [pid, games] of playerGames) {
          // Sort by game date descending and take last 5
          const sortedGames = games
            .filter(g => g.game?.date)
            .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
            .slice(0, 5);
          
          if (sortedGames.length >= 3) { // Need at least 3 games for meaningful trend
            const l5 = {
              games: sortedGames.length,
              ppg: sortedGames.reduce((sum, g) => sum + (g.pts || 0), 0) / sortedGames.length,
              rpg: sortedGames.reduce((sum, g) => sum + (g.reb || 0), 0) / sortedGames.length,
              apg: sortedGames.reduce((sum, g) => sum + (g.ast || 0), 0) / sortedGames.length,
              spg: sortedGames.reduce((sum, g) => sum + (g.stl || 0), 0) / sortedGames.length,
              bpg: sortedGames.reduce((sum, g) => sum + (g.blk || 0), 0) / sortedGames.length,
              mpg: sortedGames.reduce((sum, g) => sum + (parseFloat(g.min) || 0), 0) / sortedGames.length,
              // Track best and worst game for ceiling/floor
              bestPts: Math.max(...sortedGames.map(g => g.pts || 0)),
              worstPts: Math.min(...sortedGames.map(g => g.pts || 0))
            };
            l5StatsMap.set(pid, l5);
          }
        }
        
        console.log(`[DFS Context] 📈 Fetched L5 trends for ${l5StatsMap.size} players`);
      } catch (err) {
        console.warn(`[DFS Context] L5 fetch failed (non-critical): ${err.message}`);
      }
      
      // Merge stats with players
      // BDL season averages structure: { player: {...}, season: 2025, stats: { pts, reb, ast, ... } }
      const statsMap = new Map();
      (seasonAverages || []).forEach(entry => {
        const pid = entry?.player?.id;
        // ⭐ FIX: Stats are nested under entry.stats, not entry directly
        if (pid && entry.stats) statsMap.set(pid, entry.stats);
      });
      
      // Return players with ACCURATE team from BDL Active Players
      return players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const l5 = l5StatsMap.get(p.id);
        const isInjured = injuredPlayerIds.has(p.id);
        
        // ⭐ FIX: Map position for DFS flex slots
        // NBA positions: PG, SG, SF, PF, C
        // Some players listed as "G" (guard) or "F" (forward) - normalize
        let position = (p.position || 'G').toUpperCase();
        if (position === 'G' || position === 'GUARD') position = 'PG';
        if (position === 'F' || position === 'FORWARD') position = 'SF';
        if (position === 'F-C' || position === 'C-F') position = 'PF'; // Power forward/center
        if (position === 'G-F' || position === 'F-G') position = 'SG'; // Combo guard/forward
        
        // Calculate trend (hot/cold) from L5 vs season
        const seasonPpg = stats.pts || 0;
        const l5Ppg = l5?.ppg || seasonPpg;
        let recentForm = 'neutral';
        if (seasonPpg > 0) {
          const pctDiff = ((l5Ppg - seasonPpg) / seasonPpg) * 100;
          if (pctDiff >= 15) recentForm = 'hot';      // 15%+ above season avg
          else if (pctDiff <= -15) recentForm = 'cold'; // 15%+ below season avg
        }
        
        return {
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          // ⭐ Team comes from ACTIVE PLAYERS - this is accurate after trades
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position,
          injured: isInjured,
          status: isInjured ? 'OUT' : 'ACTIVE',
          // ⭐ Season stats
          seasonStats: {
            ppg: stats.pts || 0,
            rpg: stats.reb || 0,
            apg: stats.ast || 0,
            spg: stats.stl || 0,
            bpg: stats.blk || 0,
            tpg: stats.fg3m || 0,
            topg: stats.tov || 1.5,
            mpg: stats.min ? parseFloat(stats.min) : 0,
            fpts: stats.nba_fantasy_pts || 0
          },
          // ⭐ NEW: L5 Recent Form (real data!)
          l5Stats: l5 ? {
            ppg: Math.round(l5.ppg * 10) / 10,
            rpg: Math.round(l5.rpg * 10) / 10,
            apg: Math.round(l5.apg * 10) / 10,
            mpg: Math.round(l5.mpg * 10) / 10,
            bestPts: l5.bestPts,
            worstPts: l5.worstPts,
            games: l5.games
          } : null,
          recentForm: recentForm // 'hot', 'cold', or 'neutral'
        };
      }).filter(p => !p.injured); // Filter out injured players
      
    } else if (sport === 'NFL') {
      // Get NFL games for today
      const allGames = await ballDontLieService.getGames('americanfootball_nfl', { dates: [dateStr] }, 5);
      
      if (!allGames || allGames.length === 0) {
        console.log('[DFS Context] No NFL games found for today');
        return [];
      }
      
      // ⭐ Filter to ONLY games actually on this specific date
      // BDL returns all Week 17 games, but status field has actual date like "12/27 - 4:30 PM EST"
      const targetMonth = dateStr.split('-')[1]; // "12"
      const targetDay = dateStr.split('-')[2]; // "27"
      const targetDateStr = `${targetMonth}/${targetDay}`; // "12/27"
      
      const games = allGames.filter(game => {
        // Check if status contains today's date (e.g., "12/27 - 4:30 PM EST")
        const status = game.status || '';
        return status.includes(targetDateStr);
      });
      
      console.log(`[DFS Context] Filtered to ${games.length} NFL games actually on ${targetDateStr} (from ${allGames.length} total week games)`);
      
      if (games.length === 0) {
        console.log('[DFS Context] No NFL games found for TODAY specifically');
        // List what games are available
        allGames.forEach(g => {
          console.log(`  - ${g.visitor_team?.abbreviation} @ ${g.home_team?.abbreviation}: ${g.status}`);
        });
        return [];
      }
      
      // Log today's games
      console.log(`[DFS Context] Today's NFL games:`);
      games.forEach(g => {
        console.log(`  - ${g.visitor_team?.abbreviation} @ ${g.home_team?.abbreviation}: ${g.status}`);
      });
      
      // Get team IDs from TODAY's games only
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
      // NFL season starts in September, so Sept-Dec = current year, Jan-Jul = previous year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed for consistency
      // NFL: Sept(9)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
      const season = currentMonth >= 9 ? currentYear : currentYear - 1;
      
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
      
      const playerList = players.map(p => {
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
      
      // ⭐ Add DST entries for each team playing
      const teamAbbrs = [...new Set(playerList.map(p => p.team))];
      const dstEntries = teamAbbrs.map(team => ({
        name: `${team} DST`,
        team: team,
        position: 'DST',
        seasonStats: { isDST: true },
        isDST: true
      }));
      
      console.log(`[DFS Context] Added ${dstEntries.length} DST entries for teams: ${teamAbbrs.join(', ')}`);
      
      // ⭐ Fetch kickers from team rosters (BDL has them as "PK" position in roster)
      // Note: Only FanDuel NFL uses kickers (DraftKings NFL doesn't have K position)
      const kickerEntries = [];
      try {
        for (const teamId of teamIds) {
          // getNflTeamRoster returns array directly, not {data: []}
          const roster = await ballDontLieService.getNflTeamRoster(teamId, season);
          if (roster && roster.length > 0) {
            // Find kickers (PK position in roster depth chart)
            const kickers = roster.filter(r => 
              r.position === 'PK' || 
              r.player?.position_abbreviation === 'PK' ||
              r.player?.position === 'Place Kicker' ||
              r.player?.position === 'Kicker'
            );
            for (const k of kickers) {
              if (k.depth === 1) { // Only get starter
                // Get team abbreviation from the game data
                const teamAbbr = k.player?.team?.abbreviation || 
                  games.find(g => g.home_team?.id === teamId)?.home_team?.abbreviation ||
                  games.find(g => g.visitor_team?.id === teamId)?.visitor_team?.abbreviation ||
                  'UNK';
                kickerEntries.push({
                  name: k.player_name || `${k.player?.first_name} ${k.player?.last_name}`,
                  team: teamAbbr,
                  position: 'K',
                  seasonStats: { isKicker: true },
                  isKicker: true,
                  id: k.player?.id
                });
              }
            }
          }
        }
        if (kickerEntries.length > 0) {
          console.log(`[DFS Context] Added ${kickerEntries.length} kickers: ${kickerEntries.map(k => `${k.name} (${k.team})`).join(', ')}`);
        }
      } catch (e) {
        console.warn(`[DFS Context] Could not fetch kickers from rosters: ${e.message}`);
      }
      
      return [...playerList, ...dstEntries, ...kickerEntries];
    }
    
    return [];
  } catch (error) {
    console.error(`[DFS Context] BDL fetch error: ${error.message}`);
    return [];
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INJURY STATUS FILTERING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For DFS, we MUST exclude players who won't play:
 * - OUT: Definitely not playing → EXCLUDE
 * - DOUBTFUL: Very unlikely to play (typically <25% chance) → EXCLUDE
 * - QUESTIONABLE: May or may not play → INCLUDE (Gemini provides context)
 * - PROBABLE/GTD: Likely to play → INCLUDE
 * - HEALTHY: Playing → INCLUDE
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
const EXCLUDED_INJURY_STATUSES = ['OUT', 'DOUBTFUL', 'IR', 'PUP', 'SUSPENDED'];

/**
 * Check if a player should be excluded based on injury status
 * @param {string} status - Player injury status
 * @returns {boolean} True if player should be excluded
 */
function shouldExcludePlayer(status) {
  if (!status) return false;
  const upperStatus = status.toUpperCase();
  return EXCLUDED_INJURY_STATUSES.some(excluded => upperStatus.includes(excluded));
}

/**
 * Merge BDL stats with Grounding salary data
 * BDL is SOURCE OF TRUTH for: team, position, stats
 * Grounding provides: salary, ownership, DFS context, injury status
 * 
 * ⚠️ CRITICAL: Excludes OUT and DOUBTFUL players from lineup consideration
 * 
 * @param {Array} bdlPlayers - Players with stats from BDL (accurate teams/stats)
 * @param {Array} groundedPlayers - Players with salaries from Grounding
 * @returns {Array} Merged player pool (excluding OUT/DOUBTFUL)
 */
export function mergePlayerData(bdlPlayers, groundedPlayers) {
  // Create lookup maps for grounded players - multiple keys for better matching
  const salaryMap = new Map();
  const lastNameMap = new Map(); // Secondary lookup by last name + team
  
  // Track excluded players for logging
  const excludedPlayers = [];
  
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const salaryEntry = {
      salary: p.salary,
      status: p.status,
      notes: p.notes,
      ownership: p.ownership,
      dvpRank: p.dvpRank,
      recentForm: p.recentForm,
      originalName: p.name
    };
    salaryMap.set(key, salaryEntry);
    
    // Also create last name + team key for fuzzy matching
    const nameParts = p.name.split(' ');
    if (nameParts.length >= 2 && p.team) {
      const lastName = nameParts[nameParts.length - 1].toLowerCase();
      const lastNameKey = `${lastName}_${(p.team || '').toLowerCase()}`;
      lastNameMap.set(lastNameKey, salaryEntry);
    }
  }
  
  // Merge data - BDL is source of truth for team/position/stats
  const merged = [];
  let directMatches = 0;
  let fuzzyMatches = 0;
  
  for (const p of bdlPlayers) {
    const key = normalizePlayerName(p.name);
    let salaryData = salaryMap.get(key);
    
    // Fuzzy match: try last name + team if exact match failed
    if (!salaryData && p.team) {
      const nameParts = p.name.split(' ');
      if (nameParts.length >= 2) {
        const lastName = nameParts[nameParts.length - 1].toLowerCase();
        const lastNameKey = `${lastName}_${(p.team || '').toLowerCase()}`;
        salaryData = lastNameMap.get(lastNameKey);
        if (salaryData) fuzzyMatches++;
      }
    } else if (salaryData) {
      directMatches++;
    }
    
    if (salaryData && salaryData.salary > 0) {
      // ⭐ CHECK INJURY STATUS - Exclude OUT/DOUBTFUL players
      const playerStatus = salaryData.status || p.status || 'HEALTHY';
      if (shouldExcludePlayer(playerStatus)) {
        excludedPlayers.push({ name: p.name, status: playerStatus, reason: 'Injury status' });
        continue; // Skip this player
      }
      
      merged.push({
        // BDL provides accurate: name, team, position, seasonStats
        name: p.name,
        team: p.team,  // ALWAYS use BDL team (accurate after trades)
        position: p.position,
        seasonStats: p.seasonStats,
        id: p.id,
        // Grounding provides: salary and DFS context
        salary: salaryData.salary,
        status: playerStatus,
        notes: salaryData.notes || '',
        ownership: salaryData.ownership,
        dvpRank: salaryData.dvpRank,
        recentForm: salaryData.recentForm
      });
    }
  }
  
  // Add grounded players not in BDL (like DST for NFL, or players BDL missed)
  // But ONLY if we have no BDL data at all for that player
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const exists = merged.some(m => normalizePlayerName(m.name) === key);
    
    // Only add non-BDL players for positions BDL doesn't track (DST, K)
    const isBdlMissedPosition = ['DST', 'DEF', 'K'].includes(p.position?.toUpperCase());
    
    // ⭐ CHECK INJURY STATUS for grounded-only players too
    if (shouldExcludePlayer(p.status)) {
      excludedPlayers.push({ name: p.name, status: p.status, reason: 'Injury status (grounded)' });
      continue;
    }
    
    if (!exists && p.salary > 0 && isBdlMissedPosition) {
      merged.push({
        name: p.name,
        team: p.team,
        position: p.position,
        salary: p.salary,
        status: p.status || 'HEALTHY',
        notes: p.notes || '',
        ownership: p.ownership,
        seasonStats: {} // No BDL stats for DST/K
      });
    }
  }
  
  // Log excluded players
  if (excludedPlayers.length > 0) {
    console.log(`[DFS Context] ❌ EXCLUDED ${excludedPlayers.length} players (OUT/DOUBTFUL):`);
    excludedPlayers.forEach(p => console.log(`   - ${p.name}: ${p.status}`));
  }
  
  // ⭐ Create a Set of excluded player names for the salary estimation fallback
  const excludedPlayerNames = new Set(excludedPlayers.map(p => normalizePlayerName(p.name)));
  
  console.log(`[DFS Context] Merged ${merged.length} players (${directMatches} exact + ${fuzzyMatches} fuzzy matches from ${groundedPlayers.length} grounded, ${bdlPlayers.length} BDL)`);
  
  // If we have too few merged players, estimate salaries for remaining BDL players
  // This ensures we always have enough players to build a lineup
  if (merged.length < 30 && bdlPlayers.length > merged.length) {
    console.warn(`[DFS Context] ⚠️ Only ${merged.length} matches - estimating salaries for remaining BDL players`);
    
    // Determine if this is a small slate (limited games = tighter salary distribution)
    const isSmallSlate = bdlPlayers.length < 80;
    console.log(`[DFS Context] Slate type: ${isSmallSlate ? 'SMALL (2-4 games)' : 'MAIN (5+ games)'}`);
    
    for (const p of bdlPlayers) {
      const key = normalizePlayerName(p.name);
      const alreadyMerged = merged.some(m => normalizePlayerName(m.name) === key);
      
      // Check if player has valid stats (NBA: ppg, NFL: passing/rushing/receiving)
      const hasNBAStats = p.seasonStats?.ppg > 0;
      // NFL stats use snake_case from BDL: passing_yards_per_game, rushing_touchdowns, etc.
      const hasNFLStats = (p.seasonStats?.passing_yards_per_game > 0 || 
                          p.seasonStats?.rushing_yards_per_game > 0 || 
                          p.seasonStats?.receiving_yards_per_game > 0 || 
                          p.seasonStats?.passing_touchdowns > 0 ||
                          p.seasonStats?.rushing_touchdowns > 0 ||
                          p.seasonStats?.receiving_touchdowns > 0 ||
                          p.seasonStats?.receptions > 0);
      
      // Handle DST and Kicker entries separately (no traditional stats)
      const isDST = p.position === 'DST' || p.isDST;
      const isKicker = p.position === 'K' || p.isKicker;
      
      // ⭐ Check if this player was already excluded due to injury status from grounding
      const normalizedName = normalizePlayerName(p.name);
      if (excludedPlayerNames.has(normalizedName)) {
        continue; // Skip players already marked OUT/DOUBTFUL from grounding
      }
      
      // Also check injury status on the BDL player object itself
      const playerStatus = p.status || 'HEALTHY';
      if (shouldExcludePlayer(playerStatus)) {
        continue; // Skip OUT/DOUBTFUL players
      }
      
      if (!alreadyMerged && (hasNBAStats || hasNFLStats || isDST || isKicker)) {
        let fpts, estimatedSalary;
        const position = (p.position || '').toUpperCase();
        
        if (isDST) {
          // DST average fantasy points per game (typical range: 5-12)
          fpts = 8;
          estimatedSalary = isSmallSlate ? 4000 : 3500;
        } else if (isKicker) {
          // Kicker average fantasy points per game (typical range: 6-10)
          fpts = 8;
          estimatedSalary = isSmallSlate ? 4500 : 4000;
        } else if (hasNBAStats) {
          // NBA fantasy points estimation
          fpts = p.seasonStats.fpts || (p.seasonStats.ppg + p.seasonStats.rpg * 1.2 + p.seasonStats.apg * 1.5);
        } else {
          // ═══════════════════════════════════════════════════════════════════
          // NFL Fantasy Points Estimation - CORRECT PER-GAME FORMULA
          // ═══════════════════════════════════════════════════════════════════
          // BDL provides:
          // - *_yards_per_game = already per-game (e.g., 233 pass ypg)
          // - *_touchdowns = SEASON TOTAL (e.g., 25 TDs)
          // - receptions = SEASON TOTAL (e.g., 65 receptions)
          //
          // DraftKings scoring (Full PPR):
          // - Passing: 0.04 pts/yd, 4 pts/TD, -1 pts/INT
          // - Rushing: 0.1 pts/yd, 6 pts/TD
          // - Receiving: 0.1 pts/yd, 6 pts/TD, 1 pt/reception
          // ═══════════════════════════════════════════════════════════════════
          
          const stats = p.seasonStats || {};
          const gamesPlayed = stats.games_played || 16;
          
          // Yards per game (already per-game from BDL)
          const passYpg = stats.passing_yards_per_game || 0;
          const rushYpg = stats.rushing_yards_per_game || 0;
          const recYpg = stats.receiving_yards_per_game || 0;
          
          // Convert season totals to per-game
          const passTdPg = (stats.passing_touchdowns || 0) / gamesPlayed;
          const intsPg = (stats.passing_interceptions || 0) / gamesPlayed;
          const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
          const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
          const recPg = (stats.receptions || 0) / gamesPlayed;
          
          // Calculate per-game fantasy points (DraftKings Full PPR)
          fpts = (passYpg * 0.04) + (passTdPg * 4) - (intsPg * 1) + 
                 (rushYpg * 0.1) + (rushTdPg * 6) + 
                 (recYpg * 0.1) + (recTdPg * 6) + recPg;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // SALARY ESTIMATION - Position-aware for NFL, small slate adjustment
        // ═══════════════════════════════════════════════════════════════════
        // Small slates have TIGHTER salary distribution to prevent stacking all stars
        // Elite players cost MORE on small slates to force tough decisions
        // ═══════════════════════════════════════════════════════════════════
        
        if (!isDST && !isKicker) {
          if (hasNFLStats) {
            // NFL position-specific salary estimation
            if (position === 'QB') {
              // Elite QB (Herbert): 20+ fpts/game = $7,500-$8,500
              // Mid-tier QB: 15-20 fpts = $6,000-$7,500
              // Backup QB: <15 fpts = $4,500-$6,000
              if (fpts >= 20) {
                estimatedSalary = isSmallSlate ? 7800 + (fpts - 20) * 70 : 7000 + (fpts - 20) * 100;
              } else if (fpts >= 15) {
                estimatedSalary = isSmallSlate ? 6500 + (fpts - 15) * 260 : 5500 + (fpts - 15) * 300;
              } else {
                estimatedSalary = isSmallSlate ? 5000 + fpts * 100 : 4500 + fpts * 70;
              }
            } else if (position === 'RB') {
              // Elite RB (Henry/Jacobs): 18+ fpts = $7,200-$8,400
              // Starter RB: 12-18 fpts = $5,500-$7,200
              // Backup RB: <12 fpts = $4,000-$5,500
              if (fpts >= 18) {
                estimatedSalary = isSmallSlate ? 7500 + (fpts - 18) * 90 : 7000 + (fpts - 18) * 100;
              } else if (fpts >= 12) {
                estimatedSalary = isSmallSlate ? 5800 + (fpts - 12) * 285 : 5200 + (fpts - 12) * 300;
              } else {
                estimatedSalary = isSmallSlate ? 4200 + fpts * 130 : 4000 + fpts * 100;
              }
            } else if (position === 'WR') {
              // Elite WR (Nico Collins): 16+ fpts = $6,800-$8,000
              // WR2: 10-16 fpts = $5,000-$6,800
              // WR3: <10 fpts = $3,500-$5,000
              if (fpts >= 16) {
                estimatedSalary = isSmallSlate ? 7000 + (fpts - 16) * 100 : 6500 + (fpts - 16) * 100;
              } else if (fpts >= 10) {
                estimatedSalary = isSmallSlate ? 5200 + (fpts - 10) * 300 : 4800 + (fpts - 10) * 285;
              } else {
                estimatedSalary = isSmallSlate ? 3800 + fpts * 140 : 3500 + fpts * 130;
              }
            } else if (position === 'TE') {
              // Elite TE (Andrews): 12+ fpts = $6,000-$7,000
              // Mid TE: 8-12 fpts = $4,500-$6,000
              // Backup TE: <8 fpts = $3,000-$4,500
              if (fpts >= 12) {
                estimatedSalary = isSmallSlate ? 6200 + (fpts - 12) * 100 : 5800 + (fpts - 12) * 100;
              } else if (fpts >= 8) {
                estimatedSalary = isSmallSlate ? 4800 + (fpts - 8) * 350 : 4300 + (fpts - 8) * 375;
              } else {
                estimatedSalary = isSmallSlate ? 3200 + fpts * 200 : 3000 + fpts * 165;
              }
            } else {
              // Default NFL position
              estimatedSalary = 4500 + fpts * 150;
            }
          } else {
            // NBA salary estimation (existing logic)
            if (fpts >= 50) {
              estimatedSalary = 10000 + (fpts - 50) * 100;
            } else if (fpts >= 35) {
              estimatedSalary = 7000 + (fpts - 35) * 200;
            } else if (fpts >= 20) {
              estimatedSalary = 4500 + (fpts - 20) * 167;
            } else {
              estimatedSalary = 3500 + fpts * 50;
            }
          }
          
          // Round to nearest $100
          estimatedSalary = Math.round(estimatedSalary / 100) * 100;
        }
        
        // Determine note for player type
        let playerNote = 'Estimated salary';
        if (isDST) playerNote = 'Defense/Special Teams';
        else if (isKicker) playerNote = 'Place Kicker';
        
        merged.push({
          name: p.name,
          team: p.team,
          position: p.position,
          seasonStats: p.seasonStats || {},
          id: p.id,
          salary: Math.min(12500, Math.max(3000, estimatedSalary)), // Cap between $3000-$12500
          status: p.status || 'HEALTHY',
          notes: playerNote,
          estimatedSalary: true, // Flag so we know this is estimated
          isDST: isDST,
          isKicker: isKicker
        });
      }
    }
    
    console.log(`[DFS Context] After salary estimation: ${merged.length} players`);
  }
  
  return merged;
}

/**
 * Normalize player name for matching
 * Handles: accents, apostrophes, Jr/Sr/III, hyphens, etc.
 */
function normalizePlayerName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    // Remove accents/diacritics (Dončić → Doncic, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove suffixes (Jr., Sr., III, II)
    .replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, '')
    // Replace hyphens with spaces (Karl-Anthony → Karl Anthony)
    .replace(/-/g, ' ')
    // Remove apostrophes (O'Neale → ONeale)
    .replace(/'/g, '')
    // Remove periods (P.J. → PJ)
    .replace(/\./g, '')
    // Remove all non-alphanumeric except spaces
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPREHENSIVE DFS CONTEXT - All the factors Gary searches for
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * GAME ENVIRONMENT:
 * - Pace of play (possessions per game)
 * - Blowout risk (heavy favorites = starters sit)
 * - Back-to-back games (rest/underperformance risk)
 * 
 * OWNERSHIP & STRATEGY:
 * - Projected ownership % (contrarian plays)
 * - Correlation stacks (QB+WR, game stacks)
 * 
 * PLAYER-SPECIFIC CONTEXT:
 * - Recent form (L5/L10 hot/cold streaks)
 * - Usage rate spikes (teammate injuries)
 * - DvP rankings (defense vs position)
 * - Revenge games (vs former teams)
 * - Defensive matchups (player vs defender)
 * 
 * NFL-SPECIFIC:
 * - Red zone targets (TD upside)
 * - Snap count % (opportunity)
 * - Target share (% of team targets)
 * - Weather (wind/rain affects passing)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Fetch COMPREHENSIVE DFS context using Gemini Search Grounding
 * This is the main function that fetches ALL DFS-specific factors
 * 
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} slateDate - Date string (e.g., 'December 25, 2025')
 * @param {Array} teams - Array of team abbreviations playing today
 * @returns {Object} Complete DFS context with all factors
 */
export async function fetchComprehensiveDFSContext(platform, sport, slateDate, teams = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - returning empty context');
    return { players: [], gameContext: [], groundingUsed: false };
  }
  
  const platformName = platform === 'draftkings' ? 'DraftKings' : 'FanDuel';
  const teamsStr = teams.join(', ') || 'all teams';
  
  try {
    console.log(`[DFS Context] 🎯 Fetching COMPREHENSIVE ${platformName} ${sport} context for ${slateDate}`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{ google_search: {} }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: DFS_MODEL_CONFIG.temperature,
        topP: DFS_MODEL_CONFIG.topP,
        maxOutputTokens: 16384, // Larger for comprehensive data
        thinkingConfig: { includeThoughts: true }
      }
    });

    let prompt;
    if (sport === 'NBA') {
      prompt = `You are Gary AI, an expert DFS analyst. Search for COMPREHENSIVE DFS data for ${platformName} NBA on ${slateDate}.

Teams playing: ${teamsStr}

**SEARCH FOR ALL OF THE FOLLOWING:**

1. **PLAYER SALARIES & OWNERSHIP** (search "${platformName} NBA ownership projections ${slateDate}"):
   - Player salaries for today's slate
   - Projected ownership % for top 40 players
   - Identify chalk plays (>20% owned) vs contrarian (<5% owned)

2. **DEFENSE VS POSITION (DvP)** (search "NBA defense vs position rankings December 2025"):
   - Rank 1-30 for each position (1 = worst defense, easiest matchup)
   - Which defenses are exploitable at PG, SG, SF, PF, C?

3. **PACE OF PLAY** (search "NBA team pace rankings 2025"):
   - Possessions per game by team
   - Fast-paced games = more fantasy opportunities

4. **RECENT FORM (L5)** (search "NBA fantasy hot streaks December 2025"):
   - Players exceeding season average by 20%+ in last 5 games = "hot"
   - Players below average by 20%+ = "cold"

5. **USAGE RATE CHANGES** (search "NBA injury impacts fantasy December 2025"):
   - When star X is out, who gets the usage boost?
   - Target share redistribution

6. **BACK-TO-BACK STATUS** (search "NBA back to back schedule ${slateDate}"):
   - Which teams are on 2nd night of B2B?
   - Veterans may rest or underperform

7. **BLOWOUT RISK** (search "NBA point spreads ${slateDate}"):
   - Games with spread >10 = starters may sit in 4th quarter
   - Target close games for full minutes

8. **REVENGE GAMES** (search "NBA players vs former teams ${slateDate}"):
   - Players facing former team get extra motivation
   - Historical stats vs former team

9. **CORRELATION STACKS** (search "NBA DFS stacking strategies"):
   - Same-game parlay recommendations
   - High-scoring game stacks

Return as JSON:
{
  "players": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "PG/SG/SF/PF/C",
      "salary": 9500,
      "ownership": 18.5,
      "dvpRank": 5,
      "recentForm": "hot|cold|neutral",
      "isB2B": false,
      "isRevenge": false,
      "usageBoost": null,
      "blowoutRisk": false,
      "notes": "Key context about this player"
    }
  ],
  "gameContext": [
    {
      "game": "TM @ TM",
      "pace": "fast|average|slow",
      "spread": -5.5,
      "total": 225.5,
      "stackable": true,
      "notes": "Game-specific narrative"
    }
  ],
  "dvpRankings": {
    "PG": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "SG": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "SF": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "PF": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "C": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] }
  },
  "hotStreaks": ["Player1", "Player2"],
  "coldStreaks": ["Player3", "Player4"],
  "revengeGames": [{ "player": "Name", "formerTeam": "TM", "history": "avg vs team" }],
  "usageSpikes": [{ "player": "Name", "reason": "Star X is out", "boost": "+15% usage" }],
  "b2bFades": ["Team1", "Team2"],
  "recommendedStacks": [{ "game": "TM @ TM", "stack": ["Player1", "Player2"], "reason": "High total" }]
}`;
    } else {
      // NFL prompt
      prompt = `You are Gary AI, an expert DFS analyst. Search for COMPREHENSIVE DFS data for ${platformName} NFL on ${slateDate}.

Teams playing: ${teamsStr}

**SEARCH FOR ALL OF THE FOLLOWING:**

1. **PLAYER SALARIES & OWNERSHIP** (search "${platformName} NFL ownership projections ${slateDate}"):
   - Player salaries for today's slate
   - Projected ownership % for top 50 players
   - Identify chalk plays vs contrarian options

2. **DEFENSE VS POSITION (DvP)** (search "NFL defense vs position rankings 2025"):
   - Fantasy points allowed by position
   - Which defenses are exploitable at QB, RB, WR, TE?

3. **RED ZONE TARGETS** (search "NFL red zone targets leaders 2025"):
   - Who gets the goal-line work?
   - Red zone target share for WRs/TEs
   - Goal-line carries for RBs

4. **SNAP COUNT %** (search "NFL snap counts week ${slateDate}"):
   - Players with 80%+ snaps = volume
   - Rising snap counts = opportunity increasing

5. **TARGET SHARE** (search "NFL target share leaders 2025"):
   - % of team's passes going to each player
   - Air yards share for big-play upside

6. **RECENT FORM (L3)** (search "NFL fantasy hot players December 2025"):
   - Players exceeding projections last 3 weeks
   - Cold streaks to fade

7. **WEATHER** (search "NFL weather ${slateDate}"):
   - Wind >15mph = fade deep passers
   - Rain/snow = boost RBs, fade WRs
   - Dome games = safe passing

8. **GAME SCRIPT** (search "NFL point spreads ${slateDate}"):
   - Heavy favorites run more (RB boost)
   - Underdogs pass more (WR/TE boost)

9. **INJURY IMPACTS** (search "NFL injury impacts fantasy ${slateDate}"):
   - WR1 out = WR2/WR3 target spike
   - RB1 out = backup RB value

10. **REVENGE GAMES** (search "NFL players vs former teams ${slateDate}"):
    - Extra motivation factor

11. **CORRELATION STACKS** (search "NFL DFS stacking strategies"):
    - QB + WR1 stacks
    - Game stacks for shootouts

Return as JSON:
{
  "players": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "QB/RB/WR/TE/DST/K",
      "salary": 7500,
      "ownership": 12.5,
      "dvpRank": 8,
      "recentForm": "hot|cold|neutral",
      "snapPct": 85,
      "targetShare": 24.5,
      "redZoneTargets": 8,
      "isRevenge": false,
      "weatherImpact": "none|positive|negative",
      "notes": "Key context"
    }
  ],
  "gameContext": [
    {
      "game": "TM @ TM",
      "spread": -7.5,
      "total": 48.5,
      "weather": "Clear/Dome/Wind/Rain",
      "gameScript": "Favorite runs / Underdog passes",
      "stackable": true,
      "notes": "Game narrative"
    }
  ],
  "dvpRankings": {
    "QB": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "RB": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "WR": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "TE": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] }
  },
  "hotStreaks": ["Player1", "Player2"],
  "coldStreaks": ["Player3", "Player4"],
  "revengeGames": [{ "player": "Name", "formerTeam": "TM" }],
  "injuryBoosts": [{ "player": "Name", "reason": "WR1 out", "boost": "+8 targets expected" }],
  "weatherFades": ["Player1 (wind)", "Player2 (rain)"],
  "recommendedStacks": [{ "qb": "QB Name", "receivers": ["WR1", "WR2"], "reason": "Shootout expected" }]
}`;
    }

    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Comprehensive context fetched in ${duration}ms`);
    
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...parsed,
        groundingUsed: true
      };
    }
    
    return { players: [], gameContext: [], groundingUsed: false };
    
  } catch (error) {
    console.error(`[DFS Context] Comprehensive context error: ${error.message}`);
    return { players: [], gameContext: [], groundingUsed: false, error: error.message };
  }
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
    let games = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5);
    
    // For NFL, filter to only games actually on this date (BDL returns whole week)
    if (sport === 'NFL' && games?.length > 0) {
      const targetMonth = dateStr.split('-')[1];
      const targetDay = dateStr.split('-')[2];
      const targetDateStr = `${targetMonth}/${targetDay}`;
      
      games = games.filter(game => {
        const status = game.status || '';
        return status.includes(targetDateStr);
      });
    }
    
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
  let games = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5) || [];
  
  // For NFL, filter to only games actually on this date (BDL returns whole week)
  if (sport === 'NFL' && games.length > 0) {
    const targetMonth = dateStr.split('-')[1];
    const targetDay = dateStr.split('-')[2];
    const targetDateStr = `${targetMonth}/${targetDay}`;
    
    games = games.filter(game => {
      const status = game.status || '';
      return status.includes(targetDateStr);
    });
    console.log(`[DFS Context] Filtered to ${games.length} NFL games for ${targetDateStr}`);
  }
  
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
  
  const bdlCount = bdlPlayers.length;
  const groundedCount = groundedData.players?.length || 0;
  
  console.log(`[DFS Context] BDL players: ${bdlCount}`);
  console.log(`[DFS Context] Grounded players: ${groundedCount}`);
  console.log(`[DFS Context] Narratives: ${narrativeContext.narratives?.length || 0} games, ${narrativeContext.targetPlayers?.length || 0} targets`);
  
  // If grounding failed but we have BDL players, log the issue
  if (groundedCount === 0 && bdlCount > 0) {
    console.warn(`[DFS Context] ⚠️ Gemini Grounding returned no players - salary data unavailable`);
    console.warn(`[DFS Context] ⚠️ Response snippet: ${groundedData.rawResponse?.substring(0, 200) || 'none'}`);
  }
  
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
    buildTimeMs: duration,
    // Diagnostic info (for debugging when things fail)
    bdlPlayersCount: bdlCount,
    groundedPlayersCount: groundedCount,
    error: mergedPlayers.length === 0 
      ? (groundedCount === 0 ? 'Gemini Grounding failed - no salary data' : 'BDL fetch failed')
      : null
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

