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
// All context comes from Gemini 3 Flash with Google Search Grounding
import { 
  formatGameTimeEST, 
  buildMarketSnapshot, 
  parseGameDate, 
  safeApiCallArray, 
  safeApiCallObject, 
  findBestPlayerMatch, 
  checkDataAvailability,
  fixBdlInjuryStatus
} from './sharedUtils.js';
import { fetchComprehensivePropsNarrative } from './scoutReport/scoutReportBuilder.js';

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
 * Returns top N players PER TEAM (so 7 per team = 14 total for a game)
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 7) {
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
  // Normalize team names to handle variations
  const byTeam = {};
  for (const player of scored) {
    const teamRaw = player.team || 'Unknown';
    const teamKey = teamRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!byTeam[teamKey]) byTeam[teamKey] = { name: teamRaw, players: [] };
    byTeam[teamKey].players.push(player);
  }
  
  // Sort each team's players and take top N per team
  const result = [];
  const teamNames = Object.keys(byTeam);
  
  for (const teamKey of teamNames) {
    const teamData = byTeam[teamKey];
    const teamPlayers = teamData.players
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPlayersPerTeam);
    result.push(...teamPlayers);
    console.log(`[NHL Props] Team "${teamData.name}": ${teamPlayers.length} players selected`);
  }
  
  console.log(`[NHL Props] Total: ${result.length} candidates (${maxPlayersPerTeam} per team x ${teamNames.length} teams)`);
  
  return result.sort((a, b) => b.score - a.score);
}

/**
 * Format injuries relevant to NHL props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
    .slice(0, 15) // Increased slice for more coverage
    .map((injury) => {
      const fixedInj = fixBdlInjuryStatus(injury);
      return {
        player: fixedInj?.player?.full_name || `${fixedInj?.player?.first_name || ''} ${fixedInj?.player?.last_name || ''}`.trim(),
        position: fixedInj?.player?.position || 'Unknown',
        status: fixedInj?.status || 'Unknown',
        description: fixedInj?.description || '',
        team: fixedInj?.team?.full_name || '',
        duration: fixedInj?.duration || 'UNKNOWN',
        isEdge: fixedInj?.isEdge || false
      };
    });
}

/**
 * Resolve player IDs from prop data by searching BDL by name
 * CRITICAL: Uses player search (not team roster) because BDL roster endpoint returns stale data
 * NOTE: BDL /players?team_ids[]=X returns outdated rosters, but /players?search=name returns current teams
 * Returns: { playerName: { id, team } }
 */
async function resolvePlayerIds(propCandidates, teamIds, season, homeTeamName, awayTeamName) {
  const playerIdMap = {}; // name -> { id, team }
  
  // Get all player names - we'll search each one individually
  const allPlayerNames = propCandidates.map(c => c.player);
  
  if (allPlayerNames.length === 0) {
    return playerIdMap;
  }
  
  // Normalize team names for matching
  const normalizeTeamName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeamName(homeTeamName);
  const awayNorm = normalizeTeamName(awayTeamName);
  const validTeamIds = new Set(teamIds);
  
  console.log(`[NHL Props Context] Searching BDL by player name for ${allPlayerNames.length} candidates...`);
  
  // Search each player by name (batch in parallel, max 5 concurrent)
  const batchSize = 5;
  const invalidPlayers = [];
  
  for (let i = 0; i < allPlayerNames.length; i += batchSize) {
    const batch = allPlayerNames.slice(i, i + batchSize);
    
    const searchPromises = batch.map(async (candidateName) => {
      try {
        // Extract last name for search (more reliable)
        const nameParts = candidateName.trim().split(' ');
        const lastName = nameParts[nameParts.length - 1];
        
        // Search by last name - with logging on failure
        const searchResults = await safeApiCallArray(
          () => ballDontLieService.getPlayersGeneric(SPORT_KEY, { search: lastName, per_page: 10 }),
          `NHL Props: Search player "${candidateName}"`
        );
        
        if (!searchResults || searchResults.length === 0) {
          return { name: candidateName, found: false };
        }
        
        // Find match using fuzzy matching to handle name variations (P.K. vs PK, etc.)
        const match = findBestPlayerMatch(candidateName, searchResults);
        
        if (!match) {
          return { name: candidateName, found: false };
        }
        
        // Check if player is on one of the two teams in this game
        const playerTeamId = match.team?.id || match.team_id;
        const playerTeamName = match.team?.full_name || '';
        const playerTeamNorm = normalizeTeamName(playerTeamName);
        
        // Validate team: check team_id match OR team name contains home/away
        const isOnValidTeam = validTeamIds.has(playerTeamId) ||
          playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm) ||
          playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);
        
        if (isOnValidTeam) {
          return {
            name: candidateName,
            found: true,
            id: match.id,
            team: playerTeamName
          };
        } else {
          return { name: candidateName, found: false, wrongTeam: playerTeamName };
        }
      } catch (e) {
        return { name: candidateName, found: false, error: e.message };
      }
    });
    
    const results = await Promise.all(searchPromises);
    
    for (const result of results) {
      if (result.found) {
        playerIdMap[result.name.toLowerCase()] = { id: result.id, team: result.team };
      } else {
        invalidPlayers.push({ name: result.name, reason: result.wrongTeam ? `on ${result.wrongTeam}` : 'not found' });
      }
    }
  }
  
  console.log(`[NHL Props Context] Validated ${Object.keys(playerIdMap).length}/${allPlayerNames.length} players against ${homeTeamName} + ${awayTeamName}`);
  
  // Log players that aren't on either team (will be filtered out)
  if (invalidPlayers.length > 0) {
    const filtered = invalidPlayers.filter(p => p.reason !== 'not found');
    if (filtered.length > 0) {
      console.log(`[NHL Props Context] ⚠️ FILTERED OUT ${filtered.length} players NOT on ${homeTeamName} or ${awayTeamName}: ${filtered.slice(0, 5).map(p => `${p.name} (${p.reason})`).join(', ')}${filtered.length > 5 ? '...' : ''}`);
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
 * Process goalie data from BDL and Gemini Grounding
 * BDL provides concrete season stats, Grounding may have starter confirmations
 * @param {Object} bdlGoalieData - Goalie data from BDL by team ID
 * @param {Object} advancedStats - Grounding advanced stats (may include goalie_matchup)
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

  // Enrich with Grounding data if available (may have starter confirmations)
  const groundingGoalies = advancedStats?.goalie_matchup;
  if (groundingGoalies) {
    if (groundingGoalies.home_starter) {
      if (result.home) {
        // Check if Grounding names a different starter (confirmed)
        if (groundingGoalies.home_starter !== result.home.name) {
          console.log(`[NHL Props Context] Grounding indicates different home starter: ${groundingGoalies.home_starter} vs BDL: ${result.home.name}`);
          result.home.grounding_starter = groundingGoalies.home_starter;
        }
        result.home.grounding_sv_pct = groundingGoalies.home_sv_pct;
        result.home.isConfirmedStarter = true; // Grounding usually has day-of info
      } else {
        result.home = {
          name: groundingGoalies.home_starter,
          source: 'gemini_grounding',
          save_pct: groundingGoalies.home_sv_pct,
          isConfirmedStarter: true
        };
      }
    }

    if (groundingGoalies.away_starter) {
      if (result.away) {
        if (groundingGoalies.away_starter !== result.away.name) {
          console.log(`[NHL Props Context] Grounding indicates different away starter: ${groundingGoalies.away_starter} vs BDL: ${result.away.name}`);
          result.away.grounding_starter = groundingGoalies.away_starter;
        }
        result.away.grounding_sv_pct = groundingGoalies.away_sv_pct;
        result.away.isConfirmedStarter = true;
      } else {
        result.away = {
          name: groundingGoalies.away_starter,
          source: 'gemini_grounding',
          save_pct: groundingGoalies.away_sv_pct,
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

    // Check recent box scores for both teams - with logging on failure
    const recentDates = [yesterdayStr];
    const boxScores = await safeApiCallArray(
      () => ballDontLieService.getNhlRecentBoxScores(recentDates, { team_ids: teamIds }),
      `NHL Props: B2B detection box scores for ${yesterdayStr}`
    );

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
  
  // Team-level context from Gemini Grounding
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
      
      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` ⚠️ INJURED${durationTag}` : '';
      
      if (stats) {
        statsText += `- **${candidate.player}**${injuryFlag}:\n`;
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
  
  // Team-level context from Gemini Grounding
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
      
      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` ⚠️ INJURED${durationTag}` : '';
      
      if (stats) {
        statsText += `- **${candidate.player}**${injuryFlag}:\n`;
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
  
  // Key insights from Grounding
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
  // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
  const season = month >= 10 ? year : year - 1;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NHL Props Context] Building context for ${game.away_team} @ ${game.home_team} (Season ${season})`);

  // Resolve teams - with detailed logging if fails
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
        `NHL Props: Resolve home team "${game.home_team}"`
      ),
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team),
        `NHL Props: Resolve away team "${game.away_team}"`
      )
    ]);
  } catch (e) {
    console.warn('[NHL Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates first - 7 players per team (14 total)
  const propCandidates = getTopPropCandidates(playerProps, 7);
  
  // Parallel fetch: injuries, player ID resolution, BDL goalies, COMPREHENSIVE narrative context
  // IMPORTANT: Narrative context is fetched UPFRONT so Gary knows all factors BEFORE iterations
  console.log('[NHL Props Context] Fetching injuries, player IDs, goalies, and COMPREHENSIVE narrative...');
  const [injuries, playerIdMap, bdlGoalieData, comprehensiveNarrative] = await Promise.all([
    // Injuries from BDL - with logging if fails
    teamIds.length > 0 
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `NHL Props: Fetch injuries for teams ${teamIds.join(', ')}`
        )
      : Promise.resolve([]),
    
    // Resolve player IDs from BDL - also validates players are on one of the two teams
    resolvePlayerIds(propCandidates, teamIds, season, game.home_team, game.away_team),
    
    // Fetch goalies from BDL for both teams - with logging if fails
    teamIds.length > 0
      ? safeApiCallObject(
          () => ballDontLieService.getNhlTeamGoalies(teamIds, season),
          `NHL Props: Fetch goalies for teams ${teamIds.join(', ')}`
        ).then(result => result || {})
      : Promise.resolve({}),
    
    // COMPREHENSIVE NARRATIVE CONTEXT - Fetches ALL factors UPFRONT:
    // - Breaking news (last-minute scratches, trades)
    // - Motivation (revenge games, milestones, contract years)
    // - Goalie situation (confirmed starters, B2B rest)
    // - Schedule (B2B fatigue, road trips)
    // - Player-specific (line changes, hot/cold streaks)
    // - Team trends (streaks, rivalries)
    // - Betting signals (line movement, public % - MINOR ONLY)
    fetchComprehensivePropsNarrative(game.home_team, game.away_team, 'NHL', dateStr, { useFlash: true }).catch(e => {
      console.warn('[NHL Props Context] Comprehensive narrative failed:', e.message);
      return null;
    })
  ]);
  
  // Advanced stats placeholder (Gemini Grounding provides narrative context)
  const advancedStats = null;
  const richContext = null;
  
  // Extract narrative context - now includes structured sections
  const narrativeContext = comprehensiveNarrative?.raw || null;
  const narrativeSections = comprehensiveNarrative?.sections || {};
  if (narrativeContext) {
    console.log(`[NHL Props Context] ✓ Got COMPREHENSIVE narrative context (${narrativeContext.length} chars)`);
    const foundSections = Object.entries(narrativeSections)
      .filter(([_, v]) => v && v.length > 10)
      .map(([k, _]) => k);
    if (foundSections.length > 0) {
      console.log(`[NHL Props Context] ✓ Parsed sections: ${foundSections.join(', ')}`);
    }
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

  const formattedInjuries = formatPropsInjuries(injuries);

  // CRITICAL: Filter out players who are Doubtful or Day-To-Day to avoid void bets
  // If a player doesn't play, the bet is voided and we can't replace the pick in time
  const riskyStatuses = ['doubtful', 'day-to-day', 'day to day', 'questionable'];
  const injuredPlayerNames = formattedInjuries
    .filter(inj => riskyStatuses.some(status => (inj.status || '').toLowerCase().includes(status)))
    .map(inj => inj.player.toLowerCase())
    .filter(name => name.length > 2);

  const availableCandidates = validatedCandidates.filter(c => {
    const playerNameLower = c.player.toLowerCase();
    const isRisky = injuredPlayerNames.some(injName => 
      playerNameLower.includes(injName) || injName.includes(playerNameLower)
    );
    if (isRisky) {
      console.log(`[NHL Props Context] ⚠️ EXCLUDED ${c.player} - Doubtful/Day-To-Day (risk of void bet)`);
    }
    return !isRisky;
  });

  if (availableCandidates.length < validatedCandidates.length) {
    const excluded = validatedCandidates.length - availableCandidates.length;
    console.log(`[NHL Props Context] Filtered out ${excluded} Doubtful/Day-To-Day player(s) to avoid void bets`);
  }

  // NOW fetch player season stats AND game logs in parallel (requires player IDs)
  console.log('[NHL Props Context] Fetching BDL player season stats and game logs...');
  const [playerSeasonStats, playerGameLogs] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap)
  ]);
  
  // Log stats coverage (use available candidates - excludes Doubtful/Day-To-Day)
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = availableCandidates.length;
  console.log(`[NHL Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} players`);
  console.log(`[NHL Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  // Process BDL goalie data - prioritize BDL (concrete stats) but include Grounding for context
  const goalieInfo = processGoalieData(bdlGoalieData, advancedStats, homeTeam, awayTeam);
  if (goalieInfo.home || goalieInfo.away) {
    console.log(`[NHL Props Context] Goalie info: Home=${goalieInfo.home?.name || 'Unknown'} (${goalieInfo.home?.save_pct || 'N/A'} SV%), Away=${goalieInfo.away?.name || 'Unknown'} (${goalieInfo.away?.save_pct || 'N/A'} SV%)`);
  }

  // B2B (back-to-back) detection - check if either team played yesterday
  const b2bInfo = await detectBackToBack(teamIds, dateStr, bdlGoalieData);
  if (b2bInfo.home || b2bInfo.away) {
    console.log(`[NHL Props Context] B2B detected: Home=${b2bInfo.home ? 'YES' : 'no'}, Away=${b2bInfo.away ? 'YES' : 'no'}`);
  }

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text with REAL player data and recent form
  // Build player stats text using available candidates only (excludes Doubtful/Day-To-Day)
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    advancedStats,
    availableCandidates,
    playerSeasonStats,
    playerIdMap,
    richContext,
    playerGameLogs // Pass game logs for recent form
  );

  // Build token data with enhanced player info and game logs
  const tokenData = buildPropsTokenSlices(
    playerStats,
    availableCandidates,
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
    topCandidates: availableCandidates.map(p => p.player).slice(0, 6),
    // ENHANCED: Goalie info from BDL + Grounding
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
  
  // Check data availability and flag any gaps for Gary
  const statsCoverage = playersWithStats / totalCandidates;
  const logsCoverage = playersWithLogs / totalCandidates;
  const dataGaps = [];
  
  if (statsCoverage < 0.7) {
    dataGaps.push(`⚠️ LOW STATS COVERAGE: Only ${playersWithStats}/${totalCandidates} players have season stats`);
  }
  if (logsCoverage < 0.7) {
    dataGaps.push(`⚠️ LOW GAME LOGS COVERAGE: Only ${playersWithLogs}/${totalCandidates} players have recent game logs`);
  }
  if (!narrativeContext) {
    dataGaps.push(`⚠️ NO NARRATIVE CONTEXT: Gemini Grounding failed - missing goalie confirmations, news, trends`);
  }
  if (formattedInjuries.length === 0 && teamIds.length > 0) {
    dataGaps.push(`⚠️ NO INJURIES RETURNED: BDL may have failed - injury context may be incomplete`);
  }
  
  if (dataGaps.length > 0) {
    console.warn(`[NHL Props Context] ⚠️ DATA GAPS DETECTED - Gary should proceed with caution:`);
    dataGaps.forEach(gap => console.warn(`   ${gap}`));
  }
  
  console.log(`[NHL Props Context] ✓ Built context:`);
  console.log(`   - ${availableCandidates.length} player candidates (verified on team, excludes Doubtful/Day-To-Day)`);
  console.log(`   - ${playersWithStats} players with season stats (${(statsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${playersWithLogs} players with game logs (${(logsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${formattedInjuries.length} injuries`);
  console.log(`   - Advanced stats: ${advancedSource}`);
  console.log(`   - Rich context: ${richContextFound}`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: availableCandidates, // Only return available players (excludes Doubtful/Day-To-Day)
    playerStats,
    playerSeasonStats,
    playerGameLogs, // Include game logs in return
    narrativeContext, // CRITICAL: Full raw narrative from Gemini
    // NEW: Structured narrative sections for easy access
    narrativeSections: {
      breakingNews: narrativeSections.breakingNews || null,   // Last-minute scratches, trade rumors
      motivation: narrativeSections.motivation || null,       // Revenge games, milestones, contract years
      schedule: narrativeSections.schedule || null,           // B2B, road trips, rest
      playerContext: narrativeSections.playerContext || null, // Line changes, hot/cold streaks
      teamTrends: narrativeSections.teamTrends || null,       // Streaks, rivalries
      bettingSignals: narrativeSections.bettingSignals || null, // Line movement, public % (MINOR ONLY)
      goalies: narrativeSections.goalies || null,             // Confirmed starting goalies
    },
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      advancedStatsSource: advancedSource,
      groundingDataSources: advancedStats?.data_sources || [],
      keyFindings: richContext?.key_findings || advancedStats?.key_analytics_insights || [],
      playerStatsCoverage: `${playersWithStats}/${totalCandidates}`,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      hasNarrativeContext: !!narrativeContext,
      narrativeSectionsFetched: Object.keys(narrativeSections).filter(k => narrativeSections[k]?.length > 10),
      // NEW: Data availability flags for Gary to see
      dataAvailability: {
        statsAvailable: playersWithStats > 0,
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: formattedInjuries.length > 0,
        narrativeAvailable: !!narrativeContext,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildNhlPropsAgenticContext
};
