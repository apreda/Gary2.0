/**
 * NCAAB Pick Filter Service
 *
 * Filters Gary's NCAAB picks for bet type balance.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * 40% RULE:
 * - Keep approximately 40% of picks
 * - Minimum 3 picks (no hard max - 40% naturally produces 3-7)
 *
 * BET TYPE RULES:
 * - Underdog spreads: ALLOWED (team getting points)
 * - Favorite spreads: ONLY if HOME team (laying points at home is safer)
 * - At least 1 ML pick required
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
    // Check spread value from pick data or pick string
    const spreadVal = pick.spread || pick.spreadValue;
    if (spreadVal !== undefined && spreadVal !== null) {
      result.spreadValue = parseFloat(spreadVal);
    } else {
      // Extract spread from pick string (e.g., "Duke -7.5 -110")
      const spreadMatch = pick.pick?.match(/([+-]?\d+\.?\d*)\s*[+-]\d+$/);
      if (spreadMatch) {
        result.spreadValue = parseFloat(spreadMatch[1]);
      }
    }
    result.isFavorite = result.spreadValue < 0;
    result.isUnderdog = result.spreadValue > 0;
  }

  return result;
}

/**
 * Check if the picked team is the HOME team
 */
function isPickedTeamHome(pick) {
  const pickText = pick.pick || '';
  const homeTeam = pick.homeTeam || '';

  if (!homeTeam) return false;

  // Check if home team name appears in the pick
  // Use last word of team name for matching (e.g., "Duke" from "Duke Blue Devils")
  const homeWords = homeTeam.split(' ');
  const lastWord = homeWords[homeWords.length - 1];

  return pickText.toLowerCase().includes(lastWord.toLowerCase());
}

/**
 * Main filter function - applies NCAAB filtering rules
 *
 * RULES:
 * 1. 40% rule (target 40% of games, min 3)
 * 2. Underdog spreads OK
 * 3. Favorite spreads ONLY if HOME team
 * 4. At least 1 ML pick
 *
 * @param {Array} picks - Array of Gary's NCAAB picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNCAABPicks(picks) {
  console.log(`\n[NCAAB Filter] Analyzing ${picks.length} picks...`);

  const MIN_PICKS = 3;

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NCAAB Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  // Calculate target based on 40% rule
  const targetCount = Math.max(MIN_PICKS, Math.round(activePicks.length * 0.4));
  console.log(`[NCAAB Filter] ${activePicks.length} picks, targeting ${targetCount} (40% rule, min ${MIN_PICKS})`);

  const kept = [];
  const removed = [];
  const reasons = {
    removedFavoriteAway: 0,
    removedForTarget: 0,
    keptML: 0,
    keptUnderdogSpread: 0,
    keptFavoriteSpread: 0
  };

  // STEP 1: Filter out favorite spreads that are NOT home teams
  const validPicks = [];

  for (const pick of activePicks) {
    const type = getPickType(pick);

    if (type.isFavorite && type.isSpread) {
      // Favorite spread - check if HOME team
      if (!isPickedTeamHome(pick)) {
        removed.push({ pick, reason: 'Favorite spread on AWAY team (only home favorites allowed)' });
        reasons.removedFavoriteAway++;
        console.log(`  [REMOVE] ${pick.pick} - Favorite spread on away team`);
        continue;
      }
    }

    validPicks.push(pick);
  }

  console.log(`[NCAAB Filter] ${validPicks.length} valid picks after favorite-away filter`);

  // STEP 2: Sort by confidence
  const sortedByConfidence = [...validPicks].sort((a, b) => getConfidence(b) - getConfidence(a));

  // STEP 3: Ensure at least 1 ML pick
  const mlPicks = sortedByConfidence.filter(p => getPickType(p).isML);
  const spreadPicks = sortedByConfidence.filter(p => !getPickType(p).isML);

  // Reserve the best ML pick
  let reservedML = null;
  if (mlPicks.length > 0) {
    reservedML = mlPicks[0];
    kept.push(reservedML);
    reasons.keptML++;
    console.log(`  [KEEP] ${reservedML.pick} - Reserved ML pick`);
  }

  // STEP 4: Fill remaining slots from spread picks by confidence
  const remainingSlots = targetCount - kept.length;
  const remainingPicks = sortedByConfidence.filter(p => p !== reservedML);

  for (let i = 0; i < remainingPicks.length; i++) {
    const pick = remainingPicks[i];
    const type = getPickType(pick);

    if (kept.length < targetCount) {
      kept.push(pick);
      if (type.isML) {
        reasons.keptML++;
        console.log(`  [KEEP] ${pick.pick} - ML`);
      } else if (type.isUnderdog) {
        reasons.keptUnderdogSpread++;
        console.log(`  [KEEP] ${pick.pick} - Underdog spread`);
      } else if (type.isFavorite) {
        reasons.keptFavoriteSpread++;
        console.log(`  [KEEP] ${pick.pick} - Home favorite spread`);
      }
    } else {
      removed.push({ pick, reason: 'Removed for 40% target cap' });
      reasons.removedForTarget++;
    }
  }

  // STEP 5: If we don't have an ML and there are ML picks available, swap one in
  if (reasons.keptML === 0 && mlPicks.length > 0) {
    const bestML = mlPicks[0];
    // Find lowest confidence non-ML pick to swap out
    const nonMLKept = kept.filter(p => !getPickType(p).isML);
    if (nonMLKept.length > 0) {
      nonMLKept.sort((a, b) => getConfidence(a) - getConfidence(b));
      const toSwap = nonMLKept[0];
      const swapIdx = kept.indexOf(toSwap);
      if (swapIdx > -1) {
        kept.splice(swapIdx, 1);
        kept.push(bestML);
        removed.push({ pick: toSwap, reason: 'Swapped for required ML pick' });
        reasons.keptML++;
        console.log(`  [SWAP] Removed ${toSwap.pick} for ML ${bestML.pick}`);
      }
    }
  }

  // Summary
  console.log(`\n[NCAAB Filter] Summary:`);
  console.log(`  KEPT: ${kept.length} picks (target was ${targetCount})`);
  if (reasons.keptML > 0) console.log(`    - ML picks: ${reasons.keptML}`);
  if (reasons.keptUnderdogSpread > 0) console.log(`    - Underdog spreads: ${reasons.keptUnderdogSpread}`);
  if (reasons.keptFavoriteSpread > 0) console.log(`    - Favorite spreads (home): ${reasons.keptFavoriteSpread}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedFavoriteAway > 0) console.log(`    - Favorite spreads (away): ${reasons.removedFavoriteAway}`);
  if (reasons.removedForTarget > 0) console.log(`    - Over 40% target: ${reasons.removedForTarget}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNCAABPicks
};
