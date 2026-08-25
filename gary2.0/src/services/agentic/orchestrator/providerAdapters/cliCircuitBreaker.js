/**
 * Per-CLI circuit breaker (Aug 25 2026, founder-ordered).
 *
 * THE INCIDENT: on the night of Aug 24 the Anthropic subscription hit quota
 * and the `claude` CLI stopped returning instead of erroring. Every call sat
 * until its 15-minute ceiling, then the cascade tried the next provider and
 * paid another 15. The insights log recorded 119 such timeouts — fourteen of
 * them full sonnet→codex→opus triples at 45 minutes apiece — roughly 30 hours
 * of pure waiting. The 19:30 run was still alive 12.5 hours later, and because
 * launchd will not start a second instance of a running StartCalendarInterval
 * job, the 06:00, 07:15 and 08:00 runs never fired at all. Every morning lane
 * looked dead.
 *
 * The insight: a timeout is not an independent event. When a bridge stops
 * answering it stays stopped for minutes or hours, so the second timeout is
 * near-certain once the first happens — and paying full price to rediscover
 * that, call after call, is what turns a bad hour into a dead night.
 *
 * THE RULE: after N consecutive timeouts on one CLI, that CLI is dead for the
 * rest of THIS PROCESS. Every later call fails instantly so the cascade can
 * reach a working provider (or fail loudly) in seconds instead of minutes.
 *
 * Process-scoped is deliberate. Pick runs and insight runs are fresh node
 * processes spawned per invocation, so a trip lasts exactly one run and the
 * next scheduled run starts clean — no persistence, no stale lockout, nothing
 * to reset by hand.
 *
 * Only TIMEOUTS trip the breaker. A quota/429 refusal already fails fast and
 * is handled by the cascade's CAP_PATTERNS; a 529 "Overloaded" is transient
 * by definition. Neither should disable a bridge that is still answering.
 */

const DEFAULT_THRESHOLD = 2;

function threshold() {
  const raw = Number(process.env.GARY_CLI_BREAKER_THRESHOLD);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD;
}

/** provider name -> { consecutiveTimeouts, trippedAt } */
const state = new Map();

function entryFor(provider) {
  const key = String(provider || 'unknown');
  if (!state.has(key)) state.set(key, { consecutiveTimeouts: 0, trippedAt: null });
  return state.get(key);
}

/**
 * A call came back — for any reason other than a timeout. The bridge is
 * answering, so the consecutive-timeout run is broken.
 */
export function recordCliSuccess(provider) {
  entryFor(provider).consecutiveTimeouts = 0;
}

/**
 * A call hit its ceiling. Returns true if this timeout tripped the breaker.
 */
export function recordCliTimeout(provider) {
  const entry = entryFor(provider);
  entry.consecutiveTimeouts += 1;
  if (entry.consecutiveTimeouts >= threshold() && !entry.trippedAt) {
    entry.trippedAt = Date.now();
    console.warn(
      `[CLI Breaker] 🛑 ${provider} disabled for this run after ${entry.consecutiveTimeouts} consecutive timeouts. ` +
      'Further calls fail immediately so the cascade can move on.'
    );
    return true;
  }
  return false;
}

export function isCliTripped(provider) {
  return entryFor(provider).trippedAt !== null;
}

/**
 * The error a tripped bridge should throw. Names the cause so a run's logs
 * explain themselves without cross-referencing the breaker's own warning.
 */
export function trippedError(provider) {
  const entry = entryFor(provider);
  return new Error(
    `${provider} CLI disabled for this run (${entry.consecutiveTimeouts} consecutive timeouts) — not retried`
  );
}

/** Test seam. Never called in production; each run gets a fresh process. */
export function _resetCliBreakers() {
  state.clear();
}
