import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const bridge = vi.hoisted(() => ({ codexCliWebSearch: vi.fn() }));
const api = vi.hoisted(() => ({ anthropicWebSearchRaw: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => bridge);
vi.mock('../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js', () => api);
const { callWireModel, observedWebUrls, supportedWireSources, verifiedWireMovement } = await import('../../../src/services/insights/wireModel.js');
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());
describe('Wire existing subscription transport', () => {
  it('uses Codex grounded search and carries provider identity with the original answer', async () => {
    bridge.codexCliWebSearch.mockResolvedValue({ success: true, data: '[{"kind":"moment"}]' });
    expect(await callWireModel('original grounded prompt', { model: 'codex-gpt-6-astra' })).toMatchObject({ text: '[{"kind":"moment"}]', provider: 'codex-gpt-6-astra' });
    expect(bridge.codexCliWebSearch).toHaveBeenCalledWith('original grounded prompt', expect.objectContaining({ model: 'gpt-6-astra' }));
    expect(api.anthropicWebSearchRaw).not.toHaveBeenCalled();
  });
  it('retains the native search fallback on a normal bridge failure', async () => {
    bridge.codexCliWebSearch.mockResolvedValue({ success: false, error: 'unavailable' });
    api.anthropicWebSearchRaw.mockResolvedValue({ success: true, data: '[]' });
    expect(await callWireModel('same evidence')).toMatchObject({ text: '[]', provider: 'anthropic-web-search' });
    expect(api.anthropicWebSearchRaw).toHaveBeenCalledWith('same evidence', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('never starts a second transport after cancellation', async () => {
    const controller = new AbortController();
    bridge.codexCliWebSearch.mockImplementation(async () => { controller.abort(new Error('stopped')); return { success: false }; });
    await expect(callWireModel('prompt', { signal: controller.signal })).rejects.toThrow('stopped');
    expect(api.anthropicWebSearchRaw).not.toHaveBeenCalled();
  });
  it('cancels the native fallback at the whole-call deadline instead of leaving it running', async () => {
    vi.useFakeTimers();
    bridge.codexCliWebSearch.mockResolvedValue({ success: false });
    api.anthropicWebSearchRaw.mockImplementation((_prompt, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
    const call = callWireModel('prompt', { timeoutMs: 100 }).catch(error => error);
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
