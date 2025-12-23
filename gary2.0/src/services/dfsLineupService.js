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
  const topg = stats.topg || stats.turnover || 1.5; // Default TO estimate
  const tpm = stats.tpg || stats.fg3m || 0; // 3-pointers made per game
  
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
  
  // QB scoring
  if (position === 'QB') {
    const passYds = stats.passing_yards_per_game || stats.pass_yards_pg || stats.passYards || 0;
    const passTds = stats.passing_touchdowns || stats.pass_tds_pg || stats.passTDs || 0;
    const ints = stats.passing_interceptions || stats.ints_pg || stats.interceptions || 0;
    const rushYds = stats.rushing_yards_per_game || stats.rush_yards_pg || stats.rushYards || 0;
    const rushTds = stats.rushing_touchdowns || stats.rush_tds_pg || stats.rushTDs || 0;
    const fumblesLost = stats.rushing_fumbles_lost || stats.fumbles_lost || 0;
    
    let pts = (passYds * 0.04) + (passTds * 4) - (ints * 1) + (rushYds * 0.1) + (rushTds * 6);
    
    if (platform === 'draftkings') {
      pts -= (fumblesLost * 1);
      // 300+ passing yards bonus
      if (passYds >= 300) pts += 3;
      if (rushYds >= 100) pts += 3;
    } else {
      // FanDuel: -2 per fumble lost, no bonuses
      pts -= (fumblesLost * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // RB scoring
  if (position === 'RB') {
    const rushYds = stats.rushing_yards_per_game || stats.rush_yards_pg || stats.rushYards || 0;
    const rushTds = stats.rushing_touchdowns || stats.rush_tds_pg || stats.rushTDs || 0;
    const recYds = stats.receiving_yards_per_game || stats.rec_yards_pg || stats.recYards || 0;
    const recTds = stats.receiving_touchdowns || stats.rec_tds_pg || stats.recTDs || 0;
    const receptions = stats.receptions || stats.receptions_pg || 0;
    const fumblesLost = stats.rushing_fumbles_lost || stats.fumbles_lost || 0;
    
    let pts = (rushYds * 0.1) + (rushTds * 6) + (recYds * 0.1) + (recTds * 6);
    
    if (platform === 'draftkings') {
      pts += (receptions * 1); // Full PPR
      pts -= (fumblesLost * 1);
      if (rushYds >= 100) pts += 3;
      if (recYds >= 100) pts += 3;
    } else {
      pts += (receptions * 0.5); // Half PPR
      pts -= (fumblesLost * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // WR scoring
  if (position === 'WR') {
    const recYds = stats.receiving_yards_per_game || stats.rec_yards_pg || stats.recYards || 0;
    const recTds = stats.receiving_touchdowns || stats.rec_tds_pg || stats.recTDs || 0;
    const receptions = stats.receptions || stats.receptions_pg || 0;
    const rushYds = stats.rushing_yards_per_game || stats.rush_yards_pg || 0;
    const rushTds = stats.rushing_touchdowns || stats.rush_tds_pg || 0;
    const fumblesLost = stats.receiving_fumbles_lost || stats.fumbles_lost || 0;
    
    let pts = (recYds * 0.1) + (recTds * 6) + (rushYds * 0.1) + (rushTds * 6);
    
    if (platform === 'draftkings') {
      pts += (receptions * 1); // Full PPR - makes slot receivers valuable
      pts -= (fumblesLost * 1);
      if (recYds >= 100) pts += 3;
    } else {
      pts += (receptions * 0.5); // Half PPR - favors TD threats over volume
      pts -= (fumblesLost * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // TE scoring (same as WR)
  if (position === 'TE') {
    const recYds = stats.receiving_yards_per_game || stats.rec_yards_pg || stats.recYards || 0;
    const recTds = stats.receiving_touchdowns || stats.rec_tds_pg || stats.recTDs || 0;
    const receptions = stats.receptions || stats.receptions_pg || 0;
    const fumblesLost = stats.receiving_fumbles_lost || stats.fumbles_lost || 0;
    
    let pts = (recYds * 0.1) + (recTds * 6);
    
    if (platform === 'draftkings') {
      pts += (receptions * 1);
      pts -= (fumblesLost * 1);
      if (recYds >= 100) pts += 3;
    } else {
      pts += (receptions * 0.5);
      pts -= (fumblesLost * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // DST scoring (simplified)
  if (position === 'DST' || position === 'DEF') {
    // Base 10 pts, adjusted by points allowed
    return 8.0; // Placeholder - DST projections are complex
  }
  
  // K (Kicker) - FanDuel only
  if (position === 'K') {
    return 7.0; // Placeholder
  }
  
  // Default fallback
  const rushYds = stats.rushing_yards_per_game || stats.rush_yards_pg || stats.rushYards || 0;
  const rushTds = stats.rushing_touchdowns || stats.rush_tds_pg || stats.rushTDs || 0;
  const recYds = stats.receiving_yards_per_game || stats.rec_yards_pg || stats.recYards || 0;
  const recTds = stats.receiving_touchdowns || stats.rec_tds_pg || stats.recTDs || 0;
  const receptions = stats.receptions || stats.receptions_pg || 0;
  
  if (platform === 'draftkings') {
    return Math.round((rushYds * 0.1 + rushTds * 6 + recYds * 0.1 + recTds * 6 + receptions * 1) * 10) / 10;
  } else {
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

