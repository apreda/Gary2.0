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

const SPORT_KEY = 'americanfootball_nfl';

/**
 * Calculate NFL volume metrics for kill condition analysis
 * Different metrics for WR/TE vs RB
 * @param {Object} playerStats - Player season stats from BDL
 * @param {Array} gameLogs - Recent game logs
 * @param {string} position - Player position (WR, TE, RB, QB)
 * @returns {Object} Volume metrics for this player
 */
function calculateNflVolumeMetrics(playerStats, gameLogs, position) {
  if (!gameLogs || gameLogs.length === 0) {
    return { hasData: false };
  }
  
  const l3Games = gameLogs.slice(0, 3);
  const l5Games = gameLogs.slice(0, 5);
  
  if (['WR', 'TE'].includes(position)) {
    // Calculate target share metrics for receivers
    const totalTeamTargets = l3Games.reduce((sum, g) => sum + (g.team_targets || 30), 0); // Default 30 if not available
    const playerTargets = l3Games.reduce((sum, g) => sum + (g.targets || 0), 0);
    const targetShareL3 = totalTeamTargets > 0 ? ((playerTargets / totalTeamTargets) * 100).toFixed(1) : null;
    
    // Air yards share (for understanding target quality)
    const playerAirYards = l3Games.reduce((sum, g) => sum + (g.air_yards || 0), 0);
    const teamAirYards = l3Games.reduce((sum, g) => sum + (g.team_air_yards || 150), 0); // Default 150
    const airYardsShareL3 = teamAirYards > 0 ? ((playerAirYards / teamAirYards) * 100).toFixed(1) : null;
    
    // Route participation (if available)
    const routeParticipation = playerStats?.route_participation || null;
    const snapPct = playerStats?.snap_pct || null;
    
    // Calculate targets per game L3
    const targetsPerGameL3 = (playerTargets / l3Games.length).toFixed(1);
    
    // Kill condition check: Target share < 15% over L3
    const killTriggered = targetShareL3 !== null && parseFloat(targetShareL3) < 15;
    
    return {
      hasData: true,
      position,
      snapPct,
      routeParticipation,
      targetShareL3: parseFloat(targetShareL3) || null,
      targetsPerGameL3: parseFloat(targetsPerGameL3),
      airYardsShareL3: parseFloat(airYardsShareL3) || null,
      killCondition: {
        triggered: killTriggered,
        reason: killTriggered 
          ? `Target share L3 (${targetShareL3}%) < 15% threshold`
          : null
      }
    };
  }
  
  if (position === 'RB') {
    // Calculate carry share metrics for running backs
    const totalTeamCarries = l3Games.reduce((sum, g) => sum + (g.team_rush_att || 25), 0); // Default 25
    const playerCarries = l3Games.reduce((sum, g) => sum + (g.rush_att || 0), 0);
    const carryShareL3 = totalTeamCarries > 0 ? ((playerCarries / totalTeamCarries) * 100).toFixed(1) : null;
    
    // Red zone opportunity share (for TD props)
    const rzOpportunities = playerStats?.rz_opportunities || null;
    const goalLineCarries = playerStats?.goal_line_carries || null;
    
    // Receiving involvement
    const targetsL3 = l3Games.reduce((sum, g) => sum + (g.targets || 0), 0);
    const targetsPerGameL3 = (targetsL3 / l3Games.length).toFixed(1);
    
    // Carries per game L3
    const carriesPerGameL3 = (playerCarries / l3Games.length).toFixed(1);
    
    // Kill condition check: Carry share < 50% in committee backfield
    const isCommittee = parseFloat(carryShareL3) < 60;
    const killTriggered = carryShareL3 !== null && parseFloat(carryShareL3) < 50;
    
    return {
      hasData: true,
      position,
      snapPct: playerStats?.snap_pct || null,
      carryShareL3: parseFloat(carryShareL3) || null,
      carriesPerGameL3: parseFloat(carriesPerGameL3),
      isCommittee,
      rzOpportunityShare: rzOpportunities,
      goalLineCarryShare: goalLineCarries,
      receivingInvolvement: parseFloat(targetsPerGameL3),
      killCondition: {
        triggered: killTriggered,
        reason: killTriggered 
          ? `Carry share L3 (${carryShareL3}%) < 50% threshold (committee backfield)`
          : null
      }
    };
  }
  
  if (position === 'QB') {
    // QBs have different volume metrics
    const passAttempts = l3Games.reduce((sum, g) => sum + (g.pass_att || 0), 0);
    const passAttemptsPerGame = (passAttempts / l3Games.length).toFixed(1);
    
    return {
      hasData: true,
      position,
      passAttemptsPerGameL3: parseFloat(passAttemptsPerGame),
      killCondition: {
        triggered: false, // QBs typically don't have volume kill conditions
        reason: null
      }
    };
  }
  
  return { hasData: false, position };
}

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
  // NOTE: This must handle BOTH raw Odds API names AND standardized names from propOddsService
  const propToField = {
    // Passing - raw and standardized
    'pass_yds': 'pass_yds',
    'player_pass_yds': 'pass_yds',
    'passing_yards': 'pass_yds',
    'pass_tds': 'pass_tds',
    'player_pass_tds': 'pass_tds',
    'pass_attempts': 'pass_att',
    'player_pass_attempts': 'pass_att',
    'pass_att': 'pass_att',  // Already standardized
    'pass_completions': 'pass_comp',
    'player_pass_completions': 'pass_comp',
    'pass_comp': 'pass_comp',  // Already standardized
    'interceptions': 'interceptions',
    'pass_interceptions': 'interceptions',  // After prefix strip: player_pass_interceptions → pass_interceptions
    'player_pass_interceptions': 'interceptions',
    'longest_pass': 'longest_pass',
    'pass_longest_completion': 'longest_pass',  // After prefix strip
    'player_pass_longest_completion': 'longest_pass',
    
    // Rushing - raw and standardized
    'rush_yds': 'rush_yds',
    'player_rush_yds': 'rush_yds',
    'rushing_yards': 'rush_yds',
    'rush_tds': 'rush_tds',
    'player_rush_tds': 'rush_tds',
    'rush_attempts': 'rush_att',
    'player_rush_attempts': 'rush_att',
    'rush_att': 'rush_att',  // Already standardized
    'longest_rush': 'longest_rush',
    'rush_longest': 'longest_rush',  // After prefix strip: player_rush_longest → rush_longest
    'player_rush_longest': 'longest_rush',
    
    // Receiving - raw and standardized
    'reception_yds': 'rec_yds',
    'player_reception_yds': 'rec_yds',
    'receiving_yards': 'rec_yds',
    'rec_yds': 'rec_yds',  // Already standardized - CRITICAL FIX
    'receptions': 'receptions',
    'player_receptions': 'receptions',
    'reception_tds': 'rec_tds',
    'player_reception_tds': 'rec_tds',
    'rec_tds': 'rec_tds',  // Already standardized
    'longest_reception': 'longest_reception',
    'reception_longest': 'longest_reception',  // After prefix strip: player_reception_longest → reception_longest
    'player_reception_longest': 'longest_reception',
    
    // Combined stats - raw and standardized
    'rush_reception_yds': 'rush_rec_yds',
    'player_rush_reception_yds': 'rush_rec_yds',
    'rush_rec_yds': 'rush_rec_yds',  // Already standardized - CRITICAL FIX
    'pass_rush_yds': 'pass_rush_yds',
    'player_pass_rush_yds': 'pass_rush_yds',
    'pass_rush_rec_yds': 'pass_rush_rec_yds',
    'pass_rush_reception_yds': 'pass_rush_rec_yds',  // After prefix strip
    'player_pass_rush_reception_yds': 'pass_rush_rec_yds',
    
    // TD props (binary - player either scored or didn't)
    'anytime_td': 'total_tds',
    'player_anytime_td': 'total_tds',
    'first_td': 'total_tds',
    '1st_td': 'total_tds',  // After prefix strip: player_1st_td → 1st_td
    'player_1st_td': 'total_tds',
    'last_td': 'total_tds',
    'player_last_td': 'total_tds',
    'tds_over': 'total_tds',
    'player_tds_over': 'total_tds',
    'rush_rec_tds': 'rush_rec_tds',
    'rush_reception_tds': 'rush_rec_tds',  // After prefix strip
    'player_rush_reception_tds': 'rush_rec_tds',
    'pass_rush_reception_tds': 'pass_rush_rec_tds',  // After prefix strip
    'player_pass_rush_reception_tds': 'pass_rush_rec_tds',
    
    // Targets (useful for receptions context)
    'targets': 'targets',
    'receiving_targets': 'targets',
    
    // Defensive props (if BDL game logs have this data)
    'tackles_assists': 'tackles_assists',
    'player_tackles_assists': 'tackles_assists',
    'sacks': 'sacks',
    'player_sacks': 'sacks',
    'solo_tackles': 'solo_tackles',
    'player_solo_tackles': 'solo_tackles',
    
    // Kicker props (if BDL game logs have this data)
    'field_goals': 'field_goals',
    'player_field_goals': 'field_goals',
    'kicking_points': 'kicking_points',
    'player_kicking_points': 'kicking_points',
    'pats': 'pats',
    'player_pats': 'pats'
  };
  
  const field = propToField[propType?.toLowerCase()] || propType;
  
  let hitsOver = 0;
  let hitsUnder = 0;
  let pushes = 0;
  const values = [];
  
  for (const game of games) {
    let value;
    
    // Handle combined props and special calculations
    if (field === 'rush_rec_yds') {
      // Rush + Receiving yards combined
      value = (game.rush_yds || 0) + (game.rec_yds || 0);
    } else if (field === 'pass_rush_yds') {
      // Pass + Rush yards combined (for mobile QBs)
      value = (game.pass_yds || 0) + (game.rush_yds || 0);
    } else if (field === 'pass_rush_rec_yds') {
      // Pass + Rush + Receiving yards combined
      value = (game.pass_yds || 0) + (game.rush_yds || 0) + (game.rec_yds || 0);
    } else if (field === 'total_tds') {
      // Total TDs (rush + receiving + passing) - for anytime TD props
      value = (game.rush_tds || 0) + (game.rec_tds || 0) + (game.pass_tds || 0);
    } else if (field === 'rush_rec_tds') {
      // Rush + Receiving TDs only
      value = (game.rush_tds || 0) + (game.rec_tds || 0);
    } else if (field === 'pass_rush_rec_tds') {
      // Pass + Rush + Receiving TDs combined
      value = (game.pass_tds || 0) + (game.rush_tds || 0) + (game.rec_tds || 0);
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

// TD prop types that should be excluded from regular props runs
const TD_PROP_TYPES = [
  'anytime_td', 'first_td', '1st_td', 'last_td', 'tds_over', 
  'total_tds', 'rush_rec_tds', 'pass_rush_rec_tds', 'player_anytime_td',
  'player_first_td', 'player_1st_td', 'player_last_td', 'player_tds_over'
];

/**
 * Get top prop candidates based on line value and odds quality
 * Returns top N players PER TEAM (so 10 per team = 20 total for a game)
 * 
 * IMPORTANT: Filters props to acceptable odds range (-200 to +250) BEFORE Gary sees them
 * No heavy juice (-201 and worse), no lottery tickets (+251 and higher)
 * 
 * @param {Array} props - All props for the game
 * @param {number} maxPlayersPerTeam - Max players to return per team
 * @param {Object} options - Additional options
 * @param {boolean} options.excludeTdProps - If true, exclude all TD prop types (for regular props runs)
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 10, options = {}) {
  const { excludeTdProps = false } = options;
  const grouped = groupPropsByPlayer(props);
  
  // CRITICAL: Filter props to acceptable odds range BEFORE Gary evaluates them
  // Acceptable range: -200 to +250 (no heavy juice, no lottery tickets)
  const isOddsAcceptable = (odds) => odds >= -200 && odds <= 250;
  
  const filteredGrouped = grouped.map(player => {
    const goodOddsProps = player.props.filter(p => {
      const overOdds = p.over_odds || -110;
      const underOdds = p.under_odds || -110;
      // At least one side must have acceptable odds
      const hasGoodOdds = isOddsAcceptable(overOdds) || isOddsAcceptable(underOdds);
      if (!hasGoodOdds) {
        console.log(`[NFL Props] Filtered out bad odds prop: ${player.player} ${p.type} (${overOdds}/${underOdds}) - outside -200 to +250 range`);
        return false;
      }
      
      // If excludeTdProps is true, filter out all TD prop types
      if (excludeTdProps && TD_PROP_TYPES.includes(p.type?.toLowerCase())) {
        console.log(`[NFL Props] Filtered out TD prop (regular run): ${player.player} ${p.type}`);
        return false;
      }
      
      return true;
    });
    
    return {
      ...player,
      props: goodOddsProps
    };
  }).filter(player => player.props.length > 0); // Remove players with no remaining props
  
  // Score each player by number of props and odds quality
  const scored = filteredGrouped.map(player => {
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
    .slice(0, 15) // Increased slice for more coverage
    .map((injury) => {
      const fixedInj = fixBdlInjuryStatus(injury);
      return {
        player: fixedInj?.player?.full_name || `${fixedInj?.player?.first_name || ''} ${fixedInj?.player?.last_name || ''}`.trim(),
        position: fixedInj?.player?.position_abbreviation || fixedInj?.player?.position || 'Unknown',
        status: fixedInj?.status || 'Unknown',
        description: fixedInj?.comment || fixedInj?.description || '',
        team: fixedInj?.team?.full_name || fixedInj?.player?.team?.full_name || '',
        duration: fixedInj?.duration || 'UNKNOWN',
        isEdge: fixedInj?.isEdge || false
      };
    });
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
 * Extract team standings context for both teams in the game
 * ENHANCED: Provides momentum/strength context (win streak, point differential, records)
 * @param {Array} standings - NFL standings array from BDL
 * @param {string} homeTeamName - Home team name
 * @param {string} awayTeamName - Away team name
 * @returns {Object} - { home: {...}, away: {...} } or nulls if not found
 */
function extractTeamStandingsContext(standings, homeTeamName, awayTeamName) {
  const result = { home: null, away: null };
  
  if (!standings || standings.length === 0) {
    return result;
  }
  
  // Normalize team name for matching
  const normalizeTeam = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeam(homeTeamName);
  const awayNorm = normalizeTeam(awayTeamName);
  
  for (const standing of standings) {
    const teamName = standing.team?.full_name || '';
    const teamNorm = normalizeTeam(teamName);
    
    // Check if this standing matches home or away team
    const isHome = teamNorm === homeNorm || homeNorm.includes(teamNorm) || teamNorm.includes(homeNorm);
    const isAway = teamNorm === awayNorm || awayNorm.includes(teamNorm) || teamNorm.includes(awayNorm);
    
    if (isHome || isAway) {
      const standingData = {
        team: teamName,
        record: standing.overall_record || `${standing.wins || 0}-${standing.losses || 0}`,
        wins: standing.wins || 0,
        losses: standing.losses || 0,
        ties: standing.ties || 0,
        homeRecord: standing.home_record || 'N/A',
        roadRecord: standing.road_record || 'N/A',
        divisionRecord: standing.division_record || 'N/A',
        conferenceRecord: standing.conference_record || 'N/A',
        winStreak: standing.win_streak || 0,
        pointsFor: standing.points_for || 0,
        pointsAgainst: standing.points_against || 0,
        pointDifferential: standing.point_differential || (standing.points_for || 0) - (standing.points_against || 0),
        playoffSeed: standing.playoff_seed || null
      };
      
      if (isHome && !result.home) {
        result.home = standingData;
      }
      if (isAway && !result.away) {
        result.away = standingData;
      }
    }
    
    // Stop if we found both
    if (result.home && result.away) break;
  }
  
  return result;
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
 * BUILD GAME SCRIPT CONTEXT - Critical for Sharp NFL Prop Betting
 * 
 * Sharps use spread/total to project game flow and player volume.
 * This function calculates implied team totals and identifies game script edges.
 * 
 * @param {Object} marketSnapshot - Market data with spread and total
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Object} Game script analysis for prop betting
 */
function buildGameScriptContext(marketSnapshot, homeTeam, awayTeam) {
  const spread = marketSnapshot?.spread?.home?.point;
  const total = marketSnapshot?.total?.line;
  
  // Can't build game script without both spread and total
  if (spread === null || spread === undefined || !total) {
    return {
      available: false,
      reason: 'Spread or total not available'
    };
  }
  
  // Calculate implied team totals
  // Formula: Home Implied = (Total + Spread) / 2, Away Implied = (Total - Spread) / 2
  // Note: Spread is from home perspective (negative = home favored)
  const homeImplied = (total - spread) / 2;
  const awayImplied = (total + spread) / 2;
  
  // Determine favorite
  const favorite = spread < 0 ? 'home' : spread > 0 ? 'away' : 'pick';
  const favoriteTeam = favorite === 'home' ? homeTeam : favorite === 'away' ? awayTeam : 'Neither';
  const underdogTeam = favorite === 'home' ? awayTeam : favorite === 'away' ? homeTeam : 'Neither';
  const spreadAbs = Math.abs(spread);
  
  // Game script projections based on spread size
  let gameScriptProjection = '';
  let passVolumeImpact = '';
  let rushVolumeImpact = '';
  let garbageTimeRisk = false;
  let starterMinutesRisk = false;
  
  if (spreadAbs >= 14) {
    gameScriptProjection = 'BLOWOUT EXPECTED';
    passVolumeImpact = `${underdogTeam} will be forced to throw early and often. ${favoriteTeam} may run clock in 2nd half.`;
    rushVolumeImpact = `${favoriteTeam} heavy rush volume in 2nd half to kill clock. ${underdogTeam} RBs may get abandoned.`;
    garbageTimeRisk = true;
    starterMinutesRisk = true;
  } else if (spreadAbs >= 10) {
    gameScriptProjection = 'LIKELY COMFORTABLE WIN';
    passVolumeImpact = `${underdogTeam} will likely trail and need to pass more. ${favoriteTeam} balanced but may lean run late.`;
    rushVolumeImpact = `${favoriteTeam} should get positive game script for rushing. ${underdogTeam} may abandon run if behind.`;
    garbageTimeRisk = true;
    starterMinutesRisk = false;
  } else if (spreadAbs >= 7) {
    gameScriptProjection = 'FAVORITE SHOULD CONTROL';
    passVolumeImpact = `Standard volume expected. ${underdogTeam} may need to throw more if trailing in 4th.`;
    rushVolumeImpact = `${favoriteTeam} should get decent rushing opportunities with leads.`;
    garbageTimeRisk = false;
    starterMinutesRisk = false;
  } else if (spreadAbs >= 3) {
    gameScriptProjection = 'COMPETITIVE GAME EXPECTED';
    passVolumeImpact = 'Both teams likely to stick to game plan. No major volume shifts expected from game script.';
    rushVolumeImpact = 'Balanced approach likely for both teams throughout.';
    garbageTimeRisk = false;
    starterMinutesRisk = false;
  } else {
    gameScriptProjection = 'TOSS-UP GAME';
    passVolumeImpact = 'Game script unpredictable. Focus on player baselines rather than game flow assumptions.';
    rushVolumeImpact = 'Volume will depend on who takes early lead.';
    garbageTimeRisk = false;
    starterMinutesRisk = false;
  }
  
  // Total-based scoring environment
  let scoringEnvironment = '';
  let passingGameOutlook = '';
  
  if (total >= 52) {
    scoringEnvironment = 'SHOOTOUT EXPECTED';
    passingGameOutlook = 'High total suggests both teams will be throwing. QB and WR props get a boost. Consider OVERS.';
  } else if (total >= 47) {
    scoringEnvironment = 'ABOVE AVERAGE SCORING';
    passingGameOutlook = 'Good scoring environment. Passing game should be active for both teams.';
  } else if (total >= 42) {
    scoringEnvironment = 'AVERAGE SCORING';
    passingGameOutlook = 'Standard NFL game. No major environmental boost or suppression.';
  } else if (total >= 38) {
    scoringEnvironment = 'LOWER SCORING';
    passingGameOutlook = 'Defensive game or poor offenses. Consider UNDERs on passing props. Rushing may be emphasized.';
  } else {
    scoringEnvironment = 'DEFENSIVE STRUGGLE';
    passingGameOutlook = 'Very low total suggests bad weather, elite defenses, or poor offenses. Heavy UNDER lean on passing.';
  }
  
  return {
    available: true,
    spread: {
      line: spread,
      favorite: favoriteTeam,
      underdog: underdogTeam,
      size: spreadAbs,
      isBlowoutRisk: spreadAbs >= 10
    },
    total: {
      line: total,
      environment: scoringEnvironment
    },
    impliedTotals: {
      home: { team: homeTeam, points: parseFloat(homeImplied.toFixed(1)) },
      away: { team: awayTeam, points: parseFloat(awayImplied.toFixed(1)) }
    },
    gameScript: {
      projection: gameScriptProjection,
      passVolumeImpact,
      rushVolumeImpact,
      garbageTimeRisk,
      starterMinutesRisk
    },
    passingGameOutlook,
    // Sharp betting edges from game script
    edges: buildGameScriptEdges(spread, total, homeTeam, awayTeam)
  };
}

/**
 * Identify specific betting edges from game script
 */
function buildGameScriptEdges(spread, total, homeTeam, awayTeam) {
  const edges = [];
  const spreadAbs = Math.abs(spread);
  const favorite = spread < 0 ? homeTeam : awayTeam;
  const underdog = spread < 0 ? awayTeam : homeTeam;
  
  // Big underdog = passing volume spike
  if (spreadAbs >= 10) {
    edges.push({
      type: 'UNDERDOG_PASS_VOLUME',
      team: underdog,
      edge: `${underdog} is a ${spreadAbs}-point underdog. Expect elevated passing attempts. QB pass attempts OVER, WR targets OVER.`,
      confidence: spreadAbs >= 14 ? 'HIGH' : 'MEDIUM'
    });
  }
  
  // Big favorite = clock-killing rush volume
  if (spreadAbs >= 10) {
    edges.push({
      type: 'FAVORITE_RUSH_VOLUME',
      team: favorite,
      edge: `${favorite} is a ${spreadAbs}-point favorite. Expect late-game rushing to kill clock. Lead RB rush attempts OVER.`,
      confidence: spreadAbs >= 14 ? 'HIGH' : 'MEDIUM'
    });
  }
  
  // High total = shootout, pass-happy
  if (total >= 50) {
    edges.push({
      type: 'SHOOTOUT',
      edge: `Total of ${total} suggests a shootout. Both QBs and top receivers get volume boost. Consider passing OVERS.`,
      confidence: total >= 54 ? 'HIGH' : 'MEDIUM'
    });
  }
  
  // Low total = defensive game
  if (total <= 40) {
    edges.push({
      type: 'DEFENSIVE_GAME',
      edge: `Total of ${total} suggests a defensive struggle. Consider passing UNDERS. Rushing may be safer for volume.`,
      confidence: total <= 37 ? 'HIGH' : 'MEDIUM'
    });
  }
  
  // Garbage time risk for favorites
  if (spreadAbs >= 14) {
    edges.push({
      type: 'GARBAGE_TIME_RISK',
      team: favorite,
      edge: `${favorite} starters may sit in 4th quarter if blowout materializes. Be cautious on high lines for ${favorite} skill players.`,
      confidence: 'MEDIUM'
    });
  }
  
  return edges;
}

/**
 * TRUMP CARD DETECTION - Identify Single Overriding Factors
 * 
 * A "trump card" is a single factor so compelling it overrides normal analysis.
 * These are significant factors that directly impact player performance.
 * 
 * @param {Array} injuries - Merged injury list
 * @param {Object} playerGameLogs - Player game logs
 * @param {Array} propCandidates - Prop candidates
 * @param {Object} narrativeSections - Parsed narrative sections
 * @returns {Array} List of identified trump cards
 */
function detectTrumpCards(injuries, playerGameLogs, propCandidates, narrativeSections = {}) {
  const trumpCards = [];
  
  // 1. TARGET VACUUM: Key receiver OUT for first time
  // When WR1 or TE1 is newly out, WR2/WR3 get massive target boost
  const outPlayers = injuries.filter(i => 
    (i.status || '').toLowerCase().includes('out') &&
    ['WR', 'TE', 'RB'].includes(i.position?.toUpperCase())
  );
  
  for (const outPlayer of outPlayers) {
    // Check if this is a RECENT injury (trump card) vs season-long (already priced in)
    const isRecent = (i.duration || '').toUpperCase() !== 'SEASON-LONG' && 
                     !(i.description || '').toLowerCase().includes('season');
    
    if (isRecent) {
      // Find teammates at same position who might benefit
      const team = outPlayer.team;
      const position = outPlayer.position;
      const beneficiaries = propCandidates.filter(c => 
        c.team === team && 
        c.player.toLowerCase() !== outPlayer.player.toLowerCase()
      );
      
      if (beneficiaries.length > 0) {
        trumpCards.push({
          type: 'TARGET_VACUUM',
          severity: 'HIGH',
          player_out: outPlayer.player,
          position: position,
          team: team,
          beneficiaries: beneficiaries.map(b => b.player).slice(0, 3),
          edge: `${outPlayer.player} (${position}) is OUT. Target vacuum creates opportunity for ${beneficiaries.map(b => b.player).slice(0, 2).join(', ')}. RECENT injury = team still adjusting.`,
          action: 'Consider OVERS on remaining pass catchers, especially in target share props.'
        });
      }
    }
  }
  
  // 2. QB CHANGE: Backup QB starting
  // This completely changes the passing game - some receivers do better/worse with different QBs
  const qbNews = narrativeSections?.qb_situation || '';
  if (qbNews.toLowerCase().includes('backup') || 
      qbNews.toLowerCase().includes('first start') ||
      qbNews.toLowerCase().includes('making his first')) {
    trumpCards.push({
      type: 'BACKUP_QB',
      severity: 'HIGH',
      edge: 'Backup QB starting. Offensive scheme will simplify. Check targets go to safety valves (TEs, RBs). Deep shots may decrease.',
      action: 'Consider TE receptions OVER, deep WR yards UNDER, RB targets OVER.'
    });
  }
  
  // 3. WEATHER: DO NOT USE AS A TRUMP CARD
  // Weather forecasts are UNRELIABLE and change frequently.
  // If Gary makes picks based on rain that doesn't happen, the pick is wrong.
  // ONLY flag extreme, day-of confirmed conditions (25+ mph sustained wind)
  // Rain/snow forecasts should be IGNORED - they're too uncertain.
  // 
  // NOTE: Weather is still passed as context but should NOT drive picks.
  
  // 4. REVENGE GAME: Player vs former team
  // Only counts if explicitly mentioned with the player
  const motivationSection = narrativeSections?.motivation || '';
  if (motivationSection.toLowerCase().includes('revenge') ||
      motivationSection.toLowerCase().includes('former team') ||
      motivationSection.toLowerCase().includes('faces his old team')) {
    trumpCards.push({
      type: 'REVENGE_GAME',
      severity: 'MEDIUM',
      edge: 'Revenge game narrative detected. Historical data shows mixed results - validate with actual past performance vs this team.',
      action: 'Soft factor - only actionable if Hard Factors (usage, matchup) also support.'
    });
  }
  
  // 5. USAGE SPIKE: Player's targets/touches trending sharply up in L2
  for (const candidate of propCandidates) {
    const playerId = Object.entries(playerGameLogs).find(([id, logs]) => 
      logs?.playerName?.toLowerCase() === candidate.player.toLowerCase()
    )?.[0];
    
    if (playerId) {
      const logs = playerGameLogs[playerId];
      if (logs?.targetTrend?.trend === 'SPIKE' || logs?.usageTrend?.trend === 'INCREASING') {
        const changeVal = logs.targetTrend?.change || logs.usageTrend?.change || 0;
        if (changeVal >= 30) {
          trumpCards.push({
            type: 'USAGE_SPIKE',
            severity: 'MEDIUM',
            player: candidate.player,
            change: `+${changeVal}%`,
            edge: `${candidate.player} has seen a ${changeVal}%+ increase in usage over last 2 games vs earlier games. Role may have expanded.`,
            action: 'Strong OVER lean if the spike is due to opportunity (teammate injury) rather than random variance.'
          });
        }
      }
    }
  }
  
  return trumpCards;
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
      
      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` ⚠️ INJURED${durationTag}` : '';
      
      statsText += `\n- **${candidate.player}**${injuryFlag}:\n`;
      
      // Add injury context if available (explains WHY stats might be affected)
      const injuryContext = getPlayerInjuryContext(candidate.player);
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
      
      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` ⚠️ INJURED${durationTag}` : '';
      
      statsText += `\n- **${candidate.player}**${injuryFlag}:\n`;
      
      // Add injury context if available (explains WHY stats might be affected)
      const injuryContext = getPlayerInjuryContext(candidate.player);
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
 * NOW INCLUDES: Game Script Context, Trump Cards, Position-Specific Defense,
 * VOLUME METRICS (target share, carry share), and LINE MOVEMENT
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerIdMap, playerGameLogs, defensiveMatchups, shortWeekInfo, weather, gameScriptContext, trumpCards, lineMovements = {}, playerSeasonStats = {}, teamStandings = {}) {
  // Enhance prop candidates with their game log data, VOLUME METRICS, and LINE MOVEMENT
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const logs = playerId ? playerGameLogs[playerId] : null;
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const games = logs?.games || [];
    
    // Determine player position from props (RB, WR, TE, QB)
    const position = inferPositionFromProps(p.props);
    
    // Calculate NFL-specific volume metrics
    const volumeMetrics = calculateNflVolumeMetrics(stats, games, position);
    
    // Calculate hit rate AND line movement for each prop
    const propsWithContext = p.props.map(prop => {
      // Look up line movement for this player + prop
      const propKey = `${p.player}_${prop.type}`.toLowerCase().replace(/\s+/g, '_');
      const movement = lineMovements[propKey] || getPlayerPropMovement(lineMovements, p.player, prop.type);
      
      return {
        ...prop,
        // LINE MOVEMENT DATA - for Tier 2 Kill Condition analysis
        lineMovement: movement ? {
          open: movement.open,
          current: movement.current,
          direction: movement.direction, // "UP" | "DOWN"
          magnitude: movement.magnitude,
          signal: movement.signal, // "MOVED_UP" | "MOVED_DOWN" | "STABLE"
          movementNote: movement.magnitude >= 2.0 
            ? `Line moved ${movement.direction} ${Math.abs(movement.magnitude)} ${prop.type.includes('yds') ? 'yards' : 'points'} (${movement.open} -> ${movement.current})`
            : null
        } : { source: 'NOT_FOUND' }
      };
    });
    
    return {
      player: p.player,
      team: p.team,
      position: position,
      props: propsWithContext, // Now includes line movement!
      // VOLUME METRICS - for Tier 1 Kill Condition analysis
      volumeMetrics: volumeMetrics,
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
        // Target share trending
        targetTrend: logs.targetTrend ? {
          l5Avg: logs.targetTrend.l5Avg,
          l2Avg: logs.targetTrend.l2Avg,
          change: logs.targetTrend.change,
          trend: logs.targetTrend.trend, // SPIKE, DECLINING, STABLE
          gameByGame: logs.targetTrend.gameByGame
        } : null,
        // Usage/snap count proxy
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
  
  // Count any kill conditions triggered
  const killConditionsTriggered = enhancedCandidates.filter(c => 
    c.volumeMetrics?.killCondition?.triggered
  ).length;
  
  if (killConditionsTriggered > 0) {
    console.log(`[NFL Props Context] ⚠️ ${killConditionsTriggered} players have Tier 1 Kill Conditions triggered (volume floor)`);
  }
  
  return {
    player_stats: {
      summary: playerStats.substring(0, 6000), // Increased for comprehensive context
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
    defensive_matchups: defensiveMatchups,
    game_context: {
      shortWeek: shortWeekInfo,
      weather: weather
    },
    // Game Script Context - Critical for Sharp Prop Betting
    game_script: gameScriptContext?.available ? {
      spread: gameScriptContext.spread,
      total: gameScriptContext.total,
      impliedTotals: gameScriptContext.impliedTotals,
      projection: gameScriptContext.gameScript.projection,
      passVolumeImpact: gameScriptContext.gameScript.passVolumeImpact,
      rushVolumeImpact: gameScriptContext.gameScript.rushVolumeImpact,
      garbageTimeRisk: gameScriptContext.gameScript.garbageTimeRisk,
      passingGameOutlook: gameScriptContext.passingGameOutlook,
      edges: gameScriptContext.edges
    } : { available: false },
    // Trump Cards - Single Overriding Factors
    trump_cards: trumpCards || [],
    // LINE MOVEMENT SUMMARY
    lineMovementSummary: {
      totalFound: Object.keys(lineMovements).length,
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 2.0).length
    },
    // ENHANCED: Team Standings for momentum/strength context
    team_standings: teamStandings?.home || teamStandings?.away ? {
      home: teamStandings.home ? {
        team: teamStandings.home.team,
        record: teamStandings.home.record,
        homeRecord: teamStandings.home.homeRecord,
        roadRecord: teamStandings.home.roadRecord,
        winStreak: teamStandings.home.winStreak,
        pointDifferential: teamStandings.home.pointDifferential,
        momentum: teamStandings.home.winStreak >= 3 ? 'HOT' : teamStandings.home.winStreak === 0 && teamStandings.home.losses > teamStandings.home.wins ? 'COLD' : 'NEUTRAL'
      } : null,
      away: teamStandings.away ? {
        team: teamStandings.away.team,
        record: teamStandings.away.record,
        homeRecord: teamStandings.away.homeRecord,
        roadRecord: teamStandings.away.roadRecord,
        winStreak: teamStandings.away.winStreak,
        pointDifferential: teamStandings.away.pointDifferential,
        momentum: teamStandings.away.winStreak >= 3 ? 'HOT' : teamStandings.away.winStreak === 0 && teamStandings.away.losses > teamStandings.away.wins ? 'COLD' : 'NEUTRAL'
      } : null
    } : { available: false }
  };
}

/**
 * Infer player position from their prop types
 */
function inferPositionFromProps(props) {
  const propTypes = (props || []).map(p => p.type?.toLowerCase() || '');
  
  // QB indicators
  if (propTypes.some(t => t.includes('pass_yds') || t.includes('pass_tds') || t.includes('pass_attempts'))) {
    return 'QB';
  }
  
  // RB indicators (rush without receiving primary)
  if (propTypes.some(t => t.includes('rush_yds') || t.includes('rush_att'))) {
    // Check if mostly rushing props
    const rushProps = propTypes.filter(t => t.includes('rush'));
    const recProps = propTypes.filter(t => t.includes('rec') || t.includes('reception'));
    if (rushProps.length >= recProps.length) {
      return 'RB';
    }
  }
  
  // WR/TE indicators (receiving dominant)
  if (propTypes.some(t => t.includes('rec_yds') || t.includes('reception'))) {
    // Could be WR or TE, default to WR (more common)
    return 'WR';
  }
  
  return 'UNKNOWN';
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
  // If regularOnly option is set, exclude TD props (they're handled by separate TD script)
  const propCandidates = getTopPropCandidates(playerProps, 7, { 
    excludeTdProps: options.regularOnly || false 
  });

  // STEP 3: Parallel fetch - COMPREHENSIVE narrative context + BDL injuries + LINE MOVEMENT + STANDINGS
  // IMPORTANT: All context is fetched UPFRONT so Gary knows all factors BEFORE iterations
  console.log('[NFL Props Context] Step 2: Fetching COMPREHENSIVE narrative + BDL injuries + LINE MOVEMENT + STANDINGS...');
  
  const [bdlInjuries, comprehensiveNarrative, lineMovementData, teamStandings] = await Promise.all([
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
    }),
    
    // LINE MOVEMENT - Queries ScoresAndOdds/BettingPros for opening vs current lines
    // This enables Tier 2 Kill Conditions (detecting public chase vs sharp steam)
    fetchPropLineMovement('NFL', dateStr, game.home_team, game.away_team).catch(e => {
      console.warn('[NFL Props Context] Line movement fetch failed:', e.message);
      return { movements: {}, source: 'ERROR' };
    }),
    
    // ENHANCED: Team Standings - Win streak, point differential, records
    // Helps Gary understand team momentum and strength for prop context
    ballDontLieService.getNflStandings(season).catch(e => {
      console.warn('[NFL Props Context] Team standings fetch failed:', e.message);
      return [];
    })
  ]);
  
  // Log line movement results
  const lineMovements = lineMovementData?.movements || {};
  const lineMovementCount = Object.keys(lineMovements).length;
  if (lineMovementCount > 0) {
    console.log(`[NFL Props Context] ✓ Found ${lineMovementCount} prop line movements from ${lineMovementData.source}`);
  } else {
    console.log(`[NFL Props Context] No line movement data available (source: ${lineMovementData?.source || 'UNKNOWN'})`);
  }
  
  // ENHANCED: Process team standings for momentum/strength context
  const teamStandingsContext = extractTeamStandingsContext(
    teamStandings,
    homeTeam?.full_name || game.home_team,
    awayTeam?.full_name || game.away_team
  );
  if (teamStandingsContext.home || teamStandingsContext.away) {
    console.log(`[NFL Props Context] 📊 Team Standings Context:`);
    if (teamStandingsContext.home) {
      console.log(`   - ${teamStandingsContext.home.team}: ${teamStandingsContext.home.record} (${teamStandingsContext.home.homeRecord} home, ${teamStandingsContext.home.roadRecord} road), Streak: ${teamStandingsContext.home.winStreak > 0 ? `W${teamStandingsContext.home.winStreak}` : 'No streak'}, Diff: ${teamStandingsContext.home.pointDifferential > 0 ? '+' : ''}${teamStandingsContext.home.pointDifferential}`);
    }
    if (teamStandingsContext.away) {
      console.log(`   - ${teamStandingsContext.away.team}: ${teamStandingsContext.away.record} (${teamStandingsContext.away.homeRecord} home, ${teamStandingsContext.away.roadRecord} road), Streak: ${teamStandingsContext.away.winStreak > 0 ? `W${teamStandingsContext.away.winStreak}` : 'No streak'}, Diff: ${teamStandingsContext.away.pointDifferential > 0 ? '+' : ''}${teamStandingsContext.away.pointDifferential}`);
    }
  }
  
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
    .filter(inj => riskyStatuses.some(status => (inj.status || '').toLowerCase().includes(status)))
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

  // NEW: Build Game Script Context - Critical for Sharp Prop Betting
  // Calculates implied team totals and identifies game script edges
  const gameScriptContext = buildGameScriptContext(
    marketSnapshot,
    homeTeam?.full_name || game.home_team,
    awayTeam?.full_name || game.away_team
  );
  
  if (gameScriptContext.available) {
    console.log(`[NFL Props Context] 📊 Game Script: ${gameScriptContext.gameScript.projection}`);
    console.log(`   - Spread: ${gameScriptContext.spread.favorite} -${gameScriptContext.spread.size}`);
    console.log(`   - Total: ${gameScriptContext.total.line} (${gameScriptContext.total.environment})`);
    console.log(`   - Implied: ${gameScriptContext.impliedTotals.home.team} ${gameScriptContext.impliedTotals.home.points} | ${gameScriptContext.impliedTotals.away.team} ${gameScriptContext.impliedTotals.away.points}`);
    if (gameScriptContext.edges.length > 0) {
      console.log(`   - Sharp Edges Identified: ${gameScriptContext.edges.length}`);
    }
  }

  // NEW: Detect Trump Cards - Single Overriding Factors
  // These are significant factors that directly impact player performance
  const trumpCards = detectTrumpCards(
    mergedInjuries,
    playerGameLogs,
    availableCandidates,
    narrativeSections
  );
  
  if (trumpCards.length > 0) {
    console.log(`[NFL Props Context] 🃏 TRUMP CARDS DETECTED: ${trumpCards.length}`);
    trumpCards.forEach(tc => {
      console.log(`   - ${tc.type}: ${tc.edge.substring(0, 80)}...`);
    });
  }

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

  // Build token data with enhanced info - NOW INCLUDES Game Script, Trump Cards, LINE MOVEMENT, STANDINGS
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
    weather,
    gameScriptContext, // Game script analysis
    trumpCards, // Trump card factors
    lineMovements, // Line movement data for Tier 2 Kill Conditions
    {}, // Player season stats (populated in NFL separately)
    teamStandingsContext // ENHANCED: Team standings for momentum/strength context
  );

  // Build game summary with all context - NOW INCLUDES Game Script & Trump Cards
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
    // NEW: Game Script Analysis - Critical for Sharp Props
    gameScript: gameScriptContext?.available ? {
      projection: gameScriptContext.gameScript.projection,
      spread: {
        line: gameScriptContext.spread.line,
        favorite: gameScriptContext.spread.favorite,
        underdog: gameScriptContext.spread.underdog,
        isBlowoutRisk: gameScriptContext.spread.isBlowoutRisk
      },
      total: {
        line: gameScriptContext.total.line,
        environment: gameScriptContext.total.environment
      },
      impliedTotals: gameScriptContext.impliedTotals,
      passVolumeImpact: gameScriptContext.gameScript.passVolumeImpact,
      rushVolumeImpact: gameScriptContext.gameScript.rushVolumeImpact,
      garbageTimeRisk: gameScriptContext.gameScript.garbageTimeRisk,
      passingGameOutlook: gameScriptContext.passingGameOutlook,
      // Sharp edges identified from game script
      edges: gameScriptContext.edges
    } : null,
    // NEW: Trump Cards - Single Overriding Factors
    trumpCards: trumpCards.length > 0 ? trumpCards : null,
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
  console.log(`   - Line movement data: ${lineMovementCount > 0 ? `${lineMovementCount} props tracked` : 'NOT AVAILABLE'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: availableCandidates, // Only return available players (excludes Doubtful/Out)
    playerStats,
    playerGameLogs,
    injuries: mergedInjuries, // Include merged injuries
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
      hasLineMovementData: lineMovementCount > 0,
      narrativeSectionsFetched: Object.keys(narrativeSections).filter(k => narrativeSections[k]?.length > 10),
      // Data availability flags for Gary to see
      dataAvailability: {
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: mergedInjuries.length > 0,
        weatherAvailable: !!weather,
        narrativeAvailable: !!narrativeContext,
        lineMovementAvailable: lineMovementCount > 0,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildNflPropsAgenticContext
};
