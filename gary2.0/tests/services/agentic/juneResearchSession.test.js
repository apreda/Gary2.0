import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), direct: vi.fn(), reset: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: mocks.create,
  sendToSessionWithRetry: mocks.send,
  sendToSession: mocks.direct,
  resetSessionChat: mocks.reset,
}));

let createGeminiSession, sendToSessionWithRetry;
const quota = () => Object.assign(new Error('weekly usage limit'), { isQuotaError: true });
const options = { modelName: 'gemini-3-flash-preview', systemPrompt: 'Exact June instructions', thinkingLevel: 'high', tools: [{ name: 'fetch_stats' }] };
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.create.mockImplementation(async value => ({ ...value, provider: 'fixture' }));
  ({ createGeminiSession, sendToSessionWithRetry } = await import('../../../src/services/agentic/mlbJuneEra/sessionManager.js'));
});

describe('June researcher subscription failover', () => {
  it('maps June literal to Sonnet, preserving the original prompt, tools and high effort', async () => {
    mocks.send.mockResolvedValue({ content: 'Ready', toolCalls: null });
    const s = await createGeminiSession(options);
    await sendToSessionWithRetry(s, 'Exact scout report');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      modelName: 'claude-sonnet-5', systemPrompt: options.systemPrompt,
      tools: options.tools, researchEffort: 'high', breakerLane: 'research',
    }));
    expect(mocks.send.mock.calls[0][1]).toBe('Exact scout report');
  });

  it('moves to Luna on a first-turn quota failure without trying an API model', async () => {
    mocks.send.mockRejectedValueOnce(quota()).mockResolvedValueOnce({ content: 'Ready on Luna' });
    const s = await createGeminiSession(options);
    expect(await sendToSessionWithRetry(s, 'Original report')).toEqual({ content: 'Ready on Luna' });
    expect(mocks.create.mock.calls.map(([o]) => o.modelName)).toEqual(['claude-sonnet-5', 'codex-gpt-5.6-luna']);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('preserves exact earlier findings and pending tool results when quota ends mid-investigation', async () => {
    const call = '{"tool_calls":[{"name":"fetch_stats","arguments":{"token":"MLB_H2H"}}]}';
    mocks.send.mockResolvedValueOnce({ content: 'Ready' })
      .mockResolvedValueOnce({ content: null, transcriptText: call, toolCalls: [{ function: { name: 'fetch_stats', arguments: '{"token":"MLB_H2H"}' } }] })
      .mockRejectedValueOnce(quota()).mockResolvedValueOnce({ content: '{"factor":"Head to head","numbers":"3-2"}' });
    const s = await createGeminiSession(options);
    await sendToSessionWithRetry(s, 'Exact scout report');
    await sendToSessionWithRetry(s, 'Investigate head to head.');
    const result = [{ name: 'fetch_stats', content: 'Actual dated results: 3-2' }];
    await sendToSessionWithRetry(s, result, { isFunctionResponse: true });
    const history = mocks.reset.mock.calls[0][1];
    expect(history.map(h => h.parts[0].text)).toEqual([
      'USER:\nExact scout report', 'ASSISTANT:\nReady',
      'USER:\nInvestigate head to head.', `ASSISTANT:\n${call}`,
    ]);
    expect(mocks.send.mock.calls.at(-1)[1]).toBe(result);
    expect(mocks.send.mock.calls.at(-1)[2].isFunctionResponse).toBe(true);
    expect(s.modelName).toBe('codex-gpt-5.6-luna');
  });

  it('fails closed only after both subscriptions and paid research fail, without retrying capped routes', async () => {
    mocks.send.mockRejectedValue(quota());
    const s = await createGeminiSession(options);
    await expect(sendToSessionWithRetry(s, 'report')).rejects.toMatchObject({ code: 'JUNE_RESEARCH_UNAVAILABLE' });
    const another = await createGeminiSession(options);
    await expect(sendToSessionWithRetry(another, 'report')).rejects.toMatchObject({ code: 'JUNE_RESEARCH_UNAVAILABLE' });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.create.mock.calls.map(([o]) => o.modelName)).toEqual(['claude-sonnet-5', 'codex-gpt-5.6-luna', 'anthropic-claude-haiku-4-5']);
  });

  it('uses paid research only after both subscriptions fail and preserves pending CLI tool results', async () => {
    mocks.send.mockResolvedValueOnce({ content: 'Original findings, verbatim.' })
      .mockRejectedValueOnce(quota()).mockRejectedValueOnce(quota())
      .mockResolvedValueOnce({ content: 'Completed through paid research.' });
    const session = await createGeminiSession(options);
    await sendToSessionWithRetry(session, 'Complete initial scout report');
    const results = [{ name: 'fetch_stats', content: 'Exact final tool result, including its tail.' }];
    await sendToSessionWithRetry(session, results, { isFunctionResponse: true });
    expect(mocks.create.mock.calls.map(([o]) => o.modelName)).toEqual(['claude-sonnet-5', 'codex-gpt-5.6-luna', 'anthropic-claude-haiku-4-5']);
    const paid = mocks.send.mock.calls.at(-1);
    expect(paid[1]).toContain('Exact final tool result, including its tail.');
    expect(paid[1]).not.toContain('reply with another JSON tool_calls');
    expect(paid[2].isFunctionResponse).toBe(false);
    expect(mocks.reset.mock.calls.at(-1)[1].map(h => h.parts[0].text).join('\n')).toContain('Original findings, verbatim.');
    mocks.send.mockResolvedValueOnce({ content: 'Next native API result' });
    await sendToSessionWithRetry(session, results, { isFunctionResponse: true });
    expect(mocks.send.mock.calls.at(-1)[1]).toBe(results);
    expect(mocks.send.mock.calls.at(-1)[2].isFunctionResponse).toBe(true);
  });

  it('does not fail over an aborted game', async () => {
    const controller = new AbortController();
    const s = await createGeminiSession({ ...options, signal: controller.signal });
    mocks.send.mockImplementation(async () => { controller.abort(); throw controller.signal.reason; });
    await expect(sendToSessionWithRetry(s, 'report')).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the configured brain out of the research wrapper', async () => {
    const brain = { modelName: 'codex-gpt-5.6-sol', systemPrompt: 'Exact June brain' };
    const s = await createGeminiSession(brain);
    expect(s.provider).toBe('fixture');
    expect(mocks.create).toHaveBeenCalledWith(brain);
  });
});
