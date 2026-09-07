import { describe, it, expect } from 'vitest';
import { diskHealth, healthSignature, coverageReport, validHealthChecks } from '../../scripts/lib/hostHealth.js';

describe('host outcome health', () => {
  it('distinguishes dangerously low disk from recovery margin and sufficient space', () => {
    expect([1, 5, 14.9, 15, 100].map(gib => diskHealth(gib * 1024 ** 3).status)).toEqual(['fail', 'warn', 'warn', 'ok', 'ok']);
  });
  it('logs new missing games and recovery without repeating unchanged warnings', () => {
    const report = (status, ids, evidence = '') => ({checks:[{id:'picks',status,missing_game_ids:ids,evidence}]});
    expect(healthSignature(report('fail', [1, 2]))).toBe(healthSignature(report('fail', [2, 1], 'later timestamp')));
    expect(healthSignature(report('fail', [1]))).not.toBe(healthSignature(report('fail', [2])));
    expect(healthSignature(report('warn', []))).not.toBe(healthSignature(report('ok', [])));
  });
  it('accepts a completed failing coverage report so its missing games remain visible', () => {
    const report = { status: 'fail', checks: [{ id: 'picks', status: 'fail', missing_game_ids: [42] }] };
    expect(coverageReport({ stdout: JSON.stringify(report), error: { code: 1 } })).toEqual(report);
  });
  it('rejects truncated reports, unexpected exits and terminated reads even with valid JSON', () => {
    const stdout = JSON.stringify({ status: 'ok', checks: [{ id: 'picks', status: 'pending' }] });
    expect(coverageReport({ stdout }).status).toBe('ok');
    for (const error of [{ code: 2 }, { code: 1 }, { killed: true }, { signal: 'SIGTERM' }]) {
      expect(() => coverageReport({ stdout, error })).toThrow();
    }
    for (const checks of [undefined, [], [null], [{ id: 'picks', status: 'unknown' }]]) {
      expect(validHealthChecks(checks)).toBe(false);
      expect(() => coverageReport({ stdout: JSON.stringify({ checks }) })).toThrow();
    }
  });
});
