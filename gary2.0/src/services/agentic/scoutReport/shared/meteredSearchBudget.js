/**
 * A per-process budget for METERED web searches (founder, Sep 9 2026: with
 * both bridges capped, every press lane of every desk fell through to the
 * Anthropic server search — 66 metered searches in one hour on top of the
 * research the key is meant to pay for).
 *
 * The $0 rungs (Codex search, the Claude bridge) are never counted. Only the
 * fall-through to the metered API takes from this budget; when it is spent,
 * a lane reports itself unavailable instead of buying another search.
 * GARY_METERED_SEARCH_CAP sets the cap per process (default 3; -1 = no cap).
 */
const CAP = Number.isFinite(Number(process.env.GARY_METERED_SEARCH_CAP)) ? Number(process.env.GARY_METERED_SEARCH_CAP) : 3;
let used = 0;

export function meteredSearchCap() { return CAP; }
export function meteredSearchesUsed() { return used; }

/** Take one metered search from the budget; false when the budget is spent. */
export function takeMeteredSearch(label = 'search') {
  if (CAP >= 0 && used >= CAP) {
    console.warn(`[Metered Search] budget of ${CAP} per process is spent — ${label} stays unavailable rather than buying another search`);
    return false;
  }
  used += 1;
  return true;
}

/** Test seam. */
export function _resetMeteredSearchBudget() { used = 0; }

export default { takeMeteredSearch, meteredSearchesUsed, meteredSearchCap, _resetMeteredSearchBudget };
