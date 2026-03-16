/**
 * DFS Lineup Service
 * Platform constraints, projection calculations, and pivot generation for Gary's Fantasy
 *
 * Supports:
 * - DraftKings and FanDuel platforms
 * - NBA and NFL sports
 * - 3-tier pivot alternatives per position (direct, mid, budget)
 *
 * Note: Full lineup optimization is handled by the agentic DFS pipeline
 * (dfsAgenticOrchestrator.js). This module provides the shared constants
 * and utility functions that pipeline depends on.
 */

// Platform constraints - hard-coded rules for each platform/sport
export const PLATFORM_CONSTRAINTS = {
  draftkings: {
    NBA: {
      salaryCap: 50000,
      rosterSize: 8,
      positions: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
      positionRules: {
        // Specific slots accept their position OR generic fallbacks (G/F)
        PG: { count: 1, eligible: ['PG', 'G', 'G-F', 'F-G'] },
        SG: { count: 1, eligible: ['SG', 'G', 'G-F', 'F-G'] },
        SF: { count: 1, eligible: ['SF', 'F', 'G-F', 'F-G'] },
        PF: { count: 1, eligible: ['PF', 'F', 'F-C', 'C-F'] },
        C: { count: 1, eligible: ['C', 'F-C', 'C-F'] },
        // Guard slot accepts PG or SG or G
        G: { count: 1, eligible: ['PG', 'SG', 'G', 'G-F', 'F-G'] },
        // Forward slot accepts SF or PF or F
        F: { count: 1, eligible: ['SF', 'PF', 'F', 'F-C', 'C-F', 'G-F', 'F-G'] },
        // UTIL slot accepts anyone
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
        // FanDuel is STRICT: Slots only accept their specific positions
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

// Salary tier thresholds - absolute salary determines player tier, not just diff
// A $9K player is NEVER a "punt spot" regardless of who they're replacing
const SALARY_TIER_LABELS = {
  anchor: { min: 9000, label: 'Star Pivot', description: 'Premium anchor option' },
  core: { min: 7000, label: 'Core Alternative', description: 'Solid production floor' },
  mid: { min: 5000, label: 'Mid-Tier Value', description: 'Balanced value play' },
  value: { min: 4000, label: 'Value Play', description: 'Upside at lower cost' },
  punt: { min: 0, label: 'Budget Punt', description: 'High-risk punt spot' }
};

/**
 * Get appropriate tier label based on player's absolute salary
 * Prevents calling $9K players "punt spots"
 */
function getSalaryAwareTierLabel(salary, defaultTier, defaultLabel, defaultDescription) {
  // Override "Budget Play" labels for expensive players
  if (defaultTier === 'budget') {
    for (const [tierName, config] of Object.entries(SALARY_TIER_LABELS)) {
      if (salary >= config.min) {
        return { label: config.label, description: config.description };
      }
    }
  }
  return { label: defaultLabel, description: defaultDescription };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECTION CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateProjectedPoints(player, sport, platform, contestType = 'cash') {
  // When a star returns from injury, role players who benefited LOSE usage.
  // Example: Embiid returns → Maxey's usage drops from 35% to 28%
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

  // If BDL already provided fantasy points, use them (most accurate)
  const bdlFpts = player.seasonStats?.fpts || player.fpts || 0;
  if (bdlFpts > 0) {
    // BDL uses DraftKings scoring - adjust for FanDuel if needed
    let baseProjection = bdlFpts;
    if (platform === 'fanduel' && sport === 'NBA') {
      // FanDuel values steals/blocks higher (3 pts vs 2 pts)
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
    if (projection === 0 && player.salary > 0) {
      console.error(`[Projection] 🐛 BUG: ${player.name} (${player.team}) has $${player.salary} salary but 0 projection!`);
      console.error(`[Projection]    → Check: 1) Player name matching  2) BDL fetch logic  3) Season param`);
      console.error(`[Projection]    → Stats: ppg=${player.seasonStats?.ppg}, mpg=${player.seasonStats?.mpg}`);
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

// estimateProjectionFromSalary removed — dead code (never called)

/**
 * NBA fantasy points calculation
 *
 * DraftKings NBA: Point(1), 3PM(+0.5), Reb(1.25), Ast(1.5), Stl(2), Blk(2), TO(-0.5), DD(+1.5), TD(+3)
 * FanDuel NBA:  Point(1), Reb(1.2), Ast(1.5), Stl(3), Blk(3), TO(-1), no bonuses
 */
function calculateNBAProjection(player, platform) {
  const stats = player.seasonStats || player;
  const ppg = stats.ppg || stats.pts || 0;
  const rpg = stats.rpg || stats.reb || 0;
  const apg = stats.apg || stats.ast || 0;
  const spg = stats.spg || stats.stl || 0;
  const bpg = stats.bpg || stats.blk || 0;
  const hasStats = ppg > 0 || rpg > 0 || apg > 0;
  const topg = hasStats ? (stats.topg || stats.turnover || 1.5) : 0;
  const tpm = stats.tpg || stats.fg3m || 0;

  if (!hasStats) {
    console.error(`[DFS] 🐛 NO STATS: ${player.name} (${player.team}) - BDL should have game logs for everyone!`);
    console.error(`[DFS]    → Check: getPlayerStats/getSeasonAverages, player ID matching, season=2025`);
    return 0;
  }

  if (platform === 'draftkings') {
    let pts = ppg + (tpm * 0.5) + (rpg * 1.25) + (apg * 1.5) + (spg * 2) + (bpg * 2) - (topg * 0.5);
    const ddCategories = [ppg >= 10, rpg >= 10, apg >= 10, spg >= 10, bpg >= 10].filter(Boolean).length;
    if (ddCategories >= 2) pts += 1.5;  // DD bonus: +1.5
    if (ddCategories >= 3) pts += 3.0;  // TD bonus: +3.0 (total DD+TD = +4.5)
    return Math.round(pts * 10) / 10;
  } else {
    return Math.round((ppg + (rpg * 1.2) + (apg * 1.5) + (spg * 3) + (bpg * 3) - topg) * 10) / 10;
  }
}

/**
 * NFL fantasy points calculation
 *
 * CRITICAL: BDL returns SEASON TOTALS for TDs/receptions, not per-game!
 * We must divide by games_played to get per-game projections.
 *
 * DraftKings NFL (Full PPR): PassTD(4), PassYd(0.04), INT(-1), RushTD(6), RushYd(0.1),
 *   Rec(1), RecTD(6), RecYd(0.1), FumLost(-1), 300+PassYd(+3), 100+RushYd(+3), 100+RecYd(+3)
 * FanDuel NFL (Half PPR): Same except Rec(0.5), FumLost(-2), NO yardage bonuses
 */
function calculateNFLProjection(player, platform) {
  const stats = player.seasonStats || player;
  const position = (player.position || '').toUpperCase();
  const gamesPlayed = stats.games_played || 16;

  // QB scoring
  if (position === 'QB') {
    const passYpg = stats.passing_yards_per_game || 0;
    const rushYpg = stats.rushing_yards_per_game || 0;
    const passTdPg = (stats.passing_touchdowns || 0) / gamesPlayed;
    const intsPg = (stats.passing_interceptions || 0) / gamesPlayed;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const fumblesLostPg = (stats.rushing_fumbles_lost || 0) / gamesPlayed;

    let pts = (passYpg * 0.04) + (passTdPg * 4) - (intsPg * 1) + (rushYpg * 0.1) + (rushTdPg * 6);

    if (platform === 'draftkings') {
      pts -= (fumblesLostPg * 1);
      if (passYpg >= 300) pts += 3;
      if (rushYpg >= 100) pts += 3;
    } else {
      pts -= (fumblesLostPg * 2);
    }

    return Math.round(pts * 10) / 10;
  }

  // RB scoring
  if (position === 'RB') {
    const rushYpg = stats.rushing_yards_per_game || 0;
    const recYpg = stats.receiving_yards_per_game || 0;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.rushing_fumbles_lost || 0) / gamesPlayed;

    let pts = (rushYpg * 0.1) + (rushTdPg * 6) + (recYpg * 0.1) + (recTdPg * 6);

    if (platform === 'draftkings') {
      pts += (recPg * 1);
      pts -= (fumblesLostPg * 1);
      if (rushYpg >= 100) pts += 3;
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5);
      pts -= (fumblesLostPg * 2);
    }

    return Math.round(pts * 10) / 10;
  }

  // WR scoring
  if (position === 'WR') {
    const recYpg = stats.receiving_yards_per_game || 0;
    const rushYpg = stats.rushing_yards_per_game || 0;
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.receiving_fumbles_lost || 0) / gamesPlayed;

    let pts = (recYpg * 0.1) + (recTdPg * 6) + (rushYpg * 0.1) + (rushTdPg * 6);

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

  // TE scoring (same structure as WR)
  if (position === 'TE') {
    const recYpg = stats.receiving_yards_per_game || 0;
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
    return 8.0;
  }

  // K (Kicker) - FanDuel only
  if (position === 'K') {
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

// ═══════════════════════════════════════════════════════════════════════════
// PIVOT ALTERNATIVES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find pivot alternatives for a position
 * @param {Object} starter - The starter player at this position
 * @param {Array} playerPool - All available players for this position
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Up to 3 pivot alternatives (direct, mid, budget)
 */
export function findPivotAlternatives(starter, playerPool, sport, platform) {
  const starterSalary = starter.salary;
  const pivots = [];
  const usedPlayers = new Set();

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
  for (const [tier, config] of Object.entries(PIVOT_TIERS)) {
    const salaryDiffMin = config.salaryRange.min;
    const salaryDiffMax = config.salaryRange.max;

    const candidate = sortedPool.find(p => {
      if (usedPlayers.has(p.name)) return false;
      const diff = p.salary - starterSalary;
      return diff >= salaryDiffMin && diff <= salaryDiffMax;
    });

    if (candidate) {
      usedPlayers.add(candidate.name);

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

  // Always show at least one alternative — even on small slates
  if (pivots.length === 0 && sortedPool.length > 0) {
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

