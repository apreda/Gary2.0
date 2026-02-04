/**
 * NCAAB Pick Filter Service
 *
 * For NCAAB, we keep ALL picks - no filtering needed.
 * The pre-filter already limits to quality games.
 */

/**
 * Main filter function - keeps ALL picks for NCAAB
 *
 * @param {Array} picks - Array of Gary's NCAAB picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNCAABPicks(picks) {
  console.log(`\n[NCAAB Filter] Analyzing ${picks.length} picks...`);

  // Filter out PASS picks only
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NCAAB Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  // Keep ALL picks - no filtering
  console.log(`[NCAAB Filter] Keeping ALL ${activePicks.length} picks`);

  return {
    kept: activePicks,
    removed: [],
    summary: { keptAll: true, total: activePicks.length }
  };
}

export default {
  filterNCAABPicks
};
