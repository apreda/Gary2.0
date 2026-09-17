import { describe, expect, it } from 'vitest';
import { wireLeagueWindow } from '../../../src/services/insights/wireBudget.js';

const defaults = { floorMs: 25_000, bridgeMaxMs: 90_000, fallbackReserveMs: 40_000 };

describe('Wire per-league time window', () => {
  it('gives the subscription search its ceiling and keeps the native fallback reserve when the run has room', () => {
    expect(wireLeagueWindow({ remainingMs: 150_000, ...defaults })).toEqual({ bridgeTimeoutMs: 90_000, timeoutMs: 130_000 });
  });
  it('shrinks the subscription window first so the fallback keeps its reserve when the run is short', () => {
    expect(wireLeagueWindow({ remainingMs: 70_000, ...defaults })).toEqual({ bridgeTimeoutMs: 30_000, timeoutMs: 70_000 });
  });
  it('skips the subscription search entirely when only the fallback reserve is left', () => {
    expect(wireLeagueWindow({ remainingMs: 45_000, ...defaults })).toEqual({ bridgeTimeoutMs: 0, timeoutMs: 45_000 });
  });
  it('defers the league below the honest floor', () => {
    expect(wireLeagueWindow({ remainingMs: 24_999, ...defaults })).toBeNull();
    expect(wireLeagueWindow({ remainingMs: 0, ...defaults })).toBeNull();
  });
});
