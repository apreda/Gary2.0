/**
 * NCAAB Pick Filter Service
 *
 * Filters Gary's NCAAB picks for conference diversity and bet type balance.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * FILTERING RULES (Jan 2026):
 *
 * CONFIDENCE TRIMMING:
 * - Remove TOP confidence pick (overconfidence trap)
 * - Remove BOTTOM confidence pick (low conviction)
 *
 * PER-CONFERENCE SELECTION (3 picks max per conference):
 * - 1 ML pick (highest confidence ML)
 * - 1 Underdog spread (highest confidence + spread)
 * - 1 Favorite spread (highest confidence - spread)
 *
 * This ensures diversity across conferences and bet types.
 */

/**
 * Get confidence value from pick
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Determine pick type details
 */
function getPickType(pick) {
  const result = {
    isML: false,
    isSpread: false,
    isFavorite: false,
    isUnderdog: false,
    spreadValue: 0
  };

  if (pick.type === 'moneyline') {
    result.isML = true;
  } else if (pick.type === 'spread') {
    result.isSpread = true;
    // Extract spread from pick string (e.g., "Duke -7.5 -110")
    const spreadMatch = pick.pick?.match(/([+-]?\d+\.?\d*)\s*[+-]\d+$/);
    if (spreadMatch) {
      result.spreadValue = parseFloat(spreadMatch[1]);
      result.isFavorite = result.spreadValue < 0;
      result.isUnderdog = result.spreadValue > 0;
    }
  }

  return result;
}

/**
 * Get conference from pick (attached during game processing)
 */
function getConference(pick) {
  // Conference is attached to pick during game processing
  // Check multiple possible field names
  return pick.conference || pick.homeConference || pick.awayConference || 'Unknown';
}

/**
 * Main filter function - applies NCAAB filtering rules
 *
 * RULES:
 * 1. Remove top 1 and bottom 1 confidence picks
 * 2. Group by conference
 * 3. Per conference: keep 1 ML, 1 underdog spread, 1 favorite spread (by confidence)
 *
 * @param {Array} picks - Array of Gary's NCAAB picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNCAABPicks(picks) {
  console.log(`\n[NCAAB Filter] Analyzing ${picks.length} picks (Conference Diversity)...`);

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NCAAB Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  const kept = [];
  const removed = [];
  const reasons = {
    removedTopConfidence: 0,
    removedBottomConfidence: 0,
    keptML: 0,
    keptUnderdogSpread: 0,
    keptFavoriteSpread: 0,
    removedExcessInConference: 0
  };

  // STEP 1: Sort by confidence and remove top 1 + bottom 1
  const sortedByConfidence = [...activePicks].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('\n[NCAAB Filter] Picks sorted by confidence:');
  sortedByConfidence.forEach((p, i) => {
    const conf = getConfidence(p);
    const type = getPickType(p);
    const typeStr = type.isML ? 'ML' : (type.isUnderdog ? `+${Math.abs(type.spreadValue)}` : `${type.spreadValue}`);
    console.log(`  ${i + 1}. ${p.pick} [${typeStr}] - conf: ${conf.toFixed(2)} - ${getConference(p)}`);
  });

  // Only trim if we have enough picks
  let trimmedPicks = [...sortedByConfidence];

  if (sortedByConfidence.length >= 4) {
    // Remove top 1 (overconfidence)
    const topPick = trimmedPicks.shift();
    removed.push({ pick: topPick, reason: `Top confidence (${getConfidence(topPick).toFixed(2)}) - overconfidence trap` });
    reasons.removedTopConfidence++;
    console.log(`\n[NCAAB Filter] Removed top confidence: ${topPick.pick}`);

    // Remove bottom 1 (low conviction)
    const bottomPick = trimmedPicks.pop();
    removed.push({ pick: bottomPick, reason: `Bottom confidence (${getConfidence(bottomPick).toFixed(2)}) - low conviction` });
    reasons.removedBottomConfidence++;
    console.log(`[NCAAB Filter] Removed bottom confidence: ${bottomPick.pick}`);
  } else {
    console.log(`\n[NCAAB Filter] Only ${sortedByConfidence.length} picks - skipping confidence trim`);
  }

  // STEP 2: Group remaining picks by conference
  const byConference = new Map();

  for (const pick of trimmedPicks) {
    const conf = getConference(pick);
    if (!byConference.has(conf)) {
      byConference.set(conf, []);
    }
    byConference.get(conf).push(pick);
  }

  console.log(`\n[NCAAB Filter] Picks by conference:`);
  for (const [conf, confPicks] of byConference) {
    console.log(`  ${conf}: ${confPicks.length} picks`);
  }

  // STEP 3: For each conference, select up to 3 picks (1 ML, 1 underdog spread, 1 favorite spread)
  console.log(`\n[NCAAB Filter] Selecting best picks per conference (1 ML, 1 dog spread, 1 fav spread):`);

  for (const [conf, confPicks] of byConference) {
    // Sort conference picks by confidence (highest first)
    confPicks.sort((a, b) => getConfidence(b) - getConfidence(a));

    // Categorize picks
    const mlPicks = confPicks.filter(p => getPickType(p).isML);
    const underdogSpreads = confPicks.filter(p => getPickType(p).isUnderdog);
    const favoriteSpreads = confPicks.filter(p => getPickType(p).isFavorite);

    const selectedForConf = [];
    const usedPicks = new Set();

    // Select best ML (if available)
    if (mlPicks.length > 0) {
      const bestML = mlPicks[0];
      selectedForConf.push(bestML);
      usedPicks.add(bestML);
      bestML.filterReason = `Best ML in ${conf}`;
      reasons.keptML++;
      console.log(`  [${conf}] ML: ${bestML.pick} (${getConfidence(bestML).toFixed(2)})`);
    }

    // Select best underdog spread (if available)
    if (underdogSpreads.length > 0) {
      const bestDog = underdogSpreads[0];
      if (!usedPicks.has(bestDog)) {
        selectedForConf.push(bestDog);
        usedPicks.add(bestDog);
        bestDog.filterReason = `Best underdog spread in ${conf}`;
        reasons.keptUnderdogSpread++;
        const type = getPickType(bestDog);
        console.log(`  [${conf}] Dog +${Math.abs(type.spreadValue)}: ${bestDog.pick} (${getConfidence(bestDog).toFixed(2)})`);
      }
    }

    // Select best favorite spread (if available)
    if (favoriteSpreads.length > 0) {
      const bestFav = favoriteSpreads[0];
      if (!usedPicks.has(bestFav)) {
        selectedForConf.push(bestFav);
        usedPicks.add(bestFav);
        bestFav.filterReason = `Best favorite spread in ${conf}`;
        reasons.keptFavoriteSpread++;
        const type = getPickType(bestFav);
        console.log(`  [${conf}] Fav ${type.spreadValue}: ${bestFav.pick} (${getConfidence(bestFav).toFixed(2)})`);
      }
    }

    // Add selected picks to kept
    kept.push(...selectedForConf);

    // Mark remaining picks in this conference as removed
    for (const pick of confPicks) {
      if (!usedPicks.has(pick)) {
        removed.push({ pick, reason: `Excess pick in ${conf} (already have 3 types)` });
        reasons.removedExcessInConference++;
      }
    }
  }

  // Summary
  console.log(`\n[NCAAB Filter] Summary:`);
  console.log(`  KEPT: ${kept.length} picks`);
  if (reasons.keptML > 0) console.log(`    - ML picks: ${reasons.keptML}`);
  if (reasons.keptUnderdogSpread > 0) console.log(`    - Underdog spreads: ${reasons.keptUnderdogSpread}`);
  if (reasons.keptFavoriteSpread > 0) console.log(`    - Favorite spreads: ${reasons.keptFavoriteSpread}`);

  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedTopConfidence > 0) console.log(`    - Top confidence (overconfidence): ${reasons.removedTopConfidence}`);
  if (reasons.removedBottomConfidence > 0) console.log(`    - Bottom confidence (low conviction): ${reasons.removedBottomConfidence}`);
  if (reasons.removedExcessInConference > 0) console.log(`    - Excess in conference: ${reasons.removedExcessInConference}`);

  return {
    kept,
    removed,
    summary: reasons
  };
}

export default {
  filterNCAABPicks
};
