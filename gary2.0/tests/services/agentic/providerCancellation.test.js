import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: mocks.spawn }));
import { createCodexCliSession, sendToCodexCliSession, codexCliOneShot, codexCliWebSearch } from '../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js';
import { _resetCliBreakers, isCliTripped } from '../../../src/services/agentic/orchestrator/providerAdapters/cliCircuitBreaker.js';
import { withRequestSignal } from '../../../src/services/agentic/orchestrator/requestCancellation.js';
import { createModelSession, sendToSessionWithRetry } from '../../../src/services/agentic/orchestrator/sessionManager.js';

let processes;
beforeEach(() => {
  vi.useFakeTimers();
  _resetCliBreakers();
  processes = [];
  mocks.spawn.mockReset().mockImplementation(() => {
    const proc = new EventEmitter();
    proc.pid = 100000 + processes.length;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
    proc.kill = vi.fn();
    processes.push(proc);
    return proc;
  });
  vi.spyOn(process, 'kill').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(1000);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  _resetCliBreakers();
});

describe('bridge cancellation', () => {
  it('kills only the cancelled invocation group, keeps a hard-kill backstop after wrapper exit, and prevents another send', async () => {
    const controller = new AbortController();
    const session = await createCodexCliSession({ signal: controller.signal });
    const task = sendToCodexCliSession(session, 'research');
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(mocks.spawn.mock.calls[0][2].detached).toBe(true);
    expect(process.kill).toHaveBeenCalledWith(-100000, 'SIGTERM');
    processes[0].emit('close', 143);
    await vi.advanceTimersByTimeAsync(1000);
    expect(process.kill).toHaveBeenCalledWith(-100000, 'SIGKILL');
    await expect(sendToCodexCliSession(session, 'late retry')).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(isCliTripped('codex')).toBe(false);
  });

  it('cancels nested search calls through the research async scope and leaves unrelated calls alone', async () => {
    const controller = new AbortController();
    const search = withRequestSignal(controller.signal, () => codexCliWebSearch('lookup'));
    const unrelated = codexCliOneShot('other game');
    expect(mocks.spawn.mock.calls[1][2].detached).toBe(false);
    const rejected = expect(search).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(process.kill).toHaveBeenCalledWith(-100000, 'SIGTERM');
    expect(process.kill).not.toHaveBeenCalledWith(-100001, 'SIGTERM');
    processes[1].stdout.emit('data', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }) + '\n');
    processes[1].emit('close', 0);
    expect(await unrelated).toMatchObject({ success: true, data: 'answer' });
  });

  it('does not reset timeout strikes when a killed wrapper later closes', async () => {
    for (let i = 0; i < 2; i++) {
      const task = codexCliOneShot('request', { timeoutMs: 100, breakerKey: 'contained' });
      await vi.advanceTimersByTimeAsync(100);
      expect(await task).toMatchObject({ success: false });
      processes[i].emit('close', 143);
    }
    expect(isCliTripped('contained')).toBe(true);
    expect(isCliTripped('codex')).toBe(false);
    expect(await codexCliOneShot('third', { breakerKey: 'contained' })).toMatchObject({ success: false });
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });
});

describe('session cancellation', () => {
  it.each(['gpt-5.5', 'anthropic-claude-haiku-4-5'])('aborts active %s requests without retrying', async (modelName) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-only');
    const controller = new AbortController();
    fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      expect(options.signal).toBe(controller.signal);
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    }));
    try {
      const session = await createModelSession({ modelName, tools: [] });
      const task = sendToSessionWithRetry(session, 'research', { signal: controller.signal });
      const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejected;
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllEnvs(); }
  });

  it('aborts a retry backoff before another network request starts', async () => {
    const controller = new AbortController();
    fetch.mockRejectedValue(new Error('fetch failed'));
    const session = await createModelSession({ modelName: 'gpt-5.5', tools: [] });
    const task = sendToSessionWithRetry(session, 'research', { signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
