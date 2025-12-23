/**
 * NFL Props Agentic Context Builder - ENHANCED
 * Builds comprehensive context for NFL player prop analysis
 * 
 * NOW INCLUDES (matching NBA rigor):
 * - Player game logs (last 5 games)
 * - Recent form trends (hot/cold)
 * - Consistency scores
 * - Home/Away splits
 * - Opponent defensive matchup data (via Perplexity)
 * - Short week detection (TNF)
 * - Weather impact
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';
import { fetchGroundedContext } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'americanfootball_nfl';

/**
 * Group props by player for easier analysis
 */
function groupPropsByPlayer(props) {
  const grouped = {};
  
  for (const prop of props) {
    const playerName = prop.player || 'Unknown';
    if (!grouped[playerName]) {
      grouped[playerName] = {
        player: playerName,
        team: prop.team || 'Unknown',
        playerId: prop.player_id || null,
        props: []
      };
    }
    // Store player_id if available
    if (prop.player_id && !grouped[playerName].playerId) {
      grouped[playerName].playerId = prop.player_id;
    }
    grouped[playerName].props.push({
      type: prop.prop_type,
      line: prop.line,
      over_odds: prop.over_odds,
      under_odds: prop.under_odds
    });
  }
  
  return Object.values(grouped);
}

/**
 * Get top prop candidates based on line value and odds quality
 */
function getTopPropCandidates(props, maxPlayers = 15) {
  const grouped = groupPropsByPlayer(props);
  
  // Score each player by number of props and odds quality
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || -110;
      return sum + odds;
    }, 0) / player.props.length;
    
    // Prioritize players with core stat props (pass_yds, rush_yds, rec_yds)
    const hasCoreStatProp = player.props.some(p => 
      ['pass_yds', 'rush_yds', 'reception_yds', 'receptions'].includes(p.type)
    );
    
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0) + (hasCoreStatProp ? 15 : 0)
    };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPlayers);
}

/**
 * Format injuries relevant to NFL props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => {
      const pos = (inj.player?.position || inj.player?.position_abbreviation || '').toUpperCase();
      // Focus on skill positions for props
      return ['QB', 'RB', 'WR', 'TE'].includes(pos);
    })
    .slice(0, 12)
    .map((injury) => ({
      player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
      position: injury?.player?.position_abbreviation || injury?.player?.position || 'Unknown',
      status: injury?.status || 'Unknown',
      description: injury?.comment || injury?.description || '',
      team: injury?.team?.full_name || injury?.player?.team?.full_name || ''
    }));
}

/**
 * Resolve player IDs and Teams from BDL for prop candidates
 * Returns { playerIdMap, playerTeamMap } for resolving both IDs and teams
 * 
 * IMPORTANT: BDL is the source of truth for team assignments.
 * The Odds API often has stale/incorrect team data for recently traded players.
 */
async function resolvePlayerIdsAndTeams(propCandidates, teamIds, homeTeam, awayTeam, season) {
  const playerIdMap = {}; // name -> id
  const playerTeamMap = {}; // name -> team full name (from BDL, overrides Odds API)
  
  // Don't trust team data from props - we'll resolve everything from BDL
  for (const candidate of propCandidates) {
    if (candidate.playerId) {
      playerIdMap[candidate.player.toLowerCase()] = candidate.playerId;
    }
  }
  
  // Resolve ALL players via BDL players endpoint (BDL is source of truth for teams)
  const allPlayerNames = propCandidates.map(c => c.player);
  
  if (allPlayerNames.length > 0 && teamIds.length > 0) {
    try {
      // Fetch active players for these teams
      const playersResponse = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
        team_ids: teamIds,
        per_page: 100
      }).catch(() => []);
      
      // Build a lookup map from BDL roster
      const bdlPlayerMap = new Map();
      for (const player of playersResponse) {
        const fullName = (player.full_name || `${player.first_name} ${player.last_name}`).toLowerCase().trim();
        const lastName = (player.last_name || '').toLowerCase().trim();
        bdlPlayerMap.set(fullName, {
          id: player.id,
          team: player.team?.full_name || player.team?.name || ''
        });
        // Also index by last name for fuzzy matching
        if (lastName && !bdlPlayerMap.has(lastName)) {
          bdlPlayerMap.set(lastName, {
            id: player.id,
            team: player.team?.full_name || player.team?.name || ''
          });
        }
      }
      
      // Match candidates to BDL data (BDL team OVERRIDES any Odds API team data)
      for (const playerName of allPlayerNames) {
        const candidateNormalized = playerName.toLowerCase().trim();
        const candidateLastName = candidateNormalized.split(' ').pop();
        
        // Try exact match first
        let match = bdlPlayerMap.get(candidateNormalized);
        
        // Try last name match if exact fails
        if (!match) {
          match = bdlPlayerMap.get(candidateLastName);
        }
        
        // Try partial match
        if (!match) {
          for (const [bdlName, data] of bdlPlayerMap) {
            if (bdlName.includes(candidateNormalized) || candidateNormalized.includes(bdlName)) {
              match = data;
              break;
            }
          }
        }
        
        if (match) {
          if (match.id) playerIdMap[candidateNormalized] = match.id;
          if (match.team) playerTeamMap[candidateNormalized] = match.team;
        }
      }
      
      console.log(`[NFL Props Context] Resolved ${Object.keys(playerIdMap).length}/${propCandidates.length} player IDs`);
      console.log(`[NFL Props Context] Resolved ${Object.keys(playerTeamMap).length}/${propCandidates.length} player teams from BDL`);
    } catch (e) {
      console.warn('[NFL Props Context] Failed to resolve player IDs/teams:', e.message);
    }
  }
  
  // Update ALL candidates with BDL-resolved teams (overriding any Odds API data)
  const unresolvedPlayers = [];
  for (const candidate of propCandidates) {
    const key = candidate.player.toLowerCase();
    if (playerTeamMap[key]) {
      // BDL team ALWAYS overrides Odds API team
      candidate.team = playerTeamMap[key];
    } else {
      unresolvedPlayers.push(candidate);
    }
  }
  
  // For unresolved players, try a direct BDL search (handles recently traded players)
  if (unresolvedPlayers.length > 0) {
    console.log(`[NFL Props Context] Searching BDL for ${unresolvedPlayers.length} unresolved players...`);
    
    for (const candidate of unresolvedPlayers) {
      try {
        // Search BDL for this player by name (not filtered by team)
        const searchResults = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
          search: candidate.player.split(' ').pop(), // Search by last name
          per_page: 10
        }).catch(() => []);
        
        // Find exact or close match
        const candidateNormalized = candidate.player.toLowerCase().trim();
        for (const player of searchResults) {
          const fullName = (player.full_name || `${player.first_name} ${player.last_name}`).toLowerCase().trim();
          if (fullName === candidateNormalized || 
              fullName.includes(candidateNormalized) || 
              candidateNormalized.includes(fullName)) {
            const foundTeam = player.team?.full_name || player.team?.name || '';
            // Only use if it's one of the teams in this game
            if (foundTeam && (foundTeam === homeTeam || foundTeam === awayTeam)) {
              candidate.team = foundTeam;
              playerTeamMap[candidateNormalized] = foundTeam;
              console.log(`[NFL Props Context] Found ${candidate.player} via search -> ${foundTeam}`);
              break;
            }
          }
        }
      } catch (e) {
        // Ignore search errors
      }
      
      // If still no team, assign based on game context for QBs
      if (!candidate.team) {
        const hasPassingProps = candidate.props?.some(p => 
          ['pass_yds', 'pass_tds', 'pass_attempts', 'pass_completions'].includes(p.type)
        );
        if (hasPassingProps) {
          console.warn(`[NFL Props Context] QB ${candidate.player} not found in BDL - using game context`);
          // Will need to be resolved from game odds context (spread favorite is usually home team's QB)
        }
      }
    }
  }
  
  return { playerIdMap, playerTeamMap };
}

/**
 * Fetch game logs for NFL prop candidates (last 5 games)
 */
async function fetchPlayerGameLogs(playerIdMap, season) {
  const playerIds = Object.values(playerIdMap).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NFL Props Context] No player IDs to fetch game logs for');
    return {};
  }
  
  console.log(`[NFL Props Context] Fetching game logs for ${playerIds.length} players...`);
  
  try {
    const logsMap = await ballDontLieService.getNflPlayerGameLogsBatch(playerIds, season, 5);
    console.log(`[NFL Props Context] ✓ Got game logs for ${Object.keys(logsMap).length} players`);
    return logsMap;
  } catch (e) {
    console.warn('[NFL Props Context] Failed to fetch player game logs:', e.message);
    return {};
  }
}

/**
 * Detect short week (TNF) - similar to NBA's back-to-back detection
 * Teams playing Thursday Night Football have only 3 days rest vs normal 6-7
 */
function detectShortWeek(gameDate) {
  const gameDateObj = new Date(gameDate);
  const dayOfWeek = gameDateObj.getDay(); // 0=Sun, 4=Thu
  
  // Thursday games are short week
  if (dayOfWeek === 4) {
    return {
      isShortWeek: true,
      type: 'TNF',
      restDays: 3,
      impact: 'Both teams on short rest - simpler offensive schemes, more rushing expected'
    };
  }
  
  // Saturday games (late season) can also be short week
  if (dayOfWeek === 6) {
    return {
      isShortWeek: false,
      type: 'Saturday',
      restDays: 5,
      impact: null
    };
  }
  
  // Monday night teams have extra day before next Sunday
  if (dayOfWeek === 1) {
    return {
      isShortWeek: false,
      type: 'MNF',
      restDays: 7,
      impact: 'Full rest - normal game plans'
    };
  }
  
  // Sunday is normal
  return {
    isShortWeek: false,
    type: 'Sunday',
    restDays: 7,
    impact: null
  };
}

/**
 * Build comprehensive player stats text with game logs, trends, and matchup context
 */
function buildPlayerStatsText(homeTeam, awayTeam, propCandidates, playerIdMap, injuries, playerGameLogs, defensiveMatchups) {
  let statsText = '';
  
  // Helper to get game logs for a player
  const getPlayerLogs = (playerName) => {
    const playerId = playerIdMap[playerName.toLowerCase()];
    return playerId ? playerGameLogs[playerId] : null;
  };
  
  // Helper to format recent games
  const formatRecentGames = (logs, statKey) => {
    if (!logs?.games || logs.games.length === 0) return '';
    const last5 = logs.games.slice(0, 5).map(g => g[statKey]);
    return `L5: [${last5.join(', ')}]`;
  };
  
  // Separate candidates by team
  const isAwayTeam = (team) => {
    const teamLower = (team || '').toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    return teamLower.includes(awayLower.split(' ').pop()) || awayLower.includes(teamLower.split(' ').pop());
  };
  
  const awayPlayers = propCandidates.filter(p => isAwayTeam(p.team));
  const homePlayers = propCandidates.filter(p => !isAwayTeam(p.team));
  
  // Check for injured players
  const injuredNames = new Set(injuries.map(i => i.player?.toLowerCase()));
  
  // Add defensive context headers
  if (defensiveMatchups && !defensiveMatchups._isDefault) {
    statsText += `## DEFENSIVE MATCHUP CONTEXT\n\n`;
    
    const homeD = defensiveMatchups.home_defense_vs_away;
    const awayD = defensiveMatchups.away_defense_vs_home;
    
    statsText += `### ${homeTeam} Defense (vs ${awayTeam} offense):\n`;
    statsText += `- Pass Defense: #${homeD?.pass_defense_rank || '?'} (${homeD?.pass_yards_allowed_per_game || '?'} yds/g allowed)\n`;
    statsText += `- Rush Defense: #${homeD?.rush_defense_rank || '?'} (${homeD?.rush_yards_allowed_per_game || '?'} yds/g allowed)\n`;
    statsText += `- Fantasy Pts Allowed: QB ${homeD?.fantasy_points_allowed_to_qb || '?'}, RB ${homeD?.fantasy_points_allowed_to_rb || '?'}, WR ${homeD?.fantasy_points_allowed_to_wr || '?'}, TE ${homeD?.fantasy_points_allowed_to_te || '?'}\n`;
    if (homeD?.key_defensive_injuries?.length > 0) {
      statsText += `- ⚠️ Key Injuries: ${homeD.key_defensive_injuries.join(', ')}\n`;
    }
    
    statsText += `\n### ${awayTeam} Defense (vs ${homeTeam} offense):\n`;
    statsText += `- Pass Defense: #${awayD?.pass_defense_rank || '?'} (${awayD?.pass_yards_allowed_per_game || '?'} yds/g allowed)\n`;
    statsText += `- Rush Defense: #${awayD?.rush_defense_rank || '?'} (${awayD?.rush_yards_allowed_per_game || '?'} yds/g allowed)\n`;
    statsText += `- Fantasy Pts Allowed: QB ${awayD?.fantasy_points_allowed_to_qb || '?'}, RB ${awayD?.fantasy_points_allowed_to_rb || '?'}, WR ${awayD?.fantasy_points_allowed_to_wr || '?'}, TE ${awayD?.fantasy_points_allowed_to_te || '?'}\n`;
    if (awayD?.key_defensive_injuries?.length > 0) {
      statsText += `- ⚠️ Key Injuries: ${awayD.key_defensive_injuries.join(', ')}\n`;
    }
    
    if (defensiveMatchups.matchup_insights?.length > 0) {
      statsText += `\n### Key Matchup Insights:\n`;
      defensiveMatchups.matchup_insights.forEach(insight => {
        statsText += `- ${insight}\n`;
      });
    }
    
    statsText += '\n';
  }
  
  // Away team section
  statsText += `## ${awayTeam} Players\n\n`;
  
  if (awayPlayers.length > 0) {
    statsText += '**Player Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      statsText += `\n- **${candidate.player}**${injuryFlag}:\n`;
      
      if (logs && logs.gamesAnalyzed > 0) {
        const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
        
        // Position-specific averages
        const avg = logs.averages;
        if (parseFloat(avg.pass_yds) > 0) {
          statsText += `  L${logs.gamesAnalyzed} Avg: PASS ${avg.pass_yds} yds, ${avg.pass_tds} TDs, ${avg.ints} INTs ${formIcon}\n`;
          statsText += `  Recent Pass Yds: ${formatRecentGames(logs, 'pass_yds')}\n`;
        }
        if (parseFloat(avg.rush_yds) > 10) {
          statsText += `  L${logs.gamesAnalyzed} Avg: RUSH ${avg.rush_yds} yds, ${avg.rush_tds} TDs, ${avg.rush_att} att\n`;
          statsText += `  Recent Rush Yds: ${formatRecentGames(logs, 'rush_yds')}\n`;
        }
        if (parseFloat(avg.rec_yds) > 0 || parseFloat(avg.receptions) > 0) {
          statsText += `  L${logs.gamesAnalyzed} Avg: REC ${avg.receptions} catches, ${avg.rec_yds} yds, ${avg.rec_tds} TDs\n`;
          statsText += `  Recent Rec Yds: ${formatRecentGames(logs, 'rec_yds')}\n`;
        }
        
        // Consistency scores
        const consistency = logs.consistency;
        const getConsistencyLabel = (score) => {
          const s = parseFloat(score);
          if (s >= 0.7) return 'HIGH';
          if (s >= 0.5) return 'MED';
          return 'LOW';
        };
        
        const relevantConsistency = [];
        if (parseFloat(avg.pass_yds) > 0) relevantConsistency.push(`Pass: ${getConsistencyLabel(consistency.pass_yds)}`);
        if (parseFloat(avg.rush_yds) > 10) relevantConsistency.push(`Rush: ${getConsistencyLabel(consistency.rush_yds)}`);
        if (parseFloat(avg.rec_yds) > 0) relevantConsistency.push(`Rec: ${getConsistencyLabel(consistency.rec_yds)}`);
        
        if (relevantConsistency.length > 0) {
          statsText += `  Consistency: ${relevantConsistency.join(', ')}\n`;
        }
        
        // Home/Away splits
        if (logs.splits?.home && logs.splits?.away) {
          const home = logs.splits.home;
          const away = logs.splits.away;
          if (parseFloat(avg.pass_yds) > 0) {
            statsText += `  Splits: Home ${home.pass_yds} pass yds (${home.games}g) | Away ${away.pass_yds} pass yds (${away.games}g)\n`;
          } else if (parseFloat(avg.rush_yds) > 10) {
            statsText += `  Splits: Home ${home.rush_yds} rush yds (${home.games}g) | Away ${away.rush_yds} rush yds (${away.games}g)\n`;
          } else if (parseFloat(avg.rec_yds) > 0) {
            statsText += `  Splits: Home ${home.rec_yds} rec yds (${home.games}g) | Away ${away.rec_yds} rec yds (${away.games}g)\n`;
          }
        }
      } else {
        statsText += `  (Game logs unavailable)\n`;
      }
      
      statsText += `  Props: ${propsStr}\n`;
    }
  }
  
  statsText += '\n';
  
  // Home team section
  statsText += `## ${homeTeam} Players\n\n`;
  
  if (homePlayers.length > 0) {
    statsText += '**Player Stats & Recent Form:**\n';
    for (const candidate of homePlayers) {
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      statsText += `\n- **${candidate.player}**${injuryFlag}:\n`;
      
      if (logs && logs.gamesAnalyzed > 0) {
        const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
        
        const avg = logs.averages;
        if (parseFloat(avg.pass_yds) > 0) {
          statsText += `  L${logs.gamesAnalyzed} Avg: PASS ${avg.pass_yds} yds, ${avg.pass_tds} TDs, ${avg.ints} INTs ${formIcon}\n`;
          statsText += `  Recent Pass Yds: ${formatRecentGames(logs, 'pass_yds')}\n`;
        }
        if (parseFloat(avg.rush_yds) > 10) {
          statsText += `  L${logs.gamesAnalyzed} Avg: RUSH ${avg.rush_yds} yds, ${avg.rush_tds} TDs, ${avg.rush_att} att\n`;
          statsText += `  Recent Rush Yds: ${formatRecentGames(logs, 'rush_yds')}\n`;
        }
        if (parseFloat(avg.rec_yds) > 0 || parseFloat(avg.receptions) > 0) {
          statsText += `  L${logs.gamesAnalyzed} Avg: REC ${avg.receptions} catches, ${avg.rec_yds} yds, ${avg.rec_tds} TDs\n`;
          statsText += `  Recent Rec Yds: ${formatRecentGames(logs, 'rec_yds')}\n`;
        }
        
        const consistency = logs.consistency;
        const getConsistencyLabel = (score) => {
          const s = parseFloat(score);
          if (s >= 0.7) return 'HIGH';
          if (s >= 0.5) return 'MED';
          return 'LOW';
        };
        
        const relevantConsistency = [];
        if (parseFloat(avg.pass_yds) > 0) relevantConsistency.push(`Pass: ${getConsistencyLabel(consistency.pass_yds)}`);
        if (parseFloat(avg.rush_yds) > 10) relevantConsistency.push(`Rush: ${getConsistencyLabel(consistency.rush_yds)}`);
        if (parseFloat(avg.rec_yds) > 0) relevantConsistency.push(`Rec: ${getConsistencyLabel(consistency.rec_yds)}`);
        
        if (relevantConsistency.length > 0) {
          statsText += `  Consistency: ${relevantConsistency.join(', ')}\n`;
        }
        
        if (logs.splits?.home && logs.splits?.away) {
          const home = logs.splits.home;
          const away = logs.splits.away;
          if (parseFloat(avg.pass_yds) > 0) {
            statsText += `  Splits: Home ${home.pass_yds} pass yds (${home.games}g) | Away ${away.pass_yds} pass yds (${away.games}g)\n`;
          } else if (parseFloat(avg.rush_yds) > 10) {
            statsText += `  Splits: Home ${home.rush_yds} rush yds (${home.games}g) | Away ${away.rush_yds} rush yds (${away.games}g)\n`;
          } else if (parseFloat(avg.rec_yds) > 0) {
            statsText += `  Splits: Home ${home.rec_yds} rec yds (${home.games}g) | Away ${away.rec_yds} rec yds (${away.games}g)\n`;
          }
        }
      } else {
        statsText += `  (Game logs unavailable)\n`;
      }
      
      statsText += `  Props: ${propsStr}\n`;
    }
  }
  
  // Add injury summary if any
  if (injuries.length > 0) {
    statsText += '\n## Injury Report\n';
    injuries.slice(0, 10).forEach(inj => {
      statsText += `- ${inj.player} (${inj.position}, ${inj.status}): ${inj.description?.slice(0, 80) || 'No details'}\n`;
    });
  }
  
  return statsText;
}

/**
 * Build comprehensive token slices for NFL prop analysis
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerIdMap, playerGameLogs, defensiveMatchups, shortWeekInfo, weather) {
  // Enhance prop candidates with their game log data
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const logs = playerId ? playerGameLogs[playerId] : null;
    
    return {
      player: p.player,
      team: p.team,
      props: p.props,
      recentForm: logs ? {
        gamesAnalyzed: logs.gamesAnalyzed,
        averages: logs.averages,
        consistency: logs.consistency,
        splits: logs.splits,
        formTrend: logs.formTrend,
        lastGame: logs.lastGame,
        last5Games: logs.games?.slice(0, 5).map(g => ({
          pass_yds: g.pass_yds,
          rush_yds: g.rush_yds,
          rec_yds: g.rec_yds,
          receptions: g.receptions,
          opponent: g.opponent,
          isHome: g.isHome
        }))
      } : null
    };
  });
  
  return {
    player_stats: {
      summary: playerStats.substring(0, 6000), // Increased for comprehensive context
      playerCount: (playerStats.match(/\*\*/g) || []).length / 2
    },
    prop_lines: {
      candidates: enhancedCandidates,
      totalProps: propCandidates.reduce((sum, p) => sum + p.props.length, 0)
    },
    injury_report: {
      notable: injuries.slice(0, 10),
      total_listed: injuries.length
    },
    market_context: marketSnapshot,
    defensive_matchups: defensiveMatchups,
    game_context: {
      shortWeek: shortWeekInfo,
      weather: weather
    }
  };
}

/**
 * Build agentic context for NFL prop picks - ENHANCED
 * Now includes game logs, defensive matchups, and comprehensive analysis data
 */
export async function buildNflPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  // NFL season: Aug-Feb, so Jan-Jul means previous year's season
  const season = month <= 7 ? year - 1 : year;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NFL Props Context] Building ENHANCED context for ${game.away_team} @ ${game.home_team} (${season} season)`);

  // Resolve teams
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
    ]);
  } catch (e) {
    console.warn('[NFL Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates first
  const propCandidates = getTopPropCandidates(playerProps, 15);
  
  // Detect short week (TNF, etc.)
  const shortWeekInfo = detectShortWeek(commenceDate);
  if (shortWeekInfo.isShortWeek) {
    console.log(`[NFL Props Context] ⚠️ SHORT WEEK detected: ${shortWeekInfo.type} - ${shortWeekInfo.impact}`);
  }

  // Parallel fetch: injuries, player IDs/teams, defensive matchups, weather, narrative context
  console.log('[NFL Props Context] Fetching parallel data: injuries, player IDs/teams, defense matchups, weather, narrative context...');
  
  const [injuries, playerResolution, defensiveMatchups, weather, groundedContext] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0 
      ? ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5).catch(() => [])
      : Promise.resolve([]),
    
    // Resolve player IDs AND Teams from BDL (fixes team misassignment bug)
    resolvePlayerIdsAndTeams(propCandidates, teamIds, game.home_team, game.away_team, season),
    
    // Defensive matchups from Perplexity (NEW!)
    perplexityService.getNFLDefensiveMatchups(game.home_team, game.away_team, dateStr).catch(e => {
      console.warn('[NFL Props Context] Defensive matchups fetch failed:', e.message);
      return perplexityService._getDefaultDefensiveMatchups(game.home_team, game.away_team);
    }),
    
    // Weather (if outdoor game)
    perplexityService.getNFLGameWeather(game.home_team, game.away_team, null, dateStr).catch(() => null),
    
    // NARRATIVE CONTEXT via Gemini Grounding - Critical for storylines, player significance
    // Use Flash model for props to avoid Pro quota issues
    fetchGroundedContext(game.home_team, game.away_team, 'NFL', dateStr, { useFlash: true }).catch(e => {
      console.warn('[NFL Props Context] Gemini Grounding failed:', e.message);
      return null;
    })
  ]);
  
  // Extract narrative context for props
  const narrativeContext = groundedContext?.groundedRaw || null;
  if (narrativeContext) {
    console.log(`[NFL Props Context] ✓ Got narrative context (${narrativeContext.length} chars) from Gemini Grounding`);
  }
  
  // Extract the playerIdMap from the resolution result
  const { playerIdMap, playerTeamMap } = playerResolution;

  // NOW fetch player game logs (requires player IDs)
  console.log('[NFL Props Context] Fetching BDL player game logs (L5)...');
  const playerGameLogs = await fetchPlayerGameLogs(playerIdMap, season);
  
  // Log coverage stats
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = propCandidates.length;
  console.log(`[NFL Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  const formattedInjuries = formatPropsInjuries(injuries);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build comprehensive player stats text with ALL context
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    propCandidates,
    playerIdMap,
    formattedInjuries,
    playerGameLogs,
    defensiveMatchups
  );

  // Build token data with enhanced info
  const tokenData = buildPropsTokenSlices(
    playerStats,
    propCandidates,
    formattedInjuries,
    marketSnapshot,
    playerIdMap,
    playerGameLogs,
    defensiveMatchups,
    shortWeekInfo,
    weather
  );

  // Build game summary with all context
  const gameSummary = {
    gameId: `nfl-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NFL',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam?.full_name || game.home_team,
    awayTeam: awayTeam?.full_name || game.away_team,
    kickoff: formatGameTimeEST(game.commence_time),
    odds: {
      spread: marketSnapshot.spread,
      total: marketSnapshot.total,
      moneyline: marketSnapshot.moneyline
    },
    propCount: playerProps.length,
    topCandidates: propCandidates.map(p => p.player).slice(0, 6),
    playerLogsAvailable: playersWithLogs > 0,
    // Short week detection (like NBA B2B)
    shortWeek: shortWeekInfo,
    // Defensive matchup headlines
    defenseContext: {
      homePassDRank: defensiveMatchups?.home_defense_vs_away?.pass_defense_rank,
      homeRushDRank: defensiveMatchups?.home_defense_vs_away?.rush_defense_rank,
      awayPassDRank: defensiveMatchups?.away_defense_vs_home?.pass_defense_rank,
      awayRushDRank: defensiveMatchups?.away_defense_vs_home?.rush_defense_rank
    },
    // Weather summary
    weather: weather ? {
      temp: weather.temperature,
      wind: weather.wind_speed,
      conditions: weather.conditions,
      isDome: weather.is_dome
    } : null
  };

  console.log(`[NFL Props Context] ✓ Built ENHANCED context:`);
  console.log(`   - ${propCandidates.length} player candidates`);
  console.log(`   - ${playersWithLogs} players with game logs`);
  console.log(`   - ${formattedInjuries.length} injuries`);
  console.log(`   - Defensive matchups: ${defensiveMatchups?._isDefault ? 'DEFAULTS' : 'LIVE DATA'}`);
  console.log(`   - Weather: ${weather ? `${weather.temperature}°F, ${weather.conditions}` : 'N/A'}`);
  console.log(`   - Short week: ${shortWeekInfo.isShortWeek ? shortWeekInfo.type : 'No'}`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates,
    playerStats,
    playerGameLogs,
    defensiveMatchups,
    narrativeContext, // CRITICAL: Gemini Grounding context (storylines, player significance)
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      hasDefensiveData: !defensiveMatchups?._isDefault,
      hasNarrativeContext: !!narrativeContext
    }
  };
}

export default {
  buildNflPropsAgenticContext
};
