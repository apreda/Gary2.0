/**
 * Props Agentic Runner
 * Full agentic iteration loop for player prop analysis (like game picks)
 * Gary can call tools mid-analysis to fetch stats organically
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { openaiService, GEMINI_FLASH_MODEL } from '../openaiService.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { applyQuantumFilter, isQuantumEnabled } from '../quantumService.js';
import { geminiGroundingSearch } from './scoutReport/scoutReportBuilder.js';
// Import sharp grading reference for Steel Man case evaluation
import { getSteelManGradingReference } from './constitution/sharpReferenceLoader.js';

// ═══════════════════════════════════════════════════════════════════════════
// PROPS MODEL POLICY (ALL USE FLASH)
// ═══════════════════════════════════════════════════════════════════════════
// ALL Props: Use Gemini 3 Flash (avoid quota issues)
// ═══════════════════════════════════════════════════════════════════════════
const PROPS_MODEL_FLASH = GEMINI_FLASH_MODEL;

// Get the right model for props based on sport (always Flash now)
function getPropsModelForSport(sportLabel) {
  console.log(`[Props] Using Gemini 3 Flash for ${sportLabel} props (quota management)`);
  return PROPS_MODEL_FLASH;
}

// Default for backward compatibility
const PROPS_MODEL = PROPS_MODEL_FLASH;
import { safeJsonParse } from './agenticUtils.js';
// Import getConstitution from index to get BASE_RULES + sport constitution
import { getConstitution as getConstitutionWithBaseRules } from './constitution/index.js';
// Keep direct imports for backwards compatibility (3-stage flow)
import { NFL_PROPS_CONSTITUTION } from './constitution/nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './constitution/nbaPropsConstitution.js';
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

// Common pick schema for all prop types
const PICK_SCHEMA = {
  type: 'object',
  properties: {
    player: { type: 'string' },
    team: { type: 'string' },
    prop: { type: 'string', description: 'e.g., "rec_yds 68.5" or "anytime_td" or "first_td"' },
    line: { type: 'number', description: 'The line value (use 0.5 for TD props)' },
    bet: { type: 'string', enum: ['over', 'under', 'yes'] },
    odds: { type: 'number' },
    confidence: { type: 'number', description: 'Your confidence level (0.50-1.0).' },
    // Thesis Gate fields - forces dual-scenario thinking before picking a side
    over_thesis: { type: 'string', description: '2 sentences max: The game script where the OVER/YES hits. What has to happen?' },
    under_thesis: { type: 'string', description: '2 sentences max: The game script where the UNDER/NO hits. What kills the OVER?' },
    thesis_lean: { type: 'string', enum: ['OVER', 'UNDER', 'COIN-FLIP'], description: 'Which thesis is more believable given the matchup?' },
    edge_type: { 
      type: 'string', 
      enum: ['USAGE_SHIFT', 'MATCHUP_MISMATCH', 'GAME_SCRIPT', 'RECENT_FORM', 'LINE_SOFT', 'NEXT_GEN_EDGE'],
      description: 'Primary edge type: USAGE_SHIFT (teammate out), MATCHUP_MISMATCH (defender weakness), GAME_SCRIPT (pace/blowout), RECENT_FORM (hot streak), LINE_SOFT (book mistake), NEXT_GEN_EDGE (advanced stats)' 
    },
    confidence_tier: { type: 'string', enum: ['MAX', 'CORE', 'SPECULATIVE'], description: 'MAX (2 units, elite edge), CORE (1 unit, solid), SPECULATIVE (0.5 units, value shot)' },
    rationale: { type: 'string', description: '5-7 sentences explaining why you like this pick.' },
    key_stats: { type: 'array', items: { type: 'string' }, description: 'Key stats supporting your pick with source attribution.' }
  },
  required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'over_thesis', 'under_thesis', 'thesis_lean', 'edge_type', 'confidence_tier', 'rationale', 'key_stats']
};

// Common tools available for all sports (non-NFL)
const FINALIZE_TOOL = {
  type: 'function',
  function: {
    name: 'finalize_props',
    description: `Output your final prop picks. 

BLOCKING RULE: BEFORE CALLING THIS TOOL, you MUST have completed BILATERAL STEEL MAN analysis:
- For each pick, you should have written CASE FOR OVER and CASE FOR UNDER
- Your chosen side should CLEARLY beat the opposing case
- If you haven't written bilateral cases yet, STOP and do that first

REQUIREMENTS FOR EACH PICK:
1. EDGE IDENTIFIED: What specific factor exists TONIGHT that the line hasn't captured?
2. LINE LOGIC UNDERSTOOD: Why did books set this line? What are you disagreeing with?
3. MECHANISM EXPLAINED: HOW does this player hit? (Not rankings - actual game action)
4. RISK ACKNOWLEDGED: What's the specific scenario where this loses?

Your rationale MUST be SPECIFIC with receipts. If your thesis is "average > line", you haven't found edge - you've described why the line exists.`,
    parameters: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: PICK_SCHEMA
        }
      },
      required: ['picks']
    }
  }
};

// NFL-specific finalize tool with 4 categories
const NFL_FINALIZE_TOOL = {
  type: 'function',
  function: {
    name: 'finalize_props',
    description: `Output your final NFL prop picks in 4 SEPARATE CATEGORIES.

BLOCKING RULE: BEFORE CALLING THIS TOOL, you MUST have completed BILATERAL STEEL MAN analysis:
- For each pick, you should have written CASE FOR OVER and CASE FOR UNDER
- Your chosen side should CLEARLY beat the opposing case

REQUIREMENTS FOR EACH PICK:
1. EDGE IDENTIFIED: What specific factor exists TONIGHT that the line hasn't captured?
2. LINE LOGIC UNDERSTOOD: Why did books set this line? What are you disagreeing with?
3. MECHANISM EXPLAINED: HOW does this player produce? (Not rankings - actual game action)
4. RISK ACKNOWLEDGED: What's the specific scenario where this loses?

CATEGORIES:
1. regular_props (Shortlist 5): Yards, receptions, attempts - NO TDs. Odds range: -200 to +250.
2. regular_td (Shortlist 4): Anytime TD with odds -200 to +200. Likely scorers.
3. value_td (Pick 1): Anytime TD with odds +200 or higher. Can include 2+ TDs. NOT 1st TD.
4. first_td (Pick 1): First TD scorer only. Lottery pick.

Each rationale MUST be SPECIFIC. If your thesis is "average > line", you haven't found edge.`,
    parameters: {
      type: 'object',
      properties: {
        regular_props: {
          type: 'array',
          description: 'Shortlist 5 regular props (yards, receptions, attempts). NO TD props. Odds range: -200 to +250.',
          items: PICK_SCHEMA
        },
        regular_td: {
          type: 'array', 
          description: 'Shortlist 4 Anytime TD props with odds between -200 and +200.',
          items: PICK_SCHEMA
        },
        value_td: {
          type: 'array',
          description: 'Pick 1 Anytime TD or 2+ TDs prop with odds +200 or higher. NOT 1st TD.',
          items: PICK_SCHEMA
        },
        first_td: {
          type: 'array',
          description: 'Pick 1 First TD scorer. This is a lottery pick.',
          items: PICK_SCHEMA
        }
      },
      required: ['regular_props', 'regular_td', 'value_td', 'first_td']
    }
  }
};

const SEARCH_TOOL = {
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
};

const COMMON_PROP_TOOLS = [SEARCH_TOOL, FINALIZE_TOOL];

// NFL REGULAR props only (yards, receptions, etc. - NO TDs)
// Used when TD picks are already stored from separate run
const NFL_REGULAR_PROP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'fetch_player_game_logs',
      description: 'Fetch last 5 NFL game logs for a player (passing yards, rushing yards, receiving yards, receptions)',
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
      description: 'Fetch NFL season stats for a player',
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
      name: 'fetch_player_vs_opponent',
      description: 'Fetch a player\'s career stats vs a specific opponent team',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name' },
          opponent_name: { type: 'string', description: 'Opponent team name (e.g., "Chiefs", "Bills")' }
        },
        required: ['player_name', 'opponent_name']
      }
    }
  },
  SEARCH_TOOL,
  FINALIZE_TOOL  // Standard finalize tool (not categorized)
];

// NFL-specific prop tools (full categorized - includes TDs)
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
  // NEW: Historical vs Opponent Tool - For validating revenge games and matchup history
  {
    type: 'function',
    function: {
      name: 'fetch_player_vs_opponent',
      description: 'Fetch a player\'s historical performance against a specific opponent team. Use this to validate revenge game narratives or find matchup-specific edges. Returns stats from past games vs this opponent.',
      parameters: {
        type: 'object',
        properties: {
          player_name: { type: 'string', description: 'Full player name (e.g., "George Pickens")' },
          opponent_team: { type: 'string', description: 'Opponent team name (e.g., "Ravens", "Baltimore Ravens")' }
        },
        required: ['player_name', 'opponent_team']
      }
    }
  },
  SEARCH_TOOL,
  NFL_FINALIZE_TOOL  // NFL uses categorized finalize tool
];

// NBA-specific prop tools (NO WEB SEARCH - all data in context)
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
  FINALIZE_TOOL
];

// NHL-specific prop tools (NO WEB SEARCH - all data in context)
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
  FINALIZE_TOOL
];

// Map sport labels to their tool definitions
const SPORT_PROP_TOOLS = {
  'NFL': NFL_PROP_TOOLS,
  'NFL_REGULAR': NFL_REGULAR_PROP_TOOLS,  // Regular props only (no TDs)
  'NBA': NBA_PROP_TOOLS,
  'NHL': NHL_PROP_TOOLS,
  'NCAAB': NBA_PROP_TOOLS,  // College basketball uses NBA-style tools
  'NCAAF': NFL_PROP_TOOLS   // College football uses NFL-style tools
};

// Get tools for a specific sport
function getPropsToolsForSport(sportLabel, regularOnly = false) {
  // If regularOnly is true and sport is NFL, use the non-TD tools
  if (regularOnly && sportLabel === 'NFL') {
    return SPORT_PROP_TOOLS['NFL_REGULAR'];
  }
  return SPORT_PROP_TOOLS[sportLabel] || COMMON_PROP_TOOLS;
}

// Legacy alias for backwards compatibility
const PROPS_TOOL_DEFINITIONS = NFL_PROP_TOOLS;

// Map of sport labels to constitution keys (for getConstitutionWithBaseRules)
const SPORT_CONSTITUTION_KEYS = {
  'NFL': 'NFL_PROPS',
  'NBA': 'NBA_PROPS',
  'NHL': 'NHL_PROPS',
};

// Legacy map for backwards compatibility (3-stage flow uses these directly)
const SPORT_CONSTITUTIONS_LEGACY = {
  'NFL': NFL_PROPS_CONSTITUTION,
  'NBA': NBA_PROPS_CONSTITUTION,
  'NHL': NHL_PROPS_CONSTITUTION,
};

/**
 * Get the appropriate constitution for a sport (WITH BASE_RULES included)
 * This ensures props get the same core identity (INDEPENDENT THINKER), 
 * data source rules, and external betting influence prohibition as game picks.
 */
function getConstitution(sportLabel) {
  const constitutionKey = SPORT_CONSTITUTION_KEYS[sportLabel] || 'NFL_PROPS';
  let constitution = getConstitutionWithBaseRules(constitutionKey);
  
  // Replace date template if present
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  constitution = constitution.replace(/\{\{CURRENT_DATE\}\}/g, today);
  
  return constitution;
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
      temperature: 1.0, // Gemini 3 optimized default - DO NOT lower (causes looping on math tasks)
      topP: 0.95, // Include plausible longshots in reasoning - helps Gary find non-obvious edges
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
  const isNBA = sportLabel === 'NBA' || sportKey === 'basketball_nba';
  const isNCAAB = sportLabel === 'NCAAB' || sportKey === 'basketball_ncaab';
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
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];
      
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

      // NCAAB-specific game logs
      if (isNCAAB) {
        const logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, 5);
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
          min: g.min
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
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];
      
      const player = players.find(p => 
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found in ${sportLabel}` };
      }

      // NBA-specific season stats - Enhanced with BDL v2 advanced stats
      if (isNBA) {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
        const season = currentMonth >= 10 ? currentYear : currentYear - 1;

        // Fetch base, usage, advanced, and scoring stats in parallel (BDL v2)
        const [baseStatsResp, usageStatsResp, advancedStatsResp, scoringStatsResp] = await Promise.all([
          ballDontLieService.getNbaSeasonAverages({
            category: 'general',
            type: 'base',
            season,
            player_ids: [player.id]
          }),
          ballDontLieService.getNbaSeasonAverages({
            category: 'general',
            type: 'usage',
            season,
            player_ids: [player.id]
          }),
          ballDontLieService.getNbaSeasonAverages({
            category: 'general',
            type: 'advanced',
            season,
            player_ids: [player.id]
          }),
          ballDontLieService.getNbaSeasonAverages({
            category: 'general',
            type: 'scoring',
            season,
            player_ids: [player.id]
          })
        ]);

        const baseStats = baseStatsResp?.[0]?.stats;
        const usageStats = usageStatsResp?.[0]?.stats;
        const advancedStats = advancedStatsResp?.[0]?.stats;
        const scoringStats = scoringStatsResp?.[0]?.stats;

        return {
          player: args.player_name,
          team: player.team?.full_name,
          season_stats: baseStats ? {
            games_played: baseStats.gp,
            ppg: baseStats.pts,
            rpg: baseStats.reb,
            apg: baseStats.ast,
            // UPGRADED: TS% and eFG% instead of raw FG%
            true_shooting_pct: advancedStats?.ts_pct ? (advancedStats.ts_pct * 100).toFixed(1) + '%' : 'N/A',
            effective_fg_pct: advancedStats?.efg_pct ? (advancedStats.efg_pct * 100).toFixed(1) + '%' : 'N/A',
            fg3_pct: (baseStats.fg3_pct * 100).toFixed(1) + '%',
            ft_pct: (baseStats.ft_pct * 100).toFixed(1) + '%',
            mpg: baseStats.min,
            steals: baseStats.stl,
            blocks: baseStats.blk,
            turnovers: baseStats.tov,
            threes_per_game: baseStats.fg3m
          } : { message: 'No season stats available' },
          // BDL v2 GOLD: Usage and role share metrics
          usage_stats: usageStats ? {
            usage_percentage: usageStats.usage_pct ? (usageStats.usage_pct * 100).toFixed(1) + '%' : 'N/A',
            touches: usageStats.touches,
            pct_of_team_points: usageStats.pct_pts ? (usageStats.pct_pts * 100).toFixed(1) + '%' : 'N/A',
            pct_of_team_fga: usageStats.pct_fga ? (usageStats.pct_fga * 100).toFixed(1) + '%' : 'N/A',
            pct_of_team_rebounds: usageStats.pct_reb ? (usageStats.pct_reb * 100).toFixed(1) + '%' : 'N/A',
            pct_of_team_assists: usageStats.pct_ast ? (usageStats.pct_ast * 100).toFixed(1) + '%' : 'N/A'
          } : null,
          // BDL v2 GOLD: Shot creation & scoring profile
          scoring_profile: scoringStats ? {
            pct_unassisted: scoringStats.pct_uast_fgm ? (scoringStats.pct_uast_fgm * 100).toFixed(1) + '%' : 'N/A',
            pct_assisted: scoringStats.pct_ast_fgm ? (scoringStats.pct_ast_fgm * 100).toFixed(1) + '%' : 'N/A',
            pct_pts_paint: scoringStats.pct_pts_paint ? (scoringStats.pct_pts_paint * 100).toFixed(1) + '%' : 'N/A',
            pct_pts_midrange: scoringStats.pct_pts_mid_range_2 ? (scoringStats.pct_pts_mid_range_2 * 100).toFixed(1) + '%' : 'N/A',
            pct_pts_3pt: scoringStats.pct_pts_3pt ? (scoringStats.pct_pts_3pt * 100).toFixed(1) + '%' : 'N/A',
            pct_pts_fastbreak: scoringStats.pct_pts_fb ? (scoringStats.pct_pts_fb * 100).toFixed(1) + '%' : 'N/A'
          } : null,
          note: 'TS% = true efficiency (includes FTs). Unassisted % = creates own shot (high = reliable volume). Paint % = scoring location.'
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
  // FETCH_ADVANCED_PASSING_STATS - NFL BDL v2 Advanced Passing (QB Props)
  // ============================================================================
  if (functionName === 'fetch_advanced_passing_stats') {
    console.log(`  → [ADVANCED_PASSING] ${args.player_name} (NFL)`);
    try {
      if (!isNFL) {
        return { error: `fetch_advanced_passing_stats only supported for NFL` };
      }

      // Search for player
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];

      const player = players.find(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found` };
      }

      // Calculate NFL season
      const nflMonth = new Date().getMonth() + 1;
      const nflYear = new Date().getFullYear();
      const season = nflMonth <= 7 ? nflYear - 1 : nflYear;

      const advancedStats = await ballDontLieService.getNflAdvancedPassingStats({
        season,
        player_id: player.id,
        week: args.week || 0 // 0 = full season
      });

      if (!advancedStats || advancedStats.length === 0) {
        return { player: args.player_name, stats: { message: 'No advanced passing stats available' } };
      }

      const stats = advancedStats[0];
      return {
        player: args.player_name,
        team: player.team?.full_name,
        advanced_passing: {
          // Accuracy & Decision Making
          completion_pct: stats.completion_percentage ? (stats.completion_percentage * 100).toFixed(1) + '%' : 'N/A',
          completion_pct_above_expected: stats.completion_percentage_above_expectation ? (stats.completion_percentage_above_expectation * 100).toFixed(1) + '%' : 'N/A',
          aggressiveness: stats.aggressiveness ? (stats.aggressiveness * 100).toFixed(1) + '%' : 'N/A',
          // Air Yards & Depth
          avg_air_yards: stats.avg_air_yards_differential,
          avg_intended_air_yards: stats.avg_intended_air_yards,
          avg_completed_air_yards: stats.avg_completed_air_yards,
          // Timing
          avg_time_to_throw: stats.avg_time_to_throw ? stats.avg_time_to_throw.toFixed(2) + 's' : 'N/A',
          // Efficiency
          passer_rating: stats.passer_rating,
          max_air_distance: stats.max_air_distance,
          // Volume
          attempts: stats.attempts,
          pass_yards: stats.pass_yards
        },
        note: 'Completion % above expected = accuracy vs difficulty. Aggressiveness = deep throws. Avg time to throw indicates pocket awareness.'
      };
    } catch (e) {
      console.error(`    ❌ Error:`, e.message);
      return { error: e.message, player_name: args.player_name };
    }
  }

  // ============================================================================
  // FETCH_ADVANCED_RUSHING_STATS - NFL BDL v2 Advanced Rushing (RB Props)
  // ============================================================================
  if (functionName === 'fetch_advanced_rushing_stats') {
    console.log(`  → [ADVANCED_RUSHING] ${args.player_name} (NFL)`);
    try {
      if (!isNFL) {
        return { error: `fetch_advanced_rushing_stats only supported for NFL` };
      }

      // Search for player
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];

      const player = players.find(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found` };
      }

      // Calculate NFL season
      const nflMonth = new Date().getMonth() + 1;
      const nflYear = new Date().getFullYear();
      const season = nflMonth <= 7 ? nflYear - 1 : nflYear;

      const advancedStats = await ballDontLieService.getNflAdvancedRushingStats({
        season,
        player_id: player.id,
        week: args.week || 0
      });

      if (!advancedStats || advancedStats.length === 0) {
        return { player: args.player_name, stats: { message: 'No advanced rushing stats available' } };
      }

      const stats = advancedStats[0];
      return {
        player: args.player_name,
        team: player.team?.full_name,
        advanced_rushing: {
          // Efficiency (GOLD for props)
          efficiency: stats.efficiency ? stats.efficiency.toFixed(2) : 'N/A',
          rush_yards_over_expected: stats.rush_yards_over_expected,
          rush_yards_over_expected_per_att: stats.rush_yards_over_expected_per_att ? stats.rush_yards_over_expected_per_att.toFixed(2) : 'N/A',
          pct_over_expected: stats.percent_rush_yards_over_expected ? (stats.percent_rush_yards_over_expected * 100).toFixed(1) + '%' : 'N/A',
          // Speed & Explosiveness
          avg_time_to_los: stats.avg_time_to_los ? stats.avg_time_to_los.toFixed(2) + 's' : 'N/A',
          // Box Count (GOLD - shows offensive line + game script)
          pct_8_plus_box: stats.percent_attempts_gte_eight_defenders ? (stats.percent_attempts_gte_eight_defenders * 100).toFixed(1) + '%' : 'N/A',
          // Volume
          rush_attempts: stats.rush_attempts,
          rush_yards: stats.rush_yards
        },
        note: 'Yards over expected = performance vs opportunity. High 8+ box % = stacked boxes = harder rushing. Efficiency = yards per expected yard.'
      };
    } catch (e) {
      console.error(`    ❌ Error:`, e.message);
      return { error: e.message, player_name: args.player_name };
    }
  }

  // ============================================================================
  // FETCH_ADVANCED_RECEIVING_STATS - NFL BDL v2 Advanced Receiving (WR/TE Props)
  // ============================================================================
  if (functionName === 'fetch_advanced_receiving_stats') {
    console.log(`  → [ADVANCED_RECEIVING] ${args.player_name} (NFL)`);
    try {
      if (!isNFL) {
        return { error: `fetch_advanced_receiving_stats only supported for NFL` };
      }

      // Search for player
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];

      const player = players.find(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found` };
      }

      // Calculate NFL season
      const nflMonth = new Date().getMonth() + 1;
      const nflYear = new Date().getFullYear();
      const season = nflMonth <= 7 ? nflYear - 1 : nflYear;

      const advancedStats = await ballDontLieService.getNflAdvancedReceivingStats({
        season,
        player_id: player.id,
        week: args.week || 0
      });

      if (!advancedStats || advancedStats.length === 0) {
        return { player: args.player_name, stats: { message: 'No advanced receiving stats available' } };
      }

      const stats = advancedStats[0];
      return {
        player: args.player_name,
        team: player.team?.full_name,
        advanced_receiving: {
          // Separation & Skill (GOLD for props)
          avg_separation: stats.avg_separation ? stats.avg_separation.toFixed(2) + ' yds' : 'N/A',
          avg_cushion: stats.avg_cushion ? stats.avg_cushion.toFixed(2) + ' yds' : 'N/A',
          catch_percentage: stats.catch_percentage ? (stats.catch_percentage * 100).toFixed(1) + '%' : 'N/A',
          // YAC (GOLD for yards props)
          avg_yac: stats.avg_yac ? stats.avg_yac.toFixed(1) : 'N/A',
          avg_expected_yac: stats.avg_expected_yac ? stats.avg_expected_yac.toFixed(1) : 'N/A',
          avg_yac_above_expectation: stats.avg_yac_above_expectation ? stats.avg_yac_above_expectation.toFixed(1) : 'N/A',
          // Target Share (GOLD - role indicator)
          pct_team_air_yards: stats.percent_share_of_intended_air_yards ? (stats.percent_share_of_intended_air_yards * 100).toFixed(1) + '%' : 'N/A',
          // Volume
          targets: stats.targets,
          receptions: stats.receptions,
          receiving_yards: stats.receiving_yards
        },
        note: 'Separation = getting open. YAC above expected = skill after catch. Target share = role in passing game. High separation + high target share = reliable volume.'
      };
    } catch (e) {
      console.error(`    ❌ Error:`, e.message);
      return { error: e.message, player_name: args.player_name };
    }
  }

  // ============================================================================
  // FETCH_GOALIE_STATS - NHL-specific
  // ============================================================================
  if (functionName === 'fetch_goalie_stats') {
    console.log(`  → [GOALIE_STATS] ${args.team_name}`);
    try {
      // Get team info using the generic function that supports NHL
      const teamsResp = await ballDontLieService.getTeamsGeneric('icehockey_nhl');
      const teams = Array.isArray(teamsResp) ? teamsResp : teamsResp?.data || [];
      
      const teamNameLower = args.team_name.toLowerCase();
      const team = teams.find(t => 
        t.full_name?.toLowerCase().includes(teamNameLower) ||
        t.tricode?.toLowerCase() === teamNameLower ||
        t.full_name?.toLowerCase().replace(/[^a-z]/g, '').includes(teamNameLower.replace(/[^a-z]/g, ''))
      );
      
      if (!team) {
        return { error: `NHL Team "${args.team_name}" not found in ${teams.length} teams` };
      }

      // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
      const goalieMonth = new Date().getMonth() + 1;
      const goalieYear = new Date().getFullYear();
      const goalieSeason = goalieMonth >= 10 ? goalieYear : goalieYear - 1;
      const goalies = await ballDontLieService.getNhlTeamGoalies([team.id], goalieSeason);
      
      // Return goalie data in a consistent format
      const goalieData = goalies?.home || goalies?.away || goalies;
      return {
        team: team.full_name,
        team_id: team.id,
        goalies: goalieData || { message: 'No goalie stats available' }
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============================================================================
  // FETCH_PLAYER_VS_OPPONENT - NFL Historical Matchup Data
  // Use this to validate revenge game narratives or find matchup-specific edges
  // ============================================================================
  if (functionName === 'fetch_player_vs_opponent') {
    console.log(`  → [PLAYER_VS_OPPONENT] ${args.player_name} vs ${args.opponent_team}`);
    try {
      // Only supported for NFL currently
      if (!isNFL) {
        return { error: `fetch_player_vs_opponent only supported for NFL currently` };
      }

      // Search for player
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];
      
      const player = players.find(p => 
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase() ||
        p.last_name?.toLowerCase() === lastName.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found` };
      }

      // Search for opponent team
      const teamsResp = await ballDontLieService.getTeamsGeneric(sportKey);
      const teams = Array.isArray(teamsResp) ? teamsResp : teamsResp?.data || [];
      const opponentLower = args.opponent_team.toLowerCase().replace(/[^a-z]/g, '');
      const opponentTeam = teams.find(t => 
        t.full_name?.toLowerCase().includes(opponentLower) ||
        t.name?.toLowerCase().includes(opponentLower) ||
        t.full_name?.toLowerCase().replace(/[^a-z]/g, '').includes(opponentLower)
      );

      if (!opponentTeam) {
        return { error: `Opponent team "${args.opponent_team}" not found` };
      }

      // Calculate NFL season (current and previous for more history)
      const nflMonth = new Date().getMonth() + 1;
      const nflYear = new Date().getFullYear();
      const currentSeason = nflMonth <= 7 ? nflYear - 1 : nflYear;
      const previousSeason = currentSeason - 1;

      // Fetch game logs for both seasons
      const [currentLogs, previousLogs] = await Promise.all([
        ballDontLieService.getNflPlayerGameLogs([player.id], currentSeason, 20).catch(() => []),
        ballDontLieService.getNflPlayerGameLogs([player.id], previousSeason, 20).catch(() => [])
      ]);

      // Combine and filter for games vs opponent
      const allLogs = [...(currentLogs || []), ...(previousLogs || [])];
      const gamesVsOpponent = allLogs.filter(game => {
        const opp = game.opponent?.toLowerCase() || '';
        const oppTeamName = opponentTeam.full_name?.toLowerCase() || '';
        const oppNickname = opponentTeam.name?.toLowerCase() || '';
        return opp.includes(oppNickname) || opp.includes(oppTeamName) || 
               oppTeamName.includes(opp) || oppNickname.includes(opp);
      });

      if (gamesVsOpponent.length === 0) {
        return {
          player: args.player_name,
          opponent: opponentTeam.full_name,
          games_found: 0,
          message: `No games found vs ${opponentTeam.full_name} in last 2 seasons. This may be due to limited matchup history or different conferences.`
        };
      }

      // Calculate summary stats
      const position = player.position || player.position_abbreviation || '';
      const isQB = position.toUpperCase() === 'QB';
      const isRB = position.toUpperCase() === 'RB';
      const isWR = ['WR', 'TE'].includes(position.toUpperCase());

      let summary = {};
      if (isQB) {
        const passYds = gamesVsOpponent.map(g => g.pass_yds || 0);
        const passTds = gamesVsOpponent.map(g => g.pass_tds || 0);
        summary = {
          type: 'QB',
          avg_pass_yds: (passYds.reduce((a, b) => a + b, 0) / passYds.length).toFixed(1),
          total_pass_tds: passTds.reduce((a, b) => a + b, 0),
          game_by_game: gamesVsOpponent.map(g => ({
            date: g.date,
            pass_yds: g.pass_yds,
            pass_tds: g.pass_tds,
            interceptions: g.interceptions
          }))
        };
      } else if (isRB) {
        const rushYds = gamesVsOpponent.map(g => g.rush_yds || 0);
        const rushTds = gamesVsOpponent.map(g => g.rush_tds || 0);
        const recYds = gamesVsOpponent.map(g => g.rec_yds || 0);
        summary = {
          type: 'RB',
          avg_rush_yds: (rushYds.reduce((a, b) => a + b, 0) / rushYds.length).toFixed(1),
          avg_rec_yds: (recYds.reduce((a, b) => a + b, 0) / recYds.length).toFixed(1),
          total_rush_tds: rushTds.reduce((a, b) => a + b, 0),
          game_by_game: gamesVsOpponent.map(g => ({
            date: g.date,
            rush_yds: g.rush_yds,
            rec_yds: g.rec_yds,
            receptions: g.receptions,
            tds: (g.rush_tds || 0) + (g.rec_tds || 0)
          }))
        };
      } else {
        // WR/TE
        const recYds = gamesVsOpponent.map(g => g.rec_yds || 0);
        const receptions = gamesVsOpponent.map(g => g.receptions || 0);
        const recTds = gamesVsOpponent.map(g => g.rec_tds || 0);
        summary = {
          type: 'WR/TE',
          avg_rec_yds: (recYds.reduce((a, b) => a + b, 0) / recYds.length).toFixed(1),
          avg_receptions: (receptions.reduce((a, b) => a + b, 0) / receptions.length).toFixed(1),
          total_rec_tds: recTds.reduce((a, b) => a + b, 0),
          game_by_game: gamesVsOpponent.map(g => ({
            date: g.date,
            rec_yds: g.rec_yds,
            receptions: g.receptions,
            targets: g.targets,
            tds: g.rec_tds
          }))
        };
      }

      return {
        player: args.player_name,
        position: position,
        opponent: opponentTeam.full_name,
        games_found: gamesVsOpponent.length,
        seasons_searched: `${previousSeason}-${currentSeason}`,
        summary,
        insight: gamesVsOpponent.length >= 2 
          ? `${args.player_name} has ${gamesVsOpponent.length} games vs ${opponentTeam.full_name} in the last 2 seasons. Use the summary stats to validate any matchup narrative.`
          : `Limited sample size (${gamesVsOpponent.length} game). Be cautious with matchup-specific conclusions.`
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ============================================================================
  // FETCH_PLAYER_ADVANCED_STATS - NBA BDL v2 Advanced Stats (PROPS GOLD)
  // Categories: general, clutch, defense, shooting
  // Types: base, advanced, usage, scoring, defense, misc, etc.
  // ============================================================================
  if (functionName === 'fetch_player_advanced_stats') {
    console.log(`  → [PLAYER_ADVANCED_STATS] ${args.player_name} (${args.category}/${args.type})`);
    try {
      if (!isNBA) {
        return { error: `fetch_player_advanced_stats only supported for NBA` };
      }

      // Search for player
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];

      const player = players.find(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found` };
      }

      // Calculate NBA season
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;

      // Fetch advanced stats from BDL v2 API
      const category = args.category || 'general';
      const type = args.type || 'advanced';

      const advancedStats = await ballDontLieService.getNbaSeasonAverages({
        category,
        type,
        season,
        player_ids: [player.id]
      });

      const playerStats = advancedStats?.[0];
      if (!playerStats?.stats) {
        return {
          player: args.player_name,
          team: player.team?.full_name,
          category,
          type,
          stats: { message: 'No advanced stats available for this category/type' }
        };
      }

      const stats = playerStats.stats;

      // Format response based on category/type - expose the BDL v2 gold fields
      let formattedStats = {};

      if (category === 'general' && type === 'usage') {
        // GOLD for Props: Usage and role share metrics
        formattedStats = {
          usage_percentage: stats.usage_pct ? (stats.usage_pct * 100).toFixed(1) + '%' : 'N/A',
          touches: stats.touches,
          pct_of_team_points: stats.pct_pts ? (stats.pct_pts * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_fga: stats.pct_fga ? (stats.pct_fga * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_fg3a: stats.pct_fg3a ? (stats.pct_fg3a * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_fta: stats.pct_fta ? (stats.pct_fta * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_oreb: stats.pct_oreb ? (stats.pct_oreb * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_dreb: stats.pct_dreb ? (stats.pct_dreb * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_reb: stats.pct_reb ? (stats.pct_reb * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_ast: stats.pct_ast ? (stats.pct_ast * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_tov: stats.pct_tov ? (stats.pct_tov * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_stl: stats.pct_stl ? (stats.pct_stl * 100).toFixed(1) + '%' : 'N/A',
          pct_of_team_blk: stats.pct_blk ? (stats.pct_blk * 100).toFixed(1) + '%' : 'N/A',
          games_played: stats.gp
        };
      } else if (category === 'general' && type === 'advanced') {
        // Advanced efficiency metrics
        formattedStats = {
          offensive_rating: stats.off_rating || stats.offensive_rating,
          defensive_rating: stats.def_rating || stats.defensive_rating,
          net_rating: stats.net_rating,
          assist_percentage: stats.ast_pct ? (stats.ast_pct * 100).toFixed(1) + '%' : 'N/A',
          assist_to_turnover: stats.ast_to_tov,
          assist_ratio: stats.ast_ratio,
          offensive_rebound_pct: stats.oreb_pct ? (stats.oreb_pct * 100).toFixed(1) + '%' : 'N/A',
          defensive_rebound_pct: stats.dreb_pct ? (stats.dreb_pct * 100).toFixed(1) + '%' : 'N/A',
          rebound_pct: stats.reb_pct ? (stats.reb_pct * 100).toFixed(1) + '%' : 'N/A',
          turnover_ratio: stats.tov_ratio ? (stats.tov_ratio * 100).toFixed(1) + '%' : 'N/A',
          effective_fg_pct: stats.efg_pct ? (stats.efg_pct * 100).toFixed(1) + '%' : 'N/A',
          true_shooting_pct: stats.ts_pct ? (stats.ts_pct * 100).toFixed(1) + '%' : 'N/A',
          pace: stats.pace,
          pie: stats.pie ? (stats.pie * 100).toFixed(1) + '%' : 'N/A',
          games_played: stats.gp
        };
      } else if (category === 'defense' && type === 'overall') {
        // GOLD for Props: Defensive pressure (use for opposing player UNDERs)
        formattedStats = {
          // PRIMARY: Matchup efficiency (lower = better defender)
          matchup_fg_pct: stats.matchup_fg_pct ? (stats.matchup_fg_pct * 100).toFixed(1) + '%' : 'N/A',
          matchup_3pt_pct: stats.matchup_fg3_pct ? (stats.matchup_fg3_pct * 100).toFixed(1) + '%' : 'N/A', // GOLD: 3PT% when guarded
          defended_at_rim_fg_pct: stats.def_at_rim_fg_pct ? (stats.def_at_rim_fg_pct * 100).toFixed(1) + '%' : 'N/A', // Rim protection
          // Contested shooting (skill indicator)
          contested_fg_pct: stats.contested_fg_pct ? (stats.contested_fg_pct * 100).toFixed(1) + '%' : 'N/A', // GOLD: makes contested shots
          contested_shots: stats.contested_shots,
          contested_2pt: stats.contested_2pt,
          contested_3pt: stats.contested_3pt,
          // Volume
          matchup_fg_made: stats.matchup_fg_made,
          matchup_fg_missed: stats.matchup_fg_missed,
          // Activity
          deflections: stats.deflections,
          charges_drawn: stats.charges_drawn,
          loose_balls_recovered: stats.loose_balls_recovered,
          games_played: stats.gp
        };
      } else if (category === 'shooting') {
        // Shooting zones - useful for 3PT props
        formattedStats = {
          fg_pct: stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) + '%' : 'N/A',
          fg_made: stats.fgm,
          fg_attempted: stats.fga,
          fg3_pct: stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) + '%' : 'N/A',
          fg3_made: stats.fg3m,
          fg3_attempted: stats.fg3a,
          // Zone-specific if available
          paint_fg_pct: stats.paint_fg_pct ? (stats.paint_fg_pct * 100).toFixed(1) + '%' : 'N/A',
          midrange_fg_pct: stats.midrange_fg_pct ? (stats.midrange_fg_pct * 100).toFixed(1) + '%' : 'N/A',
          corner_3_pct: stats.corner_3_pct ? (stats.corner_3_pct * 100).toFixed(1) + '%' : 'N/A',
          above_break_3_pct: stats.above_break_3_pct ? (stats.above_break_3_pct * 100).toFixed(1) + '%' : 'N/A',
          games_played: stats.gp
        };
      } else {
        // Default: return all available stats
        formattedStats = stats;
      }

      return {
        player: args.player_name,
        team: player.team?.full_name,
        category,
        type,
        stats: formattedStats,
        note: category === 'general' && type === 'usage'
          ? 'Usage % = share of team possessions used. Touches = ball handles. pct_* = share of team totals.'
          : category === 'defense'
            ? 'Matchup FG%/3PT% = opponent efficiency when guarded (lower = better defender). Contested FG% = skill at making contested shots (higher = better). Use matchup stats for opposing player UNDERs.'
            : null
      };
    } catch (e) {
      console.error(`    ❌ Error:`, e.message);
      return { error: e.message, player_name: args.player_name };
    }
  }

  // ============================================================================
  // FETCH_PLAYER_GAME_ADVANCED - Per-Game Advanced Stats (L5 Trends)
  // Gets PIE, net rating, usage per game for recent games
  // ============================================================================
  if (functionName === 'fetch_player_game_advanced') {
    console.log(`  → [PLAYER_GAME_ADVANCED] ${args.player_name} (last ${args.num_games || 5} games)`);
    try {
      if (!isNBA) {
        return { error: `fetch_player_game_advanced only supported for NBA` };
      }

      // Search for player
      const nameParts = args.player_name.trim().split(' ');
      const lastName = nameParts[nameParts.length - 1];
      const playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 10 });
      const players = Array.isArray(playersResp) ? playersResp : playersResp?.data || [];

      const player = players.find(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase() === args.player_name.toLowerCase()
      );

      if (!player) {
        return { error: `Player "${args.player_name}" not found` };
      }

      const numGames = args.num_games || 5;

      // Get recent game stats using BDL stats endpoint with player filter
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;

      // Fetch advanced per-game stats
      const advancedStats = await ballDontLieService.getNbaAdvancedStats({
        player_ids: [player.id],
        seasons: [season],
        per_page: numGames
      });

      if (!advancedStats || advancedStats.length === 0) {
        return {
          player: args.player_name,
          team: player.team?.full_name,
          games: [],
          message: 'No per-game advanced stats available'
        };
      }

      // Format each game's advanced stats
      const games = advancedStats.slice(0, numGames).map(g => ({
        date: g.game?.date,
        opponent: g.game?.home_team?.id === player.team?.id
          ? g.game?.visitor_team?.abbreviation
          : g.game?.home_team?.abbreviation,
        minutes: g.min,
        // Efficiency
        offensive_rating: g.off_rating || g.offensive_rating,
        defensive_rating: g.def_rating || g.defensive_rating,
        net_rating: g.net_rating,
        // Role
        usage_pct: g.usage_pct ? (g.usage_pct * 100).toFixed(1) + '%' : 'N/A',
        pie: g.pie ? (g.pie * 100).toFixed(1) + '%' : 'N/A',
        // Passing
        assist_pct: g.ast_pct ? (g.ast_pct * 100).toFixed(1) + '%' : 'N/A',
        assist_to_tov: g.ast_to_tov,
        // Rebounding
        reb_pct: g.reb_pct ? (g.reb_pct * 100).toFixed(1) + '%' : 'N/A',
        // Shooting
        ts_pct: g.ts_pct ? (g.ts_pct * 100).toFixed(1) + '%' : 'N/A',
        efg_pct: g.efg_pct ? (g.efg_pct * 100).toFixed(1) + '%' : 'N/A'
      }));

      // Calculate averages for the period
      const avgUsage = games.filter(g => g.usage_pct !== 'N/A')
        .reduce((sum, g) => sum + parseFloat(g.usage_pct), 0) / games.length;
      const avgNetRtg = games.filter(g => g.net_rating)
        .reduce((sum, g) => sum + g.net_rating, 0) / games.length;

      return {
        player: args.player_name,
        team: player.team?.full_name,
        games_analyzed: games.length,
        games,
        averages: {
          avg_usage_pct: avgUsage ? avgUsage.toFixed(1) + '%' : 'N/A',
          avg_net_rating: avgNetRtg ? avgNetRtg.toFixed(1) : 'N/A'
        },
        note: 'Per-game advanced stats show role consistency. High usage variance = unpredictable. Stable usage = reliable volume.'
      };
    } catch (e) {
      console.error(`    ❌ Error:`, e.message);
      return { error: e.message, player_name: args.player_name };
    }
  }

  // ============================================================================
  // SEARCH_PLAYER_CONTEXT - Common for all sports
  // ============================================================================
  if (functionName === 'search_player_context') {
    console.log(`  → [SEARCH_CONTEXT] "${args.query}"`);
    try {
      const result = await geminiGroundingSearch(args.query, { temperature: 1.0, maxTokens: 1500 });
      if (result?.success && result?.data) {
        return { query: args.query, context: result.data };
      }
      return { query: args.query, context: 'No results found' };
    } catch (e) {
      return { error: e.message, query: args.query };
    }
  }

  // ============================================================================
  // FINALIZE_PROPS - Handles both regular and NFL categorized format
  // ============================================================================
  if (functionName === 'finalize_props') {
    // Check if this is NFL categorized format (has regular_props, regular_td, etc.)
    if (args.regular_props || args.regular_td || args.value_td || args.first_td) {
      // NFL categorized format - combine all categories with metadata
      const allPicks = [];
      
      // Regular props (shortlist 5 → we take top 3)
      if (args.regular_props && Array.isArray(args.regular_props)) {
        args.regular_props.forEach(pick => {
          allPicks.push({ ...pick, category: 'regular_props' });
        });
      }
      
      // Regular TD (shortlist 4 → we take top 2, odds -200 to +200)
      if (args.regular_td && Array.isArray(args.regular_td)) {
        args.regular_td.forEach(pick => {
          allPicks.push({ ...pick, category: 'regular_td' });
        });
      }
      
      // Value TD (pick 1, odds +200 or higher)
      if (args.value_td && Array.isArray(args.value_td)) {
        args.value_td.forEach(pick => {
          allPicks.push({ ...pick, category: 'value_td' });
        });
      }
      
      // First TD (pick 1, lottery)
      if (args.first_td && Array.isArray(args.first_td)) {
        args.first_td.forEach(pick => {
          allPicks.push({ ...pick, category: 'first_td' });
        });
      }
      
      console.log(`[NFL Props] Categorized finalize: ${args.regular_props?.length || 0} regular, ${args.regular_td?.length || 0} regular TD, ${args.value_td?.length || 0} value TD, ${args.first_td?.length || 0} first TD`);
      
      return { 
        finalized: true, 
        picks: allPicks,
        categorized: true,
        categories: {
          regular_props: args.regular_props || [],
          regular_td: args.regular_td || [],
          value_td: args.value_td || [],
          first_td: args.first_td || []
        }
      };
    }
    
    // Standard format (non-NFL sports) - return picks as-is
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
/**
 * Pass through Gary's raw confidence without calibration
 * We want Gary to express his confidence freely (0.50-1.0 scale)
 * @param {number} rawConfidence - Gary's raw confidence
 * @returns {number} - Same confidence, just validated
 */
function calibrateConfidence(rawConfidence) {
  // No calibration - pass through Gary's confidence as-is
  // Just ensure it's in a valid range
  if (!rawConfidence || rawConfidence < 0.5) return 0.5;
  if (rawConfidence > 1.0) return 1.0;
  return rawConfidence;
}

/**
 * Apply 2-props-per-game constraint with player diversification
 * 
 * RULES:
 * 1. Maximum 2 props per game (can be from 2 different players)
 * 2. The 2 props should be from DIFFERENT players for diversification
 * 3. EXCEPTION: If 2 props on the same player are both elite AND positively correlated,
 *    a 3rd "Gary Special" pick can be added
 * 
 * @param {Array} picks - All validated picks
 * @param {string} gameId - The game identifier (e.g., "away_team @ home_team")
 * @returns {Object} - { constrainedPicks, droppedPicks, garySpecials }
 */
function applyPropsPerGameConstraint(picks, gameId) {
  if (!picks || picks.length === 0) {
    return { constrainedPicks: [], droppedPicks: [], garySpecials: [] };
  }
  
  // Group picks by GAME (using matchup field) - NOT by team!
  // This ensures 2 picks total per game across BOTH teams
  const picksByGame = {};
  
  for (const pick of picks) {
    // Use matchup to identify game (e.g., "Vegas Golden Knights @ Los Angeles Kings")
    const matchup = (pick.matchup || '').toLowerCase();
    if (!matchup) continue;
    
    if (!picksByGame[matchup]) {
      picksByGame[matchup] = [];
    }
    picksByGame[matchup].push(pick);
  }
  
  const constrainedPicks = [];
  const droppedPicks = [];
  const garySpecials = [];
  
  for (const matchup of Object.keys(picksByGame)) {
    const gamePicks = picksByGame[matchup];
    
    if (gamePicks.length <= 2) {
      // Already within constraint
      constrainedPicks.push(...gamePicks);
      continue;
    }
    
    // Sort by confidence (descending) to keep the best picks
    gamePicks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    // Group by player
    const picksByPlayer = {};
    for (const pick of gamePicks) {
      const player = (pick.player || '').toLowerCase();
      if (!picksByPlayer[player]) {
        picksByPlayer[player] = [];
      }
      picksByPlayer[player].push(pick);
    }
    
    const players = Object.keys(picksByPlayer);
    
    // Strategy: Pick best from 2 different players (diversification)
    if (players.length >= 2) {
      // Take the best pick from the top 2 players by confidence
      const playersByTopConfidence = players
        .map(p => ({ player: p, topConfidence: Math.max(...picksByPlayer[p].map(pk => pk.confidence || 0)) }))
        .sort((a, b) => b.topConfidence - a.topConfidence);
      
      const alphaPick = picksByPlayer[playersByTopConfidence[0].player][0]; // Best pick from best player
      const betaPick = picksByPlayer[playersByTopConfidence[1].player][0]; // Best pick from second player
      
      constrainedPicks.push(alphaPick, betaPick);
      
      // Check for Gary Special: If the alpha player has a 2nd elite pick that's correlated
      const alphaPicks = picksByPlayer[playersByTopConfidence[0].player];
      if (alphaPicks.length >= 2) {
        const secondPick = alphaPicks[1];
        
        // Check if it's elite (confidence >= 0.70) AND potentially correlated
        const isElite = (secondPick.confidence || 0) >= 0.70;
        const prop1 = (alphaPick.prop || '').toLowerCase();
        const prop2 = (secondPick.prop || '').toLowerCase();
        
        // Check for positive correlation (both benefit from same game flow)
        // e.g., Points + Assists (high usage game), Rushing + Receiving yards (workload), SOG + Points (PP1)
        const isCorrelated = checkPropCorrelation(prop1, prop2);
        
        if (isElite && isCorrelated) {
          console.log(`[Props Constraint] 🌟 Gary Special: Adding 3rd pick for ${secondPick.player} (${prop2} correlated with ${prop1})`);
          constrainedPicks.push({ ...secondPick, isGarySpecial: true });
          garySpecials.push(secondPick);
        } else {
          droppedPicks.push(secondPick);
        }
      }
      
      // Track dropped picks
      for (const player of players) {
        for (const pick of picksByPlayer[player]) {
          if (!constrainedPicks.includes(pick) && !garySpecials.includes(pick)) {
            droppedPicks.push(pick);
          }
        }
      }
    } else {
      // Only 1 player with multiple picks - take top 2 from that player
      const soloPlayerPicks = gamePicks.slice(0, 2);
      constrainedPicks.push(...soloPlayerPicks);
      
      // Check for Gary Special on 3rd pick
      if (gamePicks.length >= 3) {
        const thirdPick = gamePicks[2];
        const isElite = (thirdPick.confidence || 0) >= 0.70;
        const prop1 = (soloPlayerPicks[0].prop || '').toLowerCase();
        const prop3 = (thirdPick.prop || '').toLowerCase();
        const isCorrelated = checkPropCorrelation(prop1, prop3);
        
        if (isElite && isCorrelated) {
          console.log(`[Props Constraint] 🌟 Gary Special: Adding 3rd pick for ${thirdPick.player} (correlated props)`);
          constrainedPicks.push({ ...thirdPick, isGarySpecial: true });
          garySpecials.push(thirdPick);
        } else {
          droppedPicks.push(thirdPick);
        }
      }
      
      // Track remaining dropped picks
      for (let i = 3; i < gamePicks.length; i++) {
        if (!garySpecials.includes(gamePicks[i])) {
          droppedPicks.push(gamePicks[i]);
        }
      }
    }
  }
  
  if (droppedPicks.length > 0) {
    console.log(`[Props Constraint] Applied 2-per-game constraint: ${constrainedPicks.length} kept, ${droppedPicks.length} dropped, ${garySpecials.length} Gary Specials`);
  }
  
  return { constrainedPicks, droppedPicks, garySpecials };
}

/**
 * Check if two prop types are positively correlated
 * (both benefit from the same game script / player usage pattern)
 */
function checkPropCorrelation(prop1, prop2) {
  // Normalize prop names
  const normalize = (p) => p.replace(/[_\s]/g, '').toLowerCase();
  const p1 = normalize(prop1);
  const p2 = normalize(prop2);
  
  // Correlated prop pairs (both spike in same scenario)
  const correlatedPairs = [
    // NBA: High usage game
    ['pts', 'ast'],
    ['points', 'assists'],
    ['pts', 'pra'],
    ['points', 'pra'],
    
    // NBA: Inside game
    ['pts', 'reb'],
    ['points', 'rebounds'],
    
    // NFL: Workload
    ['rushyds', 'recyds'],
    ['rushingyards', 'receivingyards'],
    
    // NFL: Target hog
    ['receptions', 'recyds'],
    ['receptions', 'receivingyards'],
    
    // NHL: PP1 usage
    ['sog', 'points'],
    ['shots', 'points'],
    ['shotsongoal', 'points'],
    
    // NHL: Scorer
    ['goals', 'points'],
    ['goals', 'sog'],
    ['goals', 'shots']
  ];
  
  for (const [a, b] of correlatedPairs) {
    if ((p1.includes(a) && p2.includes(b)) || (p1.includes(b) && p2.includes(a))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check rationale quality for sharp betting standards
 * Returns warnings for generic or low-quality rationales
 */
function checkRationaleQuality(rationale, player) {
  const warnings = [];
  const rationaleLower = (rationale || '').toLowerCase();
  
  // BANNED GENERIC PHRASES - These signal lazy analysis or public betting mentality
  const bannedPhrases = [
    // Generic prediction language
    { phrase: 'should be able to', reason: 'Generic prediction language' },
    { phrase: 'look for him to', reason: 'Generic prediction language' },
    { phrase: 'i expect him to', reason: 'Generic prediction language' },
    { phrase: 'expect him to', reason: 'Generic prediction language' },
    { phrase: 'should hit', reason: 'Generic prediction language' },
    { phrase: 'should cash', reason: 'Generic prediction language' },
    // Gambling fallacies
    { phrase: "he's due", reason: 'Gambling fallacy' },
    { phrase: 'due for a big', reason: 'Gambling fallacy' },
    { phrase: 'due for regression', reason: 'Gambling fallacy' },
    // Public betting phrases
    { phrase: 'buy the dip', reason: 'Public betting phrase - not analysis' },
    { phrase: 'riding the hot hand', reason: 'Public betting phrase - not analysis' },
    { phrase: 'hot hand', reason: 'Public betting phrase - needs specific data' },
    { phrase: 'bounce back', reason: 'Needs specific mechanism for bounce back' },
    // Narrative fluff
    { phrase: 'firing on all cylinders', reason: 'Narrative fluff - not analysis' },
    { phrase: 'lead by example', reason: 'Narrative fluff - not analysis' },
    { phrase: 'big stage', reason: 'Narrative fluff - needs data' },
    { phrase: 'milestone game', reason: 'Narrative fluff - milestones dont affect performance' },
    { phrase: 'milestone', reason: 'Narrative fluff - milestones dont affect performance' },
    { phrase: 'revenge game', reason: 'Narrative - show the actual splits or drop it' },
    { phrase: 'primetime', reason: 'Narrative - needs actual primetime splits' },
    { phrase: 'loves playing', reason: 'Narrative - needs actual venue/opponent splits' },
    // Vague analysis
    { phrase: 'volume play', reason: 'Needs specific volume data' },
    { phrase: 'ceiling game', reason: 'Needs specific ceiling driver' },
    { phrase: 'good spot', reason: 'Needs specific reasoning' },
    { phrase: 'certified', reason: 'Hyperbole - not analysis' },
    { phrase: 'philly-killer', reason: 'One-game sample treated as pattern' },
    { phrase: '-killer', reason: 'One-game sample treated as pattern' },
  ];
  
  // VAGUE PHRASES that need specificity
  const vaguePatterns = [
    { pattern: /good matchup(?! against| vs| with \d)/i, reason: 'Says "good matchup" without specifics - needs defensive rank or yards allowed' },
    { pattern: /been hot(?! with \d| averaging| l[35])/i, reason: 'Says "been hot" without specifics - needs L3/L5 numbers' },
    { pattern: /favorable(?! \d| rank| allow)/i, reason: 'Says "favorable" without specifics - needs data backing' },
  ];
  
  // Check for banned phrases
  for (const { phrase, reason } of bannedPhrases) {
    if (rationaleLower.includes(phrase)) {
      warnings.push(`[${player}] Banned phrase detected: "${phrase}" - ${reason}`);
    }
  }
  
  // Check for vague patterns
  for (const { pattern, reason } of vaguePatterns) {
    if (pattern.test(rationaleLower)) {
      warnings.push(`[${player}] Vague language: ${reason}`);
    }
  }
  
  // Check for required elements (5-part structure)
  const hasLineAnalysis = rationaleLower.includes('line') || rationaleLower.includes('set at') || rationaleLower.includes('priced');
  const hasRisk = rationaleLower.includes('risk') || rationaleLower.includes('concern') || rationaleLower.includes('worry') || rationaleLower.includes('could go wrong');
  const hasGameScript = rationaleLower.includes('spread') || rationaleLower.includes('underdog') || rationaleLower.includes('favorite') || rationaleLower.includes('implied') || rationaleLower.includes('game script');
  
  if (!hasLineAnalysis) {
    warnings.push(`[${player}] Missing "why line is wrong" analysis`);
  }
  if (!hasRisk) {
    warnings.push(`[${player}] Missing risk acknowledgment`);
  }
  if (!hasGameScript) {
    warnings.push(`[${player}] Missing game script context (spread/total/implied)`);
  }
  
  return warnings;
}

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
    if (tool === 'fetch_player_season_stats' && result.season_stats) {
      const playerKey = result.player?.toLowerCase() || '';
      toolData.seasonStats[playerKey] = result.season_stats;
    }
    if (tool === 'search_player_context' && result.context) {
      toolData.searchContext.push(result.context);
    }
  }
  
  // Validate each pick's key_stats
  const validatedPicks = picks.map(pick => {
    const validatedKeyStats = [];
    const playerKey = pick.player?.toLowerCase() || '';
    const playerLastName = playerKey.split(' ').pop();
    
    // Check if THIS SPECIFIC PLAYER has tool data (not just if any data exists)
    const playerHasGameLogs = Object.keys(toolData.gameLogs).some(key => 
      key.includes(playerLastName) || playerLastName.includes(key.split(' ').pop())
    );
    const playerHasSeasonStats = Object.keys(toolData.seasonStats).some(key => 
      key.includes(playerLastName) || playerLastName.includes(key.split(' ').pop())
    );
    const playerHasToolData = playerHasGameLogs || playerHasSeasonStats;
    
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
      if (hasGameLogSource && !playerHasGameLogs) {
        warning = `Stat claims game_logs but no logs found for ${pick.player}`;
        isValid = false;
      }
      
      // If stat claims season_stats source, verify we have data
      if (hasSeasonSource && !playerHasSeasonStats) {
        warning = `Stat claims season_stats but no season data found for ${pick.player}`;
        isValid = false;
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
    
    // Calibrate confidence to realistic betting levels
    const originalConfidence = pick.confidence;
    let calibratedConfidence = calibrateConfidence(originalConfidence);
    
    // Check rationale quality for sharp betting standards
    const rationaleWarnings = checkRationaleQuality(pick.rationale, pick.player);
    if (rationaleWarnings.length > 0) {
      warnings.push(...rationaleWarnings);
    }
    
    // ════════════════════════════════════════════════════════════════════
    // CONFIDENCE ADJUSTMENTS BASED ON VALIDATION QUALITY
    // ════════════════════════════════════════════════════════════════════
    
    // RULE 1: No tool data for this player = MAX 0.65 confidence
    // Gary should not have high confidence without actual data to back it up
    if (!playerHasToolData) {
      const cappedConfidence = Math.min(calibratedConfidence, 0.65);
      if (cappedConfidence < calibratedConfidence) {
        warnings.push(`[${pick.player}] Confidence capped 0.65 (no tool data fetched for this player)`);
        calibratedConfidence = cappedConfidence;
      }
    }
    
    // RULE 2: Multiple rationale warnings = reduce confidence
    // Each warning reduces confidence by 0.03 (max reduction 0.15)
    const playerWarningCount = rationaleWarnings.length;
    if (playerWarningCount > 0) {
      const warningPenalty = Math.min(playerWarningCount * 0.03, 0.15);
      const penalizedConfidence = Math.max(calibratedConfidence - warningPenalty, 0.50);
      if (penalizedConfidence < calibratedConfidence) {
        calibratedConfidence = penalizedConfidence;
      }
    }
    
    return {
      ...pick,
      confidence: calibratedConfidence,
      _originalConfidence: originalConfidence, // Keep for debugging
      key_stats: validatedKeyStats,
      _validation: {
        hasToolData: playerHasToolData, // NOW PER-PLAYER, not global
        warningCount: rationaleWarnings.length,
        rationaleQuality: rationaleWarnings.length === 0 ? 'SHARP' : 'NEEDS_IMPROVEMENT',
        confidenceAdjusted: calibratedConfidence !== calibrateConfidence(originalConfidence)
      }
    };
  });
  
  // Log rationale quality summary
  const sharpCount = validatedPicks.filter(p => p._validation?.rationaleQuality === 'SHARP').length;
  const needsWorkCount = validatedPicks.filter(p => p._validation?.rationaleQuality === 'NEEDS_IMPROVEMENT').length;
  if (needsWorkCount > 0) {
    console.log(`[Props Validation] 📝 Rationale quality: ${sharpCount} sharp, ${needsWorkCount} need improvement`);
  }
  
  return { validatedPicks, warnings, invalidStats };
}

/**
 * Build the GAME STEEL MAN message for props - Team A vs Team B analysis
 * Gary understands how the GAME will play out before deciding which props benefit.
 * This mirrors game picks Steel Man cases but focuses on game flow for prop selection.
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {object} gameSummary - Game context (spread, totals, etc.)
 * @param {string} sportLabel - Sport identifier
 * @returns {string} - The Game Steel Man prompt
 */
function buildGameSteelManForProps(homeTeam, awayTeam, gameSummary, sportLabel = 'NFL') {
  const spread = gameSummary?.spread || 0;
  const total = gameSummary?.total || 0;
  const homeImplied = gameSummary?.gameScript?.impliedTotals?.home || Math.round((total - spread) / 2);
  const awayImplied = gameSummary?.gameScript?.impliedTotals?.away || Math.round((total + spread) / 2);

  return `## GAME STEEL MAN - UNDERSTAND THE GAME BEFORE PICKING PROPS

Before you pick ANY props, you need to understand HOW this game will play out.
Build Steel Man cases for BOTH teams. This tells you which players benefit.

**${awayTeam} @ ${homeTeam}**
Spread: ${homeTeam} ${spread > 0 ? '+' : ''}${spread} | Total: ${total}
Implied Points: ${awayTeam} ${awayImplied} | ${homeTeam} ${homeImplied}

---

## WRITE YOUR GAME ANALYSIS

**CASE FOR ${homeTeam} (Home Team):**
Write 2-3 paragraphs explaining:
- What is ${homeTeam}'s path to winning/covering? What strengths show up?
- How does ${homeTeam} attack ${awayTeam}'s weaknesses?
- What's the game script if ${homeTeam} is winning? (Who gets volume? Who rests?)

**CASE FOR ${awayTeam} (Away Team):**
Write 2-3 paragraphs explaining:
- What is ${awayTeam}'s path to winning/covering? What strengths show up?
- How does ${awayTeam} attack ${homeTeam}'s weaknesses?
- What's the game script if ${awayTeam} is winning? (Who gets volume? Who rests?)

**YOUR GAME READ:**
After writing both cases, state YOUR belief about how this game plays out:
- Which team's strengths are more likely to show up tonight?
- Is this a blowout, close game, or shootout?
- What's the expected game flow? (Early lead? Comeback? Back-and-forth?)

---

## WHY THIS MATTERS FOR PROPS

Your game read tells you which props benefit:
- If you expect ${homeTeam} to dominate → ${homeTeam} players get more opportunity, ${awayTeam} may chase
- If you expect ${awayTeam} to control → ${awayTeam} players get more opportunity
- If you expect a shootout → Passing props benefit, game stays close
- If you expect a blowout → Starters may rest, garbage time distorts stats
- If you expect a close game → Stars play full minutes, crunch time usage matters

**DO NOT SKIP THIS STEP.** Your prop picks should FLOW from your game analysis.
A prop pick that contradicts your game read is a prop pick without conviction.

---

Write your Game Steel Man analysis now. NO tool calls - text analysis only.`;
}

/**
 * Build the PROP INVESTIGATION message - Player stats based on game read
 * After Gary understands the game, he investigates players who benefit from his read.
 *
 * @param {string} gameRead - Gary's game analysis/read
 * @param {Array} propCandidates - Available prop candidates
 * @param {string} sportLabel - Sport identifier
 * @returns {string} - The Prop Investigation prompt
 */
function buildPropInvestigationMessage(gameRead, propCandidates, sportLabel = 'NFL') {
  const candidateList = propCandidates.slice(0, 10).map((p, i) =>
    `${i + 1}. ${p.player} (${p.team}) - ${p.props?.map(pr => `${pr.type} ${pr.line}`).join(', ') || 'Available'}`
  ).join('\n');

  return `## PROP INVESTIGATION - FIND PLAYERS WHO BENEFIT FROM YOUR GAME READ

You've completed your Game Steel Man analysis. Now investigate which players benefit.

**YOUR GAME READ:**
${gameRead.substring(0, 2000)}

---

**AVAILABLE PROP CANDIDATES:**
${candidateList}

---

## YOUR TASK

Based on your game read, identify 4-6 players who benefit most from the game script you expect.

For each player you're interested in, call the BDL tools to investigate:
- \`fetch_player_game_logs\` - Recent performance (L5-10 games)
- \`fetch_player_season_stats\` - Season averages
- \`fetch_player_vs_opponent\` - How they perform vs this opponent

**INVESTIGATION QUESTIONS:**
1. Which players benefit from YOUR expected game script?
2. Do their recent numbers support the props available?
3. Is there a mismatch the line hasn't captured?

**AFTER INVESTIGATION:**
Pick your 2 BEST props that:
- Align with your game read
- Have statistical support from your investigation
- Show a clear edge (not just "average beats line")

Call the BDL tools NOW to investigate your top candidates.`;
}

/**
 * Build the PASS 2 message for props - Steel Man Bilateral Analysis (LEGACY - kept for backwards compatibility)
 * This is now secondary to the Game Steel Man approach but kept for fallback.
 *
 * @param {Array} candidates - The shortlisted prop candidates to analyze
 * @param {string} sportLabel - Sport identifier
 * @returns {string} - The Pass 2 Steel Man prompt
 */
function buildPropsPass2SteelManMessage(candidates, sportLabel = 'NFL') {
  // GEMINI 3 OPTIMIZED: Simple, direct prompts work best
  // "Gemini 3 responds best to direct, clear instructions. It may over-analyze
  // verbose or overly complex prompt engineering techniques."
  // "By default, Gemini 3 is less verbose - you must explicitly request detailed output"

  const candidateList = candidates.slice(0, 5).map((p, i) =>
    `${i + 1}. ${p.player} - ${p.props?.map(pr => `${pr.type} ${pr.line}`).join(', ') || 'TBD'}`
  ).join('\n');

  return `STOP. Write detailed bilateral analysis before finalizing.

YOUR CANDIDATES:
${candidateList}

REQUIRED OUTPUT FORMAT - Write this for each candidate:

**[PLAYER NAME] - [PROP] [LINE]**

CASE FOR OVER:
[Write 3-4 detailed sentences. Explain the specific mechanism that pushes production ABOVE the line tonight. Not "his average is higher" - that's why the line exists. What's DIFFERENT tonight?]

CASE FOR UNDER:
[Write 3-4 detailed sentences. Explain the genuine risk. Not "he might play badly" - be specific. What caps his ceiling? Blowout? Matchup? Usage change?]

VERDICT: [OVER/UNDER/PASS] because [one sentence explaining which case is stronger]

---

IMPORTANT:
- Write THOROUGH analysis (this is required, not optional)
- Be SPECIFIC with numbers and mechanisms
- The UNDER case must be GENUINE, not filler
- If both cases are equally strong, PASS on that prop

DO NOT call any tools. Write text analysis only. Start with ${candidates[0]?.player || 'your first candidate'}.`;
}

/**
 * Build the PASS 2.5 message for props - Steel Man GRADING & Conviction Assessment
 * Now includes Sharp Reference for grading the Steel Man cases.
 * This forces Gary to evaluate each prop's edge potential using sharp principles.
 * 
 * @param {Array} picks - The shortlisted picks Gary wants to finalize
 * @param {string} sportLabel - Sport identifier
 * @returns {string} - The Pass 2.5 prompt
 */
function buildPropsPass25Message(picks, sportLabel = 'NFL') {
  // Load the Sharp Reference for grading (sport-specific)
  const sharpReference = getSteelManGradingReference(sportLabel);
  
  const pickSummary = picks.map((p, i) => 
    `${i + 1}. ${p.player} ${p.bet?.toUpperCase() || 'OVER'} ${p.prop || p.prop_type} ${p.line} @ ${p.odds}`
  ).join('\n');

  return `
══════════════════════════════════════════════════════════════════════
## PASS 2.5 - STEEL MAN GRADING & CONVICTION ASSESSMENT

You've built Steel Man cases for both sides of your prop candidates.
Now you must GRADE those cases using sharp betting principles.

**YOUR PICKS TO GRADE:**
${pickSummary}

---

${sharpReference}

---

## STEP 1: GRADE YOUR STEEL MAN CASES

For each prop you analyzed in Pass 2, apply the sharp principles above:

**CASE QUALITY CHECK:**
1. Did your OVER case explain something the line might MISS, or just describe public info?
2. Did your UNDER case identify a specific mechanism, or just say "maybe it won't happen"?
3. Which case has the stronger STRUCTURAL foundation?
4. Which case relies on FRESH factors vs just baseline stats?

**TRAP LOGIC CHECK:**
- Did you use "his average beats the line" as your main argument? = WEAK (market has this)
- Did you cite one previous game result? = WEAK (one game is noise)
- Did you identify a specific mechanism the line hasn't captured? = STRONG

---

## STEP 2: RATE EDGE POTENTIAL (1-10)

For each prop, rate based on how strongly your winning case beats the opposing case:

| Rating | Meaning |
|--------|---------|
| 8-10 | Clear structural edge, weak counter-case, fresh factor |
| 6-7 | Good edge, counter-case has some merit but yours is stronger |
| 5 | Slight lean, could go either way |
| 1-4 | Counter-case is equally strong or stronger - NO EDGE |

**THE "TOO EASY" TEST:**
> "Could I explain this pick in 30 seconds to a casual fan?"
> If YES, the market already knows it. Rate 4 or lower.

---

## STEP 3: IDENTIFY WHAT KILLS EACH PICK

For each prop you're keeping, name the SPECIFIC scenario where it loses:

[GOOD] "Risk: If game becomes a blowout (spread is -12), he sits in Q4 with 28 minutes instead of 34"
[WEAK] "Risk: He might not play well"

---

## OUTPUT FORMAT (strict JSON):

\`\`\`json
{
  "case_grades": [
    {
      "player": "Player Name",
      "prop": "prop_type line",
      "over_case_grade": "STRONG/MEDIUM/WEAK",
      "under_case_grade": "STRONG/MEDIUM/WEAK",
      "winning_case": "OVER/UNDER",
      "trap_logic_detected": false,
      "fresh_factor_identified": "Specific fresh factor or null"
    }
  ],
  "conviction_ratings": [
    {
      "player": "Player Name",
      "prop": "prop_type line",
      "edge_rating": 7,
      "edge_type": "USAGE_SHIFT",
      "what_line_misses": "Specific factor the book may not have priced",
      "kill_scenario": "Specific game script where this loses",
      "keep_pick": true
    }
  ],
  "overall_slate_conviction": "HIGH/MEDIUM/LOW",
  "drops": ["Player Name - reason (e.g., trap logic, weak case, equally strong counter)"],
  "final_count": 3
}
\`\`\`

---

## GRADING RULES:

1. **Grade EVERY prop** you analyzed in Pass 2
2. **DROP picks with edge_rating below 5** - the counter-case is too strong
3. **DROP picks where you detected trap logic** - "average beats line" is not edge
4. **Be HONEST** - if both cases are equally strong, that's edge_rating = 4-5, not a pick

**After grading, call finalize_props with ONLY the picks rated 6+ with no trap logic.**
`.trim();
}

/**
 * Parse Gary's Props Pass 2.5 conviction ratings
 * ROBUST VERSION: Multiple fallback extraction methods for malformed Gemini output
 * @param {string} content - Gary's response content
 * @returns {object|null} - Parsed ratings or null
 */
function parsePropsPass25Ratings(content) {
  if (!content) return null;
  
  /**
   * Helper: Clean and sanitize JSON string for parsing
   */
  const sanitizeJson = (str) => {
    return str
      .replace(/[\x00-\x1F\x7F]/g, ' ')  // Remove control chars
      .replace(/,\s*}/g, '}')            // Fix trailing commas in objects
      .replace(/,\s*]/g, ']')            // Fix trailing commas in arrays
      .replace(/\n/g, ' ')               // Normalize newlines
      .replace(/\r/g, '')                // Remove carriage returns
      .trim();
  };
  
  /**
   * Helper: Format successful parse result
   */
  const formatResult = (parsed) => {
    const ratings = parsed.conviction_ratings || [];
    return {
      ratings,
      slateConviction: parsed.overall_slate_conviction || 'MEDIUM',
      drops: parsed.drops || ratings
        .filter(r => r.keep_pick === false || r.edge_rating < 5)
        .map(r => `${r.player} - ${r.drop_reason || 'edge rating ' + r.edge_rating}`),
      finalCount: parsed.final_count || ratings.filter(r => r.keep_pick !== false && r.edge_rating >= 5).length
    };
  };
  
  // ══════════════════════════════════════════════════════════════════
  // ATTEMPT 1: Standard JSON code block (most reliable)
  // ══════════════════════════════════════════════════════════════════
  try {
    const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      const jsonStr = sanitizeJson(jsonBlockMatch[1]);
      const parsed = JSON.parse(jsonStr);
      if (parsed.conviction_ratings) {
        console.log(`[Props Pass 2.5] ✓ Parsed via JSON code block`);
        return formatResult(parsed);
      }
    }
  } catch (e) {
    console.log(`[Props Pass 2.5] JSON block parse attempt failed: ${e.message.slice(0, 60)}`);
  }
  
  // ══════════════════════════════════════════════════════════════════
  // ATTEMPT 2: Raw JSON object with conviction_ratings
  // ══════════════════════════════════════════════════════════════════
  try {
    // More specific regex that captures the full object
    const rawJsonMatch = content.match(/\{\s*"conviction_ratings"\s*:\s*\[[\s\S]*?\]\s*[,}]/);
    if (rawJsonMatch) {
      // Complete the object if it was truncated
      let jsonStr = rawJsonMatch[0];
      if (!jsonStr.endsWith('}')) {
        jsonStr = jsonStr.slice(0, -1) + '}'; // Replace trailing comma with closing brace
      }
      const parsed = JSON.parse(sanitizeJson(jsonStr));
      if (parsed.conviction_ratings) {
        console.log(`[Props Pass 2.5] ✓ Parsed via raw JSON extraction`);
        return formatResult(parsed);
      }
    }
  } catch (e) {
    console.log(`[Props Pass 2.5] Raw JSON parse attempt failed: ${e.message.slice(0, 60)}`);
  }
  
  // ══════════════════════════════════════════════════════════════════
  // ATTEMPT 3: Extract individual ratings via regex patterns (fallback)
  // ══════════════════════════════════════════════════════════════════
  try {
    const ratings = [];
    
    // Pattern 1: "Player Name": X/10 (EDGE_TYPE)
    const pattern1 = content.matchAll(/["']?([A-Za-z][A-Za-z\s.'-]{2,30})["']?\s*[:\-]\s*(\d+)\s*\/\s*10\s*\(([A-Z_]+)\)/gi);
    for (const match of pattern1) {
      if (!ratings.find(r => r.player === match[1].trim())) {
        ratings.push({
          player: match[1].trim(),
          edge_rating: parseInt(match[2]),
          edge_type: match[3].trim().toUpperCase(),
          keep_pick: parseInt(match[2]) >= 5
        });
      }
    }
    
    // Pattern 2: player: "Name", edge_rating: X
    const pattern2 = content.matchAll(/"player"\s*:\s*"([^"]+)"[^}]*"edge_rating"\s*:\s*(\d+)/gi);
    for (const match of pattern2) {
      if (!ratings.find(r => r.player === match[1].trim())) {
        ratings.push({
          player: match[1].trim(),
          edge_rating: parseInt(match[2]),
          edge_type: 'UNKNOWN',
          keep_pick: parseInt(match[2]) >= 5
        });
      }
    }
    
    // Pattern 3: ✓/✗ PlayerName: X/10
    const pattern3 = content.matchAll(/[✓✗]\s*([A-Za-z][A-Za-z\s.'-]{2,30}):\s*(\d+)\/10/gi);
    for (const match of pattern3) {
      if (!ratings.find(r => r.player === match[1].trim())) {
        ratings.push({
          player: match[1].trim(),
          edge_rating: parseInt(match[2]),
          edge_type: 'UNKNOWN',
          keep_pick: parseInt(match[2]) >= 5
        });
      }
    }
    
    if (ratings.length > 0) {
      console.log(`[Props Pass 2.5] ✓ Extracted ${ratings.length} ratings via regex fallback`);
      return {
        ratings,
        slateConviction: 'MEDIUM',
        drops: ratings.filter(r => r.edge_rating < 5).map(r => `${r.player} - edge rating ${r.edge_rating}`),
        finalCount: ratings.filter(r => r.edge_rating >= 5).length
      };
    }
  } catch (e) {
    console.log(`[Props Pass 2.5] Regex fallback failed: ${e.message.slice(0, 60)}`);
  }
  
  // ══════════════════════════════════════════════════════════════════
  // ATTEMPT 4: Extract slate conviction even if ratings failed
  // ══════════════════════════════════════════════════════════════════
  try {
    const convictionMatch = content.match(/slate.*conviction[:\s]*(HIGH|MEDIUM|LOW)/i) ||
                           content.match(/overall.*conviction[:\s]*(HIGH|MEDIUM|LOW)/i);
    if (convictionMatch) {
      console.log(`[Props Pass 2.5] ⚠️ Found conviction (${convictionMatch[1]}) but no parseable ratings`);
      // Return minimal result so we don't block the flow
      return {
        ratings: [],
        slateConviction: convictionMatch[1].toUpperCase(),
        drops: [],
        finalCount: 0
      };
    }
  } catch {}
  
  console.log(`[Props Pass 2.5] ✗ All parsing attempts failed`);
  return null;
}

/**
 * Run full iteration loop for props using PERSISTENT chat session
 * The chat session manages its own history, avoiding thoughtSignature issues
 */
async function runPropsIterationLoop({ systemPrompt, userMessage, sportKey, sportLabel = 'NFL', maxIterations = 12, regularOnly = false, validatedPlayerNames = null }) {
  const gemini = getGeminiForProps();
  
  // Get sport-specific tools
  // regularOnly=true for NFL uses non-TD tools (when TDs are handled separately)
  const sportTools = getPropsToolsForSport(sportLabel, regularOnly);
  const functionDeclarations = convertToolsForGemini(sportTools);
  const toolMode = regularOnly && sportLabel === 'NFL' ? '(regular props only - no TDs)' : '';
  console.log(`[Props] Using ${sportLabel} tools ${toolMode}: ${sportTools.map(t => t.function.name).join(', ')}`);
  
  // Get the right model for this sport (Pro for NFL, Flash for others)
  const propsModel = getPropsModelForSport(sportLabel);
  
  // Create model with tools
  // GEMINI 3 FLASH SETTINGS FOR PROPS (Updated per Google best practices):
  // - temperature: 1.0 (Google's recommended default - lower causes looping/degraded math)
  // - thinkingLevel: "low" for tool dispatch (~5-8s) - pure pattern matching, minimal thinking
  // - Reasoning phases (Pass 2, Pass 2.5) use separate high-thinking calls
  const model = gemini.getGenerativeModel({
    model: propsModel,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    tools: [{ functionDeclarations }],
    generationConfig: {
      temperature: 1.0, // Gemini 3 optimized default - DO NOT lower (causes looping on math tasks)
      topP: 0.95,
      maxOutputTokens: 8000,
      // Gemini 3 thinkingConfig - use thinkingLevel (replaces legacy thinkingBudget)
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'low' // "low" = fast tool dispatch, pattern matching (~5-8s)
      }
    }
  });
  
  // Create HIGH-THINKING model for reasoning phases (Pass 2 Steel Man, Pass 2.5 Conviction)
  // This uses "high" thinking for deep reasoning on pick analysis
  const reasoningModel = gemini.getGenerativeModel({
    model: propsModel,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: 1.0,
      topP: 0.95,
      maxOutputTokens: 8000,
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'high' // "high" = deep reasoning for bilateral analysis
      }
    }
  });

  // Create PERSISTENT chat session with system instruction
  const chat = model.startChat({
    systemInstruction: { parts: [{ text: systemPrompt }] }
  });

  let iteration = 0;
  const toolCallHistory = [];
  let didDirectionBalanceCheck = false;
  // GAME STEEL MAN tracking - Gary must understand the game BEFORE picking props
  let didInjectGameSteelMan = false;    // Track if Game Steel Man message was SENT
  let didCompleteGameSteelMan = false;  // Track if Gary COMPLETED game analysis (Team A vs Team B cases)
  let gameSteelManText = '';            // Store Gary's game analysis for prop investigation
  // PROP INVESTIGATION tracking - After game read, Gary investigates players
  let didInjectPropInvestigation = false; // Track if Prop Investigation message was SENT
  let didCompletePropInvestigation = false; // Track if Gary investigated players (tool calls for stats)
  let gameSteelManBypassAttempts = 0;   // Track how many times Gary tried to bypass game analysis
  let consecutiveEmptyResponses = 0; // Track consecutive empty responses
  let propCandidatesForInvestigation = []; // Store candidates for player investigation

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
        const args = fc.functionCall.args || {};
        
        // Handle NFL categorized format (regular_props, regular_td, value_td, first_td)
        // vs standard format (picks array)
        let picks = [];
        let isCategorized = false;
        if (args.regular_props || args.regular_td || args.value_td || args.first_td) {
          // NFL categorized format - combine all categories
          isCategorized = true;
          if (Array.isArray(args.regular_props)) picks.push(...args.regular_props.map(p => ({ ...p, category: 'regular_props' })));
          if (Array.isArray(args.regular_td)) picks.push(...args.regular_td.map(p => ({ ...p, category: 'regular_td' })));
          if (Array.isArray(args.value_td)) picks.push(...args.value_td.map(p => ({ ...p, category: 'value_td' })));
          if (Array.isArray(args.first_td)) picks.push(...args.first_td.map(p => ({ ...p, category: 'first_td' })));
          console.log(`[Props] ✓ NFL Categorized: ${args.regular_props?.length || 0} regular, ${args.regular_td?.length || 0} regular TD, ${args.value_td?.length || 0} value TD, ${args.first_td?.length || 0} first TD = ${picks.length} total`);
        } else {
          // Standard format
          picks = args.picks || [];
          console.log(`[Props] ✓ Gary finalized ${picks.length} picks`);
        }

        // ══════════════════════════════════════════════════════════════════
        // GAME STEEL MAN ENFORCEMENT - HARD GATE, NO BYPASS ALLOWED
        // Props flow from understanding the GAME. Gary MUST analyze the game first.
        // ══════════════════════════════════════════════════════════════════

        // Extract team names from userMessage context for detection
        // Look for patterns like "Team @ Team" or team-specific case markers
        const combinedText = textParts.join('');

        // Check if Gary wrote Game Steel Man analysis WITH the finalize_props call
        // Look for game-level analysis (CASE FOR [TEAM], game read, etc.)
        if (!didCompleteGameSteelMan && textParts.length > 0 && combinedText.length > 300) {
          const textLower = combinedText.toLowerCase();
          // Detect game-level Steel Man (Team vs Team analysis)
          const hasTeamCase = textLower.includes('case for') && !textLower.includes('case for over') && !textLower.includes('case for under');
          const hasGameRead = textLower.includes('game read') || textLower.includes('game script') || textLower.includes('expect the game') || textLower.includes('game flow');
          const hasTeamAnalysis = textLower.includes('path to winning') || textLower.includes('path to covering') || textLower.includes('how they win') || textLower.includes('strengths show up');
          const hasBlowoutShootout = textLower.includes('blowout') || textLower.includes('shootout') || textLower.includes('close game');

          if ((hasTeamCase || hasGameRead || hasTeamAnalysis) && hasBlowoutShootout) {
            console.log(`[Props] ✓ Game Steel Man detected WITH finalize_props call`);
            console.log(`[Props] GARY'S GAME ANALYSIS:`);
            console.log(`════════════════════════════════════════════════════════════════`);
            console.log(combinedText.substring(0, 2000));
            console.log(`════════════════════════════════════════════════════════════════`);
            didCompleteGameSteelMan = true;
            gameSteelManText = combinedText;
          }
        }

        if (!didCompleteGameSteelMan && Array.isArray(picks) && picks.length > 0) {
          // Track bypass attempts
          gameSteelManBypassAttempts++;

          // NO BYPASS - Gary MUST complete Game Steel Man analysis first
          if (!didInjectGameSteelMan) {
            // First time - inject Game Steel Man requirements
            didInjectGameSteelMan = true;
            console.log(`[Props] REJECTED - Gary tried to finalize without GAME ANALYSIS`);

            iteration++;
            console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (GAME STEEL MAN REQUIRED) [HIGH THINKING]`);

            // Extract team names from the userMessage (look for @ pattern)
            const matchMatch = userMessage.match(/"matchup":\s*"([^"]+)\s*@\s*([^"]+)"/);
            const awayTeam = matchMatch?.[1] || 'Away Team';
            const homeTeam = matchMatch?.[2] || 'Home Team';

            // Use HIGH-THINKING reasoningModel for Game Steel Man
            const gameSteelManMessage = buildGameSteelManForProps(homeTeam, awayTeam, {}, sportLabel);
            const gameSteelManResult = await reasoningModel.generateContent(gameSteelManMessage);
            const gameSteelManResponse = gameSteelManResult.response;
            gameSteelManText = gameSteelManResponse.text() || '';

            if (gameSteelManText.length > 100) {
              console.log(`[Props] HIGH-THINKING Game Steel Man (${gameSteelManText.length} chars)`);
              console.log(`[Props] GAME ANALYSIS:`);
              console.log(`════════════════════════════════════════════════════════════════`);
              console.log(gameSteelManText.substring(0, 1500));
              console.log(`════════════════════════════════════════════════════════════════`);
            }

            didCompleteGameSteelMan = true;

            // Inject the game analysis back into chat and ask for prop investigation
            result = await chat.sendMessage(`GAME STEEL MAN COMPLETE:\n\n${gameSteelManText}\n\nBased on this game analysis, now INVESTIGATE the players who benefit from your game read. Call BDL tools for 4-6 players, then finalize_props with your 2 best picks that FLOW from your game analysis.`);
            response = result.response;
            continue;
          } else {
            // Already injected but Gary tried again without proper investigation
            console.log(`[Props] BLOCKED (attempt ${gameSteelManBypassAttempts}) - Need player investigation based on game read`);
            iteration++;

            const reminderMessage = `Your game analysis is complete. Now:

1. INVESTIGATE players who benefit from your game read (call BDL tools for 4-6 players)
2. Pick 2 props that FLOW from your game analysis

Which players benefit from the game script you expect? Call fetch_player_game_logs or fetch_player_season_stats for those players.`;

            result = await chat.sendMessage(reminderMessage);
            response = result.response;
            continue;
          }
        }

        // ══════════════════════════════════════════════════════════════════
        // PROP COUNT ENFORCEMENT - Only accept 2 props per game (quality over quantity)
        // ══════════════════════════════════════════════════════════════════
        if (didCompleteGameSteelMan && Array.isArray(picks) && picks.length > 2) {
          console.log(`[Props] Gary submitted ${picks.length} picks - trimming to top 2 by confidence`);
          // Sort by confidence and take top 2
          picks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
          picks = picks.slice(0, 2);
          console.log(`[Props] Kept: ${picks.map(p => `${p.player} ${p.prop}`).join(', ')}`);
        }

        // NOTE: We removed the Pass 2.5 grading phase since props now flow from game analysis
        // The game Steel Man IS the reasoning phase - no separate grading needed

        // Direction balance check: if Gary returns ALL overs/ALL unders,
        // log a warning but ACCEPT the picks - don't block on this
        // Sharp bettors often have slate-wide directional leans based on market conditions
        if (!didDirectionBalanceCheck && Array.isArray(picks) && picks.length > 0) {
          const normalizedBets = picks
            .map(p => (p?.bet || '').toString().trim().toLowerCase())
            .filter(b => b === 'over' || b === 'under');

          const uniqueDirections = new Set(normalizedBets);
          const isAllOneSide = normalizedBets.length === picks.length && uniqueDirections.size === 1;

          if (isAllOneSide) {
            didDirectionBalanceCheck = true;
            const onlySide = normalizedBets[0];
            console.log(`[Props] ℹ️ All picks are "${onlySide}" - accepting (sharp slates often lean one way)`);
            // Don't block - proceed with validation and return picks
          }
        }
        
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
        
        // CRITICAL: Filter out picks for players NOT on valid teams (per BDL verification)
        // This catches stale Odds API data (e.g., Deebo Samuel listed as 49er when he's on Commanders)
        let finalPicks = validatedPicks;
        if (validatedPlayerNames && validatedPlayerNames.size > 0) {
          const beforeCount = finalPicks.length;
          finalPicks = finalPicks.filter(pick => {
            const playerKey = (pick.player || '').toLowerCase();
            const isValid = validatedPlayerNames.has(playerKey);
            if (!isValid) {
              console.log(`[Props Validation] ❌ REJECTED: ${pick.player} - not verified on either team (stale roster data)`);
            }
            return isValid;
          });
          if (finalPicks.length < beforeCount) {
            console.log(`[Props Validation] Filtered ${beforeCount - finalPicks.length} pick(s) with invalid team assignments`);
          }
        }
        
        // Apply 2-props-per-game constraint with player diversification
        // NOTE: Constraint is applied LATER (after matchup field is added) for ALL sports
        // This ensures we can properly group picks by game across both teams
        // NFL categorization (regular_props, regular_td, value_td, first_td) happens post-iteration
        
        // Return picks directly - constraint and categorization happen in post-processing
        return { 
          picks: finalPicks, 
          iterations: iteration, 
          toolCalls: toolCallHistory.length, 
          warnings, 
          categorized: isCategorized,
          droppedByConstraint: 0,
          garySpecials: 0
        };
      }
    }

    // Handle other tool calls
    if (functionCallParts.length > 0) {
      // ══════════════════════════════════════════════════════════════════
      // NEW GAME STEEL MAN FLOW:
      // 1. Game Steel Man first (Team A vs Team B)
      // 2. Then prop investigation (call stats for players who benefit from game read)
      // 3. Then finalize with 2 props that flow from game analysis
      // ══════════════════════════════════════════════════════════════════

      // Check if Gary wrote Game Steel Man analysis WITH tool calls
      if (!didCompleteGameSteelMan && textParts.length > 0) {
        const combinedText = textParts.join('');
        if (combinedText.length > 300) {
          const textLower = combinedText.toLowerCase();
          const hasTeamCase = textLower.includes('case for') && !textLower.includes('case for over') && !textLower.includes('case for under');
          const hasGameRead = textLower.includes('game read') || textLower.includes('game script') || textLower.includes('expect the game');
          const hasBlowoutShootout = textLower.includes('blowout') || textLower.includes('shootout') || textLower.includes('close game');

          if ((hasTeamCase || hasGameRead) && hasBlowoutShootout) {
            console.log(`[Props] ✓ Game Steel Man detected WITH tool call`);
            didCompleteGameSteelMan = true;
            gameSteelManText = combinedText;
          }
        }
      }

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

      // Track prop investigation progress (players with stats fetched)
      if (!didCompletePropInvestigation) {
        const playersWithStats = new Set();
        for (const { tool, result: toolResult } of toolCallHistory) {
          if ((tool === 'fetch_player_game_logs' || tool === 'fetch_player_season_stats') && toolResult?.player) {
            playersWithStats.add(toolResult.player);
          }
        }
        if (playersWithStats.size >= 3) {
          didCompletePropInvestigation = true;
          console.log(`[Props] ✓ Prop investigation complete: ${playersWithStats.size} players investigated`);
        }
      }

      // Send all function responses at once to continue the chat
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations}`);
      result = await chat.sendMessage(functionResponses);
      response = result.response;

      // ══════════════════════════════════════════════════════════════════
      // GAME STEEL MAN INJECTION - After initial tool calls, before prop finalization
      // Forces Gary to understand the GAME before picking props
      // ══════════════════════════════════════════════════════════════════
      if (!didInjectGameSteelMan && toolCallHistory.length >= 2 && iteration >= 2 && iteration < maxIterations - 3) {
        didInjectGameSteelMan = true;

        // Extract team names from the userMessage
        const matchMatch = userMessage.match(/"matchup":\s*"([^"]+)\s*@\s*([^"]+)"/);
        const awayTeam = matchMatch?.[1] || 'Away Team';
        const homeTeam = matchMatch?.[2] || 'Home Team';

        console.log(`[Props] Injecting GAME STEEL MAN for ${awayTeam} @ ${homeTeam}...`);
        iteration++;
        console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (GAME STEEL MAN) [HIGH THINKING]`);

        // Use HIGH-THINKING reasoningModel for Game Steel Man
        const gameSteelManMessage = buildGameSteelManForProps(homeTeam, awayTeam, {}, sportLabel);
        const gameSteelManResult = await reasoningModel.generateContent(gameSteelManMessage);
        const gameSteelManResponse = gameSteelManResult.response;
        gameSteelManText = gameSteelManResponse.text() || '';

        if (gameSteelManText.length > 100) {
          console.log(`[Props] HIGH-THINKING Game Steel Man (${gameSteelManText.length} chars)`);
        }

        didCompleteGameSteelMan = true;

        // Inject the game analysis and prompt for prop investigation
        result = await chat.sendMessage(`GAME STEEL MAN COMPLETE:\n\n${gameSteelManText}\n\nBased on this game analysis, now call BDL tools to investigate 4-6 players who BENEFIT from your game read. Then finalize_props with your 2 best picks that FLOW from your game analysis.`);
        response = result.response;
        continue;
      }

      // Add urgency nudge on later iterations
      if (iteration >= maxIterations - 2) {
        console.log(`[Props] Sending finalization nudge...`);
        const nudgeMessage = didCompleteGameSteelMan
          ? `TIME CHECK: You have ${maxIterations - iteration} rounds left.

Based on your game analysis, finalize_props with your 2 best props that flow from your game read.`
          : `TIME CHECK: You have ${maxIterations - iteration} rounds left.

Complete your Game Steel Man analysis (how will this game play out?), then pick 2 props that benefit from that game script.`;
        result = await chat.sendMessage(nudgeMessage);
        response = result.response;
      }
      continue;
    }

    // Check for picks in text response (fallback)
    const textContent = textParts.join('');

    // ══════════════════════════════════════════════════════════════════
    // GAME STEEL MAN COMPLETION DETECTION
    // Gary must understand the GAME (Team A vs Team B) before picking props
    // ══════════════════════════════════════════════════════════════════
    if (!didCompleteGameSteelMan && textContent && textContent.length > 300) {
      const textLower = textContent.toLowerCase();

      // Detect game-level Steel Man analysis (Team vs Team, not Over vs Under)
      const hasTeamCase = textLower.includes('case for') && !textLower.includes('case for over') && !textLower.includes('case for under');
      const hasGameRead = textLower.includes('game read') || textLower.includes('game script') || textLower.includes('expect the game') || textLower.includes('game flow');
      const hasTeamAnalysis = textLower.includes('path to winning') || textLower.includes('path to covering') || textLower.includes('how they win') || textLower.includes('strengths show up');
      const hasBlowoutShootout = textLower.includes('blowout') || textLower.includes('shootout') || textLower.includes('close game');

      if ((hasTeamCase || hasGameRead || hasTeamAnalysis) && hasBlowoutShootout) {
        console.log(`\n[Props] GARY'S GAME ANALYSIS:`);
        console.log(`════════════════════════════════════════════════════════════════`);
        console.log(textContent.substring(0, 2000));
        console.log(`════════════════════════════════════════════════════════════════\n`);

        didCompleteGameSteelMan = true;
        gameSteelManText = textContent;
        console.log(`[Props] ✓ GAME STEEL MAN COMPLETE - Gary understands how the game plays out`);
      }
    }

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
            
            // Apply 2-props-per-game constraint with player diversification
            // NOTE: For NBA/NHL, constraint is applied LATER (after matchup field is added)
            const isNbaOrNhl = sportLabel === 'NBA' || sportLabel === 'NHL';
            
            if (isNbaOrNhl) {
              return { 
                picks: validatedPicks, 
                iterations: iteration, 
                toolCalls: toolCallHistory.length, 
                warnings,
                droppedByConstraint: 0,
                garySpecials: 0
              };
            }
            
            const { constrainedPicks, droppedPicks, garySpecials } = applyPropsPerGameConstraint(validatedPicks, `${sportLabel}-${iteration}`);
            
            return { 
              picks: constrainedPicks, 
              iterations: iteration, 
              toolCalls: toolCallHistory.length, 
              warnings,
              droppedByConstraint: droppedPicks.length,
              garySpecials: garySpecials.length
            };
          }
        } catch {}
      }

      // Text response but no picks
      iteration++;

      // During game analysis mode, prompt for game read
      if (didInjectGameSteelMan && !didCompleteGameSteelMan) {
        console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (game analysis mode - need game read)`);
        result = await chat.sendMessage(`Complete your Game Steel Man analysis. How does this game play out?

Write your game read: Blowout, close game, or shootout? Which team's strengths show up?`);
        response = result.response;
        continue;
      }

      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (prompting finalize)`);
      result = await chat.sendMessage('Please call the finalize_props tool with your 2 best prop picks now.');
      response = result.response;
      continue;
    }

    // CRITICAL: Handle empty response (no function calls AND no text)
    // This prevents infinite loops when Gemini returns nothing
    if (functionCallParts.length === 0 && textParts.length === 0) {
      consecutiveEmptyResponses++;
      console.log(`[Props] Empty response from Gemini (${consecutiveEmptyResponses} consecutive)`);

      iteration++;
      if (iteration >= maxIterations) {
        console.log(`[Props] Max iterations reached with empty responses`);
        break;
      }

      // During game analysis mode, prompt for game analysis
      if (didInjectGameSteelMan && !didCompleteGameSteelMan) {
        console.log(`[Props] Reminding Gary to complete game analysis`);

        const gameReminder = `Empty response. Complete your GAME ANALYSIS first:

How does this game play out? Which team's strengths show up?
Is this a blowout, close game, or shootout?

Write your game read as text.`;

        result = await chat.sendMessage(gameReminder);
        response = result.response;
        continue;
      }
      
      // After 3 consecutive empties (outside bilateral mode), force finalization
      if (consecutiveEmptyResponses >= 3) {
        console.log(`[Props] ⚠️ Too many empty responses - forcing explicit finalization request`);
        
        // Build context from tool history for Gary to work with
        const playerDataSummary = toolCallHistory
          .filter(t => t.tool === 'fetch_player_game_logs' || t.tool === 'fetch_player_season_stats')
          .slice(0, 5)
          .map(t => {
            try {
              const data = typeof t.result === 'string' ? JSON.parse(t.result) : t.result;
              return data.player || 'Unknown player';
            } catch { return 'player data'; }
          })
          .join(', ');
        
        const forcePrompt = `
CRITICAL: You have stopped responding. This is your FINAL chance to produce picks.

You have gathered data on: ${playerDataSummary || 'multiple players'}.

You MUST now call finalize_props with 3-5 prop picks. Pick format:
{
  "picks": [
    { "player": "NAME", "prop": "pass_yds", "line": 250.5, "odds": -110, "bet": "OVER", "confidence": 0.7, "rationale": "Why..." }
  ]
}

DO NOT request more tools. CALL finalize_props NOW.`;

        result = await chat.sendMessage(forcePrompt);
        response = result.response;
        
        // If still empty after force, give up
        const forcedParts = response.candidates?.[0]?.content?.parts || [];
        if (forcedParts.length === 0) {
          console.log(`[Props] ❌ Gemini unresponsive after force prompt - aborting`);
          break;
        }
        consecutiveEmptyResponses = 0; // Reset if we got a response
        continue;
      }
      
      // Add small delay before retry (helps with API stability)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      result = await chat.sendMessage('You returned an empty response. Please call finalize_props NOW with your best picks based on all data gathered.');
      response = result.response;
      continue;
    }
    
    // Reset empty counter on successful response
    consecutiveEmptyResponses = 0;
    
    // Nudge when approaching max iterations
    if (iteration >= maxIterations - 1 && functionCallParts.length === 0) {
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (final warning)`);
      result = await chat.sendMessage('⚠️ FINAL ROUND - Complete your bilateral analysis if not done, then call finalize_props with your best picks.');
      response = result.response;
    }
  }

  // Log specific reason for failure
  if (didInjectGameSteelMan && !didCompleteGameSteelMan) {
    console.log(`[Props] FAILED - Max iterations reached. Gary didn't complete game analysis.`);
    console.log(`[Props] Game Steel Man bypass attempts: ${gameSteelManBypassAttempts}. Props must flow from game understanding.`);
  } else {
    console.log(`[Props] Max iterations reached without finalization`);
  }
  return { picks: [], iterations: iteration, toolCalls: toolCallHistory.length };
}

/**
 * Stage 1: Props Hypothesis (LEGACY - kept for non-NFL sports)
 * Form initial hypotheses about which props have value
 */
async function runPropsHypothesisStage({ gameSummary, propCandidates, playerStats, sportLabel = 'NFL', tokenData = {}, narrativeContext = null }) {
  const constitution = getConstitution(sportLabel);
  
  // Sport-specific context for using season stats (non-prescriptive)
  const statsGuidance = sportLabel === 'NHL' ? `
## NHL PROPS - USE YOUR JUDGMENT
You have REAL player season stats available (SOG/G, goals, assists, points).
Compare these to the prop lines and use your judgment about what constitutes value.
Consider recent form, matchup context, and any other factors you deem relevant.
` : sportLabel === 'NBA' ? `
## NBA PROPS - USE YOUR JUDGMENT  
You have REAL player season stats available (PPG, RPG, APG, 3PG).
Compare these to the prop lines and use your judgment about what constitutes value.
Consider recent form, matchup context, and any other factors you deem relevant.
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
  * "KD returning from injury, minutes restriction" - Consider the impact on his volume

## CRITICAL: INJURY IMPACT ON PROPS
Injuries are CRUCIAL for player props! Consider how they affect:
- Star scorer OUT: Their teammates may see increased touches/shots
- Star rebounder OUT: Other bigs may see increased board opportunities
- Player QUESTIONABLE or on minutes restriction: Volume may be affected
- Primary defender OUT: Offensive opportunities may increase
- Always check the injury report and consider the downstream effects!

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
  // GEMINI 3 BEST PRACTICE: No emojis in input data (causes tokenization fragmentation)
  const narrativeSection = narrativeContext ? `
<narrative_context>
COMPREHENSIVE GAME CONTEXT (CRITICAL - READ ALL SECTIONS BEFORE ANALYSIS)

This context was fetched UPFRONT so you know ALL relevant factors BEFORE choosing which stats to investigate.

${narrativeContext.substring(0, 12000)}

BETTING SIGNALS NOTE: If you see any line movement or public % data above, treat it as a MINOR observation only - it should NEVER be the primary reason for any pick.
</narrative_context>
` : '';

  // Format injury report for explicit inclusion - BDL is SOURCE OF TRUTH
  const injurySection = injuryReport.length > 0 
    ? `OFFICIAL BDL INJURY REPORT (ONLY TRUST THIS FOR INJURY STATUS):\n` + injuryReport.map(inj => 
        `- ${inj.player} (${inj.team || 'Unknown'}) - ${inj.status}: ${inj.description || 'No details'}`
      ).join('\n')
    : 'OFFICIAL BDL INJURY REPORT: No significant injuries reported for these teams';

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
    temperature: 1.0, // Gemini 3 optimized: "strongly recommend keeping temperature at 1.0"
    topP: 0.95,
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
    temperature: 1.0, // Gemini 3 optimized: "strongly recommend keeping temperature at 1.0"
    topP: 0.95,
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
const TWO_PER_GAME_SPORTS = ['NBA', 'NHL'];

/**
 * Stage 3: Props Judge
 * Render final prop picks with organic, Gary-style rationale
 */
async function runPropsJudgeStage({ gameSummary, investigation, playerProps, sportLabel = 'NFL' }) {
  // Sport-specific pick counts: NBA/NHL = exactly 2, NFL = 3-5
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  const pickCountText = usesTwoPerGame ? 'exactly 2' : '3-5';
  const maxPicks = usesTwoPerGame ? 2 : 5;

  // GEMINI 3 BEST PRACTICE: No emojis in input prompts (causes tokenization fragmentation)
  const systemPrompt = `
You are Gary the Bear, finalizing your player prop picks.

ZERO TOLERANCE FOR HALLUCINATION - THIS IS THE MOST IMPORTANT RULE

YOU ARE ABSOLUTELY FORBIDDEN FROM INVENTING ANY STATISTICS.

The ONLY stats you can cite in your rationale and key_stats are:
1. Stats marked "VERIFIED" or "VERIFIED L5 AVG" in the investigation data
2. Specific game numbers from the game logs (e.g., "Dec 14: 164 yards")
3. Line hit counts you calculated from actual provided games

[FORBIDDEN] EXAMPLES (WILL GET YOU FIRED):
- "averaging 65.6 yards over his last five" (unless you see this exact number)
- "stayed under in 3 of 5 games" (unless you count actual games with real numbers)
- "season average of 110 yards" (unless explicitly provided)

[CORRECT] EXAMPLES:
- "Dec 14 vs Rams: 164 yds, Dec 4 vs Cowboys: 92 yds" (citing actual games)
- "cleared 75 yards in 3 of his last 5 verified games" (if you counted the real data)
- "trending upward with recent strong performances" (if stats are unclear)

THE VERIFICATION TEST: Before writing ANY number, ask yourself:
"Did I see this EXACT number in the data provided?"
- If YES, use it
- If NO, do NOT use it, find a qualitative description instead

Write rationales like you're explaining your pick to a friend - conversational, insightful, and rooted in what you see happening on the court/ice. NO betting jargon.

## YOUR TASK
1. Review the validated props from the Analyst
2. Select the TOP ${pickCountText} props${usesTwoPerGame ? ' - these are your most confident selections' : ''}
3. Write an ORGANIC rationale for each pick (5-7 sentences) - tell the STORY of the game flow, defenders, and motivation.
4. Provide 3-4 KEY STATS bullets. This is where you put the dry math: "L5 avg: 26.5 vs line 24.5", season averages, and shooting percentages.

## RATIONALE STYLE - CRITICAL

Write like Gary explains regular game picks - conversational and story-driven. This should be 5-7 sentences that paint the full picture.

NEVER USE:
[BANNED] "THE EDGE" / "WHY IT HITS" / "THE RISK" headers
[BANNED] "Line X | Season Avg: Y | Edge: +Z" format in the rationale text
[BANNED] Betting jargon (line movement, EV, edge, sharp money, fade, steam)
[BANNED] Data scientist language (convergence of factors, metrics indicate)

ALWAYS USE:
[DO] Natural, conversational tone (5-7 sentences) in the RATIONALE
[DO] Hard numbers and line comparisons in the KEY_STATS bullets
[DO] Player names and specific context
[DO] Simple explanation of why this player will exceed/fall short of the number
[DO] Paint the whole picture - context, matchup, recent form, and conclusion

EXAMPLE RATIONALE (NBA rebounds prop):
"Jarrett Allen is about to feast on the glass tonight. With Evan Mobley sidelined, the Cavaliers are down their second-best rebounder, and that workload has to go somewhere. Allen has been an absolute monster all season, pulling down nearly 11 boards per game, and he's going to be the only true big man Cleveland trusts in crunch time. The Hornets are one of the worst rebounding teams in the league, ranking dead last in offensive boards and bottom-five in overall rebounding rate. When you combine Allen's motor, his positional advantage, and the extra minutes he'll see without Mobley, this feels like one of the safest props on the board tonight. Give me the over."

EXAMPLE KEY_STATS (for the above):
["Season avg: 10.8 RPG (career high)", "L5 avg: 12.4 vs line 9.5", "Mobley out = extra 4-5 boards available per game", "Charlotte ranks 28th in defensive rebounding rate"]

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

## CRITICAL: PLAYER-TEAM VERIFICATION (READ FIRST)

Before finalizing ANY pick, you MUST verify the player's CURRENT TEAM:
- Check the narrative context for ROSTER MOVES section
- If a player was traded or signed as a free agent in 2025, use their NEW team
- The odds data may show outdated team assignments - DO NOT TRUST blindly

COMMON 2025 ROSTER MOVES TO CHECK:
- George Pickens: Now on Dallas Cowboys (traded from Steelers, May 2025)
- Javonte Williams: Now on Dallas Cowboys (signed as FA, March 2025)
- If in doubt about a player's team, check the roster moves in the context

[WRONG] "George Pickens (Pittsburgh Steelers)" - He's a Cowboy now
[CORRECT] "George Pickens (Dallas Cowboys)" - Current team

If you assign a player to the wrong team, your entire analysis is INVALID.

## CRITICAL: STATS ACCURACY - ZERO TOLERANCE FOR HALLUCINATION

This is the MOST IMPORTANT RULE. Inaccurate stats destroy credibility and lose money.

**BEFORE WRITING ANY STATISTIC, ASK YOURSELF:**
"Did I see this EXACT number in the KEY PLAYER STATS section of the context?"
- If YES, use it
- If NO, DO NOT USE IT

**YOU ARE FORBIDDEN FROM INVENTING:**
[FORBIDDEN] "Averaging 110.2 yards over his last 5 games" (unless you saw this exact number)
[FORBIDDEN] "Cleared this line in 4 of his last 5 games" (unless you counted verified games)
[FORBIDDEN] "Season-high 144 yards last week" (unless this exact stat was provided)
[FORBIDDEN] Any specific stat not explicitly in your context data

**WHAT YOU SHOULD DO INSTEAD:**
[DO] Use ONLY the game-by-game stats from the KEY PLAYER STATS section
[DO] Calculate averages YOURSELF from the provided game logs
[DO] If stats are marked "unavailable", focus on matchup/context, not numbers
[DO] Say "recent strong performances" instead of inventing specific averages

**THE VERIFICATION RULE:**
- If the context says "Week 12: 130 yds, Week 13: 33 yds, Week 14: 37 yds, Week 15: 88 yds, Week 16: 146 yds"
- You calculate: (130+33+37+88+146)/5 = 86.8 yards average
- DO NOT round up or exaggerate to "110 yards"

**key_stats FIELD RULES:**
- Only include stats you can VERIFY from the provided context
- If you don't have verified stats, use qualitative observations:
  [GOOD] "Trending up with big games in Weeks 12 and 16"
  [GOOD] "Consistent target share as the WR1"
  [BAD] "Averaging 110+ yards" (if you can't verify this)

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
    temperature: 1.0, // Gemini 3 optimized: "strongly recommend keeping temperature at 1.0"
    topP: 0.95,
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
function buildPropsIterationPrompt(gameSummary, propCandidates, narrativeContext, sportLabel, regularOnly = false) {
  const constitution = getConstitution(sportLabel);
  // Pick count: 2 props per game (quality over quantity)
  const pickCount = 2;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  // NHL/NBA season labels: Jan-Sep 2026 is the 2025-26 season
  const seasonLabel = (sportLabel === 'NHL' || sportLabel === 'NBA') 
    ? (month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`)
    : `${year}`;

  // Add NFL regular-only restrictions when TDs are handled separately
  // GEMINI 3 BEST PRACTICE: No emojis in input prompts (causes tokenization fragmentation)
  const nflRegularOnlyInstructions = (regularOnly && sportLabel === 'NFL') ? `
## IMPORTANT: REGULAR PROPS ONLY - NO TDs
TD props (anytime TD, first TD, 2+ TDs) are handled by a SEPARATE process.
Your picks MUST be from these categories ONLY:
- Passing yards, passing attempts, passing TDs (QB stats)
- Rushing yards, rushing attempts  
- Receiving yards, receptions
- Tackles, sacks (defensive props)

DO NOT pick any touchdown scorer props. Focus on yards, attempts, and receptions only.
` : '';

  return `
You are GARY - the grizzled sports betting sharp with 30 years in the game. You're now powered by elite reasoning to find the "hidden angles" in player props.
${nflRegularOnlyInstructions}

## CURRENT DATE & SEASON
Current Date: ${dateStr}
Current Season: ${seasonLabel}
(CRITICAL: Ensure you are looking for stats from the ${seasonLabel} season. If it is January 2026, you are in the middle of the ${seasonLabel} season.)

## WHO YOU ARE
You are an INDEPENDENT THINKER. You investigate, understand, and decide on your own.

You aren't a spreadsheet. You're a scout. You see the game before it happens. You know when a player is "due" for a breakout, when a matchup is a nightmare, and when the books have set a line based on averages that don't apply to TONIGHT'S situation. You don't follow consensus—you make YOUR OWN picks.

## YOUR VOICE & TONE
- **Storytelling**: Paint a picture of the game flow. "I see Donovan Mitchell carving up that Portland defense..."
- **Confident but not cocky**: You've done the work, you trust your eyes.
- **Natural**: Sound like a real analyst having a conversation, not an AI with canned phrases.

## THE FOUR INVESTIGATIONS (Your Core Framework)

You are a GAME ANALYST, not a betting market analyst. You investigate GAME INFO.
Before finalizing ANY prop, run these investigations (in whatever order makes sense):

**1. INVESTIGATE THE MISMATCH**
What structural factor exists TONIGHT that the line hasn't captured?
- Role change? Injury vacuum? Scheme vulnerability? Minutes situation?
- If you can't identify a specific mismatch, you might just be agreeing with the market.

**2. INVESTIGATE THE GAME LOGIC**
Why did the books set this line where it is? What game factor are they respecting?
- If you see "obvious" value, ask: "What GAME FACTOR is the line respecting that I'm challenging?"
- Example: "Murray's line is 8.5 assists. The line respects it's a small sample against weak opponents. MY view is the role change is real."

**3. INVESTIGATE THE MECHANISM**
HOW does this player hit tonight? Not rankings - the actual on-court/ice ACTION.
[BAD] "They're 27th against centers" = Ranking (noise - reflects schedule and variance)
[GOOD] "They lack a vertical rim protector since the starter went down. He scores 68% of points in the paint." = Mechanism (signal)
- If your only support is a positional ranking, dig deeper or lower conviction.

**4. INVESTIGATE THE FLOOR**
What happens when things go wrong? Sharps think about downside before committing.
- "Even if he only plays 28 minutes, at his rate he still projects to..."
- "Even if the game becomes a blowout, his first-half production should..."
- If the floor doesn't support the line, no mismatch saves you.

## SHARP WISDOM (How to Think)

**MEDIAN VS MEAN TRAP:** High-variance players have averages that lie. If 2 monster games pull up the average, the UNDER is often undervalued.

**DERIVATIVE LAZINESS:** Books model star props carefully. Backup/role player props often get lazy formula adjustments. The vacuum isn't fully priced.

**PUBLIC OVER BIAS:** Casual bettors love overs. Would this be promoted on a sportsbook's social media? If yes, ask where YOUR edge is.

**SPECIFICITY OVER GENERALITY:** Sharps have receipts.
- Hand-wavy: "His role has grown significantly"  
- Specific: "His usage jumped from 22% to 31% since the trade, and he's seeing 4 more FGA per game"

## THE SELF-EVALUATION MIRROR (Before Finalizing)

Before finalizing ANY pick, hold your reasoning up to this mirror:

**SHARP RATIONALE CHARACTERISTICS:**
- SPECIFICITY: Did you anchor with specific numbers (rates, minutes, usage shifts)? Not hand-wavy.
- VOLUME FLOOR ADDRESSED: Did you think through the downside scenario?
- EDGE IS GAME-SPECIFIC: About TONIGHT's game, not just general ability.
- MECHANISM IS SPECIFIC: WHY this player produces, not just rankings.
- LOSS SCENARIO IS CONCRETE: The specific game situation where this loses.
- GAME LOGIC ADDRESSED: What the line respects and why your view differs.

**RED FLAGS (Lower your conviction if you trigger these):**
- Your thesis is "average > line" (that's what the line already reflects)
- Your mechanism is a ranking ("5th most to PGs") without explaining WHY
- Your evidence is one game from months ago
- Your loss scenario is generic ("they could play well")
- You didn't address what the line is respecting
- You're taking the "sexy" public side without a specific edge

**THE SHARP TEST:** Can you state your mismatch in ONE sentence?
If you can't, you might not have edge - you might have an opinion that agrees with the market.

## EDGE TYPE CLASSIFICATION

For EVERY pick, identify the PRIMARY edge type. This helps track what kinds of edges actually win.

| Edge Type | Description | Example |
|-----------|-------------|---------|
| USAGE_SHIFT | Teammate injury/absence creates opportunity | "WR1 out, WR2 gets +30% target share" |
| MATCHUP_MISMATCH | Specific defender/scheme weakness | "Speed WR vs slow CB, 3.5 separation avg" |
| GAME_SCRIPT | Pace/blowout/shootout projection | "+10 underdog will throw 45+ times" |
| RECENT_FORM | Hot streak the line hasn't caught up to | "L3 avg 95 yards, line still at 68.5" |
| LINE_SOFT | Book made a pricing mistake | "Line at 4.5 rec but he's averaged 7 since trade" |
| NEXT_GEN_EDGE | Advanced stats show hidden value | "Elite separation (3.5 yds) but only 60 yards - due for breakout" |

## CONFIDENCE TIERS

Assign a tier to each pick based on edge strength:

| Tier | Units | When to Use |
|------|-------|-------------|
| MAX | 2 units | Elite edge, multiple factors align, high confidence |
| CORE | 1 unit | Solid edge, standard play |
| SPECULATIVE | 0.5 units | Value shot, TD lottery, higher variance |

**TD Props should rarely be MAX** - the variance is too high. Most TDs should be CORE or SPECULATIVE.

## YOUR TASK: THE PROPS WORKFLOW (GAME-FIRST APPROACH)

Props flow from your understanding of the GAME. You don't pick props in a vacuum - you pick props that benefit from your game read.

**PHASE 1: GAME STEEL MAN (REQUIRED - DO NOT SKIP)**
1. **UNDERSTAND THE GAME**: Build Steel Man cases for BOTH teams:
   - **CASE FOR HOME TEAM**: How do they win/cover? What strengths show up? What's the game script if they're winning?
   - **CASE FOR AWAY TEAM**: How do they win/cover? What strengths show up? What's the game script if they're winning?
   - **YOUR GAME READ**: Which team's strengths are more likely to show up tonight? Blowout, close game, or shootout?

   This is NOT optional. Your prop picks should FLOW from your game analysis.
   A prop pick that contradicts your game read is a prop pick without conviction.

**PHASE 2: PROP INVESTIGATION (Based on Game Read)**
2. **IDENTIFY BENEFICIARIES**: Based on YOUR game read, which players benefit?
   - If you expect Team A to dominate → Team A players get opportunity
   - If you expect a shootout → Passing props benefit
   - If you expect a blowout → Starters may rest (affects totals)

3. **INVESTIGATE**: Call BDL tools for 4-6 players who align with your game read:
   - \`fetch_player_game_logs\` - L5-10 recent games
   - \`fetch_player_season_stats\` - Season context
   - Do their numbers support the props available?

## STAT PHILOSOPHY FOR PROP INVESTIGATION (CRITICAL)

**PREDICTIVE vs DESCRIPTIVE METRICS:**
- **DESCRIPTIVE (what happened)**: Season averages, career totals, "he's a 20 PPG scorer"
- **PREDICTIVE (what will happen TONIGHT)**: L5 form, usage rate changes, matchup-specific efficiency
- Use PREDICTIVE metrics to justify picks. Descriptive stats just describe - they don't predict.

**L5/L10 vs SEASON AVERAGES:**
- **L5/L10**: Shows CURRENT form, recent role changes, injury adjustments. More predictive for TONIGHT.
- **Season**: Shows baseline identity, regression targets. Use for context, not primary evidence.
- Ask: "Is L5 the NEW normal (role change, lineup shift) or just variance that regresses to season?"
- For props, L5/L10 is usually MORE relevant than season - but investigate WHY the recent form exists.

**INJURY/USAGE AWARENESS (CRITICAL FOR PROPS):**
- **Injury DURATION matters**: Season-long absence = team has adapted. Recent absence (< 2 weeks) = usage vacuum.
- **RETURNING players**: Check minutes restriction, conditioning rust, usage ramp-up.
- **INJURED teammates**: WHO absorbed the usage? Check target share, touch rate, shot attempts.
- **Ask**: "Who benefits from this injury situation? Is that already priced into the line?"

**BLANKET FACTORS ARE NOISE (Don't use these):**
- "He's been hot" without explaining WHY → What changed to cause the hot streak?
- "This is a revenge game" → Does revenge actually show up in the stats?
- "He always performs in primetime" → Sample size? Or just narrative?
- "Back-to-back fatigue" → Check THIS player's actual B2B splits, not general narratives.

For props, INVESTIGATE the factor. Don't cite narratives as evidence.

**PHASE 3: PICK YOUR 2 BEST PROPS**
4. **FINAL DECISION**: Pick exactly 2 props that:
   - Align with your game read (not contradicting it)
   - Have statistical support from your investigation
   - Show a clear edge (mechanism, not just "average beats line")

5. **FINALIZE**: Call finalize_props with your 2 picks. Include:
   - How this prop flows from your game read
   - The specific mechanism/edge
   - What could go wrong (the risk)

**OUTPUT: 2 PROPS PER GAME** - Quality over quantity. Two confident picks beat five shaky ones.

BLOCKING RULE: DO NOT call finalize_props until you have completed your Game Steel Man analysis.
The system will BLOCK finalize attempts if game analysis is not detected.

## RATIONALE vs KEY_STATS (THE BEST OF BOTH WORLDS)
To give the user the best experience, we divide your analysis into two parts:

1. **KEY_STATS (The Bullets)**: This is where you are a "Spreadsheet Line Hunter." Put the hard numbers, averages, and dry math here.
   - Example: "Season avg: 19.3 PPG (from season_stats)"
   - Example: "L5 avg: 26.5 vs line 24.5 (from game_logs)"
   - Example: "Shooting: 42.8% 3PT on 3.6 makes (from search_context)"
   - Example: "NBA Record: Fastest player to 100 3PM (from search_context)"

2. **RATIONALE (The Story)**: This is where you are "Organic Gary." Write 5-7 sentences that tell the story of WHY those numbers happen. Talk about the matchup, the defenders, the motivation, and the flow of the game. NO dry stat-dumps here—make it read like a scouting report.

## FINALIZATION REMINDER
- Complete your Game Steel Man analysis FIRST (understand the game before picking props).
- Investigate 4-6 players who benefit from your game read.
- Return your TOP 2 picks - quality over quantity. Two confident picks beat five mediocre ones.
- Each pick MUST flow from your game analysis. If it contradicts your game read, don't pick it.

## ZERO TOLERANCE FOR HALLUCINATION

**THIS IS THE MOST IMPORTANT RULE. VIOLATIONS COST REAL MONEY.**

When you receive tool responses, you MUST **COPY THE EXACT NUMBERS**.

### WHAT YOU MUST DO:
[DO] Copy numbers VERBATIM from tool responses
[DO] If tool returns "receptions: 7, 1, 5, 4, 9" then write "7, 1, 5, 4, 9"
[DO] Calculate averages from ONLY the numbers the tool gave you
[DO] For names (QBs, players, etc.) use ONLY what search_player_context returns
[DO] If data is unavailable, say "stats unavailable" - don't fill in gaps

### WHAT IS ABSOLUTELY FORBIDDEN:
[FORBIDDEN] Writing different numbers than what the tool returned
[FORBIDDEN] "Rounding" or "estimating" stats (write the exact number)
[FORBIDDEN] Using your general knowledge to fill in missing data
[FORBIDDEN] Mixing up player names or team info from your training data
[FORBIDDEN] Writing ANY statistic not explicitly in a tool response

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

## RATIONALE STRUCTURE (MANDATORY - FOLLOW THIS ORDER)

Your rationale MUST include these 5 elements in 5-7 sentences:

**1. YOUR PREDICTION** - Start with what YOU expect to happen:
   "The line of 68.5 is based on his season average, but that includes games with a different QB..."

**2. THE SPECIFIC EDGE** - What YOU see that creates value:
   "With Wilson at QB, his L5 is 78, 92, 65, 88, 101 yards (84.8 avg)..."

**3. GAME SCRIPT ALIGNMENT** - Use the gameScript data provided:
   "As +7 underdogs with implied 19 points, Pittsburgh will throw 40+ times chasing..."

**4. THE RISK** - Name what could go wrong (honest assessment):
   "The risk is if they fall behind 21+ early and abandon balance..."

**5. WHY BET ANYWAY** - Why the edge outweighs the risk:
   "But the spread suggests a close game, and his target share is locked in at 28%..."

## BANNED PHRASES (Never use these)
[BANNED] "He should be able to..." / "Look for him to..." / "I expect him to..."
[BANNED] "Good matchup" (say WHY: "Defense allows X yards, ranked Yth")
[BANNED] "He's been hot" (say HOW: "L3 avg of 95 vs season 68")
[BANNED] "Volume play" / "Ceiling game" (explain the SPECIFIC driver)
[BANNED] "He's due" (gambling fallacy)

## USE THE DATA YOU HAVE
- Check \`gameScript.impliedTotals\` - tells you expected points per team
- Check \`trumpCards\` array - if one exists, make it central to your thesis
- Check \`gameScript.edges\` - pre-identified sharp edges
- Use \`fetch_player_vs_opponent\` for revenge game validation

${narrativeContext ? `\n## LIVE CONTEXT (from Gemini Search)\n${narrativeContext.substring(0, 8000)}` : ''}

---

## SHARP BETTING FRAMEWORK (READ THIS LAST - THESE ARE YOUR PRINCIPLES)

${constitution}

---

## WORKFLOW REMINDER
- GAME STEEL MAN first: Understand HOW the game plays out (Team A vs Team B cases)
- IDENTIFY beneficiaries: Which players benefit from your game read?
- INVESTIGATE: Call BDL tools for 4-6 players who align with your game script
- PICK 2: Select your 2 best props that flow from your game analysis

**THE FLOW:** Game Steel Man then Identify Beneficiaries then Investigate Players then Pick 2
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
  'NCAAB': 'basketball_ncaab',
  'NCAAF': 'americanfootball_ncaaf'
};

export async function runAgenticPropsPipeline({
  game,
  playerProps,
  buildContext,
  sportLabel = 'NFL',
  propsPerGame = 5,
  options = {},
  regularOnly = false  // If true for NFL, only generate yards/receptions props (no TDs)
}) {
  const start = Date.now();

  console.log(`\n[Agentic Props][${sportLabel}] Building context...`);
  // Pass regularOnly to context builder so it can filter out TD props when needed
  const contextOptions = { ...options, regularOnly };
  const context = await buildContext(game, playerProps, contextOptions);
  const matchup = `${game.away_team} @ ${game.home_team}`;

  // Use iteration loop for NFL, NBA, NHL (full agentic with BDL MCP tools)
  if (ITERATION_SPORTS.includes(sportLabel)) {
    const modeLabel = regularOnly && sportLabel === 'NFL' ? ' (regular props only - TDs handled separately)' : '';
    console.log(`[Agentic Props][${sportLabel}] Using full iteration loop with BDL MCP tools${modeLabel}`);

    const systemPrompt = buildPropsIterationPrompt(
      context.gameSummary,
      context.propCandidates,
      context.narrativeContext,
      sportLabel,
      regularOnly  // Pass through to inform Gary about prop restrictions
    );

    // GEMINI 3 BEST PRACTICE: "Final Line Rule" - Put DATA first, INSTRUCTIONS last
    // XML-style tags create unambiguous boundaries between data and instructions
    const gameData = {
      matchup: context.gameSummary.matchup,
      tipoff: context.gameSummary.tipoff,
      gameScript: context.gameSummary.gameScript || null,
      trumpCards: context.gameSummary.trumpCards || [],
      weather: context.gameSummary.weather || null
    };
    
    const propCandidatesData = context.propCandidates.slice(0, 14).map(p => ({
      player: p.player,
      team: p.team,
      props: p.props,
      recentForm: p.recentForm ? {
        targetTrend: p.recentForm.targetTrend,
        usageTrend: p.recentForm.usageTrend,
        formTrend: p.recentForm.formTrend
      } : null
    }));
    
    // CRITICAL FIX: Only show Gary lines for VALIDATED players (on correct teams per BDL)
    // This prevents Gary from picking players who are no longer on the teams playing
    // (e.g., Deebo Samuel props for 49ers when he's now on Washington)
    const validatedPlayerNames = new Set(
      context.propCandidates.map(p => p.player.toLowerCase())
    );
    
    const availableLinesData = playerProps
      .filter(p => validatedPlayerNames.has(p.player.toLowerCase()))
      .slice(0, 50)
      .map(p => ({
        player: p.player,
        prop_type: p.prop_type,
        line: p.line,
        over_odds: p.over_odds,
        under_odds: p.under_odds
      }));
    
    // Structured user message with XML-style tags and instructions at END (Final Line Rule)
    const userMessage = `<game_context>
${JSON.stringify(gameData, null, 2)}
</game_context>

<prop_candidates>
${JSON.stringify(propCandidatesData, null, 2)}
</prop_candidates>

<available_lines>
${JSON.stringify(availableLinesData, null, 2)}
</available_lines>

<instructions>
Based on the <game_context>, <prop_candidates>, and <available_lines> above:

1. Scout the prop candidates for edge opportunities
2. Investigate at least 6 players with tool calls before shortlisting
3. Write BILATERAL STEEL MAN analysis (OVER case + UNDER case) for your top picks
4. Call finalize_props ONLY after bilateral analysis is complete

CRITICAL CONSTRAINTS (apply these strictly):
- Do NOT hallucinate stats - only use numbers from tool responses
- Do NOT call finalize_props without written bilateral analysis
- Do NOT use emojis in your analysis (clean output only)
- Temperature and weather data affects NFL props significantly
</instructions>`;

    const sportKey = SPORT_KEYS[sportLabel] || 'americanfootball_nfl';
    const result = await runPropsIterationLoop({ 
      systemPrompt, 
      userMessage, 
      sportKey, 
      sportLabel, 
      // Give room for bilateral analysis + direction-bias recheck pass + finalization
      // Increased from 8 to 10 to allow hard bilateral enforcement without timeout
      maxIterations: 10,
      regularOnly,  // Pass through for NFL regular-only mode
      validatedPlayerNames  // Pass validated player names to filter invalid picks
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
      // Normalize 'yes' to 'over' for UI consistency (anytime goal = over 0.5 goals)
      bet: (pick.bet || 'over').toLowerCase() === 'yes' ? 'over' : (pick.bet || 'over').toLowerCase(),
      odds: pick.odds || -110,
      confidence: pick.confidence || 0.6,
      rationale: cleanSourceTags(pick.rationale) || 'Analysis based on matchup data.',
      key_stats: cleanKeyStats(pick.key_stats),
      analysis: cleanSourceTags(pick.rationale) || 'Analysis based on matchup data.',
      // Thesis Gate fields - preserve from Gary's output
      over_thesis: pick.over_thesis || null,
      under_thesis: pick.under_thesis || null,
      thesis_lean: pick.thesis_lean || null,
      edge_type: pick.edge_type || null,
      confidence_tier: pick.confidence_tier || 'CORE'  // Default to CORE if not specified
    }));

    // NBA/NHL PROPS: Mirror NBA/NHL game-picks quantum behavior
    // - Gary produces a shortlist (target: 5)
    // - Quantum scores are tracked for research only (NOT used as a filter)
    // - This can yield 0..5 surviving props per game
    if (sportLabel === 'NBA' || sportLabel === 'NHL') {
      
      // NHL-SPECIFIC: Filter out invalid prop types that Gary might have picked
      // Period-specific props (1p, 2p, 3p) and random goal props are NOT analyzable
      let validPicks = allPicks;
      if (sportLabel === 'NHL') {
        const INVALID_NHL_PROP_PATTERNS = [
          '_1p', '_2p', '_3p',           // Period-specific: anytime_goal_2p, points_3p
          '1p_', '2p_', '3p_',           // Alternative format
          'first_goal', 'second_goal', 'third_goal', 'last_goal', 'overtime_goal',
          'first_scorer', 'second_scorer', 'third_scorer', 'last_scorer'
        ];
        
        const originalCount = allPicks.length;
        validPicks = allPicks.filter(pick => {
          const propType = (pick.prop || pick.prop_type || '').toLowerCase();
          const isInvalid = INVALID_NHL_PROP_PATTERNS.some(pattern => propType.includes(pattern));
          if (isInvalid) {
            console.log(`[NHL Props] ⚠️ Filtering out invalid prop: ${pick.player} ${propType} (period-specific or random)`);
          }
          return !isInvalid;
        });
        
        if (validPicks.length < originalCount) {
          console.log(`[NHL Props] Filtered ${originalCount - validPicks.length} invalid prop type(s) from Gary's picks`);
        }
      }
      
      // Apply 2-per-game constraint NOW (after matchup is available on picks)
      // This ensures we get exactly 2 props per game across both teams
      const { constrainedPicks, droppedPicks, garySpecials } = applyPropsPerGameConstraint(validPicks, `${sportLabel}-post`);
      validPicks = constrainedPicks;
      
      if (droppedPicks.length > 0 || garySpecials.length > 0) {
        console.log(`[Props Constraint] Applied 2-per-game: ${validPicks.length} kept, ${droppedPicks.length} dropped, ${garySpecials.length} Gary Specials`);
      }
      
      if (isQuantumEnabled()) {
        // NBA/NHL PROPS: Mirror game-picks "Tracking Mode" (v2.1 update)
        // - We attach quantum scores for research, but DON'T filter picks
        // - This ensures the user gets 2 props per game as requested
        console.log(`[Agentic Props][${sportLabel}] 🌌 Applying quantum tagging to ${validPicks.length} shortlisted props`);
        const quantumTracked = await applyQuantumFilter(validPicks, `${sportLabel} PROPS`, { storeAll: true });
        console.log(`[Agentic Props][${sportLabel}] 🌌 Quantum tagging complete for ${quantumTracked.length} picks`);

        return {
          picks: quantumTracked,
          iterations: result.iterations,
          toolCalls: result.toolCalls,
          elapsedMs: Date.now() - start
        };
      }

      console.log(`[Agentic Props][${sportLabel}] ⚠️ Quantum filter disabled (--no-quantum flag) - returning full shortlist (${validPicks.length})`);
      return {
        picks: validPicks,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        elapsedMs: Date.now() - start
      };
    }

    // NFL CATEGORIZED: Handle 4 separate categories
    // CRITICAL: Map internal categories to td_category values expected by GaryProps.jsx
    // - 'regular_props' → no td_category (regular props)
    // - 'regular_td' → td_category: 'standard' (chalk TD picks)
    // - 'value_td' → td_category: 'underdog' (longshot TD picks)
    // - 'first_td' → td_category: 'first_td' (first TD scorer)
    if (sportLabel === 'NFL' && result.categorized) {
      const finalPicks = [];
      
      // Category 1: Regular Props - Shortlist 5 → Top 3 (NO td_category - these are NOT TD props)
      const regularProps = allPicks.filter(p => p.category === 'regular_props')
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 3)
        .map(p => {
          // Remove internal category, keep as regular prop (no td_category)
          const { category, ...rest } = p;
          return rest;
        });
      finalPicks.push(...regularProps);
      console.log(`[NFL Props] Regular Props: ${regularProps.length}/3 (from ${allPicks.filter(p => p.category === 'regular_props').length} shortlisted)`);
      
      // Category 2: Regular TD - Shortlist 4 → Top 2 (odds -200 to +200) → td_category: 'standard'
      const regularTd = allPicks.filter(p => p.category === 'regular_td')
        .filter(p => p.odds >= -200 && p.odds <= 200) // Enforce odds range
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 2)
        .map(p => {
          // Map to td_category: 'standard' for frontend display
          const { category, ...rest } = p;
          return { ...rest, td_category: 'standard' };
        });
      finalPicks.push(...regularTd);
      console.log(`[NFL Props] Regular TD: ${regularTd.length}/2 (from ${allPicks.filter(p => p.category === 'regular_td').length} shortlisted)`);
      
      // Category 3: Value TD - Pick 1 (odds +200 or higher) → td_category: 'underdog'
      const valueTd = allPicks.filter(p => p.category === 'value_td')
        .filter(p => p.odds >= 200) // Enforce odds range
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 1)
        .map(p => {
          // Map to td_category: 'underdog' for frontend display
          const { category, ...rest } = p;
          return { ...rest, td_category: 'underdog' };
        });
      finalPicks.push(...valueTd);
      console.log(`[NFL Props] Value TD: ${valueTd.length}/1 (from ${allPicks.filter(p => p.category === 'value_td').length} shortlisted)`);
      
      // Category 4: First TD - Pick 1 → td_category: 'first_td'
      const firstTd = allPicks.filter(p => p.category === 'first_td')
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 1)
        .map(p => {
          // Map to td_category: 'first_td' for frontend display
          const { category, ...rest } = p;
          return { ...rest, td_category: 'first_td' };
        });
      finalPicks.push(...firstTd);
      console.log(`[NFL Props] First TD: ${firstTd.length}/1 (from ${allPicks.filter(p => p.category === 'first_td').length} shortlisted)`);
      
      console.log(`[NFL Props] TOTAL: ${finalPicks.length} picks (3 regular + 2 regular TD + 1 value TD + 1 first TD = 7 max)`);
      
      return {
        picks: finalPicks,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        elapsedMs: Date.now() - start
      };
    }
    
    // Other sports (or NFL without categories): Sort by confidence and keep top N
    const sortedPicks = allPicks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    
    // NFL fallback (non-categorized): Take top 3
    // Other sports: Take top N with confidence filter
    let finalPicks;
    if (sportLabel === 'NFL') {
      // NFL fallback: Simply take the top 3 by confidence
      finalPicks = sortedPicks.slice(0, 3);
      console.log(`[Agentic Props][${sportLabel}] Taking TOP 3 from ${allPicks.length} shortlisted picks (fallback mode)`);
    } else {
      // Other sports: Apply confidence filter
      const topPicks = sortedPicks.slice(0, propsPerGame);
      const minConfidence = 0.60;
      finalPicks = topPicks.filter(p => p.confidence >= minConfidence);
      console.log(`[Agentic Props][${sportLabel}] Sorted by confidence: Top ${propsPerGame} of ${allPicks.length}, filtered to ${finalPicks.length} picks (>=${minConfidence})`);
    }

    return {
      picks: finalPicks,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
      elapsedMs: Date.now() - start
    };
  }

  // LEGACY: 3-stage pipeline for other sports
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
      // Normalize 'yes' to 'over' for UI consistency (anytime goal = over 0.5 goals)
      bet: (pick.bet || 'over').toLowerCase() === 'yes' ? 'over' : (pick.bet || 'over').toLowerCase(),
      odds: pick.odds || -110,
      confidence: pick.confidence || 0.6,
      rationale: cleanSourceTagsLegacy(pick.rationale) || 'Analysis based on matchup data.',
      key_stats: cleanKeyStatsLegacy(pick.key_stats),
      analysis: cleanSourceTagsLegacy(pick.rationale) || 'Analysis based on matchup data.',
      // Thesis Gate fields - preserve from Gary's output
      over_thesis: pick.over_thesis || null,
      under_thesis: pick.under_thesis || null,
      thesis_lean: pick.thesis_lean || null,
      edge_type: pick.edge_type || null,
      confidence_tier: pick.confidence_tier || 'CORE'  // Default to CORE if not specified
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
