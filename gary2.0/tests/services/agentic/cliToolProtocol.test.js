// THE BRIDGES' TOOL PROTOCOL (founder, Sep 9 2026: "full research assistant,
// full Gary with tools on the bridge, just like the June system"). One
// contract for both subscription CLIs, and a parser that reads what the model
// actually sent: Sep 7-8 Luna answered with two tool_calls objects back to
// back, the first-brace-to-last-brace slice failed, and raw JSON reached Gary
// as "findings" in eight of eighteen briefings.
import { describe, it, expect } from 'vitest';
import { renderCliToolProtocol, formatCliFunctionResponses, jsonObjectsIn, parseCliToolCalls } from '../../../src/services/agentic/orchestrator/providerAdapters/cliToolProtocol.js';
import { createClaudeCliSession } from '../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js';
import { createCodexCliSession } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';

const tools = [
  { type: 'function', function: { name: 'fetch_stats', description: 'Fetch a stat token.', parameters: { type: 'object', properties: { token: { type: 'string' } }, required: ['token'] } } },
];
const call = (token) => `{"tool_calls":[{"name":"fetch_stats","arguments":{"sport":"MLB","token":"${token}"}}]}`;

describe('the CLI tool protocol', () => {
  it('finds every complete top-level JSON object, string-aware', () => {
    const text = `prose with a stray { brace\n${call('A')}\n\n${call('B')}\n{"note":"a } inside a string"}`;
    const objects = jsonObjectsIn(text);
    expect(objects).toHaveLength(3);
    expect(objects[2]).toEqual({ note: 'a } inside a string' });
    expect(jsonObjectsIn('{"unfinished": true')).toEqual([]);
  });

  it('two tool_calls objects in one reply are one call list (the Sep 7-8 leak)', () => {
    const calls = parseCliToolCalls(`${call('H2H_HISTORY')}\n\n${call('MLB_H2H')}`);
    expect(calls.map((c) => JSON.parse(c.function.arguments).token)).toEqual(['H2H_HISTORY', 'MLB_H2H']);
    expect(calls[0].id).toMatch(/^cli_call_/);
    expect(parseCliToolCalls(`${call('X')}\n${call('X')}`)).toHaveLength(1); // the same call twice is honored once
    expect(parseCliToolCalls('I will fetch these first:\n' + call('MLB_BULLPEN') + '\nThen write.')).toHaveLength(1);
  });

  it('prose, findings and an empty reply are not calls', () => {
    expect(parseCliToolCalls('The bullpen is rested.')).toBeNull();
    expect(parseCliToolCalls('{"factor":"BULLPEN","keyFinding":"rested","numbers":"3.10 ERA"}')).toBeNull();
    expect(parseCliToolCalls('{"tool_calls":[]}')).toBeNull();
    expect(parseCliToolCalls('')).toBeNull();
  });

  it('renders one protocol and one TOOL RESULTS turn for both bridges', () => {
    expect(renderCliToolProtocol(tools)).toContain('- fetch_stats: Fetch a stat token.');
    expect(formatCliFunctionResponses([{ name: 'fetch_stats', content: 'ERA 3.10' }])).toContain('### fetch_stats\nERA 3.10');
  });

  it('a Claude bridge session created with tools carries the protocol and its own lane; a brain with tools stays on the brain lane', async () => {
    const research = await createClaudeCliSession({ modelName: 'claude-sonnet-5', systemPrompt: 'You are the research assistant.', tools, breakerLane: 'research' });
    expect(research.tools).toHaveLength(1);
    expect(research._systemPrompt).toContain('## TOOLS (call protocol)');
    expect(research.breakerKey).toBe('claude-research');
    const brain = await createClaudeCliSession({ modelName: 'claude-fable-5-1', systemPrompt: 'You are Gary.', tools });
    expect(brain.tools).toHaveLength(1);
    expect(brain.breakerKey).toBe('claude');
    const bare = await createClaudeCliSession({ modelName: 'claude-fable-5-1', systemPrompt: 'You are Gary.' });
    expect(bare.tools).toBeNull();
    expect(bare._systemPrompt).toBe('You are Gary.');
    const codexBrain = await createCodexCliSession({ modelName: 'codex-gpt-6-astra', systemPrompt: 'You are Gary.', tools });
    expect(codexBrain.breakerKey).toBe('codex');
    const codexResearch = await createCodexCliSession({ modelName: 'codex-gpt-5.6-luna', systemPrompt: 'Research.', tools, breakerLane: 'research' });
    expect(codexResearch.breakerKey).toBe('codex-research');
  });
});
