import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTransientDbError, withTransientRetry } from '../../src/utils/transientRetry.js';

describe('isTransientDbError', () => {
  it('classifies the Aug 23 outage signatures as transient', () => {
    // The three failure shapes that actually discarded picks on Aug 23 2026.
    expect(isTransientDbError(new Error('upstream request timeout'))).toBe(true);
    expect(isTransientDbError(new Error('canceling statement due to statement timeout'))).toBe(true);
    expect(isTransientDbError(new Error('<html>\n<head><title>525: SSL handshake failed</title>'))).toBe(true);
  });

  it('classifies network-layer failures as transient', () => {
    expect(isTransientDbError(new Error('fetch failed'))).toBe(true);
    expect(isTransientDbError(new Error('read ECONNRESET'))).toBe(true);
    expect(isTransientDbError(new Error('timeout of 15000ms exceeded'))).toBe(true);
  });

  it('never retries contract errors', () => {
    expect(isTransientDbError(new Error('new row for relation "daily_picks" violates check constraint'))).toBe(false);
    expect(isTransientDbError(new Error('permission denied for table daily_picks'))).toBe(false);
    expect(isTransientDbError(new Error('invalid input syntax for type json'))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});

describe('withTransientRetry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns the first successful attempt without delay', async () => {
    const attempt = vi.fn().mockResolvedValue('stored');
    await expect(withTransientRetry(attempt, { delaysMs: [10, 20] })).resolves.toBe('stored');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures until one succeeds', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new Error('upstream request timeout'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('stored');
    const run = withTransientRetry(attempt, { delaysMs: [10, 20, 30] });
    await vi.runAllTimersAsync();
    await expect(run).resolves.toBe('stored');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('fails fast on non-transient errors', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('violates check constraint'));
    await expect(withTransientRetry(attempt, { delaysMs: [10, 20] })).rejects.toThrow('check constraint');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('rethrows the last transient error once attempts are exhausted', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('upstream request timeout'));
    const run = withTransientRetry(attempt, { delaysMs: [10] });
    const guard = expect(run).rejects.toThrow('upstream request timeout');
    await vi.runAllTimersAsync();
    await guard;
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('lets a beforeRetry guard abort the retry tail (pregame protection)', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('upstream request timeout'));
    const beforeRetry = vi.fn(() => { throw new Error('Pregame storage blocked: game has already started'); });
    const run = withTransientRetry(attempt, { delaysMs: [10, 20], beforeRetry });
    const guard = expect(run).rejects.toThrow('Pregame storage blocked');
    await vi.runAllTimersAsync();
    await guard;
    expect(attempt).toHaveBeenCalledTimes(1); // no second write attempt after the game went live
  });
});
