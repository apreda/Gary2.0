import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicWebSearchRaw } from '../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js';
import { observedWebUrls } from '../../../src/services/insights/wireModel.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Native search source receipts', () => {
  it('preserves result URLs across pause continuations without trusting generated links', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'unit-test-only');
    const result = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://publisher.test/story' }] };
    const replies = [
      { stop_reason: 'pause_turn', content: [result] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: '[{"sources":["https://invented.test"]}]' }] },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => replies.shift() })));
    const response = await anthropicWebSearchRaw('Find grounded news');
    expect(response.success).toBe(true);
    expect(response.searchCount).toBe(1);
    expect(response.raw).toEqual([result]);
    expect(observedWebUrls(response.raw)).toEqual(['https://publisher.test/story']);
  });
});
