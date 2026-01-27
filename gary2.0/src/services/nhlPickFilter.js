/**
 * NHL Pick Filter Service
 *
 * Filters Gary's NHL picks based on confidence trimming.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * BET TYPE RULES:
 * - MONEYLINE ONLY - Puck lines are NOT allowed (filtered out entirely)
 *
 * CAPACITY (40% rule):
 * - Take 40% of total picks
 * - Minimum 3 picks per day
 * - Maximum 4 picks per day
 *
 * CONFIDENCE TRIMMING:
 * - Sort by confidence, take top 40%
 */

/**
 * Determine if a pick is a puck line (spread bet)
 */
function isPuckLine(pick) {
  // Puck lines have spreads like +1.5, -1.5
  if (pick.type === 'spread' || pick.type === 'puckline' || pick.type === 'puck_line') {
    return true;
  }
  // Also check the pick string for spread indicators
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
 * Get confidence value from pick (handles different field names)
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Main filter function - applies NHL filtering rules
 *
 * RULES:
 * 1. REMOVE ALL PUCK LINES (NHL is ML only)
 * 2. Take 40% of picks by confidence
 * 3. Min 3, Max 4 picks
 *
 * @param {Array} picks - Array of Gary's NHL picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNHLPicks(picks) {
  console.log(`\n[NHL Filter] Analyzing ${picks.length} picks...`);

  const MIN_PICKS = 3;
  const MAX_PICKS = 4;

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NHL Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  const kept = [];
  const removed = [];
  const reasons = {
    removedPuckLine: 0,
    removedLowConfidence: 0,
    keptML: 0
  };

  // STEP 1: Remove ALL puck lines (NHL is ML only)
  console.log('\n[NHL Filter] Step 1: Removing puck lines (ML only)...');
  const mlOnlyPicks = [];

  for (const pick of activePicks) {
    if (isPuckLine(pick)) {
      removed.push({ pick, reason: 'Puck line - NHL is MONEYLINE ONLY' });
      reasons.removedPuckLine++;
      console.log(`  [REMOVED] ${pick.pick} - Puck line not allowed`);
    } else {
      mlOnlyPicks.push(pick);
      console.log(`  [OK] ML: ${pick.pick}`);
    }
  }

  console.log(`\n[NHL Filter] ${mlOnlyPicks.length} ML picks remain after puck line filter`);

  if (mlOnlyPicks.length === 0) {
    console.log('[NHL Filter] No ML picks remaining');
    return { kept: [], removed, summary: reasons };
  }

  // STEP 2: Sort by confidence and take 40%
  mlOnlyPicks.sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NHL Filter] Step 2: Picks sorted by confidence:');
  mlOnlyPicks.forEach((p, i) => {
    const conf = getConfidence(p);
    const isUnderdog = isUnderdogML(p) ? ' (underdog)' : ' (favorite)';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)}${isUnderdog}`);
  });

  // Calculate target: 40% of original active picks (before puck line filter)
  // This ensures we're taking 40% of what Gary gave us, not 40% of what's left after filtering
  const targetCount = Math.round(activePicks.length * 0.4);
  const adjustedTarget = Math.min(MAX_PICKS, Math.max(MIN_PICKS, targetCount));

  console.log(`\n[NHL Filter] Target: 40% of ${activePicks.length} = ${targetCount}, adjusted to min ${MIN_PICKS}/max ${MAX_PICKS} = ${adjustedTarget}`);

  // Take top picks by confidence up to adjusted target
  const finalCount = Math.min(adjustedTarget, mlOnlyPicks.length);

  for (let i = 0; i < mlOnlyPicks.length; i++) {
    const pick = mlOnlyPicks[i];
    const conf = getConfidence(pick);

    if (i < finalCount) {
      kept.push(pick);
      reasons.keptML++;
      console.log(`  [KEEP] ${pick.pick} - Top ${i + 1} of ${finalCount}`);
    } else {
      removed.push({ pick, reason: `Below 40% cutoff (rank ${i + 1}, conf: ${conf.toFixed(2)})` });
      reasons.removedLowConfidence++;
      console.log(`  [REMOVE] ${pick.pick} - Below cutoff`);
    }
  }

  // Summary
  console.log(`\n[NHL Filter] Final Summary:`);
  console.log(`  KEPT: ${kept.length} picks (min ${MIN_PICKS}, max ${MAX_PICKS})`);
  console.log(`    - ML picks: ${reasons.keptML}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedPuckLine > 0) console.log(`    - Puck lines (not allowed): ${reasons.removedPuckLine}`);
  if (reasons.removedLowConfidence > 0) console.log(`    - Below 40% cutoff: ${reasons.removedLowConfidence}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNHLPicks
};
