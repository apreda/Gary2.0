export function classifyPickMarketSide(pick = {}) {
  if (pick.type === 'spread') {
    if (pick.spread === null || pick.spread === undefined || pick.spread === '') return 'unknown';
    const spread = Number(pick.spread);
    if (!Number.isFinite(spread)) return 'unknown';
    if (spread > 0) return 'underdog';
    if (spread < 0) return 'favorite';
    return 'pickem';
  }

  if (pick.type === 'moneyline') {
    if (pick.odds === null || pick.odds === undefined || pick.odds === '') return 'unknown';
    const odds = Number(pick.odds);
    if (!Number.isFinite(odds)) return 'unknown';
    return odds > 0 ? 'underdog' : 'favorite';
  }

  return 'unknown';
}
