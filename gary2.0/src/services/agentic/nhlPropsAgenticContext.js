/**
 * NHL Props Agentic Context Builder
 * Builds rich context for NHL player prop analysis
 * 
 * ENHANCED: Now fetches actual player season stats from BDL API including:
 * - Shots on goal per game (critical for SOG props)
 * - Goals, assists, points per game
 * - Power play production
 * - Time on ice
 * - Recent performance trends
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';
import { fetchGroundedContext } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'icehockey_nhl';

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
 * LIMITED: Only top 5 players per team to reduce API token usage
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 5) {
  const grouped = groupPropsByPlayer(props);
  
  // Score each player by number of props and odds quality
  // NOTE: No bias toward any specific prop type - Gary decides organically
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || -110;
      return sum + odds;
    }, 0) / player.props.length;
    
    // Prop variety bonus - reward players with multiple prop types available
    const uniquePropTypes = new Set(player.props.map(p => p.type)).size;
    
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0) + (uniquePropTypes * 5)
    };
  });
  
  // Group by team and take top N from each
  const byTeam = {};
  for (const player of scored) {
    const team = player.team || 'Unknown';
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push(player);
  }
  
  // Sort each team's players and take top N
  const result = [];
  for (const team of Object.keys(byTeam)) {
    const teamPlayers = byTeam[team]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPlayersPerTeam);
    result.push(...teamPlayers);
  }
  
  console.log(`[NHL Props] Filtered to top ${maxPlayersPerTeam} players per team: ${result.length} total candidates`);
  
  return result.sort((a, b) => b.score - a.score);
}

/**
 * Format injuries relevant to NHL props
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
 * CRITICAL: Also stores player's actual team to prevent wrong team assignment
 * Returns: { playerName: { id, team } }
 */
async function resolvePlayerIds(propCandidates, teamIds, season, homeTeamName, awayTeamName) {
  const playerIdMap = {}; // name -> { id, team }
  
  // CRITICAL: Do NOT trust pre-populated playerId from Odds API
  // Always verify against BDL roster to prevent players from other teams slipping through
  
  // Get all player names - we'll validate ALL of them against the roster
  const allPlayerNames = propCandidates.map(c => c.player);
  
  if (allPlayerNames.length > 0 && teamIds.length > 0) {
    try {
      // Fetch players for ONLY these two teams - this is our source of truth
      const playersResponse = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
        team_ids: teamIds,
        seasons: [season],
        per_page: 100
      }).catch(() => []);
      
      // Build team ID to name mapping
      const teamIdToName = {};
      if (teamIds[0]) teamIdToName[teamIds[0]] = homeTeamName;
      if (teamIds[1]) teamIdToName[teamIds[1]] = awayTeamName;
      
      // Build a lookup from BDL roster - these are the ONLY valid players
      const bdlRoster = new Map();
      for (const player of playersResponse) {
        const fullName = player.full_name || `${player.first_name} ${player.last_name}`;
        const normalizedName = fullName.toLowerCase().trim();
        const lastName = (player.last_name || '').toLowerCase().trim();
        const playerTeamId = player.team?.id || player.team_id;
        const playerTeam = teamIdToName[playerTeamId] || player.team?.full_name || 'Unknown';
        
        bdlRoster.set(normalizedName, { id: player.id, team: playerTeam });
        // Also store by last name for fuzzy matching
        if (lastName && !bdlRoster.has(lastName)) {
          bdlRoster.set(lastName, { id: player.id, team: playerTeam });
        }
      }
      
      // Match prop candidates against BDL roster
      for (const candidateName of allPlayerNames) {
        const candidateNormalized = candidateName.toLowerCase().trim();
        
        // Try exact match first
        if (bdlRoster.has(candidateNormalized)) {
          playerIdMap[candidateNormalized] = bdlRoster.get(candidateNormalized);
          continue;
        }
        
        // Try substring match against roster
        for (const [rosterName, playerData] of bdlRoster) {
          if (rosterName === candidateNormalized ||
              rosterName.includes(candidateNormalized) ||
              candidateNormalized.includes(rosterName)) {
            playerIdMap[candidateNormalized] = playerData;
            break;
          }
        }
      }
      
      console.log(`[NHL Props Context] Validated ${Object.keys(playerIdMap).length}/${allPlayerNames.length} players against ${homeTeamName} + ${awayTeamName} roster`);
      
      // Log players that aren't on either team (will be filtered out)
      const invalidPlayers = allPlayerNames.filter(name => !playerIdMap[name.toLowerCase()]);
      if (invalidPlayers.length > 0) {
        console.log(`[NHL Props Context] ⚠️ FILTERED OUT ${invalidPlayers.length} players NOT on ${homeTeamName} or ${awayTeamName}: ${invalidPlayers.slice(0, 5).join(', ')}${invalidPlayers.length > 5 ? '...' : ''}`);
      }
    } catch (e) {
      console.warn('[NHL Props Context] Failed to validate player roster:', e.message);
    }
  }
  
  return playerIdMap;
}

/**
 * Fetch season stats for all prop candidates
 * Returns map of playerId -> stats object
 */
async function fetchPlayerSeasonStats(playerIdMap, season) {
  // Extract just the IDs from the playerIdMap (now stores { id, team })
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NHL Props Context] No player IDs to fetch stats for');
    return {};
  }
  
  console.log(`[NHL Props Context] Fetching season stats for ${playerIds.length} players...`);
  
  try {
    const statsMap = await ballDontLieService.getNhlPlayersSeasonStatsBatch(playerIds, season);
    console.log(`[NHL Props Context] ✓ Got season stats for ${Object.keys(statsMap).length} players`);
    return statsMap;
  } catch (e) {
    console.warn('[NHL Props Context] Failed to fetch player season stats:', e.message);
    return {};
  }
}

/**
 * Fetch game logs for all prop candidates (last 10 games)
 * Includes consistency metrics, home/away splits, and recent form
 */
async function fetchPlayerGameLogs(playerIdMap) {
  // Extract just the IDs from the playerIdMap (now stores { id, team })
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NHL Props Context] No player IDs to fetch game logs for');
    return {};
  }
  
  console.log(`[NHL Props Context] Fetching game logs for ${playerIds.length} players...`);
  
  try {
    const logsMap = await ballDontLieService.getNhlPlayerGameLogsBatch(playerIds, 10);
    console.log(`[NHL Props Context] ✓ Got game logs for ${Object.keys(logsMap).length} players`);
    return logsMap;
  } catch (e) {
    console.warn('[NHL Props Context] Failed to fetch player game logs:', e.message);
    return {};
  }
}

/**
 * Process goalie data from BDL and Perplexity
 * BDL provides concrete season stats, Perplexity may have starter confirmations
 * @param {Object} bdlGoalieData - Goalie data from BDL by team ID
 * @param {Object} advancedStats - Perplexity advanced stats (may include goalie_matchup)
 * @param {Object} homeTeam - Home team object from BDL
 * @param {Object} awayTeam - Away team object from BDL
 * @returns {Object} - { home: goalieInfo, away: goalieInfo }
 */
function processGoalieData(bdlGoalieData, advancedStats, homeTeam, awayTeam) {
  const result = { home: null, away: null };

  // Get BDL goalies (sorted by games_started, so first is likely starter)
  const homeGoalies = homeTeam?.id ? (bdlGoalieData[homeTeam.id] || []) : [];
  const awayGoalies = awayTeam?.id ? (bdlGoalieData[awayTeam.id] || []) : [];

  // BDL likely starter (most games started)
  if (homeGoalies.length > 0) {
    const likelyStarter = homeGoalies[0]; // Already sorted by games_started
    result.home = {
      name: likelyStarter.name,
      source: 'bdl',
      games_played: likelyStarter.games_played,
      games_started: likelyStarter.games_started,
      wins: likelyStarter.wins,
      losses: likelyStarter.losses,
      save_pct: likelyStarter.save_pct,
      goals_against_average: likelyStarter.goals_against_average,
      shutouts: likelyStarter.shutouts,
      isConfirmedStarter: false // BDL can't confirm tonight's starter
    };
  }

  if (awayGoalies.length > 0) {
    const likelyStarter = awayGoalies[0];
    result.away = {
      name: likelyStarter.name,
      source: 'bdl',
      games_played: likelyStarter.games_played,
      games_started: likelyStarter.games_started,
      wins: likelyStarter.wins,
      losses: likelyStarter.losses,
      save_pct: likelyStarter.save_pct,
      goals_against_average: likelyStarter.goals_against_average,
      shutouts: likelyStarter.shutouts,
      isConfirmedStarter: false
    };
  }

  // Enrich with Perplexity data if available (may have starter confirmations)
  const perplexityGoalies = advancedStats?.goalie_matchup;
  if (perplexityGoalies) {
    if (perplexityGoalies.home_starter) {
      if (result.home) {
        // Check if Perplexity names a different starter (confirmed)
        if (perplexityGoalies.home_starter !== result.home.name) {
          console.log(`[NHL Props Context] Perplexity indicates different home starter: ${perplexityGoalies.home_starter} vs BDL: ${result.home.name}`);
          result.home.perplexity_starter = perplexityGoalies.home_starter;
        }
        result.home.perplexity_sv_pct = perplexityGoalies.home_sv_pct;
        result.home.isConfirmedStarter = true; // Perplexity usually has day-of info
      } else {
        result.home = {
          name: perplexityGoalies.home_starter,
          source: 'perplexity',
          save_pct: perplexityGoalies.home_sv_pct,
          isConfirmedStarter: true
        };
      }
    }

    if (perplexityGoalies.away_starter) {
      if (result.away) {
        if (perplexityGoalies.away_starter !== result.away.name) {
          console.log(`[NHL Props Context] Perplexity indicates different away starter: ${perplexityGoalies.away_starter} vs BDL: ${result.away.name}`);
          result.away.perplexity_starter = perplexityGoalies.away_starter;
        }
        result.away.perplexity_sv_pct = perplexityGoalies.away_sv_pct;
        result.away.isConfirmedStarter = true;
      } else {
        result.away = {
          name: perplexityGoalies.away_starter,
          source: 'perplexity',
          save_pct: perplexityGoalies.away_sv_pct,
          isConfirmedStarter: true
        };
      }
    }
  }

  return result;
}

/**
 * Detect if either team is on a back-to-back (played yesterday)
 * B2B significantly impacts player fatigue and performance
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

    // Check recent box scores for both teams
    const recentDates = [yesterdayStr];
    const boxScores = await ballDontLieService.getNhlRecentBoxScores(recentDates, { team_ids: teamIds }).catch(() => []);

    if (boxScores.length > 0) {
      console.log(`[NHL Props Context] Found ${boxScores.length} box scores from yesterday for B2B check`);

      for (const box of boxScores) {
        const homeId = box.game?.home_team?.id;
        const awayId = box.game?.away_team?.id;

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
    console.warn('[NHL Props Context] B2B detection failed:', e.message);
    return result;
  }
}

/**
 * Build comprehensive player stats text with actual BDL data
 * ENHANCED: Now includes recent form, consistency, and home/away splits
 */
function buildPlayerStatsText(homeTeam, awayTeam, advancedStats, propCandidates, playerSeasonStats, playerIdMap, richContext, playerGameLogs = {}) {
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
  
  // Helper to format recent games
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
  
  // Away team section
  statsText += `### ${awayTeam} Players\n`;
  
  // Team-level context from Perplexity
  if (advancedStats?.away_advanced) {
    const away = advancedStats.away_advanced;
    statsText += `Team: CF% ${away.corsi_for_pct ?? 'N/A'}, xGF% ${away.expected_goals_for_pct ?? 'N/A'}, PDO ${away.pdo ?? 'N/A'}\n`;
  }
  if (advancedStats?.recent_form?.away_last_10) {
    statsText += `Form: ${advancedStats.recent_form.away_last_10} (${advancedStats.recent_form.away_goals_per_game_l10 ?? 'N/A'} G/game L10)\n`;
  }
  if (advancedStats?.goalie_matchup?.away_starter) {
    const g = advancedStats.goalie_matchup;
    statsText += `Goalie: ${g.away_starter} (${g.away_sv_pct ?? 'N/A'} SV%)\n`;
  }
  
  // Individual player stats for away team
  if (awayPlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      
      if (stats) {
        statsText += `- **${candidate.player}**:\n`;
        statsText += `  Season: ${stats.games_played || 0} GP, SOG/G ${stats.shots_per_game || 'N/A'}, G/G ${stats.goals_per_game || 'N/A'}, A/G ${stats.assists_per_game || 'N/A'}, P/G ${stats.points_per_game || 'N/A'}, PP Pts ${stats.power_play_points || 0}, TOI/G ${stats.time_on_ice_per_game || 'N/A'}\n`;
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: SOG ${logs.averages?.sog || 'N/A'}, PTS ${logs.averages?.points || 'N/A'}, G ${logs.averages?.goals || 'N/A'}, A ${logs.averages?.assists || 'N/A'} ${formIcon}\n`;
          
          // Show recent games for ALL prop types - no bias toward any stat
          statsText += `  Recent: SOG [${formatRecentGames(logs, 'sog')}] | PTS [${formatRecentGames(logs, 'points')}] | G [${formatRecentGames(logs, 'goals')}] | A [${formatRecentGames(logs, 'assists')}]\n`;
          
          // Consistency scores for ALL stat types - Gary decides which matters
          if (logs.consistency) {
            const sogC = logs.consistency.sog ? (parseFloat(logs.consistency.sog) * 100).toFixed(0) : 'N/A';
            const ptsC = logs.consistency.points ? (parseFloat(logs.consistency.points) * 100).toFixed(0) : 'N/A';
            const goalsC = logs.consistency.goals ? (parseFloat(logs.consistency.goals) * 100).toFixed(0) : 'N/A';
            statsText += `  Consistency: SOG ${sogC}% | PTS ${ptsC}% | G ${goalsC}%\n`;
          }
          
          // Home/Away splits - show multiple stats
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Home: ${logs.splits.home.sog || 'N/A'} SOG, ${logs.splits.home.points || 'N/A'} PTS, ${logs.splits.home.goals || 'N/A'} G (${logs.splits.home.games}g)\n`;
            statsText += `  Away: ${logs.splits.away.sog || 'N/A'} SOG, ${logs.splits.away.points || 'N/A'} PTS, ${logs.splits.away.goals || 'N/A'} G (${logs.splits.away.games}g)\n`;
          }
        }
        
        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }
  
  statsText += '\n';
  
  // Home team section
  statsText += `### ${homeTeam} Players\n`;
  
  // Team-level context from Perplexity
  if (advancedStats?.home_advanced) {
    const home = advancedStats.home_advanced;
    statsText += `Team: CF% ${home.corsi_for_pct ?? 'N/A'}, xGF% ${home.expected_goals_for_pct ?? 'N/A'}, PDO ${home.pdo ?? 'N/A'}\n`;
  }
  if (advancedStats?.recent_form?.home_last_10) {
    statsText += `Form: ${advancedStats.recent_form.home_last_10} (${advancedStats.recent_form.home_goals_per_game_l10 ?? 'N/A'} G/game L10)\n`;
  }
  if (advancedStats?.goalie_matchup?.home_starter) {
    const g = advancedStats.goalie_matchup;
    statsText += `Goalie: ${g.home_starter} (${g.home_sv_pct ?? 'N/A'} SV%)\n`;
  }
  
  // Individual player stats for home team
  if (homePlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of homePlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      
      if (stats) {
        statsText += `- **${candidate.player}**:\n`;
        statsText += `  Season: ${stats.games_played || 0} GP, SOG/G ${stats.shots_per_game || 'N/A'}, G/G ${stats.goals_per_game || 'N/A'}, A/G ${stats.assists_per_game || 'N/A'}, P/G ${stats.points_per_game || 'N/A'}, PP Pts ${stats.power_play_points || 0}, TOI/G ${stats.time_on_ice_per_game || 'N/A'}\n`;
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: SOG ${logs.averages?.sog || 'N/A'}, PTS ${logs.averages?.points || 'N/A'}, G ${logs.averages?.goals || 'N/A'}, A ${logs.averages?.assists || 'N/A'} ${formIcon}\n`;
          
          // Show recent games for ALL prop types - no bias toward any stat
          statsText += `  Recent: SOG [${formatRecentGames(logs, 'sog')}] | PTS [${formatRecentGames(logs, 'points')}] | G [${formatRecentGames(logs, 'goals')}] | A [${formatRecentGames(logs, 'assists')}]\n`;
          
          // Consistency scores for ALL stat types - Gary decides which matters
          if (logs.consistency) {
            const sogC = logs.consistency.sog ? (parseFloat(logs.consistency.sog) * 100).toFixed(0) : 'N/A';
            const ptsC = logs.consistency.points ? (parseFloat(logs.consistency.points) * 100).toFixed(0) : 'N/A';
            const goalsC = logs.consistency.goals ? (parseFloat(logs.consistency.goals) * 100).toFixed(0) : 'N/A';
            statsText += `  Consistency: SOG ${sogC}% | PTS ${ptsC}% | G ${goalsC}%\n`;
          }
          
          // Home/Away splits - show multiple stats
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Home: ${logs.splits.home.sog || 'N/A'} SOG, ${logs.splits.home.points || 'N/A'} PTS, ${logs.splits.home.goals || 'N/A'} G (${logs.splits.home.games}g)\n`;
            statsText += `  Away: ${logs.splits.away.sog || 'N/A'} SOG, ${logs.splits.away.points || 'N/A'} PTS, ${logs.splits.away.goals || 'N/A'} G (${logs.splits.away.games}g)\n`;
          }
        }
        
        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }
  
  // Key insights from Perplexity
  if (advancedStats?.key_analytics_insights?.length > 0) {
    statsText += '\n### Key Insights\n';
    advancedStats.key_analytics_insights.slice(0, 4).forEach((insight, i) => {
      statsText += `${i + 1}. ${insight}\n`;
    });
  }
  
  // Player streaks from rich context
  if (richContext?.player_streaks?.length > 0) {
    statsText += '\n### Player Streaks & Trends\n';
    richContext.player_streaks.slice(0, 5).forEach(streak => {
      const text = typeof streak === 'string' ? streak : streak?.description || JSON.stringify(streak);
      statsText += `- ${text}\n`;
    });
  }
  
  return statsText;
}

/**
 * Build token slices for prop analysis - enhanced with player stats and game logs
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, advancedStats, playerSeasonStats, playerIdMap, playerGameLogs = {}) {
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
        gamesPlayed: stats.games_played,
        sogPerGame: stats.shots_per_game,
        goalsPerGame: stats.goals_per_game,
        assistsPerGame: stats.assists_per_game,
        pointsPerGame: stats.points_per_game,
        ppPoints: stats.power_play_points,
        toiPerGame: stats.time_on_ice_per_game
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
          sog: g.sog,
          goals: g.goals,
          assists: g.assists,
          points: g.points,
          opponent: g.opponent,
          isHome: g.isHome
        }))
      } : null
    };
  });
  
  return {
    player_stats: {
      summary: playerStats.substring(0, 5000), // Increased for more context
      playerCount: (playerStats.match(/\*\*/g) || []).length / 2 // Count bold player names
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
    team_analytics: {
      home: advancedStats?.home_advanced || null,
      away: advancedStats?.away_advanced || null
    },
    goalie_matchup: advancedStats?.goalie_matchup || null,
    five_on_five: advancedStats?.five_on_five || null
  };
}

/**
 * Build agentic context for NHL prop picks
 * ENHANCED: Now fetches and includes real player season stats
 */
export async function buildNhlPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  const season = month <= 6 ? year - 1 : year;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NHL Props Context] Building context for ${game.away_team} @ ${game.home_team} (Season ${season})`);

  // Resolve teams
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
    ]);
  } catch (e) {
    console.warn('[NHL Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates first - limit to top 5 players per team
  const propCandidates = getTopPropCandidates(playerProps, 5);
  
  // Parallel fetch: injuries, player ID resolution, BDL goalies, Gemini Grounding (PRIMARY)
  // Note: Gemini Grounding is the PRIMARY source for narrative context. Perplexity removed as backup.
  const [injuries, playerIdMap, bdlGoalieData, groundedContext] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0 
      ? ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5).catch(() => [])
      : Promise.resolve([]),
    
    // Resolve player IDs from BDL - also validates players are on one of the two teams
    resolvePlayerIds(propCandidates, teamIds, season, game.home_team, game.away_team),
    
    // Fetch goalies from BDL for both teams
    teamIds.length > 0
      ? ballDontLieService.getNhlTeamGoalies(teamIds, season).catch(e => {
          console.warn('[NHL Props Context] BDL goalie fetch failed:', e.message);
          return {};
        })
      : Promise.resolve({}),
    
    // NARRATIVE CONTEXT via Gemini Grounding - PRIMARY source for storylines, streaks, player significance
    // Use Flash model for props to avoid Pro quota issues
    fetchGroundedContext(game.home_team, game.away_team, 'NHL', dateStr, { useFlash: true }).catch(e => {
      console.warn('[NHL Props Context] Gemini Grounding failed:', e.message);
      return null;
    })
  ]);
  
  // Advanced stats placeholder (was Perplexity, now skipped - Gemini Grounding provides narrative context)
  const advancedStats = null;
  const richContext = null;
  
  // Extract narrative context for props (Gemini takes priority, fall back to Perplexity)
  const narrativeContext = groundedContext?.groundedRaw || null;
  if (narrativeContext) {
    console.log(`[NHL Props Context] ✓ Got narrative context (${narrativeContext.length} chars) from Gemini Grounding`);
  }

  // CRITICAL: Filter prop candidates to only include players verified on either team
  // This prevents players on other teams from appearing in props
  const validatedCandidates = propCandidates.filter(c => {
    const playerData = playerIdMap[c.player.toLowerCase()];
    if (playerData) {
      // Update the candidate's team with verified team from BDL
      c.team = playerData.team;
      return true;
    }
    return false; // Filter out players not on either team
  });
  
  if (validatedCandidates.length < propCandidates.length) {
    console.log(`[NHL Props Context] Validated ${validatedCandidates.length}/${propCandidates.length} players (filtered out players not on ${game.away_team} or ${game.home_team})`);
  }

  // NOW fetch player season stats AND game logs in parallel (requires player IDs)
  console.log('[NHL Props Context] Fetching BDL player season stats and game logs...');
  const [playerSeasonStats, playerGameLogs] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap)
  ]);
  
  // Log stats coverage (use validated candidates)
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = validatedCandidates.length;
  console.log(`[NHL Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} players`);
  console.log(`[NHL Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  // Process BDL goalie data - prioritize BDL (concrete stats) but include Perplexity for context
  const goalieInfo = processGoalieData(bdlGoalieData, advancedStats, homeTeam, awayTeam);
  if (goalieInfo.home || goalieInfo.away) {
    console.log(`[NHL Props Context] Goalie info: Home=${goalieInfo.home?.name || 'Unknown'} (${goalieInfo.home?.save_pct || 'N/A'} SV%), Away=${goalieInfo.away?.name || 'Unknown'} (${goalieInfo.away?.save_pct || 'N/A'} SV%)`);
  }

  // B2B (back-to-back) detection - check if either team played yesterday
  const b2bInfo = await detectBackToBack(teamIds, dateStr, bdlGoalieData);
  if (b2bInfo.home || b2bInfo.away) {
    console.log(`[NHL Props Context] B2B detected: Home=${b2bInfo.home ? 'YES' : 'no'}, Away=${b2bInfo.away ? 'YES' : 'no'}`);
  }

  const formattedInjuries = formatPropsInjuries(injuries);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text with REAL player data and recent form
  // Build player stats text using validated candidates only
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    advancedStats,
    validatedCandidates,
    playerSeasonStats,
    playerIdMap,
    richContext,
    playerGameLogs // Pass game logs for recent form
  );

  // Build token data with enhanced player info and game logs
  const tokenData = buildPropsTokenSlices(
    playerStats,
    validatedCandidates,
    formattedInjuries,
    marketSnapshot,
    advancedStats,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs // Pass game logs
  );

  // Build game summary with enhanced goalie and B2B info
  const gameSummary = {
    gameId: `nhl-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NHL',
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
    topCandidates: validatedCandidates.map(p => p.player).slice(0, 6),
    // ENHANCED: Goalie info from BDL + Perplexity
    goalies: {
      home: goalieInfo.home ? {
        name: goalieInfo.home.name,
        save_pct: goalieInfo.home.save_pct,
        gaa: goalieInfo.home.goals_against_average,
        games_started: goalieInfo.home.games_started,
        record: goalieInfo.home.wins && goalieInfo.home.losses ? `${goalieInfo.home.wins}-${goalieInfo.home.losses}` : null,
        isConfirmedStarter: goalieInfo.home.isConfirmedStarter,
        source: goalieInfo.home.source
      } : null,
      away: goalieInfo.away ? {
        name: goalieInfo.away.name,
        save_pct: goalieInfo.away.save_pct,
        gaa: goalieInfo.away.goals_against_average,
        games_started: goalieInfo.away.games_started,
        record: goalieInfo.away.wins && goalieInfo.away.losses ? `${goalieInfo.away.wins}-${goalieInfo.away.losses}` : null,
        isConfirmedStarter: goalieInfo.away.isConfirmedStarter,
        source: goalieInfo.away.source
      } : null
    },
    // NEW: Back-to-back detection (important for fatigue)
    backToBack: {
      home: b2bInfo.home,
      away: b2bInfo.away
    },
    // NEW: Flag indicating player stats availability
    playerStatsAvailable: playersWithStats > 0
  };

  const advancedSource = advancedStats?._source || 'none';
  const richContextFound = richContext && Object.keys(richContext).length > 0;
  
  console.log(`[NHL Props Context] ✓ Built context:`);
  console.log(`   - ${validatedCandidates.length} player candidates (verified on team)`);
  console.log(`   - ${playersWithStats} players with season stats`);
  console.log(`   - ${playersWithLogs} players with game logs`);
  console.log(`   - ${formattedInjuries.length} injuries`);
  console.log(`   - Advanced stats: ${advancedSource}`);
  console.log(`   - Rich context: ${richContextFound}`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: validatedCandidates, // Only return validated players on either team
    playerStats,
    playerSeasonStats,
    playerGameLogs, // Include game logs in return
    narrativeContext, // CRITICAL: Gemini Grounding context (storylines, player momentum)
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      advancedStatsSource: advancedSource,
      perplexityDataSources: advancedStats?.data_sources || [],
      keyFindings: richContext?.key_findings || advancedStats?.key_analytics_insights || [],
      playerStatsCoverage: `${playersWithStats}/${totalCandidates}`,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      hasNarrativeContext: !!narrativeContext
    }
  };
}

export default {
  buildNhlPropsAgenticContext
};
