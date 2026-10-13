import { createHash } from 'node:crypto';
import { propMarketLine } from './propMarketLine.js';

/** Immutable evidence travels with the published pick, independently of a mutable menu. */
export function propQuoteReceipt(row, side, { gameId = row?.game_id, observedAt = null } = {}) {
  if (!row || !['over', 'under'].includes(side)) return null;
  const source = row[`${side}_source_market`];
  const odds = row[`${side}_odds`];
  const vendor = row[`${side}_vendor`];
  if (!source || !vendor || gameId == null || row.player_id == null || row.line == null || odds == null) return null;
  const price = source.market?.type === 'milestone' && side === 'over' ? source.market.odds : source.market?.[`${side}_odds`];
  let sourceLine;
  try { sourceLine = /anytime_touchdown/.test(row.prop_type) ? Number(source.line_value) : propMarketLine(source); } catch { return null; }
  if (sourceLine !== Number(row.line) || Number(price) !== Number(odds) || source.vendor !== vendor
    || String(source.player_id) !== String(row.player_id)
    || (source.game_id != null && String(source.game_id) !== String(gameId))) return null;
  // A quote's provider rides its receipt (Sep 22 2026): BDL by default; The
  // Odds API when a college board came from the named books' own markets.
  const receipt = { version: 1, provider: source.provider || 'balldontlie', game_id: String(gameId), player_id: String(row.player_id),
    prop_type: row.prop_type, line: Number(row.line), side, odds: Number(odds), bookmaker: vendor,
    provider_market_id: source.id ?? null, provider_updated_at: source.updated_at ?? null,
    observed_at: observedAt || source._gary_observed_at || null, market_phase: 'pregame', source_market: structuredClone(source) };
  return { quote_id: createHash('sha256').update(JSON.stringify(receipt)).digest('hex'), ...receipt,
    // Standard-market corroboration has its own observation time; quote_id identifies the BDL quote above.
    ...(row.standard_market?.[side] ? { standard_market: structuredClone(row.standard_market[side]) } : {}) };
}

/** A model may select a quote; it may not silently change its price. */
export function selectionMatchesQuote(pick, receipt) {
  return Boolean(receipt && pick.odds != null && Number(pick.odds) === receipt.odds);
}
