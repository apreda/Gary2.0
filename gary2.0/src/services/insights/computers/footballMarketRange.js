// NCAAF exact-game sportsbook disagreement. College boards often carry wider
// cross-book gaps than the NFL; this is a college-native fault-line module,
// not a generic football card copied across both products.
//
// This is intentionally a range, not a sharp/public-betting claim. BDL gives
// us posted sportsbook quotes; it does not tell us who placed the bets.

import { makeRow, TONES } from '../shared.js';
import { resolveNcaafKickoff } from '../../ncaafGamePolicy.js';

const BLOCKED_VENDORS = new Set(['kalshi', 'polymarket', 'openingsnapshot']);
const MIN_BOOKS = 3;
const THRESHOLDS = Object.freeze({
  ncaaf: Object.freeze({ total: 2.5, spread: 1.5 }),
});

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function vendorKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function display(value) {
  const number = finite(value);
  if (number == null) return null;
  return number.toFixed(1).replace(/\.0$/, '');
}

function signed(value) {
  const body = display(value);
  if (body == null) return null;
  return Number(value) > 0 ? `+${body}` : body;
}

function quoteInstant(row) {
  const value = row?.updated_at ?? row?.last_updated_at ?? row?.last_update;
  const instant = Date.parse(value ?? '');
  return Number.isFinite(instant) ? instant : null;
}

function latestQuotesByVendor(rows, gameId, kickoffAt) {
  const byVendor = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const rowGameId = row?.game_id ?? row?.game?.id;
    if (String(rowGameId ?? '') !== String(gameId)) continue;
    const vendor = vendorKey(row?.vendor);
    if (!vendor || BLOCKED_VENDORS.has(vendor)) continue;
    const observedAt = quoteInstant(row);
    // A market range is a pregame shopping tool. Unknown-time and in-game
    // snapshots cannot truthfully be presented as current sportsbook quotes.
    if (observedAt == null || observedAt >= kickoffAt) continue;
    const prior = byVendor.get(vendor);
    if (!prior || observedAt > quoteInstant(prior)) {
      byVendor.set(vendor, row);
    }
  }
  return [...byVendor.values()];
}

function marketRange(quotes, key) {
  const priced = quotes
    .map((row) => ({ row, value: finite(row?.[key]) }))
    .filter((item) => item.value != null);
  if (priced.length < MIN_BOOKS) return null;
  const values = priced.map((item) => item.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return {
    low,
    high,
    range: high - low,
    quotes: priced,
    asOf: priced.map((item) => item.row?.updated_at).filter(Boolean).sort().at(-1) ?? null,
  };
}

function rangeRow({ league, game, helpers, market, kind, date }) {
  const threshold = THRESHOLDS[league]?.[kind] ?? Infinity;
  if (!market || market.range < threshold) return null;
  const label = helpers.gameLabel(game);
  const isTotal = kind === 'total';
  const low = isTotal ? display(market.low) : signed(market.low);
  const high = isTotal ? display(market.high) : signed(market.high);
  const gap = display(market.range);
  if (low == null || high == null || gap == null) return null;
  const vendors = market.quotes.map(({ row }) => String(row?.vendor || '').trim()).filter(Boolean);
  const noun = isTotal ? 'total' : 'home spread';

  return makeRow({
    category: 'market_range',
    headline: `${label} books span ${gap} ${market.range === 1 ? 'point' : 'points'}`,
    detail:
      `The current ${noun} ranges from ${low} to ${high} across ${market.quotes.length} sportsbooks. ` +
      'That is book disagreement, not a public-bet or sharp-money signal.',
    game: label,
    value: `${low}–${high}${isTotal ? ' O/U' : ''}`,
    tone: TONES.NEUTRAL,
    relevance_score: Math.min(94, Math.round(58 + market.range * (isTotal ? 5 : 8))),
    game_id: game?.id,
    meta: {
      kind: 'market_range',
      source: 'balldontlie_odds',
      metric: isTotal ? 'sportsbook_total_range' : 'sportsbook_home_spread_range',
      league: league.toUpperCase(),
      date,
      market: kind,
      low: market.low,
      high: market.high,
      range: market.range,
      book_count: market.quotes.length,
      vendors,
      as_of: market.asOf,
      kickoff: resolveNcaafKickoff(game).iso,
      grade: 'context',
    },
  });
}

export function buildFootballMarketRangeRows({ league, date, games = [], odds = [], helpers, now = new Date() } = {}) {
  const key = String(league || '').toLowerCase();
  if (!THRESHOLDS[key] || typeof helpers?.gameLabel !== 'function') return [];
  const nowInstant = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowInstant)) return [];
  const rows = [];
  for (const game of games) {
    if (game?.id == null) continue;
    const kickoff = resolveNcaafKickoff(game);
    const kickoffAt = Date.parse(kickoff.iso ?? '');
    if (!Number.isFinite(kickoffAt) || nowInstant >= kickoffAt) continue;
    const quotes = latestQuotesByVendor(odds, game.id, kickoffAt);
    const total = marketRange(quotes, 'total_value');
    const spread = marketRange(quotes, 'spread_home_value');
    const totalRow = rangeRow({ league: key, game, helpers, market: total, kind: 'total', date });
    const spreadRow = rangeRow({ league: key, game, helpers, market: spread, kind: 'spread', date });
    // One fault line per game. Lead with the market carrying the larger gap
    // relative to its sport-specific materiality threshold.
    const candidates = [totalRow, spreadRow].filter(Boolean);
    if (candidates.length === 1) rows.push(candidates[0]);
    if (candidates.length === 2) {
      const totalScore = total.range / THRESHOLDS[key].total;
      const spreadScore = spread.range / THRESHOLDS[key].spread;
      rows.push(totalScore >= spreadScore ? totalRow : spreadRow);
    }
  }
  return rows;
}

export async function computeFootballMarketRange(ctx) {
  const league = String(ctx?.league || '').toLowerCase();
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!THRESHOLDS[league] || games.length === 0) return [];
  const sportKey = 'americanfootball_ncaaf';
  const odds = await ctx.bdl.getOddsV2(
    { game_ids: games.map((game) => game?.id).filter((id) => id != null), per_page: 100 },
    sportKey,
    1,
  );
  return buildFootballMarketRangeRows({
    league,
    date: ctx.date,
    games,
    odds,
    helpers: ctx.helpers,
    now: ctx.now ?? new Date(),
  });
}

export default { buildFootballMarketRangeRows, computeFootballMarketRange };
