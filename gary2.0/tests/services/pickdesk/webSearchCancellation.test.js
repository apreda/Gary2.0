import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({ codexCliWebSearch: vi.fn() }));
import { codexCliWebSearch } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import { withRequestSignal } from '../../../src/services/agentic/orchestrator/requestCancellation.js';
import { openaiWebSearch } from '../../../src/services/pickdesk/webSearch.js';
import { anthropicWebSearchRaw } from '../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js';

const pendingUntilAbort = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.throwIfAborted();
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
const searched = {
  stop_reason: 'end_turn',
  content: [
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'Dated source' }] },
    { type: 'text', text: 'Verified news from today.' },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('GARY_SEARCH_CACHE_OFF', '1');
  vi.stubEnv('OPENAI_API_KEY', 'test-only');
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
  vi.stubGlobal('fetch', vi.fn());
  codexCliWebSearch.mockReset().mockResolvedValue({ success: false, data: '', error: 'bridge unavailable' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('research cancellation across direct web-search API fallbacks', () => {
  it('rejects an already-cancelled request before any cache/provider work', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(openaiWebSearch('cancelled', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(anthropicWebSearchRaw('cancelled', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(codexCliWebSearch).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([1, 2])('cancels OpenAI API attempt %s without starting another attempt or Anthropic', async (attemptNumber) => {
    const controller = new AbortController();
    if (attemptNumber === 2) fetch.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'temporary error' });
    fetch.mockImplementation(pendingUntilAbort);
    // Omit the explicit option: this must also work inside research tool
    // wrappers that only inherit the async cancellation scope.
    const task = withRequestSignal(controller.signal, () => openaiWebSearch('research query'));
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(attemptNumber);
    const activeSignal = fetch.mock.calls.at(-1)[1].signal;
    controller.abort();
    await rejected;
    expect(activeSignal.aborted).toBe(true);
    expect(fetch.mock.calls.map(call => call[0])).toEqual(Array(attemptNumber).fill('https://api.openai.com/v1/responses'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an active Anthropic fallback fetch and propagates to the caller', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const controller = new AbortController();
    fetch.mockImplementation(pendingUntilAbort);
    const task = openaiWebSearch('research query', { signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    // The facade loads the last rung dynamically.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    const activeSignal = fetch.mock.calls[0][1].signal;
    controller.abort();
    await rejected;
    expect(activeSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not continue a paused Anthropic search when cancelled during response parsing', async () => {
    const controller = new AbortController();
    fetch.mockResolvedValue({ ok: true, json: async () => { controller.abort(); return { ...searched, stop_reason: 'pause_turn' }; } });
    await expect(withRequestSignal(controller.signal, () => anthropicWebSearchRaw('query'))).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves ordinary OpenAI provider-timeout retry and Anthropic fallback', async () => {
    fetch.mockImplementation((url, options) => url.includes('anthropic.com')
      ? Promise.resolve({ ok: true, json: async () => searched })
      : pendingUntilAbort(url, options));
    const task = openaiWebSearch('query');
    await vi.advanceTimersByTimeAsync(180000);
    expect(await task).toMatchObject({ success: true, data: 'Verified news from today.' });
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/responses',
      'https://api.anthropic.com/v1/messages',
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps an ordinary Anthropic provider timeout contained', async () => {
    fetch.mockImplementation(pendingUntilAbort);
    const task = anthropicWebSearchRaw('query', { timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(25);
    expect(await task).toMatchObject({ success: false, error: 'timeout' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
