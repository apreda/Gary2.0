export function finiteMarketNumber(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isAmericanPrice(value) {
  const price = finiteMarketNumber(value);
  return Number.isInteger(price) && Math.abs(price) >= 100;
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

/** Football's game lane selects a spread ticket. A model cannot supply a
 * missing sportsbook line or price; retry the data on the next scheduled run. */
export function footballMarketUnavailable(game = {}, sport = '') {
  if (!/^(?:americanfootball_)?(?:nfl|ncaaf)$/i.test(sport)) return null;
  const pricedSide = ['home', 'away'].some(side => {
    return spreadForSide(game, side) !== null && isAmericanPrice(game[`spread_${side}_odds`]);
  });
  return pricedSide ? null : {
    error: 'No verified priced football spread. Refresh sportsbook data on the next scheduled attempt.',
    code: 'market_unavailable', retryModel: false,
  };
}

export const shouldRetryPickWithModel = result => result?.code !== 'market_unavailable'
  && Boolean(result?.error || !result?.pick);
