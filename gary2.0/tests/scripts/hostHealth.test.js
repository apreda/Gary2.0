import { describe, it, expect } from 'vitest';
import { diskHealth, healthSignature } from '../../scripts/lib/hostHealth.js';

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
});
