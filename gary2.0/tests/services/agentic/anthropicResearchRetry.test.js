import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicApiSession, resetAnthropicApiSessionChat, sendToAnthropicApiSession } from '../../../src/services/agentic/orchestrator/providerAdapters/anthropicApiSession.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('Metered research preserves complete context on retry', () => {
  it('retries seeded history and native tool results byte for byte after a failed request', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'unit-test-only');
    const bodies = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, request) => {
      bodies.push(JSON.parse(request.body));
      if (bodies.length === 2) return { ok: false, status: 503, json: async () => ({ error: { message: 'temporary failure' } }) };
      return { ok: true, json: async () => ({ content: bodies.length === 1
        ? [{ type: 'text', text: 'Keep these findings.' }, { type: 'tool_use', id: 'tool-original', name: 'fetch_stats', input: { token: 'MLB_H2H' } }]
        : [{ type: 'text', text: 'Completed research.' }], usage: {}, stop_reason: 'end_turn' }) };
    }));
    const s = await createAnthropicApiSession({ systemPrompt: 'Exact June prompt', tools: [] });
    resetAnthropicApiSessionChat(s, [{ role: 'user', parts: [{ text: 'Full subscription history including final tail.' }] }]);
    await sendToAnthropicApiSession(s, 'Pending CLI results including exact final tail.');
    const results = [{ name: 'fetch_stats', content: 'Complete dated response, including final bytes.' }];
    await expect(sendToAnthropicApiSession(s, results, { isFunctionResponse: true })).rejects.toThrow('503');
    await sendToAnthropicApiSession(s, results, { isFunctionResponse: true });
    expect(bodies[2]).toEqual(bodies[1]);
    expect(bodies[2].messages).toHaveLength(3);
    expect(bodies[2].messages[0].content.map(b => b.text)).toEqual([
      'Full subscription history including final tail.', 'Pending CLI results including exact final tail.',
    ]);
    expect(bodies[2].messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tool-original', content: results[0].content });
  });
});
