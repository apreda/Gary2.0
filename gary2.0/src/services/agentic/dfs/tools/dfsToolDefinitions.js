/**
 * DFS Tool Definitions for Gemini Function Calling
 *
 * These tools allow Gary (via Gemini Flash/Pro) to investigate
 * players and games using real data from BDL, RotoWire, etc.
 *
 * FOLLOWS CLAUDE.md: Gary INVESTIGATES before deciding.
 * These tools give him the data he needs.
 */

// BDL import removed — injury status comes from RapidAPI via context, not BDL

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
    description: 'Get DFS salary and projection for a player.',
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
        return await searchLatestNews(args.query, context);

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
  // Injuries are populated from RapidAPI during context building (Phase 1).
  // Do NOT fall back to BDL — BDL injuries are for duration enrichment only, not status.
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

  // No injuries in context for this team — either no injuries or context wasn't populated
  return {
    team,
    injuries: [],
    note: 'No injury data in context for this team. Injury data comes from RapidAPI during context build.'
  };
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
  const rawBeneficiaries = players
    .filter(p => p.name !== outPlayerData?.name)
    .filter(p => {
      const positions = p.positions || [p.position];
      const outPositions = outPlayerData?.positions || [outPlayerData?.position];
      return positions.some(pos => outPositions?.includes(pos)) ||
             (p.mpg && p.mpg >= 15); // Or significant minute players
    })
    .slice(0, 5);

  // Distribute usage proportionally — higher-usage teammates get more of the redistribution
  const totalCurrentUsage = rawBeneficiaries.reduce((sum, p) => sum + (p.usage || p.seasonStats?.usg_pct || 20), 0);
  const beneficiaries = rawBeneficiaries.map(p => {
    const currentUsage = p.usage || p.seasonStats?.usg_pct || 20;
    const share = totalCurrentUsage > 0 ? currentUsage / totalCurrentUsage : 1 / rawBeneficiaries.length;
    return {
      name: p.name,
      currentUsage,
      currentMinutes: p.mpg || p.seasonStats?.mpg || 20,
      projectedBoost: Math.round(outPlayerUsage * share * 10) / 10,
      salary: p.salary,
      priceAdjusted: false
    };
  });

  return {
    outPlayer,
    team,
    outPlayerUsage,
    outPlayerMinutes,
    beneficiaries
  };
}

async function getGameEnvironment(homeTeam, awayTeam, context) {
  // Look for game in context (populated by BDL odds in Phase 1)
  const game = context.games?.find(g => {
    const h = (g.homeTeam || g.home_team || '').toUpperCase();
    const a = (g.awayTeam || g.visitor_team || g.away_team || '').toUpperCase();
    return (h === homeTeam && a === awayTeam) || (h === awayTeam && a === homeTeam);
  });

  if (game) {
    const ou = game.overUnder || game.total || null;
    const sp = game.spread || game.homeSpread || null;
    return {
      homeTeam,
      awayTeam,
      spread: sp,
      overUnder: ou,
      homeMoneyline: game.homeMoneyline || game.home_ml || null,
      awayMoneyline: game.awayMoneyline || game.away_ml || null,
      impliedTotal: {
        home: game.implied_home_total ?? (ou && sp ? (ou / 2 - sp / 2) : null),
        away: game.implied_away_total ?? (ou && sp ? (ou / 2 + sp / 2) : null)
      },
      blowoutRisk: game.blowout_risk ?? false,
      gamePace: game.game_pace ?? null,
      homeB2B: game.home_b2b ?? false,
      awayB2B: game.away_b2b ?? false
    };
  }

  return {
    homeTeam,
    awayTeam,
    spread: null,
    overUnder: null,
    note: 'Game not found in context — odds data unavailable'
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
      projectedPts: player.projected_pts || player.projection
    };
  }

  return { player: playerName, error: 'Player not found in slate' };
}

async function getPlayerGameLogs(playerName, games, context) {
  // Find player in context
  const player = context.players?.find(p =>
    p.name?.toLowerCase().includes(playerName.toLowerCase())
  );

  if (!player) {
    return { player: playerName, error: 'Player not found in slate' };
  }

  // Return L5 stats from context (populated by BDL in Phase 1)
  return {
    player: player.name,
    team: player.team,
    l5Stats: player.l5Stats || null,
    seasonStats: {
      ppg: player.ppg || player.seasonStats?.ppg,
      rpg: player.rpg || player.seasonStats?.rpg,
      apg: player.apg || player.seasonStats?.apg,
      mpg: player.mpg || player.seasonStats?.mpg,
    },
    tsPercent: player.tsPercent || null,
    efgPercent: player.efgPercent || null,
    note: player.l5Stats ? null : 'L5 game logs not available for this player'
  };
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
        trueShootingPct: player.tsPercent || player.seasonStats?.ts_pct,
        efgPct: player.efgPercent || player.seasonStats?.efg_pct
      },
      l5Stats: player.l5Stats || null,
      matchupDvP: player.matchupDvP || null,
      salary: player.salary,
      valuePerDollar: player.salary ? ((player.projected_pts || 0) / player.salary * 1000).toFixed(2) : 'N/A'
    };
  }

  return { player: playerName, error: 'Player not found' };
}

async function getMatchupData(playerName, position, opponent, context) {
  // Find player in context — DvP is stored per-player from Tank01
  const player = context.players?.find(p =>
    p.name?.toLowerCase().includes(playerName.toLowerCase())
  );

  if (player?.matchupDvP) {
    return {
      player: player.name,
      position: position || player.position,
      opponent,
      dvp: player.matchupDvP
    };
  }

  return {
    player: playerName,
    position,
    opponent,
    dvp: null,
    note: 'DvP data not available for this player/opponent matchup'
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

async function searchLatestNews(query, context) {
  // Search for matching news in player newsContext (populated from Tank01 in Phase 1)
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const matchingNews = [];

  for (const player of (context?.players || [])) {
    if (!player.newsContext) continue;
    const nameLower = player.name?.toLowerCase() || '';
    // Match if any query word appears in the player name, or player name appears in query
    const nameMatch = queryWords.some(w => nameLower.includes(w)) ||
                      nameLower.split(/\s+/).some(w => query.toLowerCase().includes(w));
    if (nameMatch) {
      matchingNews.push({
        player: player.name,
        team: player.team,
        news: player.newsContext
      });
    }
  }

  if (matchingNews.length > 0) {
    return { query, results: matchingNews };
  }

  return {
    query,
    results: [],
    note: 'No matching news found in context for this query'
  };
}

async function getPlayerVsTeamHistory(playerName, opponent, context) {
  const player = context.players?.find(p =>
    p.name?.toLowerCase().includes(playerName.toLowerCase())
  );

  if (!player) {
    return { player: playerName, opponent, error: 'Player not found in slate' };
  }

  // Check L5 game logs for games against this opponent
  const vsGames = [];
  if (player.l5Stats?.games) {
    for (const game of player.l5Stats.games) {
      const opp = (game.opponent || game.opp || '').toUpperCase();
      if (opp === opponent.toUpperCase()) {
        vsGames.push(game);
      }
    }
  }

  return {
    player: player.name,
    opponent,
    recentGamesVsOpponent: vsGames.length > 0 ? vsGames : null,
    matchupDvP: player.matchupDvP || null,
    seasonStats: {
      ppg: player.ppg || player.seasonStats?.ppg,
      rpg: player.rpg || player.seasonStats?.rpg,
      apg: player.apg || player.seasonStats?.apg,
    },
    note: vsGames.length > 0
      ? `Found ${vsGames.length} recent game(s) vs ${opponent}`
      : `No recent games vs ${opponent} in L5 — use DvP and season stats instead`
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  DFS_SLATE_ANALYSIS_TOOLS,
  DFS_PLAYER_INVESTIGATION_TOOLS,
  executeToolCall
};
