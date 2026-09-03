// THE RESEARCH ASSISTANT ON THE SUB (founder, Sep 3 2026: "this feels like a
// no brainer to go from .12 a game to free"). The Codex bridge has no
// function calling, so a session created WITH tools carries the catalog as a
// JSON call protocol; a {"tool_calls":[…]} reply comes back in the same
// chat-completions shape the API adapters return, and the caller's function
// responses ride back as one TOOL RESULTS turn. Brains stay tool-less. The
// researcher runs Luna on the sub first and falls back to the Aug 18 Haiku
// researcher if the bridge fails, so a capped sub costs 12 cents, not a pick.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderCodexToolProtocol, formatCodexFunctionResponses, parseCodexToolCalls, createCodexCliSession } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import { GAME_RESEARCH_MODEL, GAME_RESEARCH_FALLBACK_MODEL } from '../../../src/services/agentic/orchestrator/orchestratorConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(__dirname, '../../../src/services/agentic', rel), 'utf8');

const tools = [
  { type: 'function', function: { name: 'fetch_stats', description: 'Fetch a stat token for both teams.', parameters: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] } } },
  { type: 'function', function: { name: 'fetch_narrative_context', description: 'Search for game context.', parameters: { type: 'object', properties: { query: { type: 'string' } } } } },
];

describe('the Codex bridge in tools mode', () => {
  it('renders the catalog as a strict JSON call protocol', () => {
    const p = renderCodexToolProtocol(tools);
    expect(p).toContain('{"tool_calls":[{"name":"fetch_stats","arguments":{"token":"EXAMPLE_TOKEN"}}]}');
    expect(p).toContain('- fetch_stats: Fetch a stat token for both teams.');
    expect(p).toContain('"required":["token"]');
    expect(p).toContain('no code fence');
  });

  it('parses a tool_calls reply into the chat-completions shape, fenced or bare', () => {
    const bare = '{"tool_calls":[{"name":"fetch_stats","arguments":{"token":"MLB_BULLPEN"}},{"name":"fetch_narrative_context","arguments":{"query":"Astros news"}}]}';
    const calls = parseCodexToolCalls(bare);
    expect(calls).toHaveLength(2);
    expect(calls[0].type).toBe('function');
    expect(calls[0].function.name).toBe('fetch_stats');
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ token: 'MLB_BULLPEN' });
    expect(calls[1].function.name).toBe('fetch_narrative_context');
    expect(parseCodexToolCalls('```json\n' + bare + '\n```')).toHaveLength(2);
    // "args" is tolerated; a nameless call is dropped; prose is not a call.
    expect(parseCodexToolCalls('{"tool_calls":[{"name":"fetch_stats","args":{"token":"X"}},{"arguments":{}}]}')).toHaveLength(1);
    expect(parseCodexToolCalls('The bullpen is rested; here are my findings.')).toBeNull();
    expect(parseCodexToolCalls('{"factor":"BULLPEN","keyFinding":"rested"}')).toBeNull();
    expect(parseCodexToolCalls('')).toBeNull();
  });

  it('formats the function responses as one TOOL RESULTS turn', () => {
    const t = formatCodexFunctionResponses([{ name: 'fetch_stats', content: '{"ERA":3.10}' }, { name: 'fetch_narrative_context', content: { hits: 2 } }]);
    expect(t.startsWith('TOOL RESULTS\n\n### fetch_stats\n{"ERA":3.10}\n\n### fetch_narrative_context\n{"hits":2}')).toBe(true);
    expect(t).toContain('Continue: reply with another JSON tool_calls object if you need more, or write your answer as text.');
  });

  it('a session created with tools carries the protocol; one without stays tool-less', async () => {
    const withTools = await createCodexCliSession({ modelName: 'codex-gpt-5.6-luna', systemPrompt: 'You are the research assistant.', tools });
    expect(withTools.tools).toHaveLength(2);
    expect(withTools._systemPrompt).toContain('You are the research assistant.');
    expect(withTools._systemPrompt).toContain('## TOOLS (call protocol)');
    const brain = await createCodexCliSession({ modelName: 'codex-gpt-5.6-sol', systemPrompt: 'You are Gary.' });
    expect(brain.tools).toBeNull();
    expect(brain._systemPrompt).toBe('You are Gary.');
  });

  it('the adapter routes tool sessions through their own breaker lane and returns toolCalls', () => {
    const c = src('orchestrator/providerAdapters/codexCliSession.js');
    expect(c).toContain("session.tools ? 'codex-research' : 'codex'");
    expect(c).toContain('const toolCalls = session.tools ? parseCodexToolCalls(content) : null;');
    expect(c).toContain("finishReason: toolCalls ? 'tool_calls' : 'stop'");
    expect(c).toContain('? formatCodexFunctionResponses(message)');
  });

  it('the researcher runs Haiku first and falls back to Luna on the sub', () => {
    expect(GAME_RESEARCH_MODEL).toBe('anthropic-claude-haiku-4-5');
    expect(GAME_RESEARCH_FALLBACK_MODEL).toBe('codex-gpt-5.6-luna');
    const loop = src('orchestrator/agentLoop.js');
    expect(loop).toContain('const RESEARCH_MODELS = [GAME_RESEARCH_MODEL, GAME_RESEARCH_FALLBACK_MODEL]');
    expect(loop).toContain('for (const researchModel of RESEARCH_MODELS) {');
    expect(loop).toContain('_costTracker: costTracker, researchModel }');
    expect(loop).toContain("trying the next researcher");
    expect(loop).toContain('researchModel: _researchModelUsed,');
    const rb = src('orchestrator/researchBriefing.js');
    expect(rb).toContain('modelName: options.researchModel || GAME_RESEARCH_MODEL,');
    expect(rb).toContain('modelName: researchModel || GAME_RESEARCH_MODEL,');
    const rates = src('orchestrator/costTracker.js');
    expect(rates).toContain("'codex-gpt-5.6-luna':       { input: 0, output: 0 }");
  });
});
