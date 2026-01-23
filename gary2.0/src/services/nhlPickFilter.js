/**
 * NHL Pick Filter Service
 *
 * Filters Gary's NHL picks based on confidence trimming.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * CONFIDENCE TRIMMING:
 * - Remove TOP 2 confidence picks (overconfidence trap)
 * - Remove BOTTOM 2 confidence picks (low conviction)
 *
 * CAPACITY:
 * - Maximum 5 picks per day
 * - If over 5 after trimming, remove underdog MLs first
 * - Minimum 3 picks per day (restore from removed if needed)
 *
 * NOTE: NHL is MONEYLINE ONLY - no puck lines
 */

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
 * Determine if a pick is a heavy favorite ML
 * Heavy favorite = -160 or worse (e.g., -165, -170, -200)
 */
function isHeavyFavoriteML(pick) {
  if (!pick.odds) return false;

  const odds = typeof pick.odds === 'string' ? parseInt(pick.odds) : pick.odds;
  return odds <= -160;
}

/**
 * Get the odds value as a number
 */
function getOddsValue(pick) {
  if (!pick.odds) return 0;
  return typeof pick.odds === 'string' ? parseInt(pick.odds) : pick.odds;
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
 * 1. Remove top 2 confidence picks (overconfidence trap)
 * 2. Remove bottom 2 confidence picks (low conviction)
 * 3. Max 5 picks - if over, remove underdog MLs first
 * 4. Min 3 picks - restore from removed if needed
 *
 * @param {Array} picks - Array of Gary's NHL picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNHLPicks(picks) {
  console.log(`\n[NHL Filter] Analyzing ${picks.length} picks (Confidence Trimming)...`);

  const MIN_PICKS = 3;
  const MAX_PICKS = 5;

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NHL Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  // Sort by confidence (highest first)
  const sortedByConfidence = [...activePicks].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NHL Filter] Picks sorted by confidence:');
  sortedByConfidence.forEach((p, i) => {
    const conf = getConfidence(p);
    const isUnderdog = isUnderdogML(p) ? ' (underdog)' : ' (favorite)';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)}${isUnderdog}`);
  });

  const kept = [];
  const removed = [];
  const reasons = {
    removedTop2: 0,
    removedBottom2: 0,
    removedHeavyFavorite: 0,
    removedUnderdogForCap: 0,
    restoredForMinimum: 0
  };

  // STEP 1: Identify top 2 and bottom 2 by confidence
  const totalPicks = sortedByConfidence.length;

  // We need at least 5 picks to apply the full trimming (remove 4 = top 2 + bottom 2)
  // If fewer picks, adjust the trimming
  let trimTop = 2;
  let trimBottom = 2;

  // Adjust if we don't have enough picks to trim fully
  if (totalPicks <= 4) {
    // Not enough picks to trim - just do min/max enforcement
    trimTop = 0;
    trimBottom = 0;
    console.log(`\n[NHL Filter] Only ${totalPicks} picks - skipping confidence trimming`);
  } else if (totalPicks === 5) {
    // 5 picks: trim 1 from top, 1 from bottom to keep 3
    trimTop = 1;
    trimBottom = 1;
    console.log(`\n[NHL Filter] ${totalPicks} picks - trimming 1 from top, 1 from bottom`);
  } else if (totalPicks === 6) {
    // 6 picks: trim 1 from top, 1 from bottom to keep 4
    trimTop = 1;
    trimBottom = 1;
    console.log(`\n[NHL Filter] ${totalPicks} picks - trimming 1 from top, 1 from bottom`);
  } else {
    console.log(`\n[NHL Filter] ${totalPicks} picks - trimming top 2 and bottom 2`);
  }

  // Apply trimming
  for (let i = 0; i < sortedByConfidence.length; i++) {
    const pick = sortedByConfidence[i];
    const conf = getConfidence(pick);

    // Top N (indices 0 to trimTop-1)
    if (i < trimTop) {
      removed.push({ pick, reason: `Top ${i + 1} confidence (${conf.toFixed(2)}) - overconfidence trap` });
      reasons.removedTop2++;
      console.log(`  [REMOVE] ${pick.pick} - Top ${i + 1} confidence (${conf.toFixed(2)})`);
    }
    // Bottom N (last trimBottom indices)
    else if (i >= totalPicks - trimBottom) {
      const bottomRank = totalPicks - i;
      removed.push({ pick, reason: `Bottom ${bottomRank} confidence (${conf.toFixed(2)}) - low conviction` });
      reasons.removedBottom2++;
      console.log(`  [REMOVE] ${pick.pick} - Bottom ${bottomRank} confidence (${conf.toFixed(2)})`);
    }
    // Middle picks - keep
    else {
      kept.push(pick);
      pick.filterReason = `Middle confidence (${conf.toFixed(2)})`;
      console.log(`  [KEEP] ${pick.pick} - Middle confidence (${conf.toFixed(2)})`);
    }
  }

  // STEP 2: If over MAX_PICKS, remove in priority order:
  // 1. Heavy favorites (-160 or worse) - too much juice
  // 2. Underdog MLs - lower probability
  // 3. Lowest confidence remaining
  if (kept.length > MAX_PICKS) {
    console.log(`\n[NHL Filter] ${kept.length} picks exceeds max ${MAX_PICKS} - trimming...`);

    // Categorize picks
    const heavyFavorites = kept.filter(p => isHeavyFavoriteML(p));
    const underdogs = kept.filter(p => isUnderdogML(p));
    const normalFavorites = kept.filter(p => !isUnderdogML(p) && !isHeavyFavoriteML(p));

    console.log(`  Heavy favorites (-160+): ${heavyFavorites.length}`);
    console.log(`  Underdogs: ${underdogs.length}`);
    console.log(`  Normal favorites: ${normalFavorites.length}`);

    // PRIORITY 1: Remove heavy favorites first (worst odds = -200, -180, etc.)
    // Sort by odds (most negative first, i.e., worst juice)
    heavyFavorites.sort((a, b) => getOddsValue(a) - getOddsValue(b));

    while (kept.length > MAX_PICKS && heavyFavorites.length > 0) {
      const toRemove = heavyFavorites.shift();
      const odds = getOddsValue(toRemove);

      const idx = kept.indexOf(toRemove);
      if (idx > -1) {
        kept.splice(idx, 1);
        removed.push({ pick: toRemove, reason: `Heavy favorite (${odds}) removed for max ${MAX_PICKS} cap` });
        reasons.removedHeavyFavorite++;
        console.log(`  [REMOVE] ${toRemove.pick} - Heavy favorite (${odds}) removed`);
      }
    }

    // PRIORITY 2: Remove underdogs (lowest confidence first)
    underdogs.sort((a, b) => getConfidence(a) - getConfidence(b));

    while (kept.length > MAX_PICKS && underdogs.length > 0) {
      const toRemove = underdogs.shift();

      const idx = kept.indexOf(toRemove);
      if (idx > -1) {
        kept.splice(idx, 1);
        removed.push({ pick: toRemove, reason: `Underdog ML removed for max ${MAX_PICKS} cap` });
        reasons.removedUnderdogForCap++;
        console.log(`  [REMOVE] ${toRemove.pick} - Underdog removed for cap`);
      }
    }

    // PRIORITY 3: Remove lowest confidence remaining
    while (kept.length > MAX_PICKS) {
      kept.sort((a, b) => getConfidence(a) - getConfidence(b));
      const toRemove = kept.shift();
      removed.push({ pick: toRemove, reason: `Removed for max ${MAX_PICKS} cap (lowest remaining confidence)` });
      console.log(`  [REMOVE] ${toRemove.pick} - Removed for max cap (lowest confidence)`);
    }
  }

  // STEP 3: If under MIN_PICKS, restore from removed (lowest confidence first)
  if (kept.length < MIN_PICKS && removed.length > 0) {
    console.log(`\n[NHL Filter] Only ${kept.length} picks - need minimum ${MIN_PICKS}...`);

    // Sort removed by confidence (lowest first - bring those back)
    const removedWithConfidence = removed.map(r => ({
      ...r,
      confidence: getConfidence(r.pick)
    }));
    removedWithConfidence.sort((a, b) => a.confidence - b.confidence);

    while (kept.length < MIN_PICKS && removedWithConfidence.length > 0) {
      const restored = removedWithConfidence.shift();
      kept.push(restored.pick);
      restored.pick.filterReason = `RESTORED (min ${MIN_PICKS} picks) - was: ${restored.reason}`;
      restored.pick.filterTags = [...(restored.pick.filterTags || []), 'RESTORED'];
      reasons.restoredForMinimum++;
      console.log(`  [RESTORE] ${restored.pick.pick} (conf: ${restored.confidence.toFixed(2)}) - minimum picks safety`);

      // Remove from removed array
      const idx = removed.findIndex(r => r.pick === restored.pick);
      if (idx > -1) removed.splice(idx, 1);
    }
  }

  // Summary
  console.log(`\n[NHL Filter] Summary:`);
  console.log(`  KEPT: ${kept.length} picks (min ${MIN_PICKS}, max ${MAX_PICKS})`);
  if (reasons.restoredForMinimum > 0) console.log(`    - Restored (min 3 picks): ${reasons.restoredForMinimum}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedTop2 > 0) console.log(`    - Top confidence (overconfidence): ${reasons.removedTop2}`);
  if (reasons.removedBottom2 > 0) console.log(`    - Bottom confidence (low conviction): ${reasons.removedBottom2}`);
  if (reasons.removedHeavyFavorite > 0) console.log(`    - Heavy favorites (-160+): ${reasons.removedHeavyFavorite}`);
  if (reasons.removedUnderdogForCap > 0) console.log(`    - Underdogs for max cap: ${reasons.removedUnderdogForCap}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNHLPicks
};
