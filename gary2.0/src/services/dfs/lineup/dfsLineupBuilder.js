import { PLATFORM_CONSTRAINTS, PIVOT_TIERS, SALARY_TIER_LABELS, getSalaryAwareTierLabel, PUNT_SALARY_THRESHOLD, PUNT_AWARENESS, GARY_SHARP_KNOWLEDGE, LINEUP_ARCHETYPES, ANTI_CORRELATION_RULES, GPP_VALUE_TARGETS } from './dfsConstants.js';
import { identifyBuildType, reflectOnBuild, generateReflectionNotes, calculateValueScore, calculateCeilingScore, calculateFloorScore, calculateConsistencyRating, determineRecentForm, calculateGPPValueTarget, isSmashSpot, calculateDFSMetrics, calculateOpportunityScore, applyOpportunityBoost, isPositionEligible, getEligibleSlots, getPlayerEligibleSlots, selfReviewLineup, validatePuntCount, checkAntiCorrelation, applyChalkFadeStrategy, validateLineup } from './dfsValidation.js';

export 
/**
 * Calculate fantasy points projection for a player
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {number} Projected fantasy points
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SLATE CHARACTERISTIC ANALYSIS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Gary investigates the slate to determine the optimal strategy organically.
 * This is AWARENESS - Gary looks at the data and decides, not a forced rule.
 * 
 * Factors Gary considers:
 * - Elite value opportunities (high ceiling + reasonable salary)
 * - Cheap chalk availability (low salary players with high floor)
 * - Mid-tier depth (solid options in $5k-$8k range)
 * - Injury landscape (usage opportunities)
 * - Vegas totals (shootout potential)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
function analyzeSlateCharacteristics(players, constraints, sport, isGPP) {
  const { salaryCap } = constraints;
  
  // Define salary tiers based on platform
  const eliteThreshold = sport === 'NBA' ? 9000 : 7500;
  const midTierMin = sport === 'NBA' ? 5500 : 5000;
  const midTierMax = sport === 'NBA' ? 8500 : 7000;
  const cheapThreshold = sport === 'NBA' ? 4500 : 4000;
  
  // Categorize players by tier
  const elitePlayers = players.filter(p => (p.salary || 0) >= eliteThreshold);
  const midTierPlayers = players.filter(p => {
    const sal = p.salary || 0;
    return sal >= midTierMin && sal < midTierMax;
  });
  const cheapPlayers = players.filter(p => (p.salary || 0) > 0 && (p.salary || 0) < cheapThreshold);
  
  // Calculate value scores for each tier
  const eliteValue = elitePlayers.filter(p => {
    const pts = p.projected_pts || 0;
    const val = pts / ((p.salary || 9000) / 1000);
    return val >= 5.0; // Elite player with 5x+ value is exceptional
  });
  
  const cheapChalk = cheapPlayers.filter(p => {
    const pts = p.projected_pts || 0;
    const val = pts / ((p.salary || 4000) / 1000);
    return val >= 5.5; // Cheap player with 5.5x+ value is chalk
  });
  
  const midTierDepth = midTierPlayers.filter(p => {
    const pts = p.projected_pts || 0;
    const val = pts / ((p.salary || 6000) / 1000);
    return val >= 4.5; // Solid mid-tier value
  });
  
  // Check for injury-based opportunities
  const usageOpportunities = players.filter(p => 
    p.teammateOpportunity || p.rotation_status === 'expanded_role' || p.isBreakoutCandidate
  );
  
  // Build analysis result
  const analysis = {
    hasEliteValue: eliteValue.length >= 2,
    hasCheapChalk: cheapChalk.length >= 3,
    hasMidTierDepth: midTierDepth.length >= 5,
    hasUsageOpportunities: usageOpportunities.length >= 2,
    eliteCount: eliteValue.length,
    cheapChalkCount: cheapChalk.length,
    midTierCount: midTierDepth.length,
    usageCount: usageOpportunities.length,
    reasoning: ''
  };
  
  // Build reasoning string for logging
  const reasons = [];
  if (analysis.hasEliteValue && analysis.hasCheapChalk) {
    reasons.push(`${analysis.eliteCount} elite values + ${analysis.cheapChalkCount} cheap chalk → Stars & Scrubs favored`);
  }
  if (analysis.hasMidTierDepth) {
    reasons.push(`${analysis.midTierCount} quality mid-tier options → Balanced viable`);
  }
  if (analysis.hasUsageOpportunities) {
    reasons.push(`${analysis.usageCount} injury-based opportunities detected`);
  }
  
  analysis.reasoning = reasons.join(' | ') || 'Standard slate, balanced approach recommended';
  
  return analysis;
}

/**
 * Calculate basic projected points for a player
 * @param {Object} player - Player object
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Projected fantasy points
 */


/**
 * Calculate basic projected points for a player
 * @param {Object} player - Player object
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Projected fantasy points
 */
export function calculateProjectedPoints(player, sport, platform, contestType = 'cash') {
  // ═══════════════════════════════════════════════════════════════════════════
  // STAR RETURNING USAGE REDUCTION
  // ═══════════════════════════════════════════════════════════════════════════
  // When a star returns from injury, role players who benefited LOSE usage.
  // Example: Embiid returns → Maxey's usage drops from 35% to 28%
  // This is the OPPOSITE of injury boost - we must reduce projections
  // ═══════════════════════════════════════════════════════════════════════════
  let usageMultiplier = 1.0;
  
  if (player.starReturning) {
    usageMultiplier = player.starReturning.usageMultiplier || 0.85; // Default 15% reduction
    const reductionPct = ((1 - usageMultiplier) * 100).toFixed(0);
    const restrictionInfo = player.starReturning.minutesRestriction 
      ? ` [${player.starReturning.minutesRestriction}]` 
      : player.starReturning.impactSeverity === 'partial' 
        ? ' [expected ramping]' 
        : '';
    console.log(`[Projection] ⚠️ ${player.name}: Star returning (${player.starReturning.star})${restrictionInfo} → usage reduction ${reductionPct}%`);
  }
  
  if (player.roleEnded) {
    usageMultiplier = 0.75; // 25% reduction for ended roles
    console.log(`[Projection] ⚠️ ${player.name}: Role ended → ${player.roleEnded.reason}`);
  }
  
  // ⭐ If BDL already provided fantasy points, use them (most accurate)
  const bdlFpts = player.seasonStats?.fpts || player.fpts || 0;
  if (bdlFpts > 0) {
    // BDL uses DraftKings scoring - adjust for FanDuel if needed
    let baseProjection = bdlFpts;
    if (platform === 'fanduel' && sport === 'NBA') {
      // FanDuel values steals/blocks higher (3 pts vs 2 pts)
      // Rough adjustment: +5% for defensive players
      const spg = player.seasonStats?.spg || 0;
      const bpg = player.seasonStats?.bpg || 0;
      if (spg + bpg >= 2) {
        baseProjection = bdlFpts * 1.05;
      }
    }
    // Apply usage multiplier for star returning scenarios
    return Math.round(baseProjection * usageMultiplier * 10) / 10;
  }
  
  if (sport === 'NBA') {
    const projection = calculateNBAProjection(player, platform);
    // ═══════════════════════════════════════════════════════════════════════════
    // NO FALLBACKS - BDL has stats for ALL players including rookies
    // If projection is 0, it's a BUG in our code that needs fixing
    // ═══════════════════════════════════════════════════════════════════════════
    if (projection === 0 && player.salary > 0) {
      // This is a BUG - BDL has stats for everyone. Log for debugging.
      console.error(`[Projection] 🐛 BUG: ${player.name} (${player.team}) has $${player.salary} salary but 0 projection!`);
      console.error(`[Projection]    → Check: 1) Player name matching  2) BDL fetch logic  3) Season param`);
      console.error(`[Projection]    → Stats: ppg=${player.seasonStats?.ppg}, mpg=${player.seasonStats?.mpg}`);
      // Return 0 - don't use this player until the bug is fixed
      return 0;
    }
    return projection;
  } else if (sport === 'NFL') {
    const projection = calculateNFLProjection(player, platform);
    if (projection === 0 && player.salary > 0) {
      console.error(`[Projection] 🐛 BUG: ${player.name} (${player.team}) has $${player.salary} salary but 0 projection!`);
      return 0;
    }
    return projection;
  }
  return 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SALARY-BASED PROJECTION ESTIMATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When a player has salary but no stats (e.g., not in BDL yet, injury return),
 * we estimate their projection based on their DFS salary tier.
 * 
 * DFS sites set salaries based on their own projections, so:
 * - $10,000+ player = site expects ~50+ fantasy points
 * - $7,000 player = site expects ~35 fantasy points
 * - $4,000 player = site expects ~20 fantasy points
 * - $3,000 player = site expects ~15 fantasy points (minimum)
 * 
 * For GPP, we use a higher multiplier (6.5x for NBA) to reflect winning potential.
 * 
 * @param {number} salary - Player's DFS salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Estimated fantasy points
 */

export 
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SALARY-BASED PROJECTION ESTIMATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When a player has salary but no stats (e.g., not in BDL yet, injury return),
 * we estimate their projection based on their DFS salary tier.
 * 
 * DFS sites set salaries based on their own projections, so:
 * - $10,000+ player = site expects ~50+ fantasy points
 * - $7,000 player = site expects ~35 fantasy points
 * - $4,000 player = site expects ~20 fantasy points
 * - $3,000 player = site expects ~15 fantasy points (minimum)
 * 
 * For GPP, we use a higher multiplier (6.5x for NBA) to reflect winning potential.
 * 
 * @param {number} salary - Player's DFS salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Estimated fantasy points
 */
function estimateProjectionFromSalary(salary, sport, platform, contestType = 'cash') {
  if (!salary || salary <= 0) return 0;
  
  const isGPP = contestType === 'gpp';
  
  // Different salary ranges for each platform/sport
  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE MULTIPLIER FIX: NBA players typically return 4-6x their salary in FPTS
  // Example: $8,000 player should project for ~40-48 FPTS (5x-6x)
  // Previous formula was using 2x which severely undervalued all players
  // ═══════════════════════════════════════════════════════════════════════════
  let baseSalary, baseProjection, valueMultiplier;
  
  if (sport === 'NBA') {
    if (platform === 'fanduel') {
      // FanDuel NBA: $3,500 min, $60,000 cap, 9 players
      // GPP WINNING TARGET: 360+ points → 40 FPTS/player average
      // Cash TARGET: 270 points → 30 FPTS/player average
      baseSalary = 3500;
      baseProjection = isGPP ? 20 : 15; // Min-salary punt plays: 15-20 FPTS
      valueMultiplier = isGPP ? 6.5 : 5.0; // GPP winners average 6-7x value
    } else {
      // DraftKings NBA: $3,000 min, $50,000 cap, 8 players
      // GPP WINNING TARGET: 370+ points → 46 FPTS/player average
      // Cash TARGET: 280 points → 35 FPTS/player average
      baseSalary = 3000;
      baseProjection = isGPP ? 18 : 12; // Min-salary punt plays: 12-18 FPTS
      valueMultiplier = isGPP ? 7.0 : 5.5; // GPP winners average 6-7x value
    }
  } else { // NFL
    if (platform === 'fanduel') {
      // FanDuel NFL: $60,000 cap, 9 players
      // GPP WINNING TARGET: 200+ points
      baseSalary = 5000;
      baseProjection = isGPP ? 15 : 10; 
      valueMultiplier = isGPP ? 4.5 : 3.0;
    } else {
      // DraftKings NFL: $50,000 cap, 9 players
      // GPP WINNING TARGET: 220+ points
      baseSalary = 4000;
      baseProjection = isGPP ? 14 : 8;
      valueMultiplier = isGPP ? 5.0 : 3.5;
    }
  }
  
  // Calculate estimated projection based on salary tier
  const salaryDiff = salary - baseSalary;
  const estimatedPts = baseProjection + (salaryDiff / 1000) * valueMultiplier;
  
  // Ensure minimum floor (cheap players still produce something)
  const minFloor = sport === 'NBA' ? (isGPP ? 12.0 : 8.0) : (isGPP ? 5.0 : 3.0);
  
  return Math.round(Math.max(estimatedPts, minFloor) * 10) / 10;
}

/**
 * NBA fantasy points calculation
 * 
 * DraftKings NBA Scoring:
 * - Point: 1 pt
 * - 3-Point Made: +0.5 bonus
 * - Rebound: 1.25 pts
 * - Assist: 1.5 pts
 * - Steal: 2 pts
 * - Block: 2 pts
 * - Turnover: -0.5 pts
 * - Double-Double: +1.5 bonus
 * - Triple-Double: +3 bonus
 * 
 * FanDuel NBA Scoring:
 * - Point: 1 pt
 * - Rebound: 1.2 pts
 * - Assist: 1.5 pts
 * - Steal: 3 pts (higher than DK!)
 * - Block: 3 pts (higher than DK!)
 * - Turnover: -1 pt (more punishing)
 * - No DD/TD bonuses
 */

export 
/**
 * NBA fantasy points calculation
 * 
 * DraftKings NBA Scoring:
 * - Point: 1 pt
 * - 3-Point Made: +0.5 bonus
 * - Rebound: 1.25 pts
 * - Assist: 1.5 pts
 * - Steal: 2 pts
 * - Block: 2 pts
 * - Turnover: -0.5 pts
 * - Double-Double: +1.5 bonus
 * - Triple-Double: +3 bonus
 * 
 * FanDuel NBA Scoring:
 * - Point: 1 pt
 * - Rebound: 1.2 pts
 * - Assist: 1.5 pts
 * - Steal: 3 pts (higher than DK!)
 * - Block: 3 pts (higher than DK!)
 * - Turnover: -1 pt (more punishing)
 * - No DD/TD bonuses
 */
function calculateNBAProjection(player, platform) {
  const stats = player.seasonStats || player;
  const ppg = stats.ppg || stats.pts || 0;
  const rpg = stats.rpg || stats.reb || 0;
  const apg = stats.apg || stats.ast || 0;
  const spg = stats.spg || stats.stl || 0;
  const bpg = stats.bpg || stats.blk || 0;
  // Only apply turnover penalty if we have actual stats
  const hasStats = ppg > 0 || rpg > 0 || apg > 0;
  const topg = hasStats ? (stats.topg || stats.turnover || 1.5) : 0;
  const tpm = stats.tpg || stats.fg3m || 0; // 3-pointers made per game
  
  // If no stats at all, this is a DATA BUG - BDL has stats for all NBA players
  // including rookies (via Game Player Stats endpoint)
  if (!hasStats) {
    // Don't silently return 0 - flag this as a bug to investigate
    console.error(`[DFS] 🐛 NO STATS: ${player.name} (${player.team}) - BDL should have game logs for everyone!`);
    console.error(`[DFS]    → Check: getPlayerStats/getSeasonAverages, player ID matching, season=2025`);
    return 0;
  }
  
  if (platform === 'draftkings') {
    // DK: +0.5 for each 3PM, DD/TD bonuses
    let pts = ppg + (tpm * 0.5) + (rpg * 1.25) + (apg * 1.5) + (spg * 2) + (bpg * 2) - (topg * 0.5);
    
    // Double-Double bonus estimate (if 2+ categories hit 10+)
    const ddCategories = [ppg >= 10, rpg >= 10, apg >= 10, spg >= 10, bpg >= 10].filter(Boolean).length;
    if (ddCategories >= 2) pts += 1.5;
    if (ddCategories >= 3) pts += 1.5; // Triple-double adds another +1.5 (total +3)
    
    return Math.round(pts * 10) / 10;
  } else {
    // FanDuel: Steals/Blocks worth 3 pts, TO -1, no bonuses
    // This makes defensive specialists MORE valuable on FD (e.g., Wembanyama)
    return Math.round((ppg + (rpg * 1.2) + (apg * 1.5) + (spg * 3) + (bpg * 3) - topg) * 10) / 10;
  }
}

/**
 * NFL fantasy points calculation
 * 
 * ⚠️ CRITICAL: BDL returns SEASON TOTALS for TDs/receptions, not per-game!
 * We must divide by games_played to get per-game projections.
 * 
 * DraftKings NFL Scoring (Full PPR):
 * - Passing TD: 4 pts
 * - Passing Yards: 1 pt per 25 yds (0.04/yd)
 * - Interception: -1 pt
 * - Rushing TD: 6 pts
 * - Rushing Yards: 1 pt per 10 yds (0.1/yd)
 * - Reception: 1 pt (Full PPR)
 * - Receiving TD: 6 pts
 * - Receiving Yards: 1 pt per 10 yds
 * - Fumble Lost: -1 pt
 * - 300+ Passing Yards Bonus: +3 pts
 * - 100+ Rushing Yards Bonus: +3 pts
 * - 100+ Receiving Yards Bonus: +3 pts
 * 
 * FanDuel NFL Scoring (Half PPR):
 * - Same as DK EXCEPT:
 * - Reception: 0.5 pts (Half PPR)
 * - Fumble Lost: -2 pts (more punishing)
 * - NO yardage bonuses
 */

export 
/**
 * NFL fantasy points calculation
 * 
 * ⚠️ CRITICAL: BDL returns SEASON TOTALS for TDs/receptions, not per-game!
 * We must divide by games_played to get per-game projections.
 * 
 * DraftKings NFL Scoring (Full PPR):
 * - Passing TD: 4 pts
 * - Passing Yards: 1 pt per 25 yds (0.04/yd)
 * - Interception: -1 pt
 * - Rushing TD: 6 pts
 * - Rushing Yards: 1 pt per 10 yds (0.1/yd)
 * - Reception: 1 pt (Full PPR)
 * - Receiving TD: 6 pts
 * - Receiving Yards: 1 pt per 10 yds
 * - Fumble Lost: -1 pt
 * - 300+ Passing Yards Bonus: +3 pts
 * - 100+ Rushing Yards Bonus: +3 pts
 * - 100+ Receiving Yards Bonus: +3 pts
 * 
 * FanDuel NFL Scoring (Half PPR):
 * - Same as DK EXCEPT:
 * - Reception: 0.5 pts (Half PPR)
 * - Fumble Lost: -2 pts (more punishing)
 * - NO yardage bonuses
 */
function calculateNFLProjection(player, platform) {
  const stats = player.seasonStats || player;
  const position = (player.position || '').toUpperCase();
  
  // ⭐ CRITICAL FIX: BDL returns SEASON TOTALS for TDs/receptions
  // We must divide by games_played to get per-game averages
  const gamesPlayed = stats.games_played || 16; // Default to 16 if not specified
  
  // QB scoring
  if (position === 'QB') {
    // Yards per game (already per-game from BDL)
    const passYpg = stats.passing_yards_per_game || 0;
    const rushYpg = stats.rushing_yards_per_game || 0;
    
    // TDs and INTs are SEASON TOTALS - convert to per-game
    const passTdPg = (stats.passing_touchdowns || 0) / gamesPlayed;
    const intsPg = (stats.passing_interceptions || 0) / gamesPlayed;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const fumblesLostPg = (stats.rushing_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (passYpg * 0.04) + (passTdPg * 4) - (intsPg * 1) + (rushYpg * 0.1) + (rushTdPg * 6);
    
    if (platform === 'draftkings') {
      pts -= (fumblesLostPg * 1);
      // 300+ passing yards bonus (approximate based on average)
      if (passYpg >= 300) pts += 3;
      if (rushYpg >= 100) pts += 3;
    } else {
      // FanDuel: -2 per fumble lost, no bonuses
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // RB scoring
  if (position === 'RB') {
    // Yards per game (already per-game from BDL)
    const rushYpg = stats.rushing_yards_per_game || 0;
    const recYpg = stats.receiving_yards_per_game || 0;
    
    // Season totals - convert to per-game
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.rushing_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (rushYpg * 0.1) + (rushTdPg * 6) + (recYpg * 0.1) + (recTdPg * 6);
    
    if (platform === 'draftkings') {
      pts += (recPg * 1); // Full PPR
      pts -= (fumblesLostPg * 1);
      if (rushYpg >= 100) pts += 3;
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5); // Half PPR
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // WR scoring
  if (position === 'WR') {
    // Yards per game (already per-game from BDL)
    const recYpg = stats.receiving_yards_per_game || 0;
    const rushYpg = stats.rushing_yards_per_game || 0;
    
    // Season totals - convert to per-game
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.receiving_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (recYpg * 0.1) + (recTdPg * 6) + (rushYpg * 0.1) + (rushTdPg * 6);
    
    if (platform === 'draftkings') {
      pts += (recPg * 1); // Full PPR - makes slot receivers valuable
      pts -= (fumblesLostPg * 1);
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5); // Half PPR - favors TD threats over volume
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // TE scoring (same as WR)
  if (position === 'TE') {
    // Yards per game (already per-game from BDL)
    const recYpg = stats.receiving_yards_per_game || 0;
    
    // Season totals - convert to per-game
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.receiving_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (recYpg * 0.1) + (recTdPg * 6);
    
    if (platform === 'draftkings') {
      pts += (recPg * 1);
      pts -= (fumblesLostPg * 1);
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5);
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // DST scoring (simplified)
  if (position === 'DST' || position === 'DEF') {
    // Base 8 pts - DST projections vary widely by matchup
    return 8.0;
  }
  
  // K (Kicker) - FanDuel only
  if (position === 'K') {
    // Kickers average ~8 pts per game
    return 8.0;
  }
  
  // Default fallback for unknown positions
  const rushYpg = stats.rushing_yards_per_game || 0;
  const recYpg = stats.receiving_yards_per_game || 0;
  const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
  const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
  const recPg = (stats.receptions || 0) / gamesPlayed;
  
  if (platform === 'draftkings') {
    return Math.round((rushYpg * 0.1 + rushTdPg * 6 + recYpg * 0.1 + recTdPg * 6 + recPg * 1) * 10) / 10;
  } else {
    return Math.round((rushYpg * 0.1 + rushTdPg * 6 + recYpg * 0.1 + recTdPg * 6 + recPg * 0.5) * 10) / 10;
  }
}

/**
 * Find pivot alternatives for a position
 * @param {Object} starter - The starter player at this position
 * @param {Array} playerPool - All available players for this position
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} 3 pivot alternatives (direct, mid, budget)
 */


/**
 * Find pivot alternatives for a position
 * @param {Object} starter - The starter player at this position
 * @param {Array} playerPool - All available players for this position
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} 3 pivot alternatives (direct, mid, budget)
 */
export function findPivotAlternatives(starter, playerPool, sport, platform) {
  const starterSalary = starter.salary;
  const pivots = [];
  const usedPlayers = new Set(); // Track already-selected pivot players to avoid duplicates
  
  // Filter out the starter and players who are OUT
  const eligiblePlayers = playerPool.filter(p => 
    p.name !== starter.player && 
    p.status !== 'OUT' &&
    p.salary > 0
  );
  
  // Sort by projected points descending
  const sortedPool = eligiblePlayers.sort((a, b) => {
    const ptsA = a.projected_pts || calculateProjectedPoints(a, sport, platform);
    const ptsB = b.projected_pts || calculateProjectedPoints(b, sport, platform);
    return ptsB - ptsA;
  });
  
  // Find best alternative player for each tier
  // These are OPTIONS for users - Gary already picked his best lineup
  for (const [tier, config] of Object.entries(PIVOT_TIERS)) {
    const salaryDiffMin = config.salaryRange.min;
    const salaryDiffMax = config.salaryRange.max;
    
    // Find highest-projected player within this salary range (that hasn't been used already)
    const candidate = sortedPool.find(p => {
      if (usedPlayers.has(p.name)) return false; // Skip if already used in another tier
      const diff = p.salary - starterSalary;
      return diff >= salaryDiffMin && diff <= salaryDiffMax;
    });
    
    if (candidate) {
      usedPlayers.add(candidate.name); // Mark as used
      
      // Get salary-aware label (prevents calling $9K players "punt spots")
      const { label: tierLabel, description: tierDescription } = getSalaryAwareTierLabel(
        candidate.salary, 
        tier, 
        config.label, 
        config.description
      );
      
      pivots.push({
        tier,
        tierLabel,
        tierDescription,
        player: candidate.name,
        team: candidate.team,
        salary: candidate.salary,
        projected_pts: candidate.projected_pts || calculateProjectedPoints(candidate, sport, platform),
        salaryDiff: candidate.salary - starterSalary
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ALWAYS SHOW AT LEAST ONE ALTERNATIVE
  // ═══════════════════════════════════════════════════════════════════════════
  // Substitutions are options for users - they don't affect salary cap.
  // On small slates with limited options, still show the best available player
  // even if it's outside normal salary tiers.
  if (pivots.length === 0 && sortedPool.length > 0) {
    // Find best available player not already used
    const bestAvailable = sortedPool.find(p => !usedPlayers.has(p.name));
    if (bestAvailable) {
      const salaryDiff = bestAvailable.salary - starterSalary;
      const tierLabel = salaryDiff > 0 ? 'Upgrade' : (salaryDiff < 0 ? 'Budget Play' : 'Direct Swap');
      
      pivots.push({
        tier: 'best_available',
        tierLabel,
        tierDescription: 'Best available alternative at this position',
        player: bestAvailable.name,
        team: bestAvailable.team,
        salary: bestAvailable.salary,
        projected_pts: bestAvailable.projected_pts || calculateProjectedPoints(bestAvailable, sport, platform),
        salaryDiff
      });
    }
  }
  
  return pivots;
}

/**
 * Greedy lineup optimizer
 * Fills positions with best value (pts/salary) while respecting cap
 * @param {Array} players - Player pool with salaries and projections
 * @param {Object} constraints - Platform constraints
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {Object} context - Optional narrative context (fadePlayers, targetPlayers)
 * @returns {Object} Optimized lineup
 */


/**
 * Greedy lineup optimizer
 * Fills positions with best value (pts/salary) while respecting cap
 * @param {Array} players - Player pool with salaries and projections
 * @param {Object} constraints - Platform constraints
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {Object} context - Optional narrative context (fadePlayers, targetPlayers)
 * @returns {Object} Optimized lineup
 */
export function optimizeLineup(players, constraints, sport, platform, context = {}) {
  const { salaryCap, positions, positionRules } = constraints;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S SHARP DFS FRAMEWORK
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary is a GAMBLER finding edges, not an optimizer outputting highest projections.
  //
  // HARD FACTORS Gary investigates:
  // - Usage/target share, minutes/snap trends (opportunity)
  // - DvP rankings, pace (matchup)
  // - Salary efficiency (value per dollar)
  //
  // SOFT FACTORS Gary validates:
  // - Narratives (revenge, hot streak) need data backing
  // - Ownership is ONE data point, not a forced pivot trigger
  //
  // GARY'S APPROACH:
  // Investigate the factors. Understand the opportunity. Build the lineup based on his analysis.
  //
  // SALARY LAG = where DFS value lives:
  // - Player promoted to starter but salary hasn't adjusted
  // - Player's teammate just went out creating usage vacuum
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NARRATIVE CONTEXT: Gary's intelligence beyond raw numbers
  // ═══════════════════════════════════════════════════════════════════════════
  // Extract narrative data for Gary to factor into decisions
  const fadePlayers = context.fadePlayers || [];
  const targetPlayers = context.targetPlayers || [];
  
  // Create lookup sets for quick access
  const fadeSet = new Set(fadePlayers.map(p => p.name?.toLowerCase()));
  const targetSet = new Set(targetPlayers.map(p => p.name?.toLowerCase()));
  
  // Log narrative intelligence
  if (fadePlayers.length > 0 || targetPlayers.length > 0) {
    console.log(`[Optimizer] 📖 Narrative context:`);
    if (targetPlayers.length > 0) {
      console.log(`   🎯 Targets: ${targetPlayers.map(p => `${p.name} (${p.reason?.substring(0, 40)}...)`).join(', ')}`);
    }
    if (fadePlayers.length > 0) {
      console.log(`   ⚠️ Fades: ${fadePlayers.map(p => `${p.name} (${p.reason?.substring(0, 40)}...)`).join(', ')}`);
    }
  }
  const lineup = [];
  const usedPlayers = new Set();
  let totalSalary = 0;
  
  // ⭐ FIX: Create a mapping of which positions each player can fill
  // BDL uses generic positions (G, F, C) so we need to map them to DFS slots
  const positionEligibility = {
    // NBA - Specific positions
    'PG': ['PG', 'G', 'UTIL'],
    'SG': ['SG', 'G', 'UTIL'],
    'SF': ['SF', 'F', 'UTIL'],
    'PF': ['PF', 'F', 'UTIL'],
    'C': ['C', 'UTIL'],
    // NBA - Generic positions from BDL
    'G': ['PG', 'SG', 'G', 'UTIL'],  // Guards can fill PG, SG, G, UTIL
    'F': ['SF', 'PF', 'F', 'UTIL'],  // Forwards can fill SF, PF, F, UTIL
    'G-F': ['SG', 'SF', 'G', 'F', 'UTIL'],  // Combo guard-forward
    'F-G': ['SG', 'SF', 'G', 'F', 'UTIL'],  // Combo forward-guard
    'F-C': ['PF', 'C', 'F', 'UTIL'],  // Combo forward-center
    'C-F': ['PF', 'C', 'F', 'UTIL'],  // Combo center-forward
    'UTIL': ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
    // NFL
    'QB': ['QB'],
    'RB': ['RB', 'FLEX'],
    'WR': ['WR', 'FLEX'],
    'TE': ['TE', 'FLEX'],
    'K': ['K'],
    'DST': ['DST'],
    'DEF': ['DST'],
    'FLEX': ['RB', 'WR', 'TE', 'FLEX']
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: CALCULATE PROJECTED POINTS + APPLY MODIFIERS
  // ═══════════════════════════════════════════════════════════════════════════
  // We need to calculate projections BEFORE sorting so we can rank by ceiling
  // This includes:
  // 1. Base projections from stats
  // 2. Opportunity Score (volume-based breakout detection)
  // 3. Narrative modifiers (targets/fades from Gemini)
  // 4. Ceiling/Floor calculations for GPP/Cash optimization
  
  // Get contest type from context (default to 'gpp' for tournaments)
  const contestType = context.contestType || 'gpp';
  const isGPP = contestType === 'gpp';
  
  console.log(`[Optimizer] 🎰 Contest type: ${contestType.toUpperCase()} (${isGPP ? 'ceiling optimization' : 'floor optimization'})`);
  
  for (const player of players) {
    // Calculate base projection if missing
    if (!player.projected_pts || player.projected_pts === 0) {
      player.projected_pts = calculateProjectedPoints(player, sport, platform, contestType);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // OPPORTUNITY SCORE - Volume-Based Breakout Detection
    // ═══════════════════════════════════════════════════════════════════════
    // Identifies "Price Lag" players (high opportunity, low salary)
    if (!player.opportunityScore && player.projected_pts > 0) {
      const boostedPlayer = applyOpportunityBoost(player, sport);
      Object.assign(player, boostedPlayer);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CEILING & FLOOR CALCULATION
    // ═══════════════════════════════════════════════════════════════════════
    // Calculate DFS metrics including ceiling/floor for GPP/Cash optimization
    if (!player.ceilingScore) {
      const metrics = calculateDFSMetrics(player, context, sport);
      player.ceilingScore = metrics.ceilingScore;
      player.floorScore = metrics.floorScore;
      player.isGppSmash = metrics.isGppSmash;
      player.isCashSafe = metrics.isCashSafe;
      player.gppValueTarget = metrics.gppValueTarget;
    }
    
    const playerNameLower = player.name?.toLowerCase();
    
    // Mark players based on narrative context
    player.isTarget = targetSet.has(playerNameLower);
    player.isFade = fadeSet.has(playerNameLower);
    
    // ═══════════════════════════════════════════════════════════════════════
    // MERGE ROTATION CONTEXT from Narrative
    // ═══════════════════════════════════════════════════════════════════════
    // Extract rotation-aware fields from target/fade players
    const targetPlayerData = targetPlayers.find(t => t.name?.toLowerCase() === playerNameLower);
    const fadePlayerData = fadePlayers.find(f => f.name?.toLowerCase() === playerNameLower);
    
    if (targetPlayerData) {
      player.rotation_status = targetPlayerData.rotation_status || player.rotation_status;
      player.minutes_trend = targetPlayerData.minutes_trend || player.minutes_trend;
      player.role_sustainability = targetPlayerData.role_sustainability || player.role_sustainability;
      player.projected_minutes = targetPlayerData.projected_minutes || player.projected_minutes;
    }
    
    if (fadePlayerData) {
      player.rotation_status = fadePlayerData.rotation_status || player.rotation_status;
      player.minutes_trend = fadePlayerData.minutes_trend || player.minutes_trend;
      player.role_sustainability = fadePlayerData.role_sustainability || player.role_sustainability;
      player.projected_minutes = fadePlayerData.projected_minutes || player.projected_minutes;
    }
    
    // Apply small narrative modifier to projections (organic, not forced)
    // ═══════════════════════════════════════════════════════════════════════════
    // NARRATIVE AWARENESS (NOT PRESCRIPTIVE)
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary sees narrative context as DATA, not COMMANDS. He makes his own decisions.
    // We log the context for transparency but DON'T modify projections based on it.
    // Gary's job is to analyze ALL factors and pick the best lineup himself.
    // ═══════════════════════════════════════════════════════════════════════════
    if (player.isTarget && !player.narrativeLogged) {
      player.narrativeLogged = true;
      console.log(`[Optimizer] 📖 Narrative context: ${player.name} identified as potential target (Gary will evaluate)`);
    }
    if (player.isFade && !player.narrativeLogged) {
      player.narrativeLogged = true;
      console.log(`[Optimizer] 📖 Narrative context: ${player.name} identified as potential fade (Gary will evaluate)`);
    }
  }
  
  // Log Opportunity Score findings (Price Lag players)
  const priceLagPlayers = players.filter(p => p.isPriceLag);
  if (priceLagPlayers.length > 0) {
    console.log(`[Optimizer] 🚀 Price Lag breakouts found: ${priceLagPlayers.map(p => `${p.name} ($${p.salary})`).join(', ')}`);
  }
  
  // Log GPP Smash Spots
  const smashSpots = players.filter(p => p.isGppSmash);
  if (smashSpots.length > 0 && isGPP) {
    console.log(`[Optimizer] 💥 GPP Smash Spots: ${smashSpots.slice(0, 5).map(p => `${p.name} (ceiling: ${p.ceilingScore})`).join(', ')}`);
  }
  
  // Group players by ALL positions they can fill
  const playersByPosition = {};
  for (const player of players) {
    const pos = player.position?.toUpperCase();
    if (!pos) continue;
    
    // ⭐ Use Tank01's platform-specific positions when available
    // This ensures DK/FD position eligibility is accurate (they differ!)
    const eligibleSlots = player.allPositions && player.allPositions.length > 0
      ? getPlayerEligibleSlots(player, sport, platform)
      : positionEligibility[pos] || [pos];

    for (const slot of eligibleSlots) {
      if (!playersByPosition[slot]) playersByPosition[slot] = [];
      playersByPosition[slot].push(player);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: SORT BY OPTIMIZATION METRIC (GPP = Ceiling, Cash = Floor)
  // ═══════════════════════════════════════════════════════════════════════════
  // GPP: Sort by CEILING score (target 350+ pts, boom/bust players)
  // Cash: Sort by FLOOR score (target 280 pts, consistent performers)
  // 
  // TIE-BREAKER LOGIC (organic, not forced):
  //   1. Similar scores (within 1.5 pts): Prefer lower ownership (GPP differentiation)
  //   2. Value contrarian: Consider if LOW ownership + saves $1500+
  //   3. Price Lag boost: Favor high opportunity + low salary players
  // ═══════════════════════════════════════════════════════════════════════════
  for (const pos in playersByPosition) {
    playersByPosition[pos].sort((a, b) => {
    // GPP: Use ceiling score | Cash: Use floor score
    const scoreA = isGPP ? (a.ceilingScore || a.projected_pts || 0) : (a.floorScore || a.projected_pts * 0.7 || 0);
    const scoreB = isGPP ? (b.ceilingScore || b.projected_pts || 0) : (b.floorScore || b.projected_pts * 0.7 || 0);
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONFIRMED STARTER PRIORITY (BDL/Vegas lock)
    // ═══════════════════════════════════════════════════════════════════════
    // If one player is a confirmed starter and the other isn't, prefer the starter
    if (a.forcedLock && !b.forcedLock) return -1;
    if (b.forcedLock && !a.forcedLock) return 1;

    const scoreDiff = scoreB - scoreA;
      
      const salaryA = a.salary || 5000;
      const salaryB = b.salary || 5000;
      const ownA = a.ownership || 15;
      const ownB = b.ownership || 15;
      
      // ═══════════════════════════════════════════════════════════════════════
      // PRICE LAG PRIORITY (GPP only)
      // ═══════════════════════════════════════════════════════════════════════
      // If one player is a Price Lag breakout, prioritize them
      if (isGPP) {
        if (a.isPriceLag && !b.isPriceLag && Math.abs(scoreDiff) <= 5) {
          return -1; // Prefer Price Lag player A
        }
        if (b.isPriceLag && !a.isPriceLag && Math.abs(scoreDiff) <= 5) {
          return 1; // Prefer Price Lag player B
        }
      }
      
      // If scores are similar (within 1.5 pts), prefer lower ownership (GPP differentiation)
      if (Math.abs(scoreDiff) <= 1.5) {
        return ownA - ownB;
      }
      
      // VALUE CONTRARIAN: If player A is 3-6 pts less but saves $1500+ AND is low-owned (<12%),
      // consider them competitive (could be worth the savings to upgrade elsewhere)
      if (scoreDiff > 0 && scoreDiff <= 6 && scoreDiff >= 3) {
        const salarySaved = salaryB - salaryA;
        if (salarySaved >= 1500 && ownA < 12) {
          // Player A is a "value contrarian" - bump them up in the sort
          // But not above similar-projection players
          return -0.5; // Slight preference for value contrarian
        }
      }
      if (scoreDiff < 0 && Math.abs(scoreDiff) <= 6 && Math.abs(scoreDiff) >= 3) {
        const salarySaved = salaryA - salaryB;
        if (salarySaved >= 1500 && ownB < 12) {
          return 0.5; // Slight preference for value contrarian
        }
      }
      
      // Otherwise, sort by optimization score (highest first)
      return scoreDiff;
    });
  }
  
  // ⭐ FIX: Sort positions by ACTUAL AVAILABLE PLAYERS (fewest first)
  // This prevents using all 'F' players on SF before PF gets filled
  // Count how many players are eligible for each position, then fill scarcer first
  
  // Count available players per position
  const availablePerPosition = {};
  for (const pos of [...new Set(positions)]) {
    availablePerPosition[pos] = (playersByPosition[pos] || []).filter(p => 
      p.salary > 0 && p.status !== 'OUT'
    ).length;
  }
  
  const sortedPositions = [...positions].sort((a, b) => {
    const flexSlots = ['G', 'F', 'UTIL', 'FLEX'];
    const aIsFlex = flexSlots.includes(a);
    const bIsFlex = flexSlots.includes(b);
    if (aIsFlex && !bIsFlex) return 1; // Flex goes last
    if (!aIsFlex && bIsFlex) return -1;
    
    // Fill positions with fewer available players FIRST
    // This ensures scarce positions get filled before players are used elsewhere
    const availA = availablePerPosition[a] || 0;
    const availB = availablePerPosition[b] || 0;
    return availA - availB;
  });
  
  // Calculate minimum salary to reserve for remaining positions
  // This prevents overspending early and leaving no room for flex
  const MIN_SALARY_PER_POSITION = sport === 'NFL' ? 3500 : 3800;

  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // PUNT AWARENESS (NOT enforcement - Gary has agency)
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary is AWARE that most winning GPP lineups have 1-2 punts.
  // BUT Gary can use MORE punts if he's found genuine value:
  //   - Player getting increased minutes (injury to teammate)
  //   - Usage spike (trade, lineup change)
  //   - Favorable matchup + pace-up spot
  //   - Underpriced due to recent slump but talent is there
  //
  // Gary's job: INVESTIGATE whether cheap players have real upside.
  // The audit layer will flag punt-heavy lineups for review, not block them.
  // ═══════════════════════════════════════════════════════════════════════════
  const puntThreshold = PUNT_SALARY_THRESHOLD[platform] || 4500;
  const puntAwareness = PUNT_AWARENESS[contestType] || { typical: 2, flagIfOver: 3 };
  let currentPuntCount = 0;

  // Fill each position slot
  for (let i = 0; i < sortedPositions.length; i++) {
    const posSlot = sortedPositions[i];
    const rule = positionRules[posSlot];
    if (!rule) continue;
    
    // Calculate remaining positions to fill (after this one)
    const remainingPositions = sortedPositions.length - i - 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // SALARY RESERVATION: Ensure we can fill remaining spots
    // ═══════════════════════════════════════════════════════════════════════════
    // Reserve minimum salary for remaining positions so we don't get stuck.
    // Gary has agency to choose punts OR mid-tier - we just ensure the lineup
    // can be completed. Gary will investigate if his punt picks have real upside.
    const reservedSalary = remainingPositions * MIN_SALARY_PER_POSITION;
    const maxSalaryForThisSlot = salaryCap - totalSalary - reservedSalary;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FIND HIGHEST-CEILING PLAYER (Ownership + Value as Tie-Breakers)
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary picks the BEST projected player that fits.
    // Tie-breakers (organic):
    //   1. Similar projection (~1.5 pts): prefer lower ownership
    //   2. Value contrarian (3-6 pts less): consider if saves $1500+ AND low-owned (<12%)
    let bestPlayer = null;
    let bestPts = -1;
    let bestOwnership = 100;
    let bestSalary = 0;
    
    // Candidates are already sorted by projected_pts (highest first)
    const candidates = playersByPosition[posSlot] || [];
    
    for (const player of candidates) {
      // Skip if already used
      if (usedPlayers.has(player.name)) continue;
      
      // Skip if would exceed available salary (cap minus reserved)
      if (player.salary > maxSalaryForThisSlot) continue;
      
      // Skip if player is OUT
      if (player.status === 'OUT') continue;
      
      // Skip if no salary (invalid player)
      if (!player.salary || player.salary <= 0) continue;

      // ═══════════════════════════════════════════════════════════════════════
      // PUNT AWARENESS (NO enforcement - Gary has agency)
      // ═══════════════════════════════════════════════════════════════════════
      // Gary can choose punt plays if he's investigated and found real upside:
      //   - Minutes increase (teammate injury/trade)
      //   - Usage spike (scheme change, hot streak)
      //   - Favorable DvP matchup
      //   - Price hasn't caught up to reality
      // The audit layer will flag high-punt lineups for Gary to explain his thesis.
      const isPunt = player.salary < puntThreshold;

      const pts = player.projected_pts || 0;
      const own = player.ownership || 15;
      const sal = player.salary || 5000;
      
      // Determine if this player should be selected
      const isBetter = pts > bestPts + 1.5; // Clearly better projection
      const isSimilarButLowerOwned = Math.abs(pts - bestPts) <= 1.5 && own < bestOwnership;
      
      // VALUE CONTRARIAN: 3-6 pts less but saves $1500+ AND low-owned (<12%)
      // Gary considers this if the savings could upgrade other positions
      const ptsDiff = bestPts - pts;
      const salarySaved = bestSalary - sal;
      const isValueContrarian = ptsDiff >= 3 && ptsDiff <= 6 && salarySaved >= 1500 && own < 12;
      
      if (isBetter || isSimilarButLowerOwned || bestPlayer === null) {
        bestPts = pts;
        bestOwnership = own;
        bestSalary = sal;
        bestPlayer = player;
      } else if (isValueContrarian && bestPlayer) {
        // Log this as a value contrarian consideration (Gary may choose it)
        // Only swap if we haven't already found someone clearly better
        console.log(`[Optimizer] 💡 Value contrarian option: ${player.name} (${pts.toFixed(1)} pts, ${own}% own, saves $${salarySaved})`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SALARY OVERFLOW: No valid player within budget
    // ═══════════════════════════════════════════════════════════════════════════
    // If we can't find any player within budget, log it for investigation.
    // This usually means earlier picks were too expensive - but Gary may have
    // conviction in those star picks. The audit will flag salary allocation.
    if (!bestPlayer && candidates.length > 0) {
      console.warn(`[Optimizer] ⚠️ No player within budget for ${posSlot}`);
      console.warn(`[Optimizer]    → Budget remaining: $${maxSalaryForThisSlot}`);
      console.warn(`[Optimizer]    → Gary may need to investigate cheaper alternatives`);
      // Try to find ANY valid player (even if over typical budget)
      const anyValidPlayer = candidates.find(p =>
        !usedPlayers.has(p.name) && p.status !== 'OUT' && p.salary > 0
      );
      if (anyValidPlayer) {
        bestPlayer = anyValidPlayer;
        console.log(`[Optimizer] → Found ${anyValidPlayer.name} ($${anyValidPlayer.salary}) - over budget but completing lineup`);
      }
    }

    if (bestPlayer) {
      usedPlayers.add(bestPlayer.name);
      totalSalary += bestPlayer.salary;

      // Track punt count for fragile floor prevention
      if (bestPlayer.salary < puntThreshold) {
        currentPuntCount++;
        console.log(`[Optimizer] 🎯 Punt ${currentPuntCount}/${maxPunts}: ${bestPlayer.name} ($${bestPlayer.salary})`);
      }

      // Generate rationale and supporting stats for this pick
      const { rationale, supportingStats } = generatePlayerRationale(bestPlayer, sport, platform);
      
      lineup.push({
        position: posSlot,
        player: bestPlayer.name,
        team: bestPlayer.team,
        salary: bestPlayer.salary,
        projected_pts: bestPlayer.projected_pts || calculateProjectedPoints(bestPlayer, sport, platform),
        rationale,
        supportingStats,
        pivots: [], // Will be filled later
        // Include DFS context data
        ownership: bestPlayer.ownership,
        recentForm: bestPlayer.recentForm,
        dvpRank: bestPlayer.dvpRank,
        // Carry over ALL stats for deep reasoning
        seasonStats: bestPlayer.seasonStats,
        l5Stats: bestPlayer.l5Stats,
        ppg: bestPlayer.seasonStats?.ppg || bestPlayer.ppg,
        mpg: bestPlayer.seasonStats?.mpg || bestPlayer.mpg,
        apg: bestPlayer.seasonStats?.apg || bestPlayer.apg,
        rpg: bestPlayer.seasonStats?.rpg || bestPlayer.rpg,
        usage: bestPlayer.usage || bestPlayer.seasonStats?.usage,
        l5AvgPts: bestPlayer.l5Stats?.ppg || bestPlayer.l5AvgPts,
        // Narrative context
        usageBoost: bestPlayer.usageBoost,
        injuryBeneficiary: bestPlayer.injuryBeneficiary,
        narrativeNote: bestPlayer.narrativeNote,
        opponent: bestPlayer.opponent || bestPlayer.opp,
        rotation_status: bestPlayer.rotation_status,
        teammateOpportunity: bestPlayer.teammateOpportunity
      });
    }
  }
  
  return {
    lineup,
    totalSalary,
    projectedPoints: Math.round(lineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0) * 10) / 10
  };
}

/**
 * Generate rationale and supporting stats for a player pick
 * ═══════════════════════════════════════════════════════════════════════════
 * BASKETBALL-FIRST RATIONALE - NOT salary-based
 * ═══════════════════════════════════════════════════════════════════════════
 * Gary explains WHY this player will perform well TONIGHT based on:
 * - Matchup advantages (DVP, defensive weaknesses)
 * - Usage/opportunity (injuries creating minutes)
 * - Recent performance trends (hot streaks, L5 stats)
 * - Game context (pace, revenge, rest advantage)
 * 
 * NOT based on: salary value, "unlocks spend", price efficiency
 * ═══════════════════════════════════════════════════════════════════════════
 * @param {Object} player - Player with stats and context
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} { rationale: string, supportingStats: Array }
 */

export 
/**
 * Generate rationale and supporting stats for a player pick
 * ═══════════════════════════════════════════════════════════════════════════
 * BASKETBALL-FIRST RATIONALE - NOT salary-based
 * ═══════════════════════════════════════════════════════════════════════════
 * Gary explains WHY this player will perform well TONIGHT based on:
 * - Matchup advantages (DVP, defensive weaknesses)
 * - Usage/opportunity (injuries creating minutes)
 * - Recent performance trends (hot streaks, L5 stats)
 * - Game context (pace, revenge, rest advantage)
 * 
 * NOT based on: salary value, "unlocks spend", price efficiency
 * ═══════════════════════════════════════════════════════════════════════════
 * @param {Object} player - Player with stats and context
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} { rationale: string, supportingStats: Array }
 */
function generatePlayerRationale(player, sport, platform) {
  const stats = player.seasonStats || player;
  const supportingStats = [];
  let rationale = '';
  
  // Game context for basketball-based rationales
  const opponent = player.opponent || player.opp || '';
  const dvpRank = player.dvpRank || null;
  const usageBoost = player.usageBoost;
  const narrativeNote = player.narrativeNote;
  const recentForm = player.recentForm || null; // 'hot', 'cold', 'neutral'
  const minutesTrend = player.minutesTrend || player.minutes_trend || null;
  const rotationStatus = player.rotationStatus || player.rotation_status || null;
  const isRevenge = player.isRevenge || false;
  const l5BestPts = player.l5BestPts || 0;
  const l5AvgPts = player.l5AvgPts || 0;
  
  if (sport === 'NBA') {
    const ppg = stats.ppg || stats.pts || 0;
    const rpg = stats.rpg || stats.reb || 0;
    const apg = stats.apg || stats.ast || 0;
    const mpg = stats.mpg || stats.min || 0;
    
    // Build supporting stats (basketball stats only, no value metrics)
    if (ppg > 0) supportingStats.push({ label: 'PPG', value: ppg.toFixed(1) });
    if (rpg > 0) supportingStats.push({ label: 'RPG', value: rpg.toFixed(1) });
    if (apg > 0) supportingStats.push({ label: 'APG', value: apg.toFixed(1) });
    if (mpg > 0) supportingStats.push({ label: 'MPG', value: mpg.toFixed(1) });
    
    // Trim to 4 max
    while (supportingStats.length > 4) supportingStats.pop();
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BASKETBALL-BASED RATIONALE (NO SALARY MENTIONS)
    // Priority: Narrative > Usage Opportunity > Matchup > Recent Form > Stats
    // ═══════════════════════════════════════════════════════════════════════════
    
    if (narrativeNote && narrativeNote.length > 10) {
      // Use Gary's narrative context (should already be basketball-focused)
      rationale = narrativeNote;
    } else if (usageBoost) {
      // Usage opportunity from teammate injury
      rationale = `Elevated usage tonight with ${usageBoost} out. Should see increased touches and shot attempts.`;
    } else if (rotationStatus === 'expanded_role' || minutesTrend === 'increasing') {
      // Rising role/minutes
      rationale = `Minutes trending up recently. Earning a bigger role in the rotation.`;
    } else if (isRevenge && opponent) {
      // Revenge game narrative
      rationale = `Revenge game vs ${opponent}. Extra motivation facing former team.`;
    } else if (dvpRank && dvpRank <= 5 && opponent) {
      // Elite matchup
      rationale = `${opponent} ranks bottom-5 defending ${player.position || 'this position'}. Favorable matchup tonight.`;
    } else if (dvpRank && dvpRank <= 10 && opponent) {
      // Good matchup
      rationale = `Good matchup vs ${opponent} who struggle against ${player.position || 'this position'}.`;
    } else if (recentForm === 'hot' || (l5AvgPts > 0 && l5AvgPts > ppg * 1.15)) {
      // Hot streak
      const hotStat = l5AvgPts > 0 ? ` averaging ${l5AvgPts.toFixed(1)} over last 5` : '';
      rationale = `Hot streak${hotStat}. Confidence and rhythm are up.`;
    } else if (l5BestPts >= 40) {
      // Proven ceiling
      rationale = `Showed ${l5BestPts.toFixed(0)}-point upside recently. Ceiling is real.`;
    } else if (ppg >= 25) {
      // Star production
      rationale = `Averaging ${ppg.toFixed(1)} PPG this season. Consistent high-end production.`;
    } else if (rpg >= 10 && apg >= 5) {
      // Triple-double threat
      rationale = `Putting up ${ppg.toFixed(1)}/${rpg.toFixed(1)}/${apg.toFixed(1)} per game. Multi-category contributor.`;
    } else if (rpg >= 10) {
      // Elite rebounder
      rationale = `Averaging ${rpg.toFixed(1)} boards per game. Reliable rebounding production.`;
    } else if (apg >= 8) {
      // Elite playmaker
      rationale = `Dishing ${apg.toFixed(1)} assists per game. Primary playmaker for his team.`;
    } else if (mpg >= 30) {
      // High minutes = opportunity
      rationale = `Playing ${mpg.toFixed(0)}+ minutes per game. Heavy workload creates opportunity.`;
    } else if (ppg >= 15) {
      // Solid scorer
      rationale = `Scoring ${ppg.toFixed(1)} PPG with consistent minutes. Reliable production.`;
    } else {
      // Default - focus on role
      rationale = `Filling a key role in tonight's rotation. Should see adequate minutes.`;
    }
    
  } else if (sport === 'NFL') {
    const position = (player.position || '').toUpperCase();
    const passYds = stats.passing_yards_per_game || 0;
    const passTds = stats.passing_touchdowns || 0;
    const rushYds = stats.rushing_yards_per_game || 0;
    const rushTds = stats.rushing_touchdowns || 0;
    const recYds = stats.receiving_yards_per_game || 0;
    const recTds = stats.receiving_touchdowns || 0;
    const receptions = stats.receptions || 0;
    const targets = stats.receiving_targets || 0;
    
    if (position === 'QB') {
      if (passYds > 0) supportingStats.push({ label: 'Pass YPG', value: passYds.toFixed(0) });
      if (passTds > 0) supportingStats.push({ label: 'Pass TD', value: passTds.toFixed(0) });
      if (rushYds > 20) supportingStats.push({ label: 'Rush YPG', value: rushYds.toFixed(0) });
      rationale = rushYds > 30 
        ? `Dual-threat QB with rushing upside. Floor boosted by designed runs and scrambles.`
        : `Volume passer in pass-heavy offense. High-ceiling play in positive game script.`;
    } else if (position === 'RB') {
      if (rushYds > 0) supportingStats.push({ label: 'Rush YPG', value: rushYds.toFixed(0) });
      if (rushTds > 0) supportingStats.push({ label: 'Rush TD', value: rushTds.toFixed(0) });
      if (receptions > 0) supportingStats.push({ label: 'Rec', value: receptions.toFixed(0) });
      rationale = receptions >= 30 
        ? `Pass-catching back with ${platform === 'draftkings' ? 'full PPR upside' : 'receiving floor'}. Valuable in all game scripts.`
        : `Workhorse back with volume. TD-dependent but high-touch player.`;
    } else if (position === 'WR') {
      if (recYds > 0) supportingStats.push({ label: 'Rec YPG', value: recYds.toFixed(0) });
      if (recTds > 0) supportingStats.push({ label: 'Rec TD', value: recTds.toFixed(0) });
      if (targets > 0) supportingStats.push({ label: 'Targets', value: targets.toFixed(0) });
      if (receptions > 0) supportingStats.push({ label: 'Rec', value: receptions.toFixed(0) });
      rationale = targets >= 80 
        ? `Target hog with consistent volume. High-floor ${platform === 'draftkings' ? 'PPR monster' : 'yardage play'}.`
        : `Big-play threat with TD upside. Boom potential in the right matchup.`;
    } else if (position === 'TE') {
      if (recYds > 0) supportingStats.push({ label: 'Rec YPG', value: recYds.toFixed(0) });
      if (recTds > 0) supportingStats.push({ label: 'Rec TD', value: recTds.toFixed(0) });
      if (targets > 0) supportingStats.push({ label: 'Targets', value: targets.toFixed(0) });
      rationale = `Red zone weapon with TE premium. Positional scarcity makes him valuable at price.`;
    } else {
      rationale = `Solid contributor at the position. Good value relative to projections.`;
    }
    
    // Trim to 4 max and add value
    while (supportingStats.length > 3) supportingStats.pop();
    supportingStats.push({ label: 'Value', value: `${value}x` });
  }
  
  return { rationale, supportingStats };
}

/**
 * Add pivot alternatives to each lineup position
 * @param {Array} lineup - Optimized lineup
 * @param {Array} playerPool - Full player pool
 * @param {Object} constraints - Platform constraints
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Lineup with pivots
 */


/**
 * Add pivot alternatives to each lineup position
 * @param {Array} lineup - Optimized lineup
 * @param {Array} playerPool - Full player pool
 * @param {Object} constraints - Platform constraints
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Lineup with pivots
 */
export function addPivotsToLineup(lineup, playerPool, constraints, sport, platform) {
  const { positionRules } = constraints;
  
  // Get all players already in the lineup
  const lineupPlayers = new Set(lineup.map(slot => slot.player));
  
  return lineup.map(slot => {
    const rule = positionRules[slot.position];
    if (!rule) return slot;
    
    // Get all players eligible for this position (excluding those already in lineup)
    const eligiblePlayers = playerPool.filter(p => {
      const pSlots = getPlayerEligibleSlots(p, sport, platform);
      const isEligible = pSlots.includes(slot.position.toUpperCase());
      const notInLineup = !lineupPlayers.has(p.name);
      return isEligible && notInLineup;
    });
    
    // Find pivots from non-lineup players first
    let pivots = findPivotAlternatives(
      { player: slot.player, salary: slot.salary },
      eligiblePlayers,
      sport,
      platform
    );
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK: If no alternatives found, show lineup players as swap options
    // ═══════════════════════════════════════════════════════════════════════════
    // On small slates, sometimes all position-eligible players are in the lineup.
    // Show them as alternatives with note that it requires a lineup rearrangement.
    if (pivots.length === 0) {
      const lineupAlternatives = playerPool.filter(p => {
        const pSlots = getPlayerEligibleSlots(p, sport, platform);
        const isEligible = pSlots.includes(slot.position.toUpperCase());
        const inLineup = lineupPlayers.has(p.name);
        const notSelf = p.name !== slot.player;
        return isEligible && inLineup && notSelf;
      }).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
      
      if (lineupAlternatives.length > 0) {
        const alt = lineupAlternatives[0];
        const salaryDiff = alt.salary - slot.salary;
        pivots.push({
          tier: 'lineup_swap',
          tierLabel: 'Swap Option',
          tierDescription: 'Already in lineup - would require rearranging',
          player: alt.name,
          team: alt.team,
          salary: alt.salary,
          projected_pts: alt.projected_pts || calculateProjectedPoints(alt, sport, platform),
          salaryDiff,
          requiresSwap: true
        });
      }
    }
    
    return {
      ...slot,
      pivots
    };
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NFL STACKING ENGINE - Mandatory Correlation Rules for GPP
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * You CANNOT win large NFL tournaments without proper stacking.
 * This engine enforces three mandatory correlation rules:
 * 
 * RULE 1 - PRIMARY STACK: QB must be paired with 1-2 WR/TE from same team
 *   - If QB is from Team A, at least 1 WR/TE must be from Team A
 *   - This captures scoring correlation (QB throws → WR catches)
 * 
 * RULE 2 - BRINGBACK: Include 1 skill player from the opposing team
 *   - If stacking Team A vs Team B, include 1 WR/RB/TE from Team B
 *   - High-scoring games are shootouts where BOTH teams produce
 * 
 * RULE 3 - DEFENSIVE STACK (Optional): Pair DST with same-team RB
 *   - If Team A is winning, RB gets more clock-killing carries
 *   - Defense gets more sack/INT opportunities in positive game script
 * 
 * @param {Array} lineup - Current lineup (will be modified)
 * @param {Array} playerPool - Full player pool for swaps
 * @param {Object} constraints - Platform constraints
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {Object} context - Context with game info
 * @returns {Object} { lineup, stackInfo, changes }
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NFL STACKING ENGINE - Mandatory Correlation Rules for GPP
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * You CANNOT win large NFL tournaments without proper stacking.
 * This engine enforces three mandatory correlation rules:
 * 
 * RULE 1 - PRIMARY STACK: QB must be paired with 1-2 WR/TE from same team
 *   - If QB is from Team A, at least 1 WR/TE must be from Team A
 *   - This captures scoring correlation (QB throws → WR catches)
 * 
 * RULE 2 - BRINGBACK: Include 1 skill player from the opposing team
 *   - If stacking Team A vs Team B, include 1 WR/RB/TE from Team B
 *   - High-scoring games are shootouts where BOTH teams produce
 * 
 * RULE 3 - DEFENSIVE STACK (Optional): Pair DST with same-team RB
 *   - If Team A is winning, RB gets more clock-killing carries
 *   - Defense gets more sack/INT opportunities in positive game script
 * 
 * @param {Array} lineup - Current lineup (will be modified)
 * @param {Array} playerPool - Full player pool for swaps
 * @param {Object} constraints - Platform constraints
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {Object} context - Context with game info
 * @returns {Object} { lineup, stackInfo, changes }
 */
export function applyNFLStackingRules(lineup, playerPool, constraints, platform, context = {}) {
  const changes = [];
  let stackInfo = {
    primaryStack: null,
    bringback: null,
    defensiveStack: null,
    compliant: false
  };
  
  // Find the QB in the lineup
  const qbSlot = lineup.find(s => s.position === 'QB');
  if (!qbSlot) {
    console.log('[Stacking] ⚠️ No QB in lineup - cannot apply stacking');
    return { lineup, stackInfo, changes };
  }
  
  const qbTeam = qbSlot.team;
  console.log(`[Stacking] 🏈 Building stack around ${qbSlot.player} (${qbTeam})`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 1: PRIMARY STACK - QB + WR/TE from same team
  // ═══════════════════════════════════════════════════════════════════════════
  const sameTeamReceivers = lineup.filter(s => 
    ['WR', 'TE'].includes(s.position) && s.team === qbTeam
  );
  
  if (sameTeamReceivers.length >= 1) {
    stackInfo.primaryStack = {
      qb: qbSlot.player,
      receivers: sameTeamReceivers.map(r => r.player),
      team: qbTeam
    };
    // Mark as stack players to prevent swapping in review
    sameTeamReceivers.forEach(r => { r.isStack = true; });
    qbSlot.isStack = true;
    console.log(`[Stacking] ✅ Primary stack: ${qbSlot.player} + ${sameTeamReceivers.map(r => r.player).join(', ')}`);
  } else {
    // Need to swap in a WR/TE from QB's team
    console.log(`[Stacking] ⚠️ No receivers from ${qbTeam} - looking for swap...`);
    
    // Find WR/TE from QB's team in player pool
    const qbTeamReceivers = playerPool.filter(p => 
      ['WR', 'TE'].includes(p.position?.toUpperCase()) &&
      p.team === qbTeam &&
      !lineup.some(s => s.player === p.name)
    ).sort((a, b) => (b.ceilingScore || b.projected_pts || 0) - (a.ceilingScore || a.projected_pts || 0));
    
    if (qbTeamReceivers.length > 0) {
      const bestReceiver = qbTeamReceivers[0];
      
      // Find the worst non-QB receiver to swap out
      const nonQbTeamReceivers = lineup.filter(s => 
        ['WR', 'TE'].includes(s.position) && s.team !== qbTeam
      ).sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0));
      
      if (nonQbTeamReceivers.length > 0) {
        const swapOut = nonQbTeamReceivers[0];
        const swapIdx = lineup.findIndex(s => s.player === swapOut.player);
        
        if (swapIdx !== -1) {
          const oldPlayer = lineup[swapIdx].player;
          lineup[swapIdx] = {
            ...lineup[swapIdx],
            player: bestReceiver.name,
            team: bestReceiver.team,
            salary: bestReceiver.salary,
            projected_pts: bestReceiver.projected_pts || bestReceiver.ceilingScore,
            stackSwap: true
          };
          
          changes.push({
            type: 'PRIMARY_STACK',
            swappedOut: oldPlayer,
            swappedIn: bestReceiver.name,
            reason: `Stack ${bestReceiver.name} with QB ${qbSlot.player}`
          });
          
          console.log(`[Stacking] 🔄 Swapped ${oldPlayer} → ${bestReceiver.name} (QB stack)`);
          
          stackInfo.primaryStack = {
            qb: qbSlot.player,
            receivers: [bestReceiver.name],
            team: qbTeam
          };
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 2: BRINGBACK - 1 skill player from opposing team
  // ═══════════════════════════════════════════════════════════════════════════
  // Find the opponent of the QB's team from game context
  const games = context.games || [];
  let opponentTeam = null;
  
  for (const game of games) {
    if (game.home_team === qbTeam) {
      opponentTeam = game.visitor_team || game.away_team;
      break;
    } else if (game.visitor_team === qbTeam || game.away_team === qbTeam) {
      opponentTeam = game.home_team;
      break;
    }
  }
  
  if (opponentTeam) {
    const opponentSkillPlayers = lineup.filter(s => 
      ['WR', 'RB', 'TE'].includes(s.position) && s.team === opponentTeam
    );
    
    if (opponentSkillPlayers.length >= 1) {
      stackInfo.bringback = {
        player: opponentSkillPlayers[0].player,
        team: opponentTeam
      };
      opponentSkillPlayers[0].isStack = true;
      console.log(`[Stacking] ✅ Bringback: ${opponentSkillPlayers[0].player} (${opponentTeam})`);
    } else {
      console.log(`[Stacking] ⚠️ No bringback from ${opponentTeam} - looking for swap...`);
      
      // Find skill player from opponent in player pool
      const opponentPlayers = playerPool.filter(p => 
        ['WR', 'RB', 'TE'].includes(p.position?.toUpperCase()) &&
        p.team === opponentTeam &&
        !lineup.some(s => s.player === p.name)
      ).sort((a, b) => (b.ceilingScore || b.projected_pts || 0) - (a.ceilingScore || a.projected_pts || 0));
      
      if (opponentPlayers.length > 0) {
        const bestBringback = opponentPlayers[0];
        
        // Find the worst skill player NOT from QB's team or opponent to swap out
        const swappablePlayers = lineup.filter(s => 
          ['WR', 'RB', 'TE'].includes(s.position) && 
          s.team !== qbTeam && 
          s.team !== opponentTeam
        ).sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0));
        
        if (swappablePlayers.length > 0) {
          const swapOut = swappablePlayers[0];
          const swapIdx = lineup.findIndex(s => s.player === swapOut.player);
          
          if (swapIdx !== -1) {
            const oldPlayer = lineup[swapIdx].player;
            lineup[swapIdx] = {
              ...lineup[swapIdx],
              player: bestBringback.name,
              team: bestBringback.team,
              salary: bestBringback.salary,
              projected_pts: bestBringback.projected_pts || bestBringback.ceilingScore,
              bringbackSwap: true
            };
            
            changes.push({
              type: 'BRINGBACK',
              swappedOut: oldPlayer,
              swappedIn: bestBringback.name,
              reason: `Bringback from ${opponentTeam} (opponent of ${qbTeam})`
            });
            
            console.log(`[Stacking] 🔄 Swapped ${oldPlayer} → ${bestBringback.name} (Bringback)`);
            
            stackInfo.bringback = {
              player: bestBringback.name,
              team: opponentTeam
            };
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 3: DEFENSIVE STACK (Optional) - DST + RB from same team
  // ═══════════════════════════════════════════════════════════════════════════
  const dstSlot = lineup.find(s => s.position === 'DST');
  if (dstSlot) {
    const dstTeam = dstSlot.team;
    const sameTeamRB = lineup.filter(s => s.position === 'RB' && s.team === dstTeam);
    
    if (sameTeamRB.length >= 1) {
      stackInfo.defensiveStack = {
        dst: dstSlot.player,
        rb: sameTeamRB[0].player,
        team: dstTeam
      };
      console.log(`[Stacking] ✅ Defensive stack: ${dstSlot.player} + ${sameTeamRB[0].player} (${dstTeam})`);
    } else {
      // Defensive stack is optional - just log for now
      console.log(`[Stacking] ℹ️ No RB from ${dstTeam} for defensive stack (optional)`);
    }
  }
  
  // Check overall compliance
  stackInfo.compliant = !!(stackInfo.primaryStack && stackInfo.bringback);
  
  if (stackInfo.compliant) {
    console.log(`[Stacking] ✅ STACK COMPLETE: Primary=${stackInfo.primaryStack.team}, Bringback=${stackInfo.bringback?.team || 'none'}`);
  } else {
    console.log(`[Stacking] ⚠️ Stack incomplete - lineup may underperform in GPP`);
  }
  
  return { lineup, stackInfo, changes };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NBA GAME STACKING - 10 COMMANDMENTS ENFORCEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * "THOU SHALT CORRELATE THY LINEUP - 4-5 players from 1-2 games"
 * 
 * This function enforces game-based correlation for NBA GPPs.
 * Unlike NFL where we stack QB+WR, NBA stacking is about:
 * 1. Game stacks (players from both sides of a high-total game)
 * 2. Team stacks (2-3 from same team in good matchup)
 * 
 * @param {Array} lineup - Current lineup slots
 * @param {Array} players - Full player pool
 * @param {Object} context - Game context with Vegas lines
 * @returns {Object} Stacked lineup with correlation info
 */

export 
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NBA GAME STACKING - 10 COMMANDMENTS ENFORCEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * "THOU SHALT CORRELATE THY LINEUP - 4-5 players from 1-2 games"
 * 
 * This function enforces game-based correlation for NBA GPPs.
 * Unlike NFL where we stack QB+WR, NBA stacking is about:
 * 1. Game stacks (players from both sides of a high-total game)
 * 2. Team stacks (2-3 from same team in good matchup)
 * 
 * @param {Array} lineup - Current lineup slots
 * @param {Array} players - Full player pool
 * @param {Object} context - Game context with Vegas lines
 * @returns {Object} Stacked lineup with correlation info
 */
function enforceNBAGameStacking(lineup, players, context = {}) {
  const stackInfo = { gameStacks: [], teamStacks: [], correlationScore: 0 };
  const changes = [];
  
  // Count players per game
  const gamesInLineup = {};
  const teamsInLineup = {};
  
  lineup.forEach(slot => {
    const gameId = slot.gameId || `${slot.team}_game`;
    const team = slot.team;
    
    gamesInLineup[gameId] = (gamesInLineup[gameId] || 0) + 1;
    teamsInLineup[team] = (teamsInLineup[team] || 0) + 1;
  });
  
  // Find games with multiple players (good correlation)
  const correlatedGames = Object.entries(gamesInLineup).filter(([, count]) => count >= 2);
  const totalCorrelatedPlayers = correlatedGames.reduce((sum, [, count]) => sum + count, 0);
  
  console.log(`\n[DFS Correlation] 🎯 GPP Stack Analysis:`);
  
  // Log team stacks
  Object.entries(teamsInLineup).filter(([, count]) => count >= 2).forEach(([team, count]) => {
    console.log(`   ✅ ${team}: ${count} players stacked (same-team correlation)`);
    stackInfo.teamStacks.push({ team, count });
  });
  
  // Log game stacks (players from both sides)
  const games = context.games || [];
  games.forEach(game => {
    const homeCount = teamsInLineup[game.homeTeam] || 0;
    const awayCount = teamsInLineup[game.awayTeam] || 0;
    if (homeCount >= 1 && awayCount >= 1) {
      const total = homeCount + awayCount;
      console.log(`   ✅ ${game.awayTeam} vs ${game.homeTeam}: ${total} players (game stack - shootout potential)`);
      stackInfo.gameStacks.push({
        game: `${game.awayTeam}@${game.homeTeam}`,
        homeCount,
        awayCount,
        total: game.total || 220
      });
    }
  });
  
  // Calculate correlation score (0-100)
  // Target: 4-5 players from 1-2 games
  const distinctGames = Object.keys(gamesInLineup).length;
  const maxTeamStack = Math.max(...Object.values(teamsInLineup));
  
  let correlationScore = 50; // Base score
  
  // Bonus for concentrated lineup (fewer games = more correlation)
  if (distinctGames <= 3) correlationScore += 20;
  else if (distinctGames <= 4) correlationScore += 10;
  else if (distinctGames >= 6) correlationScore -= 15; // Too spread out
  
  // Bonus for team stacks
  if (maxTeamStack >= 3) correlationScore += 15;
  else if (maxTeamStack >= 2) correlationScore += 5;
  
  // Bonus for game stacks (both sides of a game)
  if (stackInfo.gameStacks.length >= 1) correlationScore += 15;
  
  stackInfo.correlationScore = Math.min(100, Math.max(0, correlationScore));
  
  // If correlation is weak, log warning
  if (totalCorrelatedPlayers < 4) {
    console.log(`   ⚠️ LOW CORRELATION: Only ${totalCorrelatedPlayers} players correlated. GPPs need 4-5.`);
  } else {
    console.log(`   ✅ CORRELATION OK: ${totalCorrelatedPlayers} players correlated across ${correlatedGames.length} games`);
  }
  
  return { lineup, stackInfo, changes };
}

/**
 * Main entry point: Generate complete DFS lineup with pivots
 * @param {Object} params - Generation parameters
 * @param {string} params.platform - 'draftkings' or 'fanduel'
 * @param {string} params.sport - 'NBA' or 'NFL'
 * @param {Array} params.players - Player pool with salaries and stats
 * @param {Object} params.context - Optional narrative context (fadePlayers, targetPlayers, contestType)
 * @returns {Object} Complete lineup object
 */


/**
 * Main entry point: Generate complete DFS lineup with pivots
 * @param {Object} params - Generation parameters
 * @param {string} params.platform - 'draftkings' or 'fanduel'
 * @param {string} params.sport - 'NBA' or 'NFL'
 * @param {Array} params.players - Player pool with salaries and stats
 * @param {Object} params.context - Optional narrative context (fadePlayers, targetPlayers, contestType)
 * @returns {Object} Complete lineup object
 */
export async function generateDFSLineup({ platform, sport, players, context = {} }) {
  const constraints = PLATFORM_CONSTRAINTS[platform]?.[sport];
  if (!constraints) {
    throw new Error(`Unsupported platform/sport combination: ${platform}/${sport}`);
  }
  
  // Get contest type (GPP or Cash) from context
  const contestType = context.contestType || 'gpp';
  const isGPP = contestType === 'gpp';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S SHARP DFS PHILOSOPHY
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary is a GAMBLER who finds VALUE, not a MODEL that outputs highest projections.
  //
  // WHAT SEPARATES GARY FROM AN OPTIMIZER:
  // - Optimizer: "Player A projects 48.5, Player B projects 47.2, pick A"
  // - Gary: "Player B just got promoted to PP1 two days ago. His salary is still 
  //          priced for PP2. The projection sites haven't updated. I'm taking B."
  //
  // GARY'S APPROACH:
  // Investigate the factors. Understand the opportunity. Make the lineup based on his analysis.
  //
  // HARD FACTORS (Trust These): Usage, minutes, target share, DvP rankings
  // SOFT FACTORS (Verify These): Narratives, ownership, "hot streaks"
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S AUTONOMY: No prescribed strategy - Gary builds what he believes wins
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary uses his own DFS expertise and reasoning to build the optimal lineup.
  // He naturally considers all available data: usage, value, correlations, 
  // ownership, matchups, injuries, pace - and synthesizes his own strategy.
  //
  // We trust Gary's natural understanding of DFS construction. His edge comes
  // from independent analysis and conviction, not following preset archetypes.
  //
  // Build type identification happens AFTER Gary builds (for reporting only).
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get winning targets for this contest type
  const winningTargets = GARY_SHARP_KNOWLEDGE.winning_targets[sport]?.[platform] || {};
  const contestSize = context.contestSize || 'gpp_medium'; // Default to medium GPP
  const targetInfo = winningTargets[contestSize] || winningTargets['gpp_medium'] || { win: 350, cash: 280 };
  const winTarget = isGPP ? targetInfo.win : targetInfo.cash;
  
  console.log(`\n[DFS Lineup] 🎰 Generating ${platform.toUpperCase()} ${sport} lineup (${contestType.toUpperCase()})`);
  console.log(`[DFS Lineup] 🎯 Winning Target: ${winTarget}+ pts ${isGPP ? '(GPP 1st place)' : '(cash line)'}`);
  console.log(`[DFS Lineup] 🧠 Gary building lineup based on his analysis...`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROTOWIRE INTELLIGENCE: Benchmarking & Forced Locks
  // ═══════════════════════════════════════════════════════════════════════════
  const playersWithProjections = players.map(p => {
    let projected_pts = p.projected_pts || calculateProjectedPoints(p, sport, platform, contestType);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GARY'S AUTONOMY - Trust His Analysis
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary makes his own decisions. Benchmark is INFORMATIONAL ONLY.
    // We log the comparison for transparency but DON'T override Gary's projection.
    // Gary's edge comes from independent analysis, not consensus-following.
    // ═══════════════════════════════════════════════════════════════════════════
    if (p.benchmarkProjection > 0) {
      const garyDiff = projected_pts - p.benchmarkProjection;
      const absDiff = Math.abs(garyDiff);
      
      // Log significant differences for transparency (no projection changes)
      if (absDiff > 10) {
        if (garyDiff > 0) {
          console.log(`[DFS Lineup] 📊 Gary's edge: ${p.name} - Gary ${projected_pts.toFixed(1)} vs Market ${p.benchmarkProjection.toFixed(1)} (+${garyDiff.toFixed(1)})`);
        } else {
          console.log(`[DFS Lineup] 📊 Gary's fade: ${p.name} - Gary ${projected_pts.toFixed(1)} vs Market ${p.benchmarkProjection.toFixed(1)} (${garyDiff.toFixed(1)})`);
        }
      }
      // Gary's projection stands - he makes his own decisions
    }

    return {
      ...p,
      projected_pts,
      // Pass confirmed starter flag for locking
      forcedLock: p.isConfirmedStarter || false
    };
  });

  // Step 1: Initial greedy optimization
  const initialResult = optimizeLineup(
    playersWithProjections,
    constraints,
    sport,
    platform,
    { ...context, contestType }
  );
  
  // Step 2: Apply Sport-Specific Stacking Rules (GPP only)
  let stackedResult = { lineup: initialResult.lineup, stackInfo: null, changes: [] };
  
  if (sport === 'NFL' && isGPP) {
    console.log(`\n[DFS Lineup] 🏈 Applying NFL Stacking Rules...`);
    stackedResult = applyNFLStackingRules(
      [...initialResult.lineup], // Copy to avoid mutation
      playersWithProjections,
      constraints,
      platform,
      context
    );
    
    if (stackedResult.changes.length > 0) {
      console.log(`[DFS Lineup] 📋 Stacking changes: ${stackedResult.changes.length}`);
      stackedResult.changes.forEach(c => {
        console.log(`   - ${c.type}: ${c.swappedOut} → ${c.swappedIn}`);
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NBA GAME CORRELATION ANALYSIS (GPP only)
  // ═══════════════════════════════════════════════════════════════════════════
  // In NBA GPP, winning lineups often have 2-3 players from the same high-total game.
  // This captures "shootout" upside - if one player smashes, teammates likely benefit.
  // 
  // AWARENESS: Gary investigates correlation opportunities, doesn't force them.
  // ═══════════════════════════════════════════════════════════════════════════
  if (sport === 'NBA' && isGPP) {
    const currentLineup = stackedResult.lineup;
    
    // Analyze current team distribution
    const teamCounts = {};
    const gameTeams = {}; // Map teams to their opponents
    
    currentLineup.forEach(p => {
      if (p.team) {
        teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
      }
    });
    
    // Build game pairings from player pool (teams that play each other)
    const teamsInPool = [...new Set(playersWithProjections.map(p => p.team).filter(Boolean))];
    // Note: Game pairing info should come from context - this is awareness-based
    
    // Check for natural stacks (2+ from same team)
    const naturalStacks = Object.entries(teamCounts).filter(([_, count]) => count >= 2);
    
    // Check for game stacks (players from both sides of a matchup)
    const gameStacks = [];
    if (context.games && Array.isArray(context.games)) {
      context.games.forEach(game => {
        const homeTeam = game.home_team?.abbreviation || game.home_team;
        const awayTeam = game.visitor_team?.abbreviation || game.away_team || game.visitor_team;
        
        const homeCount = teamCounts[homeTeam] || 0;
        const awayCount = teamCounts[awayTeam] || 0;
        
        if (homeCount > 0 && awayCount > 0) {
          gameStacks.push({ home: homeTeam, away: awayTeam, total: homeCount + awayCount });
        }
      });
    }
    
    // Log correlation analysis
    if (naturalStacks.length > 0 || gameStacks.length > 0) {
      console.log(`\n[DFS Correlation] 🎯 GPP Stack Analysis:`);
      naturalStacks.forEach(([team, count]) => {
        console.log(`   ✅ ${team}: ${count} players stacked (same-team correlation)`);
      });
      gameStacks.forEach(gs => {
        console.log(`   ✅ ${gs.home} vs ${gs.away}: ${gs.total} players (game stack - shootout potential)`);
      });
      stackedResult.stackInfo = { naturalStacks, gameStacks };
    } else {
      // No correlation - flag for awareness (not automatic fix)
      console.log(`\n[DFS Correlation] ⚠️ No game correlation detected - lineup is diversified`);
      console.log(`   ℹ️ Diversification can cap ceiling in GPP. Consider if a game stack makes sense.`);
      stackedResult.stackInfo = { warning: 'no_correlation', teams: Object.keys(teamCounts) };
    }
  }
  
  // Step 3: Gary's 2-round self-review (salary efficiency + ownership)
  const reviewedResult = selfReviewLineup(
    stackedResult.lineup,
    playersWithProjections,
    constraints,
    sport,
    platform,
    { contestType } // Pass contest type for ownership logic
  );
  
  // Step 4: Add pivots to the reviewed lineup
  const lineupWithPivots = addPivotsToLineup(
    reviewedResult.lineup,
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  // Calculate ceiling-based projected points for GPP
  const projectedPoints = isGPP
    ? Math.round(lineupWithPivots.reduce((sum, p) => sum + (p.ceilingScore || p.projected_pts || 0), 0) * 10) / 10
    : Math.round(reviewedResult.projectedPoints * 10) / 10;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ CRITICAL: HARD SALARY CAP ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  // Fantasy contests CANNOT submit lineups over the cap - it's literally impossible
  // If we somehow ended up over (due to stacking/review logic), we MUST fix it
  // ═══════════════════════════════════════════════════════════════════════════
  let finalTotalSalary = reviewedResult.totalSalary;
  let finalLineup = lineupWithPivots;
  
  if (finalTotalSalary > constraints.salaryCap) {
    console.log(`\n[DFS Lineup] 🚨 CRITICAL: Lineup exceeds salary cap by $${finalTotalSalary - constraints.salaryCap}!`);
    console.log(`[DFS Lineup] 🔧 Applying emergency downgrade to meet cap...`);
    
    // Find the most expensive player and downgrade to next-best affordable option
    // Sort lineup by salary (highest first)
    const sortedByPrice = [...finalLineup].sort((a, b) => b.salary - a.salary);
    
    // Try to downgrade expensive players until we're under cap
    for (const expensiveSlot of sortedByPrice) {
      const overAmount = finalTotalSalary - constraints.salaryCap;
      if (overAmount <= 0) break; // We're good now
      
      // Find cheaper alternative for this position
      const position = expensiveSlot.position;
      const usedNames = new Set(finalLineup.map(p => p.player));
      usedNames.delete(expensiveSlot.player); // Allow replacing current player
      
      const alternatives = playersWithProjections.filter(p => {
        if (usedNames.has(p.name)) return false;
        if (p.status === 'OUT') return false;
        if (p.salary <= 0) return false;
        
        // Check if player can fill this position
        const pos = p.position?.toUpperCase();
        const eligibleSlots = getEligibleSlots(pos, sport);
        return eligibleSlots.includes(position);
      }).sort((a, b) => b.projected_pts - a.projected_pts); // Best first
      
      // Find alternative that saves enough money
      for (const alt of alternatives) {
        const savingsNeeded = overAmount;
        const actualSavings = expensiveSlot.salary - alt.salary;
        
        if (actualSavings >= savingsNeeded && alt.salary <= expensiveSlot.salary) {
          // Swap it out
          console.log(`[DFS Lineup] 💱 Downgrade: ${expensiveSlot.player} ($${expensiveSlot.salary}) → ${alt.name} ($${alt.salary}) | Saves $${actualSavings}`);
          
          const idx = finalLineup.findIndex(p => p.player === expensiveSlot.player);
          finalLineup[idx] = {
            position,
            player: alt.name,
            team: alt.team,
            salary: alt.salary,
            projected_pts: alt.projected_pts,
            rationale: `Emergency downgrade to meet salary cap`,
            supportingStats: [],
            pivots: [],
            ownership: alt.ownership,
            recentForm: alt.recentForm,
            dvpRank: alt.dvpRank
          };
          
          finalTotalSalary = finalLineup.reduce((sum, p) => sum + p.salary, 0);
          break;
        }
      }
    }
    
    // Final verification
    if (finalTotalSalary > constraints.salaryCap) {
      console.error(`[DFS Lineup] ❌ FAILED TO FIX SALARY CAP! Still over by $${finalTotalSalary - constraints.salaryCap}`);
      console.error(`[DFS Lineup] ❌ This lineup CANNOT be submitted to ${platform}!`);
    } else {
      console.log(`[DFS Lineup] ✅ Salary cap met: $${finalTotalSalary}/$${constraints.salaryCap}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: VALIDATION & WARNINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1. Validate punt count
  let puntValidation = validatePuntCount(finalLineup, platform, contestType);
  let puntFixAttempted = false;
  let puntFixSuccess = false;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FRAGILE FLOOR AWARENESS (Not Forced Auto-Fix)
  // ═══════════════════════════════════════════════════════════════════════════
  // Having 3-4 punt plays isn't always bad - it depends on the slate:
  // - If punts have high ceilings (breakout candidates), keep them
  // - If punts are low-floor/low-ceiling, consider upgrading
  // 
  // Gary investigates whether the punts are intentional (Stars & Scrubs strategy)
  // or accidental (optimizer couldn't find better options).
  // ═══════════════════════════════════════════════════════════════════════════
  if (!puntValidation.valid) {
    puntFixAttempted = true;
    console.log(`[DFS Self-Heal] ⚠️ Fragile floor detected: ${puntValidation.puntCount} punts (max: 2)`);
    
    // INVESTIGATE: Are these punts intentional high-ceiling plays?
    const puntPlayers = puntValidation.puntPlayers || [];
    const intentionalPunts = puntPlayers.filter(p => {
      const lineupPlayer = finalLineup.find(lp => lp.player === p.name);
      // High ceiling OR narrative target = intentional
      return (lineupPlayer?.ceilingScore || 0) > 25 || 
             lineupPlayer?.isTarget || 
             lineupPlayer?.narrativeModified ||
             lineupPlayer?.teammateOpportunity;
    });
    
    if (intentionalPunts.length >= puntValidation.puntCount - 1) {
      // Most punts are intentional high-ceiling plays - this is Stars & Scrubs
      console.log(`[DFS Self-Heal] ✅ ${intentionalPunts.length}/${puntValidation.puntCount} punts have ceiling upside - intentional strategy`);
      puntFixSuccess = true; // Mark as "handled" even though we didn't change anything
    } else {
      // Some punts are unintentional low-floor plays - try to upgrade
      const threshold = PUNT_SALARY_THRESHOLD[platform] || 4500;
      const midRangeMin = threshold + 500; // Just above punt threshold
      const midRangeMax = 7500; // More flexible range
      const salaryCap = constraints.salaryCap;
      
      // Calculate current salary and remaining budget
      const currentSalary = finalLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
      let remaining = salaryCap - currentSalary;
      
      // Only upgrade punts that aren't intentional ceiling plays
      const puntsToUpgrade = puntPlayers
        .filter(p => !intentionalPunts.some(ip => ip.name === p.name))
        .sort((a, b) => a.salary - b.salary);
      
      // Only need to fix enough to get to max 2 punts
      const puntsToFix = Math.max(0, puntValidation.puntCount - 2 - intentionalPunts.length);
      let fixedCount = 0;
      
      if (puntsToFix === 0) {
        console.log(`[DFS Self-Heal] ✅ Intentional punts bring count to acceptable level`);
        puntFixSuccess = true;
      } else {
        // Need to upgrade some punts - try to find mid-range alternatives
        for (let i = 0; i < Math.min(puntsToFix, puntsToUpgrade.length); i++) {
      const puntPlayer = puntsToUpgrade[i];
      const slotIndex = finalLineup.findIndex(s => s.player === puntPlayer.name);
      if (slotIndex === -1) continue;
      
      const slot = finalLineup[slotIndex];
      const maxUpgradeSpend = remaining + slot.salary;
      
      // Find mid-range alternatives for this position
      const alternatives = players.filter(p => {
        const playerPos = p.position || '';
        const slotPos = slot.position || '';
        const salary = p.salary || 0;
        const alreadyUsed = finalLineup.some(s => s.player === p.name);
        
        // ⭐ Use Tank01's platform-specific positions when available
        const eligible = sport === 'NBA' 
          ? isPositionEligible(playerPos, slotPos, sport, p.allPositions)
          : playerPos === slotPos || slotPos === 'FLEX';
        
        return eligible && 
               !alreadyUsed && 
               salary >= midRangeMin && 
               salary <= Math.min(midRangeMax, maxUpgradeSpend);
      }).sort((a, b) => {
        // Sort by value (pts per $1k)
        const aVal = (a.projection || 0) / ((a.salary || 5000) / 1000);
        const bVal = (b.projection || 0) / ((b.salary || 5000) / 1000);
        return bVal - aVal;
      });
      
      if (alternatives.length > 0) {
        const upgrade = alternatives[0];
        const oldSalary = slot.salary;
        const newSalary = upgrade.salary || 5000;
        
        console.log(`[DFS Self-Heal] 🔄 Upgrading ${slot.player} ($${oldSalary}) → ${upgrade.name} ($${newSalary})`);
        
        // Swap the player
        finalLineup[slotIndex] = {
          position: slot.position,
          player: upgrade.name,
          team: upgrade.team,
          salary: newSalary,
          projected_pts: upgrade.projection || 0,
          ownership: upgrade.ownership || 15,
          ...upgrade
        };
        
        remaining -= (newSalary - oldSalary);
          fixedCount++;
        }
        }
        
        if (fixedCount > 0) {
          puntFixSuccess = true;
          console.log(`[DFS Self-Heal] ✅ Fixed ${fixedCount} punt plays`);
          // Re-validate after fixes
          puntValidation = validatePuntCount(finalLineup, platform, contestType);
        } else if (puntsToFix > 0) {
          console.log(`[DFS Self-Heal] ℹ️ Could not find mid-range upgrades - punts may be intentional`);
        }
      } // end else (puntsToFix > 0)
    } // end else (not all intentional)
  }
  
  // 2. Check anti-correlation
  const antiCorrelation = checkAntiCorrelation(finalLineup, sport);
  
  // 3. Check chalk fade opportunity
  const chalkFade = applyChalkFadeStrategy(players, finalLineup, contestType);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD GARY'S NOTES - Deep statistical analysis with narrative context
  // ═══════════════════════════════════════════════════════════════════════════
  const garyNotes = [];
  
  // Helper to get player stats from context or player object
  const getPlayerStats = (p) => {
    const stats = p.seasonStats || {};
    const l5 = p.l5Stats || {};
    return {
      ppg: stats.ppg || p.ppg || 0,
      mpg: stats.mpg || p.mpg || 0,
      apg: stats.apg || p.apg || 0,
      rpg: stats.rpg || p.rpg || 0,
      usage: stats.usage || p.usage || 0,
      l5Ppg: l5.ppg || p.l5AvgPts || 0,
      l5Mpg: l5.mpg || 0,
      l5FPts: l5.fpts || p.l5AvgFpts || 0,
      recentForm: p.recentForm || (l5.ppg > (stats.ppg || 0) * 1.1 ? 'hot' : 'neutral')
    };
  };
  
  // Calculate lineup stats for insights
  const totalProjection = finalLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  const totalSalary = finalLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  const avgOwnership = finalLineup.reduce((sum, p) => sum + (p.ownership || 15), 0) / finalLineup.length;
  
  // Sort players by projection for analysis
  const sortedByProjection = [...finalLineup].sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
  const topPlay = sortedByProjection[0];
  const secondPlay = sortedByProjection[1];
  const thirdPlay = sortedByProjection[2];
  
  // Find players with specific edges
  const matchupPlays = finalLineup.filter(p => p.dvpRank && p.dvpRank <= 10);
  const usageBoostPlays = finalLineup.filter(p => 
    p.usageBoost || 
    p.narrativeNote || 
    p.injuryBeneficiary || 
    p.teammateOpportunity // From injury context
  );
  const hotPlays = finalLineup.filter(p => {
    const stats = getPlayerStats(p);
    return p.recentForm === 'hot' || (stats.l5Ppg > stats.ppg * 1.1);
  });
  const minutesPlays = finalLineup.filter(p => p.minutesTrend === 'increasing' || p.rotation_status === 'expanded_role');
  const puntPlays = finalLineup.filter(p => (p.salary || 0) < 4500);
  const coreStars = finalLineup.filter(p => (p.salary || 0) >= 8000);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CONCISE GARY'S NOTES - Just the key facts
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Team stacks
  const teamCounts = {};
  finalLineup.forEach(p => {
    teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });
  const stacks = Object.entries(teamCounts).filter(([_, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  
  // Ownership stats
  const chalkPlays = finalLineup.filter(p => (p.ownership || 15) > 25);
  const contrarianPlays = finalLineup.filter(p => (p.ownership || 15) < 10);
  
  // Build concise notes
  
  // 1. CORE PLAYS (top 2 by salary)
  if (topPlay) {
    const topStats = getPlayerStats(topPlay);
    let topReason = '';
    if (topPlay.usageBoost || topPlay.injuryBeneficiary) {
      topReason = ` - ${topPlay.usageBoost || topPlay.injuryBeneficiary}`;
    } else if (topStats.l5Ppg > topStats.ppg * 1.1 && topStats.ppg > 0) {
      topReason = ` - Hot (${topStats.l5Ppg.toFixed(0)} L5 vs ${topStats.ppg.toFixed(0)} season)`;
    } else if (topPlay.dvpRank && topPlay.dvpRank <= 8) {
      topReason = ` - Elite matchup (#${topPlay.dvpRank} DvP)`;
    }
    garyNotes.push(`🎯 ANCHOR: ${topPlay.player} $${(topPlay.salary/1000).toFixed(1)}K${topReason}`);
  }
  
  if (secondPlay && secondPlay.projected_pts >= 30) {
    const secStats = getPlayerStats(secondPlay);
    let secReason = '';
    if (secondPlay.usageBoost) {
      secReason = ` - ${secondPlay.usageBoost}`;
    } else if (secStats.l5Ppg > secStats.ppg * 1.1 && secStats.ppg > 0) {
      secReason = ` - Trending up`;
    }
    garyNotes.push(`🎯 SECONDARY: ${secondPlay.player} $${(secondPlay.salary/1000).toFixed(1)}K${secReason}`);
  }
  
  // 2. USAGE BOOST (if any key injury plays)
  const keyUsagePlays = usageBoostPlays.slice(0, 2);
  if (keyUsagePlays.length > 0) {
    const usageNote = keyUsagePlays.map(p => {
      const outStar = p.teammateOpportunity?.outStars?.[0] || '';
      return `${p.player}${outStar ? ` (${outStar} OUT)` : ''}`;
    }).join(', ');
    garyNotes.push(`🚀 USAGE BOOST: ${usageNote}`);
  }
  
  // 3. STACKS (one line)
  if (stacks.length > 0) {
    const stackNote = stacks.map(([team, count]) => `${team} x${count}`).join(', ');
    garyNotes.push(`📊 STACKS: ${stackNote}`);
  }
  
  // 4. VALUE PLAYS (punts under $4.5K)
  if (puntPlays.length > 0) {
    const puntNote = puntPlays.slice(0, 3).map(p => {
      const val = ((p.projected_pts || 0) / ((p.salary || 4000) / 1000)).toFixed(1);
      return `${p.player} (${val}x)`;
    }).join(', ');
    garyNotes.push(`💎 VALUE: ${puntNote}`);
  }
  
  // 5. OWNERSHIP (one line)
  const ownNote = chalkPlays.length > 2 
    ? `Chalky build (${chalkPlays.length} over 25%)`
    : contrarianPlays.length >= 3
      ? `Contrarian (${contrarianPlays.length} under 10%)`
      : `Balanced (${avgOwnership.toFixed(0)}% avg)`;
  garyNotes.push(`📈 OWNERSHIP: ${ownNote}`);
  
  // 6. STARS RETURNING (if impacts lineup)
  const playersWithStarReturning = finalLineup.filter(p => p.starReturning);
  if (playersWithStarReturning.length > 0) {
    const stars = [...new Set(playersWithStarReturning.map(p => p.starReturning?.star))];
    const restrictions = playersWithStarReturning[0]?.starReturning?.minutesRestriction;
    const note = restrictions ? ` (${restrictions})` : '';
    garyNotes.push(`⚠️ MONITOR: ${stars.join(', ')} returning${note}`);
  }
  
  // 7. KEY RISK (if fragile build)
  if (puntPlays.length >= 3) {
    garyNotes.push(`⚠️ RISK: ${puntPlays.length} punts - needs stars to hit`);
  }
  
  // 8. INVESTIGATE FLAGS - Gary should verify large stacks
  const largeStacks = stacks.filter(([team, count]) => count >= 4);
  
  if (largeStacks.length > 0) {
    const stackNote = largeStacks.map(([team, count]) => `${team} x${count}`).join(', ');
    garyNotes.push(`🔍 STACK CHECK: ${stackNote} - verify game total/pace supports`);
  }
  
  // 9. PUNT INVESTIGATION - Flag punts that need verification
  const riskyPunts = puntPlays.filter(p => {
    const stats = getPlayerStats(p);
    // Flag punts with low MPG or no recent form data
    return stats.mpg < 20 || !p.l5Stats;
  });
  if (riskyPunts.length > 0) {
    const puntNames = riskyPunts.map(p => p.player).join(', ');
    garyNotes.push(`🔍 PUNT CHECK: ${puntNames} - low floor, verify minutes`);
  }
  
  // NFL Stack info (if present)
  if (stackedResult.stackInfo?.primaryStack) {
    const stack = stackedResult.stackInfo;
    garyNotes.push(`🏈 STACK: ${stack.primaryStack.qb} + ${stack.primaryStack.receivers?.slice(0, 2).join(', ')}`);
    if (stack.bringback) {
      garyNotes.push(`↩️ BRINGBACK: ${stack.bringback.player}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SORT LINEUP BY PLATFORM POSITION ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  // FanDuel NBA: PG, PG, SG, SG, SF, SF, PF, PF, C
  // DraftKings NBA: PG, SG, SF, PF, C, G, F, UTIL
  // Sort the final lineup to match the platform's expected roster order
  // ═══════════════════════════════════════════════════════════════════════════
  const positionOrder = constraints.positions;
  const sortedLineup = [];
  const positionCounts = {};
  
  // Sort lineup players into their correct roster slots
  for (const pos of positionOrder) {
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    
    // Find the next player assigned to this position slot
    const player = finalLineup.find(p => {
      const matchesPosition = p.position === pos;
      const notYetPlaced = !sortedLineup.some(s => s.player === p.player);
      return matchesPosition && notYetPlaced;
    });
    
    if (player) {
      sortedLineup.push(player);
    }
  }
  
  // If some players weren't matched (edge case), append them
  for (const player of finalLineup) {
    if (!sortedLineup.some(s => s.player === player.player)) {
      sortedLineup.push(player);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WINNING TARGET VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  const winTargetMet = projectedPoints >= winTarget;
  const shortfall = winTargetMet ? 0 : Math.round(winTarget - projectedPoints);
  
  if (winTargetMet) {
    console.log(`[DFS Lineup] ✅ Winning range achieved: ${projectedPoints.toFixed(1)} pts (target: ${winTarget}+)`);
  } else {
    console.log(`[DFS Lineup] ⚠️ Below winning range: ${projectedPoints.toFixed(1)} pts (need ${winTarget}+, short by ${shortfall})`);
  }
  
  // Final Lineup Object
  const finalLineupData = {
    platform,
    sport,
    contestType,
    salary_cap: constraints.salaryCap,
    total_salary: finalTotalSalary,
    projected_points: projectedPoints,
    // Winning target info
    winning_target: winTarget,
    winning_target_met: winTargetMet,
    shortfall: shortfall,
    // GPP-specific: ceiling-based projection target
    ceiling_projection: isGPP ? projectedPoints : null,
    floor_projection: Math.round(sortedLineup.reduce((sum, p) => sum + (p.floorScore || p.projected_pts * 0.7 || 0), 0) * 10) / 10,
    total_ceiling: Math.round(sortedLineup.reduce((sum, p) => sum + (p.ceiling_projection || p.projected_pts * 1.2 || 0), 0) * 10) / 10,
    total_floor: Math.round(sortedLineup.reduce((sum, p) => sum + (p.floor_projection || p.projected_pts * 0.7 || 0), 0) * 10) / 10,
    // Stacking info for NFL
    stackInfo: stackedResult.stackInfo,
    lineup: sortedLineup,
    avg_ownership: sortedLineup.reduce((sum, p) => sum + (p.ownership || 15), 0) / sortedLineup.length,
    // Validation results
    puntValidation,
    antiCorrelation,
    chalkFade,
    // Gary's notes
    gary_notes: garyNotes.join('\n')
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S SHARP AUDIT - The Final Polish
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary grades his own work against sharp gambler principles.
  // If the grade is low, he applies sharp fixes before presentation.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const auditedResult = await runSharpAuditCycle(finalLineupData, context, {
      sport,
      platform,
      contestType,
      originalPlayers: players // The full pool for fixes
    });
    
    // Merge Gary's notes with Audit insights if needed
    if (auditedResult.audit?.weaknesses?.length > 0) {
      const auditNotes = `\n\nSHARP AUDIT (Gary's Self-Correction):\n` + 
        auditedResult.audit.weaknesses.map(w => `• ${w}`).join('\n');
      auditedResult.gary_notes += auditNotes;
    }

    return auditedResult;
  } catch (err) {
    console.error(`[Sharp Audit] Error during audit cycle: ${err.message}`);
    return finalLineupData; // Return unaudited if it fails
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC POSITION ELIGIBILITY
// ═══════════════════════════════════════════════════════════════════════════════
// Tank01 API provides `allValidPositions` which are the ACTUAL positions the
// player is eligible for on DraftKings/FanDuel. These can differ between platforms!
// 
// Example: Kevin Durant
//   DK: ["SG", "SF"] 
//   FD: ["SF", "PF"]
// 
// We prioritize Tank01's platform-specific positions, then fall back to generic mapping.
// ═══════════════════════════════════════════════════════════════════════════════

// Helper function to check if a player position can fill a slot position
// Now accepts optional allPositions array from Tank01 for platform-specific eligibility

