/**
 * WHERE THE MARKET SITS (founder GO, Sep 21 2026): the room's read on a game,
 * on the desk as dated facts. Two things a fan sees and Gary did not:
 *
 *   1. The exchanges. BDL's odds feed carries Polymarket and Kalshi rows next
 *      to the sportsbooks; oddsService has always filtered them out before the
 *      board reached the app or the desk. Retail-heavy prediction markets
 *      price the same sides, so their number beside the book's is where the
 *      crowd is putting money. They are never a bettable book here.
 *   2. The line's move since first seen, which the desk already prints under
 *      BETTING CONTEXT (formatLineHistory). This block does not repeat it.
 *
 * Public ticket splits (the Action Network / Pikkit view) have no source that
 * answers with numbers without a login, so they are not invented here.
 *
 * Facts only. No lean, no fade, no conclusion: what the room is on is a fact
 * about the week, and what it means at this number is Gary's read.
 */
import { finiteMarketNumber, isAmericanPrice } from './marketTruth.js';

export const PREDICTION_MARKET_VENDORS = new Set(['polymarket', 'kalshi']);
const VENDOR_LABEL = { polymarket: 'Polymarket', kalshi: 'Kalshi' };

const teamKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const price = value => (isAmericanPrice(value) ? (Number(value) > 0 ? `+${Number(value)}` : `${Number(value)}`) : null);
const point = value => {
  const n = finiteMarketNumber(value);
  return n === null ? null : (n > 0 ? `+${n}` : n === 0 ? 'PK' : `${n}`);
};

/**
 * Pull the exchange rows out of a game's bookmaker list before the vendor
 * filter removes them. Bookmakers use the shared shape the BDL adapter and
 * The Odds API reader both produce: { key, markets: [{ key, outcomes }] }.
 */
export function predictionMarketRows(bookmakers, homeTeam, awayTeam) {
  const home = teamKey(homeTeam), away = teamKey(awayTeam);
  const rows = [];
  for (const book of Array.isArray(bookmakers) ? bookmakers : []) {
    const vendor = String(book?.key ?? book?.vendor ?? '').toLowerCase();
    if (!PREDICTION_MARKET_VENDORS.has(vendor)) continue;
    const row = { vendor, spread_home: null, spread_home_odds: null, spread_away: null, spread_away_odds: null,
      moneyline_home: null, moneyline_away: null, updated_at: book?.last_update ?? null };
    for (const market of book?.markets || []) {
      for (const outcome of market?.outcomes || []) {
        const side = teamKey(outcome?.name) === home ? 'home' : teamKey(outcome?.name) === away ? 'away' : null;
        if (!side) continue;
        if (market.key === 'h2h' && isAmericanPrice(outcome.price)) row[`moneyline_${side}`] = Number(outcome.price);
        if (market.key === 'spreads' && isAmericanPrice(outcome.price) && finiteMarketNumber(outcome.point) !== null) {
          row[`spread_${side}`] = finiteMarketNumber(outcome.point);
          row[`spread_${side}_odds`] = Number(outcome.price);
        }
      }
    }
    if (row.moneyline_home != null || row.moneyline_away != null || row.spread_home != null || row.spread_away != null) rows.push(row);
  }
  return rows;
}

/** The block's lines, or null when the game carries no exchange row. */
export function formatMarketPosition({ game, homeTeam = game?.home_team, awayTeam = game?.away_team } = {}) {
  const rows = Array.isArray(game?.prediction_markets) ? game.prediction_markets : [];
  if (!rows.length) return null;
  const lines = [];
  for (const row of rows) {
    const label = VENDOR_LABEL[row.vendor] || row.vendor;
    const bits = [];
    if (row.spread_home != null && row.spread_away != null) {
      bits.push(`spread ${awayTeam} ${point(row.spread_away)} (${price(row.spread_away_odds) ?? 'n/a'}) | ${homeTeam} ${point(row.spread_home)} (${price(row.spread_home_odds) ?? 'n/a'})`);
    }
    if (row.moneyline_home != null && row.moneyline_away != null) {
      bits.push(`moneyline ${awayTeam} ${price(row.moneyline_away)} | ${homeTeam} ${price(row.moneyline_home)}`);
    }
    if (bits.length) lines.push(`${label} (prediction market, not a sportsbook): ${bits.join('; ')}.`);
  }
  if (!lines.length) return null;
  lines.push('Exchange prices are where the crowd is putting money on the same sides, beside the sportsbook line above. Not a bettable book here.');
  return lines.join('\n');
}
