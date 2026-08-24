/**
 * Transient-failure retry for production database writes (Aug 24 2026).
 *
 * Born from the Aug 23 outage post-mortem: Supabase REST was intermittently
 * unreachable for ~3 hours (Cloudflare 525 SSL pages, "upstream request
 * timeout", Postgres statement timeouts). Every atomic pick writer treated
 * the FIRST failed HTTP call as final, so fully generated picks — each ~$0.30
 * and 5–9 minutes of research — were discarded at the cheapest step of the
 * whole pipeline. Five games generated picks that day that never stored.
 *
 * The asymmetry this module fixes: generation has model fallback chains and
 * retry tiers; storage had zero retries. Storage is one idempotent RPC (the
 * atomic writers guard-skip duplicates), so retrying it is always safe.
 *
 * Scope discipline: ONLY infrastructure failures retry. Anything that smells
 * like a contract problem — constraint violations, RLS, bad payload — fails
 * fast and loud, because retrying those just delays the real alarm.
 */

const TRANSIENT_PATTERNS = [
  /upstream request timeout/i,      // PostgREST gateway during the Aug 23 outage
  /statement timeout/i,             // Postgres 57014 — DB briefly overloaded
  /canceling statement/i,
  /fetch failed/i,                  // undici network-layer failure
  /network ?(error|request failed)/i,
  /socket hang ?up/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE|EAI_AGAIN/,
  /UND_ERR/,                        // undici error codes
  /abort(ed|Error)/i,
  /timeout of \d+ ?ms exceeded/i,   // axios-style timeouts
  /cloudflare/i,                    // 5xx HTML interstitials arrive as message text
  /error code 5\d\d/i,
  /<html/i,                         // any HTML body where JSON belonged = infra, not contract
  /bad gateway|gateway time-?out|service unavailable|internal server error/i,
  /too many connections|connection terminated|connection refused/i,
];

/** True when an error message describes infrastructure, not a data contract. */
export function isTransientDbError(error) {
  const message = String(error?.message ?? error ?? '');
  if (!message) return false;
  return TRANSIENT_PATTERNS.some((pattern) => pattern.test(message));
}

// First retry fast (blips), then spread out to ride through a multi-minute
// gateway incident without blowing the scheduler's child budget (~3.25 min
// total added wait worst-case).
export const DEFAULT_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 90_000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `attempt` (an async fn that THROWS on failure), retrying only when the
 * thrown error classifies as transient. Non-transient errors and exhausted
 * retries rethrow the last error unchanged so callers keep their existing
 * failure semantics.
 *
 * @param {() => Promise<any>} attempt
 * @param {object} [options]
 * @param {string}   [options.label]      log prefix, e.g. 'daily-picks RPC'
 * @param {number[]} [options.delaysMs]   waits BETWEEN attempts
 * @param {() => void} [options.beforeRetry] guard run before each retry —
 *   throw to abort (e.g. re-assert the game is still pregame so a long retry
 *   tail can never store an in-play "pregame" pick).
 */
export async function withTransientRetry(attempt, options = {}) {
  const { label = 'db write', delaysMs = DEFAULT_RETRY_DELAYS_MS, beforeRetry = null } = options;
  let lastError;
  for (let i = 0; i <= delaysMs.length; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const transient = isTransientDbError(error);
      const attemptsLeft = delaysMs.length - i;
      if (!transient || attemptsLeft === 0) {
        if (transient) {
          console.error(`❌ [Retry] ${label}: transient failure persisted through all ${delaysMs.length + 1} attempts — giving up: ${error?.message || error}`);
        }
        throw error;
      }
      const waitMs = delaysMs[i];
      console.warn(`⚠️ [Retry] ${label}: transient failure (attempt ${i + 1}/${delaysMs.length + 1}) — retrying in ${Math.round(waitMs / 1000)}s: ${String(error?.message || error).slice(0, 200)}`);
      await sleep(waitMs);
      if (beforeRetry) beforeRetry(); // throws to abort (e.g. game went live mid-retry)
    }
  }
  throw lastError;
}

export default { isTransientDbError, withTransientRetry, DEFAULT_RETRY_DELAYS_MS };
