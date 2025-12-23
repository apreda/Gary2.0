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
        PG: { count: 1, eligible: ['PG'] },
        SG: { count: 1, eligible: ['SG'] },
        SF: { count: 1, eligible: ['SF'] },
        PF: { count: 1, eligible: ['PF'] },
        C: { count: 1, eligible: ['C'] },
        G: { count: 1, eligible: ['PG', 'SG'] },
        F: { count: 1, eligible: ['SF', 'PF'] },
        UTIL: { count: 1, eligible: ['PG', 'SG', 'SF', 'PF', 'C'] }
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
        PG: { count: 2, eligible: ['PG'] },
        SG: { count: 2, eligible: ['SG'] },
        SF: { count: 2, eligible: ['SF'] },
        PF: { count: 2, eligible: ['PF'] },
        C: { count: 1, eligible: ['C'] }
      }
    },
    NFL: {
      salaryCap: 60000,
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
  }
};

// Pivot tier configurations
const PIVOT_TIERS = {
  direct: {
    label: 'Direct Swap',
    description: 'Similar ceiling',
    salaryRange: { min: -300, max: 300 }
  },
  mid: {
    label: 'Mid Value',
    description: 'Save ~$1K',
    salaryRange: { min: -1200, max: -500 }
  },
  budget: {
    label: 'Budget Play',
    description: 'Punt spot',
    salaryRange: { min: -Infinity, max: -1500 }
  }
};

/**
 * Calculate fantasy points projection for a player
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {number} Projected fantasy points
 */
export function calculateProjectedPoints(player, sport, platform) {
  if (sport === 'NBA') {
    return calculateNBAProjection(player, platform);
  } else if (sport === 'NFL') {
    return calculateNFLProjection(player, platform);
  }
  return 0;
}

/**
 * NBA fantasy points calculation
 * DraftKings: 1 pt, 1.25 reb, 1.5 ast, 2 stl, 2 blk, -0.5 TO, +1.5 3PM, +1.5 DD, +3 TD
 * FanDuel: 1 pt, 1.2 reb, 1.5 ast, 3 stl, 3 blk, -1 TO
 */
function calculateNBAProjection(player, platform) {
  const stats = player.seasonStats || player;
  const ppg = stats.ppg || stats.pts || 0;
  const rpg = stats.rpg || stats.reb || 0;
  const apg = stats.apg || stats.ast || 0;
  const spg = stats.spg || stats.stl || 0;
  const bpg = stats.bpg || stats.blk || 0;
  const topg = stats.topg || stats.turnover || 1.5; // Default TO estimate
  const tpm = stats.tpg || stats.fg3m || 0;
  
  if (platform === 'draftkings') {
    let pts = ppg + (rpg * 1.25) + (apg * 1.5) + (spg * 2) + (bpg * 2) - (topg * 0.5) + (tpm * 0.5);
    // Bonus estimates for double-doubles (rough heuristic)
    if (ppg >= 10 && rpg >= 10) pts += 1.5;
    if (ppg >= 10 && apg >= 10) pts += 1.5;
    return Math.round(pts * 10) / 10;
  } else {
    // FanDuel
    return Math.round((ppg + (rpg * 1.2) + (apg * 1.5) + (spg * 3) + (bpg * 3) - topg) * 10) / 10;
  }
}

/**
 * NFL fantasy points calculation
 * DraftKings scoring rules
 */
function calculateNFLProjection(player, platform) {
  const stats = player.seasonStats || player;
  const position = player.position || '';
  
  // QB scoring
  if (position === 'QB') {
    const passYds = stats.pass_yards_pg || stats.passYards || 0;
    const passTds = stats.pass_tds_pg || stats.passTDs || 0;
    const ints = stats.ints_pg || stats.interceptions || 0;
    const rushYds = stats.rush_yards_pg || stats.rushYards || 0;
    const rushTds = stats.rush_tds_pg || stats.rushTDs || 0;
    
    if (platform === 'draftkings') {
      return Math.round((passYds * 0.04 + passTds * 4 - ints * 1 + rushYds * 0.1 + rushTds * 6) * 10) / 10;
    } else {
      return Math.round((passYds * 0.04 + passTds * 4 - ints * 1 + rushYds * 0.1 + rushTds * 6) * 10) / 10;
    }
  }
  
  // RB/WR/TE scoring
  const rushYds = stats.rush_yards_pg || stats.rushYards || 0;
  const rushTds = stats.rush_tds_pg || stats.rushTDs || 0;
  const recYds = stats.rec_yards_pg || stats.recYards || 0;
  const recTds = stats.rec_tds_pg || stats.recTDs || 0;
  const receptions = stats.receptions_pg || stats.receptions || 0;
  
  if (platform === 'draftkings') {
    // DK: 1 PPR
    return Math.round((rushYds * 0.1 + rushTds * 6 + recYds * 0.1 + recTds * 6 + receptions * 1) * 10) / 10;
  } else {
    // FD: 0.5 PPR
    return Math.round((rushYds * 0.1 + rushTds * 6 + recYds * 0.1 + recTds * 6 + receptions * 0.5) * 10) / 10;
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
  
  // Find best player for each tier
  for (const [tier, config] of Object.entries(PIVOT_TIERS)) {
    const salaryDiffMin = config.salaryRange.min;
    const salaryDiffMax = config.salaryRange.max;
    
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
  
  // Group players by position
  const playersByPosition = {};
  for (const player of players) {
    const pos = player.position?.toUpperCase();
    if (!pos) continue;
    if (!playersByPosition[pos]) playersByPosition[pos] = [];
    playersByPosition[pos].push(player);
  }
  
  // Sort players in each position by value (pts per $1000)
  for (const pos in playersByPosition) {
    playersByPosition[pos].sort((a, b) => {
      const valueA = (a.projected_pts || 0) / (a.salary / 1000);
      const valueB = (b.projected_pts || 0) / (b.salary / 1000);
      return valueB - valueA;
    });
  }
  
  // Track position counts
  const positionCounts = {};
  
  // Fill each position slot
  for (const posSlot of positions) {
    const rule = positionRules[posSlot];
    if (!rule) continue;
    
    // Find best available player for this slot
    let bestPlayer = null;
    let bestValue = -1;
    
    for (const eligiblePos of rule.eligible) {
      const candidates = playersByPosition[eligiblePos] || [];
      
      for (const player of candidates) {
        // Skip if already used
        if (usedPlayers.has(player.name)) continue;
        
        // Skip if would exceed salary cap
        if (totalSalary + player.salary > salaryCap) continue;
        
        // Skip if player is OUT
        if (player.status === 'OUT') continue;
        
        const value = (player.projected_pts || 0) / (player.salary / 1000);
        if (value > bestValue) {
          bestValue = value;
          bestPlayer = player;
        }
      }
    }
    
    if (bestPlayer) {
      usedPlayers.add(bestPlayer.name);
      totalSalary += bestPlayer.salary;
      
      lineup.push({
        position: posSlot,
        player: bestPlayer.name,
        team: bestPlayer.team,
        salary: bestPlayer.salary,
        projected_pts: bestPlayer.projected_pts || calculateProjectedPoints(bestPlayer, sport, platform),
        pivots: [] // Will be filled later
      });
    }
  }
  
  return {
    lineup,
    totalSalary,
    projectedPoints: lineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0)
  };
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
  
  // Optimize lineup
  const { lineup, totalSalary, projectedPoints } = optimizeLineup(
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  // Add pivots to each position
  const lineupWithPivots = addPivotsToLineup(
    lineup,
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  return {
    platform,
    sport,
    salary_cap: constraints.salaryCap,
    total_salary: totalSalary,
    projected_points: Math.round(projectedPoints * 10) / 10,
    lineup: lineupWithPivots
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

