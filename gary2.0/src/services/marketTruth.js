export function finiteMarketNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Resolve a spread from the requested team's perspective.
 * Explicit selected-side data wins; the opposite side is negated only when
 * the selected side is absent.
 */
export function spreadForSide(market = {}, side) {
  if (side !== 'home' && side !== 'away') return null;
  const ownKey = side === 'home' ? 'spread_home' : 'spread_away';
  const oppositeKey = side === 'home' ? 'spread_away' : 'spread_home';
  const own = finiteMarketNumber(market[ownKey]);
  if (own !== null) return own;
  const opposite = finiteMarketNumber(market[oppositeKey]);
  return opposite === null ? null : -opposite;
}

export function homeSpreadReference(market = {}, fallback = 0) {
  return spreadForSide(market, 'home') ?? fallback;
}

export function americanImpliedProbability(value) {
  const price = finiteMarketNumber(value);
  if (price === null || price === 0) return null;
  return price < 0
    ? (-price) / ((-price) + 100)
    : 100 / (price + 100);
}
