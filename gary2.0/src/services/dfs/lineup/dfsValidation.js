import { PLATFORM_CONSTRAINTS, PIVOT_TIERS, SALARY_TIER_LABELS, getSalaryAwareTierLabel, PUNT_SALARY_THRESHOLD, PUNT_AWARENESS, GARY_SHARP_KNOWLEDGE, LINEUP_ARCHETYPES, ANTI_CORRELATION_RULES, GPP_VALUE_TARGETS } from './dfsConstants.js';


// ═══════════════════════════════════════════════════════════════════════════
// BUILD IDENTIFICATION & REFLECTION - Non-Prescriptive Awareness
// ═══════════════════════════════════════════════════════════════════════════
// 
// Gary builds whatever lineup HE thinks wins. These functions identify what
// he built and surface relevant considerations from his sharp knowledge base.
// 
// This is REFLECTION, not rules. Gary decides if his conviction holds.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identify what type of build Gary created based on salary distribution
 * This is DETECTION, not prescription - we're observing what Gary chose
 * 
 * @param {Array} lineup - The lineup Gary built
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} Build identification with type and tier breakdown
 */
export function identifyBuildType(lineup, platform = 'draftkings') {
  // Platform-specific salary thresholds
  const thresholds = platform === 'fanduel' 
    ? { alpha: 9500, star: 8500, mid: 5500, value: 4000 }
    : { alpha: 10000, star: 9000, mid: 6000, value: 4000 };
  
  // Categorize players into tiers
  const alphas = lineup.filter(s => (s.salary || 0) >= thresholds.alpha);
  const stars = lineup.filter(s => (s.salary || 0) >= thresholds.star && (s.salary || 0) < thresholds.alpha);
  const mids = lineup.filter(s => (s.salary || 0) >= thresholds.mid && (s.salary || 0) < thresholds.star);
  const values = lineup.filter(s => (s.salary || 0) >= thresholds.value && (s.salary || 0) < thresholds.mid);
  const punts = lineup.filter(s => (s.salary || 0) < thresholds.value);
  
  const premiumCount = alphas.length + stars.length;
  const totalPremiumSalary = [...alphas, ...stars].reduce((sum, s) => sum + (s.salary || 0), 0);
  
  // Identify build type based on distribution pattern
  let buildType = 'balanced'; // Default
  let confidence = 'medium';
  
  // Check for game stack (3+ from same team)
  const teamCounts = {};
  lineup.forEach(s => {
    teamCounts[s.team] = (teamCounts[s.team] || 0) + 1;
  });
  const maxTeamStack = Math.max(...Object.values(teamCounts));
  const stackedTeam = Object.keys(teamCounts).find(t => teamCounts[t] === maxTeamStack);
  
  // Check for correlation (players from same game)
  const hasGameStack = maxTeamStack >= 3;
  
  // Identify injury stack (multiple players with injury boost from same team)
  const injuryBoosts = lineup.filter(s => s.usageBoost || s.teammateOpportunity || s.injuryBeneficiary);
  const injuryByTeam = {};
  injuryBoosts.forEach(s => {
    injuryByTeam[s.team] = (injuryByTeam[s.team] || 0) + 1;
  });
  const hasInjuryStack = Object.values(injuryByTeam).some(c => c >= 2);
  
  // Identify dart throws vs value plays
  const dartThrows = lineup.filter(s => {
    const mpg = s.mpg || s.seasonStats?.mpg || 0;
    const gamesPlayed = s.seasonStats?.gamesPlayed || s.seasonStats?.games || 0;
    const hasBoost = s.usageBoost || s.teammateOpportunity || s.injuryBeneficiary;
    const salary = s.salary || 0;
    
    // Dart throw = cheap + low minutes + no boost
    return salary < thresholds.value && mpg < 20 && gamesPlayed < 30 && !hasBoost;
  });
  
  // Determine build type
  if (alphas.length >= 1 && premiumCount >= 3 && punts.length >= 2) {
    buildType = 'mini_max';
    confidence = punts.length > 2 ? 'high' : 'medium';
  } else if (alphas.length >= 1 && mids.length >= 4) {
    buildType = 'alpha_anchor';
    confidence = 'high';
  } else if (premiumCount >= 2 && values.length + punts.length >= 4) {
    buildType = 'stars_and_scrubs';
    confidence = 'medium';
  } else if (hasGameStack) {
    buildType = 'game_stack';
    confidence = maxTeamStack >= 4 ? 'high' : 'medium';
  } else if (hasInjuryStack) {
    buildType = 'injury_stack';
    confidence = 'medium';
  } else if (punts.length === 0 && values.length <= 2) {
    buildType = 'anti_fragile';
    confidence = 'high';
  } else if (mids.length >= 5) {
    buildType = 'balanced';
    confidence = 'high';
  }
  
  // Check for contrarian build (low ownership)
  const avgOwnership = lineup.reduce((sum, s) => sum + (s.ownership || 10), 0) / lineup.length;
  const lowOwnedCount = lineup.filter(s => (s.ownership || 10) < 10).length;
  if (lowOwnedCount >= 5) {
    buildType = 'leverage_contrarian';
    confidence = 'medium';
  }
  
  return {
    buildType,
    confidence,
    tiers: {
      alphas: alphas.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      stars: stars.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      mids: mids.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      values: values.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      punts: punts.map(s => ({ name: s.player, salary: s.salary, team: s.team }))
    },
    metrics: {
      premiumCount,
      totalPremiumSalary,
      dartThrowCount: dartThrows.length,
      dartThrows: dartThrows.map(s => s.player),
      maxTeamStack,
      stackedTeam: maxTeamStack >= 3 ? stackedTeam : null,
      avgOwnership,
      lowOwnedCount
    }
  };
}

/**
 * Reflect on Gary's build and surface relevant considerations
 * This is AWARENESS, not prescription - Gary decides what to do
 * 
 * @param {Array} lineup - The lineup Gary built
 * @param {Object} context - Contest context (contestType, etc.)
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} Reflection with considerations for Gary to evaluate
 */


/**
 * Reflect on Gary's build and surface relevant considerations
 * This is AWARENESS, not prescription - Gary decides what to do
 * 
 * @param {Array} lineup - The lineup Gary built
 * @param {Object} context - Contest context (contestType, etc.)
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} Reflection with considerations for Gary to evaluate
 */
export function reflectOnBuild(lineup, context = {}, platform = 'draftkings') {
  const contestType = context.contestType || 'gpp';
  const buildInfo = identifyBuildType(lineup, platform);
  const archetype = GARY_SHARP_KNOWLEDGE.archetypes[buildInfo.buildType];
  
  const reflection = {
    buildType: buildInfo.buildType,
    buildName: archetype?.name || 'Custom Build',
    confidence: buildInfo.confidence,
    tiers: buildInfo.tiers,
    considerations: [],
    questions: [],
    metrics: buildInfo.metrics
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // Surface considerations based on what Gary built
  // These are QUESTIONS for Gary to answer, not rules to follow
  // ═══════════════════════════════════════════════════════════════════════
  
  if (archetype) {
    reflection.considerations.push({
      type: 'build_profile',
      message: `BUILD: ${archetype.name} - ${archetype.pattern}`,
      detail: `This build works when: ${archetype.when_it_works}`
    });
    
    reflection.questions.push(archetype.key_question);
  }
  
  // Dart throw awareness
  if (buildInfo.metrics.dartThrowCount >= 3) {
    reflection.considerations.push({
      type: 'dart_throw_concentration',
      severity: 'investigate',
      message: `${buildInfo.metrics.dartThrowCount} players appear to be dart throws`,
      players: buildInfo.metrics.dartThrows
    });
    reflection.questions.push('Do these dart throws have clear paths to minutes (injury boost) or are they lottery tickets?');
  }
  
  // Ceiling gap check for GPPs
  const totalProjected = lineup.reduce((sum, s) => sum + (s.projected_pts || 0), 0);
  const totalCeiling = lineup.reduce((sum, s) => {
    const baseProj = s.projected_pts || 0;
    const mpg = s.mpg || s.seasonStats?.mpg || 20;
    const upsideMultiplier = mpg >= 32 ? 1.35 : mpg >= 25 ? 1.25 : 1.4; // Dart throws have high variance
    return sum + (baseProj * upsideMultiplier);
  }, 0);
  const ceilingGap = ((totalCeiling - totalProjected) / totalProjected) * 100;
  
  reflection.metrics.projected = totalProjected;
  reflection.metrics.ceiling = totalCeiling;
  reflection.metrics.ceilingGapPercent = ceilingGap;
  
  if (contestType === 'gpp' && ceilingGap < 12) {
    reflection.considerations.push({
      type: 'narrow_ceiling',
      severity: 'investigate',
      message: `Ceiling gap is ${ceilingGap.toFixed(0)}% (GPPs typically need 15-20%+)`,
      detail: `Projected: ${totalProjected.toFixed(0)} | Ceiling: ${totalCeiling.toFixed(0)}`
    });
    reflection.questions.push('Is this ceiling enough to win this GPP, or do you need more upside players?');
  }
  
  // Mini-Max specific checks
  if (buildInfo.buildType === 'mini_max') {
    const puntQuality = buildInfo.tiers.punts.filter(p => {
      const slot = lineup.find(s => s.player === p.name);
      const mpg = slot?.mpg || slot?.seasonStats?.mpg || 0;
      const hasBoost = slot?.usageBoost || slot?.teammateOpportunity;
      return mpg >= 20 || hasBoost;
    });
    
    if (puntQuality.length < buildInfo.tiers.punts.length) {
      const riskyPunts = buildInfo.tiers.punts.filter(p => !puntQuality.find(q => q.name === p.name));
      reflection.considerations.push({
        type: 'punt_quality',
        severity: 'investigate',
        message: `Mini-Max needs established role punts. ${riskyPunts.length} punt(s) look like dart throws.`,
        players: riskyPunts.map(p => p.name)
      });
      reflection.questions.push('Mini-Max risk without Mini-Max quality - is your conviction on these punts strong enough?');
    }
  }
  
  // Game stack awareness
  if (buildInfo.metrics.maxTeamStack >= 3) {
    reflection.considerations.push({
      type: 'game_stack',
      severity: 'awareness',
      message: `${buildInfo.metrics.maxTeamStack}-man stack from ${buildInfo.metrics.stackedTeam}`,
      detail: 'Correlation amplifies upside AND downside'
    });
    reflection.questions.push('Does game environment (total, pace, spread) support a shootout for this stack?');
  }
  
  // Ownership awareness
  if (buildInfo.metrics.avgOwnership > 20) {
    reflection.considerations.push({
      type: 'chalky_build',
      severity: 'awareness',
      message: `Average ownership is ${buildInfo.metrics.avgOwnership.toFixed(0)}% - this is a chalky build`,
      detail: 'Fine for cash games, but limits GPP equity if chalk busts'
    });
  } else if (buildInfo.metrics.lowOwnedCount >= 4) {
    reflection.considerations.push({
      type: 'contrarian_build',
      severity: 'awareness',
      message: `${buildInfo.metrics.lowOwnedCount} players under 10% ownership - highly contrarian`,
      detail: 'Massive upside if reads are right, but fighting consensus'
    });
    reflection.questions.push('Are you contrarian for a specific reason or just being different?');
  }
  
  // Always end with Gary's agency
  reflection.garyDecides = true;
  reflection.reminder = 'Gary: You built this for a reason. Trust your thesis or adjust specific spots.';
  
  return reflection;
}

/**
 * Generate reflection notes for Gary's lineup
 * Returns formatted strings for inclusion in gary_notes
 */


/**
 * Generate reflection notes for Gary's lineup
 * Returns formatted strings for inclusion in gary_notes
 */
export function generateReflectionNotes(lineup, context = {}, platform = 'draftkings') {
  const reflection = reflectOnBuild(lineup, context, platform);
  const notes = [];
  
  notes.push(``);
  notes.push(`═══════════════════════════════════════════════════════════`);
  notes.push(`🔍 BUILD ANALYSIS - What Gary Built`);
  notes.push(`═══════════════════════════════════════════════════════════`);
  notes.push(``);
  
  // Build identification
  notes.push(`BUILD TYPE: ${reflection.buildName.toUpperCase()}`);
  notes.push(`Confidence: ${reflection.confidence}`);
  notes.push(``);
  
  // Tier breakdown
  notes.push(`TIER BREAKDOWN:`);
  if (reflection.tiers.alphas.length > 0) {
    notes.push(`  Alphas ($10K+): ${reflection.tiers.alphas.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.stars.length > 0) {
    notes.push(`  Stars ($9K+):   ${reflection.tiers.stars.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.mids.length > 0) {
    notes.push(`  Mid ($6-9K):    ${reflection.tiers.mids.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.values.length > 0) {
    notes.push(`  Value ($4-6K):  ${reflection.tiers.values.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.punts.length > 0) {
    notes.push(`  Punts (<$4K):   ${reflection.tiers.punts.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  
  // Metrics
  notes.push(``);
  notes.push(`METRICS:`);
  notes.push(`  Projected: ${reflection.metrics.projected?.toFixed(0) || 'N/A'} | Ceiling: ${reflection.metrics.ceiling?.toFixed(0) || 'N/A'} | Gap: ${reflection.metrics.ceilingGapPercent?.toFixed(0) || 'N/A'}%`);
  notes.push(`  Avg Ownership: ${reflection.metrics.avgOwnership?.toFixed(0) || 'N/A'}% | Dart Throws: ${reflection.metrics.dartThrowCount || 0}`);
  
  // Considerations
  if (reflection.considerations.length > 0) {
    notes.push(``);
    notes.push(`⚠️ CONSIDERATIONS:`);
    reflection.considerations.forEach(c => {
      notes.push(`  • ${c.message}`);
      if (c.detail) notes.push(`    → ${c.detail}`);
    });
  }
  
  // Questions for Gary
  if (reflection.questions.length > 0) {
    notes.push(``);
    notes.push(`❓ QUESTIONS FOR GARY:`);
    reflection.questions.forEach((q, i) => {
      notes.push(`  ${i + 1}. ${q}`);
    });
  }
  
  // Gary's agency reminder
  notes.push(``);
  notes.push(`💡 ${reflection.reminder}`);
  
  return notes;
}

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
 * ═══════════════════════════════════════════════════════════════════════════
 * CEILING SCORE - 90th Percentile Upside (GPP Optimization)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For GPP tournaments, we need to target 350+ point lineups.
 * This means optimizing for CEILING, not median.
 * 
 * The formula uses:
 * 1. Base projection as floor
 * 2. Best recent game (L5 bestPts) as ceiling indicator
 * 3. Situation multipliers (usage, matchup, revenge, etc.)
 * 4. Volatility bonus for boom/bust players (GPP gold)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context (matchup, usage, etc.)
 * @returns {number} Ceiling score (90th percentile outcome)
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CEILING SCORE - 90th Percentile Upside (GPP Optimization)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For GPP tournaments, we need to target 350+ point lineups.
 * This means optimizing for CEILING, not median.
 * 
 * The formula uses:
 * 1. Base projection as floor
 * 2. Best recent game (L5 bestPts) as ceiling indicator
 * 3. Situation multipliers (usage, matchup, revenge, etc.)
 * 4. Volatility bonus for boom/bust players (GPP gold)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context (matchup, usage, etc.)
 * @returns {number} Ceiling score (90th percentile outcome)
 */
export function calculateCeilingScore(player, context = {}) {
  const baseProjection = player.projected_pts || player.projectedPts || 0;
  const isGPP = context.contestType === 'gpp';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Use L5 best game as ceiling indicator (real data from BDL)
  // ═══════════════════════════════════════════════════════════════════════════
  // If we have L5 stats, use the best game as a ceiling anchor
  // For GPP, we are MORE AGGRESSIVE - ceiling wins tournaments!
  // 10 COMMANDMENTS: "THOU SHALT NOT BUILD FOR FLOOR IN GPPS"
  const gppMultiplier = isGPP ? 1.50 : 1.15; // Increased from 1.35 to 1.50 for GPP
  const l5BestPts = player.l5Stats?.bestPts || 0;
  const ceilingAnchor = l5BestPts > baseProjection ? l5BestPts : baseProjection * gppMultiplier;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Situation multipliers (context-based boosts)
  // ═══════════════════════════════════════════════════════════════════════════
  let multiplier = 1.0;
  
  // Hot streak boost (+15% ceiling) - player is exceeding averages
  if (context.recentForm === 'hot' || player.recentForm === 'hot') {
    multiplier += 0.15;
  }
  
  // Revenge game boost (+10%) - extra motivation vs former team
  if (context.isRevenge || player.isRevenge) {
    multiplier += 0.10;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE SPIKE BOOST (+20-25%) - KEY GPP STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════
  // When a star is OUT, their usage redistributes to teammates.
  // This is the "Usage Vacuum" - the player's ceiling explodes.
  // Example: If LeBron is OUT, Austin Reaves gets +15% usage → +25% ceiling
  if (context.usageBoost || player.usageBoost) {
    // Parse usage boost if it's a string like "+15% usage"
    let usageMultiplier = 0.20; // Default 20% boost
    const usageStr = player.usageBoost || context.usageBoost;
    if (typeof usageStr === 'string') {
      const match = usageStr.match(/\+(\d+)%/);
      if (match) {
        // Convert usage % increase to ceiling boost (roughly 1.5x)
        usageMultiplier = Math.min(0.35, parseInt(match[1]) / 100 * 1.5);
      }
    }
    multiplier += usageMultiplier;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SNAP COUNT / OPPORTUNITY BOOST (+10-15%)
  // ═══════════════════════════════════════════════════════════════════════════
  // Players with 85%+ snaps have higher floors AND ceilings
  // They're on the field for more opportunities
  const snapPct = player.snapPct || context.snapPct || 0;
  if (snapPct >= 90) {
    multiplier += 0.15; // Elite snap count
  } else if (snapPct >= 85) {
    multiplier += 0.10; // Very high snap count
  } else if (snapPct >= 75) {
    multiplier += 0.05; // Good snap count
  }
  
  // Good DvP matchup boost (+10%) - facing weak defense at position
  if (context.dvpRank && context.dvpRank <= 8) {
    multiplier += 0.10;
  } else if (context.dvpRank && context.dvpRank <= 5) {
    multiplier += 0.15; // Top 5 matchup = even bigger boost
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOLATILITY BONUS (GPP Gold)
  // ═══════════════════════════════════════════════════════════════════════════
  // Players with high variance (big difference between best and worst games)
  // are GREAT for GPPs because when they boom, they WIN you tournaments.
  // Cash games want consistency; GPPs want upside.
  if (player.l5Stats?.bestPts && player.l5Stats?.worstPts) {
    const volatility = player.l5Stats.bestPts - player.l5Stats.worstPts;
    const volatilityRatio = volatility / (baseProjection || 20);
    
    // High volatility (50%+ swing) = boom/bust = GPP gold
    if (volatilityRatio >= 0.5) {
      multiplier += 0.10; // Volatility bonus for GPP upside
    }
  }
  
  // Back-to-back reduction (-10%) - fatigue lowers ceiling
  if (context.isB2B || player.isB2B) {
    multiplier -= 0.10;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GAME ENVIRONMENT BOOST (10 COMMANDMENTS: Target 235+ Total Games)
  // ═══════════════════════════════════════════════════════════════════════════
  // Players in high-total games have more scoring opportunity
  // "THOU SHALT TARGET GAME ENVIRONMENTS"
  const gameTotal = player.gameTotal || context.gameTotal || 0;
  if (gameTotal >= 240) {
    multiplier += 0.20; // Elite shootout environment
  } else if (gameTotal >= 235) {
    multiplier += 0.15; // High-total game - target these
  } else if (gameTotal >= 230) {
    multiplier += 0.08; // Above average
  } else if (gameTotal < 215) {
    multiplier -= 0.10; // Low-total slog - avoid these in GPP
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PACE BOOST - Position-Weighted (FIBLE Research)
  // ═══════════════════════════════════════════════════════════════════════════
  // Guards are HIGHLY correlated with pace, bigs are NOT.
  // PG in a fast game = huge boost. Center in fast game = minor boost.
  const PACE_WEIGHTS = {
    'PG': 1.0,   // Full pace boost - guards run the offense
    'SG': 0.7,   // Moderate boost - shooting guards benefit
    'G': 0.85,   // Average of PG/SG
    'SF': 0.3,   // Minimal - wings less affected
    'PF': 0.3,   // Minimal - bigs less affected
    'F': 0.3,    // Average of SF/PF
    'C': 0.2     // Almost ignore pace - centers are matchup-dependent
  };
  
  const pace = player.teamPace || context.pace || 0;
  const playerPosition = (player.position || 'G').toUpperCase();
  const paceWeight = PACE_WEIGHTS[playerPosition] || 0.5;
  
  if (pace >= 102) {
    multiplier += 0.12 * paceWeight; // Fast-paced team (position-weighted)
  } else if (pace >= 100) {
    multiplier += 0.06 * paceWeight; // Above average pace
  } else if (pace <= 96) {
    multiplier -= 0.05 * paceWeight; // Slow-paced team
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL CEILING CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════
  // Use the higher of: adjusted base projection OR ceiling anchor
  // This ensures we capture true upside potential
  const adjustedProjection = baseProjection * multiplier;
  const adjustedCeiling = ceilingAnchor * (multiplier * 0.9); // Slightly dampen ceiling anchor
  
  const finalCeiling = Math.max(adjustedProjection, adjustedCeiling);
  
  return Math.round(finalCeiling * 10) / 10;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLOOR SCORE - Minimum Expected Output (Cash Game Optimization)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For Cash games (50/50, Double-Ups), we need SAFE floors.
 * Target 280 points with high probability of hitting.
 * 
 * The formula uses:
 * 1. Base projection as anchor
 * 2. Worst recent game (L5 worstPts) as floor indicator
 * 3. Situation modifiers (snap count, blowout risk, weather)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context
 * @returns {number} Floor score (10th percentile outcome)
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLOOR SCORE - Minimum Expected Output (Cash Game Optimization)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For Cash games (50/50, Double-Ups), we need SAFE floors.
 * Target 280 points with high probability of hitting.
 * 
 * The formula uses:
 * 1. Base projection as anchor
 * 2. Worst recent game (L5 worstPts) as floor indicator
 * 3. Situation modifiers (snap count, blowout risk, weather)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context
 * @returns {number} Floor score (10th percentile outcome)
 */
export function calculateFloorScore(player, context = {}) {
  const baseProjection = player.projected_pts || player.projectedPts || 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Use L5 worst game as floor anchor (real data from BDL)
  // ═══════════════════════════════════════════════════════════════════════════
  const l5WorstPts = player.l5Stats?.worstPts || 0;
  const floorAnchor = l5WorstPts > 0 ? l5WorstPts : baseProjection * 0.65;
  
  // Default floor is 70% of projection
  let floorPct = 0.70;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SNAP COUNT FLOOR BOOST (+10-15%)
  // ═══════════════════════════════════════════════════════════════════════════
  // High snap count = more opportunities = higher floor
  // This is the KEY metric for Cash games
  const snapPct = player.snapPct || context.snapPct || 0;
  if (snapPct >= 90) {
    floorPct += 0.15; // Elite volume = very safe floor
  } else if (snapPct >= 85) {
    floorPct += 0.10; // High volume = safe floor
  } else if (snapPct >= 75) {
    floorPct += 0.05; // Good volume
  } else if (snapPct > 0 && snapPct < 60) {
    floorPct -= 0.10; // Low snap count = risky floor
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE SPIKE FLOOR BOOST (+5-10%)
  // ═══════════════════════════════════════════════════════════════════════════
  // If a star is OUT, the backup gets guaranteed volume = higher floor
  if (context.usageBoost || player.usageBoost) {
    floorPct += 0.08; // Usage spike = safer floor
  }
  
  // Cold streak lowers floor (-10%) - player is underperforming
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL FLOOR CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════
  // Use the higher of: percentage-based floor OR real L5 worst game
  // This ensures we don't underestimate proven performers
  const adjustedFloor = baseProjection * floorPct;
  const finalFloor = Math.max(adjustedFloor, floorAnchor * 0.9);
  
  return Math.round(finalFloor * 10) / 10;
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
 * ═══════════════════════════════════════════════════════════════════════════
 * GPP VALUE TARGETS - Industry-Standard Multipliers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * To hit 350+ points in GPPs, you need players hitting these value targets:
 * 
 * NBA GPP Target: 7x value ($5K player needs 35 pts, $10K needs 70 pts)
 * NBA Cash Target: 5x value (safer, hit 280 pts)
 * 
 * NFL GPP Target: 4x value ($6K player needs 24 pts)
 * NFL Cash Target: 2.5x value (safer floor)
 * 
 * These targets help identify "smash spots" vs "chalk traps"
 * ═══════════════════════════════════════════════════════════════════════════
 */


/**
 * Calculate GPP Value Score - Points needed to hit GPP target
 * @param {number} salary - Player salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Target points to hit value
 */
export function calculateGPPValueTarget(salary, sport, contestType = 'gpp') {
  const target = GPP_VALUE_TARGETS[sport]?.[contestType] || 5.0;
  return Math.round((salary / 1000) * target * 10) / 10;
}

/**
 * Check if a player is a "Smash Spot" (ceiling > GPP target)
 * @param {Object} player - Player with ceiling and salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {boolean} True if player can smash GPP value target
 */


/**
 * Check if a player is a "Smash Spot" (ceiling > GPP target)
 * @param {Object} player - Player with ceiling and salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {boolean} True if player can smash GPP value target
 */
export function isSmashSpot(player, sport) {
  const ceilingScore = player.ceilingScore || calculateCeilingScore(player, {});
  const gppTarget = calculateGPPValueTarget(player.salary || 5000, sport, 'gpp');
  return ceilingScore >= gppTarget;
}

/**
 * Calculate all DFS metrics for a player
 * 
 * @param {Object} player - Player with projection and context
 * @param {Object} context - DFS context (matchup, form, etc.)
 * @param {string} sport - 'NBA' or 'NFL' (for GPP targets)
 * @returns {Object} All DFS metrics
 */


/**
 * Calculate all DFS metrics for a player
 * 
 * @param {Object} player - Player with projection and context
 * @param {Object} context - DFS context (matchup, form, etc.)
 * @param {string} sport - 'NBA' or 'NFL' (for GPP targets)
 * @returns {Object} All DFS metrics
 */
export function calculateDFSMetrics(player, context = {}, sport = 'NBA') {
  const projectedPts = player.projected_pts || player.projectedPts || 0;
  const salary = player.salary || 0;
  
  const ceilingScore = calculateCeilingScore(player, context);
  const floorScore = calculateFloorScore(player, context);
  const valueScore = calculateValueScore(projectedPts, salary);
  
  // GPP-specific metrics
  const gppValueTarget = calculateGPPValueTarget(salary, sport, 'gpp');
  const cashValueTarget = calculateGPPValueTarget(salary, sport, 'cash');
  const isGppSmash = ceilingScore >= gppValueTarget;
  const isCashSafe = floorScore >= cashValueTarget;
  
  return {
    valueScore,
    ceilingScore,
    floorScore,
    // GPP optimization metrics
    gppValueTarget,
    cashValueTarget,
    isGppSmash,      // True if ceiling can hit 7x (NBA) or 4x (NFL)
    isCashSafe,      // True if floor hits 5x (NBA) or 2.5x (NFL)
    // Consistency requires historical data - estimate based on projection
    consistencyRating: player.consistencyRating || 0.75,
    // Form from context
    recentForm: context.recentForm || player.recentForm || 'neutral'
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPPORTUNITY SCORE - Volume-Based Breakout Detection
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This identifies "Price Lag" players - high opportunity but low salary.
 * DFS sites are slow to adjust salaries to new roles/volume.
 * 
 * NFL Opportunity Score uses:
 * - Snap Count % (opportunity to produce)
 * - Target Share (% of team targets for WR/TE)
 * - Red Zone Targets (TD upside)
 * - Air Yards (big play potential)
 * 
 * NBA Opportunity Score uses:
 * - Minutes Per Game (opportunity)
 * - Usage Rate Boost (from injuries)
 * - L5 Hot Streak (recent form)
 * 
 * @param {Object} player - Player with opportunity metrics
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} { score: number, isPriceLag: boolean, reason: string }
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPPORTUNITY SCORE - Volume-Based Breakout Detection
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This identifies "Price Lag" players - high opportunity but low salary.
 * DFS sites are slow to adjust salaries to new roles/volume.
 * 
 * NFL Opportunity Score uses:
 * - Snap Count % (opportunity to produce)
 * - Target Share (% of team targets for WR/TE)
 * - Red Zone Targets (TD upside)
 * - Air Yards (big play potential)
 * 
 * NBA Opportunity Score uses:
 * - Minutes Per Game (opportunity)
 * - Usage Rate Boost (from injuries)
 * - L5 Hot Streak (recent form)
 * 
 * @param {Object} player - Player with opportunity metrics
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} { score: number, isPriceLag: boolean, reason: string }
 */
export function calculateOpportunityScore(player, sport) {
  let score = 50; // Base score (0-100 scale)
  let reasons = [];
  
  if (sport === 'NFL') {
    // ═══════════════════════════════════════════════════════════════════════
    // NFL OPPORTUNITY SCORE
    // ═══════════════════════════════════════════════════════════════════════
    
    const snapPct = player.snapPct || 0;
    const targetShare = player.targetShare || 0;
    const redZoneTargets = player.redZoneTargets || 0;
    const position = (player.position || '').toUpperCase();
    
    // Snap Count Score (0-30 points)
    // 90%+ snaps = 30 pts, 80% = 24 pts, 70% = 18 pts
    if (snapPct >= 90) {
      score += 30;
      reasons.push(`Elite snap count (${snapPct}%)`);
    } else if (snapPct >= 80) {
      score += 24;
      reasons.push(`High snap count (${snapPct}%)`);
    } else if (snapPct >= 70) {
      score += 18;
    } else if (snapPct >= 60) {
      score += 12;
    }
    
    // Target Share Score for WR/TE (0-25 points)
    if (['WR', 'TE'].includes(position) && targetShare > 0) {
      if (targetShare >= 25) {
        score += 25;
        reasons.push(`Elite target share (${targetShare}%)`);
      } else if (targetShare >= 20) {
        score += 20;
        reasons.push(`High target share (${targetShare}%)`);
      } else if (targetShare >= 15) {
        score += 15;
      } else if (targetShare >= 10) {
        score += 10;
      }
    }
    
    // Red Zone Targets Score (0-20 points) - TD upside
    if (redZoneTargets >= 10) {
      score += 20;
      reasons.push(`Red zone threat (${redZoneTargets} RZ targets)`);
    } else if (redZoneTargets >= 7) {
      score += 15;
    } else if (redZoneTargets >= 5) {
      score += 10;
    } else if (redZoneTargets >= 3) {
      score += 5;
    }
    
    // RB Rush Attempts Bonus (opportunity for RBs)
    if (position === 'RB') {
      const rushAttempts = player.seasonStats?.rushing_attempts || 0;
      const gamesPlayed = player.seasonStats?.games_played || 1;
      const attPerGame = rushAttempts / gamesPlayed;
      
      if (attPerGame >= 18) {
        score += 20;
        reasons.push(`Workhorse RB (${attPerGame.toFixed(1)} att/gm)`);
      } else if (attPerGame >= 14) {
        score += 15;
      } else if (attPerGame >= 10) {
        score += 10;
      }
    }
    
  } else {
    // ═══════════════════════════════════════════════════════════════════════
    // NBA OPPORTUNITY SCORE
    // ═══════════════════════════════════════════════════════════════════════
    
    const mpg = player.seasonStats?.mpg || player.l5Stats?.mpg || 0;
    const usageBoost = player.usageBoost || null;
    const recentForm = player.recentForm || 'neutral';
    
    // ═══════════════════════════════════════════════════════════════════════
    // ROTATION CONTEXT - Predictive vs Reactive
    // ═══════════════════════════════════════════════════════════════════════
    const rotationStatus = player.rotation_status || 'stable';
    const minutesTrend = player.minutes_trend || 'stable';
    const roleSustainability = player.role_sustainability || 'season_long';
    const projectedMinutes = player.projected_minutes || mpg;
    
    // Minutes Per Game Score (0-30 points)
    // Use PROJECTED minutes for tonight, not historical average
    const tonightMinutes = projectedMinutes > 0 ? projectedMinutes : mpg;
    
    if (tonightMinutes >= 35) {
      score += 30;
      reasons.push(`Heavy minutes (${tonightMinutes.toFixed(1)} mpg)`);
    } else if (tonightMinutes >= 32) {
      score += 26;
      reasons.push(`High minutes (${tonightMinutes.toFixed(1)} mpg)`);
    } else if (tonightMinutes >= 28) {
      score += 20;
    } else if (tonightMinutes >= 24) {
      score += 14;
    } else if (tonightMinutes >= 20) {
      score += 8;
    }
    
    // Usage Boost Score (0-25 points) - Key injury impact
    if (usageBoost) {
      score += 25;
      reasons.push(`Usage spike: ${usageBoost}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PREDICTIVE BREAKOUT BOOST (NEW!)
    // ═══════════════════════════════════════════════════════════════════════
    // Reward players whose role is EXPANDING (before they pop, not after)
    if (rotationStatus === 'expanded_role' && minutesTrend === 'increasing') {
      score += 20;
      reasons.push('🚀 Breakout opportunity (role expanding)');
    } else if (rotationStatus === 'breakout_candidate') {
      score += 15;
      reasons.push('Breakout candidate');
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // HOT STREAK LOGIC (REVISED) - Context-Aware
    // ═══════════════════════════════════════════════════════════════════════
    // Only reward hot streaks if the role is SUSTAINABLE
    // Don't chase yesterday's outlier if it was a fill-in role that ended
    if (recentForm === 'hot') {
      // Check if this was a temporary fill-in role that has now ended
      const isFillInEnded = rotationStatus === 'bench_return' || 
                            rotationStatus === 'diminished_role' ||
                            roleSustainability === 'ended' ||
                            roleSustainability === 'one_game';
      
      if (isFillInEnded) {
        // PENALIZE chasing yesterday's outlier when role ended
        score -= 10;
        reasons.push('❌ Hot streak (unsustainable - fill-in role ended)');
      } else {
        // Reward sustainable hot streaks
        score += 15;
        reasons.push('Hot streak (sustainable role)');
      }
    } else if (recentForm === 'cold') {
      score -= 10; // Penalty for cold players
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // FADE DIMINISHED ROLES
    // ═══════════════════════════════════════════════════════════════════════
    // If a player's role just ended (starter returned), actively fade them
    if (rotationStatus === 'diminished_role' || minutesTrend === 'decreasing') {
      score -= 15;
      reasons.push('Role diminished (starter returned)');
    }
    
    // L5 Best Game Indicator (ceiling exists)
    if (player.l5Stats?.bestPts) {
      const seasonPpg = player.seasonStats?.ppg || 0;
      const bestPts = player.l5Stats.bestPts;
      if (bestPts >= seasonPpg * 1.5) {
        score += 10;
        reasons.push(`Proven ceiling (${bestPts} pts game)`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRICE LAG DETECTION
  // ═══════════════════════════════════════════════════════════════════════
  // A player has "Price Lag" if their opportunity score is high but salary
  // hasn't caught up yet. This is the GPP breakout sweet spot.
  //
  // High opportunity (score > 75) + below-average salary = Price Lag
  const salary = player.salary || 5000;
  const avgSalary = sport === 'NBA' ? 6500 : 5500;
  const isPriceLag = score >= 75 && salary < avgSalary;
  
  if (isPriceLag) {
    reasons.push(`PRICE LAG: High opportunity at $${salary}`);
  }
  
  return {
    score: Math.min(100, Math.max(0, score)),
    isPriceLag,
    reasons,
    reasonSummary: reasons.slice(0, 2).join(', ') || 'Standard opportunity'
  };
}

/**
 * Apply Opportunity Score boost to player projection
 * This is called during lineup optimization to identify breakouts
 * 
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} Player with opportunityScore and boosted projection
 */


/**
 * Apply Opportunity Score boost to player projection
 * This is called during lineup optimization to identify breakouts
 * 
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} Player with opportunityScore and boosted projection
 */
export function applyOpportunityBoost(player, sport) {
  const opportunityData = calculateOpportunityScore(player, sport);
  
  // Copy player to avoid mutation
  const boostedPlayer = { ...player };
  boostedPlayer.opportunityScore = opportunityData.score;
  boostedPlayer.isPriceLag = opportunityData.isPriceLag;
  boostedPlayer.opportunityReasons = opportunityData.reasons;
  
  // Apply projection boost for Price Lag players
  // These are the "Hidden Gems" - high opportunity, low salary
  if (opportunityData.isPriceLag) {
    const baseProjection = boostedPlayer.projected_pts || 0;
    const boost = baseProjection * 0.15; // 15% boost for Price Lag
    boostedPlayer.projected_pts = Math.round((baseProjection + boost) * 10) / 10;
    boostedPlayer.projectionBoosted = true;
    boostedPlayer.boostReason = opportunityData.reasonSummary;
    
    console.log(`[Opportunity] 🚀 PRICE LAG: ${player.name} boosted +${boost.toFixed(1)} pts (${opportunityData.reasonSummary})`);
  }
  
  return boostedPlayer;
}

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

export 
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
function isPositionEligible(playerPos, slotPos, sport = 'NBA', allPositions = null) {
  // If we have Tank01's platform-specific positions, use them directly
  if (allPositions && Array.isArray(allPositions) && allPositions.length > 0) {
    // Check if the slot matches any of the player's valid positions
    const normalizedSlot = slotPos.toUpperCase();
    const normalizedPositions = allPositions.map(p => p.toUpperCase());
    
    // Direct match with any valid position
    if (normalizedPositions.includes(normalizedSlot)) return true;
    
    // UTIL/FLEX slots accept anyone
    if (normalizedSlot === 'UTIL' || normalizedSlot === 'FLEX') return true;
    
    // G slot accepts PG or SG
    if (normalizedSlot === 'G' && normalizedPositions.some(p => ['PG', 'SG'].includes(p))) return true;
    
    // F slot accepts SF or PF
    if (normalizedSlot === 'F' && normalizedPositions.some(p => ['SF', 'PF'].includes(p))) return true;
    
    return false;
  }
  
  // Fallback to generic position mapping
  const eligibleSlots = getEligibleSlots(playerPos, sport);
  return eligibleSlots.includes(slotPos);
}

// Helper function to get eligible slots for a player position (fallback when Tank01 data unavailable)

export 
// Helper function to get eligible slots for a player position (fallback when Tank01 data unavailable)
function getEligibleSlots(playerPosition, sport) {
  const positionEligibility = {
    // NBA - Standard positions
    'PG': ['PG', 'G', 'UTIL'],
    'SG': ['SG', 'G', 'UTIL'],
    'SF': ['SF', 'F', 'UTIL'],
    'PF': ['PF', 'F', 'UTIL'],
    'C': ['C', 'UTIL'],
    // NBA - Generic/combo positions (BDL format)
    'G': ['PG', 'SG', 'G', 'UTIL'],
    'F': ['SF', 'PF', 'F', 'UTIL'],
    'G-F': ['PG', 'SG', 'SF', 'G', 'F', 'UTIL'],
    'F-G': ['PG', 'SG', 'SF', 'G', 'F', 'UTIL'],
    'F-C': ['PF', 'C', 'F', 'UTIL'],
    'C-F': ['PF', 'C', 'F', 'UTIL'],
    // NFL
    'QB': ['QB'],
    'RB': ['RB', 'FLEX'],
    'WR': ['WR', 'FLEX'],
    'TE': ['TE', 'FLEX'],
    'K': ['K'],
    'DST': ['DST'],
    'DEF': ['DST']
  };
  
  return positionEligibility[playerPosition] || [playerPosition];
}

// Helper to get all slots a player can fill, using platform-specific data when available

export 
// Helper to get all slots a player can fill, using platform-specific data when available
function getPlayerEligibleSlots(player, sport = 'NBA', platform = 'draftkings') {
  const slots = new Set();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TANK01 POSITIONS ARE SOURCE OF TRUTH - NO FALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════
  // Tank01 returns `allValidPositions` which is the EXACT list of slots
  // a player can fill on DraftKings or FanDuel. 
  // 
  // NO FALLBACKS: If Tank01 doesn't provide positions, the player cannot
  // be used in lineups. We cannot guess at DFS positions.
  // 
  // DRAFTKINGS FLEX RULES (applied on top of Tank01 positions):
  // - G slot accepts: PG, SG (guards)
  // - F slot accepts: SF, PF (forwards)
  // - UTIL accepts: everyone
  // 
  // This is NOT expansion - this is DraftKings roster rules.
  // A PG can fill PG or G or UTIL. But G does NOT mean they can fill PG.
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (!player.allPositions || !Array.isArray(player.allPositions) || player.allPositions.length === 0) {
    // NO TANK01 POSITION DATA = PLAYER CANNOT BE USED
    // Return empty array - this player won't be eligible for any slots
    console.warn(`[Position] ⚠️ ${player.name} has no Tank01 position data - cannot be used in lineup`);
    return [];
  }
  
  // Use Tank01's platform-specific positions EXACTLY as provided
  player.allPositions.forEach(pos => {
    if (pos) slots.add(pos.toUpperCase());
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DRAFTKINGS FLEX SLOT RULES (not expansion - actual DK roster rules)
  // ═══════════════════════════════════════════════════════════════════════════
  if (sport === 'NBA' && platform === 'draftkings') {
    // G slot accepts PG or SG
    if (slots.has('PG') || slots.has('SG')) {
      slots.add('G');
    }
    // F slot accepts SF or PF
    if (slots.has('SF') || slots.has('PF')) {
      slots.add('F');
    }
  }
  
  // UTIL is always valid for NBA
  if (sport === 'NBA' && !slots.has('UTIL')) {
    slots.add('UTIL');
  }
  
  // FLEX is always valid for NFL skill positions
  if (sport === 'NFL') {
    const hasSkillPos = ['RB', 'WR', 'TE'].some(p => slots.has(p));
    if (hasSkillPos && !slots.has('FLEX')) {
      slots.add('FLEX');
    }
  }
  
  return Array.from(slots);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OWNERSHIP AWARENESS - GPP Tournament Leverage (AWARENESS, NOT PRESCRIPTIVE)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Gary is AWARE that ownership matters in GPP tournaments:
 * 
 * HIGH OWNERSHIP (>25% "chalk"):
 *   - Must SMASH projection to help you climb leaderboard (many competing lineups)
 *   - Still pick if best play, but understand the leverage dynamics
 * 
 * LOW OWNERSHIP (<10% "contrarian"):
 *   - Massive differentiation if player hits ceiling
 *   - Can vault you up leaderboard with fewer competing lineups
 * 
 * Gary's Philosophy: 
 *   1. Pick the lineup with HIGHEST EXPECTED SCORE
 *   2. Use ownership as ONE data point (along with projection, ceiling, narrative)
 *   3. Don't force pivots based on arbitrary caps
 *   4. Be aware high ownership = need differentiation to win
 * 
 * CASH games don't need ownership awareness (consistency > differentiation)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GARY'S SELF-REVIEW OPTIMIZATION (3 Rounds)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * After building the initial greedy lineup, Gary reviews it:
 * 
 * ROUND 1: SALARY EFFICIENCY
 * - Check if money was left on the table
 * - Upgrade weak spots with remaining salary
 * - Ensure we're maximizing total projected points
 * 
 * ROUND 2: OWNERSHIP AWARENESS
 * - Calculate total lineup ownership FOR AWARENESS ONLY
 * - Identify chalk plays (high ownership) and contrarian picks
 * - Log ownership data as informational context
 * - NO FORCED PIVOTS - Gary picks highest expected score lineup
 * - Ownership is ONE data point among many (projection, ceiling, narrative)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OWNERSHIP AWARENESS - GPP Tournament Leverage (AWARENESS, NOT PRESCRIPTIVE)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Gary is AWARE that ownership matters in GPP tournaments:
 * 
 * HIGH OWNERSHIP (>25% "chalk"):
 *   - Must SMASH projection to help you climb leaderboard (many competing lineups)
 *   - Still pick if best play, but understand the leverage dynamics
 * 
 * LOW OWNERSHIP (<10% "contrarian"):
 *   - Massive differentiation if player hits ceiling
 *   - Can vault you up leaderboard with fewer competing lineups
 * 
 * Gary's Philosophy: 
 *   1. Pick the lineup with HIGHEST EXPECTED SCORE
 *   2. Use ownership as ONE data point (along with projection, ceiling, narrative)
 *   3. Don't force pivots based on arbitrary caps
 *   4. Be aware high ownership = need differentiation to win
 * 
 * CASH games don't need ownership awareness (consistency > differentiation)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GARY'S SELF-REVIEW OPTIMIZATION (3 Rounds)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * After building the initial greedy lineup, Gary reviews it:
 * 
 * ROUND 1: SALARY EFFICIENCY
 * - Check if money was left on the table
 * - Upgrade weak spots with remaining salary
 * - Ensure we're maximizing total projected points
 * 
 * ROUND 2: OWNERSHIP AWARENESS
 * - Calculate total lineup ownership FOR AWARENESS ONLY
 * - Identify chalk plays (high ownership) and contrarian picks
 * - Log ownership data as informational context
 * - NO FORCED PIVOTS - Gary picks highest expected score lineup
 * - Ownership is ONE data point among many (projection, ceiling, narrative)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function selfReviewLineup(lineup, playerPool, constraints, sport, platform, context = {}) {
  const { salaryCap } = constraints;
  const contestType = context.contestType || 'gpp';
  const isGPP = contestType === 'gpp';
  
  let currentLineup = [...lineup];
  let totalSalary = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  let totalPts = currentLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  
  console.log(`\n[Gary Self-Review] 🔍 Starting review... (${contestType.toUpperCase()})`);
  console.log(`[Gary Self-Review] Initial: $${totalSalary}/${salaryCap} | ${totalPts.toFixed(1)} pts`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND 1: LINEUP QUALITY CHECK (Awareness, Not Forced Optimization)
  // ═══════════════════════════════════════════════════════════════════════════
  // The salary cap is a CEILING, not a target. Gary doesn't swap players just
  // to use more salary. He only upgrades if there's a CLEARLY BETTER option
  // that improves the lineup quality (value, ceiling, or narrative fit).
  // 
  // Philosophy: If Gary likes his lineup, leave money on the table.
  // ═══════════════════════════════════════════════════════════════════════════
  let remainingSalary = salaryCap - totalSalary;
  
  // Log remaining salary but don't force usage
  if (remainingSalary >= 500) {
    console.log(`[Gary Self-Review] 💰 Round 1: $${remainingSalary} remaining under cap`);
    
    // Only look for upgrades if there's a CLEAR improvement available
    // "Clear" = better value (pts/$1k) AND better projection AND fits the narrative
    const sortedByValue = [...currentLineup].sort((a, b) => {
      const aVal = (a.projected_pts || 0) / ((a.salary || 5000) / 1000);
      const bVal = (b.projected_pts || 0) / ((b.salary || 5000) / 1000);
      return aVal - bVal; // Lowest value first
    });
    
    // Only check the single worst-value spot (not 3 like before)
    const worstValueSpot = sortedByValue[0];
    const worstValue = (worstValueSpot.projected_pts || 0) / ((worstValueSpot.salary || 5000) / 1000);
    
    // Only consider upgrade if current spot has BAD value (< 4x on low salary)
    const isBadValue = worstValue < 4.0 && worstValueSpot.salary < 6000;
    
    if (isBadValue) {
      const position = worstValueSpot.position;
      const currentPts = worstValueSpot.projected_pts || 0;
      const currentSalary = worstValueSpot.salary || 0;
      const maxUpgradeSalary = currentSalary + remainingSalary;
      
      // Find a CLEARLY better player (not just marginally better)
      const upgrades = playerPool.filter(p => {
        if (p.name === worstValueSpot.player) return false;
        if (currentLineup.some(l => l.player === p.name)) return false;
        if (p.status === 'OUT' || p.status === 'DOUBTFUL') return false;
        if (!p.salary || p.salary > maxUpgradeSalary) return false;
        
        // Protect stacks
        const isStackPlayer = worstValueSpot.stackSwap || worstValueSpot.bringbackSwap || worstValueSpot.isStack;
        if (isStackPlayer && p.team !== worstValueSpot.team) return false;
        
        // Check position eligibility (use platform-specific if available)
        const eligible = isPositionEligible(p.position, position, sport, p.allPositions);
        if (!eligible) return false;
        
        const upgradePts = p.projected_pts || calculateProjectedPoints(p, sport, platform, contestType);
        const upgradeValue = upgradePts / ((p.salary || 5000) / 1000);
        
        // CLEAR improvement = at least 3+ pts better AND better value
        return upgradePts > currentPts + 3 && upgradeValue > worstValue + 0.5;
      }).sort((a, b) => {
        // Sort by value, not just raw points
        const aVal = (a.projected_pts || 0) / ((a.salary || 5000) / 1000);
        const bVal = (b.projected_pts || 0) / ((b.salary || 5000) / 1000);
        return bVal - aVal;
      });
      
      if (upgrades.length > 0) {
        const upgrade = upgrades[0];
        const upgradePts = upgrade.projected_pts || calculateProjectedPoints(upgrade, sport, platform, contestType);
        const ptsGain = upgradePts - currentPts;
        const costIncrease = upgrade.salary - currentSalary;
        
        const newTotalSalary = totalSalary + costIncrease;
        if (newTotalSalary <= salaryCap) {
          console.log(`[Gary Self-Review] ⬆️ CLEAR UPGRADE: ${worstValueSpot.player} → ${upgrade.name} (+${ptsGain.toFixed(1)} pts, +$${costIncrease})`);
          
          const idx = currentLineup.findIndex(p => p.player === worstValueSpot.player);
          if (idx !== -1) {
            currentLineup[idx] = {
              ...currentLineup[idx],
              player: upgrade.name,
              team: upgrade.team,
              salary: upgrade.salary,
              projected_pts: upgradePts
            };
            totalSalary = newTotalSalary;
            totalPts += ptsGain;
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND 2: OWNERSHIP ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  // Calculate total lineup ownership and identify chalk/contrarian plays
  console.log(`[Gary Self-Review] 🎯 Round 2: Ownership analysis...`);
  
  // Get ownership data for current lineup players
  for (const lineupPlayer of currentLineup) {
    const poolPlayer = playerPool.find(p => p.name === lineupPlayer.player);
    if (poolPlayer) {
      lineupPlayer.ownership = poolPlayer.ownership || lineupPlayer.ownership || 15;
      lineupPlayer.ceilingScore = poolPlayer.ceilingScore || lineupPlayer.ceilingScore || lineupPlayer.projected_pts * 1.2;
      lineupPlayer.isChalk = lineupPlayer.ownership >= 25;
      lineupPlayer.isContrarian = lineupPlayer.ownership < 10;
    }
  }
  
  // Calculate total lineup ownership
  let totalOwnership = currentLineup.reduce((sum, p) => sum + (p.ownership || 15), 0);
  
  // Count ownership breakdown
  const chalkPlays = currentLineup.filter(p => (p.ownership || 15) >= 25);
  const contrarianPlays = currentLineup.filter(p => (p.ownership || 15) < 10);
  const rosterSize = currentLineup.length;
  
  console.log(`[Gary Self-Review] Total ownership: ${totalOwnership.toFixed(1)}%`);
  console.log(`[Gary Self-Review] Breakdown: ${chalkPlays.length} chalk (>25%), ${contrarianPlays.length} contrarian (<10%), ${rosterSize - chalkPlays.length - contrarianPlays.length} moderate`);
  
  // Log ownership awareness for Gary
  if (isGPP && totalOwnership > 130) {
    console.log(`[Gary Self-Review] 📊 High ownership lineup (${totalOwnership.toFixed(1)}%) - these players must smash to differentiate`);
  } else if (isGPP && totalOwnership < 100) {
    console.log(`[Gary Self-Review] 🎲 Contrarian lineup (${totalOwnership.toFixed(1)}%) - high leverage if hits ceiling`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OWNERSHIP AWARENESS (No Forced Pivots)
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary doesn't force pivots based on ownership caps. He simply logs the data
  // for awareness. Ownership is ONE factor among many (projection, ceiling, etc.)
  if (false) { // Disabled: No forced ownership pivots
    console.log(`[Gary Self-Review] ⚠️ Round 3: CHALK PIVOT - ownership ${totalOwnership.toFixed(1)}% (DISABLED - awareness only)`);
    
    // Sort chalk plays by ownership (highest first = best to swap out)
    const chalkSorted = [...chalkPlays]
      .filter(p => !p.forcedLock) // 🛡️ NEVER pivot confirmed starters (BDL lock)
      .sort((a, b) => (b.ownership || 0) - (a.ownership || 0));
    
    let pivotsMade = 0;
    const maxPivots = 2; // Limit pivots to avoid over-optimization
    
    for (const chalkPlayer of chalkSorted) {
      if (totalOwnership <= GPP_OWNERSHIP_CAP) break;
      if (pivotsMade >= maxPivots) break;
      
      // Find lower-owned alternative with similar ceiling
      const chalkCeiling = chalkPlayer.ceilingScore || chalkPlayer.projected_pts * 1.2;
      const chalkSalary = chalkPlayer.salary || 5000;
      const chalkOwnership = chalkPlayer.ownership || 25;
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FLEXIBLE PIVOT SEARCH - Willing to trade some ceiling for ownership leverage
      // ═══════════════════════════════════════════════════════════════════════════
      // GPP math: A 10% ownership advantage can be worth 3-5 projection points
      // because you're sharing the win with fewer lineups if you hit.
      // 
      // The key insight: It's better to have a 45-ceiling player at 8% ownership
      // than a 50-ceiling player at 30% ownership in large-field GPPs.
      // ═══════════════════════════════════════════════════════════════════════════
      const alternatives = playerPool.filter(p => {
        if (p.name === chalkPlayer.player) return false;
        if (currentLineup.some(l => l.player === p.name)) return false;
        if (p.status === 'OUT' || p.status === 'DOUBTFUL') return false;
        
        const altOwnership = p.ownership || 15;
        const altCeiling = p.ceilingScore || (p.projected_pts || 0) * 1.2;
        const altSalary = p.salary || 5000;
        
        // Must be meaningfully lower ownership (at least 8% less)
        const ownershipGain = chalkOwnership - altOwnership;
        if (ownershipGain < 8) return false;
        
        // Allow ceiling tradeoff proportional to ownership gain
        // For every 5% ownership saved, accept up to 2 pts of ceiling loss
        const allowedCeilingLoss = (ownershipGain / 5) * 2;
        const ceilingLoss = chalkCeiling - altCeiling;
        if (ceilingLoss > allowedCeilingLoss) return false;
        
        // Must fit salary (more flexible - within $2500, or if cheaper that's fine)
        const salaryDiff = altSalary - chalkSalary;
        const currentTotal = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
        const wouldExceedCap = currentTotal + salaryDiff > salaryCap;
        if (salaryDiff > 2500 || wouldExceedCap) return false;
        
        // Check position eligibility (universal logic)
        const playerPos = (p.position || '').toUpperCase();
        const slotPos = chalkPlayer.position?.toUpperCase();
        const canFill = playerPos === slotPos || 
          (slotPos === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPos)) ||
          (slotPos === 'UTIL') || // UTIL can take anyone
          (slotPos === 'G' && ['PG', 'SG', 'G', 'G-F', 'F-G'].includes(playerPos)) ||
          (slotPos === 'F' && ['SF', 'PF', 'F', 'F-G', 'G-F', 'F-C', 'C-F'].includes(playerPos));
        
        return canFill;
      }).sort((a, b) => {
        // Score = ceiling - (ownership * 0.3) - prioritize low ownership with good ceiling
        const scoreA = (a.ceilingScore || (a.projected_pts || 0) * 1.2) - ((a.ownership || 15) * 0.3);
        const scoreB = (b.ceilingScore || (b.projected_pts || 0) * 1.2) - ((b.ownership || 15) * 0.3);
        return scoreB - scoreA;
      });
      
      if (alternatives.length > 0) {
        const alt = alternatives[0];
        const altOwnership = alt.ownership || 15;
        const ownershipSaved = chalkOwnership - altOwnership;
        
        // Apply the swap
        const idx = currentLineup.findIndex(p => p.player === chalkPlayer.player);
        if (idx !== -1) {
          const oldPlayer = currentLineup[idx].player;
          const salaryDiff = (alt.salary || 5000) - chalkSalary;
          
          currentLineup[idx] = {
            ...currentLineup[idx],
            player: alt.name,
            team: alt.team,
            salary: alt.salary || 5000,
            projected_pts: alt.projected_pts || alt.ceilingScore,
            ceilingScore: alt.ceilingScore,
            ownership: altOwnership,
            isChalk: false,
            isContrarian: altOwnership < 10,
            chalkPivot: true // Flag that this was a leverage swap
          };
          
          totalOwnership -= ownershipSaved;
          totalSalary += salaryDiff;
          pivotsMade++;
          
          console.log(`[Gary Self-Review] 🔄 CHALK PIVOT: ${oldPlayer} (${chalkOwnership}%) → ${alt.name} (${altOwnership}%) | Saved ${ownershipSaved.toFixed(1)}% ownership`);
        }
      }
    }
    
    if (pivotsMade > 0) {
      console.log(`[Gary Self-Review] ✅ Made ${pivotsMade} chalk pivots, new ownership: ${totalOwnership.toFixed(1)}%`);
    } else {
      console.log(`[Gary Self-Review] ℹ️ No suitable chalk pivots found - lineup stays as-is`);
    }
  }
  
  // Log any contrarian picks Gary made organically (bonus for tournament differentiation)
  const finalContrarian = currentLineup.filter(p => (p.ownership || 15) < 10);
  if (finalContrarian.length > 0) {
    console.log(`[Gary Self-Review] 🎲 Contrarian picks: ${finalContrarian.map(p => `${p.player} (${p.ownership || 15}%)`).join(', ')}`);
  }
  
  // Recalculate totals
  totalSalary = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  totalPts = currentLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  totalOwnership = currentLineup.reduce((sum, p) => sum + (p.ownership || 15), 0);
  
  console.log(`[Gary Self-Review] ✅ Final: $${totalSalary}/${salaryCap} | ${totalPts.toFixed(1)} pts | ${totalOwnership.toFixed(1)}% ownership\n`);
  
  return {
    lineup: currentLineup,
    totalSalary,
    projectedPoints: totalPts,
    totalOwnership
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNT VALIDATION - Prevent "Fragile Floor" Lineups
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that lineup doesn't have too many minimum-salary players.
 * Too many punts = if one player duds (8 points), entire lineup collapses.
 * 
 * Example failure: 4 players at $3,800 = need 6.5x value from ALL to hit 390 pts
 * If ONE gets 12 pts instead of 25, you need other players to score 95 each.
 * 
 * @param {Array} lineup - Lineup slots
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {Object} { valid: boolean, error: string, puntPlayers: Array }
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNT VALIDATION - Prevent "Fragile Floor" Lineups
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that lineup doesn't have too many minimum-salary players.
 * Too many punts = if one player duds (8 points), entire lineup collapses.
 * 
 * Example failure: 4 players at $3,800 = need 6.5x value from ALL to hit 390 pts
 * If ONE gets 12 pts instead of 25, you need other players to score 95 each.
 * 
 * @param {Array} lineup - Lineup slots
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {Object} { valid: boolean, error: string, puntPlayers: Array }
 */
export function validatePuntCount(lineup, platform, contestType = 'gpp') {
  const threshold = PUNT_SALARY_THRESHOLD[platform] || 4500;
  const maxPunts = MAX_PUNTS_PER_LINEUP[contestType] || 2;
  const MIN_MPG_FOR_PUNTS = 18; // Punts must have 18+ MPG unless injury boost
  
  const puntPlayers = lineup.filter(slot => slot.salary < threshold);
  const puntCount = puntPlayers.length;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MPG FILTER: Flag punts with insufficient minutes history
  // A player averaging <18 MPG with no injury boost = high bust risk
  // ═══════════════════════════════════════════════════════════════════════════
  const riskyPunts = puntPlayers.filter(p => {
    const mpg = p.mpg || p.seasonStats?.mpg || 0;
    const hasInjuryBoost = p.usageBoost || p.teammateOpportunity || p.injuryBeneficiary;
    const isRookie = !p.seasonStats?.ppg && !p.l5Stats?.ppg; // No historical stats = rookie
    
    // Risky if: low MPG AND no injury boost AND not a known quantity
    return mpg < MIN_MPG_FOR_PUNTS && !hasInjuryBoost && isRookie;
  });
  
  if (riskyPunts.length > 0) {
    console.log(`[Punt Validation] ⚠️ RISKY PUNTS (${riskyPunts.length}): ${riskyPunts.map(p => `${p.player} (${(p.mpg || p.seasonStats?.mpg || 0).toFixed(0)} MPG)`).join(', ')}`);
  }
  
  if (puntCount > maxPunts) {
    return {
      valid: false,
      puntCount, // Include puntCount for self-heal logic
      error: `FRAGILE FLOOR: ${puntCount} punt plays (max: ${maxPunts}). Replace cheap players with mid-range ($5k-$7k) for higher floor.`,
      puntPlayers: puntPlayers.map(p => ({ 
        name: p.player, 
        salary: p.salary, 
        position: p.position,
        mpg: p.mpg || p.seasonStats?.mpg || 0,
        isRisky: riskyPunts.some(rp => rp.player === p.player)
      })),
      riskyPunts: riskyPunts.map(p => p.player),
      suggestion: `Downgrade a star and upgrade ${puntCount - maxPunts} punt player(s)${riskyPunts.length > 0 ? ` - prioritize replacing: ${riskyPunts.map(p => p.player).join(', ')}` : ''}`
    };
  }
  
  return { 
    valid: true, 
    puntCount,
    puntPlayers: puntPlayers.map(p => ({ 
      name: p.player, 
      salary: p.salary, 
      position: p.position,
      mpg: p.mpg || p.seasonStats?.mpg || 0,
      isRisky: riskyPunts.some(rp => rp.player === p.player)
    })),
    riskyPunts: riskyPunts.map(p => p.player)
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANTI-CORRELATION DETECTION - Identify Conflicting Player Combinations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Detects when you've stacked players who compete for same opportunities.
 * Example: Gui Santos + Trayce Jackson-Davis (both GSW bench)
 * - If Santos gets hot, coach leaves him in → Jackson-Davis sits
 * - If Jackson-Davis gets hot, Santos sits
 * - You're betting against yourself
 * 
 * @param {Array} lineup - Lineup slots
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} { conflictScore: number, conflicts: Array }
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANTI-CORRELATION DETECTION - Identify Conflicting Player Combinations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Detects when you've stacked players who compete for same opportunities.
 * Example: Gui Santos + Trayce Jackson-Davis (both GSW bench)
 * - If Santos gets hot, coach leaves him in → Jackson-Davis sits
 * - If Jackson-Davis gets hot, Santos sits
 * - You're betting against yourself
 * 
 * @param {Array} lineup - Lineup slots
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} { conflictScore: number, conflicts: Array }
 */
export function checkAntiCorrelation(lineup, sport = 'NBA') {
  let conflictScore = 0;
  const conflicts = [];
  
  for (let i = 0; i < lineup.length; i++) {
    for (let j = i + 1; j < lineup.length; j++) {
      const playerA = lineup[i];
      const playerB = lineup[j];
      
      for (const [ruleName, rule] of Object.entries(ANTI_CORRELATION_RULES)) {
        // Skip NFL-specific rules if NBA, and vice versa
        if (sport === 'NBA' && ruleName.includes('rb')) continue;
        if (sport === 'NFL' && ruleName.includes('bench_conflict')) continue;
        
        if (rule.check(playerA, playerB)) {
          conflictScore += rule.penalty;
          conflicts.push({
            players: [playerA.player, playerB.player],
            teams: [playerA.team, playerB.team],
            positions: [playerA.position, playerB.position],
            penalty: rule.penalty,
            reason: rule.reason,
            ruleName: rule.name
          });
          
          console.log(`[Anti-Correlation] ⚠️ ${rule.name}: ${playerA.player} + ${playerB.player} (${rule.reason})`);
        }
      }
    }
  }
  
  return { 
    conflictScore, 
    conflicts,
    hasConflicts: conflicts.length > 0
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHALK FADE STRATEGY - Tournament Leverage Play
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In large tournaments, if everyone plays the same "chalk" (high-owned players),
 * you can only win if EVERYONE in your lineup pops off.
 * 
 * Better strategy: Fade ONE chalk play for a contrarian alternative.
 * - If chalk busts → you're ahead of 50% of field
 * - If chalk hits → your contrarian better hit too, but you have differentiation
 * 
 * Example: Jalen Johnson at 50% ownership
 * - If he scores 45 instead of 73 → 50% of field is eliminated
 * - Pivoting to SGA (20% owned) creates leverage
 * 
 * @param {Array} playerPool - All available players
 * @param {Array} lineup - Current lineup
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {Object} { shouldFade: boolean, fadeCandidate: Object, alternative: Object }
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHALK FADE STRATEGY - Tournament Leverage Play
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In large tournaments, if everyone plays the same "chalk" (high-owned players),
 * you can only win if EVERYONE in your lineup pops off.
 * 
 * Better strategy: Fade ONE chalk play for a contrarian alternative.
 * - If chalk busts → you're ahead of 50% of field
 * - If chalk hits → your contrarian better hit too, but you have differentiation
 * 
 * Example: Jalen Johnson at 50% ownership
 * - If he scores 45 instead of 73 → 50% of field is eliminated
 * - Pivoting to SGA (20% owned) creates leverage
 * 
 * @param {Array} playerPool - All available players
 * @param {Array} lineup - Current lineup
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {Object} { shouldFade: boolean, fadeCandidate: Object, alternative: Object }
 */
export function applyChalkFadeStrategy(playerPool, lineup, contestType = 'gpp') {
  if (contestType !== 'gpp') {
    return { shouldFade: false, reason: 'Only for GPP tournaments' };
  }
  
  // Find chalk players in lineup (>30% ownership)
  const chalkPlayers = lineup.filter(slot => (slot.ownership || 0) > 30);
  
  if (chalkPlayers.length <= 1) {
    return { shouldFade: false, reason: 'Acceptable chalk level (<= 1 player)' };
  }
  
  console.log(`[Chalk Fade] ⚠️ ${chalkPlayers.length} chalk plays detected (>30% owned)`);
  
  // Sort chalk by ownership (highest first)
  const highestChalk = chalkPlayers.sort((a, b) => (b.ownership || 0) - (a.ownership || 0))[0];
  
  // Find contrarian alternative (<15% owned, similar salary)
  const contrarianAlternatives = playerPool.filter(p => 
    p.position === highestChalk.position &&
    Math.abs(p.salary - highestChalk.salary) < 1500 &&
    (p.ownership || 15) < 15 &&
    (p.projected_pts || 0) >= (highestChalk.projected_pts || 0) * 0.85 && // At least 85% projection
    p.name !== highestChalk.player // Don't suggest swapping to same player
  ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
  
  if (contrarianAlternatives.length > 0) {
    const alternative = contrarianAlternatives[0];
    
    console.log(`[Chalk Fade] 💡 LEVERAGE OPPORTUNITY:`);
    console.log(`   Fade: ${highestChalk.player} (${highestChalk.ownership}% owned, ${highestChalk.projected_pts} pts)`);
    console.log(`   Play: ${alternative.name} (${alternative.ownership || 'N/A'}% owned, ${alternative.projected_pts} pts)`);
    
    return {
      shouldFade: true,
      fadeCandidate: {
        name: highestChalk.player,
        salary: highestChalk.salary,
        ownership: highestChalk.ownership,
        projectedPts: highestChalk.projected_pts
      },
      alternative: {
        name: alternative.name,
        salary: alternative.salary,
        ownership: alternative.ownership || 10,
        projectedPts: alternative.projected_pts
      },
      leverageReason: `If ${highestChalk.player} has a mediocre game, ${Math.round(highestChalk.ownership)}% of field is eliminated. This pivot creates differentiation while maintaining similar ceiling.`
    };
  }
  
  return { 
    shouldFade: false, 
    reason: 'No suitable contrarian alternatives found',
    chalkCount: chalkPlayers.length
  };
}

/**
 * Validate a lineup meets all constraints
 * @param {Object} lineup - Lineup to validate
 * @param {string} platform - Platform name
 * @param {string} sport - Sport name
 * @returns {Object} { valid: boolean, errors: string[] }
 */


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


