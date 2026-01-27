/**
 * NHL Pick Filter Service
 *
 * Filters Gary's NHL picks for balanced selection.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * NHL IS MONEYLINE ONLY:
 * - Filter out ANY puck line picks (spreads like +1.5, -1.5)
 *
 * SELECTION PROCESS:
 * 1. Remove top 2 confidence picks (overconfidence trap)
 * 2. Remove bottom 2 confidence picks (low conviction)
 * 3. From remaining: Take 2 best underdog MLs
 * 4. From remaining: Take 2 best favorite MLs
 * 5. Total = 4 picks (2 underdogs + 2 favorites)
 */

/**
 * Check if a pick is a puck line (spread bet)
 * NHL should be ML only - this catches any puck lines that slip through
 */
function isPuckLine(pick) {
  // Check type field
  if (pick.type === 'spread' || pick.type === 'puckline' || pick.type === 'puck_line') {
    return true;
  }

  // Check pick string for spread indicators
  const pickStr = pick.pick?.toLowerCase() || '';
  if (pickStr.includes('+1.5') || pickStr.includes('-1.5') ||
      pickStr.includes('+2.5') || pickStr.includes('-2.5') ||
      pickStr.includes('puck line') || pickStr.includes('puckline')) {
    return true;
  }

  return false;
}

/**
 * Determine if a pick is an underdog ML
 * Underdog = positive odds (e.g., +150)
 */
function isUnderdogML(pick) {
  if (!pick.odds) return false;
  const odds = typeof pick.odds === 'string' ? parseInt(pick.odds) : pick.odds;
  return odds > 0;
}

/**
 * Determine if a pick is a favorite ML
 * Favorite = negative odds (e.g., -150)
 */
function isFavoriteML(pick) {
  if (!pick.odds) return false;
  const odds = typeof pick.odds === 'string' ? parseInt(pick.odds) : pick.odds;
  return odds < 0;
}

/**
 * Get confidence value from pick (handles different field names)
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Main filter function - applies NHL filtering rules
 *
 * RULES:
 * 1. Filter out puck lines (NHL is ML only)
 * 2. Remove top 2 confidence picks (overconfidence trap)
 * 3. Remove bottom 2 confidence picks (low conviction)
 * 4. Take 2 best underdog MLs
 * 5. Take 2 best favorite MLs
 * 6. Total = 4 picks
 *
 * @param {Array} picks - Array of Gary's NHL picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNHLPicks(picks) {
  console.log(`\n[NHL Filter] Analyzing ${picks.length} picks...`);

  const kept = [];
  const removed = [];
  const reasons = {
    puckLinesRemoved: 0,
    removedTopConfidence: 0,
    removedBottomConfidence: 0,
    keptUnderdogs: 0,
    keptFavorites: 0,
    removedExcess: 0
  };

  // STEP 0: Filter out PASS picks and puck lines
  const mlPicks = picks.filter(p => {
    if (p.pick === 'PASS' || p.type === 'pass') {
      return false;
    }
    if (isPuckLine(p)) {
      console.log(`  [FILTER] ${p.pick} - Puck line removed (NHL is ML only)`);
      reasons.puckLinesRemoved++;
      return false;
    }
    return true;
  });

  if (mlPicks.length === 0) {
    console.log('[NHL Filter] No ML picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  console.log(`[NHL Filter] ${mlPicks.length} ML picks after puck line filter`);

  // STEP 1: Sort by confidence (highest first)
  const sortedByConfidence = [...mlPicks].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NHL Filter] Picks sorted by confidence:');
  sortedByConfidence.forEach((p, i) => {
    const conf = getConfidence(p);
    const type = isUnderdogML(p) ? 'UNDERDOG' : 'FAVORITE';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)} (${type})`);
  });

  // STEP 2: Remove top 2 confidence (overconfidence trap) AND bottom 2 confidence (low conviction)
  const afterConfidenceTrim = [];
  const totalPicks = sortedByConfidence.length;

  for (let i = 0; i < totalPicks; i++) {
    const pick = sortedByConfidence[i];

    // Remove top 2 confidence (overconfidence trap)
    if (i < 2) {
      removed.push({ pick, reason: `Top ${i + 1} confidence (${getConfidence(pick).toFixed(2)}) - overconfidence trap` });
      reasons.removedTopConfidence++;
      console.log(`  [REMOVE] ${pick.pick} - Top ${i + 1} confidence (overconfidence trap)`);
    }
    // Remove bottom 2 confidence (low conviction)
    else if (i >= totalPicks - 2) {
      removed.push({ pick, reason: `Bottom ${totalPicks - i} confidence (${getConfidence(pick).toFixed(2)}) - low conviction` });
      reasons.removedBottomConfidence++;
      console.log(`  [REMOVE] ${pick.pick} - Bottom ${totalPicks - i} confidence (low conviction)`);
    }
    else {
      afterConfidenceTrim.push(pick);
    }
  }

  console.log(`\n[NHL Filter] ${afterConfidenceTrim.length} picks after removing top 2 and bottom 2 confidence`);

  // STEP 2: Separate into underdogs and favorites
  const underdogs = afterConfidenceTrim.filter(p => isUnderdogML(p));
  const favorites = afterConfidenceTrim.filter(p => isFavoriteML(p));

  console.log(`  Underdogs available: ${underdogs.length}`);
  console.log(`  Favorites available: ${favorites.length}`);

  // STEP 3: Take 2 best underdogs (already sorted by confidence)
  for (let i = 0; i < underdogs.length; i++) {
    const pick = underdogs[i];
    if (reasons.keptUnderdogs < 2) {
      kept.push(pick);
      reasons.keptUnderdogs++;
      console.log(`  [KEEP] ${pick.pick} - Underdog #${reasons.keptUnderdogs}`);
    } else {
      removed.push({ pick, reason: 'Excess underdog (already have 2)' });
      reasons.removedExcess++;
    }
  }

  // STEP 4: Take 2 best favorites (already sorted by confidence)
  for (let i = 0; i < favorites.length; i++) {
    const pick = favorites[i];
    if (reasons.keptFavorites < 2) {
      kept.push(pick);
      reasons.keptFavorites++;
      console.log(`  [KEEP] ${pick.pick} - Favorite #${reasons.keptFavorites}`);
    } else {
      removed.push({ pick, reason: 'Excess favorite (already have 2)' });
      reasons.removedExcess++;
    }
  }

  // Summary
  console.log(`\n[NHL Filter] Summary:`);
  console.log(`  KEPT: ${kept.length} picks (target: 4 = 2 underdogs + 2 favorites)`);
  console.log(`    - Underdogs: ${reasons.keptUnderdogs}`);
  console.log(`    - Favorites: ${reasons.keptFavorites}`);
  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.puckLinesRemoved > 0) console.log(`    - Puck lines: ${reasons.puckLinesRemoved}`);
  if (reasons.removedTopConfidence > 0) console.log(`    - Top confidence (overconfidence): ${reasons.removedTopConfidence}`);
  if (reasons.removedBottomConfidence > 0) console.log(`    - Bottom confidence (low conviction): ${reasons.removedBottomConfidence}`);
  if (reasons.removedExcess > 0) console.log(`    - Excess picks: ${reasons.removedExcess}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNHLPicks
};
