import { setTimeout as delay } from 'node:timers/promises';

/** Probe the same REST path used by the writers, without fetching app payloads.
 * Project-level ACTIVE_HEALTHY did not detect the September 6 database outage.
 */
export async function probeContentDatabase({ env = process.env, fetchImpl = fetch, signal } = {}) {
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, retryable: false, error: 'Database credentials unavailable' };
  const endpoint = new URL('/rest/v1/daily_slate?select=date&limit=1', url);
  try {
    const response = await fetchImpl(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      if (Array.isArray(await response.json())) return { ok: true };
      return { ok: false, retryable: false, error: 'Database probe returned invalid rows' };
    }
    return {
      ok: false,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      error: `Database REST HTTP ${response.status}`,
    };
  } catch (error) {
    signal?.throwIfAborted();
    // Do not include transport URLs, credentials, or raw response bodies.
    return { ok: false, retryable: true, error: `Database REST ${error.name === 'TimeoutError' ? 'timeout' : 'unreachable'}` };
  }
}

/** One shared outage budget per content run. No model/provider work starts
 * while storage is unavailable; recovery resumes the same serial owner.
 */
export function createContentDatabaseGate({
  env = process.env, signal, onEvent = () => {}, probe = probeContentDatabase,
  wait = delay, clock = Date.now, maxWaitMs = 45 * 60_000, retryMs = 30_000,
} = {}) {
  let remainingMs = maxWaitMs;
  return async function ready(stage) {
    let waited = false;
    for (;;) {
      signal?.throwIfAborted();
      const started = clock();
      const result = await probe({ env, signal });
      if (result.ok) {
        if (waited) onEvent({ event: 'database-recovered', stage: stage.id, at: new Date(clock()).toISOString() });
        return { waited };
      }
      remainingMs -= Math.max(0, clock() - started);
      if (!result.retryable || remainingMs <= 0) {
        throw new Error(`${result.error}; ${result.retryable ? 'content recovery wait budget exhausted' : 'content configuration requires repair'}`);
      }
      const pauseMs = Math.min(retryMs, remainingMs);
      onEvent({ event: 'database-wait', stage: stage.id, at: new Date(clock()).toISOString(), error: result.error, retry_ms: pauseMs, remaining_ms: remainingMs });
      const waitStarted = clock();
      await wait(pauseMs, undefined, { signal });
      remainingMs -= Math.max(pauseMs, clock() - waitStarted);
      waited = true;
    }
  };
}
