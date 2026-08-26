// The disk search cache would short-circuit these request-shape pins
// (its own first successful run poisons the next) — off for tests.
process.env.GARY_SEARCH_CACHE_OFF = '1';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openaiWebSearch } from '../../../src/services/pickdesk/webSearch.js';

const RESPONSES_OK = {
  output: [
    { type: 'reasoning' },
    { type: 'message', content: [{ type: 'output_text', text: 'Fresh news, dated today.' }] },
  ],
};

describe('openaiWebSearch (de-Gemini step one, Jul 26 2026)', () => {
  const realFetch = global.fetch;
  const realKey = process.env.OPENAI_API_KEY;

  beforeEach(() => { process.env.OPENAI_API_KEY = 'test-key'; });
  afterEach(() => { global.fetch = realFetch; process.env.OPENAI_API_KEY = realKey; });

  it('sends the freshness protocol + query to the Responses API with the web_search tool', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => RESPONSES_OK });
    const r = await openaiWebSearch('Cubs at Pirates TODAY breaking news');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(opts.body);
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.input).toContain('<date_anchor>');
    expect(body.input).toContain('GROUND TRUTH HIERARCHY');
    expect(body.input).toContain('Cubs at Pirates TODAY breaking news');
    expect(body.input).not.toContain('Google Search');
    expect(r).toMatchObject({ success: true, data: 'Fresh news, dated today.' });
  });

  it('degrades to empty data after a failed retry — never throws', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const r = await openaiWebSearch('anything');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(r.success).toBe(false);
    expect(r.data).toBe('');
  });

  it('missing API key returns a contained failure', async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await openaiWebSearch('anything');
    expect(r.success).toBe(false);
    // Aug 26: a missing OpenAI key now falls through to the funded Anthropic
    // rung (every failure mode reaches it) — with both keys absent in the
    // test env, the contained failure names the LAST rung tried.
    expect(r.error).toContain('ANTHROPIC_API_KEY');
  });
});
