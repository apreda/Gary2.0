import { describe, it, expect, vi } from 'vitest';
import { propQuoteReceipt } from '../../src/services/propQuoteReceipt.js';
import { verifyPropQuotes } from '../../src/services/verifyPropQuotes.js';
const source = { id: 1, game_id: 2, player_id: 3, vendor: 'fanduel', prop_type: 'pitcher_earned_runs', line_value: '0.5', market: { type: 'over_under', over_odds: -187, under_odds: 130 } };
const pick = () => ({ player: 'Pitcher', odds: '-187', quote_receipt: propQuoteReceipt({ game_id: 2, player_id: 3, prop_type: source.prop_type, line: 0.5, over_odds: -187, over_vendor: source.vendor, over_source_market: source }, 'over') });
const setup = rows => ({ league: 'MLB', gameId: 2, apiKey: 'fixture', now: () => new Date('2026-09-19T14:00:00Z'), fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({ data: rows }) })) });
describe('publication quote recheck', () => {
  it('persists an independently re-fetched, timestamped exact ticket', async () => {
    const selected = pick(); const [actual] = await verifyPropQuotes([selected], setup([source]));
    expect(actual.quote_receipt).toMatchObject({ odds: -187, bookmaker: 'fanduel', observed_at: '2026-09-19T14:00:00.000Z', selected_quote_id: selected.quote_receipt.quote_id });
  });
  it.each(['price', 'line', 'side', 'book', 'game', 'player', 'market'])('withholds changed %s without rewriting the selected bet', async field => {
    const row = structuredClone(source);
    if (field === 'price') row.market.over_odds = -400;
    if (field === 'line') row.line_value = '1.5';
    if (field === 'side') { row.market.over_odds = 130; row.market.under_odds = -187; }
    if (field === 'book') row.vendor = 'draftkings';
    if (field === 'game') row.game_id = 9;
    if (field === 'player') row.player_id = 9;
    if (field === 'market') row.prop_type = 'pitcher_strikeouts';
    await expect(verifyPropQuotes([pick()], setup([row]))).rejects.toThrow('fresh analysis required');
  });
  it('does not turn a provider failure into a verified empty board', async () => {
    const options = setup([]); options.fetchImpl = async () => ({ ok: false, status: 503 });
    await expect(verifyPropQuotes([pick()], options)).rejects.toThrow('503');
  });
  it('follows NBA cursors before deciding a selected quote disappeared', async () => {
    const options = setup([]); options.league = 'NBA';
    options.fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], meta: { next_cursor: 100 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [source] }) });
    expect(await verifyPropQuotes([pick()], options)).toHaveLength(1);
    expect(options.fetchImpl.mock.calls[1][0].searchParams.get('cursor')).toBe('100');
  });
});
