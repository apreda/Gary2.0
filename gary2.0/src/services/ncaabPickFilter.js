/**
 * NCAAB Pick Filter Service
 *
 * Filters Gary's NCAAB picks to create a focused 5-pick slate.
 * Applied AFTER Gary makes his picks, before storage.
 *
 * RULES (in order):
 * 1. Remove any pick with spread above ±14
 * 2. Max 1 away team (highest confidence away pick kept)
 * 3. Top 5 by confidence
 * TARGET: 5 picks per day
 */

/**
 * Get confidence value from pick (handles different field names)
 */
function getConfidence(pick) {
  return pick.confidence || pick.confidence_score || 0.5;
}

/**
 * Get numeric spread value from pick string
 * Returns the raw number (e.g., +10.5 returns 10.5, -7 returns -7)
 */
function getSpreadValue(pick) {
  const match = pick.pick?.match(/([+-]\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Check if this pick is for the HOME team
 * Compares pick text against homeTeam and awayTeam fields
 */
function isHomePick(pick) {
  const pickText = (pick.pick || '').toLowerCase();
  const homeTeam = (pick.homeTeam || '').toLowerCase();
  const awayTeam = (pick.awayTeam || '').toLowerCase();

  if (!homeTeam && !awayTeam) return true; // Unknown, assume home

  // Check last word of team name (most distinctive — e.g., "Bulldogs", "Wildcats")
  const homeLastWord = homeTeam.split(' ').pop();
  const awayLastWord = awayTeam.split(' ').pop();

  if (homeLastWord && homeLastWord.length > 2 && pickText.includes(homeLastWord)) return true;
  if (awayLastWord && awayLastWord.length > 2 && pickText.includes(awayLastWord)) return false;

  // Fallback: check full team name
  if (homeTeam && pickText.includes(homeTeam)) return true;
  if (awayTeam && pickText.includes(awayTeam)) return false;

  return true; // Default to home if can't determine
}

/**
 * Main filter function
 *
 * RULES:
 * 1. REMOVE any pick with spread above ±14
 * 2. Max 1 away team (highest confidence)
 * 3. KEEP top 5 by confidence
 * TARGET: 5 picks per day
 *
 * @param {Array} picks - Array of Gary's NCAAB picks
 * @returns {Object} - { kept: [], removed: [], summary: {} }
 */
export async function filterNCAABPicks(picks) {
  console.log(`\n[NCAAB Filter] Analyzing ${picks.length} picks...`);

  if (picks.length === 0) {
    console.log('[NCAAB Filter] No picks to filter');
    return { kept: [], removed: [], summary: { noPicks: true } };
  }

  // STEP 1: Remove picks with spreads above ±14
  const eligible = [];
  const spreadRemoved = [];

  for (const p of picks) {
    const spread = getSpreadValue(p);
    if (spread !== null && Math.abs(spread) > 14) {
      spreadRemoved.push(p);
      console.log(`[NCAAB Filter] REMOVE spread > ±14: ${p.pick} (spread: ${spread > 0 ? '+' : ''}${spread})`);
    } else {
      eligible.push(p);
    }
  }

  if (eligible.length === 0) {
    console.log('[NCAAB Filter] No picks within ±14 spread limit');
    return {
      kept: [],
      removed: spreadRemoved.map(p => ({ pick: p, reason: 'Spread exceeds ±14 limit' })),
      summary: { noPicks: true, spreadRemoved: spreadRemoved.length }
    };
  }

  // Sort by confidence (highest first)
  const sorted = [...eligible].sort((a, b) => getConfidence(b) - getConfidence(a));

  console.log('[NCAAB Filter] Eligible picks by confidence:');
  sorted.forEach((p, i) => {
    const conf = getConfidence(p);
    const spread = getSpreadValue(p);
    const spreadStr = spread !== null ? ` (${spread > 0 ? '+' : ''}${spread})` : '';
    const location = isHomePick(p) ? 'HOME' : 'AWAY';
    console.log(`  ${i + 1}. ${p.pick} — conf: ${conf.toFixed(2)} [${location}]${spreadStr}`);
  });

  // STEP 2: Select top 5 with max 1 away team
  const kept = [];
  const skipped = [];
  let awayCount = 0;

  for (const p of sorted) {
    if (kept.length >= 5) {
      skipped.push({ pick: p, reason: 'Outside top 5 confidence' });
      continue;
    }

    const isHome = isHomePick(p);

    if (!isHome) {
      if (awayCount >= 1) {
        skipped.push({ pick: p, reason: 'Max 1 away team already reached' });
        continue;
      }
      awayCount++;
      console.log(`[NCAAB Filter] KEEP away pick (1/1): ${p.pick} (conf: ${getConfidence(p).toFixed(2)})`);
    } else {
      console.log(`[NCAAB Filter] KEEP home pick: ${p.pick} (conf: ${getConfidence(p).toFixed(2)})`);
    }

    kept.push(p);
  }

  // Combine all removed
  const removed = [
    ...spreadRemoved.map(p => ({ pick: p, reason: 'Spread exceeds ±14 limit' })),
    ...skipped
  ];

  const homeCount = kept.filter(p => isHomePick(p)).length;
  const awayKept = kept.filter(p => !isHomePick(p)).length;

  console.log(`\n[NCAAB Filter] FINAL: ${kept.length} kept (${homeCount} home, ${awayKept} away), ${removed.length} removed`);
  kept.forEach((p, i) => {
    const location = isHomePick(p) ? 'HOME' : 'AWAY';
    console.log(`  ${i + 1}. ${p.pick} [${location}] (conf: ${getConfidence(p).toFixed(2)})`);
  });

  return {
    kept,
    removed,
    summary: {
      kept: kept.length,
      removed: removed.length,
      spreadRemoved: spreadRemoved.length,
      home: homeCount,
      away: awayKept
    }
  };
}

export default {
  filterNCAABPicks
};
