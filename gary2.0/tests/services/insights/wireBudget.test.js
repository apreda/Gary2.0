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

describe('wire run exit code (Sep 21 2026)', async () => {
  const { wireRunExitCode } = await import('../../../src/services/insights/wireBudget.js');
  it('is 0 when every league stored, 2 when some stored and some failed, 1 when nothing stored', () => {
    expect(wireRunExitCode({ failures: 0, stored: 3 })).toBe(0);
    expect(wireRunExitCode({ failures: 1, stored: 1 })).toBe(2);
    expect(wireRunExitCode({ failures: 2, stored: 0 })).toBe(1);
    expect(wireRunExitCode({ failures: 0, stored: 0 })).toBe(0);
  });
});

describe('Wire clock constants (Sep 21 2026: Claude alone needs ~163 s per league)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../../run-wire-items.js', import.meta.url), 'utf8');
  // The declared ceiling is the LAST number of the statement (an env override
  // and a floor may precede it).
  const constant = name => Number(source.match(new RegExp(`const ${name} = ([^;]*);`))[1].match(/\d[\d_]*/g).at(-1).replace(/_/g, ''));
  it('lets one league finish on the Claude search and the pass cover every league', () => {
    expect(constant('WIRE_BRIDGE_MAX_MS')).toBeGreaterThanOrEqual(240_000);
    expect(constant('WIRE_TIME_BUDGET_MS')).toBeGreaterThanOrEqual(840_000);
  });
});
