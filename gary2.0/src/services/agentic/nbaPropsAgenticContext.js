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
import axios from 'axios';
// All context comes from Gemini 3 Flash with Google Search Grounding
import { 
  formatGameTimeEST, 
  buildMarketSnapshot, 
  parseGameDate, 
  safeApiCallArray, 
  safeApiCallObject,
  fuzzyMatchPlayerName,
  findBestPlayerMatch,
  checkDataAvailability,
  fixBdlInjuryStatus,
  normalizeTeamName
} from './sharedUtils.js';
import { fetchComprehensivePropsNarrative, fetchPropLineMovement, getPlayerPropMovement } from './scoutReport/scoutReportBuilder.js';
import { fetchNbaInjuriesForGame } from '../nbaInjuryReportService.js';

const SPORT_KEY = 'basketball_nba';

/**
 * Calculate scenario projections for kill condition analysis
 * Pre-calculates baseline, blowout, and competitive scenarios so Gary doesn't do LLM math
 * @param {Object} playerStats - Player season stats from BDL
 * @param {Array} props - Player's prop lines [{type, line}]
 * @param {number} gameSpread - Game spread (positive = underdog, negative = favorite)
 * @returns {Object} Scenario projections for each prop type
 */
function calculateScenarioProjections(playerStats, props, gameSpread) {
  if (!playerStats || !playerStats.mpg || playerStats.mpg === 0) {
    return null;
  }
  
  const mpg = parseFloat(playerStats.mpg) || 32;
  const blowoutMinutes = 28; // Starters in blowout scenario
  const competitiveMinutes = Math.min(mpg + 2, 38); // Close game = full run
  
  // Calculate per-minute rates
  const ppm = (parseFloat(playerStats.ppg) || 0) / mpg; // Points per minute
  const rpm = (parseFloat(playerStats.rpg) || 0) / mpg; // Rebounds per minute
  const apm = (parseFloat(playerStats.apg) || 0) / mpg; // Assists per minute
  const tpm = (parseFloat(playerStats.tpg) || 0) / mpg; // Threes per minute
  
  // Is this team at blowout risk? (spread >= 10)
  const isBlowoutRisk = Math.abs(parseFloat(gameSpread) || 0) >= 10;
  const isOnFavorite = (parseFloat(gameSpread) || 0) < 0; // Negative spread = favorite
  
  const projections = {};
  
  // Calculate for each prop type
  const propTypes = {
    'points': { rate: ppm, avg: playerStats.ppg },
    'pts': { rate: ppm, avg: playerStats.ppg },
    'rebounds': { rate: rpm, avg: playerStats.rpg },
    'reb': { rate: rpm, avg: playerStats.rpg },
    'assists': { rate: apm, avg: playerStats.apg },
    'ast': { rate: apm, avg: playerStats.apg },
    'threes': { rate: tpm, avg: playerStats.tpg },
    'fg3m': { rate: tpm, avg: playerStats.tpg },
    'pra': { rate: ppm + rpm + apm, avg: playerStats.pra },
    'points_rebounds_assists': { rate: ppm + rpm + apm, avg: playerStats.pra },
    'pr': { rate: ppm + rpm, avg: (parseFloat(playerStats.ppg) || 0) + (parseFloat(playerStats.rpg) || 0) },
    'points_rebounds': { rate: ppm + rpm, avg: (parseFloat(playerStats.ppg) || 0) + (parseFloat(playerStats.rpg) || 0) }
  };
  
  for (const prop of (props || [])) {
    const propType = (prop.type || prop.prop_type || '').toLowerCase();
    const line = parseFloat(prop.line) || 0;
    const rateData = propTypes[propType];
    
    if (!rateData) continue;
    
    const baselineProj = parseFloat((mpg * rateData.rate).toFixed(1));
    const blowoutProj = parseFloat((blowoutMinutes * rateData.rate).toFixed(1));
    const competitiveProj = parseFloat((competitiveMinutes * rateData.rate).toFixed(1));
    
    // Kill condition: If blowout projection < line AND team is favorite (will sit if up big)
    const killTriggered = isBlowoutRisk && isOnFavorite && blowoutProj < line;
    
    projections[propType] = {
      baseline: { minutes: mpg, projection: baselineProj },
      blowout: { minutes: blowoutMinutes, projection: blowoutProj },
      competitive: { minutes: competitiveMinutes, projection: competitiveProj },
      line: line,
      perMinuteRate: parseFloat(rateData.rate.toFixed(3)),
      killCondition: {
        triggered: killTriggered,
        reason: killTriggered 
          ? `Blowout projection (${blowoutProj}) < line (${line}) - spread is ${gameSpread}`
          : null
      },
      // Quick reference for Gary
      blowoutVsLine: parseFloat((blowoutProj - line).toFixed(1)),
      baselineVsLine: parseFloat((baselineProj - line).toFixed(1))
    };
  }
  
  return {
    projections,
    meta: {
      mpg,
      blowoutMinutes,
      competitiveMinutes,
      isBlowoutRisk,
      isOnFavorite,
      gameSpread: parseFloat(gameSpread) || 0
    }
  };
}

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
  // NOTE: This must handle BOTH raw Odds API names AND standardized names from propOddsService
  const propToField = {
    // Points - raw and standardized
    'points': 'pts',
    'player_points': 'pts',
    'pts': 'pts',  // Already standardized - CRITICAL FIX
    
    // Rebounds - raw and standardized
    'rebounds': 'reb',
    'player_rebounds': 'reb',
    'reb': 'reb',  // Already standardized - CRITICAL FIX
    
    // Assists - raw and standardized
    'assists': 'ast',
    'player_assists': 'ast',
    'ast': 'ast',  // Already standardized - CRITICAL FIX
    
    // Threes - raw and standardized
    'threes': 'fg3m',
    'player_threes': 'fg3m',
    'fg3m': 'fg3m',  // Already standardized - CRITICAL FIX
    '3pm': 'fg3m',
    'three_pointers_made': 'fg3m',
    
    // Blocks - raw and standardized
    'blocks': 'blk',
    'player_blocks': 'blk',
    'blk': 'blk',  // Already standardized - CRITICAL FIX
    
    // Steals - raw and standardized
    'steals': 'stl',
    'player_steals': 'stl',
    'stl': 'stl',  // Already standardized - CRITICAL FIX
    
    // Combined stats - raw and standardized
    'points_rebounds_assists': 'pra',
    'player_points_rebounds_assists': 'pra',
    'pra': 'pra',  // Already standardized
    'points_rebounds': 'pr',
    'player_points_rebounds': 'pr',
    'pr': 'pr',  // Already standardized
    'points_assists': 'pa',
    'player_points_assists': 'pa',
    'pa': 'pa',
    'rebounds_assists': 'ra',
    'player_rebounds_assists': 'ra',
    'ra': 'ra',
    
    // Turnovers
    'turnovers': 'turnover',
    'player_turnovers': 'turnover',
    'tov': 'turnover',
    
    // Minutes (useful for context)
    'minutes': 'min',
    'min': 'min'
  };
  
  const field = propToField[propType?.toLowerCase()] || propType;
  
  let hitsOver = 0;
  let hitsUnder = 0;
  let pushes = 0;
  const values = [];
  
  for (const game of games) {
    let value;
    // Handle combined stats
    if (field === 'pra') {
      // Points + Rebounds + Assists
      value = (game.pts || 0) + (game.reb || 0) + (game.ast || 0);
    } else if (field === 'pr') {
      // Points + Rebounds
      value = (game.pts || 0) + (game.reb || 0);
    } else if (field === 'pa') {
      // Points + Assists
      value = (game.pts || 0) + (game.ast || 0);
    } else if (field === 'ra') {
      // Rebounds + Assists
      value = (game.reb || 0) + (game.ast || 0);
    } else {
      // Direct field lookup
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
  
  // Find injured stars on the same team (FRESH injuries only — season-long is priced in)
  const teamInjuries = injuries.filter(inj => {
    const injTeam = (inj.team || '').toLowerCase();
    const injPlayer = (inj.player || '').toLowerCase();
    const injStatus = (inj.status || '').toLowerCase();
    const injDuration = (inj.duration || '').toLowerCase();

    // Check if on same team and is a key player
    const isTeammate = injTeam.includes(team.toLowerCase()) || team.toLowerCase().includes(injTeam.split(' ').pop());
    const isKeyPlayer = allStars.some(star => injPlayer.includes(star) || star.includes(injPlayer));
    const isOut = ['out', 'doubtful', 'day-to-day'].some(s => injStatus.includes(s));

    // Skip season-long injuries — team has adapted, usage already shifted, props already reflect it
    const isSeasonLong = injDuration.includes('season') || injDuration.includes('90d') ||
      (inj.durationDays && inj.durationDays >= 30);
    if (isSeasonLong) return false;

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
      scoringEnvironment = 'low total — investigate how pace and defense affect player usage';
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
 * Returns top N players PER TEAM (so 10 per team = 20 total for a game)
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 10) {
  const grouped = groupPropsByPlayer(props);
  
  // Score each player by number of props and odds quality
  // NOTE: No bias toward any specific prop type - Gary decides organically
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || null;
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
  const STALE_WINDOW_DAYS = 3; // Same as game picks (per CLAUDE.md)
  // Handles both RapidAPI format (source: 'nba_injury_report_api') and BDL format
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
    .map((injury) => {
      // RapidAPI injuries already have correct status — skip BDL fix
      const isRapidApi = injury.source === 'nba_injury_report_api';
      const fixedInj = isRapidApi ? injury : fixBdlInjuryStatus(injury);
      const dur = (fixedInj?.duration || 'UNKNOWN').toUpperCase();
      const days = fixedInj?.daysSinceReport;

      // Freshness evaluation — mirrors game picks scoutReportBuilder logic
      // Props lines adjust just like game lines; stale injuries are NOT edges
      let freshness = 'STALE';
      let isPricedIn = true;
      if (dur === 'SEASON-LONG' || dur.includes('SEASON')) {
        freshness = 'STALE';
        isPricedIn = true;
      } else if (dur === 'MID-SEASON') {
        // 7+ days — always priced in
        freshness = 'STALE';
        isPricedIn = true;
      } else if (dur === 'RECENT') {
        // RECENT could be 0-7 days — check exact days if available
        if (days !== null && days !== undefined && days <= STALE_WINDOW_DAYS) {
          freshness = 'FRESH';
          isPricedIn = false;
        } else if (days !== null && days !== undefined) {
          freshness = 'STALE';
          isPricedIn = true;
        } else {
          // day-to-day without exact days — treat as potentially fresh
          freshness = 'FRESH';
          isPricedIn = false;
        }
      } else {
        // UNKNOWN duration — conservatively assume priced in
        freshness = 'STALE';
        isPricedIn = true;
      }

      return {
        player: fixedInj?.player?.full_name || `${fixedInj?.player?.first_name || ''} ${fixedInj?.player?.last_name || ''}`.trim(),
        position: fixedInj?.player?.position || 'Unknown',
        status: fixedInj?.status || 'Unknown',
        description: fixedInj?.description || fixedInj?.durationContext || '',
        team: fixedInj?.team?.full_name || fixedInj?.team || '',
        duration: dur,
        daysSinceReport: days,
        freshness,
        isPricedIn
      };
    })
    // Filter out season-long injuries — prop lines already reflect their absence
    .filter(inj => {
      const dur = (inj.duration || '').toLowerCase();
      const isSeasonLong = dur.includes('season') || dur.includes('90d');
      if (isSeasonLong) {
        console.log(`[Props Injuries] Filtered out ${inj.player} (${inj.duration}) — season-long, already priced into prop lines`);
      }
      return !isSeasonLong;
    });
}

/**
 * Detect players who are likely injured but NOT in BDL injury report
 * Strategy: Players with props available but NO recent game logs are likely injured
 * This catches cases like Seth Curry (injured since Dec 4, but not in BDL injury API)
 * Note: Game logs filter out 0-minute games, so injured players have NO logs
 */
async function detectLikelyInjuredFromStats(playerIdMap, injuries, propCandidates) {
  const likelyInjured = [];
  const injuredNames = new Set(injuries.map(i => i.player?.toLowerCase()));
  
  // Get player IDs that have props available
  const playerIdsToCheck = [];
  const playerNameById = {};
  
  for (const candidate of propCandidates) {
    const playerInfo = playerIdMap[candidate.player.toLowerCase()];
    if (!playerInfo?.id) continue;
    
    // Skip if already in BDL injury report
    if (injuredNames.has(candidate.player.toLowerCase())) continue;
    
    playerIdsToCheck.push(playerInfo.id);
    playerNameById[playerInfo.id] = {
      name: candidate.player,
      team: candidate.team
    };
  }
  
  if (playerIdsToCheck.length === 0) return likelyInjured;
  
  // Fetch UNFILTERED stats directly from BDL to check for 0-minute games
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 14); // Last 2 weeks
  
  try {
    // Check each player for 0-minute games (limit to 15 to avoid rate limits)
    for (const playerId of playerIdsToCheck.slice(0, 15)) {
      const playerInfo = playerNameById[playerId];
      
      try {
        const statsUrl = `https://api.balldontlie.io/v1/stats?player_ids[]=${playerId}&start_date=${startDate.toISOString().slice(0, 10)}&end_date=${endDate.toISOString().slice(0, 10)}&per_page=10`;
        const response = await axios.get(statsUrl, {
          headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY }
        });
        
        const recentGames = response.data?.data || [];
        
        // Check if ALL recent games are 0 minutes
        if (recentGames.length >= 3) {
          const allZeroMinutes = recentGames.every(g => {
            const mins = parseInt(g.min) || 0;
            return mins === 0;
          });
          
          if (allZeroMinutes) {
            likelyInjured.push({
              player: playerInfo.name,
              status: 'Likely Out (0 min in recent games)',
              description: `Has played 0 minutes in last ${recentGames.length} games - likely injured but not in BDL injury report`,
              team: playerInfo.team || '',
              detected: true
            });
            console.log(`[NBA Props Context] ⚠️ DETECTED likely injury: ${playerInfo.name} - 0 minutes in last ${recentGames.length} games`);
          }
        }
      } catch (e) {
        // Skip this player on error
        continue;
      }
    }
  } catch (e) {
    console.warn('[NBA Props Context] Failed to detect injuries from stats:', e.message);
  }
  
  return likelyInjured;
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
 * 
 * CRITICAL: Only ROAD B2B (away team on second night) significantly impacts props
 * - Away team on B2B = SIGNIFICANT (traveled yesterday, playing again tonight)
 * - Home team on B2B = MINOR (rested at home, just played yesterday)
 * 
 * @param {Array<number>} teamIds - Team IDs [homeTeamId, awayTeamId]
 * @param {string} gameDate - Game date string (YYYY-MM-DD)
 * @returns {Object} - { home: boolean, away: boolean, awayRoadB2B: boolean, significant: boolean }
 */
async function detectBackToBack(teamIds, gameDate) {
  const result = { 
    home: false, 
    away: false, 
    homeLastGame: null, 
    awayLastGame: null,
    awayRoadB2B: false,  // TRUE if away team played yesterday AND is away again today
    homeRoadB2B: false,  // TRUE if home team played away yesterday (less common)
    significant: false   // Only true for road B2B situations
  };

  if (!teamIds || teamIds.length === 0) return result;

  try {
    // Get yesterday's date in EST timezone to match NBA schedule
    // Use explicit EST calculation to avoid timezone issues
    const now = new Date();
    const estOffset = -5; // EST is UTC-5 (ignore DST for simplicity, NBA season is mostly EST)
    const todayEST = new Date(now.getTime() + (estOffset * 60 * 60 * 1000));
    
    // Parse the game date properly
    const [year, month, day] = gameDate.split('-').map(Number);
    const gameDateEST = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Noon UTC = morning EST
    
    // Yesterday is one day before the game date
    const yesterdayEST = new Date(gameDateEST);
    yesterdayEST.setDate(yesterdayEST.getDate() - 1);
    const yesterdayStr = yesterdayEST.toISOString().slice(0, 10);
    
    console.log(`[NBA Props Context] B2B check: Game date=${gameDate}, checking yesterday=${yesterdayStr}`);

    // Check recent games for both teams using BDL
    const recentGames = await safeApiCallArray(
      () => ballDontLieService.getGames(SPORT_KEY, { dates: [yesterdayStr], team_ids: teamIds }),
      `NBA Props: B2B detection games for ${yesterdayStr}`
    );

    if (recentGames.length > 0) {
      console.log(`[NBA Props Context] Found ${recentGames.length} games from ${yesterdayStr} involving these teams`);

      for (const game of recentGames) {
        const homeId = game.home_team?.id;
        const awayId = game.visitor_team?.id;
        
        // Today's game: teamIds[0] = home team, teamIds[1] = away team
        const todayHomeId = teamIds[0];
        const todayAwayId = teamIds[1];

        // Check if today's HOME team played yesterday
        if (todayHomeId && (homeId === todayHomeId || awayId === todayHomeId)) {
          result.home = true;
          result.homeLastGame = yesterdayStr;
          // Check if they were AWAY yesterday (road trip into home game - rare but possible)
          if (awayId === todayHomeId) {
            result.homeRoadB2B = true; // They traveled yesterday, now home
          }
          console.log(`[NBA Props Context] Home team (ID:${todayHomeId}) played yesterday - ${awayId === todayHomeId ? 'AWAY' : 'HOME'}`);
        }

        // Check if today's AWAY team played yesterday - THIS IS THE SIGNIFICANT ONE
        if (todayAwayId && (homeId === todayAwayId || awayId === todayAwayId)) {
          result.away = true;
          result.awayLastGame = yesterdayStr;
          // Away team is on the road TONIGHT, so any B2B is a road B2B for them
          result.awayRoadB2B = true; // They're away tonight = road B2B
          console.log(`[NBA Props Context] ⚠️ AWAY team (ID:${todayAwayId}) on ROAD B2B - played yesterday, traveling again tonight`);
        }
      }
      
      // Only mark as significant if AWAY team is on a road B2B
      // Home team B2B is much less impactful (they slept in their own beds)
      result.significant = result.awayRoadB2B;
      
      if (result.home && !result.away) {
        console.log(`[NBA Props Context] Home team B2B only - minimal impact (home rest advantage)`);
      }
    } else {
      console.log(`[NBA Props Context] No games found on ${yesterdayStr} - no B2B situation`);
    }

    return result;
  } catch (e) {
    console.warn('[NBA Props Context] B2B detection failed:', e.message);
    return result;
  }
}

/**
 * Fetch and compute opponent defensive profile for a team.
 * Uses ballDontLieService.getTeamOpponentStats() for opponent shooting/TOV/FT data
 * and ballDontLieService.getTeamSeasonAdvanced() for pace and DRtg.
 * Returns a concise defensive summary object.
 * @param {number} teamId - BDL team ID
 * @param {number} season - NBA season year
 * @returns {Object|null} Opponent defense profile
 */
async function fetchOpponentDefenseProfile(teamId, season) {
  if (!teamId) return null;

  try {
    const [oppStats, advancedStats] = await Promise.all([
      ballDontLieService.getTeamOpponentStats(teamId, season),
      ballDontLieService.getTeamSeasonAdvanced(teamId, season)
    ]);

    if (!oppStats && !advancedStats) return null;

    // Compute derived metrics from raw opponent stats (same math as statRouter.js)
    const opp_fgm = oppStats?.opp_fgm || 0;
    const opp_fga = oppStats?.opp_fga || 0;
    const opp_fg3m = oppStats?.opp_fg3m || 0;
    const opp_fta = oppStats?.opp_fta || 0;
    const opp_tov = oppStats?.opp_tov || 0;

    return {
      // Opponent eFG%: (FGM + 0.5 * 3PM) / FGA
      opp_efg_pct: opp_fga > 0 ? ((opp_fgm + 0.5 * opp_fg3m) / opp_fga * 100).toFixed(1) : null,
      // Opponent 3PT%
      opp_fg3_pct: oppStats?.opp_fg3_pct != null ? (oppStats.opp_fg3_pct * 100).toFixed(1) : null,
      // Opponent PPG allowed
      opp_pts: oppStats?.opp_pts != null ? oppStats.opp_pts.toFixed(1) : null,
      // Opponent TOV rate: TOV / (FGA + 0.44*FTA + TOV)
      opp_tov_rate: (opp_fga + 0.44 * opp_fta + opp_tov) > 0
        ? (opp_tov / (opp_fga + 0.44 * opp_fta + opp_tov) * 100).toFixed(1)
        : null,
      // Opponent FT rate: FTA / FGA
      opp_ft_rate: opp_fga > 0 ? (opp_fta / opp_fga * 100).toFixed(1) : null,
      // Opponent OREB (second chance opportunities allowed)
      opp_oreb: oppStats?.opp_oreb != null ? oppStats.opp_oreb.toFixed(1) : null,
      // From advanced: pace, DRtg
      pace: advancedStats?.pace != null ? advancedStats.pace.toFixed(1) : null,
      def_rating: advancedStats?.def_rating != null ? advancedStats.def_rating.toFixed(1) : null
    };
  } catch (e) {
    console.warn(`[NBA Props Context] Failed to fetch opponent defense for team ${teamId}:`, e.message);
    return null;
  }
}

/**
 * Build comprehensive player stats text with actual BDL data
 * ENHANCED: Now includes recent form, consistency, home/away splits, and opponent defense
 */
function buildPlayerStatsText(homeTeam, awayTeam, propCandidates, playerSeasonStats, playerIdMap, injuries, playerGameLogs = {}, opponentDefense = {}) {
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
  
  // Away team section — opponent is the HOME team's defense
  statsText += `### ${awayTeam} Players\n`;

  // Show opponent (home team) defensive profile for away players
  const awayOppDef = opponentDefense.home; // away players face HOME defense
  if (awayOppDef) {
    const defParts = [];
    if (awayOppDef.opp_pts) defParts.push(`${awayOppDef.opp_pts} PPG allowed`);
    if (awayOppDef.opp_efg_pct) defParts.push(`${awayOppDef.opp_efg_pct}% opp eFG`);
    if (awayOppDef.opp_fg3_pct) defParts.push(`${awayOppDef.opp_fg3_pct}% opp 3PT`);
    if (awayOppDef.pace) defParts.push(`Pace ${awayOppDef.pace}`);
    if (awayOppDef.def_rating) defParts.push(`DRtg ${awayOppDef.def_rating}`);
    if (defParts.length > 0) {
      statsText += `Opponent Defense (${homeTeam}): ${defParts.join(' | ')}\n`;
    }
  }

  if (awayPlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');

      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      // Factual injury labels with duration
      let injuryFlag = '';
      if (isInjured) {
        const daysInfo = injuryRecord.daysSinceReport != null ? ` (${injuryRecord.daysSinceReport}d)` : '';
        const duration = injuryRecord.duration || '';
        if (duration === 'SEASON-LONG') {
          injuryFlag = ` ⚠️ INJURED [Out For Season${daysInfo}]`;
        } else if (duration === 'RECENT') {
          injuryFlag = ` ⚠️ INJURED [RECENT${daysInfo}]`;
        } else {
          injuryFlag = ` ⚠️ INJURED [OUT${daysInfo}]`;
        }
      }

      if (stats) {
        statsText += `- **${candidate.player}** (${stats.position || 'N/A'})${injuryFlag}:\n`;
        statsText += `  Props: ${propsStr}\n`;
        statsText += `  Season: PPG ${stats.ppg || 'N/A'}, RPG ${stats.rpg || 'N/A'}, APG ${stats.apg || 'N/A'}, 3PG ${stats.tpg || 'N/A'}, PRA ${stats.pra || 'N/A'}, MPG ${stats.mpg || 'N/A'}\n`;

        // ENHANCED: Show usage & efficiency metrics for prop context
        if (stats.usagePct || stats.trueShooting) {
          statsText += `  Usage: USG% ${stats.usagePct || 'N/A'}, TS% ${stats.trueShooting || 'N/A'}, EFG% ${stats.effectiveFgPct || 'N/A'}\n`;
        }

        // Team-share percentages — tells Gary what % of team production this player represents
        if (stats.pctPts || stats.pctFga) {
          const shareParts = [];
          if (stats.pctPts) shareParts.push(`${stats.pctPts}% PTS`);
          if (stats.pctReb) shareParts.push(`${stats.pctReb}% REB`);
          if (stats.pctAst) shareParts.push(`${stats.pctAst}% AST`);
          if (stats.pctFga) shareParts.push(`${stats.pctFga}% FGA`);
          statsText += `  Team Share: ${shareParts.join(' | ')}\n`;
        }

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
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }

  statsText += '\n';

  // Home team section — opponent is the AWAY team's defense
  statsText += `### ${homeTeam} Players\n`;

  // Show opponent (away team) defensive profile for home players
  const homeOppDef = opponentDefense.away; // home players face AWAY defense
  if (homeOppDef) {
    const defParts = [];
    if (homeOppDef.opp_pts) defParts.push(`${homeOppDef.opp_pts} PPG allowed`);
    if (homeOppDef.opp_efg_pct) defParts.push(`${homeOppDef.opp_efg_pct}% opp eFG`);
    if (homeOppDef.opp_fg3_pct) defParts.push(`${homeOppDef.opp_fg3_pct}% opp 3PT`);
    if (homeOppDef.pace) defParts.push(`Pace ${homeOppDef.pace}`);
    if (homeOppDef.def_rating) defParts.push(`DRtg ${homeOppDef.def_rating}`);
    if (defParts.length > 0) {
      statsText += `Opponent Defense (${awayTeam}): ${defParts.join(' | ')}\n`;
    }
  }

  if (homePlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of homePlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');

      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      // Factual injury labels with duration
      let injuryFlag = '';
      if (isInjured) {
        const daysInfo = injuryRecord.daysSinceReport != null ? ` (${injuryRecord.daysSinceReport}d)` : '';
        const duration = injuryRecord.duration || '';
        if (duration === 'SEASON-LONG') {
          injuryFlag = ` ⚠️ INJURED [Out For Season${daysInfo}]`;
        } else if (duration === 'RECENT') {
          injuryFlag = ` ⚠️ INJURED [RECENT${daysInfo}]`;
        } else {
          injuryFlag = ` ⚠️ INJURED [OUT${daysInfo}]`;
        }
      }

      if (stats) {
        statsText += `- **${candidate.player}** (${stats.position || 'N/A'})${injuryFlag}:\n`;
        statsText += `  Props: ${propsStr}\n`;
        statsText += `  Season: PPG ${stats.ppg || 'N/A'}, RPG ${stats.rpg || 'N/A'}, APG ${stats.apg || 'N/A'}, 3PG ${stats.tpg || 'N/A'}, PRA ${stats.pra || 'N/A'}, MPG ${stats.mpg || 'N/A'}\n`;

        // ENHANCED: Show usage & efficiency metrics for prop context
        if (stats.usagePct || stats.trueShooting) {
          statsText += `  Usage: USG% ${stats.usagePct || 'N/A'}, TS% ${stats.trueShooting || 'N/A'}, EFG% ${stats.effectiveFgPct || 'N/A'}\n`;
        }

        // Team-share percentages — tells Gary what % of team production this player represents
        if (stats.pctPts || stats.pctFga) {
          const shareParts = [];
          if (stats.pctPts) shareParts.push(`${stats.pctPts}% PTS`);
          if (stats.pctReb) shareParts.push(`${stats.pctReb}% REB`);
          if (stats.pctAst) shareParts.push(`${stats.pctAst}% AST`);
          if (stats.pctFga) shareParts.push(`${stats.pctFga}% FGA`);
          statsText += `  Team Share: ${shareParts.join(' | ')}\n`;
        }

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
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }

  // Add injury summary with factual duration labels
  if (injuries.length > 0) {
    statsText += '\n### Injury Report\n';
    injuries.forEach(inj => {
      const daysInfo = inj.daysSinceReport != null ? ` (${inj.daysSinceReport}d)` : '';
      const duration = inj.duration || '';
      let label;
      if (duration === 'SEASON-LONG') {
        label = `[Out For Season${daysInfo}]`;
      } else if (duration === 'RECENT') {
        label = `[RECENT${daysInfo}]`;
      } else {
        label = `[OUT${daysInfo}]`;
      }
      statsText += `- ${inj.player} (${inj.status}) ${label}: ${inj.description?.slice(0, 100) || 'No details'}\n`;
    });
  }
  
  return statsText;
}

/**
 * Build token slices for prop analysis - enhanced with player stats, game logs, hit rates,
 * SCENARIO PROJECTIONS, and LINE MOVEMENT data for Kill Condition analysis
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerSeasonStats, playerIdMap, playerGameLogs = {}, lineMovements = {}) {
  // Get pace/total environment context
  const paceContext = getPaceAndTotalContext(marketSnapshot, null, null);
  const gameSpread = paceContext.spread || 0;
  
  // Enhance prop candidates with their season stats, recent form, hit rates, 
  // SCENARIO PROJECTIONS, and LINE MOVEMENT
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    const games = logs?.games || [];
    
    // Calculate hit rate for each prop line
    const propsWithHitRates = p.props.map(prop => {
      const hitRate = calculateHitRate(games, prop.type, prop.line);
      
      // Look up line movement for this player + prop
      const propKey = `${p.player}_${prop.type}`.toLowerCase().replace(/\s+/g, '_');
      const movement = lineMovements[propKey] || getPlayerPropMovement(lineMovements, p.player, prop.type);
      
      return {
        ...prop,
        hitRate: hitRate ? {
          overRate: hitRate.overRate,
          underRate: hitRate.underRate,
          avgValue: hitRate.avgValue,
          lastValues: hitRate.values,
          recommendation: hitRate.recommendation,
          gamesAnalyzed: hitRate.totalGames
        } : null,
        // LINE MOVEMENT DATA - for Tier 2 Kill Condition analysis
        lineMovement: movement ? {
          open: movement.open,
          current: movement.current,
          direction: movement.direction, // "UP" | "DOWN"
          magnitude: movement.magnitude,
          signal: movement.signal, // "MOVED_UP" | "MOVED_DOWN" | "STABLE"
          // Pre-formatted for Gary's analysis
          movementNote: movement.magnitude >= 2.0 
            ? `Line moved ${movement.direction} ${Math.abs(movement.magnitude)} points (${movement.open} -> ${movement.current})`
            : null
        } : { source: 'NOT_FOUND' }
      };
    });
    
    // Calculate SCENARIO PROJECTIONS for this player (for Tier 1 Kill Conditions)
    const scenarioData = stats ? calculateScenarioProjections(stats, p.props, gameSpread) : null;
    
    // Analyze teammate injury impact
    const teammateImpact = analyzeTeammateImpact(p.player, p.team, injuries, playerSeasonStats);
    
    return {
      player: p.player,
      team: p.team,
      props: propsWithHitRates, // Now includes hit rates AND line movement!
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
      // SCENARIO PROJECTIONS - for Tier 1 Kill Condition math (pre-calculated, no LLM arithmetic)
      scenarioProjections: scenarioData?.projections || null,
      scenarioMeta: scenarioData?.meta || null,
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
      // Teammate injury impact
      teammateImpact: teammateImpact
    };
  });
  
  // Count any kill conditions triggered
  const killConditionsTriggered = enhancedCandidates.filter(c => 
    c.scenarioProjections && Object.values(c.scenarioProjections).some(p => p.killCondition?.triggered)
  ).length;
  
  if (killConditionsTriggered > 0) {
    console.log(`[NBA Props Context] ⚠️ ${killConditionsTriggered} players have Tier 1 Kill Conditions triggered (blowout risk)`);
  }
  
  return {
    player_stats: {
      summary: playerStats, // Full player stats — no truncation
      playerCount: (playerStats.match(/\*\*/g) || []).length / 2
    },
    prop_lines: {
      candidates: enhancedCandidates,
      totalProps: propCandidates.reduce((sum, p) => sum + p.props.length, 0),
      killConditionsTriggered: killConditionsTriggered
    },
    // Game environment context
    game_environment: {
      total: paceContext.total,
      totalCategory: paceContext.totalCategory,
      scoringEnvironment: paceContext.scoringEnvironment,
      spread: paceContext.spread,
      blowoutRisk: paceContext.blowoutRisk,
      blowoutNote: paceContext.blowoutNote
    },
    injury_report: {
      notable: injuries,
      total_listed: injuries.length
    },
    market_context: marketSnapshot,
    // LINE MOVEMENT SUMMARY
    lineMovementSummary: {
      totalFound: Object.keys(lineMovements).length,
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 2.0).length
    }
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
  
  // Parallel fetch: injuries, player IDs, narrative context, AND LINE MOVEMENT via Gemini Grounding
  // IMPORTANT: All context is fetched UPFRONT so Gary knows all factors BEFORE iterations
  console.log('[NBA Props Context] Fetching injuries, player IDs, narrative context, and LINE MOVEMENT...');
  // RapidAPI for injury STATUS (same source as game picks)
  const isoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const [apiInjuries, bdlInjuries, playerIdMap, comprehensiveNarrative, lineMovementData] = await Promise.all([
    // RapidAPI: injury STATUS (source of truth — same as game picks)
    fetchNbaInjuriesForGame(game.home_team, game.away_team, isoDate).catch(e => {
      console.error(`[NBA Props Context] RapidAPI injury fetch FAILED: ${e.message}`);
      return null;
    }),
    // BDL: duration ENRICHMENT only (description text for duration parsing)
    teamIds.length > 0
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `NBA Props: BDL duration enrichment`
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
    }),
    
    // LINE MOVEMENT - Queries ScoresAndOdds/BettingPros for opening vs current lines
    // This enables Tier 2 Kill Conditions (detecting public chase vs sharp steam)
    fetchPropLineMovement('NBA', dateStr, game.home_team, game.away_team).catch(e => {
      console.warn('[NBA Props Context] Line movement fetch failed:', e.message);
      return { movements: {}, source: 'ERROR' };
    })
  ]);
  
  // Log line movement results
  const lineMovements = lineMovementData?.movements || {};
  const lineMovementCount = Object.keys(lineMovements).length;
  if (lineMovementCount > 0) {
    console.log(`[NBA Props Context] ✓ Found ${lineMovementCount} prop line movements from ${lineMovementData.source}`);
  } else {
    console.log(`[NBA Props Context] No line movement data available (source: ${lineMovementData?.source || 'UNKNOWN'})`);
  }
  
  // Merge RapidAPI injuries with BDL duration enrichment (same pipeline as game picks)
  let injuries = [];
  if (apiInjuries) {
    // RapidAPI returned data — use as source of truth for STATUS
    const allApiInjuries = [...(apiInjuries.home || []), ...(apiInjuries.away || [])];
    console.log(`[NBA Props Context] RapidAPI injuries: ${apiInjuries.home?.length || 0} home, ${apiInjuries.away?.length || 0} away`);

    // Build BDL lookup for duration enrichment
    const bdlMap = new Map();
    for (const inj of bdlInjuries) {
      const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
      if (name) bdlMap.set(name, inj);
    }

    // Enrich each RapidAPI injury with BDL duration data
    injuries = allApiInjuries.map(inj => {
      const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
      let bdlMatch = bdlMap.get(name);
      // Fallback: try last-name-only match
      if (!bdlMatch && inj.player?.last_name) {
        const lastName = inj.player.last_name.toLowerCase();
        for (const [bdlName, bdlInj] of bdlMap) {
          if (bdlName.endsWith(lastName)) { bdlMatch = bdlInj; break; }
        }
      }

      // Apply BDL duration enrichment if matched
      const enrichedInj = { ...inj };
      if (bdlMatch) {
        const desc = bdlMatch.comment || bdlMatch.description || '';
        enrichedInj.description = desc;
        // Parse duration from BDL description (same as game picks scoutReportBuilder)
        const descLower = desc.toLowerCase();
        if (descLower.includes('out for season') || descLower.includes('no timetable') || descLower.includes('at least another month')) {
          enrichedInj.duration = 'SEASON-LONG';
        } else if (descLower.includes('week-to-week') || descLower.includes('several weeks')) {
          enrichedInj.duration = 'MID-SEASON';
        } else if (descLower.includes('day-to-day')) {
          enrichedInj.duration = 'RECENT';
        }
        // Also try "since [month]" pattern for date-based duration
        const sinceMatch = descLower.match(/since\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{1,2})?/i);
        if (sinceMatch) {
          const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
          const monthNum = monthMap[sinceMatch[1].toLowerCase().substring(0, 3)];
          if (monthNum !== undefined) {
            const now = new Date();
            let year = now.getFullYear();
            if (monthNum > now.getMonth()) year -= 1;
            const day = sinceMatch[2] ? parseInt(sinceMatch[2]) : 1;
            const daysSince = Math.floor((now - new Date(year, monthNum, day)) / (1000 * 60 * 60 * 24));
            enrichedInj.daysSinceReport = daysSince;
            if (daysSince >= 30) enrichedInj.duration = 'SEASON-LONG';
            else if (daysSince >= 7) enrichedInj.duration = 'MID-SEASON';
            else enrichedInj.duration = 'RECENT';
          }
        }
      }
      return enrichedInj;
    });
  } else {
    // RapidAPI failed — fall back to BDL only (degraded mode)
    console.warn('[NBA Props Context] RapidAPI failed — using BDL injuries as fallback (degraded)');
    injuries = bdlInjuries;
  }

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
  const formattedInjuries = formatPropsInjuries(injuries);
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
      console.log(`[NBA Props Context] ⚠️ EXCLUDED ${c.player} - Doubtful/Day-To-Day (risk of void bet)`);
    }
    return !isRisky;
  });

  if (availableCandidates.length < validatedCandidates.length) {
    const excluded = validatedCandidates.length - availableCandidates.length;
    console.log(`[NBA Props Context] Filtered out ${excluded} Doubtful/Day-To-Day player(s) to avoid void bets`);
  }

  // NOW fetch player season stats, game logs, AND opponent defense profiles in parallel
  console.log('[NBA Props Context] Fetching BDL player season stats, game logs, and opponent defense...');
  const [playerSeasonStats, playerGameLogs, homeDefenseProfile, awayDefenseProfile] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap),
    // Opponent defense: fetch BOTH teams so we can show "what defense does each player face?"
    homeTeam?.id ? fetchOpponentDefenseProfile(homeTeam.id, season) : Promise.resolve(null),
    awayTeam?.id ? fetchOpponentDefenseProfile(awayTeam.id, season) : Promise.resolve(null)
  ]);

  // Build opponent defense lookup: { home: homeTeamDefProfile, away: awayTeamDefProfile }
  const opponentDefense = { home: homeDefenseProfile, away: awayDefenseProfile };
  if (homeDefenseProfile) {
    console.log(`[NBA Props Context] Home defense (${game.home_team}): DRtg ${homeDefenseProfile.def_rating || 'N/A'}, Pace ${homeDefenseProfile.pace || 'N/A'}, ${homeDefenseProfile.opp_pts || 'N/A'} PPG allowed`);
  }
  if (awayDefenseProfile) {
    console.log(`[NBA Props Context] Away defense (${game.away_team}): DRtg ${awayDefenseProfile.def_rating || 'N/A'}, Pace ${awayDefenseProfile.pace || 'N/A'}, ${awayDefenseProfile.opp_pts || 'N/A'} PPG allowed`);
  }
  
  // Log stats coverage (use available candidates - excludes Doubtful/Day-To-Day)
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = availableCandidates.length;
  console.log(`[NBA Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} players`);
  console.log(`[NBA Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  // B2B (back-to-back) detection - ONLY road B2B is significant for props
  const b2bInfo = await detectBackToBack(teamIds, dateStr);
  if (b2bInfo.significant) {
    // Road B2B - away team traveled yesterday, traveling again tonight
    console.log(`[NBA Props Context] ⚠️ ROAD B2B DETECTED: Away team played yesterday and traveling again tonight`);
  } else if (b2bInfo.home && !b2bInfo.away) {
    // Home team B2B only - minimal impact (they rested at home)
    console.log(`[NBA Props Context] ℹ️ Home team B2B (minimal impact - home rest advantage)`);
  }
  
  // CRITICAL: Detect players likely injured but NOT in BDL injury report
  // This catches cases like Seth Curry (0 minutes since Dec 4, but not in BDL injury API)
  // Note: This makes additional BDL calls to check for 0-minute games
  const detectedInjuries = await detectLikelyInjuredFromStats(playerIdMap, formattedInjuries, validatedCandidates);
  
  // Merge BDL injuries with detected injuries
  const allInjuries = [...formattedInjuries, ...detectedInjuries];
  
  // Log injury report (RapidAPI + BDL enrichment, same as game picks)
  if (formattedInjuries.length > 0) {
    console.log(`[NBA Props Context] Injury Report (${formattedInjuries.length} injuries, source: ${apiInjuries ? 'RapidAPI + BDL enrichment' : 'BDL fallback'}):`);
    formattedInjuries.forEach(inj => {
      console.log(`   - ${inj.player} (${inj.team}) - ${inj.status} [${inj.duration}]`);
    });
  } else {
    console.log(`[NBA Props Context] No injuries reported for these teams`);
  }
  
  // Log detected injuries (from 0 minutes in game logs)
  if (detectedInjuries.length > 0) {
    console.log(`[NBA Props Context] ⚠️ DETECTED ${detectedInjuries.length} additional likely injuries from game logs:`);
    detectedInjuries.forEach(inj => {
      console.log(`   - ${inj.player} - ${inj.status}`);
    });
  }
  
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text with REAL player data, recent form, and opponent defense
  // Use availableCandidates which excludes Doubtful/Day-To-Day players
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    availableCandidates,
    playerSeasonStats,
    playerIdMap,
    allInjuries,  // Use ALL injuries (BDL + detected from 0-minute games)
    playerGameLogs, // Pass game logs for recent form
    opponentDefense // Pass opponent defense profiles for matchup context
  );

  // Build token data with enhanced player info, game logs, and LINE MOVEMENT
  const tokenData = buildPropsTokenSlices(
    playerStats,
    availableCandidates,
    allInjuries,  // Use ALL injuries (BDL + detected from 0-minute games)
    marketSnapshot,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs, // Pass game logs
    lineMovements   // Pass line movement data for Tier 2 Kill Conditions
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
    // B2B detection - ONLY road B2B (away team) is significant for props
    backToBack: {
      home: b2bInfo.home,                    // Home team played yesterday (minimal impact)
      away: b2bInfo.away,                    // Away team played yesterday
      awayRoadB2B: b2bInfo.awayRoadB2B,      // Away team on road B2B (SIGNIFICANT)
      significant: b2bInfo.significant       // TRUE only if away team on road B2B
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
  if (allInjuries.length === 0 && teamIds.length > 0) {
    dataGaps.push(`⚠️ NO INJURIES RETURNED: Neither BDL nor game log detection found injuries`);
  }
  
  if (dataGaps.length > 0) {
    console.warn(`[NBA Props Context] ⚠️ DATA GAPS DETECTED - Gary should proceed with caution:`);
    dataGaps.forEach(gap => console.warn(`   ${gap}`));
  }
  
  console.log(`[NBA Props Context] ✓ Built context:`);
  console.log(`   - ${availableCandidates.length} player candidates (verified on team, excludes Doubtful/Day-To-Day)`);
  console.log(`   - ${playersWithStats} players with season stats (${(statsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${playersWithLogs} players with game logs (${(logsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${allInjuries.length} injuries (${formattedInjuries.length} from ${apiInjuries ? 'RapidAPI' : 'BDL'} + ${detectedInjuries.length} detected from game logs)`);
  console.log(`   - Opponent defense: home=${homeDefenseProfile ? 'YES' : 'NO'}, away=${awayDefenseProfile ? 'YES' : 'NO'}`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);
  console.log(`   - Line movement data: ${lineMovementCount > 0 ? `${lineMovementCount} props tracked` : 'NOT AVAILABLE'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: availableCandidates, // Only return available players (excludes Doubtful/Day-To-Day)
    playerStats,
    playerSeasonStats,
    playerGameLogs, // Include game logs in return
    opponentDefense, // Opponent defense profiles for both teams
    narrativeContext, // CRITICAL: Full raw narrative from Gemini
    // LINE MOVEMENT DATA - for Tier 2 Kill Condition analysis
    lineMovementData: {
      movements: lineMovements,
      count: lineMovementCount,
      source: lineMovementData?.source || 'UNKNOWN',
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 2.0)
    },
    // Structured narrative sections for easy access
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
      hasLineMovementData: lineMovementCount > 0,
      narrativeSectionsFetched: Object.keys(narrativeSections).filter(k => narrativeSections[k]?.length > 10),
      // Data availability flags for Gary to see
      dataAvailability: {
        statsAvailable: playersWithStats > 0,
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: allInjuries.length > 0,
        narrativeAvailable: !!narrativeContext,
        lineMovementAvailable: lineMovementCount > 0,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildNbaPropsAgenticContext
};
