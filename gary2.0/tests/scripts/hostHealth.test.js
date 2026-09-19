import { describe, it, expect } from 'vitest';
import { diskHealth, healthSignature, coverageReport, validHealthChecks, publishedGameEvidence } from '../../scripts/lib/hostHealth.js';

describe('host outcome health', () => {
  it('remembers publications across failed reads, accepts a corrected read and resets at Eastern midnight', () => {
    const good = {checked_at:'2026-09-19T18:45:00Z',coverage:{date:'2026-09-19'},checks:[{id:'picks:NCAAF',published_game_ids:[1,2]}]};
    const outage = {checked_at:'2026-09-19T19:00:00Z',checks:[{id:'read:picks',status:'fail'}]};
    outage.published_games = publishedGameEvidence(outage,good);
    expect(outage.published_games.leagues.NCAAF.game_ids).toEqual(['1','2']);
    const next = {...outage,checked_at:'2026-09-20T03:59:00Z'};
    expect(publishedGameEvidence(next,outage)).toEqual(outage.published_games);
    expect(publishedGameEvidence({...good,checks:[{id:'picks:NCAAF',published_game_ids:[]}]},outage).leagues.NCAAF.game_ids).toEqual([]);
    expect(publishedGameEvidence({...next,checked_at:'2026-09-20T04:00:00Z'},outage).leagues).toEqual({});
  });
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
