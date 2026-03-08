/**
 * Props Agentic Runner
 * Agentic iteration loop for player prop analysis — used by legacy props path.
 * Main pipeline routes through agenticOrchestrator.js + flashAdvisor.js.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiClient } from './modelConfig.js';
import { GEMINI_FLASH_MODEL } from '../geminiService.js';
import { ballDontLieService } from '../ballDontLieService.js';
import { geminiGroundingSearch } from './scoutReport/scoutReportBuilder.js';
import { fetchNbaInjuriesForGame } from '../nbaInjuryReportService.js';
import { nbaSeason, nhlSeason, nflSeason } from '../../utils/dateUtils.js';
import { getConstitution as getConstitutionWithBaseRules } from './constitution/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// PROPS MODEL POLICY — NBA uses Flash + HIGH reasoning, other sports use Pro
// ═══════════════════════════════════════════════════════════════════════════
const PROPS_MODEL_FLASH = GEMINI_FLASH_MODEL;

function getPropsModelForSport(sportLabel) {
  console.log(`[Props] Using Gemini 3 Flash for ${sportLabel} props`);
  return PROPS_MODEL_FLASH;
}

const getGeminiForProps = () => getGeminiClient({ beta: true });

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
    confidence: { type: 'number', description: 'Your confidence level (0.50-0.95).' },
    rationale: { type: 'string', description: 'Your full reasoning for this pick. Cite specific stats and matchup factors. Same depth as a game pick rationale.' },
    key_stats: { type: 'array', items: { type: 'string' }, description: 'Key stats supporting your pick.' }
  },
  required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
};

// Common tools available for all sports (non-NFL)
const FINALIZE_TOOL = {
  type: 'function',
  function: {
    name: 'finalize_props',
    description: `Output your final prop picks. Include your full reasoning in the rationale field — same depth and quality as a game pick rationale.`,
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
  FINALIZE_TOOL
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
  // NEW: Historical vs Opponent Tool - For validating revenge games and matchup history
  {
    type: 'function',
    function: {
      name: 'fetch_player_vs_opponent',
      description: 'Fetch a player\'s historical performance against a specific opponent team. Returns stats from past games vs this opponent.',
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
  FINALIZE_TOOL
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
  'NCAAF': NFL_PROP_TOOLS,  // College football uses NFL-style tools
  'WBC': NBA_PROP_TOOLS     // WBC uses NBA-style tools (batter stats like player stats)
};

// Get tools for a specific sport
function getPropsToolsForSport(sportLabel, regularOnly = false) {
  // If regularOnly is true and sport is NFL, use the non-TD tools
  if (regularOnly && sportLabel === 'NFL') {
    return SPORT_PROP_TOOLS['NFL_REGULAR'];
  }
  return SPORT_PROP_TOOLS[sportLabel] || COMMON_PROP_TOOLS;
}

// Map of sport labels to constitution keys (for getConstitutionWithBaseRules)
const SPORT_CONSTITUTION_KEYS = {
  'NFL': 'NFL_PROPS',
  'NBA': 'NBA_PROPS',
  'NHL': 'NHL_PROPS',
  'NCAAB': 'NBA_PROPS',   // College basketball → closest analog is NBA props rules
  'NCAAF': 'NFL_PROPS',   // College football → closest analog is NFL props rules
  'WBC': 'NBA_PROPS',     // WBC uses NBA props rules (closest analog for HR props)
};

/**
 * Get the appropriate constitution for a sport (WITH BASE_RULES included)
 * Returns a sectioned object { baseRules, pass1, pass2, pass25, pass3 }
 * for phase-aligned delivery during the 4-pass pipeline.
 */
function getConstitution(sportLabel) {
  const constitutionKey = SPORT_CONSTITUTION_KEYS[sportLabel] || 'NFL_PROPS';
  const constitution = getConstitutionWithBaseRules(constitutionKey);

  // Replace date template if present
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  if (typeof constitution === 'object' && constitution.pass1) {
    // Sectioned props constitution — replace templates in all sections
    for (const key of ['baseRules', 'pass1', 'pass2', 'pass25', 'pass3']) {
      if (constitution[key]) {
        constitution[key] = constitution[key].replace(/\{\{CURRENT_DATE\}\}/g, today);
      }
    }
  } else if (typeof constitution === 'object' && constitution.full) {
    // Game pick constitution (shouldn't be used here but handle gracefully)
    for (const key of ['baseRules', 'domainKnowledge', 'guardrails', 'full']) {
      if (constitution[key]) {
        constitution[key] = constitution[key].replace(/\{\{CURRENT_DATE\}\}/g, today);
      }
    }
  } else if (typeof constitution === 'string') {
    return constitution.replace(/\{\{CURRENT_DATE\}\}/g, today);
  }

  return constitution;
}

// Convert tool definitions to Gemini format
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
 * Handle tool calls during props iteration - SPORT-AWARE
 * Uses BDL MCP for accurate player stats per sport
 */
async function handlePropsToolCall(toolCall, sportKey, sportLabel) {
  let args;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    console.warn(`[Props] Failed to parse tool call arguments: ${e.message}`);
    return { error: `Malformed tool call arguments. Please retry with valid JSON.` };
  }
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
        const logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, 15);
        if (!logs?.games?.length) {
          return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
        }
        const games = logs.games.slice(0, 15).map(g => ({
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
        const logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, 15);
        if (!logs?.games?.length) {
          return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
        }
        const games = logs.games.slice(0, 15).map(g => ({
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
        const logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, 15);
        if (!logs?.games?.length) {
          return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
        }
        const games = logs.games.slice(0, 15).map(g => ({
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
      const logs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], nflLogSeason, 15);
      const playerLogs = logs[player.id];

      if (!playerLogs?.games?.length) {
        return { player: args.player_name, team: player.team?.full_name, games: [], message: 'No game logs found' };
      }

      const games = playerLogs.games.slice(0, 15).map(g => ({
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
        const season = nbaSeason();

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
          source: 'BDL v2 Advanced Stats'
        };
      }

      // NHL-specific season stats
      if (isNHL) {
        const season = nhlSeason();
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
      const nflSeasonYear = nflSeason();
      const seasonStats = await ballDontLieService.getNflSeasonStats({ player_ids: [player.id], season: nflSeasonYear });
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
    console.log(`  → [TEAM_INJURIES] ${args.team_name} (RapidAPI — same source as game picks)`);
    try {
      // Use RapidAPI for NBA injuries (same source of truth as game picks)
      if (sportKey === 'basketball_nba') {
        const isoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const apiInjuries = await fetchNbaInjuriesForGame(args.team_name, args.team_name, isoDate);
        if (!apiInjuries) {
          return { error: 'NBA Injuries API unavailable' };
        }
        // Combine home + away (API fetches by matchup but we only need one team)
        const allInjuries = [...(apiInjuries.home || []), ...(apiInjuries.away || [])];
        return {
          team: args.team_name,
          injuries: allInjuries.map(inj => ({
            player: `${inj.player?.first_name} ${inj.player?.last_name}`,
            status: inj.status,
            description: inj.durationContext || 'No details'
          }))
        };
      }
      // Non-NBA: use generic BDL endpoints for the correct sport
      const teams = await ballDontLieService.getTeamsGeneric(sportKey);
      const teamsList = Array.isArray(teams) ? teams : teams?.data || [];
      const team = teamsList.find(t =>
        t.full_name?.toLowerCase().includes(args.team_name.toLowerCase()) ||
        t.name?.toLowerCase().includes(args.team_name.toLowerCase())
      );
      if (!team) return { error: `Team "${args.team_name}" not found for ${sportKey}` };
      const injuries = await ballDontLieService.getInjuriesGeneric(sportKey, { team_ids: [team.id] });
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
        source: 'BDL v2 Advanced Passing'
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
        source: 'BDL v2 Advanced Rushing'
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
        source: 'BDL v2 Advanced Receiving'
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
        insight: `${args.player_name} has ${gamesVsOpponent.length} game${gamesVsOpponent.length !== 1 ? 's' : ''} vs ${opponentTeam.full_name} in the last 2 seasons.`
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
            ? 'Matchup FG%/3PT% and Contested FG% for the requested matchup.'
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
        note: 'Per-game advanced stats for the requested time range.'
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
  // FINALIZE_PROPS - Standard format for all sports
  // ============================================================================
  if (functionName === 'finalize_props') {
    return { finalized: true, picks: args.picks };
  }

  return { error: `Unknown tool: ${functionName}` };
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
    
    // Confidence: store Gary's raw confidence as-is (same as game picks — no manipulation)
    return {
      ...pick,
      confidence: pick.confidence || null,
      key_stats: validatedKeyStats,
      _validation: {
        hasToolData: playerHasToolData,
      }
    };
  });

  return { validatedPicks, warnings, invalidStats };
}

/**
 * Build the PASS 2 message for props - Bilateral OVER/UNDER Analysis
 * After investigation, Gary writes cases for both sides of each candidate prop.
 *
 * @param {Array} candidates - The shortlisted prop candidates to analyze
 * @param {string} sportLabel - Sport identifier
 * @returns {string} - The Pass 2 bilateral analysis prompt
 */
function buildPropsPass2BilateralMessage(candidates, sportLabel = 'NFL', pass2Constitution = '') {
  const candidateList = candidates.slice(0, 8).map((p, i) =>
    `${i + 1}. ${p.player} - ${p.props?.map(pr => `${pr.type} ${pr.line}`).join(', ') || 'TBD'}`
  ).join('\n');

  return `## PASS 2 — BILATERAL CASES

${pass2Constitution ? pass2Constitution + '\n\n---\n\n' : ''}STOP. Write detailed bilateral analysis before finalizing.

YOUR CANDIDATES:
${candidateList}

Write bilateral OVER/UNDER cases for each candidate. Be specific — cite numbers and mechanisms from your investigation. Give both sides equal depth. End each with a verdict.

${Math.random() > 0.5 ? 'Start with CASE FOR OVER, then CASE FOR UNDER.' : 'Start with CASE FOR UNDER, then CASE FOR OVER.'}

DO NOT call any tools. Write text analysis only. Start with ${candidates[0]?.player || 'your first candidate'}.`;
}

/**
 * Run full iteration loop for props using PERSISTENT chat session
 * The chat session manages its own history, avoiding thoughtSignature issues
 */
async function runPropsIterationLoop({ systemPrompt, userMessage, sportKey, sportLabel = 'NFL', constitution = null, maxIterations = 12, regularOnly = false, validatedPlayerNames = null, minInvestigatedPlayers = 5, maxPicksPerGame = 2 }) {
  // Extract constitution sections for phase-aligned injection
  const constPass2 = (constitution && typeof constitution === 'object') ? (constitution.pass2 || '') : '';
  const constPass25 = (constitution && typeof constitution === 'object') ? (constitution.pass25 || '') : '';
  const constPass3 = (constitution && typeof constitution === 'object') ? (constitution.pass3 || '') : '';

  const gemini = getGeminiForProps();
  
  // Get sport-specific tools
  // regularOnly=true for NFL uses non-TD tools (when TDs are handled separately)
  const sportTools = getPropsToolsForSport(sportLabel, regularOnly);
  const functionDeclarations = convertToolsForGemini(sportTools);
  const toolMode = regularOnly && sportLabel === 'NFL' ? '(regular props only - no TDs)' : '';
  console.log(`[Props] Using ${sportLabel} tools ${toolMode}: ${sportTools.map(t => t.function.name).join(', ')}`);
  
  // Get the props model for this sport
  const propsModel = getPropsModelForSport(sportLabel);
  
  // Create model with tools
  // GEMINI 3 FLASH SETTINGS FOR PROPS (Updated per Google best practices):
  // - temperature: 1.0 (Google's recommended default - lower causes looping/degraded math)
  // - thinkingLevel: "low" for tool dispatch (~5-8s) - pure pattern matching, minimal thinking
  // - All passes use the same model (no separate high-thinking calls)
  const model = gemini.getGenerativeModel({
    model: propsModel,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    tools: [{ functionDeclarations }],
    generationConfig: {
      temperature: 1.0, // Gemini 3 optimized default - DO NOT lower (causes looping on math tasks)
      topP: 0.95,
      maxOutputTokens: 8000,
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'high' // "high" = deep reasoning for investigation + evaluation
      }
    }
  });
  
  // Create PERSISTENT chat session with system instruction
  const chat = model.startChat({
    systemInstruction: { parts: [{ text: systemPrompt }] }
  });

  let iteration = 0;
  const toolCallHistory = [];
  let consecutiveEmptyResponses = 0;

  // ═══════════════════════════════════════════════════════════════════
  // 4-PASS PIPELINE (mirrors game picks: orchestrator/agentLoop.js)
  //   Pass 1: Investigation (Flash + high reasoning) — tool calls for player stats
  //   Pass 2: Bilateral Cases (text only) — OVER/UNDER for each candidate
  //   Pass 2.5: Evaluation (text only) — stress test cases, decide which 2
  //   Pass 3: Finalize — call finalize_props with 2 picks
  // ═══════════════════════════════════════════════════════════════════
  let _pass2Injected = false;   // Bilateral case writing injected
  let _pass25Injected = false;  // Evaluation injected
  let _pass3Injected = false;   // Finalize injected

  // Helper: count investigated players (tool data available)
  function getInvestigatedPlayerCount() {
    const players = new Set();
    for (const { tool, result: r } of toolCallHistory) {
      if (['fetch_player_game_logs', 'fetch_player_season_stats', 'fetch_player_advanced_stats', 'fetch_player_game_advanced'].includes(tool) && r?.player) {
        players.add(r.player.toLowerCase());
      }
    }
    return players.size;
  }

  // Helper: detect bilateral OVER/UNDER case completion (Pass 2 → 2.5)
  function detectBilateralCases(text) {
    const lower = text.toLowerCase();
    const overCases = (lower.match(/case for over/g) || []).length;
    const underCases = (lower.match(/case for under/g) || []).length;
    const verdicts = (lower.match(/verdict:/g) || []).length;
    // Need at least 2 candidates with OVER+UNDER cases, or 2 verdicts
    return (overCases >= 2 && underCases >= 2) || verdicts >= 2;
  }

  // Helper: build candidate list from investigation history for Pass 2
  function buildInvestigatedCandidates() {
    const candidates = [];
    const seen = new Set();
    for (const { tool, result: r } of toolCallHistory) {
      if (['fetch_player_game_logs', 'fetch_player_season_stats'].includes(tool) && r?.player) {
        const name = r.player;
        if (!seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          candidates.push({ player: name, props: [] });
        }
      }
    }
    return candidates;
  }

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
    const textContent = textParts.join('');

    console.log(`[Props] Response: ${functionCallParts.length} function call(s), ${textParts.length} text part(s)`);

    // ═══════════════════════════════════════════════════════════════════
    // FINALIZE GATE — Only accept finalize_props after Pass 3
    // ═══════════════════════════════════════════════════════════════════
    const finalizeCall = functionCallParts.find(fc => fc.functionCall?.name === 'finalize_props');
    if (finalizeCall) {
      const args = finalizeCall.functionCall.args || {};
      let picks = args.picks || [];
      console.log(`[Props] Gary called finalize_props with ${picks.length} picks`);

      // GATE: Reject if pipeline not complete
      if (!_pass3Injected && iteration < maxIterations - 1) {
        const playersInvestigated = getInvestigatedPlayerCount();

        // Build function responses for ALL calls (must respond to every function call)
        const functionResponses = [];
        for (const fc of functionCallParts) {
          if (fc.functionCall?.name === 'finalize_props') {
            functionResponses.push({
              functionResponse: {
                name: 'finalize_props',
                response: { content: JSON.stringify({ error: 'Complete analysis pipeline before finalizing.' }) }
              }
            });
          } else {
            // Process other tool calls normally
            const toolCall = { function: { name: fc.functionCall.name, arguments: JSON.stringify(fc.functionCall.args || {}) } };
            const toolResult = await handlePropsToolCall(toolCall, sportKey, sportLabel);
            toolCallHistory.push({ tool: fc.functionCall.name, result: toolResult });
            functionResponses.push({
              functionResponse: {
                name: fc.functionCall.name,
                response: { content: JSON.stringify(toolResult) }
              }
            });
          }
        }
        iteration++;
        result = await chat.sendMessage(functionResponses);
        response = result.response;

        // Inject the appropriate next pass
        if (!_pass2Injected && playersInvestigated >= minInvestigatedPlayers) {
          _pass2Injected = true;
          const candidates = buildInvestigatedCandidates();
          console.log(`[Props] PIPELINE GATE: finalize before Pass 2 — injecting bilateral cases (${playersInvestigated} players investigated)`);
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 2 — bilateral cases)`);
          result = await chat.sendMessage(buildPropsPass2BilateralMessage(candidates, sportLabel, constPass2));
          response = result.response;
        } else if (!_pass2Injected) {
          console.log(`[Props] PIPELINE GATE: finalize too early — only ${playersInvestigated} players investigated (need ${minInvestigatedPlayers}+)`);
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (need more investigation)`);
          result = await chat.sendMessage(`You've only investigated ${playersInvestigated} player(s). Investigate at least ${minInvestigatedPlayers} players before finalizing. Use your tools to investigate more candidates.`);
          response = result.response;
        } else if (!_pass25Injected) {
          _pass25Injected = true;
          console.log(`[Props] PIPELINE GATE: finalize before Pass 2.5 — injecting evaluation`);
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 2.5 — evaluation)`);
          result = await chat.sendMessage(`## PASS 2.5 — EVALUATION

${constPass25 ? constPass25 + '\n\n---\n\n' : ''}You've written OVER/UNDER cases. Evaluate them honestly.

Identify your 2 best picks. Write your evaluation as text. Do NOT call finalize_props yet.`);
          response = result.response;
        } else {
          _pass3Injected = true;
          console.log(`[Props] PIPELINE GATE: finalize before Pass 3 — injecting final instruction`);
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 3 — finalize)`);
          result = await chat.sendMessage(`## PASS 3 — FINALIZE

${constPass3 ? constPass3 + '\n\n---\n\n' : ''}Your investigation and evaluation are complete. Call finalize_props NOW with your 2 best picks.

KEY_STATS must reference actual tool responses.

For each pick provide:
- player, prop, line, odds, bet (OVER/UNDER), confidence (0.50-0.95 — use precise values like 0.72, 0.81, not round numbers), rationale, key_stats

Call finalize_props now.`);
          response = result.response;
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════
      // ACCEPTED — Pass 3 complete, process the picks
      // ═══════════════════════════════════════════════════════════════════
      console.log(`[Props] ✓ Pass 3 complete — accepting ${picks.length} picks`);

      // Trim to top N by confidence (default 2 per game, WBC uses higher)
      if (Array.isArray(picks) && picks.length > maxPicksPerGame) {
        console.log(`[Props] Gary submitted ${picks.length} picks — trimming to top ${maxPicksPerGame} by confidence`);
        picks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        picks = picks.slice(0, maxPicksPerGame);
        console.log(`[Props] Kept: ${picks.map(p => `${p.player} ${p.prop}`).join(', ')}`);
      }

      // Direction balance check (informational only)
      if (Array.isArray(picks) && picks.length > 0) {
        const normalizedBets = picks
          .map(p => (p?.bet || '').toString().trim().toLowerCase())
          .filter(b => b === 'over' || b === 'under');
        const uniqueDirections = new Set(normalizedBets);
        if (normalizedBets.length === picks.length && uniqueDirections.size === 1) {
          console.log(`[Props] ℹ️ All picks are "${normalizedBets[0]}" — accepting (sharp slates often lean one way)`);
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

      // Filter out picks for players NOT on valid teams
      let finalPicks = validatedPicks;
      if (validatedPlayerNames && validatedPlayerNames.size > 0) {
        const beforeCount = finalPicks.length;
        finalPicks = finalPicks.filter(pick => {
          const playerKey = (pick.player || '').toLowerCase();
          const isValid = validatedPlayerNames.has(playerKey);
          if (!isValid) {
            console.log(`[Props Validation] ❌ REJECTED: ${pick.player} — not verified on either team (stale roster data)`);
          }
          return isValid;
        });
        if (finalPicks.length < beforeCount) {
          console.log(`[Props Validation] Filtered ${beforeCount - finalPicks.length} pick(s) with invalid team assignments`);
        }
      }

      return {
        picks: finalPicks,
        iterations: iteration,
        toolCalls: toolCallHistory.length,
        warnings,
        droppedByConstraint: 0,
        garySpecials: 0
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // TOOL CALLS — Pass 1 Investigation
    // ═══════════════════════════════════════════════════════════════════
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
        functionResponses.push({
          functionResponse: {
            name: fc.functionCall.name,
            response: { content: JSON.stringify(toolResult) }
          }
        });
      }

      // Send all function responses
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations}`);
      result = await chat.sendMessage(functionResponses);
      response = result.response;

      // Check if investigation threshold met → inject Pass 2
      if (!_pass2Injected) {
        const playersInvestigated = getInvestigatedPlayerCount();
        if (playersInvestigated >= 5 && iteration < maxIterations - 3) {
          _pass2Injected = true;
          const candidates = buildInvestigatedCandidates();
          console.log(`[Props] ✓ ${playersInvestigated} players investigated — injecting PASS 2 (bilateral cases)`);
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 2 — bilateral cases)`);
          result = await chat.sendMessage(buildPropsPass2BilateralMessage(candidates, sportLabel, constPass2));
          response = result.response;
        }
      }

      // Urgency: approaching max iterations — accelerate pipeline
      if (iteration >= maxIterations - 2 && !_pass3Injected) {
        console.log(`[Props] ⚠️ Approaching max iterations — accelerating pipeline`);
        if (!_pass2Injected) {
          _pass2Injected = true;
          const candidates = buildInvestigatedCandidates();
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 2 — forced by iteration limit)`);
          result = await chat.sendMessage(buildPropsPass2BilateralMessage(candidates, sportLabel, constPass2));
          response = result.response;
        }
      }
      continue;
    }

    // ═══════════════════════════════════════════════════════════════════
    // TEXT RESPONSE — Pass transitions
    // ═══════════════════════════════════════════════════════════════════
    if (textContent) {
      consecutiveEmptyResponses = 0;

      // Pass 2 → 2.5: Check for bilateral case completion
      if (_pass2Injected && !_pass25Injected) {
        if (detectBilateralCases(textContent)) {
          _pass25Injected = true;
          console.log(`[Props] ✓ Bilateral cases detected — injecting PASS 2.5 (evaluation)`);
          iteration++;
          console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 2.5 — evaluation)`);
          result = await chat.sendMessage(`## PASS 2.5 — EVALUATION

${constPass25 ? constPass25 + '\n\n---\n\n' : ''}You've written OVER/UNDER cases. Evaluate them honestly.

Identify your 2 best picks. Write your evaluation as text. Do NOT call finalize_props yet.`);
          response = result.response;
          continue;
        }
        // Bilateral not complete — nudge to continue
        iteration++;
        console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (waiting for bilateral cases)`);
        result = await chat.sendMessage('Continue writing your bilateral OVER/UNDER analysis for each candidate. Write CASE FOR OVER and CASE FOR UNDER for each player, then a VERDICT.');
        response = result.response;
        continue;
      }

      // Pass 2.5 → 3: Evaluation complete → inject finalize
      if (_pass25Injected && !_pass3Injected) {
        _pass3Injected = true;
        console.log(`[Props] ✓ Evaluation complete — injecting PASS 3 (finalize)`);
        iteration++;
        console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (PASS 3 — finalize)`);
        result = await chat.sendMessage(`## PASS 3 — FINALIZE

${constPass3 ? constPass3 + '\n\n---\n\n' : ''}Your investigation and evaluation are complete. Call finalize_props NOW with your 2 best picks.

KEY_STATS must reference actual tool responses.

For each pick provide:
- player, prop, line, odds, bet (OVER/UNDER), confidence (0.50-0.95 — use precise values like 0.72, 0.81, not round numbers), rationale, key_stats

Call finalize_props now.`);
        response = result.response;
        continue;
      }

      // Fallback: check for JSON picks in text (after Pass 3)
      // Search all code-fenced JSON blocks — Flash may output game pick JSON before props JSON
      if (_pass3Injected) {
        const codeBlocks = [...textContent.matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g)];
        for (const block of codeBlocks) {
          try {
            const parsed = JSON.parse(block[1]);
            if (Array.isArray(parsed.picks)) {
              console.log(`[Props] ✓ Found picks in text response (fallback)`);
              const { validatedPicks, warnings } = validatePropsAgainstToolHistory(parsed.picks, toolCallHistory);
              if (warnings.length > 0) {
                console.log(`[Props Validation] ⚠️ ${warnings.length} warning(s)`);
              }
              return {
                picks: validatedPicks,
                iterations: iteration,
                toolCalls: toolCallHistory.length,
                warnings,
                droppedByConstraint: 0,
                garySpecials: 0
              };
            }
          } catch { /* not valid JSON or no picks array — try next block */ }
        }
      }

      // Generic text — prompt to continue/finalize
      iteration++;
      if (_pass3Injected) {
        console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (prompting finalize tool call)`);
        result = await chat.sendMessage('Call the finalize_props tool with your 2 best prop picks now. Use the tool — do not write JSON in text.');
        response = result.response;
      } else {
        console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (text response — continuing)`);
        result = await chat.sendMessage('Continue your analysis. Use BDL tools to investigate player stats.');
        response = result.response;
      }
      continue;
    }

    // ═══════════════════════════════════════════════════════════════════
    // EMPTY RESPONSE — Handle gracefully
    // ═══════════════════════════════════════════════════════════════════
    if (functionCallParts.length === 0 && textParts.length === 0) {
      consecutiveEmptyResponses++;
      console.log(`[Props] Empty response from Gemini (${consecutiveEmptyResponses} consecutive)`);

      iteration++;
      if (iteration >= maxIterations) {
        console.log(`[Props] Max iterations reached with empty responses`);
        break;
      }

      // After 3 consecutive empties, force finalization
      if (consecutiveEmptyResponses >= 3) {
        console.log(`[Props] ⚠️ Too many empty responses — forcing pipeline completion`);
        // Force through remaining passes
        if (!_pass2Injected) _pass2Injected = true;
        if (!_pass25Injected) _pass25Injected = true;
        if (!_pass3Injected) _pass3Injected = true;

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

        const forcePrompt = `CRITICAL: You have stopped responding. This is your FINAL chance to produce picks.

You have gathered data on: ${playerDataSummary || 'multiple players'}.

Call finalize_props NOW with your 2 best prop picks.`;

        result = await chat.sendMessage(forcePrompt);
        response = result.response;

        // If still empty after force, give up
        const forcedParts = response.candidates?.[0]?.content?.parts || [];
        if (forcedParts.length === 0) {
          console.log(`[Props] ❌ Gemini unresponsive after force prompt — aborting`);
          break;
        }
        consecutiveEmptyResponses = 0;
        continue;
      }

      // Add small delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = await chat.sendMessage('You returned an empty response. Continue your analysis or call finalize_props with your picks.');
      response = result.response;
      continue;
    }

    // Reset empty counter on successful response
    consecutiveEmptyResponses = 0;

    // Nudge when approaching max iterations
    if (iteration >= maxIterations - 1 && !_pass3Injected) {
      iteration++;
      console.log(`\n[Props Iteration ${sportLabel}] ${iteration}/${maxIterations} (final warning — forcing pipeline)`);
      // Force through to Pass 3
      if (!_pass2Injected) _pass2Injected = true;
      if (!_pass25Injected) _pass25Injected = true;
      _pass3Injected = true;
      result = await chat.sendMessage(`## PASS 3 — FINALIZE (FINAL ROUND)

⚠️ This is your LAST round. Call finalize_props NOW with your 2 best picks based on all data gathered.`);
      response = result.response;
    }
  }

  // Post-loop: pipeline didn't complete
  const passStatus = `Pass 2: ${_pass2Injected ? '✓' : '✗'} | Pass 2.5: ${_pass25Injected ? '✓' : '✗'} | Pass 3: ${_pass3Injected ? '✓' : '✗'}`;
  console.log(`[Props] Max iterations reached without finalization. Pipeline: ${passStatus}`);
  return { picks: [], iterations: iteration, toolCalls: toolCallHistory.length };
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
 * PHASE-ALIGNED: Only Pass 1 awareness + always-on guardrails go here.
 * Pass 2/2.5/3 context is injected dynamically at each pass transition.
 */
function buildPropsIterationPrompt(gameSummary, propCandidates, narrativeContext, sportLabel, regularOnly = false, constitution = null) {
  // Constitution passed from caller to avoid redundant getConstitution() call
  if (!constitution) constitution = getConstitution(sportLabel);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  // NHL/NBA season labels: Jan-Sep 2026 is the 2025-26 season
  const seasonLabel = (sportLabel === 'NHL' || sportLabel === 'NBA')
    ? (month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`)
    : `${year}`;

  // Add NFL regular-only restrictions when TDs are handled separately
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

  // Constitution is a sectioned object — only pass1 goes in the system prompt
  const baseRules = (typeof constitution === 'object' && constitution.baseRules) ? constitution.baseRules : '';
  const pass1Constitution = (typeof constitution === 'object' && constitution.pass1) ? constitution.pass1 : '';

  return `
${nflRegularOnlyInstructions}

## CURRENT DATE & SEASON
Current Date: ${dateStr}
Current Season: ${seasonLabel}
(CRITICAL: Ensure you are looking for stats from the ${seasonLabel} season. You are in the middle of the ${seasonLabel} season.)

${baseRules}

## YOUR TASK: PASS 1 — INVESTIGATION

Investigate 4-6 players using BDL tools:
- \`fetch_player_game_logs\` — Recent performance (L5-10 games)
- \`fetch_player_season_stats\` — Baseline to compare against recency

Props should reflect your understanding of the GAME — how player opportunities align with the game flow you expect tonight.

**OUTPUT: 2 PROPS PER GAME** — Quality over quantity. Two confident picks beat five shaky ones.

The system enforces a 4-pass pipeline. Additional context will be provided at each pass:
- Pass 2: Bilateral OVER/UNDER cases (injected after investigation)
- Pass 2.5: Evaluation (injected after bilateral cases)
- Pass 3: Finalize (injected after evaluation)

finalize_props calls are BLOCKED until all passes are complete.

${narrativeContext ? `## LIVE CONTEXT (from Gemini Search)\n${narrativeContext}\n` : ''}

---

## INVESTIGATION AWARENESS

${pass1Constitution}

---

## ZERO TOLERANCE FOR HALLUCINATION

Copy numbers VERBATIM from tool responses. Calculate averages from ONLY the numbers tools gave you.
If data is unavailable, say "stats unavailable." NEVER use training data for stats, names, or team info.
`;
}

/**
 * Main pipeline runner for props
 */

// Map sport labels to their sport keys
const SPORT_KEYS = {
  'NFL': 'americanfootball_nfl',
  'NBA': 'basketball_nba',
  'NHL': 'icehockey_nhl',
  'NCAAB': 'basketball_ncaab',
  'NCAAF': 'americanfootball_ncaaf',
  'WBC': 'baseball_mlb'
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

  const modeLabel = regularOnly && sportLabel === 'NFL' ? ' (regular props only - TDs handled separately)' : '';
  console.log(`[Agentic Props][${sportLabel}] Using full iteration loop with BDL MCP tools${modeLabel}`);

  const constitution = getConstitution(sportLabel);
  const systemPrompt = buildPropsIterationPrompt(
    context.gameSummary,
    context.propCandidates,
    context.narrativeContext,
    sportLabel,
    regularOnly,  // Pass through to inform Gary about prop restrictions
    constitution  // Pass sectioned constitution to avoid redundant call
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
      usageTrend: p.recentForm.usageTrend
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

1. Scout the prop candidates
2. Investigate at least 6 players with tool calls before shortlisting
3. Write BILATERAL analysis (OVER case + UNDER case) for your top picks
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
    constitution,  // Sectioned object for phase-aligned delivery
    // Give room for bilateral analysis + direction-bias recheck pass + finalization
    // Increased from 8 to 10 to allow hard bilateral enforcement without timeout
    maxIterations: options.maxIterations ?? 15,
    regularOnly,  // Pass through for NFL regular-only mode
    validatedPlayerNames,  // Pass validated player names to filter invalid picks
    minInvestigatedPlayers: options.minInvestigatedPlayers ?? 5,  // WBC uses 0 (data from grounding, not BDL)
    maxPicksPerGame: options.maxPicksPerGame ?? 2  // WBC HR slate uses 5
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
    // NOTE: No default — if Gary omits bet direction, we log a warning (don't silently default to 'over')
    bet: pick.bet ? (pick.bet.toLowerCase() === 'yes' ? 'over' : pick.bet.toLowerCase()) : null,
    odds: pick.odds || null,
    confidence: pick.confidence || null,
    rationale: cleanSourceTags(pick.rationale) || 'Analysis based on matchup data.',
    key_stats: cleanKeyStats(pick.key_stats),
    analysis: cleanSourceTags(pick.rationale) || 'Analysis based on matchup data.',
  }));

  // Filter out picks with missing bet direction (Gary must explicitly choose OVER or UNDER)
  const validBetPicks = allPicks.filter(p => {
    if (!p.bet) {
      console.warn(`[Props] ⚠️ Dropping pick for ${p.player} — missing bet direction (no default to OVER)`);
      return false;
    }
    return true;
  });

  // NBA/NHL PROPS: Mirror NBA/NHL game-picks quantum behavior
  // - Gary produces a shortlist (target: 5)
  // - Quantum scores are tracked for research only (NOT used as a filter)
  // - This can yield 0..5 surviving props per game
  if (sportLabel === 'NBA' || sportLabel === 'NHL') {
    
    // NHL-SPECIFIC: Filter out invalid prop types that Gary might have picked
    // Period-specific props (1p, 2p, 3p) and random goal props are NOT analyzable
    let validPicks = validBetPicks;
    if (sportLabel === 'NHL') {
      const INVALID_NHL_PROP_PATTERNS = [
        '_1p', '_2p', '_3p',           // Period-specific: anytime_goal_2p, points_3p
        '1p_', '2p_', '3p_',           // Alternative format
        'first_goal', 'second_goal', 'third_goal', 'last_goal', 'overtime_goal',
        'first_scorer', 'second_scorer', 'third_scorer', 'last_scorer'
      ];

      const originalCount = validBetPicks.length;
      validPicks = validBetPicks.filter(pick => {
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
    
    return {
      picks: validPicks,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
      elapsedMs: Date.now() - start
    };
  }

  // Sort by confidence and keep top N
  const sortedPicks = validBetPicks.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // NFL: Take top 3, Other sports: Take top N
  let finalPicks;
  if (sportLabel === 'NFL') {
    // NFL: Top 3 by confidence
    finalPicks = sortedPicks.slice(0, 3);
    console.log(`[Agentic Props][${sportLabel}] Taking TOP 3 from ${validBetPicks.length} shortlisted picks (fallback mode)`);
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

export { getConstitution as getPropsConstitution, applyPropsPerGameConstraint };

export default {
  runAgenticPropsPipeline
};
