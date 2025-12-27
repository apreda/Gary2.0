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
 * 
 * NEW FACTORS FOR PROP ANALYSIS:
 * 1. Hit Rate / Consistency Score - "Player has hit this line in X of last Y games"
 * 2. Key Teammate Out Impact - Usage boost when stars are injured
 * 3. Pace/Total Environment - High O/U = more opportunities
 * 4. Home/Away Splits - Player-specific home/road performance
 */
import { ballDontLieService } from '../ballDontLieService.js';
// All context comes from Gemini 3 Flash with Google Search Grounding
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate, safeApiCallArray, safeApiCallObject, fuzzyMatchPlayerName, findBestPlayerMatch, checkDataAvailability } from './sharedUtils.js';
import { fetchComprehensivePropsNarrative } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'basketball_nba';

/**
 * Calculate hit rate for a specific prop line based on game logs
 * Returns the percentage of recent games where player exceeded the line
 * @param {Array} games - Recent game logs
 * @param {string} propType - Type of prop (points, rebounds, assists, etc.)
 * @param {number} line - The prop line to check against
 * @returns {Object} Hit rate data
 */
function calculateHitRate(games, propType, line) {
  if (!games || games.length === 0) return null;
  
  // Map prop types to game log fields
  const propToField = {
    'points': 'pts',
    'player_points': 'pts',
    'rebounds': 'reb',
    'player_rebounds': 'reb',
    'assists': 'ast',
    'player_assists': 'ast',
    'threes': 'fg3m',
    'player_threes': 'fg3m',
    'blocks': 'blk',
    'player_blocks': 'blk',
    'steals': 'stl',
    'player_steals': 'stl',
    'points_rebounds_assists': 'pra',
    'player_points_rebounds_assists': 'pra',
    'points_rebounds': 'pr',
    'player_points_rebounds': 'pr'
  };
  
  const field = propToField[propType] || propType;
  
  let hitsOver = 0;
  let hitsUnder = 0;
  let pushes = 0;
  const values = [];
  
  for (const game of games) {
    let value;
    if (field === 'pra') {
      value = (game.pts || 0) + (game.reb || 0) + (game.ast || 0);
    } else if (field === 'pr') {
      value = (game.pts || 0) + (game.reb || 0);
    } else {
      value = game[field];
    }
    
    if (value === undefined || value === null) continue;
    
    values.push(value);
    if (value > line) hitsOver++;
    else if (value < line) hitsUnder++;
    else pushes++;
  }
  
  const totalGames = values.length;
  if (totalGames === 0) return null;
  
  const avgValue = values.reduce((a, b) => a + b, 0) / totalGames;
  
  return {
    totalGames,
    hitsOver,
    hitsUnder,
    pushes,
    overRate: ((hitsOver / totalGames) * 100).toFixed(0),
    underRate: ((hitsUnder / totalGames) * 100).toFixed(0),
    avgValue: avgValue.toFixed(1),
    values: values.slice(0, 5), // Last 5 values for display
    recommendation: avgValue > line * 1.05 ? 'OVER' : avgValue < line * 0.95 ? 'UNDER' : 'CLOSE'
  };
}

/**
 * Analyze impact of key teammate injuries on player usage
 * @param {string} playerName - Player to analyze
 * @param {string} team - Team name
 * @param {Array} injuries - List of injuries
 * @param {Object} playerSeasonStats - Season stats for context
 * @returns {Object|null} Teammate impact analysis
 */
function analyzeTeammateImpact(playerName, team, injuries, playerSeasonStats) {
  // Key players by team whose absence would boost others' usage
  const keyPlayers = {
    // High usage players - their absence creates opportunity
    'star_scorers': ['LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo', 
      'Luka Doncic', 'Jayson Tatum', 'Shai Gilgeous-Alexander', 'Anthony Edwards',
      'Donovan Mitchell', 'Damian Lillard', 'Devin Booker', 'Trae Young', 'Ja Morant',
      'De\'Aaron Fox', 'Tyrese Haliburton', 'Paolo Banchero', 'Cade Cunningham',
      'Tyler Herro', 'Bam Adebayo', 'Jimmy Butler', 'Jalen Brunson', 'Karl-Anthony Towns']
  };
  
  const allStars = keyPlayers.star_scorers.map(n => n.toLowerCase());
  
  // Find injured stars on the same team
  const teamInjuries = injuries.filter(inj => {
    const injTeam = (inj.team || '').toLowerCase();
    const injPlayer = (inj.player || '').toLowerCase();
    const injStatus = (inj.status || '').toLowerCase();
    
    // Check if on same team and is a key player
    const isTeammate = injTeam.includes(team.toLowerCase()) || team.toLowerCase().includes(injTeam.split(' ').pop());
    const isKeyPlayer = allStars.some(star => injPlayer.includes(star) || star.includes(injPlayer));
    const isOut = ['out', 'doubtful', 'day-to-day'].some(s => injStatus.includes(s));
    
    return isTeammate && isKeyPlayer && isOut && injPlayer !== playerName.toLowerCase();
  });
  
  if (teamInjuries.length === 0) return null;
  
  return {
    injuredStars: teamInjuries.map(i => `${i.player} (${i.status})`),
    usageBoostExpected: true,
    reason: `With ${teamInjuries.map(i => i.player).join(', ')} out, expect increased usage/touches`
  };
}

/**
 * Get pace and total context for the game
 * @param {Object} marketSnapshot - Market data with odds
 * @param {Object} homeTeamStats - Home team season stats
 * @param {Object} awayTeamStats - Away team season stats
 * @returns {Object} Pace/total environment analysis
 */
function getPaceAndTotalContext(marketSnapshot, homeTeamStats, awayTeamStats) {
  const total = parseFloat(marketSnapshot?.total?.line) || null;
  
  // Categorize game total
  let totalCategory = 'average';
  let scoringEnvironment = 'standard';
  
  if (total) {
    if (total >= 235) {
      totalCategory = 'very_high';
      scoringEnvironment = 'shootout expected - good for scoring props';
    } else if (total >= 225) {
      totalCategory = 'high';
      scoringEnvironment = 'above average scoring expected';
    } else if (total <= 210) {
      totalCategory = 'low';
      scoringEnvironment = 'defensive game - consider unders';
    } else if (total <= 218) {
      totalCategory = 'below_average';
      scoringEnvironment = 'slower pace expected';
    }
  }
  
  return {
    total: total,
    totalCategory,
    scoringEnvironment,
    spread: marketSnapshot?.spread?.line || null,
    blowoutRisk: Math.abs(parseFloat(marketSnapshot?.spread?.line) || 0) >= 10,
    blowoutNote: Math.abs(parseFloat(marketSnapshot?.spread?.line) || 0) >= 10 
      ? 'Large spread - possible garbage time or early benching of starters'
      : null
  };
}

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
  // Normalize team names to handle variations (e.g., "NYK" vs "New York Knicks")
  const byTeam = {};
  for (const player of scored) {
    // Use team name, normalizing for grouping
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
    console.log(`[NBA Props] Team "${teamData.name}": ${teamPlayers.length} players selected`);
  }
  
  console.log(`[NBA Props] Total: ${result.length} candidates (${maxPlayersPerTeam} per team x ${teamNames.length} teams)`);
  
  return result.sort((a, b) => b.score - a.score);
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
  
  console.log(`[NBA Props Context] Searching BDL by player name for ${allPlayerNames.length} candidates...`);
  
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
          `NBA Props: Search player "${candidateName}"`
        );
        
        if (!searchResults || searchResults.length === 0) {
          return { name: candidateName, found: false };
        }
        
        // Find match using fuzzy matching to handle name variations (D.J. vs DJ, etc.)
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
  
  console.log(`[NBA Props Context] Validated ${Object.keys(playerIdMap).length}/${allPlayerNames.length} players against ${homeTeamName} + ${awayTeamName}`);
  
  // Log players that aren't on either team (will be filtered out)
  if (invalidPlayers.length > 0) {
    const filtered = invalidPlayers.filter(p => p.reason !== 'not found');
    if (filtered.length > 0) {
      console.log(`[NBA Props Context] ⚠️ FILTERED OUT ${filtered.length} players NOT on ${homeTeamName} or ${awayTeamName}: ${filtered.slice(0, 5).map(p => `${p.name} (${p.reason})`).join(', ')}${filtered.length > 5 ? '...' : ''}`);
    }
  }
  
  return playerIdMap;
}

/**
 * Fetch season stats for all prop candidates
 */
async function fetchPlayerSeasonStats(playerIdMap, season) {
  // Extract just the IDs from the playerIdMap (now stores { id, team })
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  
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
  // Extract just the IDs from the playerIdMap (now stores { id, team })
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  
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
    // NBA uses getGames with date filter - with logging on failure
    const recentGames = await safeApiCallArray(
      () => ballDontLieService.getGames(SPORT_KEY, { dates: [yesterdayStr], team_ids: teamIds }),
      `NBA Props: B2B detection games for ${yesterdayStr}`
    );

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
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: PTS ${logs.averages?.pts || 'N/A'}, REB ${logs.averages?.reb || 'N/A'}, AST ${logs.averages?.ast || 'N/A'}, 3PM ${logs.averages?.fg3m || 'N/A'} ${formIcon}\n`;
          
          // Show recent games for ALL prop types - no bias toward any stat
          statsText += `  Recent: PTS [${formatRecentGames(logs, 'pts')}] | REB [${formatRecentGames(logs, 'reb')}] | AST [${formatRecentGames(logs, 'ast')}]\n`;
          
          // Consistency scores for ALL stat types - Gary decides which matters
          if (logs.consistency) {
            const ptsC = logs.consistency.pts ? (parseFloat(logs.consistency.pts) * 100).toFixed(0) : 'N/A';
            const rebC = logs.consistency.reb ? (parseFloat(logs.consistency.reb) * 100).toFixed(0) : 'N/A';
            const astC = logs.consistency.ast ? (parseFloat(logs.consistency.ast) * 100).toFixed(0) : 'N/A';
            statsText += `  Consistency: PTS ${ptsC}% | REB ${rebC}% | AST ${astC}%\n`;
          }
          
          // Home/Away splits - show multiple stats
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Home: ${logs.splits.home.pts} PTS, ${logs.splits.home.reb || 'N/A'} REB, ${logs.splits.home.ast || 'N/A'} AST (${logs.splits.home.games}g)\n`;
            statsText += `  Away: ${logs.splits.away.pts} PTS, ${logs.splits.away.reb || 'N/A'} REB, ${logs.splits.away.ast || 'N/A'} AST (${logs.splits.away.games}g)\n`;
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
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: PTS ${logs.averages?.pts || 'N/A'}, REB ${logs.averages?.reb || 'N/A'}, AST ${logs.averages?.ast || 'N/A'}, 3PM ${logs.averages?.fg3m || 'N/A'} ${formIcon}\n`;
          
          // Show recent games for ALL prop types - no bias toward any stat
          statsText += `  Recent: PTS [${formatRecentGames(logs, 'pts')}] | REB [${formatRecentGames(logs, 'reb')}] | AST [${formatRecentGames(logs, 'ast')}]\n`;
          
          // Consistency scores for ALL stat types - Gary decides which matters
          if (logs.consistency) {
            const ptsC = logs.consistency.pts ? (parseFloat(logs.consistency.pts) * 100).toFixed(0) : 'N/A';
            const rebC = logs.consistency.reb ? (parseFloat(logs.consistency.reb) * 100).toFixed(0) : 'N/A';
            const astC = logs.consistency.ast ? (parseFloat(logs.consistency.ast) * 100).toFixed(0) : 'N/A';
            statsText += `  Consistency: PTS ${ptsC}% | REB ${rebC}% | AST ${astC}%\n`;
          }
          
          // Home/Away splits - show multiple stats
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Home: ${logs.splits.home.pts} PTS, ${logs.splits.home.reb || 'N/A'} REB, ${logs.splits.home.ast || 'N/A'} AST (${logs.splits.home.games}g)\n`;
            statsText += `  Away: ${logs.splits.away.pts} PTS, ${logs.splits.away.reb || 'N/A'} REB, ${logs.splits.away.ast || 'N/A'} AST (${logs.splits.away.games}g)\n`;
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
 * Build token slices for prop analysis - enhanced with player stats, game logs, and hit rates
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerSeasonStats, playerIdMap, playerGameLogs = {}) {
  // Get pace/total environment context
  const paceContext = getPaceAndTotalContext(marketSnapshot, null, null);
  
  // Enhance prop candidates with their season stats, recent form, AND hit rates
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    const games = logs?.games || [];
    
    // Calculate hit rate for each prop line
    const propsWithHitRates = p.props.map(prop => {
      const hitRate = calculateHitRate(games, prop.type, prop.line);
      return {
        ...prop,
        hitRate: hitRate ? {
          overRate: hitRate.overRate,
          underRate: hitRate.underRate,
          avgValue: hitRate.avgValue,
          lastValues: hitRate.values,
          recommendation: hitRate.recommendation,
          gamesAnalyzed: hitRate.totalGames
        } : null
      };
    });
    
    // Analyze teammate injury impact
    const teammateImpact = analyzeTeammateImpact(p.player, p.team, injuries, playerSeasonStats);
    
    return {
      player: p.player,
      team: p.team,
      props: propsWithHitRates, // Now includes hit rates!
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
      // Recent form data with home/away splits
      recentForm: logs ? {
        gamesAnalyzed: logs.gamesAnalyzed,
        averages: logs.averages,
        consistency: logs.consistency,
        splits: logs.splits, // Home/Away splits
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
      } : null,
      // NEW: Teammate injury impact
      teammateImpact: teammateImpact
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
    // NEW: Game environment context
    game_environment: {
      total: paceContext.total,
      totalCategory: paceContext.totalCategory,
      scoringEnvironment: paceContext.scoringEnvironment,
      spread: paceContext.spread,
      blowoutRisk: paceContext.blowoutRisk,
      blowoutNote: paceContext.blowoutNote
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
  // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
  const season = month >= 10 ? year : year - 1;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NBA Props Context] Building context for ${game.away_team} @ ${game.home_team} (${season} season)`);

  // Resolve teams - with detailed logging if fails
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
        `NBA Props: Resolve home team "${game.home_team}"`
      ),
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team),
        `NBA Props: Resolve away team "${game.away_team}"`
      )
    ]);
  } catch (e) {
    console.warn('[NBA Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates first - limit to top 7 players per team
  const propCandidates = getTopPropCandidates(playerProps, 7);
  
  // Parallel fetch: injuries, player IDs, AND COMPREHENSIVE narrative context via Gemini Grounding
  // IMPORTANT: Narrative context is fetched UPFRONT so Gary knows all factors BEFORE iterations
  console.log('[NBA Props Context] Fetching injuries, player IDs, and COMPREHENSIVE narrative context...');
  const [injuries, playerIdMap, comprehensiveNarrative] = await Promise.all([
    // Injuries from BDL - with logging if fails
    teamIds.length > 0 
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `NBA Props: Fetch injuries for teams ${teamIds.join(', ')}`
        )
      : Promise.resolve([]),
    
    // Resolve player IDs from BDL - also validates players are on one of the two teams
    resolvePlayerIds(propCandidates, teamIds, season, game.home_team, game.away_team),
    
    // COMPREHENSIVE NARRATIVE CONTEXT - Fetches ALL factors UPFRONT:
    // - Breaking news (last-minute scratches, trades, drama)
    // - Motivation (revenge games, milestones, contract years)
    // - Schedule (B2B fatigue, trap games, altitude)
    // - Player-specific (load management, matchup history, quotes)
    // - Team trends (streaks, home/away context)
    // - Betting signals (line movement, public % - MINOR ONLY)
    fetchComprehensivePropsNarrative(game.home_team, game.away_team, 'NBA', dateStr, { useFlash: true }).catch(e => {
      console.warn('[NBA Props Context] Comprehensive narrative failed:', e.message);
      return null;
    })
  ]);
  
  // Extract narrative context - now includes structured sections
  const narrativeContext = comprehensiveNarrative?.raw || null;
  const narrativeSections = comprehensiveNarrative?.sections || {};
  if (narrativeContext) {
    console.log(`[NBA Props Context] ✓ Got COMPREHENSIVE narrative context (${narrativeContext.length} chars)`);
    // Log which sections were found
    const foundSections = Object.entries(narrativeSections)
      .filter(([_, v]) => v && v.length > 10)
      .map(([k, _]) => k);
    if (foundSections.length > 0) {
      console.log(`[NBA Props Context] ✓ Parsed sections: ${foundSections.join(', ')}`);
    }
  }
  
  // CRITICAL: Filter prop candidates to only include players verified on either team
  // This prevents players like "Anthony Davis" from appearing in DAL @ NOP props
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
    console.log(`[NBA Props Context] Validated ${validatedCandidates.length}/${propCandidates.length} players (filtered out players not on ${game.away_team} or ${game.home_team})`);
  }

  // CRITICAL: Filter out players who are Doubtful or Day-To-Day to avoid void bets
  // If a player doesn't play, the bet is voided and we can't replace the pick in time
  const riskyStatuses = ['doubtful', 'day-to-day', 'day to day', 'questionable'];
  const injuredPlayerNames = injuries
    .filter(inj => riskyStatuses.some(status => (inj.status || '').toLowerCase().includes(status)))
    .map(inj => {
      // Handle different name formats from BDL
      const firstName = inj.player?.first_name || inj.first_name || '';
      const lastName = inj.player?.last_name || inj.last_name || '';
      return `${firstName} ${lastName}`.trim().toLowerCase();
    })
    .filter(name => name.length > 2);

  const availableCandidates = validatedCandidates.filter(c => {
    const playerNameLower = c.player.toLowerCase();
    const isRisky = injuredPlayerNames.some(injName => 
      playerNameLower.includes(injName) || injName.includes(playerNameLower)
    );
    if (isRisky) {
      console.log(`[NBA Props Context] ⚠️ EXCLUDED ${c.player} - Doubtful/Day-To-Day (risk of void bet)`);
    }
    return !isRisky;
  });

  if (availableCandidates.length < validatedCandidates.length) {
    const excluded = validatedCandidates.length - availableCandidates.length;
    console.log(`[NBA Props Context] Filtered out ${excluded} Doubtful/Day-To-Day player(s) to avoid void bets`);
  }

  // NOW fetch player season stats AND game logs in parallel (requires player IDs)
  console.log('[NBA Props Context] Fetching BDL player season stats and game logs...');
  const [playerSeasonStats, playerGameLogs] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap)
  ]);
  
  // Log stats coverage (use available candidates - excludes Doubtful/Day-To-Day)
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = availableCandidates.length;
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
  // Use availableCandidates which excludes Doubtful/Day-To-Day players
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    availableCandidates,
    playerSeasonStats,
    playerIdMap,
    formattedInjuries,
    playerGameLogs // Pass game logs for recent form
  );

  // Build token data with enhanced player info and game logs
  const tokenData = buildPropsTokenSlices(
    playerStats,
    availableCandidates,
    formattedInjuries,
    marketSnapshot,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs // Pass game logs
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
    topCandidates: availableCandidates.map(p => p.player).slice(0, 6),
    playerStatsAvailable: playersWithStats > 0,
    // B2B detection - important for fatigue impact on props
    backToBack: {
      home: b2bInfo.home,
      away: b2bInfo.away
    }
  };

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
    dataGaps.push(`⚠️ NO NARRATIVE CONTEXT: Gemini Grounding failed - missing injury updates, news, trends`);
  }
  if (formattedInjuries.length === 0 && teamIds.length > 0) {
    dataGaps.push(`⚠️ NO INJURIES RETURNED: BDL may have failed - injury context may be incomplete`);
  }
  
  if (dataGaps.length > 0) {
    console.warn(`[NBA Props Context] ⚠️ DATA GAPS DETECTED - Gary should proceed with caution:`);
    dataGaps.forEach(gap => console.warn(`   ${gap}`));
  }
  
  console.log(`[NBA Props Context] ✓ Built context:`);
  console.log(`   - ${availableCandidates.length} player candidates (verified on team, excludes Doubtful/Day-To-Day)`);
  console.log(`   - ${playersWithStats} players with season stats (${(statsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${playersWithLogs} players with game logs (${(logsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${formattedInjuries.length} injuries`);
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
      breakingNews: narrativeSections.breakingNews || null,   // Last-minute scratches, trade rumors, drama
      motivation: narrativeSections.motivation || null,       // Revenge games, milestones, contract years
      schedule: narrativeSections.schedule || null,           // B2B, trap games, travel, altitude
      playerContext: narrativeSections.playerContext || null, // Load management, matchup history, quotes
      teamTrends: narrativeSections.teamTrends || null,       // Streaks, home/road splits, rivalries
      bettingSignals: narrativeSections.bettingSignals || null, // Line movement, public % (MINOR ONLY)
      injuries: narrativeSections.injuries || null,           // Parsed injury context
    },
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
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
  buildNbaPropsAgenticContext
};
