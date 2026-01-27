/**
 * NHL Pick Filter Service
 *
 * Filters Gary's NHL picks based on confidence trimming.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * NHL IS MONEYLINE ONLY:
 * - Filter out ANY puck line picks (spreads like +1.5, -1.5)
 * - Gary should only pick ML, but this catches any that slip through
 *
 * 40% RULE:
 * - Keep approximately 40% of picks
 * - Minimum 3 picks, Maximum 4 picks
 *
 * CONFIDENCE TRIMMING:
 * - Remove TOP 2 confidence picks (overconfidence trap)
 * - Remove BOTTOM 2 confidence picks (low conviction)
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
 * 1. Filter out ANY puck line picks (NHL is ML only)
 * 2. Apply 40% rule (target 40% of games)
 * 3. Min 3, Max 4 picks
 *
 * @param {Array} picks - Array of Gary's NHL picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNHLPicks(picks) {
  console.log(`\n[NHL Filter] Analyzing ${picks.length} picks...`);

  const MIN_PICKS = 3;
  const MAX_PICKS = 4;

  // STEP 0: Filter out PASS picks and puck lines
  const activePicks = picks.filter(p => {
    if (p.pick === 'PASS' || p.type === 'pass') {
      return false;
    }
    if (isPuckLine(p)) {
      console.log(`  [FILTER] ${p.pick} - Puck line removed (NHL is ML only)`);
      return false;
    }
    return true;
  });

  if (activePicks.length === 0) {
    console.log('[NHL Filter] No active ML picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  // Calculate target based on 40% rule
  const targetCount = Math.max(MIN_PICKS, Math.min(MAX_PICKS, Math.round(activePicks.length * 0.4)));
  console.log(`[NHL Filter] ${activePicks.length} ML picks, targeting ${targetCount} (40% rule, min ${MIN_PICKS}, max ${MAX_PICKS})`);

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
    puckLinesRemoved: picks.length - activePicks.length,
    removedTop: 0,
    removedBottom: 0,
    removedHeavyFavorite: 0,
    removedUnderdogForCap: 0,
    restoredForMinimum: 0
  };

  // STEP 1: Apply confidence trimming if we have enough picks
  const totalPicks = sortedByConfidence.length;
  let trimTop = 0;
  let trimBottom = 0;

  if (totalPicks > targetCount + 2) {
    // Enough picks to trim from both ends
    trimTop = 1;
    trimBottom = 1;
    console.log(`\n[NHL Filter] Trimming 1 from top, 1 from bottom`);
  }

  // Apply trimming
  for (let i = 0; i < sortedByConfidence.length; i++) {
    const pick = sortedByConfidence[i];
    const conf = getConfidence(pick);

    if (i < trimTop) {
      removed.push({ pick, reason: `Top confidence (${conf.toFixed(2)}) - overconfidence trap` });
      reasons.removedTop++;
      console.log(`  [REMOVE] ${pick.pick} - Top confidence (${conf.toFixed(2)})`);
    } else if (i >= totalPicks - trimBottom) {
      removed.push({ pick, reason: `Bottom confidence (${conf.toFixed(2)}) - low conviction` });
      reasons.removedBottom++;
      console.log(`  [REMOVE] ${pick.pick} - Bottom confidence (${conf.toFixed(2)})`);
    } else {
      kept.push(pick);
      console.log(`  [KEEP] ${pick.pick} - conf: ${conf.toFixed(2)}`);
    }
  }

  // STEP 2: If over MAX_PICKS, remove in priority order
  if (kept.length > MAX_PICKS) {
    console.log(`\n[NHL Filter] ${kept.length} picks exceeds max ${MAX_PICKS} - trimming...`);

    // Remove heavy favorites first, then underdogs, then lowest confidence
    while (kept.length > MAX_PICKS) {
      // Find heavy favorite
      const heavyIdx = kept.findIndex(p => isHeavyFavoriteML(p));
      if (heavyIdx > -1) {
        const toRemove = kept.splice(heavyIdx, 1)[0];
        removed.push({ pick: toRemove, reason: `Heavy favorite removed for max ${MAX_PICKS} cap` });
        reasons.removedHeavyFavorite++;
        console.log(`  [REMOVE] ${toRemove.pick} - Heavy favorite`);
        continue;
      }

      // Find underdog
      const underdogIdx = kept.findIndex(p => isUnderdogML(p));
      if (underdogIdx > -1) {
        const toRemove = kept.splice(underdogIdx, 1)[0];
        removed.push({ pick: toRemove, reason: `Underdog removed for max ${MAX_PICKS} cap` });
        reasons.removedUnderdogForCap++;
        console.log(`  [REMOVE] ${toRemove.pick} - Underdog`);
        continue;
      }

      // Remove lowest confidence
      kept.sort((a, b) => getConfidence(a) - getConfidence(b));
      const toRemove = kept.shift();
      removed.push({ pick: toRemove, reason: `Removed for max ${MAX_PICKS} cap (lowest confidence)` });
      console.log(`  [REMOVE] ${toRemove.pick} - Lowest confidence`);
    }
  }

  // STEP 3: If under MIN_PICKS, restore from removed
  if (kept.length < MIN_PICKS && removed.length > 0) {
    console.log(`\n[NHL Filter] Only ${kept.length} picks - need minimum ${MIN_PICKS}...`);

    const removedSorted = [...removed].sort((a, b) => getConfidence(b.pick) - getConfidence(a.pick));

    while (kept.length < MIN_PICKS && removedSorted.length > 0) {
      const restored = removedSorted.shift();
      kept.push(restored.pick);
      reasons.restoredForMinimum++;
      console.log(`  [RESTORE] ${restored.pick.pick}`);

      const idx = removed.findIndex(r => r.pick === restored.pick);
      if (idx > -1) removed.splice(idx, 1);
    }
  }

  // Summary
  console.log(`\n[NHL Filter] Summary:`);
  console.log(`  KEPT: ${kept.length} picks`);
  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.puckLinesRemoved > 0) console.log(`    - Puck lines filtered: ${reasons.puckLinesRemoved}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNHLPicks
};
