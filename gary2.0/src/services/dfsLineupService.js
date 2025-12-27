/**
 * DFS Lineup Service
 * Core lineup optimization and pivot generation for Gary's Fantasy
 * 
 * Supports:
 * - DraftKings and FanDuel platforms
 * - NBA and NFL sports
 * - 3-tier pivot alternatives per position (direct, mid, budget)
 */

// Platform constraints - hard-coded rules for each platform/sport
export const PLATFORM_CONSTRAINTS = {
  draftkings: {
    NBA: {
      salaryCap: 50000,
      rosterSize: 8,
      positions: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
      positionRules: {
        // BDL uses "G" for guards, "F" for forwards - map accordingly
        PG: { count: 1, eligible: ['PG', 'G'] },
        SG: { count: 1, eligible: ['SG', 'G'] },
        SF: { count: 1, eligible: ['SF', 'F', 'G-F', 'F-G'] },
        PF: { count: 1, eligible: ['PF', 'F', 'F-C', 'C-F'] },
        C: { count: 1, eligible: ['C', 'F-C', 'C-F'] },
        G: { count: 1, eligible: ['PG', 'SG', 'G', 'G-F', 'F-G'] },
        F: { count: 1, eligible: ['SF', 'PF', 'F', 'F-C', 'C-F', 'G-F', 'F-G'] },
        UTIL: { count: 1, eligible: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'G-F', 'F-G', 'F-C', 'C-F'] }
      }
    },
    NFL: {
      salaryCap: 50000,
      rosterSize: 9,
      positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DST'],
      positionRules: {
        QB: { count: 1, eligible: ['QB'] },
        RB: { count: 2, eligible: ['RB'] },
        WR: { count: 3, eligible: ['WR'] },
        TE: { count: 1, eligible: ['TE'] },
        FLEX: { count: 1, eligible: ['RB', 'WR', 'TE'] },
        DST: { count: 1, eligible: ['DST'] }
      }
    }
  },
  fanduel: {
    NBA: {
      salaryCap: 60000,
      rosterSize: 9,
      positions: ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C'],
      positionRules: {
        // BDL uses "G" for guards, "F" for forwards - map accordingly
        PG: { count: 2, eligible: ['PG', 'G'] },
        SG: { count: 2, eligible: ['SG', 'G'] },
        SF: { count: 2, eligible: ['SF', 'F', 'G-F', 'F-G'] },
        PF: { count: 2, eligible: ['PF', 'F', 'F-C', 'C-F'] },
        C: { count: 1, eligible: ['C', 'F-C', 'C-F'] }
      }
    },
    NFL: {
      salaryCap: 60000,
      rosterSize: 10, // FanDuel includes Kickers!
      positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST'],
      positionRules: {
        QB: { count: 1, eligible: ['QB'] },
        RB: { count: 2, eligible: ['RB'] },
        WR: { count: 3, eligible: ['WR'] },
        TE: { count: 1, eligible: ['TE'] },
        FLEX: { count: 1, eligible: ['RB', 'WR', 'TE'] },
        K: { count: 1, eligible: ['K'] },
        DST: { count: 1, eligible: ['DST'] }
      }
    }
  }
};

// Pivot tier configurations - alternatives for users to consider
// Gary picks his BEST lineup; these are just other options at different price points
const PIVOT_TIERS = {
  direct: {
    label: 'Direct Swap',
    description: 'Similar ceiling',
    salaryRange: { min: -500, max: 500 }
  },
  mid: {
    label: 'Mid Value',
    description: 'Save ~$1K',
    salaryRange: { min: -1500, max: -500 }
  },
  budget: {
    label: 'Budget Play',
    description: 'Punt spot',
    salaryRange: { min: -Infinity, max: -1500 }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DFS VALUE EQUATIONS - Key metrics for optimal lineup building
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate VALUE SCORE - Points per $1K of salary
 * This is the core DFS metric for identifying value plays
 * 
 * Target: 5x is baseline, 6x+ is elite value
 * 
 * @param {number} projectedPts - Projected fantasy points
 * @param {number} salary - Player salary
 * @returns {number} Value score (points per $1K)
 */
export function calculateValueScore(projectedPts, salary) {
  if (!salary || salary <= 0) return 0;
  return Math.round((projectedPts / (salary / 1000)) * 100) / 100;
}

/**
 * Calculate CEILING SCORE - Max upside potential
 * Based on best recent performance × situation multiplier
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context (matchup, usage, etc.)
 * @returns {number} Ceiling score
 */
export function calculateCeilingScore(player, context = {}) {
  const baseProjection = player.projected_pts || player.projectedPts || 0;
  
  // Situation multipliers
  let multiplier = 1.0;
  
  // Hot streak boost (+15% ceiling)
  if (context.recentForm === 'hot' || player.recentForm === 'hot') {
    multiplier += 0.15;
  }
  
  // Revenge game boost (+10%)
  if (context.isRevenge || player.isRevenge) {
    multiplier += 0.10;
  }
  
  // Usage spike boost (+20%)
  if (context.usageBoost || player.usageBoost) {
    multiplier += 0.20;
  }
  
  // Good DvP matchup boost (+10%)
  if (context.dvpRank && context.dvpRank <= 8) {
    multiplier += 0.10;
  }
  
  // Back-to-back reduction (-10%)
  if (context.isB2B || player.isB2B) {
    multiplier -= 0.10;
  }
  
  return Math.round(baseProjection * multiplier * 10) / 10;
}

/**
 * Calculate FLOOR SCORE - Minimum expected output
 * Based on worst recent performance (injury-adjusted)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context
 * @returns {number} Floor score
 */
export function calculateFloorScore(player, context = {}) {
  const baseProjection = player.projected_pts || player.projectedPts || 0;
  
  // Default floor is 70% of projection
  let floorPct = 0.70;
  
  // High-volume players have higher floor (+10%)
  if (player.snapPct && player.snapPct >= 85) {
    floorPct += 0.10;
  }
  
  // Cold streak lowers floor (-10%)
  if (context.recentForm === 'cold' || player.recentForm === 'cold') {
    floorPct -= 0.10;
  }
  
  // Blowout risk lowers floor (may sit 4th quarter) (-15%)
  if (context.blowoutRisk || player.blowoutRisk) {
    floorPct -= 0.15;
  }
  
  // Bad weather lowers floor for skill positions (-10%)
  if (context.weatherImpact === 'negative' || player.weatherImpact === 'negative') {
    floorPct -= 0.10;
  }
  
  return Math.round(baseProjection * floorPct * 10) / 10;
}

/**
 * Calculate CONSISTENCY RATING - How reliable is this player?
 * Higher = more consistent (good for cash games)
 * Lower = more volatile (boom/bust for GPPs)
 * 
 * Formula: 1 - (stdDev / mean)
 * 
 * @param {number} mean - Average fantasy points
 * @param {number} stdDev - Standard deviation of fantasy points
 * @returns {number} Consistency rating (0-1)
 */
export function calculateConsistencyRating(mean, stdDev) {
  if (!mean || mean <= 0) return 0;
  const rating = 1 - (stdDev / mean);
  return Math.max(0, Math.min(1, Math.round(rating * 100) / 100));
}

/**
 * Determine RECENT FORM based on last 5 games vs season average
 * 
 * @param {number} last5Avg - Average fantasy points last 5 games
 * @param {number} seasonAvg - Season average fantasy points
 * @returns {string} 'hot' | 'cold' | 'neutral'
 */
export function determineRecentForm(last5Avg, seasonAvg) {
  if (!seasonAvg || seasonAvg <= 0) return 'neutral';
  
  const ratio = last5Avg / seasonAvg;
  
  if (ratio >= 1.20) return 'hot';    // 20%+ above average
  if (ratio <= 0.80) return 'cold';   // 20%+ below average
  return 'neutral';
}

/**
 * Calculate all DFS metrics for a player
 * 
 * @param {Object} player - Player with projection and context
 * @param {Object} context - DFS context (matchup, form, etc.)
 * @returns {Object} All DFS metrics
 */
export function calculateDFSMetrics(player, context = {}) {
  const projectedPts = player.projected_pts || player.projectedPts || 0;
  const salary = player.salary || 0;
  
  return {
    valueScore: calculateValueScore(projectedPts, salary),
    ceilingScore: calculateCeilingScore(player, context),
    floorScore: calculateFloorScore(player, context),
    // Consistency requires historical data - estimate based on projection
    consistencyRating: player.consistencyRating || 0.75,
    // Form from context
    recentForm: context.recentForm || player.recentForm || 'neutral'
  };
}

/**
 * Calculate fantasy points projection for a player
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {number} Projected fantasy points
 */
export function calculateProjectedPoints(player, sport, platform) {
  // ⭐ If BDL already provided fantasy points, use them (most accurate)
  const bdlFpts = player.seasonStats?.fpts || player.fpts || 0;
  if (bdlFpts > 0) {
    // BDL uses DraftKings scoring - adjust for FanDuel if needed
    if (platform === 'fanduel' && sport === 'NBA') {
      // FanDuel values steals/blocks higher (3 pts vs 2 pts)
      // Rough adjustment: +5% for defensive players
      const spg = player.seasonStats?.spg || 0;
      const bpg = player.seasonStats?.bpg || 0;
      if (spg + bpg >= 2) {
        return Math.round(bdlFpts * 1.05 * 10) / 10;
      }
    }
    return Math.round(bdlFpts * 10) / 10;
  }
  
  if (sport === 'NBA') {
    return calculateNBAProjection(player, platform);
  } else if (sport === 'NFL') {
    return calculateNFLProjection(player, platform);
  }
  return 0;
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
  
  // If no stats at all, return 0 instead of negative
  if (!hasStats) {
    console.warn(`[DFS] No stats for ${player.name} - cannot project`);
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
export function findPivotAlternatives(starter, playerPool, sport, platform) {
  const starterSalary = starter.salary;
  const pivots = [];
  
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
    
    // Find highest-projected player within this salary range
    const candidate = sortedPool.find(p => {
      const diff = p.salary - starterSalary;
      return diff >= salaryDiffMin && diff <= salaryDiffMax;
    });
    
    if (candidate) {
      pivots.push({
        tier,
        tierLabel: config.label,
        tierDescription: config.description,
        player: candidate.name,
        team: candidate.team,
        salary: candidate.salary,
        projected_pts: candidate.projected_pts || calculateProjectedPoints(candidate, sport, platform),
        salaryDiff: candidate.salary - starterSalary
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
 * @returns {Object} Optimized lineup
 */
export function optimizeLineup(players, constraints, sport, platform) {
  const { salaryCap, positions, positionRules } = constraints;
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
    // NFL
    'QB': ['QB'],
    'RB': ['RB', 'FLEX'],
    'WR': ['WR', 'FLEX'],
    'TE': ['TE', 'FLEX'],
    'K': ['K'],
    'DST': ['DST'],
    'DEF': ['DST']
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: CALCULATE PROJECTED POINTS FOR ALL PLAYERS FIRST
  // ═══════════════════════════════════════════════════════════════════════════
  // We need to calculate projections BEFORE sorting so we can rank by ceiling
  for (const player of players) {
    if (!player.projected_pts || player.projected_pts === 0) {
      player.projected_pts = calculateProjectedPoints(player, sport, platform);
    }
  }
  
  // Group players by ALL positions they can fill
  const playersByPosition = {};
  for (const player of players) {
    const pos = player.position?.toUpperCase();
    if (!pos) continue;
    
    // Get all slots this player can fill
    const eligibleSlots = positionEligibility[pos] || [pos];
    for (const slot of eligibleSlots) {
      if (!playersByPosition[slot]) playersByPosition[slot] = [];
      playersByPosition[slot].push(player);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: SORT BY PROJECTED POINTS (MAXIMIZE TOTAL CEILING)
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary's goal is to build the highest-scoring lineup possible under the cap.
  // NOT to maximize "value" (pts/$1000) - that leaves money on the table.
  // Sort by projected points to get the best players first.
  // ═══════════════════════════════════════════════════════════════════════════
  for (const pos in playersByPosition) {
    playersByPosition[pos].sort((a, b) => {
      const ptsA = a.projected_pts || 0;
      const ptsB = b.projected_pts || 0;
      // Sort by PROJECTED POINTS (highest first) - Gary wants the best players
      return ptsB - ptsA;
    });
  }
  
  // ⭐ FIX: Fill specific positions first, flex positions last
  // This prevents using a star player in UTIL when they should be in their position
  const sortedPositions = [...positions].sort((a, b) => {
    const flexSlots = ['G', 'F', 'UTIL', 'FLEX'];
    const aIsFlex = flexSlots.includes(a);
    const bIsFlex = flexSlots.includes(b);
    if (aIsFlex && !bIsFlex) return 1; // Flex goes last
    if (!aIsFlex && bIsFlex) return -1;
    return 0;
  });
  
  // Calculate minimum salary to reserve for remaining positions
  // This prevents overspending early and leaving no room for flex
  const MIN_SALARY_PER_POSITION = sport === 'NFL' ? 3500 : 3800;
  
  // Fill each position slot
  for (let i = 0; i < sortedPositions.length; i++) {
    const posSlot = sortedPositions[i];
    const rule = positionRules[posSlot];
    if (!rule) continue;
    
    // Calculate remaining positions to fill (after this one)
    const remainingPositions = sortedPositions.length - i - 1;
    const reservedSalary = remainingPositions * MIN_SALARY_PER_POSITION;
    const maxSalaryForThisSlot = salaryCap - totalSalary - reservedSalary;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FIND HIGHEST-CEILING PLAYER THAT FITS THE SALARY CONSTRAINT
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary picks the BEST projected player that fits, not the best "value"
    let bestPlayer = null;
    let bestPts = -1;
    
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
      
      // ⭐ CHANGED: Pick by PROJECTED POINTS, not value
      const pts = player.projected_pts || 0;
      if (pts > bestPts) {
        bestPts = pts;
        bestPlayer = player;
      }
    }
    
    if (bestPlayer) {
      usedPlayers.add(bestPlayer.name);
      totalSalary += bestPlayer.salary;
      
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
        dvpRank: bestPlayer.dvpRank
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
 * @param {Object} player - Player with stats and salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} { rationale: string, supportingStats: Array }
 */
function generatePlayerRationale(player, sport, platform) {
  const stats = player.seasonStats || player;
  const value = player.salary > 0 ? (player.projected_pts / (player.salary / 1000)).toFixed(2) : 0;
  const supportingStats = [];
  let rationale = '';
  
  if (sport === 'NBA') {
    const ppg = stats.ppg || stats.pts || 0;
    const rpg = stats.rpg || stats.reb || 0;
    const apg = stats.apg || stats.ast || 0;
    const spg = stats.spg || stats.stl || 0;
    const bpg = stats.bpg || stats.blk || 0;
    const tpg = stats.tpg || stats.fg3m || 0;
    
    // Build supporting stats (top 3-4 relevant stats)
    if (ppg > 0) supportingStats.push({ label: 'PPG', value: ppg.toFixed(1) });
    if (rpg > 0) supportingStats.push({ label: 'RPG', value: rpg.toFixed(1) });
    if (apg > 0) supportingStats.push({ label: 'APG', value: apg.toFixed(1) });
    
    // Add defensive stats if notable
    if (spg >= 1.0) supportingStats.push({ label: 'SPG', value: spg.toFixed(1) });
    if (bpg >= 1.0) supportingStats.push({ label: 'BPG', value: bpg.toFixed(1) });
    
    // Add 3PM for DraftKings bonus
    if (platform === 'draftkings' && tpg >= 1.5) {
      supportingStats.push({ label: '3PM', value: tpg.toFixed(1) });
    }
    
    // Trim to 4 max
    while (supportingStats.length > 4) supportingStats.pop();
    
    // Add value score
    supportingStats.push({ label: 'Value', value: `${value}x` });
    
    // Generate rationale based on player profile
    if (ppg >= 25) {
      rationale = `Elite scorer with consistent production. High floor and ceiling combo at this price point.`;
    } else if (rpg >= 10 || apg >= 8) {
      rationale = `Strong multi-category contributor. Stuff-the-stat-sheet upside provides safe floor.`;
    } else if (spg + bpg >= 2.5) {
      rationale = `Defensive specialist with ${platform === 'fanduel' ? 'FanDuel premium (3 pts per stl/blk)' : 'stocks upside'}. Sneaky value play.`;
    } else if (parseFloat(value) >= 5.0) {
      rationale = `Excellent value at salary. Strong per-dollar production unlocks spend elsewhere.`;
    } else {
      rationale = `Solid role player with consistent minutes. Safe floor at this price tier.`;
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
export function addPivotsToLineup(lineup, playerPool, constraints, sport, platform) {
  const { positionRules } = constraints;
  
  return lineup.map(slot => {
    const rule = positionRules[slot.position];
    if (!rule) return slot;
    
    // Get all players eligible for this position
    const eligiblePlayers = playerPool.filter(p => {
      const playerPos = p.position?.toUpperCase();
      return rule.eligible.includes(playerPos);
    });
    
    // Find pivots
    const pivots = findPivotAlternatives(
      { player: slot.player, salary: slot.salary },
      eligiblePlayers,
      sport,
      platform
    );
    
    return {
      ...slot,
      pivots
    };
  });
}

/**
 * Main entry point: Generate complete DFS lineup with pivots
 * @param {Object} params - Generation parameters
 * @param {string} params.platform - 'draftkings' or 'fanduel'
 * @param {string} params.sport - 'NBA' or 'NFL'
 * @param {Array} params.players - Player pool with salaries and stats
 * @returns {Object} Complete lineup object
 */
export async function generateDFSLineup({ platform, sport, players }) {
  const constraints = PLATFORM_CONSTRAINTS[platform]?.[sport];
  if (!constraints) {
    throw new Error(`Unsupported platform/sport combination: ${platform}/${sport}`);
  }
  
  // Calculate projections for all players
  const playersWithProjections = players.map(p => ({
    ...p,
    projected_pts: p.projected_pts || calculateProjectedPoints(p, sport, platform)
  }));
  
  // Step 1: Initial greedy optimization
  const initialResult = optimizeLineup(
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  // Step 2: Gary's 2-round self-review (salary efficiency + ownership)
  const reviewedResult = selfReviewLineup(
    initialResult.lineup,
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  // Step 3: Add pivots to the reviewed lineup
  const lineupWithPivots = addPivotsToLineup(
    reviewedResult.lineup,
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  return {
    platform,
    sport,
    salary_cap: constraints.salaryCap,
    total_salary: reviewedResult.totalSalary,
    projected_points: Math.round(reviewedResult.projectedPoints * 10) / 10,
    lineup: lineupWithPivots
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GARY'S SELF-REVIEW OPTIMIZATION (2 Rounds)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * After building the initial greedy lineup, Gary reviews it twice:
 * 
 * ROUND 1: SALARY EFFICIENCY
 * - Check if money was left on the table
 * - Upgrade weak spots with remaining salary
 * - Ensure we're maximizing total projected points
 * 
 * ROUND 2: OWNERSHIP & CONTRARIAN VALUE  
 * - Identify chalk plays (high ownership)
 * - Consider swapping to similar-projected but lower-owned alternatives
 * - Balance ceiling vs floor based on contest type
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function selfReviewLineup(lineup, playerPool, constraints, sport, platform) {
  const { salaryCap } = constraints;
  let currentLineup = [...lineup];
  let totalSalary = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  let totalPts = currentLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  
  console.log(`\n[Gary Self-Review] 🔍 Starting review...`);
  console.log(`[Gary Self-Review] Initial: $${totalSalary}/${salaryCap} | ${totalPts.toFixed(1)} pts`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND 1: SALARY EFFICIENCY - Upgrade weak spots with remaining salary
  // ═══════════════════════════════════════════════════════════════════════════
  const remainingSalary = salaryCap - totalSalary;
  if (remainingSalary >= 500) {
    console.log(`[Gary Self-Review] 💰 Round 1: $${remainingSalary} unspent - looking for upgrades...`);
    
    // Sort lineup by projected points (lowest first = weakest spots)
    const sortedByPts = [...currentLineup].sort((a, b) => 
      (a.projected_pts || 0) - (b.projected_pts || 0)
    );
    
    // Try to upgrade weakest positions
    for (const weakSpot of sortedByPts.slice(0, 3)) { // Check 3 weakest spots
      const position = weakSpot.position;
      const currentPts = weakSpot.projected_pts || 0;
      const currentSalary = weakSpot.salary || 0;
      const maxUpgradeSalary = currentSalary + remainingSalary;
      
      // Find better player at same position within budget
      const upgrades = playerPool.filter(p => {
        if (p.name === weakSpot.player) return false; // Skip current player
        if (currentLineup.some(l => l.player === p.name)) return false; // Already in lineup
        if (p.status === 'OUT' || p.status === 'DOUBTFUL') return false;
        if (!p.salary || p.salary > maxUpgradeSalary) return false;
        
        // Check position eligibility
        const playerPos = (p.position || '').toUpperCase();
        const slotPos = position.toUpperCase();
        const canFill = playerPos === slotPos || 
          (slotPos === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPos)) ||
          (slotPos === 'UTIL' && ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'].includes(playerPos)) ||
          (slotPos === 'G' && ['PG', 'SG', 'G'].includes(playerPos)) ||
          (slotPos === 'F' && ['SF', 'PF', 'F'].includes(playerPos));
        
        if (!canFill) return false;
        
        const upgradePts = p.projected_pts || calculateProjectedPoints(p, sport, platform);
        return upgradePts > currentPts + 1; // Must be at least 1pt better
      }).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
      
      if (upgrades.length > 0) {
        const upgrade = upgrades[0];
        const upgradePts = upgrade.projected_pts || calculateProjectedPoints(upgrade, sport, platform);
        const ptsGain = upgradePts - currentPts;
        const costIncrease = upgrade.salary - currentSalary;
        
        // Only upgrade if it's a meaningful improvement
        if (ptsGain >= 2 && costIncrease <= remainingSalary) {
          console.log(`[Gary Self-Review] ⬆️ UPGRADE: ${weakSpot.player} → ${upgrade.name} (+${ptsGain.toFixed(1)} pts, +$${costIncrease})`);
          
          // Apply upgrade
          const idx = currentLineup.findIndex(p => p.player === weakSpot.player);
          if (idx !== -1) {
            currentLineup[idx] = {
              ...currentLineup[idx],
              player: upgrade.name,
              team: upgrade.team,
              salary: upgrade.salary,
              projected_pts: upgradePts
            };
            totalSalary += costIncrease;
            totalPts += ptsGain;
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND 2: OWNERSHIP & CONTRARIAN VALUE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Gary Self-Review] 🎯 Round 2: Checking ownership for contrarian opportunities...`);
  
  // Identify high-ownership (chalk) plays
  const chalkPlays = currentLineup.filter(p => {
    const ownership = p.ownership || playerPool.find(pp => pp.name === p.player)?.ownership || 0;
    return ownership >= 25; // 25%+ ownership = chalk
  });
  
  if (chalkPlays.length >= 4) {
    console.log(`[Gary Self-Review] ⚠️ ${chalkPlays.length} chalk plays detected - considering contrarian swaps`);
    
    // Try to swap ONE chalk play for a lower-owned alternative
    for (const chalk of chalkPlays.slice(0, 2)) { // Only consider swapping up to 2
      const chalkOwnership = chalk.ownership || 
        playerPool.find(p => p.name === chalk.player)?.ownership || 30;
      const chalkPts = chalk.projected_pts || 0;
      
      // Find lower-owned alternative with similar projection
      const contrarians = playerPool.filter(p => {
        if (p.name === chalk.player) return false;
        if (currentLineup.some(l => l.player === p.name)) return false;
        if (p.status === 'OUT' || p.status === 'DOUBTFUL') return false;
        
        const ownership = p.ownership || 15;
        const pts = p.projected_pts || calculateProjectedPoints(p, sport, platform);
        
        // Must be lower owned and within 2 pts of chalk
        return ownership < chalkOwnership - 10 && 
               pts >= chalkPts - 2 &&
               p.salary <= chalk.salary + 300; // Small salary flexibility
      }).sort((a, b) => {
        // Sort by projected points (prefer higher upside)
        return (b.projected_pts || 0) - (a.projected_pts || 0);
      });
      
      if (contrarians.length > 0) {
        const contrarian = contrarians[0];
        const contrarianOwn = contrarian.ownership || 15;
        const contrarianPts = contrarian.projected_pts || calculateProjectedPoints(contrarian, sport, platform);
        
        console.log(`[Gary Self-Review] 🎲 CONTRARIAN OPTION: ${chalk.player} (${chalkOwnership}% own) → ${contrarian.name} (${contrarianOwn}% own)`);
        console.log(`[Gary Self-Review]    Points diff: ${(contrarianPts - chalkPts).toFixed(1)} | Salary diff: $${contrarian.salary - chalk.salary}`);
        
        // Store as alternative but don't auto-swap (let Gary's notes mention it)
        chalk.contrarianAlt = {
          player: contrarian.name,
          team: contrarian.team,
          salary: contrarian.salary,
          projected_pts: contrarianPts,
          ownership: contrarianOwn
        };
      }
    }
  }
  
  // Recalculate totals
  totalSalary = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  totalPts = currentLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  
  console.log(`[Gary Self-Review] ✅ Final: $${totalSalary}/${salaryCap} | ${totalPts.toFixed(1)} pts\n`);
  
  return {
    lineup: currentLineup,
    totalSalary,
    projectedPoints: totalPts
  };
}

/**
 * Validate a lineup meets all constraints
 * @param {Object} lineup - Lineup to validate
 * @param {string} platform - Platform name
 * @param {string} sport - Sport name
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateLineup(lineup, platform, sport) {
  const constraints = PLATFORM_CONSTRAINTS[platform]?.[sport];
  if (!constraints) {
    return { valid: false, errors: ['Invalid platform/sport combination'] };
  }
  
  const errors = [];
  
  // Check roster size
  if (lineup.lineup.length !== constraints.rosterSize) {
    errors.push(`Invalid roster size: ${lineup.lineup.length} (expected ${constraints.rosterSize})`);
  }
  
  // Check salary cap
  if (lineup.total_salary > constraints.salaryCap) {
    errors.push(`Exceeds salary cap: $${lineup.total_salary} (cap: $${constraints.salaryCap})`);
  }
  
  // Check position counts
  const positionCounts = {};
  for (const slot of lineup.lineup) {
    positionCounts[slot.position] = (positionCounts[slot.position] || 0) + 1;
  }
  
  // Verify expected positions
  const expectedPositions = {};
  for (const pos of constraints.positions) {
    expectedPositions[pos] = (expectedPositions[pos] || 0) + 1;
  }
  
  for (const [pos, count] of Object.entries(expectedPositions)) {
    if (positionCounts[pos] !== count) {
      errors.push(`Position ${pos}: have ${positionCounts[pos] || 0}, expected ${count}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  PLATFORM_CONSTRAINTS,
  calculateProjectedPoints,
  findPivotAlternatives,
  optimizeLineup,
  addPivotsToLineup,
  generateDFSLineup,
  validateLineup
};

