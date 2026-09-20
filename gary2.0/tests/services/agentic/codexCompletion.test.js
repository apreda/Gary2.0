import { homedir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: mocks.spawn }));
import { createCodexCliSession, sendToCodexCliSession, codexCliOneShot, codexCliWebSearch, codexCliAgentRun } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import { _resetCliBreakers } from '../../../src/services/agentic/orchestrator/providerAdapters/cliCircuitBreaker.js';
import { _resetCodexHomeCaps } from '../../../src/services/agentic/orchestrator/providerAdapters/codexHomes.js';
import { runGameBrainOnAccounts } from '../../../src/services/agentic/orchestrator/gameBrainRouting.js';
import { bdlLocalRequestsPerMinute } from '../../../src/services/bdlRequestGate.js';

let proc;
const line = event => JSON.stringify(event) + '\n';
const answer = text => ({ type: 'item.completed', item: { id: 'item-0', type: 'agent_message', text } });
const completed = { type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 80, output_tokens: 12 } };
function close(stream, code = 0) { proc.stdout.emit('data', stream); proc.emit('close', code); }
beforeEach(() => {
  _resetCliBreakers();
  _resetCodexHomeCaps();
  mocks.spawn.mockReset().mockImplementation(() => {
    proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
    proc.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() }); proc.kill = vi.fn();
    return proc;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); _resetCliBreakers(); _resetCodexHomeCaps(); });

describe('Codex bridge completion receipts and full output', () => {
  it.each(['in_progress', 'failed'])('rejects a finished research answer with an %s MCP call', async status => {
    const pending = codexCliAgentRun({ prompt: 'Read stats', mcp: {serverPath:'/server.js',contextPath:'/ctx',logPath:'/log'} });
    const rejected = expect(pending).rejects.toThrow('MCP evidence delivery failed: fetch_stats');
    close(line({ type: 'item.completed', item: {id:'tool-1',type:'mcp_tool_call',server:'gary',tool:'fetch_stats',status} })
      + line(answer('Here is a plausible writeup without the data.')) + line(completed));
    await rejected;
  });

  it('accepts a retrieved source gap when the native tool completed successfully', async () => {
    const pending = codexCliAgentRun({ prompt: 'Read stats', mcp: {serverPath:'/server.js',contextPath:'/ctx',logPath:'/log'} });
    close(line({type:'item.started',item:{id:'tool-1',type:'mcp_tool_call',server:'gary',tool:'fetch_stats',status:'in_progress'}})
      + line({type:'item.completed',item:{id:'tool-1',type:'mcp_tool_call',server:'gary',tool:'fetch_stats',status:'completed',result:{content:[{type:'text',text:'2026 charting unavailable'}]}}})
      + line(answer('Charting unavailable in the current provider.')) + line(completed));
    await expect(pending).resolves.toMatchObject({text:'Charting unavailable in the current provider.'});
  });

  it('limits unattended MCP access to requested sports retrieval tools marked read-only', async () => {
    vi.stubEnv('GARY_BDL_LOCAL_REQUESTS_PER_MINUTE', '120');
    const pending = codexCliAgentRun({ prompt: 'Read offensive data', mcp: {
      serverPath: '/server.js', contextPath: '/context.json', logPath: '/calls.log',
      tools: ['fetch_stats', 'unrecognized_write_tool'],
    } });
    close(line(answer('Source data received.')) + line(completed));
    await pending;
    const args = mocks.spawn.mock.calls[0][1];
    expect(args).toContain('mcp_servers.gary.default_tools_approval_mode="writes"');
    expect(args).toContain('mcp_servers.gary.enabled_tools=["fetch_stats"]');
    const forwardedNames = JSON.parse(args.find(arg => arg.startsWith('mcp_servers.gary.env_vars=')).split('=')[1]);
    const parentEnv = mocks.spawn.mock.calls[0][2].env;
    const toolEnv = Object.fromEntries(forwardedNames.map(name => [name, parentEnv[name]]));
    expect(bdlLocalRequestsPerMinute(toolEnv)).toBe(120);
    expect(forwardedNames).toEqual(['BALLDONTLIE_API_KEY','VITE_BALLDONTLIE_API_KEY','NEXT_PUBLIC_BALLDONTLIE_API_KEY','TMPDIR',
      'GARY_BDL_LOCAL_REQUESTS_PER_MINUTE','GARY_BDL_RATE_GATE_DIR','GARY_BDL_SHARED_CACHE_DIR']);
    expect(forwardedNames).not.toContain('GARY_BDL_RATE_GATE_DISABLED');
    expect(args).toContain('read-only');
    expect(args).toContain('features.shell_tool=false');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });

  it('blocks the personal login for ordinary calls even when a caller explicitly prefers it', async () => {
    const personal = join(homedir(), '.codex');
    const session = await createCodexCliSession({ modelName: 'codex-gpt-5.6-luna', codexHomes: [personal], preferredCodexHome: personal });
    await expect(sendToCodexCliSession(session, 'Background task')).rejects.toThrow('No permitted Codex subscription login');
    expect(mocks.spawn).not.toHaveBeenCalled();
    const result = await codexCliOneShot('Content task', { codexHomes: [personal] });
    expect(result.success).toBe(false);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('strips metered provider credentials from the subscription process environment', async () => {
    vi.stubEnv('OPENAI_API_KEY','fixture-openai'); vi.stubEnv('CODEX_API_KEY','fixture-codex'); vi.stubEnv('ANTHROPIC_API_KEY','fixture-anthropic');
    try {
      const pending = codexCliOneShot('Return OK'); close(line(answer('OK')) + line(completed)); await pending;
      const env = mocks.spawn.mock.calls[0][2].env;
      expect(env.OPENAI_API_KEY).toBeUndefined(); expect(env.CODEX_API_KEY).toBeUndefined(); expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    } finally { vi.unstubAllEnvs(); }
  });

  it('permits the explicitly authorized final game route to use the personal login', async () => {
    const personal = join(homedir(), '.codex');
    const session = await createCodexCliSession({ modelName: 'codex-gpt-6-astra', codexHomes: [personal], allowPersonalAccount: true });
    const pending = sendToCodexCliSession(session, 'Full game evidence');
    close(line(answer('OK')) + line(completed));
    await expect(pending).resolves.toMatchObject({ content: 'OK' });
    expect(mocks.spawn.mock.calls[0][2].env.CODEX_HOME).toBe(personal);
  });

  it('restarts a game on Pro with the entire desk when Plus caps during a resumed turn', async () => {
    const bodies = [];
    mocks.spawn.mockImplementation((_bin, args, options) => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      const home = options.env.CODEX_HOME;
      let body = '';
      child.stdin = Object.assign(new EventEmitter(), {
        write: text => { body += text; },
        end: () => queueMicrotask(() => {
          bodies.push({ home, args, body });
          const stream = home === '/plus' && args.includes('resume')
            ? line({ type: 'turn.failed', error: { message: 'usage limit reached' } })
            : line({ type: 'thread.started', thread_id: home === '/plus' ? 'plus-thread' : 'pro-thread' }) + line(answer('OK')) + line(completed);
          child.stdout.emit('data', stream); child.emit('close', 0);
        }),
      });
      return child;
    });
    const fullDesk = 'Verified pitcher, lineup and market evidence. '.repeat(1000);
    const result = await runGameBrainOnAccounts('codex-gpt-6-astra', async options => {
      const session = await createCodexCliSession({ ...options, modelName: 'codex-gpt-6-astra', systemPrompt: 'Original game contract' });
      await sendToCodexCliSession(session, fullDesk);
      await sendToCodexCliSession(session, 'Original follow-up tool results');
      return { pick: 'Completed fixture ticket' };
    }, { homes: ['/plus', '/pro'] });
    expect(result.pick).toBe('Completed fixture ticket');
    expect(bodies.map(b => b.home)).toEqual(['/plus', '/plus', '/pro', '/pro']);
    expect(bodies[1].args).toContain('plus-thread');
    expect(bodies[2].args).not.toContain('resume');
    expect(bodies[2].body).toBe(`Original game contract\n\n${fullDesk}`);
    expect(bodies[3].args).toContain('pro-thread');
    expect(bodies[2].args).toContain('model_reasoning_effort="xhigh"');
  });

  it('rejects the captured progress-plus-clarification search answer despite a completed turn', async () => {
    const progress = 'I’ll search broadly across official team/NFL sources and current reporting for September 1–8, 2026, then organize every relevant item without betting statistics.';
    const clarification = 'What would you like me to research or do? Please provide the topic, team, company, file, or specific task.';
    const stream = line(answer(progress)) + line({ type: 'item.completed', item: { type: 'web_search', query: 'Seattle Seahawks September 2026 news' } })
      + line(answer(clarification)) + line(completed);
    const pending = codexCliWebSearch('Seattle Seahawks NFL news September 1 to September 8, 2026.');
    close(stream);
    expect(await pending).toMatchObject({ success: false, data: '', raw: stream, error: expect.stringMatching(/clarification/i) });
  });

  it('retains every legitimate completed search message and the full transcript', async () => {
    const first = 'Seattle reported the roster move on September 8. [Official report](https://www.seahawks.com/news/report)';
    const second = 'The coach said, “What would you like me to research or do?” in the recorded interview. The current report contains the full context. '.repeat(100);
    const stream = line({type:'item.completed',item:{type:'web_search',query:'https://www.seahawks.com/news/report',action:{type:'other'}}}) + line(answer(first)) + line(answer(second)) + line(completed);
    const pending = codexCliWebSearch('Read the current Seattle reports.');
    close(stream);
    expect(await pending).toMatchObject({ success: true, data: `${first}\n\n${second}`.trim(), raw: stream });
  });

  it.each([undefined, true, false])('requires web retrieval by default while allowing supplied-data tasks: %s', async requireRetrieval => {
    const text = '[{"kind":"moment","headline":"Utah wins 33-0","sources":[]}]';
    const stream = line(answer(text)) + line(completed);
    const pending = codexCliWebSearch('Write from these supplied verified recap notes.', { requireRetrieval });
    close(stream);
    const result = await pending;
    expect(result.success).toBe(requireRetrieval === false);
    expect(result.raw).toBe(stream);
    if (requireRetrieval === false) expect(result.data).toBe(text);
    else expect(result.error).toContain('no completed retrieval');
  });

  it.each(['', '{"type":"turn.complet'])('rejects a zero-exit stream without a complete turn receipt (%j)', async tail => {
    const session = await createCodexCliSession({ modelName: 'codex-gpt-6-astra' });
    const pending = sendToCodexCliSession(session, 'Original NFL desk');
    const rejected = expect(pending).rejects.toThrow(/complet/i);
    close(line({ type: 'thread.started', thread_id: 'thread-1' }) + line(answer('A parseable partial answer.')) + tail);
    await rejected;
    expect(session.codexThreadId).toBeNull();
  });

  it.each([codexCliOneShot, codexCliWebSearch])('does not expose incomplete one-shot/search output as successful evidence', async request => {
    const pending = request('Original factual question');
    close(line(answer('A partial factual answer.')));
    expect(await pending).toMatchObject({ success: false, data: '', error: expect.stringMatching(/complet/i) });
  });

  it.each([completed, { type: 'turn.completed' }])('preserves valid completed initial and resumed turns with optional usage', async receipt => {
    const session = await createCodexCliSession({ modelName: 'codex-gpt-6-astra' });
    const first = sendToCodexCliSession(session, 'Initial question');
    close(line({ type: 'thread.started', thread_id: 'thread-1' }) + line({ type: 'turn.started' }) + line(answer('Original answer.')) + line(receipt));
    expect(await first).toMatchObject({ content: 'Original answer.', finishReason: 'stop' });
    const resumed = sendToCodexCliSession(session, 'Continue');
    close(line({ type: 'turn.started' }) + line(answer('Continued answer.')) + line(receipt));
    expect(await resumed).toMatchObject({ content: 'Continued answer.', finishReason: 'stop' });
    expect(mocks.spawn.mock.calls[1][1]).toContain('thread-1');
    expect(session.codexThreadId).toBe('thread-1');
  });

  it.each([
    { type: 'turn.failed', error: { message: 'Output token budget exhausted' } },
    { type: 'error', message: 'Turn interrupted' },
  ])('preserves explicit failure even when answer text exists (%j)', async failure => {
    const session = await createCodexCliSession({ modelName: 'codex-gpt-6-astra' });
    const pending = sendToCodexCliSession(session, 'Original question');
    const rejected = expect(pending).rejects.toThrow(failure.error?.message || failure.message);
    close(line(answer('Partial answer.')) + line(failure));
    await rejected;
  });

  it('preserves a full long answer when the pipe splits a UTF-8 character between chunks', async () => {
    const session = await createCodexCliSession({ modelName: 'codex-gpt-6-astra' });
    const text = 'Gary’s original NFL read — exact text. '.repeat(2000);
    const pending = sendToCodexCliSession(session, 'Original question');
    const bytes = Buffer.from(line(answer(text)) + line(completed));
    const split = bytes.indexOf(Buffer.from('’')) + 1;
    proc.stdout.emit('data', bytes.subarray(0, split));
    close(bytes.subarray(split));
    expect(await pending).toMatchObject({ content: text, finishReason: 'stop' });
  });
});
