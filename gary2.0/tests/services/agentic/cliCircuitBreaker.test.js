import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  recordCliTimeout,
  recordCliSuccess,
  isCliTripped,
  trippedError,
  _resetCliBreakers
} from '../../../src/services/agentic/orchestrator/providerAdapters/cliCircuitBreaker.js';

/**
 * The Aug 24 2026 night in one sentence: the claude bridge stopped answering,
 * every call sat for its full timeout, and 119 of them across one insights run
 * added up to ~30 hours of waiting — which left a 12.5-hour job holding its own
 * launchd slot and killed every morning lane.
 */
describe('CLI circuit breaker', () => {
  beforeEach(() => _resetCliBreakers());
  afterEach(() => _resetCliBreakers());

  it('stays closed while the bridge answers', () => {
    recordCliSuccess('claude');
    expect(isCliTripped('claude')).toBe(false);
  });

  it('does not trip on a single timeout', () => {
    recordCliTimeout('claude');
    expect(isCliTripped('claude')).toBe(false);
  });

  it('trips on the second consecutive timeout', () => {
    recordCliTimeout('claude');
    expect(recordCliTimeout('claude')).toBe(true);
    expect(isCliTripped('claude')).toBe(true);
  });

  it('a successful call in between resets the run', () => {
    recordCliTimeout('claude');
    recordCliSuccess('claude');
    recordCliTimeout('claude');
    expect(isCliTripped('claude')).toBe(false);
  });

  it('isolates providers — a dead claude must not disable codex', () => {
    recordCliTimeout('claude');
    recordCliTimeout('claude');
    expect(isCliTripped('claude')).toBe(true);
    expect(isCliTripped('codex')).toBe(false);
  });

  it('stays tripped once tripped, so the cascade stops paying', () => {
    recordCliTimeout('codex');
    recordCliTimeout('codex');
    // A late success cannot revive it within the same run: the bridge already
    // proved it hangs, and re-arming would re-buy the full timeout.
    recordCliSuccess('codex');
    expect(isCliTripped('codex')).toBe(true);
  });

  it('names the cause in the error the cascade sees', () => {
    recordCliTimeout('claude');
    recordCliTimeout('claude');
    expect(trippedError('claude').message).toMatch(/disabled for this run.*2 consecutive timeouts/);
  });

  it('honors a configured threshold', () => {
    process.env.GARY_CLI_BREAKER_THRESHOLD = '3';
    try {
      recordCliTimeout('claude');
      recordCliTimeout('claude');
      expect(isCliTripped('claude')).toBe(false);
      recordCliTimeout('claude');
      expect(isCliTripped('claude')).toBe(true);
    } finally {
      delete process.env.GARY_CLI_BREAKER_THRESHOLD;
    }
  });

  it('bounds the worst case: 3 bridges x 2 strikes, not 119 timeouts', () => {
    const bridges = ['claude', 'codex', 'anthropic'];
    let paidTimeouts = 0;
    for (const bridge of bridges) {
      for (let call = 0; call < 40; call += 1) {
        if (isCliTripped(bridge)) continue; // fails instantly, costs nothing
        paidTimeouts += 1;
        recordCliTimeout(bridge);
      }
    }
    expect(paidTimeouts).toBe(6);
  });
});
