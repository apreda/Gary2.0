import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: mocks.spawn }));
import { createCodexCliSession, sendToCodexCliSession, codexCliOneShot, codexCliWebSearch } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import { _resetCliBreakers } from '../../../src/services/agentic/orchestrator/providerAdapters/cliCircuitBreaker.js';

let proc;
const line = event => JSON.stringify(event) + '\n';
const answer = text => ({ type: 'item.completed', item: { id: 'item-0', type: 'agent_message', text } });
const completed = { type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 80, output_tokens: 12 } };
function close(stream, code = 0) { proc.stdout.emit('data', stream); proc.emit('close', code); }
beforeEach(() => {
  _resetCliBreakers();
  mocks.spawn.mockReset().mockImplementation(() => {
    proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
    proc.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() }); proc.kill = vi.fn();
    return proc;
  });
});
afterEach(() => { vi.restoreAllMocks(); _resetCliBreakers(); });

describe('Codex bridge completion receipts and full output', () => {
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
    const stream = line(answer(first)) + line(answer(second)) + line(completed);
    const pending = codexCliWebSearch('Read the current Seattle reports.');
    close(stream);
    expect(await pending).toMatchObject({ success: true, data: `${first}\n\n${second}`.trim(), raw: stream });
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
