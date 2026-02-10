/**
 * NBA Pick Filter Service
 *
 * Filters Gary's NBA picks to create a focused slate.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES:
 *
 * 1. REMOVE all road favorites (road team with negative spread)
 * 2. KEEP 1 ML pick (highest confidence ML, if any)
 * 3. KEEP any underdog spread +6 or above
 * 4. KEEP next highest confidence pick
 * 5. KEEP lowest confidence pick
 *
 * If a ML pick IS the highest or lowest confidence pick, it counts as both
 * (fewer picks that day is fine)
 *
 * TARGET: 3-5 picks per day
 * If only 3-4 games that day, keep ALL picks (after removing road favorites)
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

  // Match spread like "+10.5 -110" or "-7 -110" or "Team +10.5"
  const spreadMatch = pick.pick?.match(/([+-]?\d+\.?\d*)\s*[+-]?\d*$/);
  if (spreadMatch) {
    return parseFloat(spreadMatch[1]);
  }

  // Try to find spread in the pick string
  const altMatch = pick.pick?.match(/([+-]\d+\.?\d*)/);
  if (altMatch) {
    return parseFloat(altMatch[1]);
  }

  return null;
}

/**
 * Check if pick is a road favorite (road team with negative spread)
 */
function isRoadFavorite(pick) {
  if (pick.type !== 'spread') return false;

  const spread = getSpreadValue(pick);
  if (spread === null || spread >= 0) return false; // Not a favorite

  // Check if the picked team is the AWAY team
  const pickLower = (pick.pick || '').toLowerCase();
  const matchup = pick.matchup || pick.game || '';
  const matchupLower = matchup.toLowerCase();

  // Matchup format: "Away @ Home" or "Away vs Home"
  const atMatch = matchupLower.match(/(.+?)\s*[@vs]+\s*(.+)/i);
  if (atMatch) {
    const awayTeam = atMatch[1].trim();
    // If the pick contains the away team name and spread is negative = road favorite
    if (pickLower.includes(awayTeam.split(' ').pop())) {
      return true;
    }
  }

  // Also check via away_team field if available
  const awayTeamField = (pick.away_team || pick.awayTeam || '').toLowerCase();
  if (awayTeamField && pickLower.includes(awayTeamField.split(' ').pop())) {
    return true;
  }

  return false;
}

/**
 * Check if pick is an underdog spread +6 or above
 */
function isUnderdogSpread6Plus(pick) {
  const spread = getSpreadValue(pick);
  return spread !== null && spread >= 6;
}

/**
 * Main filter function - applies NBA filtering rules
 *
 * RULES:
 * 1. REMOVE all road favorites
 * 2. KEEP 1 ML pick (highest confidence ML, if any)
 * 3. KEEP any underdog spread +6 or above
 * 4. KEEP next highest confidence pick
 * 5. KEEP lowest confidence pick
 *
 * TARGET: 3-5 picks per day
 * If only 3-4 games after removing road favorites, keep ALL remaining
 *
 * @param {Array} picks - Array of Gary's NBA picks
 * @param {number} totalGamesAnalyzed - Total games Gary analyzed
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

  // STEP 0: Remove all road favorites
  const roadFavs = activePicks.filter(p => isRoadFavorite(p));
  const afterRoadFavFilter = activePicks.filter(p => !isRoadFavorite(p));

  if (roadFavs.length > 0) {
    console.log(`[NBA Filter] Removing ${roadFavs.length} road favorite(s):`);
    roadFavs.forEach(p => console.log(`  - ${p.pick} (road favorite)`));
  }

  // If only 3-4 picks remain after removing road favorites, keep ALL
  if (afterRoadFavFilter.length <= 4) {
    console.log(`[NBA Filter] Only ${afterRoadFavFilter.length} picks remain after road fav filter - keeping ALL`);
    return {
      kept: afterRoadFavFilter,
      removed: roadFavs.map(p => ({ pick: p, reason: 'Road favorite' })),
      summary: { keptAll: true, reason: 'Few picks after road fav filter', roadFavsRemoved: roadFavs.length }
    };
  }

  const kept = [];
  const removed = [...roadFavs.map(p => ({ pick: p, reason: 'Road favorite' }))];
  const usedPicks = new Set();
  const reasons = {
    keptML: 0,
    keptUnderdog6Plus: 0,
    keptHighestConf: 0,
    keptLowestConf: 0,
    removedRoadFav: roadFavs.length,
    removedNotNeeded: 0
  };

  // Sort remaining by confidence (highest first)
  const sortedByConf = [...afterRoadFavFilter].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NBA Filter] Remaining picks sorted by confidence:');
  sortedByConf.forEach((p, i) => {
    const conf = getConfidence(p);
    const spread = getSpreadValue(p);
    const spreadStr = spread !== null ? ` (spread: ${spread > 0 ? '+' : ''}${spread})` : '';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)} [${p.type}]${spreadStr}`);
  });

  // STEP 1: Keep 1 ML pick (highest confidence ML, if any)
  const mlPicks = sortedByConf.filter(p => p.type === 'moneyline' || p.type === 'ml');
  if (mlPicks.length > 0) {
    const bestML = mlPicks[0]; // Already sorted by confidence, so first = highest
    kept.push(bestML);
    usedPicks.add(bestML);
    reasons.keptML++;
    console.log(`[NBA Filter] KEEP ML (highest conf): ${bestML.pick} (conf: ${getConfidence(bestML).toFixed(2)})`);
  }

  // STEP 2: Keep any underdog spread +6 or above
  const underdogs = sortedByConf.filter(p => isUnderdogSpread6Plus(p) && !usedPicks.has(p));
  for (const pick of underdogs) {
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptUnderdog6Plus++;
    const spread = getSpreadValue(pick);
    console.log(`[NBA Filter] KEEP underdog +6+: ${pick.pick} (spread: +${spread})`);
  }

  // STEP 3: Keep next highest confidence pick (if not already kept)
  if (kept.length < 5) {
    const remaining = sortedByConf.filter(p => !usedPicks.has(p));
    if (remaining.length > 0) {
      const pick = remaining[0]; // Highest confidence remaining
      kept.push(pick);
      usedPicks.add(pick);
      reasons.keptHighestConf++;
      console.log(`[NBA Filter] KEEP highest conf: ${pick.pick} (conf: ${getConfidence(pick).toFixed(2)})`);
    }
  }

  // STEP 4: Keep lowest confidence pick (if not already kept)
  if (kept.length < 5) {
    const remaining = sortedByConf.filter(p => !usedPicks.has(p));
    if (remaining.length > 0) {
      const pick = remaining[remaining.length - 1]; // Lowest confidence remaining
      kept.push(pick);
      usedPicks.add(pick);
      reasons.keptLowestConf++;
      console.log(`[NBA Filter] KEEP lowest conf: ${pick.pick} (conf: ${getConfidence(pick).toFixed(2)})`);
    }
  }

  // Mark remaining picks as removed
  for (const pick of afterRoadFavFilter) {
    if (!usedPicks.has(pick)) {
      removed.push({ pick, reason: 'Not needed for focused slate' });
      reasons.removedNotNeeded++;
    }
  }

  // Summary
  console.log(`\n[NBA Filter] Final Summary:`);
  console.log(`  TARGET: 3-5 picks`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.keptML > 0) console.log(`    - ML pick: ${reasons.keptML}`);
  if (reasons.keptUnderdog6Plus > 0) console.log(`    - Underdog +6+: ${reasons.keptUnderdog6Plus}`);
  if (reasons.keptHighestConf > 0) console.log(`    - Highest confidence: ${reasons.keptHighestConf}`);
  if (reasons.keptLowestConf > 0) console.log(`    - Lowest confidence: ${reasons.keptLowestConf}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedRoadFav > 0) console.log(`    - Road favorites: ${reasons.removedRoadFav}`);
  if (reasons.removedNotNeeded > 0) console.log(`    - Not needed: ${reasons.removedNotNeeded}`);

  // List kept picks
  console.log('\n[NBA Filter] FINAL PICKS:');
  kept.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.pick} (conf: ${getConfidence(p).toFixed(2)})`);
  });

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
