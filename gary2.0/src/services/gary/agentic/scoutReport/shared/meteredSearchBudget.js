/**
 * A per-process budget for METERED web searches (founder, Sep 9 2026: with
 * both bridges capped, every press lane of every desk fell through to the
 * Anthropic server search — 66 metered searches in one hour on top of the
 * research the key is meant to pay for).
 *
 * The $0 rungs (Codex search, the Claude bridge) are never counted. Only the
 * fall-through to the metered API takes from this budget; when it is spent,
 * a lane reports itself unavailable instead of buying another search.
 * GARY_METERED_SEARCH_CAP sets the cap per process (default 0 — the key pays for research, not for press; -1 = no cap).
 */
const cap = () => (process.env.GARY_METERED_SEARCH_CAP != null && process.env.GARY_METERED_SEARCH_CAP !== '' && Number.isFinite(Number(process.env.GARY_METERED_SEARCH_CAP)) ? Number(process.env.GARY_METERED_SEARCH_CAP) : 0);
let used = 0;

export function meteredSearchCap() { return cap(); }
export function meteredSearchesUsed() { return used; }

/** Take one metered search from the budget; false when the budget is spent. */
export function takeMeteredSearch(label = 'search') {
  const limit = cap();
  if (limit >= 0 && used >= limit) {
    console.warn(`[Metered Search] budget of ${limit} per process is spent — ${label} stays unavailable rather than buying another search`);
    return false;
  }
  used += 1;
  return true;
}

/** Test seam. */
export function _resetMeteredSearchBudget() { used = 0; }

export default { takeMeteredSearch, meteredSearchesUsed, meteredSearchCap, _resetMeteredSearchBudget };
