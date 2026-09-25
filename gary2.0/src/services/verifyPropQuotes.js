import { verifyStandardPropSelections } from './standardPropMarkets.js';
import { getApiKey } from './ballDontLieService.js';
import { decodeBdlRows } from './bdlResponse.js';
import { propQuoteReceipt } from './propQuoteReceipt.js';

/** Re-read the selected book after analysis. A moved ticket is never repriced silently. */
export async function verifyPropQuotes(picks, { league, gameId, fetchImpl = fetch, apiKey = getApiKey(), now = () => new Date() } = {}) {
  if (!picks.length) return [];
  const root = { MLB: 'mlb/v1', NFL: 'nfl/v1', NCAAF: 'ncaaf/v1', NBA: 'v2', NHL: 'nhl/v1' }[league];
  if (!root || gameId == null) throw new Error('Quote verification requires the exact league and game');
  // A quote taken from The Odds API's named books (the college board fallback,
  // Sep 22 2026) has no BDL row to re-read; its live recheck is the
  // standard-market recheck below, against the same provider that quoted it.
  const oddsApiPicks = picks.filter(pick => pick.quote_receipt?.provider === 'the_odds_api' && String(pick.quote_receipt.game_id) === String(gameId));
  picks = picks.filter(pick => !oddsApiPicks.includes(pick));
  if (!picks.length) {
    return ['MLB', 'NFL', 'NCAAF'].includes(league) ? verifyStandardPropSelections(oddsApiPicks, { league }) : oddsApiPicks;
  }
  let cursor, rows = [], pages = 0;
  do {
    const url = new URL(`https://api.balldontlie.io/${root}/odds/player_props`);
    url.searchParams.set('game_id', String(gameId));
    if (league === 'NBA') url.searchParams.set('per_page', '100');
    if (cursor != null) url.searchParams.set('cursor', String(cursor));
    const response = await fetchImpl(url, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Selected prop quote verification failed: BDL HTTP ${response.status}`);
    const payload = await response.json();
    rows.push(...decodeBdlRows(payload, 'Selected BDL prop quotes'));
    cursor = payload.meta?.next_cursor;
    if (++pages >= 20 && cursor != null) throw new Error('Selected prop quote verification pagination incomplete');
  } while (cursor != null);
  const observedAt = now().toISOString();
  const verified = [];
  for (const pick of picks) {
    const original = pick.quote_receipt;
    if (!original || original.game_id !== String(gameId)) continue;
    const candidates = rows.filter(row => String(row.game_id) === String(gameId)
      && String(row.player_id) === original.player_id && row.vendor === original.bookmaker
      && row.prop_type === original.source_market?.prop_type);
    const receipt = candidates.map(source => propQuoteReceipt({ player_id: original.player_id, prop_type: original.prop_type,
      standard_market: { [original.side]: original.standard_market },
      line: original.line, [`${original.side}_odds`]: original.odds, [`${original.side}_vendor`]: original.bookmaker,
      [`${original.side}_source_market`]: source }, original.side, { gameId, observedAt })).find(Boolean);
    if (receipt) verified.push({ ...pick, quote_receipt: { ...receipt, selected_quote_id: original.quote_id } });
    else console.warn(`[Props] Withheld moved/unavailable quote: ${pick.player} ${original.side} ${original.line} ${original.odds} (${original.bookmaker})`);
  }
  verified.push(...oddsApiPicks);
  if (!verified.length) throw new Error('Selected prop quotes moved or disappeared before publication; fresh analysis required');
  // The re-read board rides along so the standard check sees every book's rows.
  return ['MLB', 'NFL', 'NCAAF'].includes(league)
    ? verifyStandardPropSelections(verified, { league, rawRows: rows }) : verified;
}
