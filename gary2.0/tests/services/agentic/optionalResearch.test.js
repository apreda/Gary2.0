import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { researchBudgetMs, runOptionalResearch, runResearchOnce } from '../../../src/services/agentic/orchestrator/optionalResearch.js';
import { requestSignal } from '../../../src/services/agentic/orchestrator/requestCancellation.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('optional research containment', () => {
  it('shares one budget across model failures, cancels active work and returns original-desk fallback', async () => {
    const stopped = vi.fn();
    const build = vi.fn(async (model, signal) => {
      expect(requestSignal()).toBe(signal);
      if (model === 'first') {
        await new Promise(resolve => setTimeout(resolve, 60));
        throw new Error('provider unavailable');
      }
      signal.addEventListener('abort', stopped);
      return new Promise(() => {});
    });
    const task = runOptionalResearch({ models: ['first', 'second', 'third'], build, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await task).toMatchObject({ result: null, model: null, timedOut: true });
    expect(build.mock.calls.map(call => call[0])).toEqual(['first', 'second']);
    expect(stopped).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(requestSignal()).toBeUndefined();
  });

  it('does not admit a late answer or start the next model after the deadline', async () => {
    let finish;
    const build = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const task = runOptionalResearch({ models: ['first', 'second'], build, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect((await task).result).toBeNull();
    finish({ briefing: 'too late' });
    await vi.advanceTimersByTimeAsync(100);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('clears deadline timers on success and retains the original successful result', async () => {
    const result = { briefing: 'original evidence', calledTokens: [{ token: 'MLB_WEATHER' }] };
    const build = vi.fn().mockRejectedValueOnce(new Error('credits unavailable')).mockResolvedValueOnce(result);
    expect(await runOptionalResearch({ models: ['Haiku', 'Luna'], build, timeoutMs: 100 })).toMatchObject({ result, model: 'Luna', timedOut: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('treats empty results as unavailable and does not fail the decision lane', async () => {
    const build = vi.fn().mockResolvedValue(null);
    const outcome = await runOptionalResearch({ models: ['first', 'second'], build, timeoutMs: 100 });
    expect(outcome.result).toBeNull();
    expect(outcome.failures).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates whole-game cancellation instead of falling back', async () => {
    const controller = new AbortController();
    const task = runOptionalResearch({ models: ['first'], build: () => new Promise(() => {}), timeoutMs: 100, signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reuses unavailable research across brain retries; different desks run independently', async () => {
    const build = vi.fn().mockResolvedValue(null);
    const options = { models: ['first'], build, timeoutMs: 100 };
    const a = await runResearchOnce('failed-exact-desk', options);
    expect(await runResearchOnce('failed-exact-desk', options)).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
    await runResearchOnce('changed-exact-desk', options);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('reserves eight minutes for decision, caps early research and skips exhausted deadlines', async () => {
    const now = Date.parse('2026-09-05T00:00:00Z');
    expect(researchBudgetMs({ now, deadlineAt: '2026-09-05T00:30:00Z' })).toBe(20 * 60000);
    expect(researchBudgetMs({ now, deadlineAt: '2026-09-05T00:15:00Z' })).toBe(7 * 60000);
    expect(researchBudgetMs({ now, deadlineAt: '2026-09-05T00:07:00Z' })).toBe(0);
    expect(researchBudgetMs({ now, deadlineAt: 'invalid' })).toBe(20 * 60000);
    const build = vi.fn();
    expect(await runOptionalResearch({ models: ['first'], build, timeoutMs: 0 })).toMatchObject({ result: null, timedOut: true });
    expect(build).not.toHaveBeenCalled();
  });
});
