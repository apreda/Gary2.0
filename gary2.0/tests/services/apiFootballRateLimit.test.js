// Jul 9 2026 (founder-approved after the Morocco@France QF run): API-Football's
// per-minute rate limit does NOT arrive as HTTP 429 — it arrives as HTTP 200
// with an errors payload ({"rateLimit":"Too many requests..."}). afFetch already
// retried real 429s, but treated ANY populated errors object as deterministic
// and threw immediately, so the scout's ~9-call burst zeroed getAvailabilityTiming
// + getInjuries on the storing run. rateLimit errors are now retryable with a
// backoff long enough for the per-minute window to roll (AF_RATELIMIT_BACKOFF_MS,
// default 15s; tests shrink it).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.API_FOOTBALL_KEY ||= 'test-key';
process.env.AF_RATELIMIT_BACKOFF_MS = '1';

const { getInjuries, clearApiFootballCache } = await import('../../src/services/apiFootballService.js');

const TEAM_ID = 990001;

const rateLimitBody = { errors: { rateLimit: 'Too many requests. You have exceeded the limit of requests per minute of your subscription.' }, response: [] };
const injuriesBody = { errors: {}, response: [{ player: { name: 'Test Winger', reason: 'Hamstring' }, team: { id: TEAM_ID } }] };
const otherErrorBody = { errors: { token: 'Invalid API key' }, response: [] };

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => { clearApiFootballCache(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('afFetch retries the errors-payload rate limit', () => {
  it('a rateLimit errors payload is retried and the retry result is returned', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      calls++;
      return ok(calls === 1 ? rateLimitBody : injuriesBody);
    }));
    const rows = await getInjuries(TEAM_ID, 2026);
    expect(calls).toBe(2);
    expect(rows).toHaveLength(1);
    // getInjuries maps API rows to { player, reason, type } (flat name string).
    expect(rows[0].player).toBe('Test Winger');
  });

  it('a non-rateLimit errors payload still throws immediately (deterministic)', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => { calls++; return ok(otherErrorBody); }));
    // getInjuries catches internally and returns [] — assert no retry happened.
    const rows = await getInjuries(TEAM_ID, 2026);
    expect(rows).toEqual([]);
    expect(calls).toBe(1);
  });

  it('persistent rate limiting gives up after the retry budget instead of looping', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => { calls++; return ok(rateLimitBody); }));
    const rows = await getInjuries(TEAM_ID, 2026);
    expect(rows).toEqual([]); // degraded gracefully, not thrown to the scout
    expect(calls).toBe(3);    // initial + 2 retries
  });
});
