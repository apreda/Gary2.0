import { finiteMarketNumber, isAmericanPrice } from '../../src/services/marketTruth.js';

const vendorKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Identify a book quoting the selected-side ticket exactly, without electing
 * another number or price. Prefer the desk's posted book when quotes tie. */
export function exactFootballMarketBook(sportsbookOdds, result, preferredBook = null) {
  if (!Array.isArray(sportsbookOdds) || !result) return null;
  const wantedOdds = finiteMarketNumber(result.type === 'spread'
    ? (result.spreadOdds ?? result.odds) : result.odds);
  if (!isAmericanPrice(wantedOdds)) return null;
  const pickText = String(result.pick || '').trim().toLowerCase();
  const candidates = sportsbookOdds.filter(row => {
    if (!vendorKey(row?.book) || vendorKey(row.book) === 'unknown') return false;
    if (result.type === 'spread') {
      const line = finiteMarketNumber(result.spread);
      return line !== null && finiteMarketNumber(row.spread) === line
        && finiteMarketNumber(row.spread_odds) === wantedOdds;
    }
    if (result.type === 'moneyline') return finiteMarketNumber(row.ml) === wantedOdds;
    if (result.type !== 'total') return false;
    const line = finiteMarketNumber(result.total);
    if (line === null || finiteMarketNumber(row.total) !== line) return false;
    const odds = pickText.startsWith('over') ? row.total_over_odds
      : pickText.startsWith('under') ? row.total_under_odds : null;
    return finiteMarketNumber(odds) === wantedOdds;
  });
  for (const preferred of [result.book, preferredBook]) {
    const match = candidates.find(row => vendorKey(row.book) === vendorKey(preferred));
    if (match) return match.book;
  }
  candidates.sort((a, b) => vendorKey(a.book).localeCompare(vendorKey(b.book)));
  return candidates[0]?.book ?? null;
}
