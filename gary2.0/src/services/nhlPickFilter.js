/**
 * NHL Pick Filter Service
 *
 * Filters Gary's NHL picks based on specific selection rules.
 * This is a POST-FILTER applied AFTER Gary makes his picks, before storage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FILTERING RULES (Feb 2026):
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * BET TYPE RULES:
 * - MONEYLINE ONLY - Puck lines are NOT allowed (filtered out entirely)
 *
 * DAILY PICK COUNT (based on number of games):
 * - 3 games → 3 picks (exception: can take all)
 * - 4-5 games → 3 picks
 * - 6 games → 2 picks
 * - 7 games → 3 picks
 * - 8-10 games → 4 picks
 * - 11+ games → 5 picks
 * - NEVER more than 40% of games (except 3-game days)
 * - Range: 2-5 picks daily
 *
 * SELECTION PRIORITY (which picks to keep):
 * 1. #2 Confidence pick (second highest confidence, not #1)
 * 2. Top Underdog (highest +ML odds pick)
 * 3. Second-to-last Confidence pick
 * 4. Random (if taking 4+ picks)
 * 5. Random (if taking 5 picks)
 *
 * If taking only 3 picks, just use rules 1-3.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Determine if a pick is a puck line (spread bet)
 */
function isPuckLine(pick) {
  if (pick.type === 'spread' || pick.type === 'puckline' || pick.type === 'puck_line') {
    return true;
  }
  const pickStr = pick.pick?.toLowerCase() || '';
  if (pickStr.includes('+1.5') || pickStr.includes('-1.5') ||
      pickStr.includes('+2.5') || pickStr.includes('-2.5') ||
      pickStr.includes('puck line') || pickStr.includes('puckline')) {
    return true;
  }
  return false;
}

/**
 * Get numeric odds from pick (handles string like "+150" or "-120")
 */
function getOdds(pick) {
  if (!pick.odds) return 0;
  const odds = typeof pick.odds === 'string' ? parseInt(pick.odds.replace('+', '')) : pick.odds;
  return isNaN(odds) ? 0 : odds;
}

/**
 * Check if pick is an underdog (positive odds)
 */
function isUnderdogML(pick) {
  return getOdds(pick) > 0;
}

/**
 * Get confidence value from pick
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Calculate how many picks to take based on number of games
 *
 * User rules:
 * - 3 games → 3 (take all)
 * - 5 games → 3
 * - 6 games → 2
 * - 7 games → 3
 * - 8 games → 4
 * - 12 games → 5
 * - Never more than 40% except 3-game days
 */
function calculatePickCount(numGames) {
  // Special case: 3 games = take all 3
  if (numGames === 3) return 3;

  // 6 games is explicitly 2
  if (numGames === 6) return 2;

  // 4-5 games → 3, 7 games → 3
  if (numGames >= 4 && numGames <= 7) return 3;

  // 8-10 games → 4
  if (numGames >= 8 && numGames <= 10) return 4;

  // 11+ games → 5
  if (numGames >= 11) return 5;

  // Fallback: 40% with 2-5 range
  return Math.max(2, Math.min(5, Math.round(numGames * 0.4)));
}

/**
 * Get a random element from array, excluding already selected picks
 */
function getRandomPick(picks, excludeNames) {
  const available = picks.filter(p => !excludeNames.has(p.pick));
  if (available.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * available.length);
  return available[randomIndex];
}

/**
 * Main filter function - applies NHL filtering rules
 *
 * @param {Array} picks - Array of Gary's NHL picks
 * @param {number} numGames - Number of NHL games that day (optional, will count unique games)
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNHLPicks(picks, numGames = null) {
  console.log(`\n[NHL Filter] ═══════════════════════════════════════════════════════`);
  console.log(`[NHL Filter] Analyzing ${picks.length} picks...`);

  // Filter out PASS picks first
  const activePicks = picks.filter(p => p.pick !== 'PASS' && p.type !== 'pass');

  if (activePicks.length === 0) {
    console.log('[NHL Filter] No active picks to filter');
    return { kept: [], removed: [], summary: { noActivePicks: true } };
  }

  const removed = [];
  const reasons = {
    removedPuckLine: 0,
    removedBySelectionRules: 0,
    keptByRule: {}
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Remove ALL puck lines (NHL is ML only)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[NHL Filter] Step 1: Removing puck lines (ML only)...');
  const mlOnlyPicks = [];

  for (const pick of activePicks) {
    if (isPuckLine(pick)) {
      removed.push({ pick, reason: 'Puck line - NHL is MONEYLINE ONLY' });
      reasons.removedPuckLine++;
      console.log(`  [REMOVED] ${pick.pick} - Puck line not allowed`);
    } else {
      mlOnlyPicks.push(pick);
    }
  }

  console.log(`[NHL Filter] ${mlOnlyPicks.length} ML picks remain after puck line filter`);

  if (mlOnlyPicks.length === 0) {
    console.log('[NHL Filter] No ML picks remaining');
    return { kept: [], removed, summary: reasons };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Determine number of games and target pick count
  // ═══════════════════════════════════════════════════════════════════════════
  // Count unique games from picks (home vs away matchups)
  if (!numGames) {
    const uniqueGames = new Set();
    for (const p of mlOnlyPicks) {
      const gameKey = p.game || `${p.homeTeam}_${p.awayTeam}` || p.pick;
      uniqueGames.add(gameKey);
    }
    numGames = uniqueGames.size || mlOnlyPicks.length;
  }

  const targetPickCount = calculatePickCount(numGames);
  const actualPickCount = Math.min(targetPickCount, mlOnlyPicks.length);

  console.log(`\n[NHL Filter] Step 2: Calculate pick count`);
  console.log(`  Games today: ${numGames}`);
  console.log(`  Target picks: ${targetPickCount}`);
  console.log(`  Available ML picks: ${mlOnlyPicks.length}`);
  console.log(`  Will select: ${actualPickCount} picks`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Sort picks for selection
  // ═══════════════════════════════════════════════════════════════════════════
  // Sort by confidence (highest first)
  const byConfidence = [...mlOnlyPicks].sort((a, b) => getConfidence(b) - getConfidence(a));

  // Sort underdogs by odds (highest + odds first)
  const underdogs = mlOnlyPicks.filter(p => isUnderdogML(p))
    .sort((a, b) => getOdds(b) - getOdds(a));

  console.log(`\n[NHL Filter] Step 3: Ranked by confidence:`);
  byConfidence.forEach((p, i) => {
    const conf = getConfidence(p);
    const odds = getOdds(p);
    const dogTag = odds > 0 ? ` [+${odds} DOG]` : '';
    console.log(`  ${i + 1}. ${p.pick} - conf: ${(conf * 100).toFixed(0)}%${dogTag}`);
  });

  if (underdogs.length > 0) {
    console.log(`\n[NHL Filter] Underdogs (by highest odds):`);
    underdogs.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.pick} - +${getOdds(p)}`);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Apply Selection Rules
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. #2 Confidence pick (second highest)
  // 2. Top Underdog (highest +ML odds)
  // 3. Second-to-last Confidence pick
  // 4. Random (if 4+ picks)
  // 5. Random (if 5 picks)

  console.log(`\n[NHL Filter] Step 4: Applying selection rules...`);

  const kept = [];
  const selectedNames = new Set();

  // Rule 1: #2 Confidence pick (second highest, index 1)
  if (byConfidence.length >= 2) {
    const pick = byConfidence[1];
    kept.push(pick);
    selectedNames.add(pick.pick);
    reasons.keptByRule['Rule 1 (#2 Confidence)'] = pick.pick;
    console.log(`  [Rule 1] #2 Confidence: ${pick.pick} (${(getConfidence(pick) * 100).toFixed(0)}%)`);
  } else if (byConfidence.length === 1) {
    // Only 1 pick available, take it
    const pick = byConfidence[0];
    kept.push(pick);
    selectedNames.add(pick.pick);
    reasons.keptByRule['Rule 1 (only pick)'] = pick.pick;
    console.log(`  [Rule 1] Only pick available: ${pick.pick}`);
  }

  // Rule 2: Top Underdog (highest +ML odds)
  if (actualPickCount >= 2) {
    const topDog = underdogs.find(p => !selectedNames.has(p.pick));
    if (topDog) {
      kept.push(topDog);
      selectedNames.add(topDog.pick);
      reasons.keptByRule['Rule 2 (Top Underdog)'] = topDog.pick;
      console.log(`  [Rule 2] Top Underdog: ${topDog.pick} (+${getOdds(topDog)})`);
    } else {
      // No underdogs available, take next best by confidence
      const nextBest = byConfidence.find(p => !selectedNames.has(p.pick));
      if (nextBest) {
        kept.push(nextBest);
        selectedNames.add(nextBest.pick);
        reasons.keptByRule['Rule 2 (no underdogs, next confidence)'] = nextBest.pick;
        console.log(`  [Rule 2] No underdogs, next by confidence: ${nextBest.pick}`);
      }
    }
  }

  // Rule 3: Second-to-last Confidence pick
  if (actualPickCount >= 3 && byConfidence.length >= 2) {
    const secondLastIdx = byConfidence.length - 2;
    let pick = byConfidence[secondLastIdx];

    // If already selected, try the actual last one
    if (selectedNames.has(pick.pick) && byConfidence.length >= 1) {
      pick = byConfidence[byConfidence.length - 1];
    }
    // If still selected, find any unselected pick
    if (selectedNames.has(pick.pick)) {
      pick = byConfidence.find(p => !selectedNames.has(p.pick));
    }

    if (pick && !selectedNames.has(pick.pick)) {
      kept.push(pick);
      selectedNames.add(pick.pick);
      reasons.keptByRule['Rule 3 (Second-to-last Confidence)'] = pick.pick;
      console.log(`  [Rule 3] Second-to-last: ${pick.pick} (${(getConfidence(pick) * 100).toFixed(0)}%)`);
    }
  }

  // Rule 4: Random (if taking 4+ picks)
  if (actualPickCount >= 4) {
    const randomPick = getRandomPick(mlOnlyPicks, selectedNames);
    if (randomPick) {
      kept.push(randomPick);
      selectedNames.add(randomPick.pick);
      reasons.keptByRule['Rule 4 (Random)'] = randomPick.pick;
      console.log(`  [Rule 4] Random: ${randomPick.pick}`);
    }
  }

  // Rule 5: Random (if taking 5 picks)
  if (actualPickCount >= 5) {
    const randomPick = getRandomPick(mlOnlyPicks, selectedNames);
    if (randomPick) {
      kept.push(randomPick);
      selectedNames.add(randomPick.pick);
      reasons.keptByRule['Rule 5 (Random)'] = randomPick.pick;
      console.log(`  [Rule 5] Random: ${randomPick.pick}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Mark removed picks
  // ═══════════════════════════════════════════════════════════════════════════
  for (const pick of mlOnlyPicks) {
    if (!selectedNames.has(pick.pick)) {
      removed.push({ pick, reason: 'Not selected by filter rules' });
      reasons.removedBySelectionRules++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n[NHL Filter] ═══════════════════════════════════════════════════════`);
  console.log(`[NHL Filter] FINAL SUMMARY:`);
  console.log(`  Games today: ${numGames}`);
  console.log(`  KEPT: ${kept.length} picks`);
  for (const [rule, pickName] of Object.entries(reasons.keptByRule)) {
    console.log(`    - ${rule}: ${pickName}`);
  }
  console.log(`  REMOVED: ${removed.length} picks`);
  if (reasons.removedPuckLine > 0) console.log(`    - Puck lines: ${reasons.removedPuckLine}`);
  if (reasons.removedBySelectionRules > 0) console.log(`    - Not selected: ${reasons.removedBySelectionRules}`);
  console.log(`[NHL Filter] ═══════════════════════════════════════════════════════\n`);

  return {
    kept,
    removed,
    summary: {
      numGames,
      targetPickCount,
      actualPickCount: kept.length,
      ...reasons
    }
  };
}

export default {
  filterNHLPicks,
  calculatePickCount
};
