/**
 * NBA Pick Filter Service
 *
 * Filters Gary's NBA picks to create a balanced slate.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 29, 2026):
 *
 * 1. SKIP the top confidence pick (don't take it)
 * 2. Take 1 UNDERDOG SPREAD (highest confidence)
 * 3. Take 1 ML PICK (highest confidence)
 * 4. Take 1 FAVORITE SPREAD (highest confidence)
 * 5. Take NEXT HIGHEST CONFIDENCE pick (any type) - ONLY if enough games
 *
 * DYNAMIC PICK COUNT:
 * - Target ~50% of total games analyzed
 * - Min: 3 picks, Max: 5 picks
 * - If few games that day, 3-4 picks is fine
 *
 * Result: 3-5 balanced picks depending on game volume
 */

/**
 * Get confidence value from pick (handles different field names)
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Determine if a pick is an underdog
 * - Spread picks: positive spread (e.g., +7.5)
 * - ML picks: positive odds (e.g., +150)
 */
function isUnderdog(pick) {
  // Check spread first
  if (pick.type === 'spread') {
    const spreadMatch = pick.pick?.match(/([+-]?\d+\.?\d*)\s*[+-]\d+$/);
    if (spreadMatch) {
      const spreadValue = parseFloat(spreadMatch[1]);
      return spreadValue > 0; // Positive spread = underdog
    }
  }

  // Check ML odds
  if (pick.odds) {
    const odds = typeof pick.odds === 'string' ? parseInt(pick.odds) : pick.odds;
    return odds > 0; // Positive odds = underdog
  }

  return false;
}

/**
 * Determine pick type category
 */
function getPickCategory(pick) {
  const isUnderdogPick = isUnderdog(pick);

  if (pick.type === 'moneyline') {
    return 'ml';
  } else if (pick.type === 'spread') {
    return isUnderdogPick ? 'underdog_spread' : 'favorite_spread';
  }

  // Fallback based on odds
  return 'ml';
}

/**
 * Calculate target pick count based on total games
 * Target ~50% of games, min 3, max 5
 */
function getTargetPickCount(totalGames) {
  // Target 50% of games
  const target = Math.ceil(totalGames * 0.5);
  // Clamp between 3 and 5
  return Math.max(3, Math.min(5, target));
}

/**
 * Main filter function - applies NBA filtering rules
 *
 * RULES:
 * 1. Skip top confidence pick
 * 2. Take 1 underdog spread
 * 3. Take 1 ML pick
 * 4. Take 1 favorite spread
 * 5. Take next highest confidence pick (if target allows)
 *
 * @param {Array} picks - Array of Gary's NBA picks
 * @param {number} totalGamesAnalyzed - Total games Gary analyzed (for dynamic count)
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNBAPicks(picks, totalGamesAnalyzed = null) {
  console.log(`\n[NBA Filter] Analyzing ${picks.length} picks...`);

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NBA Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  // Calculate target pick count based on games analyzed
  const gamesCount = totalGamesAnalyzed || activePicks.length;
  const targetPicks = getTargetPickCount(gamesCount);
  console.log(`[NBA Filter] Games analyzed: ${gamesCount}, Target picks: ${targetPicks}`);

  const kept = [];
  const removed = [];
  const reasons = {
    skippedTopConfidence: 0,
    keptUnderdogSpread: 0,
    keptML: 0,
    keptFavoriteSpread: 0,
    keptNextHighestConf: 0,
    removedNotNeeded: 0
  };

  // Sort by confidence (highest first)
  activePicks.sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NBA Filter] All picks sorted by confidence:');
  activePicks.forEach((p, i) => {
    const conf = getConfidence(p);
    const category = getPickCategory(p);
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)} [${category}]`);
  });

  // STEP 1: Skip the top confidence pick
  const topPick = activePicks[0];
  if (topPick) {
    removed.push({ pick: topPick, reason: 'Top confidence pick (skipped by rule)' });
    reasons.skippedTopConfidence++;
    console.log(`\n[NBA Filter] SKIP top confidence: ${topPick.pick} (conf: ${getConfidence(topPick).toFixed(2)})`);
  }

  // Remaining picks after skipping top
  const remainingPicks = activePicks.slice(1);

  // Categorize remaining picks
  const underdogSpreads = remainingPicks.filter(p => getPickCategory(p) === 'underdog_spread');
  const mlPicks = remainingPicks.filter(p => getPickCategory(p) === 'ml');
  const favoriteSpreads = remainingPicks.filter(p => getPickCategory(p) === 'favorite_spread');

  console.log(`\n[NBA Filter] Categories (after skipping top):`);
  console.log(`  Underdog spreads: ${underdogSpreads.length}`);
  console.log(`  ML picks: ${mlPicks.length}`);
  console.log(`  Favorite spreads: ${favoriteSpreads.length}`);

  // Track which picks we've used
  const usedPicks = new Set();

  // STEP 2: Take 1 underdog spread (highest confidence)
  if (underdogSpreads.length > 0) {
    const pick = underdogSpreads[0];
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptUnderdogSpread++;
    console.log(`  [KEEP] Underdog spread: ${pick.pick}`);
  }

  // STEP 3: Take 1 ML pick (highest confidence)
  if (mlPicks.length > 0) {
    const pick = mlPicks[0];
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptML++;
    console.log(`  [KEEP] ML: ${pick.pick}`);
  }

  // STEP 4: Take 1 favorite spread (highest confidence)
  if (favoriteSpreads.length > 0) {
    const pick = favoriteSpreads[0];
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptFavoriteSpread++;
    console.log(`  [KEEP] Favorite spread: ${pick.pick}`);
  }

  // STEP 5: Take next highest confidence pick(s) until we hit target
  // Only add more if we haven't hit target yet
  const remainingByConfidence = remainingPicks.filter(p => !usedPicks.has(p));

  while (kept.length < targetPicks && remainingByConfidence.length > 0) {
    const pick = remainingByConfidence.shift(); // Take highest confidence remaining
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptNextHighestConf++;
    console.log(`  [KEEP] Next highest confidence: ${pick.pick}`);
  }

  // Mark remaining picks as removed
  for (const pick of remainingPicks) {
    if (!usedPicks.has(pick)) {
      removed.push({ pick, reason: 'Not needed for balanced slate' });
      reasons.removedNotNeeded++;
    }
  }

  // Summary
  console.log(`\n[NBA Filter] Final Summary:`);
  console.log(`  TARGET: ${targetPicks} picks (${gamesCount} games × 50%)`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.keptUnderdogSpread > 0) console.log(`    - Underdog spread: ${reasons.keptUnderdogSpread}`);
  if (reasons.keptML > 0) console.log(`    - ML: ${reasons.keptML}`);
  if (reasons.keptFavoriteSpread > 0) console.log(`    - Favorite spread: ${reasons.keptFavoriteSpread}`);
  if (reasons.keptNextHighestConf > 0) console.log(`    - Next highest confidence: ${reasons.keptNextHighestConf}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.skippedTopConfidence > 0) console.log(`    - Top confidence (skipped): ${reasons.skippedTopConfidence}`);
  if (reasons.removedNotNeeded > 0) console.log(`    - Not needed: ${reasons.removedNotNeeded}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

/**
 * Clear caches (no-op for simplified filter, kept for API compatibility)
 */
export function clearFilterCache() {
  // No caches in simplified version
}

export default {
  filterNBAPicks,
  clearFilterCache
};
