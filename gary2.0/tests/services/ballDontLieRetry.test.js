// Regression tests for the transient-network retry added to getCachedOrFetch
// after the June 2-3 2026 incident: getaddrinfo ENOTFOUND api.balldontlie.io
// blips zeroed out entire pick runs (NHL wiped June 2; Tigers @ Rays lost
// June 3) because only HTTP 429s were retried.
import { describe, it, expect, vi } from 'vitest';

process.env.BALLDONTLIE_API_KEY ||= 'test-key';

const { getCachedOrFetch, isTransientNetworkError } = await import(
  '../../src/services/ballDontLieService.js'
);

// undici-style failure: TypeError("fetch failed") with the real code on cause
function enotfound() {
  const cause = new Error('getaddrinfo ENOTFOUND api.balldontlie.io');
  cause.code = 'ENOTFOUND';
  const err = new TypeError('fetch failed');
  err.cause = cause;
  return err;
}

describe('isTransientNetworkError', () => {
  it('matches undici fetch-failed with ENOTFOUND cause', () => {
    expect(isTransientNetworkError(enotfound())).toBe(true);
  });

  it('matches axios-style ECONNRESET on err.code', () => {
    const e = new Error('socket hang up');
    e.code = 'ECONNRESET';
    expect(isTransientNetworkError(e)).toBe(true);
  });

  it('matches bare "fetch failed" message with no cause', () => {
    expect(isTransientNetworkError(new TypeError('fetch failed'))).toBe(true);
  });

  it('matches an axios client-timeout (ECONNABORTED)', () => {
    const e = new Error('timeout of 12000ms exceeded');
    e.code = 'ECONNABORTED';
    expect(isTransientNetworkError(e)).toBe(true);
  });

  it('matches an AbortSignal.timeout DOMException (TimeoutError)', () => {
    const e = new Error('The operation was aborted due to timeout');
    e.name = 'TimeoutError';
    expect(isTransientNetworkError(e)).toBe(true);
  });

  it('does NOT match HTTP 404-style errors', () => {
    const e = new Error('Request failed with status code 404');
    e.response = { status: 404 };
    expect(isTransientNetworkError(e)).toBe(false);
  });

  it('does NOT match a 429 rate limit', () => {
    const e = new Error('Too Many Requests');
    e.status = 429;
    expect(isTransientNetworkError(e)).toBe(false);
  });
});

describe('getCachedOrFetch network retry', () => {
  it('retries transient network errors and succeeds', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) throw enotfound();
      return { ok: true };
    });
    const data = await getCachedOrFetch(`test_retry_${Date.now()}_a`, fetchFn, 1);
    expect(data).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  }, 15000);

  it('gives up after 3 network retries (4 attempts total)', async () => {
    const fetchFn = vi.fn(async () => {
      throw enotfound();
    });
    await expect(
      getCachedOrFetch(`test_retry_${Date.now()}_b`, fetchFn, 1)
    ).rejects.toThrow('fetch failed');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  }, 20000);

  it('rethrows non-transient errors immediately (no retry)', async () => {
    const fetchFn = vi.fn(async () => {
      const e = new Error('Request failed with status code 500');
      e.response = { status: 500 };
      throw e;
    });
    await expect(
      getCachedOrFetch(`test_retry_${Date.now()}_c`, fetchFn, 1)
    ).rejects.toThrow('500');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('still retries 429 once (existing behavior preserved)', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        const e = new Error('Too Many Requests');
        e.status = 429;
        throw e;
      }
      return { ok: 429 };
    });
    const data = await getCachedOrFetch(`test_retry_${Date.now()}_d`, fetchFn, 1);
    expect(data).toEqual({ ok: 429 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  }, 10000);

  it('does not cache failures — a later call with the same key retries fresh', async () => {
    const key = `test_retry_${Date.now()}_e`;
    const failing = vi.fn(async () => {
      throw enotfound();
    });
    await expect(getCachedOrFetch(key, failing, 1)).rejects.toThrow();
    const succeeding = vi.fn(async () => ({ recovered: true }));
    const data = await getCachedOrFetch(key, succeeding, 1);
    expect(data).toEqual({ recovered: true });
  }, 30000);
});
