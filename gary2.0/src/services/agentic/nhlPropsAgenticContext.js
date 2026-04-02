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
// Grounding searches use Gemini 3 Flash; main pick pipeline uses 3.1 Pro + Flash (research)
import { 
  formatGameTimeEST, 
  buildMarketSnapshot, 
  parseGameDate, 
  safeApiCallArray,
  safeApiCallObject,
  findBestPlayerMatch,
  checkDataAvailability,
  fixBdlInjuryStatus,
  normalizeTeamName
} from './sharedUtils.js';
import { fetchComprehensivePropsNarrative, fetchPropLineMovement, getPlayerPropMovement } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'icehockey_nhl';

/**
 * Calculate NHL volume metrics for kill condition analysis
 * Focus on PP1 status, TOI, and iCF (individual Corsi For)
 * @param {Object} playerStats - Player season stats from BDL
 * @param {Array} gameLogs - Recent game logs
 * @returns {Object} Volume metrics for this player
 */
function calculateNhlVolumeMetrics(playerStats, gameLogs) {
  if (!playerStats && (!gameLogs || gameLogs.length === 0)) {
    return { hasData: false };
  }
  
  const l5Games = (gameLogs || []).slice(0, 5);
  
  // Total TOI (Time on Ice)
  const toi = playerStats?.toi_per_game || playerStats?.toi || null;
  const toiMinutes = toi ? parseFloat(toi) : null;
  
  // Power Play TOI - this is the KEY metric for NHL props
  const ppToi = playerStats?.pp_toi_per_game || playerStats?.pp_toi || null;
  const ppToiMinutes = ppToi ? parseFloat(ppToi) : null;
  
  // PP1 Status (binary - are they on the first power play unit?)
  // PP1 = ~3+ minutes of PP time typically
  const isPP1 = ppToiMinutes !== null && ppToiMinutes >= 3.0;
  
  // Individual Corsi For (shot attempts, not just SOG)
  // Calculate from game logs if available
  let icfL5 = null;
  if (l5Games.length > 0) {
    const totalShotAttempts = l5Games.reduce((sum, g) => {
      // iCF includes shots on goal + missed shots + blocked shots
      const sog = g.shots || g.sog || 0;
      const missed = g.missed_shots || 0;
      const blocked = g.blocked_shots || 0;
      return sum + sog + missed + blocked;
    }, 0);
    icfL5 = (totalShotAttempts / l5Games.length).toFixed(1);
  } else if (playerStats?.sog_per_game) {
    // Estimate iCF from SOG (typically SOG is ~50-60% of shot attempts)
    icfL5 = (parseFloat(playerStats.sog_per_game) * 1.7).toFixed(1);
  }
  
  // Shots on goal per game from stats or logs
  const sogPerGame = playerStats?.sog_per_game || null;
  
  // Kill condition checks:
  // 1. For SOG props: Not PP1 AND iCF < 5.0 = ABANDON
  // 2. For Points props: Not PP1 AND TOI < 16 min = ABANDON
  // Only trigger kill conditions when PP data IS available (avoid false positives when PP TOI is null)
  const sogKillTriggered = ppToiMinutes !== null && !isPP1 && icfL5 !== null && parseFloat(icfL5) < 5.0;
  const pointsKillTriggered = ppToiMinutes !== null && !isPP1 && toiMinutes !== null && toiMinutes < 16;
  
  return {
    hasData: true,
    toi: toiMinutes,
    ppToi: ppToiMinutes,
    isPP1: isPP1,
    icfL5: icfL5 !== null ? parseFloat(icfL5) : null,
    sogPerGame: sogPerGame ? parseFloat(sogPerGame) : null,
    // Kill conditions for different prop types
    killConditions: {
      sog: {
        triggered: sogKillTriggered,
        reason: sogKillTriggered 
          ? `Not PP1 AND iCF L5 (${icfL5}) < 5.0 threshold`
          : null
      },
      points: {
        triggered: pointsKillTriggered,
        reason: pointsKillTriggered 
          ? `Not PP1 AND TOI (${toiMinutes?.toFixed(1)} min) < 16 min threshold`
          : null
      }
    }
  };
}

/**
 * Calculate hit rate for an NHL player prop against recent game logs
 * Similar to NBA's calculateHitRate — tells Gary "hit O 3.5 SOG in 7/10 games"
 * @param {Array} games - Recent game log entries
 * @param {string} propType - The prop type (e.g., 'player_shots_on_goal')
 * @param {number} line - The line value (e.g., 3.5)
 * @returns {Object|null} Hit rate data
 */
function calculateNhlHitRate(games, propType, line) {
  if (!games || games.length === 0 || line == null) return null;

  const propToField = {
    'player_shots_on_goal': 'sog', 'shots_on_goal': 'sog', 'sog': 'sog',
    'player_goals': 'goals', 'goals': 'goals',
    'player_assists': 'assists', 'assists': 'assists',
    'player_points': 'points', 'points': 'points',
    'player_power_play_points': 'pp_points', 'power_play_points': 'pp_points',
    'player_blocked_shots': 'blocked_shots', 'blocked_shots': 'blocked_shots',
    'player_total_saves': 'saves', 'total_saves': 'saves', 'saves': 'saves',
    'player_goals_scorer': 'goals'
  };

  const field = propToField[propType?.toLowerCase()] || propType;

  let hitsOver = 0, hitsUnder = 0, pushes = 0;
  const values = [];

  for (const game of games) {
    const value = game[field];
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
    values: values.slice(0, 5),
    line: line
  };
}

/**
 * Group props by player for easier analysis
 * FILTERS OUT unpredictable prop types (second_goal, first_goal, period-specific, etc.)
 */
function groupPropsByPlayer(props) {
  const grouped = {};
  
  // Props we CAN analyze (skill-based, predictable with data)
  // EXACT MATCH ONLY - no partial matching to avoid period-specific props slipping through
  const VALID_PROP_TYPES = [
    'shots_on_goal', 'sog', 'shots',
    'points', 'player_points',
    'goals', 'player_goals', 'anytime_goal', 'anytime_scorer',
    'assists', 'player_assists',
    'saves', 'goalie_saves',
    'power_play_points', 'pp_points',
    'blocked_shots', 'blocks',
    'hits'
  ];
  
  // Props we CANNOT analyze (random/luck-based OR period-specific)
  // Period-specific props are unpredictable because timing of goals is random
  const INVALID_PROP_TYPES = [
    // First/second/third/last goal - completely random
    'first_goal', 'first_scorer', '1st_goal',
    'second_goal', 'second_scorer', '2nd_goal',
    'third_goal', 'third_scorer', '3rd_goal',
    'last_goal', 'last_scorer',
    'overtime_goal',
    // Period-specific props - timing is random
    '_1p', '_2p', '_3p',  // e.g., anytime_goal_1p, shots_on_goal_2p
    '1p_', '2p_', '3p_',  // alternative format
    'first_period', 'second_period', 'third_period'
  ];
  
  for (const prop of props) {
    const propType = (prop.prop_type || '').toLowerCase();
    
    // Skip unpredictable prop types (includes period-specific like anytime_goal_2p)
    if (INVALID_PROP_TYPES.some(invalid => propType.includes(invalid))) {
      continue; // Skip this prop entirely
    }
    
    // Only include if it's a valid analyzable prop type
    const isValidType = VALID_PROP_TYPES.some(valid => propType.includes(valid));
    if (!isValidType && propType) {
      console.log(`[NHL Props] Skipping unknown prop type: ${propType}`);
      continue;
    }
    
    const playerName = prop.player || 'Unknown';
    // Handle both snake_case (player_id from propOddsService) and camelCase (playerId)
    const propPlayerId = prop.player_id || prop.playerId || null;
    
    if (!grouped[playerName]) {
      grouped[playerName] = {
        player: playerName,
        team: prop.team || 'Unknown',
        playerId: propPlayerId,
        props: []
      };
    }
    // Store player_id if available (and not already set)
    if (propPlayerId && !grouped[playerName].playerId) {
      grouped[playerName].playerId = propPlayerId;
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
 * Get NHL game total context for prop analysis
 * Categorizes the game total and provides prop implications
 * NHL totals typically range from 5.0 to 7.5
 * 
 * @param {Object} marketSnapshot - Market data with spread and total
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Object} Game environment analysis for props
 */
function getNhlGameTotalContext(marketSnapshot, homeTeam = '', awayTeam = '') {
  const total = parseFloat(marketSnapshot?.total?.line) || null;
  const spread = parseFloat(marketSnapshot?.spread?.home?.point) || 
                 parseFloat(marketSnapshot?.spread?.line) || null;
  
  if (!total) {
    return {
      available: false,
      reason: 'Total not available',
      total: null,
      spread: null,
    };
  }

  // Calculate implied team goals (like NFL/NBA)
  // Formula: Home Implied = (Total - Spread) / 2, Away Implied = (Total + Spread) / 2
  // (NHL spread is puckline, usually -1.5/+1.5, but for implied goals we use spread)
  let homeImplied = total / 2;
  let awayImplied = total / 2;
  
  if (spread !== null) {
    homeImplied = (total - spread) / 2;
    awayImplied = (total + spread) / 2;
  }
  
  // Favorite determination
  let favorite = null;
  let underdog = null;
  if (spread !== null) {
    if (spread < 0) {
      favorite = homeTeam || 'Home';
      underdog = awayTeam || 'Away';
    } else if (spread > 0) {
      favorite = awayTeam || 'Away';
      underdog = homeTeam || 'Home';
    }
  }
  
  return {
    available: true,
    total,
    spread: spread || null,
    favorite,
    underdog,
    impliedGoals: {
      home: { team: homeTeam || 'Home', goals: parseFloat(homeImplied.toFixed(2)) },
      away: { team: awayTeam || 'Away', goals: parseFloat(awayImplied.toFixed(2)) }
    },
    // Sharp betting context
    sharpContext: total >= 6.5
      ? 'Game total is high (6.5+).'
      : total <= 5.5
        ? 'Game total is low (5.5 or less).'
        : 'Game total is average.'
  };
}

/**
 * Get top prop candidates based on line value and odds quality
 * Returns top N players PER TEAM (so 7 per team = 14 total for a game)
 * 
 * FIXED: Now filters to only players on homeTeam or awayTeam
 * This prevents pulling in players from other games when odds API returns multiple games
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 7, homeTeamName = null, awayTeamName = null) {
  const grouped = groupPropsByPlayer(props);
  
  // Normalize team name for matching
  const normalizeTeam = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeam(homeTeamName);
  const awayNorm = normalizeTeam(awayTeamName);
  
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
  
  // CRITICAL FIX: Filter to only players on the two teams in this game
  // The odds API sometimes returns props for multiple games
  let filteredPlayers = scored;
  if (homeNorm && awayNorm) {
    filteredPlayers = scored.filter(player => {
      const playerTeamNorm = normalizeTeam(player.team);
      // Check if player's team matches or contains home/away team name
      return playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm) ||
             playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);
    });
    
    const filteredOut = scored.length - filteredPlayers.length;
    if (filteredOut > 0) {
      console.log(`[NHL Props] Filtered out ${filteredOut} players not on ${homeTeamName} or ${awayTeamName}`);
    }
  }
  
  // Group by team and take top N from each
  // Normalize team names to handle variations
  const byTeam = {};
  for (const player of filteredPlayers) {
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
 * Resolve player IDs from prop data
 * 
 * FIXED: Use the player_id that's already embedded in prop data from BDL.
 * The BDL NHL player search endpoint doesn't work reliably, but the props
 * endpoint returns player IDs directly, so we use those instead of searching.
 * 
 * Returns: { playerName: { id, team } }
 */
async function resolvePlayerIds(propCandidates, teamIds, season, homeTeamName, awayTeamName) {
  const playerIdMap = {}; // name -> { id, team }
  
  if (propCandidates.length === 0) {
    return playerIdMap;
  }
  
  // Normalize team names for matching
  const homeNorm = normalizeTeamName(homeTeamName);
  const awayNorm = normalizeTeamName(awayTeamName);
  const validTeamIds = new Set(teamIds);
  
  // FIXED: Use player IDs that are already in the prop data
  // The BDL NHL player search endpoint returns 0 results, but props have player_id embedded
  let playersWithIds = 0;
  let playersValidated = 0;
  
  for (const candidate of propCandidates) {
    const playerName = candidate.player;
    const playerId = candidate.playerId;
    const playerTeam = candidate.team || '';
    const playerTeamNorm = normalizeTeamName(playerTeam);
    
    // Skip if no player ID from props
    if (!playerId) {
      continue;
    }
    playersWithIds++;
    
    // Validate team: check if player is on home or away team
    const isOnValidTeam = 
      playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm) ||
      playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);
    
    if (isOnValidTeam) {
      playerIdMap[playerName.toLowerCase()] = { id: playerId, team: playerTeam };
      playersValidated++;
    }
  }
  
  console.log(`[NHL Props Context] Validated ${playersValidated}/${propCandidates.length} players against ${homeTeamName} + ${awayTeamName}`);
  console.log(`[NHL Props Context] Players with BDL IDs: ${playersWithIds}/${propCandidates.length}`);
  
  // If we got 0 validated players but had IDs, log the issue
  if (playersValidated === 0 && playersWithIds > 0) {
    const samplePlayers = propCandidates.slice(0, 3).map(c => `${c.player} (${c.team})`).join(', ');
    console.log(`[NHL Props Context] ⚠️ Team matching failed. Sample: ${samplePlayers}`);
    console.log(`[NHL Props Context] ⚠️ Looking for: "${homeTeamName}" or "${awayTeamName}"`);
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
    // Get yesterday's date in EST timezone to match NHL schedule
    const [year, month, day] = gameDate.split('-').map(Number);
    const gameDateEST = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Noon UTC = morning EST
    
    // Yesterday is one day before the game date
    const yesterdayEST = new Date(gameDateEST);
    yesterdayEST.setDate(yesterdayEST.getDate() - 1);
    const yesterdayStr = yesterdayEST.toISOString().slice(0, 10);
    
    console.log(`[NHL Props Context] B2B check: Game date=${gameDate}, checking yesterday=${yesterdayStr}`);

    // Check recent box scores for both teams
    const recentDates = [yesterdayStr];
    const boxScores = await safeApiCallArray(
      () => ballDontLieService.getNhlRecentBoxScores(recentDates, { team_ids: teamIds }),
      `NHL Props: B2B detection box scores for ${yesterdayStr}`
    );

    if (boxScores.length > 0) {
      console.log(`[NHL Props Context] Found ${boxScores.length} box scores from ${yesterdayStr} involving these teams`);

      for (const box of boxScores) {
        const homeId = box.game?.home_team?.id;
        const awayId = box.game?.away_team?.id;
        
        // Today's game: teamIds[0] = home team, teamIds[1] = away team
        const todayHomeId = teamIds[0];
        const todayAwayId = teamIds[1];

        // Check if today's HOME team played yesterday
        if (todayHomeId && (homeId === todayHomeId || awayId === todayHomeId)) {
          result.home = true;
          result.homeLastGame = yesterdayStr;
          // Check if they were AWAY yesterday
          if (awayId === todayHomeId) {
            result.homeRoadB2B = true;
          }
          console.log(`[NHL Props Context] Home team (ID:${todayHomeId}) played yesterday - ${awayId === todayHomeId ? 'AWAY' : 'HOME'}`);
        }

        // Check if today's AWAY team played yesterday - THIS IS THE SIGNIFICANT ONE
        if (todayAwayId && (homeId === todayAwayId || awayId === todayAwayId)) {
          result.away = true;
          result.awayLastGame = yesterdayStr;
          // Away team is on the road TONIGHT, so any B2B is a road B2B for them
          result.awayRoadB2B = true;
          console.log(`[NHL Props Context] ⚠️ AWAY team (ID:${todayAwayId}) on ROAD B2B - played yesterday, traveling again tonight`);
        }
      }
      
      // Only mark as significant if AWAY team is on a road B2B
      result.significant = result.awayRoadB2B;
      
      if (result.home && !result.away) {
        console.log(`[NHL Props Context] Home team B2B only - minimal impact (home rest advantage)`);
      }
    } else {
      console.log(`[NHL Props Context] No games found on ${yesterdayStr} - no B2B situation`);
    }

    return result;
  } catch (e) {
    console.warn('[NHL Props Context] B2B detection failed:', e.message);
    return result;
  }
}

/**
 * Build comprehensive player stats text with actual BDL data
 * ENHANCED: Now includes recent form, consistency, home/away splits, and LEAGUE RANKINGS
 */
function buildPlayerStatsText(homeTeam, awayTeam, advancedStats, propCandidates, playerSeasonStats, playerIdMap, richContext, injuries = [], playerGameLogs = {}, playerLeaderRankings = {}) {
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
  
  // Helper to get league rankings for a player (ENHANCED)
  const getPlayerRankings = (playerName) => {
    const playerId = playerIdMap[playerName.toLowerCase()];
    return playerId ? playerLeaderRankings[playerId] : null;
  };
  
  // Helper to format rankings into a readable string
  const formatRankings = (rankings) => {
    if (!rankings?.rankings) return '';
    const r = rankings.rankings;
    const parts = [];
    if (r.goals?.isTopTen) parts.push(`#${r.goals.rank} goals`);
    if (r.points?.isTopTen) parts.push(`#${r.points.rank} points`);
    if (r.assists?.isTopTen) parts.push(`#${r.assists.rank} assists`);
    if (r.shots?.isTopTen) parts.push(`#${r.shots.rank} shots`);
    return parts.length > 0 ? `  League Rankings: ${parts.join(', ')}\n` : '';
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
      const rankings = getPlayerRankings(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      
      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` ⚠️ INJURED${durationTag}` : '';
      
      if (stats) {
        statsText += `- **${candidate.player}**${injuryFlag}:\n`;
        statsText += `  Season: ${stats.games_played || 0} GP, SOG/G ${stats.shots_per_game || 'N/A'}, G/G ${stats.goals_per_game || 'N/A'}, A/G ${stats.assists_per_game || 'N/A'}, P/G ${stats.points_per_game || 'N/A'}, PP Pts ${stats.power_play_points || 0}, TOI/G ${stats.time_on_ice_per_game || 'N/A'}\n`;
        
        // ENHANCED: Show league rankings if player is top-10 in any category
        statsText += formatRankings(rankings);
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          statsText += `  L${logs.gamesAnalyzed} Avg: SOG ${logs.averages?.sog || 'N/A'}, PTS ${logs.averages?.points || 'N/A'}, G ${logs.averages?.goals || 'N/A'}, A ${logs.averages?.assists || 'N/A'}\n`;
          
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
      const rankings = getPlayerRankings(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      
      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` ⚠️ INJURED${durationTag}` : '';
      
      if (stats) {
        statsText += `- **${candidate.player}**${injuryFlag}:\n`;
        statsText += `  Season: ${stats.games_played || 0} GP, SOG/G ${stats.shots_per_game || 'N/A'}, G/G ${stats.goals_per_game || 'N/A'}, A/G ${stats.assists_per_game || 'N/A'}, P/G ${stats.points_per_game || 'N/A'}, PP Pts ${stats.power_play_points || 0}, TOI/G ${stats.time_on_ice_per_game || 'N/A'}\n`;
        
        // ENHANCED: Show league rankings if player is top-10 in any category
        statsText += formatRankings(rankings);
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          statsText += `  L${logs.gamesAnalyzed} Avg: SOG ${logs.averages?.sog || 'N/A'}, PTS ${logs.averages?.points || 'N/A'}, G ${logs.averages?.goals || 'N/A'}, A ${logs.averages?.assists || 'N/A'}\n`;
          
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
 * Build token slices for prop analysis - enhanced with player stats, game logs,
 * VOLUME METRICS (PP1, TOI, iCF), and LINE MOVEMENT
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, advancedStats, playerSeasonStats, playerIdMap, playerGameLogs = {}, lineMovements = {}, homeTeamName = 'Home', awayTeamName = 'Away') {
  // Enhance prop candidates with their season stats, recent form, VOLUME METRICS, and LINE MOVEMENT
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    const games = logs?.games || [];
    
    // Calculate NHL-specific volume metrics (PP1, TOI, iCF)
    const volumeMetrics = calculateNhlVolumeMetrics(stats, games);
    
    // Calculate line movement and hit rates for each prop
    const propsWithContext = p.props.map(prop => {
      // Look up line movement for this player + prop
      const propKey = `${p.player}_${prop.type}`.toLowerCase().replace(/\s+/g, '_');
      const movement = lineMovements[propKey] || getPlayerPropMovement(lineMovements, p.player, prop.type);

      // Calculate hit rate from recent game logs (like NBA does)
      const hitRate = games.length > 0
        ? calculateNhlHitRate(games, prop.type, prop.line)
        : null;

      // Determine which kill condition applies to this prop type
      const propType = (prop.type || '').toLowerCase();
      let killCondition = null;
      if (propType.includes('sog') || propType.includes('shot')) {
        killCondition = volumeMetrics.killConditions?.sog;
      } else if (propType.includes('points') || propType.includes('goals') || propType.includes('assists')) {
        killCondition = volumeMetrics.killConditions?.points;
      }

      return {
        ...prop,
        // HIT RATE DATA - "hit O 3.5 SOG in 7/10 games"
        hitRate: hitRate ? {
          overRate: hitRate.overRate,
          underRate: hitRate.underRate,
          avgValue: hitRate.avgValue,
          lastValues: hitRate.values,
          line: hitRate.line,
          gamesAnalyzed: hitRate.totalGames
        } : null,
        // LINE MOVEMENT DATA - for Tier 2 Kill Condition analysis
        lineMovement: movement ? {
          open: movement.open,
          current: movement.current,
          direction: movement.direction,
          magnitude: movement.magnitude,
          signal: movement.signal,
          movementNote: movement.magnitude >= 1.5
            ? `Line moved ${movement.direction} ${Math.abs(movement.magnitude)} (${movement.open} -> ${movement.current})`
            : null
        } : { source: 'NOT_FOUND' },
        // Prop-specific kill condition
        killCondition: killCondition || { triggered: false, reason: null }
      };
    });
    
    return {
      player: p.player,
      team: p.team,
      props: propsWithContext, // Now includes line movement and kill conditions!
      // VOLUME METRICS - for Tier 1 Kill Condition analysis
      volumeMetrics: volumeMetrics.hasData ? {
        isPP1: volumeMetrics.isPP1,
        toi: volumeMetrics.toi,
        ppToi: volumeMetrics.ppToi,
        icfL5: volumeMetrics.icfL5,
        sogPerGame: volumeMetrics.sogPerGame
      } : null,
      seasonStats: stats ? {
        gamesPlayed: stats.games_played,
        sogPerGame: stats.shots_per_game,
        goalsPerGame: stats.goals_per_game,
        assistsPerGame: stats.assists_per_game,
        pointsPerGame: stats.points_per_game,
        ppPoints: stats.power_play_points,
        toiPerGame: stats.time_on_ice_per_game
      } : null,
      // Recent form data
      recentForm: logs ? {
        gamesAnalyzed: logs.gamesAnalyzed,
        averages: logs.averages,
        consistency: logs.consistency,
        splits: logs.splits,
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
  
  // Count any kill conditions triggered
  const killConditionsTriggered = enhancedCandidates.filter(c => 
    c.props.some(p => p.killCondition?.triggered)
  ).length;
  
  if (killConditionsTriggered > 0) {
    console.log(`[NHL Props Context] ⚠️ ${killConditionsTriggered} players have Kill Conditions triggered (PP1/TOI)`);
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
    injury_report: {
      notable: injuries.slice(0, 10),
      total_listed: injuries.length
    },
    market_context: marketSnapshot,
    // GAME ENVIRONMENT - Critical for understanding scoring context
    // Similar to NBA's pace/total context and NFL's game script
    game_environment: getNhlGameTotalContext(marketSnapshot, homeTeamName, awayTeamName),
    team_analytics: {
      home: advancedStats?.home_advanced || null,
      away: advancedStats?.away_advanced || null
    },
    goalie_matchup: advancedStats?.goalie_matchup || null,
    five_on_five: advancedStats?.five_on_five || null,
    // LINE MOVEMENT SUMMARY
    lineMovementSummary: {
      totalFound: Object.keys(lineMovements).length,
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 1.5).length
    }
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
  // FIXED: Pass team names to filter out players from other games
  const propCandidates = getTopPropCandidates(playerProps, 7, game.home_team, game.away_team);
  
  // Parallel fetch: injuries, player ID resolution, BDL goalies, narrative context, LINE MOVEMENT
  // IMPORTANT: All context is fetched UPFRONT so Gary knows all factors BEFORE iterations
  console.log('[NHL Props Context] Fetching injuries, player IDs, goalies, narrative, and LINE MOVEMENT...');
  const [injuries, playerIdMap, bdlGoalieData, comprehensiveNarrative, lineMovementData] = await Promise.all([
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
    // Props narrative removed — scout report from game picks (via disk cache) already has context.
    // Line movement removed — no reliable API for opening vs closing lines.
    Promise.resolve(null),
    Promise.resolve({ movements: {}, source: 'DISABLED' })
  ]);
  
  // Log line movement results
  const lineMovements = lineMovementData?.movements || {};
  const lineMovementCount = Object.keys(lineMovements).length;
  if (lineMovementCount > 0) {
    console.log(`[NHL Props Context] ✓ Found ${lineMovementCount} prop line movements from ${lineMovementData.source}`);
  } else {
    console.log(`[NHL Props Context] No line movement data available (source: ${lineMovementData?.source || 'UNKNOWN'})`);
  }
  
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

  // NOW fetch player season stats, game logs, AND leader rankings in parallel (requires player IDs)
  console.log('[NHL Props Context] Fetching BDL player season stats, game logs, and leader rankings...');
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  const [playerSeasonStats, playerGameLogs, playerLeaderRankings] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap),
    ballDontLieService.getNhlPlayerStatsLeaders(season, playerIds)
  ]);
  
  // Log stats coverage (use available candidates - excludes Doubtful/Day-To-Day)
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const playersWithRankings = Object.keys(playerLeaderRankings).length;
  const totalCandidates = availableCandidates.length;
  console.log(`[NHL Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} players`);
  console.log(`[NHL Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);
  console.log(`[NHL Props Context] Player leader rankings: ${playersWithRankings} players have league rankings`);

  // Process BDL goalie data - prioritize BDL (concrete stats) but include Grounding for context
  const goalieInfo = processGoalieData(bdlGoalieData, advancedStats, homeTeam, awayTeam);
  if (goalieInfo.home || goalieInfo.away) {
    console.log(`[NHL Props Context] Goalie info: Home=${goalieInfo.home?.name || 'Unknown'} (${goalieInfo.home?.save_pct || 'N/A'} SV%), Away=${goalieInfo.away?.name || 'Unknown'} (${goalieInfo.away?.save_pct || 'N/A'} SV%)`);
  }

  // B2B (back-to-back) detection - ONLY road B2B is significant for props
  const b2bInfo = await detectBackToBack(teamIds, dateStr);
  if (b2bInfo.significant) {
    // Road B2B - away team traveled yesterday, traveling again tonight
    console.log(`[NHL Props Context] ⚠️ ROAD B2B DETECTED: Away team played yesterday and traveling again tonight`);
  } else if (b2bInfo.home && !b2bInfo.away) {
    // Home team B2B only - minimal impact
    console.log(`[NHL Props Context] ℹ️ Home team B2B (minimal impact - home rest advantage)`);
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
    formattedInjuries, // Pass injuries for injury flagging
    playerGameLogs, // Pass game logs for recent form
    playerLeaderRankings // ENHANCED: League rankings for context
  );

  // Build token data with enhanced player info, game logs, and LINE MOVEMENT
  const tokenData = buildPropsTokenSlices(
    playerStats,
    availableCandidates,
    formattedInjuries,
    marketSnapshot,
    advancedStats,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs, // Pass game logs
    lineMovements,  // Pass line movement data for Tier 2 Kill Conditions
    game.home_team, // Team names for game environment context
    game.away_team
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
  console.log(`   - Line movement data: ${lineMovementCount > 0 ? `${lineMovementCount} props tracked` : 'NOT AVAILABLE'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: availableCandidates, // Only return available players (excludes Doubtful/Day-To-Day)
    playerStats,
    playerSeasonStats,
    playerGameLogs, // Include game logs in return
    narrativeContext, // CRITICAL: Full raw narrative from Gemini
    // LINE MOVEMENT DATA - for Tier 2 Kill Condition analysis
    lineMovementData: {
      movements: lineMovements,
      count: lineMovementCount,
      source: lineMovementData?.source || 'UNKNOWN',
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 1.5)
    },
    // Structured narrative sections for easy access
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
      hasLineMovementData: lineMovementCount > 0,
      narrativeSectionsFetched: Object.keys(narrativeSections).filter(k => narrativeSections[k]?.length > 10),
      // Data availability flags for Gary to see
      dataAvailability: {
        statsAvailable: playersWithStats > 0,
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: formattedInjuries.length > 0,
        narrativeAvailable: !!narrativeContext,
        lineMovementAvailable: lineMovementCount > 0,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildNhlPropsAgenticContext
};
