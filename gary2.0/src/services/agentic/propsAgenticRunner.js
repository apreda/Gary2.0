/**
 * Props Agentic Runner
 * Full agentic iteration loop for player prop analysis (like game picks)
 * Gary can call tools mid-analysis to fetch stats organically
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { openaiService, GEMINI_FLASH_MODEL } from '../openaiService.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { geminiGroundingSearch } from './scoutReport/scoutReportBuilder.js';

// Props use Gemini 3 Flash for speed
const PROPS_MODEL = GEMINI_FLASH_MODEL;
import { safeJsonParse } from './agenticUtils.js';
import { NFL_PROPS_CONSTITUTION } from './constitution/nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './constitution/nbaPropsConstitution.js';
import { EPL_PROPS_CONSTITUTION } from './constitution/eplPropsConstitution.js';
import { NHL_PROPS_CONSTITUTION } from './constitution/nhlPropsConstitution.js';

// Lazy-initialize Gemini client for props
let geminiProps = null;
function getGeminiForProps() {
  if (!geminiProps) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY required');
    geminiProps = new GoogleGenerativeAI(apiKey, "v1beta");
  }
  return geminiProps;
}

// ============================================================================
// SPORT-SPECIFIC PROP TOOL DEFINITIONS (Like the stat menu for game picks)
// ============================================================================

// Common tools available for all sports
const COMMON_PROP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_player_context',
      description: 'Search for recent news, injuries, or context about a player via Google',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g., "LeBron James injury status December 2025")' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finalize_props',
      description: 'Output your final prop picks. CRITICAL: Each key_stat MUST include its source tool in parentheses.',
      parameters: {
        type: 'object',
        properties: {
          picks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                player: { type: 'string' },
                team: { type: 'string' },
                prop: { type: 'string', description: 'e.g., "pts 25.5" or "shots_on_goal 3.5"' },
                line: { type: 'number' },
                bet: { type: 'string', enum: ['over', 'under'] },
                odds: { type: 'number' },
                confidence: { type: 'number', description: '0.5 to 1.0' },
                rationale: { type: 'string', description: '5-7 sentences explaining the pick using ONLY stats from tool responses' },
                key_stats: { 
                  type: 'array', 
                  items: { type: 'string' }, 
                  description: 'REQUIRED FORMAT: Each stat MUST end with source in parentheses. Examples: "L5 receptions: 7, 1, 5, 4, 9 (from game_logs)", "Season avg: 4.5 (from season_stats)", "QB: Oladokun starting (from search_context)". Stats without source attribution will be rejected.'
                }
              },
              required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
            }
          }
        },
        required: ['picks']
      }
    }
  }
];

// NFL-specific prop tools
const NFL_PROP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_player_game_logs',
      description: 'Fetch last 5 NFL game logs for a player (passing yards, rushing yards, receiving yards, TDs, receptions)',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name (e.g., "George Pickens", "Jared Goff")' },
          stat_type: { type: 'string', enum: ['receiving', 'rushing', 'passing', 'all'], description: 'Type of stats to fetch' }
        },
        required: ['player_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_player_season_stats',
      description: 'Fetch NFL season stats for a player (total yards, TDs, targets, carries)',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name' }
        },
        required: ['player_name']
      }
    }
  },
  ...COMMON_PROP_TOOLS
];

// NBA-specific prop tools
const NBA_PROP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_player_game_logs',
      description: 'Fetch last 5-10 NBA game logs for a player (points, rebounds, assists, threes, blocks, steals, minutes)',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name (e.g., "LeBron James", "Anthony Davis")' }
        },
        required: ['player_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_player_season_stats',
      description: 'Fetch NBA season averages for a player (PPG, RPG, APG, FG%, 3PT%, minutes)',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name' }
        },
        required: ['player_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_team_injuries',
      description: 'Fetch current injury report for an NBA team',
      parameters: {
        type: 'object',
        properties: {
          team_name: { type: 'string', description: 'Team name (e.g., "Lakers", "Celtics")' }
        },
        required: ['team_name']
      }
    }
  },
  ...COMMON_PROP_TOOLS
];

// NHL-specific prop tools
const NHL_PROP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_player_game_logs',
      description: 'Fetch last 5-10 NHL game logs for a player (goals, assists, points, shots on goal, time on ice, +/-)',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name (e.g., "Connor McDavid", "Leon Draisaitl")' }
        },
        required: ['player_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_player_season_stats',
      description: 'Fetch NHL season stats for a player (goals, assists, points, SOG, PP goals, TOI, shooting %)',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name' }
        },
        required: ['player_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_goalie_stats',
      description: 'Fetch goalie stats for an NHL team (saves, save %, GAA, wins)',
      parameters: {
        type: 'object',
        properties: {
          team_name: { type: 'string', description: 'Team name (e.g., "Oilers", "Maple Leafs")' }
        },
        required: ['team_name']
      }
    }
  },
  ...COMMON_PROP_TOOLS
];

// Map sport labels to their tool definitions
const SPORT_PROP_TOOLS = {
  'NFL': NFL_PROP_TOOLS,
  'NBA': NBA_PROP_TOOLS,
  'NHL': NHL_PROP_TOOLS,
  'EPL': COMMON_PROP_TOOLS, // EPL uses common tools only for now
  'NCAAB': NBA_PROP_TOOLS,  // College basketball uses NBA-style tools
  'NCAAF': NFL_PROP_TOOLS   // College football uses NFL-style tools
};

// Get tools for a specific sport
function getPropsToolsForSport(sportLabel) {
  return SPORT_PROP_TOOLS[sportLabel] || COMMON_PROP_TOOLS;
}

// Legacy alias for backwards compatibility
const PROPS_TOOL_DEFINITIONS = NFL_PROP_TOOLS;

// Map of sport labels to constitutions
const SPORT_CONSTITUTIONS = {
  'NFL': NFL_PROPS_CONSTITUTION,
  'NBA': NBA_PROPS_CONSTITUTION,
  'EPL': EPL_PROPS_CONSTITUTION,
  'NHL': NHL_PROPS_CONSTITUTION,
};

/**
 * Get the appropriate constitution for a sport
 */
function getConstitution(sportLabel) {
  return SPORT_CONSTITUTIONS[sportLabel] || NFL_PROPS_CONSTITUTION;
}

// Convert OpenAI tool format to Gemini format
function convertToolsForGemini(tools) {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

// Gemini safety settings
const GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Call Gemini with tools for props iteration
 * Uses startChat() pattern like game picks for proper context management
 */
async function callGeminiForProps(messages, tools, modelName) {
  const gemini = getGeminiForProps();
  
  // Convert tools to Gemini function declarations
  const functionDeclarations = convertToolsForGemini(tools);
  
  const geminiModel = gemini.getGenerativeModel({
    model: modelName || PROPS_MODEL,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    tools: [{ functionDeclarations }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 8000
    }
  });

  // Convert messages to Gemini format
  let systemInstruction = '';
  const contents = [];
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + msg.content;
    } else if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      // Handle assistant messages that might have tool_calls
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const parts = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments)
            }
          });
        }
        contents.push({ role: 'model', parts });
      } else if (msg.content) {
        contents.push({
          role: 'model',
          parts: [{ text: msg.content }]
        });
      }
    } else if (msg.role === 'tool') {
      // Handle tool responses - use 'function' role for Gemini
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.name || msg.tool_call_id || 'tool_response',
            response: { content: msg.content }
          }
        }]
      });
    }
  }

  // Create chat session with system instruction (like game picks)
  const chat = geminiModel.startChat({
    history: contents.slice(0, -1), // All but the last message
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined
  });

  // Send the last message
  const lastMessage = contents[contents.length - 1];
  let lastContent = '';
  
  if (lastMessage?.role === 'function') {
    // For function responses, we need to send them differently
    // Extract function response parts
    lastContent = lastMessage.parts;
  } else {
    lastContent = lastMessage?.parts?.map(p => p.text || '').join('') || '';
  }

  const startTime = Date.now();
  const result = await chat.sendMessage(lastContent);
  const response = await result.response;
  const duration = Date.now() - startTime;
  console.log(`[Props Gemini] Response in ${duration}ms`);

  // Convert Gemini response to OpenAI-compatible format
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  // Parse response parts
  const functionCallParts = parts.filter(p => p.functionCall);
  const textParts = parts.filter(p => p.text).map(p => p.text);

  let toolCalls = undefined;
  if (functionCallParts.length > 0) {
    toolCalls = functionCallParts.map((fc, i) => ({
      id: `call_${Date.now()}_${i}`,
      type: 'function',
      function: { name: fc.functionCall.name, arguments: JSON.stringify(fc.functionCall.args || {}) }
    }));
  }

  return {
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: functionCallParts.length > 0 ? null : textParts.join(''),
        tool_calls: toolCalls
      },
      finish_reason: functionCallParts.length > 0 ? 'tool_calls' : 'stop'
    }],
    usage: {
      prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
      completion_tokens: response.usageMetadata?.candidatesTokenCount || 0
    }
  };
}

/**
 * Handle tool calls during props iteration - SPORT-AWARE
 * Uses BDL MCP for accurate player stats per sport
 */
async function handlePropsToolCall(toolCall, sportKey, sportLabel) {
  const args = JSON.parse(toolCall.function.arguments);
  const functionName = toolCall.function.name;

  // Determine which sport we're handling
  const isNBA = sportLabel === 'NBA' || sportLabel === 'NCAAB' || sportKey?.includes('basketball');
  const isNHL = sportLabel === 'NHL' || sportKey?.includes('hockey');
  const isNFL = sportLabel === 'NFL' || sportLabel === 'NCAAF' || sportKey?.includes('football');

  // ============================================================================
  // FETCH_PLAYER_GAME_LOGS - Sport-specific implementation
  // ============================================================================
  if (functionName === 'fetch_player_game_logs') {
    console.log(`  → [PLAYER_GAME_LOGS] ${args.player_name} (${sportLabel})`);
    try {
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const players = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      
      const player = players.find(p => 
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase() ||
        p.last_name?.toLowerCase() === lastName.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found in ${sportLabel}`, player_name: args.player_name };
      }

      // NBA-specific game logs
      if (isNBA) {
        const logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, 5);
        if (!logs?.games?.length) {
          return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
        }
        const games = logs.games.slice(0, 5).map(g => ({
          date: g.date,
          opponent: g.opponent,
          pts: g.pts,
          reb: g.reb,
          ast: g.ast,
          fg3m: g.fg3m,
          blk: g.blk,
          stl: g.stl,
          min: g.min,
          fgm: g.fgm,
          fga: g.fga,
          result: g.result
        }));
        return {
          player: args.player_name,
          team: player.team?.full_name || 'Unknown',
          games,
          averages: logs.averages,
          games_analyzed: logs.gamesAnalyzed
        };
      }

      // NHL-specific game logs
      if (isNHL) {
        const logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, 5);
        if (!logs?.games?.length) {
          return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
        }
        const games = logs.games.slice(0, 5).map(g => ({
          date: g.date,
          opponent: g.opponent,
          goals: g.goals,
          assists: g.assists,
          points: g.points,
          shots_on_goal: g.shots_on_goal,
          plus_minus: g.plus_minus,
          time_on_ice: g.time_on_ice,
          power_play_goals: g.power_play_goals
        }));
        return {
          player: args.player_name,
          team: player.team?.full_name || player.teams?.[0]?.full_name || 'Unknown',
          games,
          averages: logs.averages,
          games_analyzed: logs.gamesAnalyzed
        };
      }

      // NFL-specific game logs (default)
      // Calculate NFL season dynamically: Sep-Dec = current year, Jan-Aug = previous year
      const nflLogMonth = new Date().getMonth() + 1;
      const nflLogYear = new Date().getFullYear();
      const nflLogSeason = nflLogMonth >= 9 ? nflLogYear : nflLogYear - 1;
      const logs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], nflLogSeason, 5);
      const playerLogs = logs[player.id];

      if (!playerLogs?.games?.length) {
        return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
      }

      const games = playerLogs.games.slice(0, 5).map(g => ({
        week: g.week || 'Unknown',
        opponent: g.opponent || 'Unknown',
        pass_yds: g.pass_yds || 0,
        rush_yds: g.rush_yds || 0,
        rec_yds: g.rec_yds || 0,
        receptions: g.receptions || 0,
        pass_tds: g.pass_tds || 0,
        rush_tds: g.rush_tds || 0,
        rec_tds: g.rec_tds || 0
      }));

      return {
        player: args.player_name,
        team: player.team?.full_name || 'Unknown',
        games,
        averages: playerLogs.averages,
        games_analyzed: playerLogs.gamesAnalyzed
      };
    } catch (e) {
      console.error(`    ❌ Error:`, e.message);
      return { error: e.message, player_name: args.player_name };
    }
  }

  // ============================================================================
  // FETCH_PLAYER_SEASON_STATS - Sport-specific implementation
  // ============================================================================
  if (functionName === 'fetch_player_season_stats') {
    console.log(`  → [PLAYER_SEASON_STATS] ${args.player_name} (${sportLabel})`);
    try {
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const players = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      
      const player = players.find(p => 
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found in ${sportLabel}` };
      }

      // NBA-specific season stats
      if (isNBA) {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
        const season = currentMonth >= 10 ? currentYear : currentYear - 1;
        const seasonStats = await ballDontLieService.getNbaSeasonAverages({
          category: 'general',
          type: 'base',
          season,
          player_ids: [player.id]
        });
        const stats = seasonStats?.[0]?.stats;
        
        return {
          player: args.player_name,
          team: player.team?.full_name,
          season_stats: stats ? {
            games_played: stats.gp,
            ppg: stats.pts,
            rpg: stats.reb,
            apg: stats.ast,
            fg_pct: (stats.fg_pct * 100).toFixed(1) + '%',
            fg3_pct: (stats.fg3_pct * 100).toFixed(1) + '%',
            ft_pct: (stats.ft_pct * 100).toFixed(1) + '%',
            mpg: stats.min,
            steals: stats.stl,
            blocks: stats.blk,
            turnovers: stats.tov,
            threes_per_game: stats.fg3m
          } : { message: 'No season stats available' }
        };
      }

      // NHL-specific season stats
      if (isNHL) {
        // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
        const nhlMonth = new Date().getMonth() + 1;
        const nhlYear = new Date().getFullYear();
        const season = nhlMonth >= 10 ? nhlYear : nhlYear - 1;
        const seasonStats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
        
        if (!seasonStats || seasonStats.length === 0) {
          return { player: args.player_name, team: player.teams?.[0]?.full_name, season_stats: { message: 'No season stats available' } };
        }

        // Convert array format to object
        const statsObj = {};
        seasonStats.forEach(s => {
          statsObj[s.name] = s.value;
        });

        return {
          player: args.player_name,
          team: player.teams?.[0]?.full_name || 'Unknown',
          season_stats: {
            games_played: statsObj.games_played,
            goals: statsObj.goals,
            assists: statsObj.assists,
            points: statsObj.points,
            shots: statsObj.shots,
            shooting_pct: (statsObj.shooting_pct * 100).toFixed(1) + '%',
            plus_minus: statsObj.plus_minus,
            power_play_goals: statsObj.power_play_goals,
            power_play_points: statsObj.power_play_points,
            time_on_ice_per_game: Math.round(statsObj.time_on_ice_per_game / 60) + ' min',
            points_per_game: statsObj.points_per_game?.toFixed(2),
            shots_per_game: statsObj.games_played ? (statsObj.shots / statsObj.games_played).toFixed(1) : 0
          }
        };
      }

      // NFL-specific season stats (default)
      // Calculate NFL season dynamically: Aug-Dec = current year, Jan-Jul = previous year
      const nflMonth = new Date().getMonth() + 1; // 1-indexed
      const nflYear = new Date().getFullYear();
      const nflSeason = nflMonth <= 7 ? nflYear - 1 : nflYear;
      const seasonStats = await ballDontLieService.getNflSeasonStats({ player_ids: [player.id], season: nflSeason });
      const stats = seasonStats.find(s => s.player?.id === player.id);

      return {
        player: args.player_name,
        team: player.team?.full_name,
        season_stats: stats || { message: 'No season stats available' }
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============================================================================
  // FETCH_TEAM_INJURIES - NBA-specific
  // ============================================================================
  if (functionName === 'fetch_team_injuries') {
    console.log(`  → [TEAM_INJURIES] ${args.team_name}`);
    try {
      // Get team info first
      const teams = await ballDontLieService.getNbaTeams();
      const team = teams.find(t => 
        t.full_name?.toLowerCase().includes(args.team_name.toLowerCase()) ||
        t.name?.toLowerCase().includes(args.team_name.toLowerCase())
      );
      
      if (!team) {
        return { error: `Team "${args.team_name}" not found` };
      }

      const injuries = await ballDontLieService.getNbaPlayerInjuries([team.id]);
      return {
        team: team.full_name,
        injuries: injuries.map(inj => ({
          player: `${inj.player?.first_name} ${inj.player?.last_name}`,
          status: inj.status,
          description: inj.comment || 'No details'
        }))
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============================================================================
  // FETCH_GOALIE_STATS - NHL-specific
  // ============================================================================
  if (functionName === 'fetch_goalie_stats') {
    console.log(`  → [GOALIE_STATS] ${args.team_name}`);
    try {
      // Get team info
      const teams = await ballDontLieService.getNhlTeams();
      const team = teams.find(t => 
        t.full_name?.toLowerCase().includes(args.team_name.toLowerCase()) ||
        t.tricode?.toLowerCase() === args.team_name.toLowerCase()
      );
      
      if (!team) {
        return { error: `NHL Team "${args.team_name}" not found` };
      }

      // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
      const goalieMonth = new Date().getMonth() + 1;
      const goalieYear = new Date().getFullYear();
      const goalieSeason = goalieMonth >= 10 ? goalieYear : goalieYear - 1;
      const goalies = await ballDontLieService.getNhlTeamGoalies([team.id], goalieSeason);
      return {
        team: team.full_name,
        goalies: goalies?.home || goalies?.away || { message: 'No goalie stats available' }
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============================================================================
  // SEARCH_PLAYER_CONTEXT - Common for all sports
  // ============================================================================
  if (functionName === 'search_player_context') {
    console.log(`  → [SEARCH_CONTEXT] "${args.query}"`);
    try {
      const result = await geminiGroundingSearch(args.query, { temperature: 0.1, maxTokens: 1500 });
      if (result?.success && result?.data) {
        return { query: args.query, context: result.data };
      }
      return { query: args.query, context: 'No results found' };
    } catch (e) {
      return { error: e.message, query: args.query };
    }
  }

  // ============================================================================
  // FINALIZE_PROPS - Common for all sports
  // ============================================================================
  if (functionName === 'finalize_props') {
    // This signals completion - return the picks
    return { finalized: true, picks: args.picks };
  }

  return { error: `Unknown tool: ${functionName}` };
}

/**
 * Validate props output against tool call history
 * Checks that key_stats cite valid sources and contain verifiable data
 * @param {Array} picks - The prop picks with key_stats
 * @param {Array} toolCallHistory - Array of {tool, result} from the iteration loop
 * @returns {Object} - { validatedPicks, warnings, invalidStats }
 */
function validatePropsAgainstToolHistory(picks, toolCallHistory) {
  const warnings = [];
  const invalidStats = [];
  
  // Build a lookup of all data we received from tools
  const toolData = {
    gameLogs: {},  // player -> array of game stats
    seasonStats: {}, // player -> season averages
    searchContext: [] // array of search results
  };
  
  for (const { tool, result } of toolCallHistory) {
    if (!result || result.error) continue;
    
    if (tool === 'fetch_player_game_logs' && result.games) {
      const playerKey = result.player?.toLowerCase() || '';
      toolData.gameLogs[playerKey] = result.games;
    }
    if (tool === 'fetch_player_season_stats' && result.stats) {
      const playerKey = result.player?.toLowerCase() || '';
      toolData.seasonStats[playerKey] = result.stats;
    }
    if (tool === 'search_player_context' && result.context) {
      toolData.searchContext.push(result.context);
    }
  }
  
  // Validate each pick's key_stats
  const validatedPicks = picks.map(pick => {
    const validatedKeyStats = [];
    const playerKey = pick.player?.toLowerCase() || '';
    
    for (const stat of (pick.key_stats || [])) {
      const statLower = stat.toLowerCase();
      let isValid = true;
      let warning = null;
      
      // Check if stat claims a source
      const hasGameLogSource = statLower.includes('game_log') || statLower.includes('from game') || statLower.includes('l5');
      const hasSeasonSource = statLower.includes('season') || statLower.includes('season_stats');
      const hasSearchSource = statLower.includes('search') || statLower.includes('context');
      const hasNoSource = !hasGameLogSource && !hasSeasonSource && !hasSearchSource;
      
      // If stat claims game_logs source, verify we have data for this player
      if (hasGameLogSource) {
        const hasPlayerLogs = Object.keys(toolData.gameLogs).some(key => 
          key.includes(playerKey.split(' ').pop()) || playerKey.includes(key.split(' ').pop())
        );
        if (!hasPlayerLogs) {
          warning = `Stat claims game_logs but no logs found for ${pick.player}`;
          isValid = false;
        }
      }
      
      // If stat claims season_stats source, verify we have data
      if (hasSeasonSource) {
        const hasPlayerSeasonStats = Object.keys(toolData.seasonStats).some(key => 
          key.includes(playerKey.split(' ').pop()) || playerKey.includes(key.split(' ').pop())
        );
        if (!hasPlayerSeasonStats) {
          warning = `Stat claims season_stats but no season data found for ${pick.player}`;
          isValid = false;
        }
      }
      
      // If stat has no source, warn but don't invalidate (could be matchup context)
      if (hasNoSource && !statLower.includes('unavailable') && !statLower.includes('matchup')) {
        warning = `Stat missing source attribution: "${stat.substring(0, 50)}..."`;
        // Don't invalidate - just warn
      }
      
      if (warning) {
        warnings.push(warning);
        if (!isValid) {
          invalidStats.push({ player: pick.player, stat });
        }
      }
      
      // Keep the stat but add a flag if unverified
      validatedKeyStats.push(stat);
    }
    
    return {
      ...pick,
      key_stats: validatedKeyStats,
      _validation: {
        hasToolData: Object.keys(toolData.gameLogs).length > 0 || Object.keys(toolData.seasonStats).length > 0,
        warningCount: warnings.filter(w => w.includes(pick.player)).length
      }
    };
  });
  
  return { validatedPicks, warnings, invalidStats };
}

/**
 * Run full iteration loop for props using PERSISTENT chat session
 * The chat session manages its own history, avoiding thoughtSignature issues
 */
async function runPropsIterationLoop({ systemPrompt, userMessage, sportKey, sportLabel = 'NFL', maxIterations = 8 }) {
  const gemini = getGeminiForProps();
  
  // Get sport-specific tools
  const sportTools = getPropsToolsForSport(sportLabel);
  const functionDeclarations = convertToolsForGemini(sportTools);
  console.log(`[Props] Using ${sportLabel} tools: ${sportTools.map(t => t.function.name).join(', ')}`);
  
  // Create model with tools
  const model = gemini.getGenerativeModel({
    model: PROPS_MODEL,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    tools: [{ functionDeclarations }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 8000
    }
  });

  // Create PERSISTENT chat session with system instruction
  const chat = model.startChat({
    systemInstruction: { parts: [{ text: systemPrompt }] }
  });

  let iteration = 0;
  const toolCallHistory = [];

  // Send initial user message
  console.log(`\n[Props Iteration ${sportLabel}] 1/${maxIterations} (initial)`);
  let result = await chat.sendMessage(userMessage);
  let response = result.response;
  iteration++;

  while (iteration < maxIterations) {
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    
    // Extract function calls and text
    const functionCallParts = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text).map(p => p.text);
    
    console.log(`[Props] Response: ${functionCallParts.length} function call(s), ${textParts.length} text part(s)`);

    // Check for finalize_props in function calls FIRST
    for (const fc of functionCallParts) {
      if (fc.functionCall?.name === 'finalize_props') {
        const picks = fc.functionCall.args?.picks || [];
        console.log(`[Props] ✓ Gary finalized ${picks.length} picks`);
        
        // Validate picks against tool call history
        const { validatedPicks, warnings, invalidStats } = validatePropsAgainstToolHistory(picks, toolCallHistory);
        
        if (warnings.length > 0) {
          console.log(`[Props Validation] ⚠️ ${warnings.length} warning(s):`);
          warnings.slice(0, 5).forEach(w => console.log(`   - ${w}`));
          if (warnings.length > 5) console.log(`   ... and ${warnings.length - 5} more`);
        }
        if (invalidStats.length > 0) {
          console.log(`[Props Validation] ❌ ${invalidStats.length} unverifiable stat(s) detected`);
        }
        
        return { picks: validatedPicks, iterations: iteration, toolCalls: toolCallHistory.length, warnings };
      }
    }

    // Handle other tool calls
    if (functionCallParts.length > 0) {
      console.log(`[Props] Gary requested ${functionCallParts.length} tool(s):`);
      
      // Process all tool calls and collect responses
      const functionResponses = [];
      for (const fc of functionCallParts) {
        const toolCall = {
          function: {
            name: fc.functionCall.name,
            arguments: JSON.stringify(fc.functionCall.args || {})
          }
        };
        const toolResult = await handlePropsToolCall(toolCall, sportKey, sportLabel);
        toolCallHistory.push({ tool: fc.functionCall.name, result: toolResult });

        // Build function response for Gemini
        functionResponses.push({
          functionResponse: {
            name: fc.functionCall.name,
            response: { content: JSON.stringify(toolResult) }
          }
        });
      }
      
      // Send all function responses at once to continue the chat
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations}`);
      result = await chat.sendMessage(functionResponses);
      response = result.response;
      
      // Add urgency nudge on later iterations - send as separate follow-up
      if (iteration >= maxIterations - 2) {
        console.log(`[Props] Sending finalization nudge...`);
        result = await chat.sendMessage(`⚠️ DEADLINE: You have ${maxIterations - iteration} rounds left. CALL finalize_props NOW with your ${sportLabel === 'NBA' || sportLabel === 'NHL' ? '2' : '3-5'} best picks based on all data gathered. Do NOT request more data.`);
        response = result.response;
      }
      continue;
    }

    // Check for picks in text response (fallback)
    const textContent = textParts.join('');
    if (textContent) {
      const jsonMatch = textContent.match(/\{[\s\S]*"picks"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.picks)) {
            console.log(`[Props] ✓ Found picks in text response`);
            // Validate picks against tool call history
            const { validatedPicks, warnings } = validatePropsAgainstToolHistory(parsed.picks, toolCallHistory);
            if (warnings.length > 0) {
              console.log(`[Props Validation] ⚠️ ${warnings.length} warning(s)`);
            }
            return { picks: validatedPicks, iterations: iteration, toolCalls: toolCallHistory.length, warnings };
          }
        } catch {}
      }

      // Text response but no picks - prompt to finalize
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (prompting finalize)`);
      result = await chat.sendMessage('Please call the finalize_props tool with your final prop picks now.');
      response = result.response;
    }
    
    // Nudge when approaching max iterations
    if (iteration >= maxIterations - 1 && functionCallParts.length === 0) {
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (final warning)`);
      result = await chat.sendMessage('⚠️ FINAL ROUND - You MUST call finalize_props NOW with your best picks based on available data.');
      response = result.response;
    }
  }

  console.log(`[Props] ⚠️ Max iterations reached without finalization`);
  return { picks: [], iterations: iteration, toolCalls: toolCallHistory.length };
}

/**
 * Stage 1: Props Hypothesis (LEGACY - kept for non-NFL sports)
 * Form initial hypotheses about which props have value
 */
async function runPropsHypothesisStage({ gameSummary, propCandidates, playerStats, sportLabel = 'NFL', tokenData = {}, narrativeContext = null }) {
  const constitution = getConstitution(sportLabel);
  
  // Sport-specific instructions for using season stats
  const statsGuidance = sportLabel === 'NHL' ? `
## CRITICAL FOR NHL PROPS
You have REAL player season stats available. For each player you MUST:
1. Check their SOG/G (shots on goal per game) average
2. Compare it to the prop line
3. Only pick OVER if SOG/G is at least 0.5 above the line
4. Only pick UNDER if SOG/G is at least 0.3 below the line
5. AVOID props where the average is within ±0.2 of the line

Example analysis:
- Player A: SOG/G = 3.2, Line = 2.5 → OVER candidate (0.7 above line) ✓
- Player B: SOG/G = 2.6, Line = 2.5 → AVOID (only 0.1 above, too close)
- Player C: SOG/G = 2.1, Line = 2.5 → UNDER candidate (0.4 below line) ✓
` : sportLabel === 'NBA' ? `
## CRITICAL FOR NBA PROPS
You have REAL player season stats available. For each player you MUST:
1. Check their PPG (points per game), RPG (rebounds), APG (assists), 3PG (threes) averages
2. Compare directly to the prop line
3. For POINTS: Only pick OVER if PPG is at least 1.0 above the line
4. For REBOUNDS/ASSISTS: Only pick OVER if avg is at least 0.5 above the line
5. AVOID props where the average is within ±0.5 of the line (coin flip territory)

Example analysis:
- Player A: PPG = 28.5, Line = 26.5 → OVER candidate (+2.0 above line) ✓
- Player B: PPG = 24.2, Line = 24.5 → AVOID (0.3 below, too close to line)
- Player C: RPG = 8.5, Line = 7.5 → OVER candidate (+1.0 above line) ✓
` : '';

  const systemPrompt = `
You are Gary the Bear, scouting player props for this game.

🚨🚨🚨 ZERO TOLERANCE FOR HALLUCINATION - READ THIS FIRST 🚨🚨🚨

YOU ARE ABSOLUTELY FORBIDDEN FROM INVENTING ANY STATISTICS.

The ONLY stats you can use are:
1. Stats marked "✓ VERIFIED" or "⭐ VERIFIED L5 AVG" in the player data
2. Game-by-game numbers explicitly listed (e.g., "Dec 14 @ LA Rams: 164 yds")
3. Numbers you find via Google Search grounding during this analysis

❌ YOU CANNOT:
- Invent averages like "averaging 110.2 yards" unless you see that exact number
- Claim "cleared the line in X of 5 games" unless you count the actual games provided
- Make up any specific stat that was not explicitly given to you

✅ YOU MUST:
- Use ONLY the verified stats from the "📊 VERIFIED STATS FROM BDL API" sections
- Calculate averages from the game-by-game data provided
- Say "recent strong form" instead of making up a specific number

If you hallucinate a single statistic, your entire analysis is WORTHLESS and will cost real money.

${constitution}
${statsGuidance}

## YOUR TASK
Look at the player stats provided and identify 3-5 players who stand out to you.

📋 FIRST: Read the COMPREHENSIVE GAME CONTEXT section carefully. It contains:
- Breaking News (last-minute scratches, trade rumors, roster moves)
- Motivation Factors (revenge games, milestones, contract years)
- Schedule Context (B2B fatigue, trap games, rest advantage)
- Player-Specific (load management, matchup history, role changes)
- Team Trends (streaks, home/away context)

These factors tell you WHICH stats matter most for this game!

Then analyze each player's situation:
- What's this player averaging this season?
- How have they been playing lately - hot, cold, or steady?
- Does the CONTEXT favor them? (revenge game? opponent injuries? fresh legs?)
- Is the line set too low or too high based on what you see?

## RESPONSE FORMAT (STRICT JSON - REQUIRED)
You MUST respond with ONLY valid JSON. No text before or after. Start with \`\`\`json and end with \`\`\`.

\`\`\`json
{
  "top_opportunities": [
    {
      "player": "Player Name",
      "prop_type": "${sportLabel === 'NBA' ? 'points' : sportLabel === 'NHL' ? 'shots_on_goal' : 'pass_yds'}",
      "line": 24.5,
      "lean": "over",
      "take": "Your quick take on this player - why you like them in this spot"
    }
  ],
  "game_context": "Brief note on how you see this game playing out",
  "concerns": ["Any concerns worth noting"]
}
\`\`\`

CRITICAL: Output ONLY the JSON block above. No introduction, no preamble, no analysis outside the JSON.

Guidelines:
- Look at ALL stat types (${sportLabel === 'NBA' ? 'points, rebounds, assists, threes, blocks, steals, PRA' : sportLabel === 'NHL' ? 'shots, goals, assists, points' : 'pass yards, rush yards, receiving yards'})
- If a player's season average is way above their line, that's interesting
- Factor in recent form

📋 USE THE COMPREHENSIVE CONTEXT - it contains CRITICAL info like:
  * BREAKING NEWS: Last-minute scratches, trade rumors, roster moves
  * MOTIVATION: Revenge games (vs former team), milestones, contract year players
  * SCHEDULE: B2B fatigue, trap games, altitude, rest advantage
  * PLAYER-SPECIFIC: Role changes, load management risk, matchup history
  * TEAM TRENDS: Win/lose streaks, home/away splits

Example uses of context:
  * "LeBron facing old team (revenge game)" → Check his stats vs this opponent
  * "Celtics on 2nd night of B2B" → Consider fatigue for UNDER plays
  * "Jokic in contract year" → Extra motivation for big performances
  * "KD returning from injury, minutes restriction" → UNDER on his props

## CRITICAL: INJURY IMPACT ON PROPS
Injuries are CRUCIAL for player props! Consider:
- If a star scorer is OUT, their teammates get MORE touches/shots → OVER on usage props
- If a star rebounder is OUT, other bigs get MORE boards → OVER on rebound props  
- If a player is QUESTIONABLE or on minutes restriction → lean UNDER on their props
- If a player's primary defender is OUT → OVER on scoring props
- Always check the injury report before making any pick!

## 🚨 CRITICAL: PLAYER NAME ACCURACY - NO CONFUSION
**ALWAYS use FULL NAMES (first + last) when referencing players, especially for:**
- Players with common last names (Curry, Johnson, Williams, Davis, etc.)
- Siblings on the same team (Seth Curry vs Stephen Curry, Marcus Morris vs Markieff Morris)
- ONLY trust the "injuryReport" field for injury status - it uses FULL NAMES from BDL
- Do NOT assume a player is injured unless they appear in the injuryReport
- If narrative context mentions just "Curry OUT", VERIFY which Curry from the injury report
- When in doubt, call search_player_context with the FULL NAME to confirm

## 🚨 CRITICAL: PLAYER-TEAM VERIFICATION
The prop data may show OUTDATED team assignments. Before picking any player:
- Check the ROSTER MOVES section in the context for 2025 trades/signings
- If a player changed teams in 2025, use their CURRENT team
- Common 2025 moves: George Pickens → Cowboys, Javonte Williams → Cowboys
- If unsure, check if the player is actually playing in THIS matchup

## 🚨 CRITICAL: STATS ACCURACY - NO HALLUCINATION
When evaluating players, ONLY use stats from the KEY PLAYER STATS section:
- Look for game-by-game data (e.g., "Week 12 vs NYG: 130 yds")
- Calculate averages YOURSELF from the provided numbers
- If stats say "unavailable", focus on matchup/context instead
- DO NOT invent specific averages or claim stats you didn't see
- "Recent strong performances" is better than a made-up "110 yards average"

## 🛑🛑🛑 ABSOLUTE ZERO TOLERANCE FOR HALLUCINATION 🛑🛑🛑

**THIS IS THE MOST CRITICAL RULE. VIOLATIONS COST REAL MONEY AND DESTROY TRUST.**

You MUST NOT make ANY assumptions. Only state facts you can directly verify from the data provided:

**INJURIES:**
- ONLY trust the injuryReport field - this is from Ball Don't Lie API
- If a player is NOT in injuryReport, they are NOT injured - do not assume otherwise
- NEVER say "[Player] is OUT" unless they appear in injuryReport with status "Out"
- Example violation: Saying "Stephen Curry OUT" when injuryReport shows no Curry at all

**PLAYER NAMES:**
- ALWAYS use FULL NAMES (First Last) - never just last names
- "Curry" could be Stephen Curry OR Seth Curry - ALWAYS specify which one
- If you're unsure which player, DO NOT MENTION THEM

**STATS:**
- ONLY cite stats you see in the provided data (game logs, season stats, playerStatsPreview)
- If you don't have a specific number, say "stats unavailable" - DO NOT make up numbers
- Never assume a player's PPG, RPG, APG etc. without seeing it in the data

**REASONING:**
- Every claim in your rationale MUST be traceable to provided data
- If narrative context conflicts with injuryReport, trust injuryReport
- When uncertain, use hedging language or skip that point entirely

**CONSEQUENCES OF HALLUCINATION:**
- Made-up injuries → Wrong player analysis → Bad picks → Lost money
- Wrong player names → Confusion → Voided bets
- Fake stats → Incorrect line comparisons → Bad value assessment

WHEN IN DOUBT, LEAVE IT OUT.
`;

  // Enhanced prop candidates with season stats for NHL and NBA
  // Allow up to 14 players (7 per team) for more comprehensive analysis
  const enhancedCandidates = propCandidates.slice(0, 14).map(p => {
    const base = {
      player: p.player,
      team: p.team,
      props: p.props
    };
    
    // Include season stats if available (from tokenData for NHL or NBA)
    if ((sportLabel === 'NHL' || sportLabel === 'NBA') && tokenData?.prop_lines?.candidates) {
      const match = tokenData.prop_lines.candidates.find(c => c.player === p.player);
      if (match?.seasonStats) {
        base.seasonStats = match.seasonStats;
      }
      // Also include recent form data if available
      if (match?.recentForm) {
        base.recentForm = match.recentForm;
      }
    }
    
    return base;
  });

  // Extract injury data from tokenData for explicit inclusion
  const injuryReport = tokenData?.injury_report?.notable || [];

  // Include COMPREHENSIVE narrative context if available
  // This includes ALL factors fetched upfront: breaking news, motivation, schedule, player context, etc.
  const narrativeSection = narrativeContext ? `
================================================================================
COMPREHENSIVE GAME CONTEXT (CRITICAL - READ ALL SECTIONS BEFORE ANALYSIS)
================================================================================

This context was fetched UPFRONT so you know ALL relevant factors BEFORE choosing which stats to investigate.

${narrativeContext.substring(0, 12000)}

⚠️ BETTING SIGNALS NOTE: If you see any line movement or public % data above, treat it as a MINOR observation only - it should NEVER be the primary reason for any pick.
` : '';

  // Format injury report for explicit inclusion - BDL is SOURCE OF TRUTH
  const injurySection = injuryReport.length > 0 
    ? `📋 OFFICIAL BDL INJURY REPORT (ONLY TRUST THIS FOR INJURY STATUS):\n` + injuryReport.map(inj => 
        `- ${inj.player} (${inj.team || 'Unknown'}) - ${inj.status}: ${inj.description || 'No details'}`
      ).join('\n')
    : '📋 OFFICIAL BDL INJURY REPORT: No significant injuries reported for these teams';

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    tipoff: gameSummary.tipoff,
    odds: gameSummary.odds,
    propCandidates: enhancedCandidates,
    playerStatsPreview: playerStats.substring(0, 10000), // Generous limit to ensure all player data is included
    injuryReport: injurySection,
    // CRITICAL: Full narrative context so Gary knows all factors UPFRONT
    comprehensiveContext: narrativeSection || null
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    model: PROPS_MODEL, // Gemini 3 Flash for props (faster, avoids Pro quota issues)
    temperature: 1.0,
    maxTokens: 8000
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Props hypothesis stage failed to return valid JSON');
  }

  return {
    top_opportunities: Array.isArray(parsed.top_opportunities) ? parsed.top_opportunities.slice(0, 5) : [],
    game_context: parsed.game_context || parsed.game_script_expectation || '',
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 3) : []
  };
}

/**
 * Stage 2: Props Investigator
 * Dig deeper into the scouted props with detailed stats
 */
async function runPropsInvestigatorStage({ gameSummary, hypothesis, tokenData, propCandidates }) {
  const systemPrompt = `
You are Gary the Bear, digging deeper into the props you scouted.

## YOUR TASK
For each player you identified in Stage 1, look at the detailed stats and ask yourself:
- Does the season average support this pick?
- How has this player been playing lately? Hot streak or slump?
- Is this player consistent or all over the place game to game?
- Does playing at home/away matter for them?

If the numbers back up your initial take, keep the prop. If not, drop it and explain why.

## RESPONSE FORMAT (STRICT JSON - REQUIRED)
You MUST respond with ONLY valid JSON. No text before or after. Start with \`\`\`json and end with \`\`\`.

\`\`\`json
{
  "validated_props": [
    {
      "player": "Player Name",
      "prop_type": "points",
      "line": 24.5,
      "lean": "over",
      "confidence": 0.65,
      "reasoning": "Brief explanation of what you found in the stats - 1-2 sentences about why this still looks good"
    }
  ],
  "dropped_props": [
    {"player": "Name", "reason": "Why you're backing off this one"}
  ]
}
\`\`\`

CRITICAL: Output ONLY the JSON block above. No introduction, no analysis paragraphs, no commentary outside the JSON.
`;

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    scouted_props: hypothesis.top_opportunities,
    game_context: hypothesis.game_context,
    data: {
      player_stats: tokenData.player_stats,
      prop_lines: tokenData.prop_lines,
      injuries: tokenData.injury_report
    },
    propDetails: propCandidates.slice(0, 8)
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    model: PROPS_MODEL, // Gemini 3 Flash for props
    temperature: 1.0,
    maxTokens: 8000
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Props investigator stage failed to return valid JSON');
  }

  return {
    validated_props: Array.isArray(parsed.validated_props) ? parsed.validated_props : [],
    dropped_props: Array.isArray(parsed.dropped_props) ? parsed.dropped_props : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : []
  };
}

// Sports that use the 2-per-game rule (quality over quantity)
const TWO_PER_GAME_SPORTS = ['NBA', 'NHL', 'EPL'];

/**
 * Stage 3: Props Judge
 * Render final prop picks with organic, Gary-style rationale
 */
async function runPropsJudgeStage({ gameSummary, investigation, playerProps, sportLabel = 'NFL' }) {
  // Sport-specific pick counts: NBA/NHL/EPL = exactly 2, NFL = 3-5
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  const pickCountText = usesTwoPerGame ? 'exactly 2' : '3-5';
  const maxPicks = usesTwoPerGame ? 2 : 5;

  const systemPrompt = `
You are Gary the Bear, finalizing your player prop picks.

🚨🚨🚨 ZERO TOLERANCE FOR HALLUCINATION - THIS IS THE MOST IMPORTANT RULE 🚨🚨🚨

YOU ARE ABSOLUTELY FORBIDDEN FROM INVENTING ANY STATISTICS.

The ONLY stats you can cite in your rationale and key_stats are:
1. Stats marked "✓ VERIFIED" or "⭐ VERIFIED L5 AVG" in the investigation data
2. Specific game numbers from the game logs (e.g., "Dec 14: 164 yards")
3. Line hit counts you calculated from actual provided games

❌ FORBIDDEN EXAMPLES (WILL GET YOU FIRED):
- "averaging 65.6 yards over his last five" (unless you see this exact number)
- "stayed under in 3 of 5 games" (unless you count actual games with real numbers)
- "season average of 110 yards" (unless explicitly provided)

✅ CORRECT EXAMPLES:
- "Dec 14 vs Rams: 164 yds, Dec 4 vs Cowboys: 92 yds" (citing actual games)
- "cleared 75 yards in 3 of his last 5 verified games" (if you counted the real data)
- "trending upward with recent strong performances" (if stats are unclear)

THE VERIFICATION TEST: Before writing ANY number, ask yourself:
"Did I see this EXACT number in the data provided?"
- If YES → Use it
- If NO → Do NOT use it, find a qualitative description instead

Write rationales like you're explaining your pick to a friend - conversational, insightful, and rooted in what you see happening on the court/ice. NO betting jargon.

## YOUR TASK
1. Review the validated props from the Analyst
2. Select the TOP ${pickCountText} props${usesTwoPerGame ? ' - these are your most confident selections' : ''}
3. Write an ORGANIC rationale for each pick (5-7 sentences) - like a sports analyst, not a bettor
4. Provide 3-4 KEY STATS bullets that support your pick

## RATIONALE STYLE - CRITICAL

Write like Gary explains regular game picks - conversational and story-driven. This should be 5-7 sentences that paint the full picture.

NEVER USE:
❌ "THE EDGE" / "WHY IT HITS" / "THE RISK" headers
❌ "Line X | Season Avg: Y | Edge: +Z" format
❌ Betting jargon (line movement, EV, edge, sharp money, fade, steam)
❌ Data scientist language (convergence of factors, metrics indicate)

ALWAYS USE:
✅ Natural, conversational tone (5-7 sentences)
✅ Player names and specific context
✅ What you actually see happening in this game
✅ Simple explanation of why this player will exceed/fall short of the number
✅ Paint the whole picture - context, matchup, recent form, and conclusion

EXAMPLE RATIONALE (NBA rebounds prop):
"Jarrett Allen is about to feast on the glass tonight. With Evan Mobley sidelined, the Cavaliers are down their second-best rebounder, and that workload has to go somewhere. Allen has been an absolute monster all season, pulling down nearly 11 boards per game, and he's going to be the only true big man Cleveland trusts in crunch time. The Hornets are one of the worst rebounding teams in the league, ranking dead last in offensive boards and bottom-five in overall rebounding rate. When you combine Allen's motor, his positional advantage, and the extra minutes he'll see without Mobley, this feels like one of the safest props on the board tonight. Give me the over."

EXAMPLE KEY_STATS (for the above):
["Averaging 10.8 RPG this season (career high)", "Mobley out = extra 4-5 boards available per game", "Charlotte ranks 28th in defensive rebounding rate"]

## RESPONSE FORMAT (STRICT JSON)
{
  "picks": [
    {
      "player": "Player Name",
      "team": "Team Name", 
      "prop": "pts 25.5",
      "line": 25.5,
      "bet": "over",
      "odds": -110,
      "confidence": 0.65-0.85,
      "rationale": "Your organic, conversational analysis - 5-7 sentences explaining why you like this pick. Paint the full picture: context, recent form, matchup advantage, and your confident conclusion.",
      "key_stats": ["Stat 1 that supports your pick", "Stat 2 that supports your pick", "Stat 3 that supports your pick"]
    }
  ]
}

## 🚨 CRITICAL: PLAYER-TEAM VERIFICATION (READ FIRST)

Before finalizing ANY pick, you MUST verify the player's CURRENT TEAM:
- Check the narrative context for ROSTER MOVES section
- If a player was traded or signed as a free agent in 2025, use their NEW team
- The odds data may show outdated team assignments - DO NOT TRUST blindly

COMMON 2025 ROSTER MOVES TO CHECK:
- George Pickens: Now on Dallas Cowboys (traded from Steelers, May 2025)
- Javonte Williams: Now on Dallas Cowboys (signed as FA, March 2025)
- If in doubt about a player's team, check the roster moves in the context

❌ WRONG: "George Pickens (Pittsburgh Steelers)" - He's a Cowboy now
✅ CORRECT: "George Pickens (Dallas Cowboys)" - Current team

If you assign a player to the wrong team, your entire analysis is INVALID.

## 🚨🚨🚨 CRITICAL: STATS ACCURACY - ZERO TOLERANCE FOR HALLUCINATION 🚨🚨🚨

This is the MOST IMPORTANT RULE. Inaccurate stats destroy credibility and lose money.

**BEFORE WRITING ANY STATISTIC, ASK YOURSELF:**
"Did I see this EXACT number in the KEY PLAYER STATS section of the context?"
- If YES → Use it
- If NO → DO NOT USE IT

**YOU ARE FORBIDDEN FROM INVENTING:**
❌ "Averaging 110.2 yards over his last 5 games" (unless you saw this exact number)
❌ "Cleared this line in 4 of his last 5 games" (unless you counted verified games)
❌ "Season-high 144 yards last week" (unless this exact stat was provided)
❌ Any specific stat not explicitly in your context data

**WHAT YOU SHOULD DO INSTEAD:**
✅ Use ONLY the game-by-game stats from the KEY PLAYER STATS section
✅ Calculate averages YOURSELF from the provided game logs
✅ If stats are marked "unavailable" → focus on matchup/context, not numbers
✅ Say "recent strong performances" instead of inventing specific averages

**THE VERIFICATION RULE:**
- If the context says "Week 12: 130 yds, Week 13: 33 yds, Week 14: 37 yds, Week 15: 88 yds, Week 16: 146 yds"
- You calculate: (130+33+37+88+146)/5 = 86.8 yards average
- DO NOT round up or exaggerate to "110 yards"

**key_stats FIELD RULES:**
- Only include stats you can VERIFY from the provided context
- If you don't have verified stats, use qualitative observations:
  ✅ "Trending up with big games in Weeks 12 and 16"
  ✅ "Consistent target share as the WR1"
  ❌ "Averaging 110+ yards" (if you can't verify this)

## GUIDELINES
- ${usesTwoPerGame ? `EXACTLY ${maxPicks} picks - your most confident ones` : `Up to ${maxPicks} picks`}
- Rationale should be 5-7 sentences, reading like sports commentary
- key_stats should be 3-4 bullet points with the most compelling stats
- Reference the player's recent performance naturally
- Explain the matchup in plain terms
- End with a confident take on why this hits${usesTwoPerGame ? `
- These should be picks you'd confidently tell a friend about` : ''}
- VERIFY player teams before writing - use the roster moves data
- VERIFY all stats before writing - use ONLY numbers from the KEY PLAYER STATS section
`;

  // Build a lookup map for odds
  const oddsMap = {};
  for (const prop of playerProps) {
    const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
    oddsMap[key] = {
      over_odds: prop.over_odds,
      under_odds: prop.under_odds
    };
  }

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    tipoff: gameSummary.tipoff,
    validated_props: investigation.validated_props,
    available_odds: playerProps.slice(0, 50).map(p => ({
      player: p.player,
      prop_type: p.prop_type,
      line: p.line,
      over_odds: p.over_odds,
      under_odds: p.under_odds
    }))
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    model: PROPS_MODEL, // Gemini 3 Flash for props
    temperature: 1.0,
    maxTokens: 8000
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed || !Array.isArray(parsed.picks)) {
    throw new Error('Props judge stage failed to return valid JSON');
  }

  return parsed.picks;
}


/**
 * Format game time for display
 */
function formatGameTime(timeString) {
  if (!timeString) return 'TBD';
  try {
    const date = new Date(timeString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' EST';
  } catch {
    return 'TBD';
  }
}

/**
 * Build system prompt for props iteration loop
 */
function buildPropsIterationPrompt(gameSummary, propCandidates, narrativeContext, sportLabel) {
  const constitution = getConstitution(sportLabel);
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  const pickCount = usesTwoPerGame ? 2 : 5;

  return `
You are Gary the Bear, analyzing player props for this game.

${constitution}

## YOUR TASK
Analyze the prop candidates for ${gameSummary.matchup} and select your TOP ${pickCount} picks.

You have tools available to fetch REAL stats:
- fetch_player_game_logs: Get last 5 games with actual stats
- fetch_player_season_stats: Get season averages
- search_player_context: Search Google for injury news, roster moves, context
- finalize_props: Submit your final picks (MUST CALL THIS TO COMPLETE)

## HOW TO WORK
1. Review prop candidates - identify 3-4 promising players
2. Fetch game logs for those players
3. If needed, search for context on injuries or matchup
4. **CALL finalize_props within 3-4 iterations**

## 🚨🚨🚨 ZERO TOLERANCE FOR HALLUCINATION 🚨🚨🚨

**THIS IS THE MOST IMPORTANT RULE. VIOLATIONS COST REAL MONEY.**

When you receive tool responses, you MUST **COPY THE EXACT NUMBERS**.

### WHAT YOU MUST DO:
✅ Copy numbers VERBATIM from tool responses
✅ If tool returns "receptions: 7, 1, 5, 4, 9" → write "7, 1, 5, 4, 9"
✅ Calculate averages from ONLY the numbers the tool gave you
✅ For names (QBs, players, etc.) use ONLY what search_player_context returns
✅ If data is unavailable, say "stats unavailable" - don't fill in gaps

### WHAT IS ABSOLUTELY FORBIDDEN:
❌ Writing different numbers than what the tool returned
❌ "Rounding" or "estimating" stats (write the exact number)
❌ Using your general knowledge to fill in missing data
❌ Mixing up player names or team info from your training data
❌ Writing ANY statistic not explicitly in a tool response

### KEY_STATS FORMAT (REQUIRED):
Each key_stat MUST reference its source:
- "L5 receptions: 7, 1, 5, 4, 9 (from fetch_player_game_logs)"
- "Season avg: 4.5 rec/game (from fetch_player_season_stats)"
- "QB: Chris Oladokun starting (from search_player_context)"
- "Game logs unavailable - using matchup context only"

### VERIFICATION STEP:
Before calling finalize_props, mentally verify:
"Is every number in my key_stats an EXACT copy from a tool response?"
If you can't trace a stat to a specific tool call, DELETE IT.

## RATIONALE STYLE
Write 5-7 sentences explaining your pick:
- Reference EXACT stats from tool calls
- Explain the matchup context
- End with why this pick will hit

${narrativeContext ? `\n## LIVE CONTEXT (from Gemini Search)\n${narrativeContext.substring(0, 8000)}` : ''}

## 🚨 FINALIZATION REMINDER 🚨
- After 3 tool call rounds, you MUST call finalize_props
- ${usesTwoPerGame ? 'Pick EXACTLY 2 props' : 'Pick 3-5 props'}
- Don't over-research - make decisions with available data

Start by identifying top candidates, fetch their stats, then FINALIZE.
`;
}

/**
 * Main pipeline runner for props
 */
// Sports that use the full iteration loop with BDL MCP tools
const ITERATION_SPORTS = ['NFL', 'NBA', 'NHL', 'NCAAB', 'NCAAF'];

// Map sport labels to their sport keys
const SPORT_KEYS = {
  'NFL': 'americanfootball_nfl',
  'NBA': 'basketball_nba',
  'NHL': 'icehockey_nhl',
  'EPL': 'soccer_epl',
  'NCAAB': 'basketball_ncaab',
  'NCAAF': 'americanfootball_ncaaf'
};

export async function runAgenticPropsPipeline({
  game,
  playerProps,
  buildContext,
  sportLabel = 'NFL',
  propsPerGame = 5,
  options = {}
}) {
  const start = Date.now();

  console.log(`\n[Agentic Props][${sportLabel}] Building context...`);
  const context = await buildContext(game, playerProps, options);
  const matchup = `${game.away_team} @ ${game.home_team}`;

  // Use iteration loop for NFL, NBA, NHL (full agentic with BDL MCP tools)
  if (ITERATION_SPORTS.includes(sportLabel)) {
    console.log(`[Agentic Props][${sportLabel}] Using full iteration loop with BDL MCP tools`);

    const systemPrompt = buildPropsIterationPrompt(
      context.gameSummary,
      context.propCandidates,
      context.narrativeContext,
      sportLabel
    );

    const userMessage = JSON.stringify({
      matchup: context.gameSummary.matchup,
      tipoff: context.gameSummary.tipoff,
      prop_candidates: context.propCandidates.slice(0, 14).map(p => ({
        player: p.player,
        team: p.team,
        props: p.props
      })),
      available_lines: playerProps.slice(0, 50).map(p => ({
        player: p.player,
        prop_type: p.prop_type,
        line: p.line,
        over_odds: p.over_odds,
        under_odds: p.under_odds
      }))
    }, null, 2);

    const sportKey = SPORT_KEYS[sportLabel] || 'americanfootball_nfl';
    const result = await runPropsIterationLoop({ 
      systemPrompt, 
      userMessage, 
      sportKey, 
      sportLabel, 
      maxIterations: 6 
    });

    console.log(`[Agentic Props][${sportLabel}] Completed: ${result.iterations} iterations, ${result.toolCalls} tool calls`);

    // Helper: Clean source attributions from text for user display
    // Removes "(from fetch_player_season_stats)", "(from game_logs)", "(from search_context)", etc.
    const cleanSourceTags = (text) => {
      if (!text || typeof text !== 'string') return text;
      // Remove patterns like "(from fetch_player_season_stats)", "(from season_stats)", "(from search_context)", "(from prop_candidates)"
      return text.replace(/\s*\(from\s+[^)]+\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    };

    const cleanKeyStats = (stats) => {
      if (!Array.isArray(stats)) return [];
      return stats.map(stat => cleanSourceTags(stat)).filter(s => s && s.length > 0);
    };

    // Helper: Ensure prop includes the line value and correct prop type
    // Build a lookup from available props to find correct prop_type
    const propsLookup = {};
    for (const p of playerProps) {
      // Create multiple keys to match different formats Gary might return
      const key1 = `${p.player?.toLowerCase()}_${p.line}`;
      const key2 = `${p.player?.toLowerCase()}_${p.prop_type?.toLowerCase()}_${p.line}`;
      propsLookup[key1] = p.prop_type;
      propsLookup[key2] = p.prop_type;
    }
    
    const formatProp = (pick) => {
      // If prop already has a valid type with number, use it
      if (pick.prop && /\d/.test(pick.prop) && !pick.prop.toLowerCase().includes('unknown')) {
        return pick.prop;
      }
      
      // Try to find the prop type from our lookup
      const playerKey = pick.player?.toLowerCase();
      const line = pick.line || '';
      let propType = pick.prop_type || pick.prop || 'unknown';
      
      // Look up by player + line
      const lookupKey1 = `${playerKey}_${line}`;
      if (propsLookup[lookupKey1]) {
        propType = propsLookup[lookupKey1];
      }
      
      // If prop_type contains 'unknown', try harder to find it
      if (propType.toLowerCase().includes('unknown') && playerKey && line) {
        // Search through all props for this player with this line
        const match = playerProps.find(p => 
          p.player?.toLowerCase() === playerKey && 
          Math.abs(p.line - parseFloat(line)) < 0.1
        );
        if (match?.prop_type) {
          propType = match.prop_type;
        }
      }
      
      return `${propType} ${line}`.trim();
    };

    // Enhance picks with metadata and sort by confidence
    const allPicks = (result.picks || []).map(pick => ({
      ...pick,
      sport: sportLabel,
      time: formatGameTime(game.commence_time),
      matchup,
      commence_time: game.commence_time,
      player: pick.player || 'Unknown',
      team: pick.team || sportLabel,
      prop: formatProp(pick),
      bet: (pick.bet || 'over').toLowerCase(),
      odds: pick.odds || -110,
      confidence: pick.confidence || 0.6,
      rationale: cleanSourceTags(pick.rationale) || 'Analysis based on matchup data.',
      key_stats: cleanKeyStats(pick.key_stats),
      analysis: cleanSourceTags(pick.rationale) || 'Analysis based on matchup data.'
    }));

    // Sort by confidence descending and take top N
    const sortedPicks = allPicks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const topPicks = sortedPicks.slice(0, propsPerGame);
    
    // Apply confidence filter (slightly lower for NBA/NHL due to variance)
    const minConfidence = sportLabel === 'NFL' ? 0.65 : 0.60;
    const finalPicks = topPicks.filter(p => p.confidence >= minConfidence);
    console.log(`[Agentic Props][${sportLabel}] Sorted by confidence: Top ${propsPerGame} of ${allPicks.length}, filtered to ${finalPicks.length} picks (>=${minConfidence})`);

    return {
      picks: finalPicks,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
      elapsedMs: Date.now() - start
    };
  }

  // LEGACY: 3-stage pipeline for EPL and other sports
  console.log(`[Agentic Props][${sportLabel}] Using 3-stage pipeline (legacy)`);

  console.log(`[Agentic Props][${sportLabel}] Stage 1: Hypothesis for ${context.gameSummary.matchup}`);
  if (context.narrativeContext) {
    console.log(`[Agentic Props][${sportLabel}] ✓ Including narrative context`);
  }
  const stage1 = await runPropsHypothesisStage({
    gameSummary: context.gameSummary,
    propCandidates: context.propCandidates,
    playerStats: context.playerStats,
    sportLabel,
    tokenData: context.tokenData,
    narrativeContext: context.narrativeContext
  });
  console.log(`[Agentic Props][${sportLabel}] Found ${stage1.top_opportunities.length} opportunities`);

  if (stage1.top_opportunities.length === 0) {
    console.log(`[Agentic Props][${sportLabel}] No prop opportunities identified`);
    return { picks: [], elapsedMs: Date.now() - start };
  }

  console.log(`[Agentic Props][${sportLabel}] Stage 2: Investigating props...`);
  const stage2 = await runPropsInvestigatorStage({
    gameSummary: context.gameSummary,
    hypothesis: stage1,
    tokenData: context.tokenData,
    propCandidates: context.propCandidates
  });
  console.log(`[Agentic Props][${sportLabel}] Validated ${stage2.validated_props.length} props, dropped ${stage2.dropped_props.length}`);

  if (stage2.validated_props.length === 0) {
    console.log(`[Agentic Props][${sportLabel}] No props passed validation`);
    return { picks: [], elapsedMs: Date.now() - start };
  }

  console.log(`[Agentic Props][${sportLabel}] Stage 3: Rendering final picks...`);
  const rawPicks = await runPropsJudgeStage({
    gameSummary: context.gameSummary,
    investigation: stage2,
    playerProps: context.playerProps,
    sportLabel
  });
  
  // Helper: Clean source attributions from text for user display
  const cleanSourceTagsLegacy = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\s*\(from\s+[^)]+\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  };

  const cleanKeyStatsLegacy = (stats) => {
    if (!Array.isArray(stats)) return [];
    return stats.map(stat => cleanSourceTagsLegacy(stat)).filter(s => s && s.length > 0);
  };

  // Helper: Ensure prop includes the line value
  const formatPropLegacy = (pick) => {
    if (pick.prop && /\d/.test(pick.prop)) {
      return pick.prop;
    }
    const propType = pick.prop || pick.prop_type || 'unknown';
    const line = pick.line || '';
    return `${propType} ${line}`.trim();
  };
  
  // Enhance picks with metadata
  const enhancedPicks = rawPicks.slice(0, propsPerGame).map(pick => ({
      ...pick,
      sport: sportLabel,
      time: formatGameTime(game.commence_time),
    matchup,
    commence_time: game.commence_time,
      player: pick.player || 'Unknown',
      team: pick.team || sportLabel,
      prop: formatPropLegacy(pick),
      bet: (pick.bet || 'over').toLowerCase(),
      odds: pick.odds || -110,
      confidence: pick.confidence || 0.6,
      rationale: cleanSourceTagsLegacy(pick.rationale) || 'Analysis based on matchup data.',
      key_stats: cleanKeyStatsLegacy(pick.key_stats),
      analysis: cleanSourceTagsLegacy(pick.rationale) || 'Analysis based on matchup data.'
  }));

  // Sport-specific filtering
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  const finalPicks = usesTwoPerGame ? enhancedPicks : enhancedPicks.filter(p => p.confidence >= 0.65);

  const elapsedMs = Date.now() - start;
  console.log(`[Agentic Props][${sportLabel}] Pipeline complete in ${elapsedMs}ms`);

  return {
    picks: finalPicks,
    stage1,
    stage2,
    elapsedMs
  };
}

export default {
  runAgenticPropsPipeline
};
