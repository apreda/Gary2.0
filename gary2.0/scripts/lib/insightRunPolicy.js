const FOOTBALL_FANTASY_CATEGORIES = new Set([
  'fantasy_usage',
  'fantasy_matchup',
  'fantasy_trend',
]);

const NON_SPORTSBOOK_FOOTBALL_VENDORS = new Set([
  'kalshi',
  'polymarket',
  'openingsnapshot',
  'opening_snapshot',
]);

/**
 * Repair a legacy football market card that was frozen from a prediction
 * market before canonical sportsbook selection was enforced. The exception is
 * one-way: a real sportsbook may replace a non-sportsbook vendor, never the
 * reverse, and no other editorial card is opened to churn.
 */
export function shouldRepairFootballMarketVendor(stored, fresh) {
  if (!stored || !fresh) return false;
  if (String(stored.category || '') !== 'pace_script' || String(fresh.category || '') !== 'pace_script') {
    return false;
  }
  const storedVendor = String(stored.meta?.vendor || '').trim().toLowerCase();
  const freshVendor = String(fresh.meta?.vendor || '').trim().toLowerCase();
  return NON_SPORTSBOOK_FOOTBALL_VENDORS.has(storedVendor)
    && freshVendor.length > 0
    && !NON_SPORTSBOOK_FOOTBALL_VENDORS.has(freshVendor);
}

/**
 * The Hub normally freezes a card once users have seen it. Football fantasy
 * has one safe exception: a visibly labeled prior-season baseline may advance
 * to verified current-season evidence for the same entity/game. The transition
 * is deliberately one-way; a later provider miss can never downgrade a current
 * row back to baseline.
 */
export function shouldUpgradeFootballFantasyEvidence(stored, fresh) {
  if (!stored || !fresh) return false;
  if (!FOOTBALL_FANTASY_CATEGORIES.has(String(fresh.category || ''))) return false;
  if (String(stored.category || '') !== String(fresh.category || '')) return false;
  return stored.meta?.evidence_scope === 'prior_season_baseline' &&
    fresh.meta?.evidence_scope === 'current_season';
}

/**
 * Snapshot refreshes may reorder the grounded player board as roles change,
 * but a transient provider miss must never replace verified current-season
 * evidence with the prior-season fallback.
 */
export function shouldPreserveCurrentFootballFantasySnapshot(existingRows, freshRows) {
  const existing = Array.isArray(existingRows) ? existingRows : [];
  const fresh = Array.isArray(freshRows) ? freshRows : [];
  if (!fresh.length || !FOOTBALL_FANTASY_CATEGORIES.has(String(fresh[0]?.category || ''))) return false;
  const hasCurrent = existing.some((row) => row?.meta?.evidence_scope === 'current_season');
  const freshIsBaselineOnly = fresh.every((row) => row?.meta?.evidence_scope === 'prior_season_baseline');
  return hasCurrent && freshIsBaselineOnly;
}

/**
 * A successful dark day is not an error. A football slate with real games but
 * zero rows across every registered computer is different: failing the cloud
 * job makes the outage visible and preserves any last-good stored rows.
 */
export function footballHubRunIsEmptyFailure({ league, gameCount, connectionCount } = {}) {
  const key = String(league || '').trim().toUpperCase();
  return (key === 'NFL' || key === 'NCAAF') &&
    Number(gameCount) > 0 && Number(connectionCount) === 0;
}

export default {
  footballHubRunIsEmptyFailure,
  shouldRepairFootballMarketVendor,
  shouldPreserveCurrentFootballFantasySnapshot,
  shouldUpgradeFootballFantasyEvidence,
};
