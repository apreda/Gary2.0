/**
 * NCAAB Pick Filter Service
 *
 * Filters Gary's NCAAB picks for quality and bet type balance.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * TARGET: 3-7 picks per day (40% of total picks)
 *
 * BET TYPE RULES:
 * - Underdog spreads: ALL allowed
 * - Favorite spreads: ONLY if favorite is the HOME team
 * - Moneyline: At least 1 ML pick per day
 *
 * SELECTION ORDER:
 * 1. Sort by confidence (highest first)
 * 2. Apply bet type rules
 * 3. Take top 40% (min 3, max 7)
 * 4. Ensure at least 1 ML pick
 */

/**
 * Get confidence value from pick
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Determine pick type details
 */
function getPickType(pick) {
  const result = {
    isML: false,
    isSpread: false,
    isFavorite: false,
    isUnderdog: false,
    spreadValue: 0
  };

  if (pick.type === 'moneyline') {
    result.isML = true;
  } else if (pick.type === 'spread') {
    result.isSpread = true;
    // Extract spread from pick string (e.g., "Duke -7.5 -110")
    const spreadMatch = pick.pick?.match(/([+-]?\d+\.?\d*)\s*[+-]\d+$/);
    if (spreadMatch) {
      result.spreadValue = parseFloat(spreadMatch[1]);
      result.isFavorite = result.spreadValue < 0;
      result.isUnderdog = result.spreadValue > 0;
    }
  }

  return result;
}

/**
 * Check if the picked team is the home team
 */
function isPickedTeamHome(pick) {
  // The pick format is "Team Name [spread] [odds]"
  // The matchup is stored in pick.matchup or can be derived from pick.home_team/away_team
  const pickedTeamName = pick.pick?.split(/\s+[+-]?\d/)[0]?.trim()?.toLowerCase();
  const homeTeamName = pick.home_team?.toLowerCase() || pick.homeTeam?.toLowerCase() || '';

  if (!pickedTeamName || !homeTeamName) {
    // If we can't determine, allow it (conservative)
    return true;
  }

  // Check if the picked team name matches the home team
  return homeTeamName.includes(pickedTeamName) || pickedTeamName.includes(homeTeamName);
}

/**
 * Main filter function - applies NCAAB filtering rules
 *
 * RULES:
 * 1. Filter by bet type rules (underdog OK, favorite only if home)
 * 2. Sort by confidence
 * 3. Take top 40% (min 3, max 7)
 * 4. Ensure at least 1 ML pick
 *
 * @param {Array} picks - Array of Gary's NCAAB picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNCAABPicks(picks) {
  console.log(`\n[NCAAB Filter] Analyzing ${picks.length} picks...`);

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NCAAB Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  const kept = [];
  const removed = [];
  const reasons = {
    removedFavoriteAway: 0,
    keptML: 0,
    keptUnderdogSpread: 0,
    keptFavoriteHomeSpread: 0,
    removedLowConfidence: 0,
    addedMLForBalance: 0
  };

  // STEP 1: Apply bet type rules
  console.log('\n[NCAAB Filter] Applying bet type rules...');
  const qualifiedPicks = [];

  for (const pick of activePicks) {
    const type = getPickType(pick);
    const conf = getConfidence(pick);
    const isHome = isPickedTeamHome(pick);

    // ML picks: always allowed
    if (type.isML) {
      qualifiedPicks.push(pick);
      console.log(`  [OK] ML: ${pick.pick} (conf: ${conf.toFixed(2)})`);
      continue;
    }

    // Underdog spreads: always allowed
    if (type.isUnderdog) {
      qualifiedPicks.push(pick);
      console.log(`  [OK] Dog +${Math.abs(type.spreadValue)}: ${pick.pick} (conf: ${conf.toFixed(2)})`);
      continue;
    }

    // Favorite spreads: only if HOME team
    if (type.isFavorite) {
      if (isHome) {
        qualifiedPicks.push(pick);
        console.log(`  [OK] Fav ${type.spreadValue} (HOME): ${pick.pick} (conf: ${conf.toFixed(2)})`);
      } else {
        removed.push({ pick, reason: 'Favorite spread on AWAY team - not allowed' });
        reasons.removedFavoriteAway++;
        console.log(`  [REMOVED] Fav ${type.spreadValue} (AWAY): ${pick.pick} - favorites must be home`);
      }
    }
  }

  console.log(`\n[NCAAB Filter] ${qualifiedPicks.length} picks passed bet type rules, ${reasons.removedFavoriteAway} removed (favorite away)`);

  // STEP 2: Sort by confidence
  qualifiedPicks.sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NCAAB Filter] Picks sorted by confidence:');
  qualifiedPicks.forEach((p, i) => {
    const conf = getConfidence(p);
    const type = getPickType(p);
    const typeStr = type.isML ? 'ML' : (type.isUnderdog ? `+${Math.abs(type.spreadValue)}` : `${type.spreadValue}`);
    console.log(`  ${i + 1}. ${p.pick} [${typeStr}] - conf: ${conf.toFixed(2)}`);
  });

  // STEP 3: Calculate target count (40% of original, min 3)
  // No hard max - 40% naturally produces 3-7 picks with typical daily game counts
  const targetCount = Math.max(3, Math.round(activePicks.length * 0.4));
  console.log(`\n[NCAAB Filter] Target: ${targetCount} picks (40% of ${activePicks.length}, min 3)`);

  // STEP 4: Take top picks by confidence
  const selectedPicks = qualifiedPicks.slice(0, targetCount);
  const excessPicks = qualifiedPicks.slice(targetCount);

  // Track what we kept
  for (const pick of selectedPicks) {
    const type = getPickType(pick);
    if (type.isML) reasons.keptML++;
    else if (type.isUnderdog) reasons.keptUnderdogSpread++;
    else if (type.isFavorite) reasons.keptFavoriteHomeSpread++;
  }

  // Add excess to removed
  for (const pick of excessPicks) {
    removed.push({ pick, reason: `Below 40% cutoff (confidence: ${getConfidence(pick).toFixed(2)})` });
    reasons.removedLowConfidence++;
  }

  // STEP 5: Ensure at least 1 ML pick
  const hasML = selectedPicks.some(p => getPickType(p).isML);

  if (!hasML && qualifiedPicks.length > 0) {
    // Find the best ML pick from qualified picks
    const bestML = qualifiedPicks.find(p => getPickType(p).isML);

    if (bestML && !selectedPicks.includes(bestML)) {
      // Remove the lowest confidence pick and add the ML
      const lowestPick = selectedPicks.pop();
      if (lowestPick) {
        removed.push({ pick: lowestPick, reason: 'Replaced to ensure ML pick' });
        reasons.removedLowConfidence++;

        // Adjust counts
        const lowestType = getPickType(lowestPick);
        if (lowestType.isUnderdog) reasons.keptUnderdogSpread--;
        else if (lowestType.isFavorite) reasons.keptFavoriteHomeSpread--;
      }

      selectedPicks.push(bestML);
      reasons.keptML++;
      reasons.addedMLForBalance++;
      console.log(`\n[NCAAB Filter] Added ML pick for balance: ${bestML.pick}`);
    }
  }

  // Final kept list
  kept.push(...selectedPicks);

  // Summary
  console.log(`\n[NCAAB Filter] Final Summary:`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.keptML > 0) console.log(`    - ML picks: ${reasons.keptML}`);
  if (reasons.keptUnderdogSpread > 0) console.log(`    - Underdog spreads: ${reasons.keptUnderdogSpread}`);
  if (reasons.keptFavoriteHomeSpread > 0) console.log(`    - Favorite spreads (home only): ${reasons.keptFavoriteHomeSpread}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedFavoriteAway > 0) console.log(`    - Favorite away (not allowed): ${reasons.removedFavoriteAway}`);
  if (reasons.removedLowConfidence > 0) console.log(`    - Below 40% cutoff: ${reasons.removedLowConfidence}`);
  if (reasons.addedMLForBalance > 0) console.log(`    - ML added for balance: ${reasons.addedMLForBalance}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNCAABPicks
};
