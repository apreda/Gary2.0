/**
 * DFS Tool Definitions for Gemini Function Calling
 *
 * These tools allow Gary (via Gemini Flash/Pro) to investigate
 * players and games using real data from BDL, RotoWire, etc.
 *
 * FOLLOWS CLAUDE.md: Gary INVESTIGATES before deciding.
 * These tools give him the data he needs.
 */

import { ballDontLieService } from '../../../ballDontLieService.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SLATE ANALYSIS TOOLS (Used by Flash in Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════

export const DFS_SLATE_ANALYSIS_TOOLS = [
  {
    name: 'GET_TEAM_INJURIES',
    description: 'Get current injury report for a team. Returns OUT, GTD, and Questionable players with their roles.',
    parameters: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Team abbreviation (e.g., LAL, BOS, GSW)'
        }
      },
      required: ['team']
    }
  },
  {
    name: 'GET_USAGE_BOOST',
    description: 'When a player is OUT, find who absorbs their usage. Returns beneficiaries with projected boost.',
    parameters: {
      type: 'object',
      properties: {
        outPlayer: {
          type: 'string',
          description: 'Name of the player who is OUT'
        },
        team: {
          type: 'string',
          description: 'Team abbreviation'
        }
      },
      required: ['outPlayer', 'team']
    }
  },
  {
    name: 'GET_GAME_ENVIRONMENT',
    description: 'Get Vegas lines, O/U, pace data for a specific game.',
    parameters: {
      type: 'object',
      properties: {
        homeTeam: {
          type: 'string',
          description: 'Home team abbreviation'
        },
        awayTeam: {
          type: 'string',
          description: 'Away team abbreviation'
        }
      },
      required: ['homeTeam', 'awayTeam']
    }
  },
  {
    name: 'GET_PLAYER_SALARY',
    description: 'Get DFS salary and ownership projection for a player.',
    parameters: {
      type: 'object',
      properties: {
        playerName: {
          type: 'string',
          description: 'Player full name'
        }
      },
      required: ['playerName']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER INVESTIGATION TOOLS (Used by Flash in Phase 4)
// ═══════════════════════════════════════════════════════════════════════════════

export const DFS_PLAYER_INVESTIGATION_TOOLS = [
  {
    name: 'GET_PLAYER_GAME_LOGS',
    description: 'Get a player\'s last N games with full stats. Use to assess recent form.',
    parameters: {
      type: 'object',
      properties: {
        playerName: {
          type: 'string',
          description: 'Player full name'
        },
        games: {
          type: 'number',
          description: 'Number of recent games to fetch (default 5)'
        }
      },
      required: ['playerName']
    }
  },
  {
    name: 'GET_PLAYER_SEASON_STATS',
    description: 'Get player season averages including advanced stats (usage, TS%, etc.).',
    parameters: {
      type: 'object',
      properties: {
        playerName: {
          type: 'string',
          description: 'Player full name'
        }
      },
      required: ['playerName']
    }
  },
  {
    name: 'GET_MATCHUP_DATA',
    description: 'Get defense vs position (DvP) data for a player\'s matchup tonight.',
    parameters: {
      type: 'object',
      properties: {
        playerName: {
          type: 'string',
          description: 'Player full name'
        },
        position: {
          type: 'string',
          description: 'Player position (PG, SG, SF, PF, C)'
        },
        opponent: {
          type: 'string',
          description: 'Opponent team abbreviation'
        }
      },
      required: ['playerName', 'opponent']
    }
  },
  {
    name: 'GET_TEAMMATE_STATUS',
    description: 'Check injury/status of a player\'s teammates to identify usage opportunities.',
    parameters: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Team abbreviation'
        }
      },
      required: ['team']
    }
  },
  {
    name: 'SEARCH_LATEST_NEWS',
    description: 'Search for latest news about a player (injury updates, role changes, trade rumors).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "LeBron James injury status today")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'GET_PLAYER_VS_TEAM_HISTORY',
    description: 'Get a player\'s historical performance against a specific opponent.',
    parameters: {
      type: 'object',
      properties: {
        playerName: {
          type: 'string',
          description: 'Player full name'
        },
        opponent: {
          type: 'string',
          description: 'Opponent team abbreviation'
        }
      },
      required: ['playerName', 'opponent']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// ALL TOOLS COMBINED
// ═══════════════════════════════════════════════════════════════════════════════

export const ALL_DFS_TOOLS = [
  ...DFS_SLATE_ANALYSIS_TOOLS,
  ...DFS_PLAYER_INVESTIGATION_TOOLS
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a tool call and return the result
 *
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} args - Arguments passed to the tool
 * @param {Object} context - DFS context with players, games, etc.
 * @returns {Object} - Tool execution result
 */
export async function executeToolCall(toolName, args, context) {
  try {
    switch (toolName) {
      case 'GET_TEAM_INJURIES':
        return await getTeamInjuries(args.team, context);

      case 'GET_USAGE_BOOST':
        return await getUsageBoost(args.outPlayer, args.team, context);

      case 'GET_GAME_ENVIRONMENT':
        return await getGameEnvironment(args.homeTeam, args.awayTeam, context);

      case 'GET_PLAYER_SALARY':
        return getPlayerSalary(args.playerName, context);

      case 'GET_PLAYER_GAME_LOGS':
        return await getPlayerGameLogs(args.playerName, args.games || 5, context);

      case 'GET_PLAYER_SEASON_STATS':
        return await getPlayerSeasonStats(args.playerName, context);

      case 'GET_MATCHUP_DATA':
        return await getMatchupData(args.playerName, args.position, args.opponent, context);

      case 'GET_TEAMMATE_STATUS':
        return await getTeammateStatus(args.team, context);

      case 'SEARCH_LATEST_NEWS':
        return await searchLatestNews(args.query);

      case 'GET_PLAYER_VS_TEAM_HISTORY':
        return await getPlayerVsTeamHistory(args.playerName, args.opponent, context);

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`[DFS Tools] Error executing ${toolName}:`, error.message);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function getTeamInjuries(team, context) {
  // Check context first
  const contextInjuries = context.injuries?.[team];
  if (contextInjuries && contextInjuries.length > 0) {
    return {
      team,
      injuries: contextInjuries.map(i => ({
        player: i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player,
        status: i.status,
        reason: i.reason || i.injury,
        impact: i.impact || 'Unknown'
      }))
    };
  }

  // Fetch from BDL
  try {
    const injuries = await ballDontLieService.getInjuries('basketball_nba');
    const teamInjuries = (injuries || []).filter(i => {
      const playerTeam = i.player?.team?.abbreviation || i.team;
      return playerTeam?.toUpperCase() === team.toUpperCase();
    });

    return {
      team,
      injuries: teamInjuries.map(i => ({
        player: i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player,
        status: i.status,
        reason: i.reason || i.injury
      }))
    };
  } catch (e) {
    return { team, injuries: [], error: e.message };
  }
}

async function getUsageBoost(outPlayer, team, context) {
  // Find the out player's stats to estimate usage redistribution
  const players = context.players?.filter(p => p.team === team) || [];

  // Find the out player in context
  const outPlayerData = players.find(p =>
    p.name?.toLowerCase().includes(outPlayer.toLowerCase()) ||
    outPlayer.toLowerCase().includes(p.name?.toLowerCase())
  );

  const outPlayerUsage = outPlayerData?.usage || outPlayerData?.seasonStats?.usg_pct || 25;
  const outPlayerMinutes = outPlayerData?.mpg || outPlayerData?.seasonStats?.mpg || 32;

  // Identify likely beneficiaries (same position, similar role)
  const beneficiaries = players
    .filter(p => p.name !== outPlayerData?.name)
    .filter(p => {
      // Same position or adjacent
      const positions = p.positions || [p.position];
      const outPositions = outPlayerData?.positions || [outPlayerData?.position];
      return positions.some(pos => outPositions?.includes(pos)) ||
             (p.mpg && p.mpg >= 15); // Or significant minute players
    })
    .slice(0, 5)
    .map(p => ({
      name: p.name,
      currentUsage: p.usage || p.seasonStats?.usg_pct || 20,
      currentMinutes: p.mpg || p.seasonStats?.mpg || 20,
      projectedBoost: Math.round((outPlayerUsage / 3) * 10) / 10, // Rough estimate
      salary: p.salary,
      priceAdjusted: false // Would need to check if salary moved
    }));

  return {
    outPlayer,
    team,
    outPlayerUsage,
    outPlayerMinutes,
    beneficiaries
  };
}

async function getGameEnvironment(homeTeam, awayTeam, context) {
  // Look for game in context
  const game = context.games?.find(g => {
    const h = g.homeTeam || g.home_team?.abbreviation;
    const a = g.awayTeam || g.away_team?.abbreviation;
    return (h === homeTeam && a === awayTeam) || (h === awayTeam && a === homeTeam);
  });

  if (game) {
    return {
      homeTeam,
      awayTeam,
      spread: game.spread || game.homeSpread || 0,
      overUnder: game.overUnder || game.total || 220,
      homeMoneyline: game.homeMoneyline || game.home_ml,
      awayMoneyline: game.awayMoneyline || game.away_ml,
      pace: game.pace || 'medium',
      impliedTotal: {
        home: game.homeImpliedTotal || (game.overUnder / 2 - game.spread / 2),
        away: game.awayImpliedTotal || (game.overUnder / 2 + game.spread / 2)
      }
    };
  }

  // Fallback to BDL odds
  try {
    const odds = await ballDontLieService.getOdds('basketball_nba', {});
    const gameOdds = odds?.find(o =>
      (o.home_team?.abbreviation === homeTeam && o.away_team?.abbreviation === awayTeam)
    );

    if (gameOdds) {
      return {
        homeTeam,
        awayTeam,
        spread: gameOdds.spread || 0,
        overUnder: gameOdds.over_under || 220
      };
    }
  } catch (e) {
    // Fallback defaults
  }

  return {
    homeTeam,
    awayTeam,
    spread: 0,
    overUnder: 220,
    note: 'Could not find game odds - using defaults'
  };
}

function getPlayerSalary(playerName, context) {
  const player = context.players?.find(p =>
    p.name?.toLowerCase() === playerName.toLowerCase() ||
    p.name?.toLowerCase().includes(playerName.toLowerCase())
  );

  if (player) {
    return {
      player: player.name,
      salary: player.salary,
      position: player.position || player.positions?.join('/'),
      team: player.team,
      projectedPts: player.projected_pts || player.projection,
      ownership: player.ownership || 'Unknown'
    };
  }

  return { player: playerName, error: 'Player not found in slate' };
}

async function getPlayerGameLogs(playerName, games, context) {
  // Find player in context first
  const player = context.players?.find(p =>
    p.name?.toLowerCase().includes(playerName.toLowerCase())
  );

  if (player?.recentGames) {
    return {
      player: player.name,
      games: player.recentGames.slice(0, games),
      l5Avg: player.l5Stats || calculateL5Avg(player.recentGames)
    };
  }

  // Fetch from BDL
  try {
    // Would need player ID - simplified for now
    return {
      player: playerName,
      games: [],
      note: 'Game logs require player ID lookup - check context'
    };
  } catch (e) {
    return { player: playerName, error: e.message };
  }
}

async function getPlayerSeasonStats(playerName, context) {
  const player = context.players?.find(p =>
    p.name?.toLowerCase().includes(playerName.toLowerCase())
  );

  if (player) {
    return {
      player: player.name,
      team: player.team,
      seasonStats: {
        ppg: player.ppg || player.seasonStats?.ppg,
        rpg: player.rpg || player.seasonStats?.rpg,
        apg: player.apg || player.seasonStats?.apg,
        mpg: player.mpg || player.seasonStats?.mpg,
        usage: player.usage || player.seasonStats?.usg_pct,
        trueShootingPct: player.seasonStats?.ts_pct,
        efgPct: player.seasonStats?.efg_pct
      },
      salary: player.salary,
      valuePerDollar: player.salary ? ((player.projected_pts || 0) / player.salary * 1000).toFixed(2) : 'N/A'
    };
  }

  return { player: playerName, error: 'Player not found' };
}

async function getMatchupData(playerName, position, opponent, context) {
  // Get DvP data for the opponent
  const dvpData = context.dvpRankings?.[opponent]?.[position];

  return {
    player: playerName,
    position,
    opponent,
    dvp: dvpData || {
      rank: 'Unknown',
      pointsAllowed: 'Check BDL',
      note: 'DvP data not in context - investigate manually'
    }
  };
}

async function getTeammateStatus(team, context) {
  const teammates = context.players?.filter(p => p.team === team) || [];
  const injuries = context.injuries?.[team] || [];

  return {
    team,
    healthyPlayers: teammates.filter(p => p.status !== 'OUT').map(p => ({
      name: p.name,
      position: p.position,
      salary: p.salary,
      projectedMinutes: p.mpg || p.seasonStats?.mpg
    })),
    injuries: injuries.map(i => ({
      player: i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player,
      status: i.status
    }))
  };
}

async function searchLatestNews(query) {
  // This would use Gemini Grounding in production
  // For now, return a placeholder
  return {
    query,
    note: 'News search requires Gemini Grounding - use google_search tool in prompt',
    suggestion: 'Ask Gary Pro to use web search for latest injury/news updates'
  };
}

async function getPlayerVsTeamHistory(playerName, opponent, context) {
  // Would need historical game data
  return {
    player: playerName,
    opponent,
    note: 'Historical matchup data requires BDL game logs lookup',
    suggestion: 'Check player\'s L10 games for any against this opponent'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function calculateL5Avg(recentGames) {
  if (!recentGames || recentGames.length === 0) return null;

  const last5 = recentGames.slice(0, 5);
  const sum = last5.reduce((acc, g) => ({
    pts: acc.pts + (g.pts || g.points || 0),
    reb: acc.reb + (g.reb || g.rebounds || 0),
    ast: acc.ast + (g.ast || g.assists || 0),
    min: acc.min + (g.min || g.minutes || 0)
  }), { pts: 0, reb: 0, ast: 0, min: 0 });

  return {
    ppg: (sum.pts / last5.length).toFixed(1),
    rpg: (sum.reb / last5.length).toFixed(1),
    apg: (sum.ast / last5.length).toFixed(1),
    mpg: (sum.min / last5.length).toFixed(1)
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  DFS_SLATE_ANALYSIS_TOOLS,
  DFS_PLAYER_INVESTIGATION_TOOLS,
  ALL_DFS_TOOLS,
  executeToolCall
};
