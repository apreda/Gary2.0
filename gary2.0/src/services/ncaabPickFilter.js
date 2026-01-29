/**
 * NCAAB Pick Filter Service
 *
 * Filters Gary's NCAAB picks to create a balanced slate.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 29, 2026):
 *
 * 1. SKIP the top confidence pick (don't take it)
 * 2. Take 1 UNDERDOG SPREAD (highest confidence)
 * 3. Take 1 ML PICK (highest confidence)
 * 4. Take 1 FAVORITE SPREAD (highest confidence)
 * 5. Take the NEXT HIGHEST CONFIDENCE pick (any type)
 * 6. Take 1 UNDERDOG HOME TEAM pick (highest confidence remaining)
 *
 * Result: 5 balanced picks
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
 * Check if the picked team is the home team
 */
function isPickedTeamHome(pick) {
  const pickedTeamName = pick.pick?.split(/\s+[+-]?\d/)[0]?.trim()?.toLowerCase();
  const homeTeamName = pick.home_team?.toLowerCase() || pick.homeTeam?.toLowerCase() || '';

  if (!pickedTeamName || !homeTeamName) {
    return false; // Can't determine, be conservative
  }

  // Check if the picked team name matches the home team
  return homeTeamName.includes(pickedTeamName) || pickedTeamName.includes(homeTeamName);
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
 * Main filter function - applies NCAAB filtering rules
 *
 * RULES:
 * 1. Skip top confidence pick
 * 2. Take 1 underdog spread
 * 3. Take 1 ML pick
 * 4. Take 1 favorite spread
 * 5. Take next highest confidence pick
 * 6. Take 1 underdog home team pick
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
    skippedTopConfidence: 0,
    keptUnderdogSpread: 0,
    keptML: 0,
    keptFavoriteSpread: 0,
    keptNextHighestConf: 0,
    keptUnderdogHome: 0,
    removedNotNeeded: 0
  };

  // Sort by confidence (highest first)
  activePicks.sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NCAAB Filter] All picks sorted by confidence:');
  activePicks.forEach((p, i) => {
    const conf = getConfidence(p);
    const category = getPickCategory(p);
    const isHome = isPickedTeamHome(p) ? ' [HOME]' : '';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)} [${category}]${isHome}`);
  });

  // STEP 1: Skip the top confidence pick
  const topPick = activePicks[0];
  if (topPick) {
    removed.push({ pick: topPick, reason: 'Top confidence pick (skipped by rule)' });
    reasons.skippedTopConfidence++;
    console.log(`\n[NCAAB Filter] SKIP top confidence: ${topPick.pick} (conf: ${getConfidence(topPick).toFixed(2)})`);
  }

  // Remaining picks after skipping top
  const remainingPicks = activePicks.slice(1);

  // Categorize remaining picks
  const underdogSpreads = remainingPicks.filter(p => getPickCategory(p) === 'underdog_spread');
  const mlPicks = remainingPicks.filter(p => getPickCategory(p) === 'ml');
  const favoriteSpreads = remainingPicks.filter(p => getPickCategory(p) === 'favorite_spread');

  console.log(`\n[NCAAB Filter] Categories (after skipping top):`);
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

  // STEP 5: Take next highest confidence pick (any type)
  const remainingByConfidence = remainingPicks.filter(p => !usedPicks.has(p));

  if (remainingByConfidence.length > 0) {
    const pick = remainingByConfidence[0]; // Already sorted by confidence
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptNextHighestConf++;
    console.log(`  [KEEP] Next highest confidence: ${pick.pick}`);
  }

  // STEP 6: Take 1 underdog HOME team pick (highest confidence remaining)
  const underdogHomePicks = remainingPicks.filter(p => {
    if (usedPicks.has(p)) return false;
    return isUnderdog(p) && isPickedTeamHome(p);
  });

  if (underdogHomePicks.length > 0) {
    const pick = underdogHomePicks[0];
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptUnderdogHome++;
    console.log(`  [KEEP] Underdog HOME: ${pick.pick}`);
  }

  // Mark remaining picks as removed
  for (const pick of remainingPicks) {
    if (!usedPicks.has(pick)) {
      removed.push({ pick, reason: 'Not needed for balanced slate' });
      reasons.removedNotNeeded++;
    }
  }

  // Summary
  console.log(`\n[NCAAB Filter] Final Summary:`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.keptUnderdogSpread > 0) console.log(`    - Underdog spread: ${reasons.keptUnderdogSpread}`);
  if (reasons.keptML > 0) console.log(`    - ML: ${reasons.keptML}`);
  if (reasons.keptFavoriteSpread > 0) console.log(`    - Favorite spread: ${reasons.keptFavoriteSpread}`);
  if (reasons.keptNextHighestConf > 0) console.log(`    - Next highest confidence: ${reasons.keptNextHighestConf}`);
  if (reasons.keptUnderdogHome > 0) console.log(`    - Underdog HOME: ${reasons.keptUnderdogHome}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.skippedTopConfidence > 0) console.log(`    - Top confidence (skipped): ${reasons.skippedTopConfidence}`);
  if (reasons.removedNotNeeded > 0) console.log(`    - Not needed: ${reasons.removedNotNeeded}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNCAABPicks
};
