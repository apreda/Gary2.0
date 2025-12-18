/**
 * NBA Props Agentic Context Builder
 * Builds rich context for NBA player prop analysis
 * 
 * ENHANCED: Now fetches actual player season stats from BDL API including:
 * - PPG (points per game)
 * - RPG (rebounds per game)
 * - APG (assists per game)
 * - TPG (threes per game)
 * - SPG, BPG (steals, blocks per game)
 * - PRA (points + rebounds + assists)
 * - Minutes per game
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'basketball_nba';

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
    
    // Prioritize players with points props (most common)
    const hasPointsProp = player.props.some(p => 
      p.type === 'points' || p.type?.includes('points')
    );
    
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0) + (hasPointsProp ? 15 : 0)
    };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPlayers);
}

/**
 * Format injuries relevant to NBA props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
    .slice(0, 12)
    .map((injury) => ({
      player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
      position: injury?.player?.position || 'Unknown',
      status: injury?.status || 'Unknown',
      description: injury?.description || '',
      team: injury?.team?.full_name || ''
    }));
}

/**
 * Resolve player IDs from prop data or by searching BDL
 */
async function resolvePlayerIds(propCandidates, teamIds, season) {
  const playerIdMap = {}; // name -> id
  
  // First, collect any player_ids already in the props
  for (const candidate of propCandidates) {
    if (candidate.playerId) {
      playerIdMap[candidate.player.toLowerCase()] = candidate.playerId;
    }
  }
  
  // For players without IDs, try to resolve via BDL players endpoint
  const unresolvedNames = propCandidates
    .filter(c => !playerIdMap[c.player.toLowerCase()])
    .map(c => c.player);
  
  if (unresolvedNames.length > 0 && teamIds.length > 0) {
    try {
      // Fetch players for these teams
      const playersResponse = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
        team_ids: teamIds,
        per_page: 100
      }).catch(() => []);
      
      // Match by name (case-insensitive)
      for (const player of playersResponse) {
        const fullName = player.full_name || `${player.first_name} ${player.last_name}`;
        const normalizedName = fullName.toLowerCase().trim();
        
        for (const unresolvedName of unresolvedNames) {
          const candidateNormalized = unresolvedName.toLowerCase().trim();
          if (normalizedName === candidateNormalized ||
              normalizedName.includes(candidateNormalized) ||
              candidateNormalized.includes(normalizedName)) {
            playerIdMap[unresolvedName.toLowerCase()] = player.id;
            break;
          }
        }
      }
      
      console.log(`[NBA Props Context] Resolved ${Object.keys(playerIdMap).length}/${propCandidates.length} player IDs`);
    } catch (e) {
      console.warn('[NBA Props Context] Failed to resolve player IDs:', e.message);
    }
  }
  
  return playerIdMap;
}

/**
 * Fetch season stats for all prop candidates
 */
async function fetchPlayerSeasonStats(playerIdMap, season) {
  const playerIds = Object.values(playerIdMap).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NBA Props Context] No player IDs to fetch stats for');
    return {};
  }
  
  console.log(`[NBA Props Context] Fetching season stats for ${playerIds.length} players...`);
  
  try {
    const statsMap = await ballDontLieService.getNbaPlayerSeasonStatsForProps(playerIds, season);
    console.log(`[NBA Props Context] ✓ Got season stats for ${Object.keys(statsMap).length} players`);
    return statsMap;
  } catch (e) {
    console.warn('[NBA Props Context] Failed to fetch player season stats:', e.message);
    return {};
  }
}

/**
 * Fetch game logs for all prop candidates (last 10 games)
 * Includes consistency metrics, home/away splits, and recent form
 */
async function fetchPlayerGameLogs(playerIdMap) {
  const playerIds = Object.values(playerIdMap).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NBA Props Context] No player IDs to fetch game logs for');
    return {};
  }
  
  console.log(`[NBA Props Context] Fetching game logs for ${playerIds.length} players...`);
  
  try {
    const logsMap = await ballDontLieService.getNbaPlayerGameLogsBatch(playerIds, 10);
    console.log(`[NBA Props Context] ✓ Got game logs for ${Object.keys(logsMap).length} players`);
    return logsMap;
  } catch (e) {
    console.warn('[NBA Props Context] Failed to fetch player game logs:', e.message);
    return {};
  }
}

/**
 * Detect if either team is on a back-to-back (played yesterday)
 * B2B significantly impacts NBA player fatigue and performance
 * @param {Array<number>} teamIds - Team IDs
 * @param {string} gameDate - Game date string (YYYY-MM-DD)
 * @returns {Object} - { home: boolean, away: boolean }
 */
async function detectBackToBack(teamIds, gameDate) {
  const result = { home: false, away: false, homeLastGame: null, awayLastGame: null };

  if (!teamIds || teamIds.length === 0) return result;

  try {
    // Get yesterday's date
    const gameDateObj = new Date(gameDate);
    const yesterday = new Date(gameDateObj);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Check recent games for both teams using BDL
    // NBA uses getGames with date filter
    const recentGames = await ballDontLieService.getGames(SPORT_KEY, {
      dates: [yesterdayStr],
      team_ids: teamIds
    }).catch(() => []);

    if (recentGames.length > 0) {
      console.log(`[NBA Props Context] Found ${recentGames.length} games from yesterday for B2B check`);

      for (const game of recentGames) {
        const homeId = game.home_team?.id;
        const awayId = game.visitor_team?.id;

        // Check if our home team played yesterday
        if (teamIds[0] && (homeId === teamIds[0] || awayId === teamIds[0])) {
          result.home = true;
          result.homeLastGame = yesterdayStr;
        }

        // Check if our away team played yesterday
        if (teamIds[1] && (homeId === teamIds[1] || awayId === teamIds[1])) {
          result.away = true;
          result.awayLastGame = yesterdayStr;
        }
      }
    }

    return result;
  } catch (e) {
    console.warn('[NBA Props Context] B2B detection failed:', e.message);
    return result;
  }
}

/**
 * Build comprehensive player stats text with actual BDL data
 * ENHANCED: Now includes recent form, consistency, and home/away splits
 */
function buildPlayerStatsText(homeTeam, awayTeam, propCandidates, playerSeasonStats, playerIdMap, injuries, playerGameLogs = {}) {
  let statsText = '';
  
  // Helper to get stats for a player
  const getPlayerStats = (playerName) => {
    const playerId = playerIdMap[playerName.toLowerCase()];
    return playerId ? playerSeasonStats[playerId] : null;
  };
  
  // Helper to get game logs for a player
  const getPlayerLogs = (playerName) => {
    const playerId = playerIdMap[playerName.toLowerCase()];
    return playerId ? playerGameLogs[playerId] : null;
  };
  
  // Helper to format recent games as a string
  const formatRecentGames = (logs, statKey) => {
    if (!logs?.games || logs.games.length === 0) return '';
    const last5 = logs.games.slice(0, 5).map(g => g[statKey]);
    return `L5: [${last5.join(', ')}]`;
  };
  
  // Separate candidates by team
  const awayPlayers = propCandidates.filter(p => 
    p.team?.toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop()) ||
    awayTeam.toLowerCase().includes(p.team?.toLowerCase().split(' ').pop() || '')
  );
  const homePlayers = propCandidates.filter(p => 
    p.team?.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop()) ||
    homeTeam.toLowerCase().includes(p.team?.toLowerCase().split(' ').pop() || '')
  );
  
  // Check for injured players
  const injuredNames = new Set(injuries.map(i => i.player?.toLowerCase()));
  
  // Away team section
  statsText += `### ${awayTeam} Players\n`;
  
  if (awayPlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      if (stats) {
        statsText += `- **${candidate.player}** (${stats.position || 'N/A'})${injuryFlag}:\n`;
        statsText += `  Season: PPG ${stats.ppg || 'N/A'}, RPG ${stats.rpg || 'N/A'}, APG ${stats.apg || 'N/A'}, 3PG ${stats.tpg || 'N/A'}, PRA ${stats.pra || 'N/A'}, MPG ${stats.mpg || 'N/A'}\n`;
        
        // Add recent form if available
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: PTS ${logs.averages?.pts || 'N/A'}, REB ${logs.averages?.reb || 'N/A'}, AST ${logs.averages?.ast || 'N/A'}, 3PM ${logs.averages?.fg3m || 'N/A'} ${formIcon}\n`;
          statsText += `  Recent PTS: ${formatRecentGames(logs, 'pts')}\n`;
          
          // Consistency scores (higher = more reliable)
          if (logs.consistency) {
            const ptsConsistency = parseFloat(logs.consistency.pts);
            const consistencyLabel = ptsConsistency >= 0.7 ? 'HIGH' : ptsConsistency >= 0.5 ? 'MED' : 'LOW';
            statsText += `  Consistency: ${consistencyLabel} (${(ptsConsistency * 100).toFixed(0)}%)\n`;
          }
          
          // Home/Away splits if available
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Splits: Home ${logs.splits.home.pts} PPG (${logs.splits.home.games}g) | Away ${logs.splits.away.pts} PPG (${logs.splits.away.games}g)\n`;
          }
        }
        
        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }
  
  statsText += '\n';
  
  // Home team section
  statsText += `### ${homeTeam} Players\n`;
  
  if (homePlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of homePlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      if (stats) {
        statsText += `- **${candidate.player}** (${stats.position || 'N/A'})${injuryFlag}:\n`;
        statsText += `  Season: PPG ${stats.ppg || 'N/A'}, RPG ${stats.rpg || 'N/A'}, APG ${stats.apg || 'N/A'}, 3PG ${stats.tpg || 'N/A'}, PRA ${stats.pra || 'N/A'}, MPG ${stats.mpg || 'N/A'}\n`;
        
        // Add recent form if available
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: PTS ${logs.averages?.pts || 'N/A'}, REB ${logs.averages?.reb || 'N/A'}, AST ${logs.averages?.ast || 'N/A'}, 3PM ${logs.averages?.fg3m || 'N/A'} ${formIcon}\n`;
          statsText += `  Recent PTS: ${formatRecentGames(logs, 'pts')}\n`;
          
          // Consistency scores
          if (logs.consistency) {
            const ptsConsistency = parseFloat(logs.consistency.pts);
            const consistencyLabel = ptsConsistency >= 0.7 ? 'HIGH' : ptsConsistency >= 0.5 ? 'MED' : 'LOW';
            statsText += `  Consistency: ${consistencyLabel} (${(ptsConsistency * 100).toFixed(0)}%)\n`;
          }
          
          // Home/Away splits
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Splits: Home ${logs.splits.home.pts} PPG (${logs.splits.home.games}g) | Away ${logs.splits.away.pts} PPG (${logs.splits.away.games}g)\n`;
          }
        }
        
        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }
  
  // Add injury summary if any
  if (injuries.length > 0) {
    statsText += '\n### Injury Report\n';
    injuries.slice(0, 8).forEach(inj => {
      statsText += `- ${inj.player} (${inj.status}): ${inj.description?.slice(0, 80) || 'No details'}\n`;
    });
  }
  
  return statsText;
}

/**
 * Build token slices for prop analysis - enhanced with player stats and game logs
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerSeasonStats, playerIdMap, playerGameLogs = {}) {
  // Enhance prop candidates with their season stats and recent form
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    
    return {
      player: p.player,
      team: p.team,
      props: p.props,
      seasonStats: stats ? {
        ppg: stats.ppg,
        rpg: stats.rpg,
        apg: stats.apg,
        tpg: stats.tpg,
        spg: stats.spg,
        bpg: stats.bpg,
        pra: stats.pra,
        prCombo: stats.prCombo,
        paCombo: stats.paCombo,
        raCombo: stats.raCombo,
        mpg: stats.mpg,
        position: stats.position
      } : null,
      // NEW: Recent form data
      recentForm: logs ? {
        gamesAnalyzed: logs.gamesAnalyzed,
        averages: logs.averages,
        consistency: logs.consistency,
        splits: logs.splits,
        formTrend: logs.formTrend,
        lastGame: logs.lastGame,
        last5Games: logs.games?.slice(0, 5).map(g => ({
          pts: g.pts,
          reb: g.reb,
          ast: g.ast,
          fg3m: g.fg3m,
          opponent: g.opponent,
          isHome: g.isHome
        }))
      } : null
    };
  });
  
  return {
    player_stats: {
      summary: playerStats.substring(0, 5000), // Increased for more context
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
    market_context: marketSnapshot
  };
}

/**
 * Build agentic context for NBA prop picks
 * ENHANCED: Now fetches and includes real player season stats
 */
export async function buildNbaPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  // NBA season: Oct-Jun, so if month <= 6, it's previous year's season
  const season = month <= 6 ? year - 1 : year;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NBA Props Context] Building context for ${game.away_team} @ ${game.home_team} (${season} season)`);

  // Resolve teams
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
    ]);
  } catch (e) {
    console.warn('[NBA Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates first
  const propCandidates = getTopPropCandidates(playerProps, 15);
  
  // Parallel fetch: injuries and player ID resolution
  const [injuries, playerIdMap] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0 
      ? ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5).catch(() => [])
      : Promise.resolve([]),
    
    // Resolve player IDs from BDL
    resolvePlayerIds(propCandidates, teamIds, season)
  ]);

  // NOW fetch player season stats AND game logs in parallel (requires player IDs)
  console.log('[NBA Props Context] Fetching BDL player season stats and game logs...');
  const [playerSeasonStats, playerGameLogs] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap)
  ]);
  
  // Log stats coverage
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = propCandidates.length;
  console.log(`[NBA Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} players`);
  console.log(`[NBA Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  // B2B (back-to-back) detection - important for NBA fatigue
  const b2bInfo = await detectBackToBack(teamIds, dateStr);
  if (b2bInfo.home || b2bInfo.away) {
    console.log(`[NBA Props Context] ⚠️ B2B detected: Home=${b2bInfo.home ? 'YES' : 'no'}, Away=${b2bInfo.away ? 'YES' : 'no'}`);
  }

  const formattedInjuries = formatPropsInjuries(injuries);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text with REAL player data and recent form
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    propCandidates,
    playerSeasonStats,
    playerIdMap,
    formattedInjuries,
    playerGameLogs // NEW: Pass game logs for recent form
  );

  // Build token data with enhanced player info and game logs
  const tokenData = buildPropsTokenSlices(
    playerStats,
    propCandidates,
    formattedInjuries,
    marketSnapshot,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs // NEW: Pass game logs
  );

  // Build game summary with B2B info
  const gameSummary = {
    gameId: `nba-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NBA',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam?.full_name || game.home_team,
    awayTeam: awayTeam?.full_name || game.away_team,
    tipoff: formatGameTimeEST(game.commence_time),
    odds: {
      spread: marketSnapshot.spread,
      total: marketSnapshot.total,
      moneyline: marketSnapshot.moneyline
    },
    propCount: playerProps.length,
    topCandidates: propCandidates.map(p => p.player).slice(0, 6),
    playerStatsAvailable: playersWithStats > 0,
    // B2B detection - important for fatigue impact on props
    backToBack: {
      home: b2bInfo.home,
      away: b2bInfo.away
    }
  };

  console.log(`[NBA Props Context] ✓ Built context:`);
  console.log(`   - ${propCandidates.length} player candidates`);
  console.log(`   - ${playersWithStats} players with season stats`);
  console.log(`   - ${playersWithLogs} players with game logs`);
  console.log(`   - ${formattedInjuries.length} injuries`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates,
    playerStats,
    playerSeasonStats,
    playerGameLogs, // NEW: Include game logs in return
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      playerStatsCoverage: `${playersWithStats}/${totalCandidates}`,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}` // NEW
    }
  };
}

export default {
  buildNbaPropsAgenticContext
};
