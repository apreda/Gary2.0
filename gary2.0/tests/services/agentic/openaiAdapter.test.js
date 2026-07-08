// Provider-adapter tests — model bake-off harness (Jul 6 2026; Responses API port Jul 7).
//
// The pipeline speaks OpenAI shapes natively (tools as {type:'function',...},
// normalized responses as {content, toolCalls, usage}); sessionManager is the
// Gemini translation layer. These tests pin the seam: a gpt-* modelName routes
// to the OpenAI adapter (before any Gemini client/validation runs) and the
// adapter honors the exact sendToSession contract, so agentLoop needs zero
// changes and GARY_MODEL_OVERRIDE=gpt-5.5 switches the brain per run.
//
// Wire format is the RESPONSES API (/v1/responses) — gpt-5.5 rejects function
// tools + reasoning_effort on /v1/chat/completions (verified live Jul 7 2026).
// State model: previous_response_id chaining — each request sends ONLY the new
// input items; reasoning state stays server-side (required for gpt-5-family
// function calling without re-sending encrypted reasoning items).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.OPENAI_API_KEY ||= 'test-key';
process.env.GEMINI_API_KEY ||= 'test-key';

const { createGeminiSession, sendToSession, resetSessionChat } = await import(
  '../../../src/services/agentic/orchestrator/sessionManager.js'
);

const USAGE = {
  input_tokens: 100,
  input_tokens_details: { cached_tokens: 40 },
  output_tokens: 20,
  output_tokens_details: { reasoning_tokens: 5 },
  total_tokens: 120,
};

function textResponse(id, text, usage = USAGE) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id,
      status: 'completed',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
      usage,
    }),
  };
}

function functionCallResponse(id, calls, usage = USAGE) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      id,
      status: 'completed',
      output: calls.map((c, i) => ({
        id: `fc_${i}`,
        type: 'function_call',
        status: 'completed',
        call_id: c.call_id,
        name: c.name,
        arguments: c.arguments,
      })),
      usage,
    }),
  };
}

describe('provider seam: gpt-* models route to the OpenAI adapter (Responses API)', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('createGeminiSession delegates gpt-5.5 to an OpenAI session (no Gemini validation coercion)', async () => {
    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'You are Gary.', tools: [] });
    expect(session.provider).toBe('openai');
    expect(session.modelName).toBe('gpt-5.5');
    expect(session.previousResponseId).toBeNull();
  });

  it('sendToSession posts to /v1/responses with instructions, flat tools, and reasoning effort', async () => {
    fetch.mockResolvedValueOnce(textResponse('resp_1', 'INVESTIGATION COMPLETE'));
    const tools = [{ type: 'function', function: { name: 'fetch_stats', description: 'd', parameters: { type: 'object' } } }];
    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools });
    const res = await sendToSession(session, 'Pass 1 please');

    const [url, req] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(req.body);
    expect(body.model).toBe('gpt-5.5');
    expect(body.instructions).toBe('sys');
    expect(body.input).toEqual([{ role: 'user', content: 'Pass 1 please' }]);
    // Chat-completions nested tools arrive from the pipeline; the wire gets the flat Responses form.
    expect(body.tools).toEqual([{ type: 'function', name: 'fetch_stats', description: 'd', parameters: { type: 'object' } }]);
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.previous_response_id).toBeUndefined();

    expect(res.content).toBe('INVESTIGATION COMPLETE');
    expect(res.toolCalls).toBeNull();
    expect(res.finishReason).toBe('stop');
    expect(res.usage.prompt_tokens).toBe(100);
    expect(res.usage.completion_tokens).toBe(20);
    expect(res.usage.cached_tokens).toBe(40);
  });

  it('chains turns by previous_response_id and sends only new input items', async () => {
    fetch
      .mockResolvedValueOnce(textResponse('resp_1', 'first'))
      .mockResolvedValueOnce(textResponse('resp_2', 'second'));
    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools: [] });
    await sendToSession(session, 'turn one');
    await sendToSession(session, 'turn two');

    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(secondBody.previous_response_id).toBe('resp_1');
    expect(secondBody.input).toEqual([{ role: 'user', content: 'turn two' }]);
    expect(session.previousResponseId).toBe('resp_2');
  });

  it('tool round trip: {name, content} responses become function_call_output items matched FIFO by name', async () => {
    fetch
      .mockResolvedValueOnce(functionCallResponse('resp_1', [
        { call_id: 'call_a', name: 'fetch_stats', arguments: '{"token":"XG"}' },
        { call_id: 'call_b', name: 'fetch_stats', arguments: '{"token":"FORM"}' },
      ]))
      .mockResolvedValueOnce(textResponse('resp_2', 'thanks'));

    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools: [] });
    const first = await sendToSession(session, 'go');
    // Normalized to the chat-completions toolCalls shape agentLoop consumes.
    expect(first.toolCalls).toHaveLength(2);
    expect(first.toolCalls[0]).toEqual({ id: 'call_a', type: 'function', function: { name: 'fetch_stats', arguments: '{"token":"XG"}' } });
    expect(first.finishReason).toBe('tool_calls');

    await sendToSession(session, [
      { name: 'fetch_stats', content: 'XG result' },
      { name: 'fetch_stats', content: 'FORM result' },
    ], { isFunctionResponse: true });

    const secondBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(secondBody.previous_response_id).toBe('resp_1');
    expect(secondBody.input).toEqual([
      { type: 'function_call_output', call_id: 'call_a', output: 'XG result' },
      { type: 'function_call_output', call_id: 'call_b', output: 'FORM result' },
    ]);
  });

  it('text sent while calls are pending: adapter back-fills neutral outputs first (Gemini-parity tolerance)', async () => {
    // agentLoop's dedup/stall path answers duplicate tool calls with a text
    // nudge, never tool outputs. The Responses API 400s on unanswered calls
    // ("No tool output found for function call...") — verified live Jul 7 2026.
    fetch
      .mockResolvedValueOnce(functionCallResponse('resp_1', [
        { call_id: 'call_a', name: 'fetch_stats', arguments: '{"token":"XG"}' },
        { call_id: 'call_b', name: 'fetch_stats', arguments: '{"token":"FORM"}' },
      ]))
      .mockResolvedValueOnce(textResponse('resp_2', 'proceeding'));

    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools: [] });
    await sendToSession(session, 'go');
    await sendToSession(session, 'All stats already gathered — proceed with your synthesis.');

    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.input).toEqual([
      { type: 'function_call_output', call_id: 'call_a', output: 'No output for this call — superseded; follow the next user message.' },
      { type: 'function_call_output', call_id: 'call_b', output: 'No output for this call — superseded; follow the next user message.' },
      { role: 'user', content: 'All stats already gathered — proceed with your synthesis.' },
    ]);
    // Queue fully drained — nothing left to double-answer later.
    expect(session._pendingToolCalls).toEqual([]);
  });

  it('partial function responses: the deduped remainder is back-filled in the same request', async () => {
    // agentLoop dedups duplicate stat requests BEFORE executing, so a turn of
    // 3 calls can come back with only 2 outputs. Chat Completions tolerated the
    // gap; the Responses API 400s ("No tool output found for function call") —
    // verified live Jul 7 2026, run #3. Every send must answer every pending call.
    fetch
      .mockResolvedValueOnce(functionCallResponse('resp_1', [
        { call_id: 'call_a', name: 'fetch_stats', arguments: '{"token":"XG"}' },
        { call_id: 'call_b', name: 'fetch_stats', arguments: '{"token":"XG"}' },
        { call_id: 'call_c', name: 'fetch_narrative_context', arguments: '{}' },
      ]))
      .mockResolvedValueOnce(textResponse('resp_2', 'ok'));

    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools: [] });
    await sendToSession(session, 'go');
    // Loop executed only two of the three (one deduped away).
    await sendToSession(session, [
      { name: 'fetch_stats', content: 'XG result' },
      { name: 'fetch_narrative_context', content: 'context result' },
    ], { isFunctionResponse: true });

    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.input).toEqual([
      { type: 'function_call_output', call_id: 'call_a', output: 'XG result' },
      { type: 'function_call_output', call_id: 'call_c', output: 'context result' },
      { type: 'function_call_output', call_id: 'call_b', output: 'No output for this call — superseded; follow the next user message.' },
    ]);
    expect(session._pendingToolCalls).toEqual([]);
  });

  it('flags 429s as quota errors for the loop cascade', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }), text: async () => 'rate limited' });
    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools: [] });
    await expect(sendToSession(session, 'go')).rejects.toMatchObject({ isQuotaError: true });
  });

  it('resetSessionChat drops the chain and re-seeds retry context as the next turn preface', async () => {
    fetch.mockResolvedValueOnce(textResponse('resp_1', 'hi'));
    const session = await createGeminiSession({ modelName: 'gpt-5.5', systemPrompt: 'sys', tools: [] });
    await sendToSession(session, 'hello');
    expect(session.previousResponseId).toBe('resp_1');

    resetSessionChat(session, [{ role: 'user', parts: [{ text: 'seeded findings' }] }]);
    expect(session.previousResponseId).toBeNull();

    fetch.mockResolvedValueOnce(textResponse('resp_9', 'fresh'));
    await sendToSession(session, 'continue');
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.previous_response_id).toBeUndefined();
    expect(body.input).toEqual([
      { role: 'user', content: 'seeded findings' },
      { role: 'user', content: 'continue' },
    ]);
  });
});
