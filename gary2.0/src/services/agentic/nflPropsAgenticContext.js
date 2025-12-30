/**
 * NFL Props Agentic Context Builder - ENHANCED
 * Builds comprehensive context for NFL player prop analysis
 * 
 * NOW INCLUDES (matching NBA rigor):
 * - Player game logs (last 5 games)
 * - Recent form trends (hot/cold)
 * - Consistency scores
 * - Home/Away splits
 * - Opponent defensive matchup data (via Gemini Grounding)
 * - Short week detection (TNF)
 * - Weather impact
 */
import { ballDontLieService } from '../ballDontLieService.js';
// All context comes from Gemini 3 Flash with Google Search Grounding
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate, safeApiCallArray, safeApiCallObject, findBestPlayerMatch, checkDataAvailability } from './sharedUtils.js';
import { fetchComprehensivePropsNarrative } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'americanfootball_nfl';

/**
 * Calculate hit rate for a specific prop line based on game logs
 * Returns the percentage of recent games where player exceeded the line
 * @param {Array} games - Recent game logs (from BDL)
 * @param {string} propType - Type of prop (pass_yds, rush_yds, reception_yds, receptions, etc.)
 * @param {number} line - The prop line to check against
 * @returns {Object} Hit rate data
 */
function calculateHitRate(games, propType, line) {
  if (!games || games.length === 0) return null;
  
  // Map prop types to game log fields
  const propToField = {
    'pass_yds': 'pass_yds',
    'player_pass_yds': 'pass_yds',
    'passing_yards': 'pass_yds',
    'rush_yds': 'rush_yds',
    'player_rush_yds': 'rush_yds',
    'rushing_yards': 'rush_yds',
    'reception_yds': 'rec_yds',
    'player_reception_yds': 'rec_yds',
    'receiving_yards': 'rec_yds',
    'receptions': 'receptions',
    'player_receptions': 'receptions',
    'pass_tds': 'pass_tds',
    'player_pass_tds': 'pass_tds',
    'rush_tds': 'rush_tds',
    'player_rush_tds': 'rush_tds',
    'reception_tds': 'rec_tds',
    'player_reception_tds': 'rec_tds',
    'pass_attempts': 'pass_att',
    'player_pass_attempts': 'pass_att',
    'pass_completions': 'pass_comp',
    'player_pass_completions': 'pass_comp',
    'rush_attempts': 'rush_att',
    'player_rush_attempts': 'rush_att',
    'rush_reception_yds': 'rush_rec_yds' // Combined
  };
  
  const field = propToField[propType?.toLowerCase()] || propType;
  
  let hitsOver = 0;
  let hitsUnder = 0;
  let pushes = 0;
  const values = [];
  
  for (const game of games) {
    let value;
    
    // Handle combined props
    if (field === 'rush_rec_yds') {
      value = (game.rush_yds || 0) + (game.rec_yds || 0);
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
  const overRate = (hitsOver / totalGames) * 100;
  const underRate = (hitsUnder / totalGames) * 100;
  
  // Calculate edge vs line
  const edge = ((avgValue - line) / line) * 100;
  
  // Recommendation based on hit rate AND edge
  let recommendation = 'CLOSE';
  if (overRate >= 70 && edge > 5) recommendation = 'STRONG_OVER';
  else if (overRate >= 60 && edge > 0) recommendation = 'OVER';
  else if (underRate >= 70 && edge < -5) recommendation = 'STRONG_UNDER';
  else if (underRate >= 60 && edge < 0) recommendation = 'UNDER';
  
  return {
    totalGames,
    hitsOver,
    hitsUnder,
    pushes,
    overRate: overRate.toFixed(0),
    underRate: underRate.toFixed(0),
    avgValue: avgValue.toFixed(1),
    edge: edge.toFixed(1),
    values: values.slice(0, 5), // Last 5 values for display
    recommendation,
    display: `${hitsOver}/${totalGames} over (${overRate.toFixed(0)}%), avg ${avgValue.toFixed(1)} vs line ${line}`
  };
}

/**
 * Get hit rates for all props for a specific player
 */
function getPlayerHitRates(gameLogs, props) {
  if (!gameLogs?.games || gameLogs.games.length === 0) return {};
  
  const hitRates = {};
  for (const prop of props) {
    const hitRate = calculateHitRate(gameLogs.games, prop.type, prop.line);
    if (hitRate) {
      hitRates[`${prop.type}_${prop.line}`] = hitRate;
    }
  }
  return hitRates;
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
    console.log(`[NFL Props] Team "${teamData.name}": ${teamPlayers.length} players selected`);
  }
  
  console.log(`[NFL Props] Total: ${result.length} candidates (${maxPlayersPerTeam} per team x ${teamNames.length} teams)`);
  
  return result.sort((a, b) => b.score - a.score);
}

/**
 * Format injuries relevant to NFL props from BDL API
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
 * Extract structured injuries from Gemini Grounding context
 * Parses OUT, IR, Questionable, Doubtful players into a structured format
 * This is the PRIMARY source for injury data (more reliable than BDL API)
 */
function extractInjuriesFromGrounding(groundedContext, homeTeam, awayTeam) {
  if (!groundedContext) return [];
  
  const injuries = [];
  const lines = groundedContext.split('\n');
  
  let currentTeam = null;
  
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    // Detect team context
    if (lineLower.includes(homeTeam.toLowerCase())) {
      currentTeam = homeTeam;
    } else if (lineLower.includes(awayTeam.toLowerCase())) {
      currentTeam = awayTeam;
    }
    
    // Look for injury patterns with games missed info
    const injuryPatterns = [
      // Pattern: **Player Name (Position)** – STATUS – injury – MISSED X GAMES
      /\*\*([^*]+)\s*\(([^)]+)\)\*\*\s*[–-]\s*(OUT|IR|INJURED RESERVE|Questionable|Doubtful)\s*[–-]\s*([^–-]+?)(?:\s*[–-]\s*\*\*MISSED\s*(\d+)\s*GAMES?\*\*)?/i,
      // Pattern: Player Name (Position) – STATUS
      /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+(?:Jr\.|Sr\.|III|II|IV))?)\s*\(([^)]+)\)\s*[–-]\s*(OUT|IR|Questionable|Doubtful)/i,
      // Pattern: **Player Name** – STATUS
      /\*\s*\*\*([^*]+)\*\*\s*[–-]\s*(OUT|IR|Questionable|Doubtful)/i
    ];
    
    for (const pattern of injuryPatterns) {
      const match = line.match(pattern);
      if (match) {
        const playerName = match[1].trim().replace(/\*+/g, '');
        const position = match[2] || '';
        const status = (match[3] || match[2]).toUpperCase();
        const description = match[4] || '';
        const gamesMissed = match[5] ? parseInt(match[5]) : null;
        
        // Skip invalid names
        if (playerName.length < 3 || playerName.includes('MISSED') || playerName.includes('Week')) {
          continue;
        }
        
        injuries.push({
          player: playerName,
          team: currentTeam || 'Unknown',
          position: position.toUpperCase(),
          status: status.includes('INJURED RESERVE') ? 'IR' : status,
          description: description.trim().substring(0, 100),
          gamesMissed: gamesMissed
        });
        break;
      }
    }
  }
  
  // Deduplicate by player name
  const seen = new Set();
  const uniqueInjuries = injuries.filter(inj => {
    const key = inj.player.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return uniqueInjuries;
}

/**
 * Extract weather information from Gemini Grounding context
 */
function extractWeatherFromGrounding(groundedContext) {
  if (!groundedContext) return null;
  
  // Look for weather section in grounded context
  const weatherPatterns = [
    // Temperature patterns
    /(\d{1,2})°?\s*F/i,
    /temperature[:\s]+(\d{1,2})/i,
    /forecast[:\s]+(\d{1,2})/i
  ];
  
  const windPatterns = [
    /(\d{1,2})\s*mph\s*wind/i,
    /wind[:\s]+(\d{1,2})\s*mph/i,
    /winds?\s+(\d{1,2})/i
  ];
  
  const conditionPatterns = [
    /(sunny|cloudy|overcast|rain|snow|clear|partly cloudy|dome|indoor|retractable roof)/i
  ];
  
  let temp = null;
  let wind = null;
  let conditions = null;
  let isDome = false;
  
  // Check for dome/indoor
  if (groundedContext.toLowerCase().includes('dome') || 
      groundedContext.toLowerCase().includes('indoor') ||
      groundedContext.toLowerCase().includes('retractable roof closed')) {
    isDome = true;
    conditions = 'Indoor/Dome';
  }
  
  for (const pattern of weatherPatterns) {
    const match = groundedContext.match(pattern);
    if (match) {
      temp = parseInt(match[1]);
      break;
    }
  }
  
  for (const pattern of windPatterns) {
    const match = groundedContext.match(pattern);
    if (match) {
      wind = parseInt(match[1]);
      break;
    }
  }
  
  if (!conditions) {
    for (const pattern of conditionPatterns) {
      const match = groundedContext.match(pattern);
      if (match) {
        conditions = match[1];
        break;
      }
    }
  }
  
  if (temp || conditions) {
    return {
      temperature: temp,
      wind_speed: wind,
      conditions: conditions || 'Unknown',
      is_dome: isDome
    };
  }
  
  return null;
}

/**
 * Resolve player IDs and Teams from BDL for prop candidates by searching by name
 * Returns { playerIdMap, playerTeamMap } for resolving both IDs and teams
 * 
 * IMPORTANT: Uses player search (not team roster) because BDL roster endpoint returns stale data
 * NOTE: BDL /players?team_ids[]=X returns outdated rosters, but /players?search=name returns current teams
 */
async function resolvePlayerIdsAndTeams(propCandidates, teamIds, homeTeam, awayTeam, season) {
  const playerIdMap = {}; // name -> id
  const playerTeamMap = {}; // name -> team full name (from BDL, overrides Odds API)
  
  // Get all player names - we'll search each one individually
  const allPlayerNames = propCandidates.map(c => c.player);
  
  if (allPlayerNames.length === 0) {
    return { playerIdMap, playerTeamMap };
  }
  
  // Normalize team names for matching
  const normalizeTeamName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeamName(homeTeam);
  const awayNorm = normalizeTeamName(awayTeam);
  const validTeamIds = new Set(teamIds);
  
  console.log(`[NFL Props Context] Searching BDL by player name for ${allPlayerNames.length} candidates...`);
  
  // Search each player by name (batch in parallel, max 5 concurrent)
  const batchSize = 5;
  
  for (let i = 0; i < allPlayerNames.length; i += batchSize) {
    const batch = allPlayerNames.slice(i, i + batchSize);
    
    const searchPromises = batch.map(async (candidateName) => {
      try {
        // Extract last name for search (more reliable)
        const nameParts = candidateName.trim().split(' ');
        const lastName = nameParts[nameParts.length - 1];
        
        // Search by last name - with logging on failure
        const searchResults = await safeApiCallArray(
          () => ballDontLieService.getPlayersGeneric(SPORT_KEY, { search: lastName, per_page: 15 }),
          `NFL Props: Search player "${candidateName}"`
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
        const playerTeamName = match.team?.full_name || match.team?.name || '';
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
        const nameLower = result.name.toLowerCase();
        if (result.id) playerIdMap[nameLower] = result.id;
        if (result.team) playerTeamMap[nameLower] = result.team;
      }
    }
  }
  
  console.log(`[NFL Props Context] Resolved ${Object.keys(playerIdMap).length}/${propCandidates.length} player IDs`);
  console.log(`[NFL Props Context] Resolved ${Object.keys(playerTeamMap).length}/${propCandidates.length} player teams from BDL`);
  
  // Update ALL candidates with BDL-resolved teams (overriding any Odds API data)
  for (const candidate of propCandidates) {
    const key = candidate.player.toLowerCase();
    if (playerTeamMap[key]) {
      // BDL team ALWAYS overrides Odds API team
      candidate.team = playerTeamMap[key];
    }
  }
  
  return { playerIdMap, playerTeamMap };
}

/**
 * Fetch team defensive stats from BDL for matchup analysis
 * Returns enhanced defensive matchups with real BDL data
 * 
 * @param {number} homeTeamId - BDL ID for home team
 * @param {number} awayTeamId - BDL ID for away team
 * @param {string} homeTeamName - Home team name for display
 * @param {string} awayTeamName - Away team name for display
 * @param {number} season - Season year (2025)
 * @returns {Object} Enhanced defensive matchups with BDL data
 */
async function fetchDefensiveMatchups(homeTeamId, awayTeamId, homeTeamName, awayTeamName, season) {
  // Default structure for when BDL fails
  const defaultMatchups = {
    _isDefault: true,
    home_defense_vs_away: {},
    away_defense_vs_home: {}
  };
  
  if (!homeTeamId || !awayTeamId || !season) {
    console.warn('[NFL Props Context] Missing team IDs or season for defensive matchups');
    return defaultMatchups;
  }
  
  try {
    console.log(`[NFL Props Context] Fetching BDL defensive stats for teams ${homeTeamId}, ${awayTeamId} (${season} season)...`);
    
    const teamStatsResults = await safeApiCallArray(
      () => ballDontLieService.getTeamSeasonStatsGeneric(SPORT_KEY, { 
        team_ids: [homeTeamId, awayTeamId], 
        season 
      }),
      `NFL Props: Fetch team defensive stats for ${homeTeamName} vs ${awayTeamName}`
    );
    
    if (!teamStatsResults || teamStatsResults.length === 0) {
      console.warn('[NFL Props Context] No team stats returned from BDL');
      return defaultMatchups;
    }
    
    // Parse stats for each team
    const homeStats = teamStatsResults.find(t => t.team?.id === homeTeamId);
    const awayStats = teamStatsResults.find(t => t.team?.id === awayTeamId);
    
    const buildDefenseProfile = (stats, opponentStats) => {
      if (!stats) return {};
      
      // Defensive stats are in the "opp_" prefixed fields
      return {
        // Pass defense - yards allowed per game
        pass_yards_allowed_per_game: stats.opp_passing_yards_per_game?.toFixed(1) || '?',
        pass_completion_pct_allowed: stats.opp_passing_completion_pct?.toFixed(1) || '?',
        pass_tds_allowed: stats.opp_passing_touchdowns || 0,
        
        // Rush defense - yards allowed per game
        rush_yards_allowed_per_game: stats.opp_rushing_yards_per_game?.toFixed(1) || '?',
        rush_yards_per_attempt_allowed: stats.opp_rushing_yards_per_rush_attempt?.toFixed(2) || '?',
        rush_tds_allowed: stats.opp_rushing_touchdowns || 0,
        
        // Total defense
        total_yards_allowed_per_game: stats.opp_total_offensive_yards_per_game?.toFixed(1) || '?',
        points_allowed_per_game: stats.opp_total_points_per_game?.toFixed(1) || '?',
        
        // Pressure and turnovers
        sacks: stats.opp_passing_sacks || 0,
        interceptions: stats.defensive_interceptions || 0,
        fumbles_recovered: stats.opp_fumbles_lost || 0,
        takeaways: stats.misc_total_takeaways || 0,
        
        // 3rd down defense
        third_down_stop_pct: (100 - (stats.opp_misc_third_down_conv_pct || 0)).toFixed(1) || '?',
        
        // Games played for context
        games: stats.games_played || 0,
        
        // Opponent offensive context (useful for matchup analysis)
        opponent_offense: opponentStats ? {
          passing_yards_per_game: opponentStats.passing_yards_per_game?.toFixed(1),
          rushing_yards_per_game: opponentStats.rushing_yards_per_game?.toFixed(1),
          points_per_game: opponentStats.total_points_per_game?.toFixed(1),
          sacks_allowed: opponentStats.passing_sacks || 0
        } : null
      };
    };
    
    const defensiveMatchups = {
      _isDefault: false,
      _source: 'BDL',
      _season: season,
      
      // Home team defense vs Away team offense
      home_defense_vs_away: {
        team: homeTeamName,
        ...buildDefenseProfile(homeStats, awayStats)
      },
      
      // Away team defense vs Home team offense
      away_defense_vs_home: {
        team: awayTeamName,
        ...buildDefenseProfile(awayStats, homeStats)
      },
      
      // Generate matchup insights based on stats comparison
      matchup_insights: []
    };
    
    // Generate insights from the data
    if (homeStats && awayStats) {
      const insights = [];
      
      // Pass defense mismatch
      const homePassDef = homeStats.opp_passing_yards_per_game || 0;
      const awayPassOff = awayStats.passing_yards_per_game || 0;
      if (awayPassOff > homePassDef + 30) {
        insights.push(`${awayTeamName} passing attack (${awayPassOff.toFixed(0)} yds/g) faces favorable matchup vs ${homeTeamName} pass D (allows ${homePassDef.toFixed(0)} yds/g)`);
      }
      
      const awayPassDef = awayStats.opp_passing_yards_per_game || 0;
      const homePassOff = homeStats.passing_yards_per_game || 0;
      if (homePassOff > awayPassDef + 30) {
        insights.push(`${homeTeamName} passing attack (${homePassOff.toFixed(0)} yds/g) faces favorable matchup vs ${awayTeamName} pass D (allows ${awayPassDef.toFixed(0)} yds/g)`);
      }
      
      // Rush defense mismatch
      const homeRushDef = homeStats.opp_rushing_yards_per_game || 0;
      const awayRushOff = awayStats.rushing_yards_per_game || 0;
      if (awayRushOff > homeRushDef + 20) {
        insights.push(`${awayTeamName} rushing attack (${awayRushOff.toFixed(0)} yds/g) vs ${homeTeamName} rush D (allows ${homeRushDef.toFixed(0)} yds/g) - potential smash spot`);
      }
      
      const awayRushDef = awayStats.opp_rushing_yards_per_game || 0;
      const homeRushOff = homeStats.rushing_yards_per_game || 0;
      if (homeRushOff > awayRushDef + 20) {
        insights.push(`${homeTeamName} rushing attack (${homeRushOff.toFixed(0)} yds/g) vs ${awayTeamName} rush D (allows ${awayRushDef.toFixed(0)} yds/g) - potential smash spot`);
      }
      
      // Sack pressure
      if (homeStats.opp_passing_sacks > 35) {
        insights.push(`${homeTeamName} defense generates heavy pressure (${homeStats.opp_passing_sacks} sacks) - ${awayTeamName} QB could face disruption`);
      }
      if (awayStats.opp_passing_sacks > 35) {
        insights.push(`${awayTeamName} defense generates heavy pressure (${awayStats.opp_passing_sacks} sacks) - ${homeTeamName} QB could face disruption`);
      }
      
      // Turnover differential
      if (homeStats.misc_total_takeaways > 20) {
        insights.push(`${homeTeamName} has ${homeStats.misc_total_takeaways} takeaways - ball security key for ${awayTeamName}`);
      }
      if (awayStats.misc_total_takeaways > 20) {
        insights.push(`${awayTeamName} has ${awayStats.misc_total_takeaways} takeaways - ball security key for ${homeTeamName}`);
      }
      
      defensiveMatchups.matchup_insights = insights.slice(0, 5); // Cap at 5 insights
    }
    
    console.log(`[NFL Props Context] ✓ Defensive matchups loaded with ${defensiveMatchups.matchup_insights.length} insights`);
    return defensiveMatchups;
    
  } catch (e) {
    console.warn('[NFL Props Context] Failed to fetch defensive matchups:', e.message);
    return defaultMatchups;
  }
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
 * Detect game day type and special circumstances
 * Recognizes Christmas Day, Thanksgiving, and other special NFL game days
 */
function detectGameDayType(gameDate) {
  const gameDateObj = new Date(gameDate);
  const dayOfWeek = gameDateObj.getDay(); // 0=Sun, 4=Thu
  const month = gameDateObj.getMonth(); // 0=Jan, 11=Dec
  const dayOfMonth = gameDateObj.getDate();
  
  // Christmas Day games (Dec 25)
  if (month === 11 && dayOfMonth === 25) {
    return {
      isShortWeek: false,
      type: 'Christmas Day',
      restDays: 7,
      impact: 'Christmas Day showcase games - high visibility, primetime atmosphere',
      isSpecialEvent: true
    };
  }
  
  // Thanksgiving games (4th Thursday of November)
  if (month === 10 && dayOfWeek === 4 && dayOfMonth >= 22 && dayOfMonth <= 28) {
    return {
      isShortWeek: true,
      type: 'Thanksgiving',
      restDays: 3,
      impact: 'Thanksgiving showcase - short rest, national audience',
      isSpecialEvent: true
    };
  }
  
  // Thursday Night Football (not Thanksgiving)
  if (dayOfWeek === 4) {
    return {
      isShortWeek: true,
      type: 'TNF',
      restDays: 3,
      impact: 'Both teams on short rest - simpler offensive schemes, more rushing expected'
    };
  }
  
  // Saturday games (late season/playoffs)
  if (dayOfWeek === 6) {
    return {
      isShortWeek: false,
      type: 'Saturday',
      restDays: 6,
      impact: 'Late-season Saturday game - playoff implications likely'
    };
  }
  
  // Monday Night Football
  if (dayOfWeek === 1) {
    return {
      isShortWeek: false,
      type: 'MNF',
      restDays: 8,
      impact: 'Extra day of rest - full game plans'
    };
  }
  
  // Sunday games (default)
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
  
  // Helper to format recent games with FULL game-by-game breakdown
  const formatRecentGames = (logs, statKey) => {
    if (!logs?.games || logs.games.length === 0) return '';
    const last5 = logs.games.slice(0, 5).map(g => g[statKey]);
    return `L5: [${last5.join(', ')}]`;
  };
  
  // Helper to format VERIFIED game-by-game stats with TREND ANALYSIS (not averages)
  const formatVerifiedGameLog = (logs, statKey, statLabel) => {
    if (!logs?.games || logs.games.length === 0) return '';
    
    const games = logs.games.slice(0, 5);
    const gameLines = games.map((g, i) => {
      const dateStr = g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `Game ${i+1}`;
      const homeAway = g.isHome ? 'vs' : '@';
      const opponent = g.opponent || '???';
      return `${dateStr} ${homeAway} ${opponent}: ${g[statKey]} ${statLabel}`;
    });
    
    const values = games.map(g => g[statKey]);
    
    // Calculate TREND instead of just average
    // Compare most recent 2 games vs older 3 games
    const recent2 = values.slice(0, 2);
    const older3 = values.slice(2, 5);
    const recent2Avg = recent2.length > 0 ? recent2.reduce((a, b) => a + b, 0) / recent2.length : 0;
    const older3Avg = older3.length > 0 ? older3.reduce((a, b) => a + b, 0) / older3.length : recent2Avg;
    
    // Determine trend direction
    let trendDirection = 'STABLE';
    let trendIcon = '➡️';
    let trendPct = 0;
    if (older3Avg > 0) {
      trendPct = ((recent2Avg - older3Avg) / older3Avg * 100).toFixed(0);
      if (recent2Avg > older3Avg * 1.15) {
        trendDirection = 'TRENDING UP';
        trendIcon = '⬆️';
      } else if (recent2Avg < older3Avg * 0.85) {
        trendDirection = 'TRENDING DOWN';
        trendIcon = '⬇️';
      }
    }
    
    // Also check game-over-game direction (is each game higher than previous?)
    let consecutiveUp = 0;
    let consecutiveDown = 0;
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i] > values[i + 1]) consecutiveUp++;
      else if (values[i] < values[i + 1]) consecutiveDown++;
    }
    
    // Count how many times they exceeded common lines
    const lines = [50, 60, 70, 75, 80, 90, 100, 150, 200, 250];
    const lineHits = lines.reduce((acc, line) => {
      const hits = values.filter(v => v >= line).length;
      if (hits > 0) acc[line] = `${hits}/${values.length}`;
      return acc;
    }, {});
    
    return {
      gameByGame: gameLines.join(' | '),
      values: values,
      lineHits: lineHits,
      // TREND DATA (primary focus)
      trendDirection,
      trendIcon,
      trendPct: parseInt(trendPct),
      recent2Avg: recent2Avg.toFixed(0),
      older3Avg: older3Avg.toFixed(0),
      mostRecent: values[0],
      consecutiveUp,
      consecutiveDown
    };
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
  
  // Add defensive context headers - now with REAL BDL stats
  if (defensiveMatchups && !defensiveMatchups._isDefault) {
    statsText += `## Defensive Matchups (${defensiveMatchups._season || '2025'} Season)\n\n`;
    
    const homeD = defensiveMatchups.home_defense_vs_away;
    const awayD = defensiveMatchups.away_defense_vs_home;
    
    // Home Defense (what away offense faces)
    statsText += `### ${homeTeam} Defense (vs ${awayTeam} offense):\n`;
    statsText += `- Pass defense: ${homeD?.pass_yards_allowed_per_game || '?'} yds/g allowed (${homeD?.pass_completion_pct_allowed || '?'}% comp), ${homeD?.pass_tds_allowed || '?'} TDs\n`;
    statsText += `- Rush defense: ${homeD?.rush_yards_allowed_per_game || '?'} yds/g allowed (${homeD?.rush_yards_per_attempt_allowed || '?'} ypc), ${homeD?.rush_tds_allowed || '?'} TDs\n`;
    statsText += `- Total: ${homeD?.total_yards_allowed_per_game || '?'} yds/g, ${homeD?.points_allowed_per_game || '?'} pts/g\n`;
    statsText += `- Pressure: ${homeD?.sacks || '?'} sacks, ${homeD?.interceptions || '?'} INTs, ${homeD?.takeaways || '?'} takeaways\n`;
    statsText += `- 3rd down stop rate: ${homeD?.third_down_stop_pct || '?'}%\n`;
    if (homeD?.opponent_offense) {
      statsText += `- ${awayTeam} offense averages: ${homeD.opponent_offense.passing_yards_per_game} pass yds/g, ${homeD.opponent_offense.rushing_yards_per_game} rush yds/g, ${homeD.opponent_offense.points_per_game} pts/g\n`;
    }
    if (homeD?.key_defensive_injuries?.length > 0) {
      statsText += `- Key defensive injuries: ${homeD.key_defensive_injuries.join(', ')}\n`;
    }
    
    // Away Defense (what home offense faces)
    statsText += `\n### ${awayTeam} Defense (vs ${homeTeam} offense):\n`;
    statsText += `- Pass defense: ${awayD?.pass_yards_allowed_per_game || '?'} yds/g allowed (${awayD?.pass_completion_pct_allowed || '?'}% comp), ${awayD?.pass_tds_allowed || '?'} TDs\n`;
    statsText += `- Rush defense: ${awayD?.rush_yards_allowed_per_game || '?'} yds/g allowed (${awayD?.rush_yards_per_attempt_allowed || '?'} ypc), ${awayD?.rush_tds_allowed || '?'} TDs\n`;
    statsText += `- Total: ${awayD?.total_yards_allowed_per_game || '?'} yds/g, ${awayD?.points_allowed_per_game || '?'} pts/g\n`;
    statsText += `- Pressure: ${awayD?.sacks || '?'} sacks, ${awayD?.interceptions || '?'} INTs, ${awayD?.takeaways || '?'} takeaways\n`;
    statsText += `- 3rd down stop rate: ${awayD?.third_down_stop_pct || '?'}%\n`;
    if (awayD?.opponent_offense) {
      statsText += `- ${homeTeam} offense averages: ${awayD.opponent_offense.passing_yards_per_game} pass yds/g, ${awayD.opponent_offense.rushing_yards_per_game} rush yds/g, ${awayD.opponent_offense.points_per_game} pts/g\n`;
    }
    if (awayD?.key_defensive_injuries?.length > 0) {
      statsText += `- Key defensive injuries: ${awayD.key_defensive_injuries.join(', ')}\n`;
    }
    
    // Auto-generated matchup insights
    if (defensiveMatchups.matchup_insights?.length > 0) {
      statsText += `\nMatchup insights:\n`;
      defensiveMatchups.matchup_insights.forEach(insight => {
        statsText += `- ${insight}\n`;
      });
    }
    
    statsText += '\n';
  }
  
  // Away team section
  statsText += `## ${awayTeam} Players\n\n`;
  
  // Helper to find injury context for a player
  const getPlayerInjuryContext = (playerName) => {
    const playerLower = playerName.toLowerCase();
    const injury = injuries.find(i => i.player?.toLowerCase().includes(playerLower) || playerLower.includes(i.player?.toLowerCase()));
    if (injury) {
      return {
        status: injury.status,
        description: injury.description || injury.injury || '',
        hasContext: true
      };
    }
    return { hasContext: false };
  };
  
  if (awayPlayers.length > 0) {
    statsText += '**Player Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryContext = getPlayerInjuryContext(candidate.player);
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      statsText += `\n- **${candidate.player}**${injuryFlag}:\n`;
      
      // Add injury context if available (explains WHY stats might be affected)
      if (injuryContext.hasContext) {
        statsText += `  ⚠️ INJURY CONTEXT: ${injuryContext.status}${injuryContext.description ? ` - ${injuryContext.description}` : ''}\n`;
        statsText += `  (Stats below may be affected by this injury - consider if player is trending back to form or still limited)\n`;
      }
      
      if (logs && logs.gamesAnalyzed > 0) {
        const avg = logs.averages;
        
        // 🚨 VERIFIED BDL API STATS with TREND FOCUS
        statsText += `  📊 VERIFIED STATS (BDL API) - TREND ANALYSIS:\n`;
        
        // Position-specific game-by-game breakdowns with TREND EMPHASIS
        if (parseFloat(avg.rec_yds) > 0 || parseFloat(avg.receptions) > 0) {
          const recLog = formatVerifiedGameLog(logs, 'rec_yds', 'yds');
          if (recLog.gameByGame) {
            statsText += `  ✓ RECEIVING - Last 5 Games:\n`;
            statsText += `    ${recLog.gameByGame}\n`;
            statsText += `    ${recLog.trendIcon} ${recLog.trendDirection} (recent 2 avg: ${recLog.recent2Avg} vs older 3 avg: ${recLog.older3Avg}, ${recLog.trendPct >= 0 ? '+' : ''}${recLog.trendPct}%)\n`;
            statsText += `    Most recent: ${recLog.mostRecent} yds | Hit 75+: ${recLog.lineHits[75] || '0/5'}\n`;
          }
        }
        
        if (parseFloat(avg.pass_yds) > 0) {
          const passLog = formatVerifiedGameLog(logs, 'pass_yds', 'yds');
          if (passLog.gameByGame) {
            statsText += `  ✓ PASSING - Last 5 Games:\n`;
            statsText += `    ${passLog.gameByGame}\n`;
            statsText += `    ${passLog.trendIcon} ${passLog.trendDirection} (recent 2 avg: ${passLog.recent2Avg} vs older 3 avg: ${passLog.older3Avg}, ${passLog.trendPct >= 0 ? '+' : ''}${passLog.trendPct}%)\n`;
            statsText += `    Most recent: ${passLog.mostRecent} yds | Hit 200+: ${passLog.lineHits[200] || '0/5'} | Hit 250+: ${passLog.lineHits[250] || '0/5'}\n`;
          }
        }
        
        if (parseFloat(avg.rush_yds) > 10) {
          const rushLog = formatVerifiedGameLog(logs, 'rush_yds', 'yds');
          if (rushLog.gameByGame) {
            statsText += `  ✓ RUSHING - Last 5 Games:\n`;
            statsText += `    ${rushLog.gameByGame}\n`;
            statsText += `    ${rushLog.trendIcon} ${rushLog.trendDirection} (recent 2 avg: ${rushLog.recent2Avg} vs older 3 avg: ${rushLog.older3Avg}, ${rushLog.trendPct >= 0 ? '+' : ''}${rushLog.trendPct}%)\n`;
            statsText += `    Most recent: ${rushLog.mostRecent} yds | Hit 50+: ${rushLog.lineHits[50] || '0/5'} | Hit 75+: ${rushLog.lineHits[75] || '0/5'}\n`;
          }
        }
        
        // Volatility indicator (how predictable is this player?)
        const consistency = logs.consistency;
        const getVolatilityLabel = (score) => {
          const s = parseFloat(score);
          if (s >= 0.7) return 'CONSISTENT';
          if (s >= 0.5) return 'VARIABLE';
          return 'VOLATILE';
        };
        
        const relevantVolatility = [];
        if (parseFloat(avg.pass_yds) > 0) relevantVolatility.push(`Pass: ${getVolatilityLabel(consistency.pass_yds)}`);
        if (parseFloat(avg.rush_yds) > 10) relevantVolatility.push(`Rush: ${getVolatilityLabel(consistency.rush_yds)}`);
        if (parseFloat(avg.rec_yds) > 0) relevantVolatility.push(`Rec: ${getVolatilityLabel(consistency.rec_yds)}`);
        
        if (relevantVolatility.length > 0) {
          statsText += `  Volatility: ${relevantVolatility.join(', ')}\n`;
        }
        
        // Target share trending (for WR/TE/RB) - TREND FOCUS
        if (logs.targetTrend && parseFloat(logs.targetTrend.l5Avg) > 0) {
          const tt = logs.targetTrend;
          const trendIcon = tt.trend === 'SPIKE' ? '⬆️' : tt.trend === 'DECLINING' ? '⬇️' : '➡️';
          statsText += `  Target Trend: ${trendIcon} Recent: ${tt.l2Avg}/game vs Earlier: ${tt.l3Avg}/game (${tt.change >= 0 ? '+' : ''}${tt.change}%)\n`;
        }
        
        // Usage/snap proxy (touches + targets as involvement metric) - TREND FOCUS
        if (logs.usageTrend && parseFloat(logs.usageTrend.l5Avg) > 0) {
          const ut = logs.usageTrend;
          const trendIcon = ut.trend === 'INCREASING' ? '⬆️' : ut.trend === 'DECREASING' ? '⬇️' : '➡️';
          statsText += `  Usage Trend: ${trendIcon} Recent: ${ut.l2Avg} touches vs Earlier: ${ut.l5Avg} touches (${ut.change >= 0 ? '+' : ''}${ut.change}%)\n`;
        }
        
        // Hit rate analysis for each prop line (simplified - just hit count)
        if (candidate.props && candidate.props.length > 0) {
          statsText += `  Line performance:\n`;
          for (const prop of candidate.props) {
            const hitRate = calculateHitRate(logs.games, prop.type, prop.line);
            if (hitRate) {
              statsText += `    ${prop.type} ${prop.line}: Hit ${hitRate.hitsOver}/${hitRate.totalGames} games\n`;
            }
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
      const injuryContext = getPlayerInjuryContext(candidate.player);
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      statsText += `\n- **${candidate.player}**${injuryFlag}:\n`;
      
      // Add injury context if available (explains WHY stats might be affected)
      if (injuryContext.hasContext) {
        statsText += `  ⚠️ INJURY CONTEXT: ${injuryContext.status}${injuryContext.description ? ` - ${injuryContext.description}` : ''}\n`;
        statsText += `  (Stats below may be affected by this injury - consider if player is trending back to form or still limited)\n`;
      }
      
      if (logs && logs.gamesAnalyzed > 0) {
        const avg = logs.averages;
        
        // 🚨 VERIFIED BDL API STATS with TREND FOCUS
        statsText += `  📊 VERIFIED STATS (BDL API) - TREND ANALYSIS:\n`;
        
        // Position-specific game-by-game breakdowns with TREND EMPHASIS
        if (parseFloat(avg.rec_yds) > 0 || parseFloat(avg.receptions) > 0) {
          const recLog = formatVerifiedGameLog(logs, 'rec_yds', 'yds');
          if (recLog.gameByGame) {
            statsText += `  ✓ RECEIVING - Last 5 Games:\n`;
            statsText += `    ${recLog.gameByGame}\n`;
            statsText += `    ${recLog.trendIcon} ${recLog.trendDirection} (recent 2 avg: ${recLog.recent2Avg} vs older 3 avg: ${recLog.older3Avg}, ${recLog.trendPct >= 0 ? '+' : ''}${recLog.trendPct}%)\n`;
            statsText += `    Most recent: ${recLog.mostRecent} yds | Hit 75+: ${recLog.lineHits[75] || '0/5'}\n`;
          }
        }
        
        if (parseFloat(avg.pass_yds) > 0) {
          const passLog = formatVerifiedGameLog(logs, 'pass_yds', 'yds');
          if (passLog.gameByGame) {
            statsText += `  ✓ PASSING - Last 5 Games:\n`;
            statsText += `    ${passLog.gameByGame}\n`;
            statsText += `    ${passLog.trendIcon} ${passLog.trendDirection} (recent 2 avg: ${passLog.recent2Avg} vs older 3 avg: ${passLog.older3Avg}, ${passLog.trendPct >= 0 ? '+' : ''}${passLog.trendPct}%)\n`;
            statsText += `    Most recent: ${passLog.mostRecent} yds | Hit 200+: ${passLog.lineHits[200] || '0/5'} | Hit 250+: ${passLog.lineHits[250] || '0/5'}\n`;
          }
        }
        
        if (parseFloat(avg.rush_yds) > 10) {
          const rushLog = formatVerifiedGameLog(logs, 'rush_yds', 'yds');
          if (rushLog.gameByGame) {
            statsText += `  ✓ RUSHING - Last 5 Games:\n`;
            statsText += `    ${rushLog.gameByGame}\n`;
            statsText += `    ${rushLog.trendIcon} ${rushLog.trendDirection} (recent 2 avg: ${rushLog.recent2Avg} vs older 3 avg: ${rushLog.older3Avg}, ${rushLog.trendPct >= 0 ? '+' : ''}${rushLog.trendPct}%)\n`;
            statsText += `    Most recent: ${rushLog.mostRecent} yds | Hit 50+: ${rushLog.lineHits[50] || '0/5'} | Hit 75+: ${rushLog.lineHits[75] || '0/5'}\n`;
          }
        }
        
        // Volatility indicator (how predictable is this player?)
        const consistency = logs.consistency;
        const getVolatilityLabel = (score) => {
          const s = parseFloat(score);
          if (s >= 0.7) return 'CONSISTENT';
          if (s >= 0.5) return 'VARIABLE';
          return 'VOLATILE';
        };
        
        const relevantVolatility = [];
        if (parseFloat(avg.pass_yds) > 0) relevantVolatility.push(`Pass: ${getVolatilityLabel(consistency.pass_yds)}`);
        if (parseFloat(avg.rush_yds) > 10) relevantVolatility.push(`Rush: ${getVolatilityLabel(consistency.rush_yds)}`);
        if (parseFloat(avg.rec_yds) > 0) relevantVolatility.push(`Rec: ${getVolatilityLabel(consistency.rec_yds)}`);
        
        if (relevantVolatility.length > 0) {
          statsText += `  Volatility: ${relevantVolatility.join(', ')}\n`;
        }
        
        // Target share trending (for WR/TE/RB) - TREND FOCUS
        if (logs.targetTrend && parseFloat(logs.targetTrend.l5Avg) > 0) {
          const tt = logs.targetTrend;
          const trendIcon = tt.trend === 'SPIKE' ? '⬆️' : tt.trend === 'DECLINING' ? '⬇️' : '➡️';
          statsText += `  Target Trend: ${trendIcon} Recent: ${tt.l2Avg}/game vs Earlier: ${tt.l3Avg}/game (${tt.change >= 0 ? '+' : ''}${tt.change}%)\n`;
        }
        
        // Usage/snap proxy (touches + targets as involvement metric) - TREND FOCUS
        if (logs.usageTrend && parseFloat(logs.usageTrend.l5Avg) > 0) {
          const ut = logs.usageTrend;
          const trendIcon = ut.trend === 'INCREASING' ? '⬆️' : ut.trend === 'DECREASING' ? '⬇️' : '➡️';
          statsText += `  Usage Trend: ${trendIcon} Recent: ${ut.l2Avg} touches vs Earlier: ${ut.l5Avg} touches (${ut.change >= 0 ? '+' : ''}${ut.change}%)\n`;
        }
        
        // Hit rate analysis for each prop line (simplified - just hit count)
        if (candidate.props && candidate.props.length > 0) {
          statsText += `  Line performance:\n`;
          for (const prop of candidate.props) {
            const hitRate = calculateHitRate(logs.games, prop.type, prop.line);
            if (hitRate) {
              statsText += `    ${prop.type} ${prop.line}: Hit ${hitRate.hitsOver}/${hitRate.totalGames} games\n`;
            }
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
          targets: g.targets,
          opponent: g.opponent,
          isHome: g.isHome
        })),
        // NEW: Target share trending
        targetTrend: logs.targetTrend ? {
          l5Avg: logs.targetTrend.l5Avg,
          l2Avg: logs.targetTrend.l2Avg,
          change: logs.targetTrend.change,
          trend: logs.targetTrend.trend, // SPIKE, DECLINING, STABLE
          gameByGame: logs.targetTrend.gameByGame
        } : null,
        // NEW: Usage/snap count proxy
        usageTrend: logs.usageTrend ? {
          l5Avg: logs.usageTrend.l5Avg,
          l2Avg: logs.usageTrend.l2Avg,
          change: logs.usageTrend.change,
          level: logs.usageTrend.level, // ELITE, HIGH, MODERATE, LOW
          trend: logs.usageTrend.trend // INCREASING, DECREASING, STABLE
        } : null
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

  // Resolve teams - with detailed logging if fails
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
        `NFL Props: Resolve home team "${game.home_team}"`
      ),
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team),
        `NFL Props: Resolve away team "${game.away_team}"`
      )
    ]);
  } catch (e) {
    console.warn('[NFL Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Detect game day type (Christmas, Thanksgiving, TNF, etc.)
  const gameDayInfo = detectGameDayType(commenceDate);
  if (gameDayInfo.isSpecialEvent) {
    console.log(`[NFL Props Context] 🎄 SPECIAL EVENT: ${gameDayInfo.type} - ${gameDayInfo.impact}`);
  } else if (gameDayInfo.isShortWeek) {
    console.log(`[NFL Props Context] ⚠️ SHORT WEEK: ${gameDayInfo.type} - ${gameDayInfo.impact}`);
  }

  // STEP 1: First, resolve player teams from ALL props (before grouping)
  // This ensures correct team assignments before getTopPropCandidates groups by team
  console.log('[NFL Props Context] Step 1: Validating player-team assignments via BDL...');
  const allPropPlayers = groupPropsByPlayer(playerProps);
  const { playerIdMap, playerTeamMap } = await resolvePlayerIdsAndTeams(
    allPropPlayers, teamIds, game.home_team, game.away_team, season
  );

  // Update playerProps with validated team assignments BEFORE grouping
  for (const prop of playerProps) {
    const validatedTeam = playerTeamMap[(prop.player || '').toLowerCase()];
    if (validatedTeam) {
      prop.team = validatedTeam;
    }
  }

  // STEP 2: Now group and select top candidates (with correct team assignments)
  const propCandidates = getTopPropCandidates(playerProps, 7);

  // STEP 3: Parallel fetch - COMPREHENSIVE narrative context + BDL injuries
  // IMPORTANT: Narrative context is fetched UPFRONT so Gary knows all factors BEFORE iterations
  console.log('[NFL Props Context] Step 2: Fetching COMPREHENSIVE narrative + BDL injuries...');
  
  const [bdlInjuries, comprehensiveNarrative] = await Promise.all([
    // BDL injuries as backup - with logging if fails
    teamIds.length > 0 
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `NFL Props: Fetch injuries for teams ${teamIds.join(', ')}`
        )
      : Promise.resolve([]),
    
    // COMPREHENSIVE NARRATIVE CONTEXT - Fetches ALL factors UPFRONT:
    // - Breaking news (gameday inactives, trades, drama)
    // - QB situation (confirmed starters, injuries)
    // - Motivation (revenge games, milestones, contract years)
    // - Schedule (TNF/MNF, travel, divisional)
    // - Player-specific (target share trends, quotes)
    // - Team trends (streaks, ATS)
    // - Weather
    // - Betting signals (line movement, public % - MINOR ONLY)
    fetchComprehensivePropsNarrative(game.home_team, game.away_team, 'NFL', dateStr, { useFlash: true }).catch(e => {
      console.warn('[NFL Props Context] Comprehensive narrative failed:', e.message);
      return null;
    })
  ]);
  
  // Extract narrative context - now includes structured sections
  const narrativeContext = comprehensiveNarrative?.raw || null;
  const narrativeSections = comprehensiveNarrative?.sections || {};
  if (narrativeContext) {
    console.log(`[NFL Props Context] ✓ Got COMPREHENSIVE narrative context (${narrativeContext.length} chars)`);
    const foundSections = Object.entries(narrativeSections)
      .filter(([_, v]) => v && v.length > 10)
      .map(([k, _]) => k);
    if (foundSections.length > 0) {
      console.log(`[NFL Props Context] ✓ Parsed sections: ${foundSections.join(', ')}`);
    }
  }
  
  // Extract injuries from Gemini Grounding (PRIMARY) + BDL (backup)
  const groundedInjuries = extractInjuriesFromGrounding(narrativeContext, game.home_team, game.away_team);
  const bdlFormattedInjuries = formatPropsInjuries(bdlInjuries);
  
  // Merge injuries: Grounding injuries take priority (more current), add BDL injuries not already listed
  const injuryNames = new Set(groundedInjuries.map(i => i.player.toLowerCase()));
  const mergedInjuries = [
    ...groundedInjuries,
    ...bdlFormattedInjuries.filter(i => !injuryNames.has(i.player.toLowerCase()))
  ];
  
  if (mergedInjuries.length > 0) {
    console.log(`[NFL Props Context] 📋 Injuries: ${groundedInjuries.length} from Grounding, ${bdlFormattedInjuries.length} from BDL → ${mergedInjuries.length} total`);
  }
  
  // Extract weather from Gemini Grounding
  const weather = extractWeatherFromGrounding(narrativeContext);
  if (weather) {
    console.log(`[NFL Props Context] 🌤️ Weather from Grounding: ${weather.temperature}°F, ${weather.conditions}`);
  }
  
  // Fetch REAL defensive matchups from BDL (2025 season stats)
  // This replaces the placeholder defensive context with actual team defense data
  let defensiveMatchups = await fetchDefensiveMatchups(
    homeTeam?.id,
    awayTeam?.id,
    game.home_team,
    game.away_team,
    season
  );
  
  // Merge grounding injury data into defensive matchups
  if (defensiveMatchups) {
    defensiveMatchups.home_defense_vs_away = {
      ...defensiveMatchups.home_defense_vs_away,
      key_defensive_injuries: groundedInjuries.filter(i => i.team === game.home_team).map(i => i.player)
    };
    defensiveMatchups.away_defense_vs_home = {
      ...defensiveMatchups.away_defense_vs_home,
      key_defensive_injuries: groundedInjuries.filter(i => i.team === game.away_team).map(i => i.player)
    };
  }

  // CRITICAL: Filter prop candidates to only include players verified on either team
  const validatedCandidates = propCandidates.filter(c => {
    const playerKey = c.player.toLowerCase();
    const isVerified = playerTeamMap[playerKey] !== undefined;
    return isVerified;
  });

  if (validatedCandidates.length < propCandidates.length) {
    console.log(`[NFL Props Context] Validated ${validatedCandidates.length}/${propCandidates.length} players (filtered out ${propCandidates.length - validatedCandidates.length} unverified)`);
  }

  // CRITICAL: Filter out players who are Doubtful or Out to avoid void bets
  // NFL uses "Doubtful", "Out", "Questionable" statuses - we exclude Doubtful/Out
  // Note: In NFL, "Questionable" often still plays (~75% play rate), so we only exclude definite misses
  const riskyStatuses = ['doubtful', 'out'];
  const injuredPlayerNames = mergedInjuries
    .filter(inj => riskyStatuses.some(status => (inj.status || '').toLowerCase() === status))
    .map(inj => (inj.player || '').toLowerCase())
    .filter(name => name.length > 2);

  const availableCandidates = validatedCandidates.filter(c => {
    const playerNameLower = c.player.toLowerCase();
    const isRisky = injuredPlayerNames.some(injName => 
      playerNameLower.includes(injName) || injName.includes(playerNameLower)
    );
    if (isRisky) {
      console.log(`[NFL Props Context] ⚠️ EXCLUDED ${c.player} - Doubtful/Out (risk of void bet)`);
    }
    return !isRisky;
  });

  if (availableCandidates.length < validatedCandidates.length) {
    const excluded = validatedCandidates.length - availableCandidates.length;
    console.log(`[NFL Props Context] Filtered out ${excluded} Doubtful/Out player(s) to avoid void bets`);
  }

  // STEP 4: Fetch player game logs (requires player IDs)
  console.log('[NFL Props Context] Step 3: Fetching BDL player game logs (L5)...');
  const playerGameLogs = await fetchPlayerGameLogs(playerIdMap, season);
  
  // Log coverage stats
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = availableCandidates.length;
  console.log(`[NFL Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build comprehensive player stats text with ALL context
  // Use availableCandidates to ensure only verified and available players are included
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    availableCandidates,
    playerIdMap,
    mergedInjuries, // Use merged injuries from Grounding + BDL
    playerGameLogs,
    defensiveMatchups
  );

  // Build token data with enhanced info
  // Use availableCandidates to ensure only verified and available players are included
  const tokenData = buildPropsTokenSlices(
    playerStats,
    availableCandidates,
    mergedInjuries, // Use merged injuries from Grounding + BDL
    marketSnapshot,
    playerIdMap,
    playerGameLogs,
    defensiveMatchups,
    gameDayInfo, // Use gameDayInfo (Christmas Day, TNF, etc.)
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
    topCandidates: availableCandidates.map(p => p.player).slice(0, 6),
    playerLogsAvailable: playersWithLogs > 0,
    // Game day type (Christmas Day, TNF, etc.)
    gameDay: gameDayInfo,
    // Key injuries from Grounding
    keyInjuries: mergedInjuries.slice(0, 5).map(i => `${i.player} (${i.status})`),
    // Defensive matchup headlines (from Grounding injury data)
    defenseContext: {
      homeInjuries: defensiveMatchups?.home_defense_vs_away?.key_defensive_injuries || [],
      awayInjuries: defensiveMatchups?.away_defense_vs_home?.key_defensive_injuries || []
    },
    // Weather from Gemini Grounding
    weather: weather ? {
      temp: weather.temperature,
      wind: weather.wind_speed,
      conditions: weather.conditions,
      isDome: weather.is_dome
    } : null
  };

  // Check data availability and flag any gaps for Gary
  const logsCoverage = playersWithLogs / totalCandidates;
  const dataGaps = [];
  
  if (logsCoverage < 0.7) {
    dataGaps.push(`⚠️ LOW GAME LOGS COVERAGE: Only ${playersWithLogs}/${totalCandidates} players have recent game logs`);
  }
  if (!narrativeContext) {
    dataGaps.push(`⚠️ NO NARRATIVE CONTEXT: Gemini Grounding failed - missing injury updates, news, weather`);
  }
  if (mergedInjuries.length === 0 && teamIds.length > 0) {
    dataGaps.push(`⚠️ NO INJURIES RETURNED: Injury context may be incomplete`);
  }
  if (!weather) {
    dataGaps.push(`⚠️ NO WEATHER DATA: Weather context unavailable`);
  }
  
  if (dataGaps.length > 0) {
    console.warn(`[NFL Props Context] ⚠️ DATA GAPS DETECTED - Gary should proceed with caution:`);
    dataGaps.forEach(gap => console.warn(`   ${gap}`));
  }
  
  console.log(`[NFL Props Context] ✓ Built ENHANCED context:`);
  console.log(`   - ${availableCandidates.length} player candidates (verified on team, excludes Doubtful/Out)`);
  console.log(`   - ${playersWithLogs} players with game logs (${(logsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${mergedInjuries.length} injuries (${groundedInjuries.length} from Grounding)`);
  console.log(`   - Weather: ${weather ? `${weather.temperature}°F, ${weather.conditions}` : 'N/A'}`);
  console.log(`   - Game day: ${gameDayInfo.type}${gameDayInfo.isSpecialEvent ? ' (Special Event)' : ''}`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: availableCandidates, // Only return available players (excludes Doubtful/Out)
    playerStats,
    playerGameLogs,
    injuries: mergedInjuries, // Include merged injuries
    narrativeContext, // CRITICAL: Full raw narrative from Gemini
    // NEW: Structured narrative sections for easy access
    narrativeSections: {
      breakingNews: narrativeSections.breakingNews || null,   // Gameday inactives, trade rumors
      motivation: narrativeSections.motivation || null,       // Revenge games, milestones, contract years
      schedule: narrativeSections.schedule || null,           // TNF/MNF, travel, divisional
      weather: narrativeSections.weather || null,             // Temperature, wind, precipitation, player weather history
      playerContext: narrativeSections.playerContext || null, // Target share trends, quotes, weather performance
      teamTrends: narrativeSections.teamTrends || null,       // Streaks, rivalries
      bettingSignals: narrativeSections.bettingSignals || null, // Line movement, public % (MINOR ONLY)
      injuries: narrativeSections.injuries || null,           // Parsed injury context
      qbSituation: narrativeSections.qbSituation || null,     // QB starters, changes
    },
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      gameDayType: gameDayInfo.type,
      hasNarrativeContext: !!narrativeContext,
      hasWeather: !!weather,
      narrativeSectionsFetched: Object.keys(narrativeSections).filter(k => narrativeSections[k]?.length > 10),
      // NEW: Data availability flags for Gary to see
      dataAvailability: {
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: mergedInjuries.length > 0,
        weatherAvailable: !!weather,
        narrativeAvailable: !!narrativeContext,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildNflPropsAgenticContext
};
