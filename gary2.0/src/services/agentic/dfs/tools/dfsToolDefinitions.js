/**
 * DFS Tool Definitions for Gemini Function Calling
 *
 * These tools allow Gary (via Gemini) to investigate
 * players and games using real data from BDL, RotoWire, etc.
 *
 * FOLLOWS CLAUDE.md: Gary INVESTIGATES before deciding.
 * These tools give him the data he needs.
 */

import { geminiGroundingSearch } from '../../scoutReport/scoutReportBuilder.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SLATE ANALYSIS TOOLS (Used by Gemini in Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════

export const DFS_SLATE_ANALYSIS_TOOLS = [
  {
    name: 'GET_TEAM_INJURIES',
    description: 'Get current injury report for a team. Returns OUT, Doubtful, GTD, Questionable, and Probable players with status and duration.',
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
    name: 'GET_TEAM_USAGE_STATS',
    description: 'Get role and workload data for all active players on a team.',
    parameters: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Team abbreviation (e.g., LAL, MIL, BOS)'
        }
      },
      required: ['team']
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
  },
  {
    name: 'SEARCH_LIVE_NEWS',
    description: 'Search the internet for the latest news about a player or team using Google Search.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "LeBron James injury update today")'
        }
      },
      required: ['query']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER INVESTIGATION TOOLS (Used by Gemini in Phase 4)
// ═══════════════════════════════════════════════════════════════════════════════

export const DFS_PLAYER_INVESTIGATION_TOOLS = [
  {
    name: 'GET_TEAM_USAGE_STATS',
    description: 'Get role and workload data for all active players on a team.',
    parameters: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Team abbreviation (e.g., LAL, MIL, BOS)'
        }
      },
      required: ['team']
    }
  },
  {
    name: 'GET_PLAYER_GAME_LOGS',
    description: 'Get a player\'s last N games with full stats.',
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
    description: 'Get player season averages and advanced metrics.',
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
    description: 'Get matchup and opponent defense data for a player\'s game tonight.',
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
    name: 'GET_PLAYER_RECENT_VS_OPPONENT',
    description: 'Get a player\'s recent game logs against a specific opponent (from L5 data).',
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
  },
  {
    name: 'SEARCH_LIVE_NEWS',
    description: 'Search the internet for the latest news about a player or team using Google Search.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "LeBron James injury update today")'
        }
      },
      required: ['query']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT_LINEUP TOOL (Used by Gary in the agent loop)
// ═══════════════════════════════════════════════════════════════════════════════

export const SUBMIT_LINEUP_TOOL = {
  name: 'SUBMIT_LINEUP',
  description: 'Submit your final DFS lineup. Only call when you have decided ALL players and are ready to submit.',
  parameters: {
    type: 'object',
    properties: {
      players: {
        type: 'array',
        description: 'Array of player objects for each roster slot',
        items: {
          type: 'object',
          properties: {
            position: { type: 'string', description: 'Roster slot (PG, SG, SF, PF, C, G, F, UTIL, QB, RB, WR, TE, FLEX, DST)' },
            name: { type: 'string', description: 'Player full name' },
            team: { type: 'string', description: 'Team abbreviation' },
            salary: { type: 'number', description: 'Player salary' },
            projectedPoints: { type: 'number', description: 'Your projected fantasy points for this player' },
            ceilingProjection: { type: 'number', description: 'Ceiling fantasy points projection' },
            reasoning: { type: 'string', description: 'Your specific reason for this player in THIS lineup' }
          },
          required: ['position', 'name', 'team', 'salary']
        }
      },
      totalSalary: { type: 'number', description: 'Total salary of all players' },
      ceilingProjection: { type: 'number', description: 'Total lineup ceiling projection' },
      ceilingScenario: { type: 'string', description: 'How this lineup hits the winning score' },
      garyNotes: { type: 'string', description: 'Gary speaking directly to the user about why this lineup is built to win' },
      buildThesis: { type: 'string', description: 'The strategic thesis behind this build' }
    },
    required: ['players', 'totalSalary']
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MERGED TOOL SETS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All investigation tools (slate + player), deduplicated.
 * Used by the DFS agent loop and Flash game research.
 */
export const DFS_ALL_TOOLS = (() => {
  const seen = new Set();
  const merged = [];
  for (const tool of [...DFS_SLATE_ANALYSIS_TOOLS, ...DFS_PLAYER_INVESTIGATION_TOOLS]) {
    if (!seen.has(tool.name)) {
      seen.add(tool.name);
      merged.push(tool);
    }
  }
  return merged;
})();

/**
 * All tools including SUBMIT_LINEUP — for Gary's agent loop.
 */
export const DFS_AGENT_LOOP_TOOLS = [...DFS_ALL_TOOLS, SUBMIT_LINEUP_TOOL];

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

      case 'GET_TEAM_USAGE_STATS':
        return await getTeamUsageStats(args.team, context);

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

      case 'GET_PLAYER_RECENT_VS_OPPONENT':
        return await getPlayerVsTeamHistory(args.playerName, args.opponent, context);

      case 'SEARCH_LIVE_NEWS':
        return await searchLiveNews(args.query);

      case 'SUBMIT_LINEUP':
        // SUBMIT_LINEUP is handled by the agent loop, not executed here.
        // Return the args so the loop can validate them.
        return { _submitLineup: true, lineup: args };

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`[DFS Tools] Error executing ${toolName}:`, error.message);
    return { error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARDIZED NAME MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

function findPlayerByName(playerName, context) {
  if (!playerName || !context.players) return null;
  const query = playerName.toLowerCase().trim();
  // Exact match first — most reliable
  let match = context.players.find(p => p.name?.toLowerCase() === query);
  if (match) return match;
  // Partial match: query contains full name or full name contains query
  // BUT require the match to be unambiguous (only one result)
  const partialMatches = context.players.filter(p => {
    const pName = p.name?.toLowerCase() || '';
    return pName.includes(query) || query.includes(pName);
  });
  if (partialMatches.length === 1) return partialMatches[0];
  // Last name match — split query into words and match last name
  const queryWords = query.split(/\s+/);
  const queryLast = queryWords[queryWords.length - 1];
  if (queryLast && queryLast.length > 2) {
    const lastNameMatches = context.players.filter(p => {
      const parts = (p.name?.toLowerCase() || '').split(/\s+/);
      return parts[parts.length - 1] === queryLast;
    });
    if (lastNameMatches.length === 1) return lastNameMatches[0];
  }
  return null;
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
      injuries: contextInjuries.map(i => {
        const entry = {
          player: i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player,
          status: i.status,
          reason: i.reason || i.injury,
        };
        // Surface duration data when available
        if (i.duration) {
          entry.duration = i.duration;
          entry.gamesMissed = i.gamesMissed;
          entry.daysSince = i.daysSince;
          entry.lastGameDate = i.lastGameDate;
        }
        return entry;
      })
    };
  }

  // No injuries in context for this team — either no injuries or context wasn't populated
  return {
    team,
    injuries: [],
    note: 'No injury data in context for this team. Injury data comes from RapidAPI during context build.'
  };
}

async function getTeamUsageStats(team, context) {
  // Return factual usage data for all active players on this team.
  // Gary investigates the data and draws his own conclusions.
  const players = context.players?.filter(p => p.team === team) || [];

  if (players.length === 0) {
    return {
      team,
      error: `No active players found for ${team} in this slate.`,
      players: []
    };
  }

  // Build factual player profiles — no computed boosts or beneficiary labels
  const playerProfiles = players
    .filter(p => (p.seasonStats?.mpg || p.mpg || 0) >= 10) // Only players with real minutes
    .sort((a, b) => (b.usageStats?.usg_pct || b.seasonStats?.usg_pct || 0) - (a.usageStats?.usg_pct || a.seasonStats?.usg_pct || 0))
    .map(p => ({
      name: p.name,
      position: p.position,
      salary: p.salary,
      minutesPerGame: p.seasonStats?.mpg || p.mpg || null,
      usagePct: p.usageStats?.usg_pct || p.seasonStats?.usg_pct || null,
      teamSharePts: p.usageStats?.pct_pts || null,
      teamShareFga: p.usageStats?.pct_fga || null,
      teamShareAst: p.usageStats?.pct_ast || null,
      seasonPpg: p.seasonStats?.ppg || null,
      l5Ppg: p.l5Stats?.ppg || null,
      l5DkFpts: p.l5Stats?.dkFptsAvg || null
    }));

  // Surface team injuries factually — who is out and for how long
  const teamInjuries = context.injuries?.[team] || [];
  const outPlayers = teamInjuries
    .filter(i => (i.status || '').toUpperCase().includes('OUT') || (i.status || '').toUpperCase() === 'DOUBTFUL')
    .map(i => ({
      player: i.player,
      status: i.status,
      duration: i.duration || null,
      gamesMissed: i.gamesMissed || null
    }));

  return {
    team,
    activePlayers: playerProfiles,
    outPlayers
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
      // Implied totals: spread is from home team's perspective (negative = home favorite)
      // Home implied = (O/U - spread) / 2, Away implied = (O/U + spread) / 2
      impliedTotal: {
        home: game.implied_home_total ?? (ou && sp != null ? (ou - sp) / 2 : null),
        away: game.implied_away_total ?? (ou && sp != null ? (ou + sp) / 2 : null)
      },
      homePace: game.home_pace ?? null,
      awayPace: game.away_pace ?? null,
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
  const player = findPlayerByName(playerName, context);

  if (player) {
    return {
      player: player.name,
      salary: player.salary,
      position: player.position || player.positions?.join('/'),
      team: player.team,
      projectedPts: player.projected_pts || player.projection,
      dkFpts: player.seasonStats?.dkFpts,
      benchmarkProjection: player.benchmarkProjection,
    };
  }

  return { player: playerName, error: 'Player not found in slate' };
}

async function getPlayerGameLogs(playerName, games, context) {
  const player = findPlayerByName(playerName, context);

  if (!player) {
    return { player: playerName, error: 'Player not found in slate' };
  }

  // Return actual game-by-game rows (not just averages)
  const gameRows = player.l5Stats?.gameRows || null;
  const requestedRows = gameRows ? gameRows.slice(0, games) : null;

  return {
    player: player.name,
    team: player.team,
    recentGames: requestedRows,
    l5Averages: player.l5Stats ? {
      ppg: player.l5Stats.ppg,
      rpg: player.l5Stats.rpg,
      apg: player.l5Stats.apg,
      spg: player.l5Stats.spg,
      bpg: player.l5Stats.bpg,
      mpg: player.l5Stats.mpg,
      dkFptsAvg: player.l5Stats.dkFptsAvg,
      fdFptsAvg: player.l5Stats.fdFptsAvg,
      bestDkFpts: player.l5Stats.bestDkFpts,
      worstDkFpts: player.l5Stats.worstDkFpts,
      games: player.l5Stats.games
    } : null,
    seasonStats: {
      ppg: player.seasonStats?.ppg,
      rpg: player.seasonStats?.rpg,
      apg: player.seasonStats?.apg,
      mpg: player.seasonStats?.mpg,
      dkFpts: player.seasonStats?.dkFpts,
      fdFpts: player.seasonStats?.fdFpts,
    },
    tsPercent: player.tsPercent || null,
    efgPercent: player.efgPercent || null,
    note: gameRows ? null : 'Game logs not available for this player (may be outside top 80 by PPG)'
  };
}

async function getPlayerSeasonStats(playerName, context) {
  const player = findPlayerByName(playerName, context);

  if (player) {
    const dkFpts = player.seasonStats?.dkFpts ?? null;
    return {
      player: player.name,
      team: player.team,
      seasonStats: {
        ppg: player.seasonStats?.ppg,
        rpg: player.seasonStats?.rpg,
        apg: player.seasonStats?.apg,
        mpg: player.seasonStats?.mpg,
        usage: player.usageStats?.usg_pct,
        trueShootingPct: player.tsPercent,
        efgPct: player.efgPercent,
        dkFpts,
        fdFpts: player.seasonStats?.fdFpts
      },
      l5Stats: player.l5Stats ? {
        ppg: player.l5Stats.ppg,
        rpg: player.l5Stats.rpg,
        apg: player.l5Stats.apg,
        mpg: player.l5Stats.mpg,
        dkFptsAvg: player.l5Stats.dkFptsAvg,
        fdFptsAvg: player.l5Stats.fdFptsAvg,
        games: player.l5Stats.games
      } : null,
      matchupDvP: player.matchupDvP || null,
      salary: player.salary,
      advancedStats: player.advancedStats || null,
      scoringProfile: player.scoringProfile || null,
      rollManStats: player.rollManStats || null,
      driveStats: player.driveStats || null,
      playerProps: player.playerProps || null
    };
  }

  return { player: playerName, error: 'Player not found' };
}

async function getMatchupData(playerName, position, opponent, context) {
  const player = findPlayerByName(playerName, context);

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

async function searchLiveNews(query) {
  try {
    const result = await geminiGroundingSearch(query, { maxTokens: 1500 });
    if (result.success && result.data) {
      return { query, results: result.data };
    }
    return { query, results: null, note: result.error || 'No results from grounding search' };
  } catch (e) {
    console.warn(`[DFS Tools] SEARCH_LIVE_NEWS failed: ${e.message}`);
    return { query, error: e.message };
  }
}

async function getPlayerVsTeamHistory(playerName, opponent, context) {
  const player = findPlayerByName(playerName, context);

  if (!player) {
    return { player: playerName, opponent, error: 'Player not found in slate' };
  }

  // Search actual game rows for games against this opponent
  const gameRows = player.l5Stats?.gameRows || [];
  const oppUpper = opponent.toUpperCase();
  const vsGames = gameRows.filter(g => (g.opponent || '').toUpperCase() === oppUpper);

  return {
    player: player.name,
    opponent,
    recentGamesVsOpponent: vsGames.length > 0 ? vsGames : null,
    matchupDvP: player.matchupDvP || null,
    seasonStats: {
      ppg: player.seasonStats?.ppg,
      rpg: player.seasonStats?.rpg,
      apg: player.seasonStats?.apg,
      dkFpts: player.seasonStats?.dkFpts,
    },
    note: vsGames.length > 0
      ? `Found ${vsGames.length} recent game(s) vs ${opponent}`
      : `No recent games vs ${opponent} found in last 5 games`
  };
}

