/**
 * NBA Pick Filter Service
 *
 * Filters Gary's NBA picks to create a focused 3-pick slate.
 * Applied AFTER Gary makes his picks, before storage.
 *
 * RULES (simple):
 * 1. Top 2 picks by confidence (any type — spread or ML)
 * 2. Top underdog spread by confidence (positive spread, not already kept)
 * TARGET: 3 picks per day
 */

/**
 * Get confidence value from pick (handles different field names)
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Get spread value from pick string
 * Returns the numeric spread (e.g., +10.5 returns 10.5, -7 returns -7)
 */
function getSpreadValue(pick) {
  if (pick.type !== 'spread') return null;
  const match = pick.pick?.match(/([+-]\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Check if pick is an underdog spread (positive spread value)
 */
function isUnderdogSpread(pick) {
  const spread = getSpreadValue(pick);
  return spread !== null && spread > 0;
}

/**
 * Main filter function
 *
 * RULES:
 * 1. KEEP top 2 picks by confidence
 * 2. KEEP top underdog spread by confidence (if not already in top 2)
 * TARGET: 3 picks per day
 *
 * @param {Array} picks - Array of Gary's NBA picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNBAPicks(picks) {
  console.log(`\n[NBA Filter] Analyzing ${picks.length} picks...`);

  if (picks.length === 0) {
    console.log('[NBA Filter] No picks to filter');
    return { kept: [], removed: [], summary: { noPicks: true } };
  }

  // If 3 or fewer picks, keep all — no filtering needed
  if (picks.length <= 3) {
    console.log(`[NBA Filter] Only ${picks.length} picks — keeping ALL`);
    return {
      kept: picks,
      removed: [],
      summary: { keptAll: true, reason: '3 or fewer picks' }
    };
  }

  // Sort by confidence (highest first)
  const sorted = [...picks].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('[NBA Filter] All picks by confidence:');
  sorted.forEach((p, i) => {
    const conf = getConfidence(p);
    const spread = getSpreadValue(p);
    const spreadStr = spread !== null ? ` (${spread > 0 ? '+' : ''}${spread})` : '';
    console.log(`  ${i + 1}. ${p.pick} — conf: ${conf.toFixed(2)} [${p.type}]${spreadStr}`);
  });

  const kept = [];
  const usedPicks = new Set();

  // STEP 1: Top 2 by confidence
  for (let i = 0; i < Math.min(2, sorted.length); i++) {
    kept.push(sorted[i]);
    usedPicks.add(sorted[i]);
    console.log(`[NBA Filter] KEEP #${i + 1} confidence: ${sorted[i].pick} (conf: ${getConfidence(sorted[i]).toFixed(2)})`);
  }

  // STEP 2: Top underdog spread by confidence (not already kept)
  const bestUnderdog = sorted.find(p => isUnderdogSpread(p) && !usedPicks.has(p));
  if (bestUnderdog) {
    kept.push(bestUnderdog);
    usedPicks.add(bestUnderdog);
    const spread = getSpreadValue(bestUnderdog);
    console.log(`[NBA Filter] KEEP underdog spread: ${bestUnderdog.pick} (+${spread}, conf: ${getConfidence(bestUnderdog).toFixed(2)})`);
  } else {
    // Check if one of the top 2 was already an underdog spread
    const topHasUnderdog = kept.some(p => isUnderdogSpread(p));
    if (topHasUnderdog) {
      console.log(`[NBA Filter] Top 2 already includes an underdog spread — no 3rd pick needed`);
    } else {
      console.log(`[NBA Filter] No underdog spreads available for 3rd pick`);
    }
  }

  // Everything else is removed
  const removed = sorted
    .filter(p => !usedPicks.has(p))
    .map(p => ({ pick: p, reason: 'Outside top 2 confidence / not best underdog spread' }));

  console.log(`\n[NBA Filter] FINAL: ${kept.length} kept, ${removed.length} removed`);
  kept.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.pick} (conf: ${getConfidence(p).toFixed(2)})`);
  });

  return {
    kept,
    removed,
    summary: { kept: kept.length, removed: removed.length }
  };
}

/**
 * Clear caches (no-op, kept for API compatibility)
 */
export function clearFilterCache() {}

export default {
  filterNBAPicks,
  clearFilterCache
};
