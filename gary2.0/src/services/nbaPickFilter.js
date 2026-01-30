/**
 * NBA Pick Filter Service
 *
 * Filters Gary's NBA picks to create a balanced slate.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 30, 2026):
 *
 * 1. Keep 1 ML pick (highest confidence)
 * 2. Keep any +spread that is +10 or above (big underdog)
 * 3. Keep any HOME favorite -7 or more
 * 4. Keep next highest confidence pick
 * 5. Keep lowest confidence pick
 *
 * TARGET: 5 picks per day
 * If only 3-4 games that day, keep ALL picks
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
 * Check if pick is a big underdog spread (+10 or more)
 */
function isBigUnderdogSpread(pick) {
  const spread = getSpreadValue(pick);
  return spread !== null && spread >= 10;
}

/**
 * Check if pick is a home favorite with spread -7 or more
 */
function isHomeFavoriteSpread(pick) {
  if (pick.type !== 'spread') return false;

  const spread = getSpreadValue(pick);
  if (spread === null || spread > -7) return false; // Must be -7 or more negative

  // Check if the picked team is the home team
  // The pick string usually contains the team name
  const pickLower = (pick.pick || '').toLowerCase();
  const homeTeamLower = (pick.home_team || pick.homeTeam || '').toLowerCase();

  // If we have home team info, check if the pick is for the home team
  if (homeTeamLower && pickLower.includes(homeTeamLower.split(' ').pop())) {
    return true;
  }

  // Alternative: check if pick contains "home" indicator or the spread is negative (favorite)
  // If spread is negative, the picked team is the favorite
  // We need to verify it's the HOME favorite

  // Check via the matchup - if available
  const matchup = pick.matchup || pick.game || '';
  const matchupLower = matchup.toLowerCase();

  // Matchup format is usually "Away @ Home" or "Away vs Home"
  const atMatch = matchupLower.match(/(.+?)\s*[@vs]+\s*(.+)/i);
  if (atMatch) {
    const homeTeam = atMatch[2].trim();
    // Check if the pick is for the home team (favorite with negative spread)
    if (pickLower.includes(homeTeam.split(' ').pop())) {
      return true;
    }
  }

  return false;
}

/**
 * Main filter function - applies NBA filtering rules
 *
 * RULES:
 * 1. Keep 1 ML pick (highest confidence)
 * 2. Keep any +spread that is +10 or above
 * 3. Keep any HOME favorite -7 or more
 * 4. Keep next highest confidence pick
 * 5. Keep lowest confidence pick
 *
 * TARGET: 5 picks per day
 * If only 3-4 games, keep ALL picks
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

  // If only 3-4 games, keep ALL picks
  const gamesCount = totalGamesAnalyzed || activePicks.length;
  if (gamesCount <= 4) {
    console.log(`[NBA Filter] Only ${gamesCount} games - keeping ALL ${activePicks.length} picks`);
    return {
      kept: activePicks,
      removed: [],
      summary: { keptAll: true, reason: 'Few games day' }
    };
  }

  const kept = [];
  const removed = [];
  const usedPicks = new Set();
  const reasons = {
    keptML: 0,
    keptBigUnderdog: 0,
    keptHomeFavorite: 0,
    keptNextHighestConf: 0,
    keptLowestConf: 0,
    removedNotNeeded: 0
  };

  // Sort by confidence (highest first)
  const sortedByConf = [...activePicks].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NBA Filter] All picks sorted by confidence:');
  sortedByConf.forEach((p, i) => {
    const conf = getConfidence(p);
    const spread = getSpreadValue(p);
    const spreadStr = spread !== null ? ` (spread: ${spread > 0 ? '+' : ''}${spread})` : '';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${conf.toFixed(2)} [${p.type}]${spreadStr}`);
  });

  // STEP 1: Keep 1 ML pick (highest confidence)
  const mlPicks = sortedByConf.filter(p => p.type === 'moneyline');
  if (mlPicks.length > 0) {
    const pick = mlPicks[0]; // Highest confidence ML
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptML++;
    console.log(`\n[NBA Filter] KEEP ML (highest conf): ${pick.pick}`);
  }

  // STEP 2: Keep any +spread that is +10 or above
  const bigUnderdogs = sortedByConf.filter(p => !usedPicks.has(p) && isBigUnderdogSpread(p));
  for (const pick of bigUnderdogs) {
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptBigUnderdog++;
    const spread = getSpreadValue(pick);
    console.log(`[NBA Filter] KEEP big underdog (+10+): ${pick.pick} (spread: +${spread})`);
  }

  // STEP 3: Keep any HOME favorite -7 or more
  const homeFavorites = sortedByConf.filter(p => !usedPicks.has(p) && isHomeFavoriteSpread(p));
  for (const pick of homeFavorites) {
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptHomeFavorite++;
    const spread = getSpreadValue(pick);
    console.log(`[NBA Filter] KEEP home favorite (-7+): ${pick.pick} (spread: ${spread})`);
  }

  // STEP 4: Keep next highest confidence pick (if not at 5 yet)
  if (kept.length < 5) {
    const remaining = sortedByConf.filter(p => !usedPicks.has(p));
    if (remaining.length > 0) {
      const pick = remaining[0]; // Highest confidence remaining
      kept.push(pick);
      usedPicks.add(pick);
      reasons.keptNextHighestConf++;
      console.log(`[NBA Filter] KEEP next highest conf: ${pick.pick}`);
    }
  }

  // STEP 5: Keep lowest confidence pick (if not at 5 yet)
  if (kept.length < 5) {
    const remaining = sortedByConf.filter(p => !usedPicks.has(p));
    if (remaining.length > 0) {
      const pick = remaining[remaining.length - 1]; // Lowest confidence remaining
      kept.push(pick);
      usedPicks.add(pick);
      reasons.keptLowestConf++;
      console.log(`[NBA Filter] KEEP lowest conf: ${pick.pick}`);
    }
  }

  // If still under 5 picks, fill with next highest confidence
  while (kept.length < 5) {
    const remaining = sortedByConf.filter(p => !usedPicks.has(p));
    if (remaining.length === 0) break;

    const pick = remaining[0]; // Next highest confidence
    kept.push(pick);
    usedPicks.add(pick);
    reasons.keptNextHighestConf++;
    console.log(`[NBA Filter] KEEP (fill to 5): ${pick.pick}`);
  }

  // Mark remaining picks as removed
  for (const pick of activePicks) {
    if (!usedPicks.has(pick)) {
      removed.push({ pick, reason: 'Not needed for balanced slate' });
      reasons.removedNotNeeded++;
    }
  }

  // Summary
  console.log(`\n[NBA Filter] Final Summary:`);
  console.log(`  TARGET: 5 picks`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.keptML > 0) console.log(`    - ML (highest conf): ${reasons.keptML}`);
  if (reasons.keptBigUnderdog > 0) console.log(`    - Big underdog (+10+): ${reasons.keptBigUnderdog}`);
  if (reasons.keptHomeFavorite > 0) console.log(`    - Home favorite (-7+): ${reasons.keptHomeFavorite}`);
  if (reasons.keptNextHighestConf > 0) console.log(`    - Next highest conf: ${reasons.keptNextHighestConf}`);
  if (reasons.keptLowestConf > 0) console.log(`    - Lowest conf: ${reasons.keptLowestConf}`);

  console.log(`  REMOVED: ${removed.length} picks`);
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
