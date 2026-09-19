import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ subscriptionSearch: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/subscriptionSearch.js', () => transport);
const { callWireModel, observedWebUrls, supportedWireSources, verifiedWireMovement } = await import('../../../src/services/insights/wireModel.js');
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());
describe('Wire subscription transport', () => {
  it('uses the shared account order and preserves the original source request', async () => {
    transport.subscriptionSearch.mockResolvedValue({ success: true, data: '[{"kind":"moment"}]', transport: 'business-gpt-0' });
    expect(await callWireModel('original grounded prompt')).toMatchObject({ text: '[{"kind":"moment"}]', provider: 'business-gpt-0' });
    expect(transport.subscriptionSearch).toHaveBeenCalledWith(expect.stringContaining('open each public source'), expect.objectContaining({signal: expect.any(AbortSignal)}));
    expect(transport.subscriptionSearch.mock.calls[0][0]).toContain('original grounded prompt');
  });
  it('fails with the actual account failure instead of a paid API retry', async () => {
    transport.subscriptionSearch.mockResolvedValue({success:false,error:'Claude capped; business capped; personal capped'});
    await expect(callWireModel('same evidence')).rejects.toThrow('personal capped');
    expect(transport.subscriptionSearch).toHaveBeenCalledTimes(1);
  });
  it('propagates caller cancellation', async () => {
    const controller = new AbortController(); controller.abort(new Error('stopped'));
    await expect(callWireModel('prompt', {signal:controller.signal})).rejects.toThrow('stopped');
    expect(transport.subscriptionSearch).not.toHaveBeenCalled();
  });
  it('cancels retrieval at the whole-call deadline', async () => {
    vi.useFakeTimers();
    transport.subscriptionSearch.mockImplementation((_prompt,{signal}) => new Promise((_,reject) => signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
    const call = callWireModel('prompt',{timeoutMs:100}).catch(error=>error);
    await vi.advanceTimersByTimeAsync(101);
    expect((await call).message).toBe('Wire grounded call deadline exceeded');
  });
  it('stores captured result URLs and rejects links merely invented in the final answer', () => {
    const raw = [
      JSON.stringify({ item: { type: 'web_search', results: [{ url: 'https://source.test/today' }] } }),
      JSON.stringify({ item: { type: 'agent_message', text: '{"sources":["https://invented.test"]}' } }),
    ].join('\n');
    const observed = observedWebUrls(raw);
    expect(observed).toEqual(['https://source.test/today']);
    expect(supportedWireSources({ sources: ['https://source.test/today', 'https://invented.test'] }, observed)).toEqual(observed);
  });
  it('never treats a public summary or generated receipt as verified market movement', () => {
    expect(verifiedWireMovement({ sources: ['https://source.test'], market_evidence: { first_receipt_id: 1, current_receipt_id: 2, market: 'total', first_value: 55.5, current_value: 52.5 } }, { date: '2026-09-05' })).toBeNull();
  });
  it('captures legacy native browser opens but not searches, unfinished opens or final prose', () => {
    const item = { type: 'web_search', query: 'https://source.test/article', action: { type: 'other' } };
    const raw = [
      { type: 'item.started', item: { ...item, query: 'https://unfinished.test' } },
      { type: 'item.completed', item },
      { type: 'item.completed', item: { ...item, query: 'site:source.test news', action: { type: 'search' } } },
      { type: 'item.completed', item: { type: 'agent_message', text: 'https://invented.test' } },
    ].map(event => JSON.stringify(event)).join('\n');
    expect(observedWebUrls(raw)).toEqual(['https://source.test/article']);
  });
  it('requires dated host receipts from the same book and market, with matching observed prices', () => {
    const base = { game_date: '2026-09-05', sport: 'americanfootball_ncaaf', game_id: 7, line_vendor: 'fanduel' };
    const receipts = [{ ...base, id: 1, seen_at: '2026-09-05T10:00:00Z', total: 55.5 }, { ...base, id: 2, seen_at: '2026-09-05T11:00:00Z', total: 52.5 }];
    const item = { market_evidence: { first_receipt_id: 1, current_receipt_id: 2, market: 'total', first_value: 55.5, current_value: 52.5 } };
    expect(verifiedWireMovement(item, { date: '2026-09-05', receipts })).toMatchObject({ first_value: 55.5, current_value: 52.5, line_vendor: 'fanduel' });
    receipts[1].line_vendor = 'draftkings';
    expect(verifiedWireMovement(item, { date: '2026-09-05', receipts })).toBeNull();
    receipts[1].line_vendor = 'fanduel'; receipts[1].seen_at = '2026-09-04T11:00:00Z';
    expect(verifiedWireMovement(item, { date: '2026-09-05', receipts })).toBeNull();
    receipts[1].seen_at = '2026-09-05T11:00:00Z'; receipts[1].total = 53.5;
    expect(verifiedWireMovement(item, { date: '2026-09-05', receipts })).toBeNull();
  });
});
