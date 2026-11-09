import { describe, it, expect } from 'vitest';
import { failedLoads, loadAllOrFail, DartsDataMissing, isDataMissingRun } from '../../../src/services/gary/darts/dartsDataGuard.js';

describe('no data, no darts', () => {
  it('finds a failed load in the list, a sheet or a game frame, and nothing on a clean board', () => {
    const clean = [{ note: 'ARI allowed 30, 30', menu: [{ line: 'A (WR) · 2026: 8 games', sheet: 'A WR\n  Wk 8 against CHI: 6 catches, 118 yards' }] }];
    expect(failedLoads({ screens: clean, blocks: new Map([['1', 'Cardinals @ Seahawks · total 39.5']]) })).toEqual([]);
    // Nov 8 2026: every list line read this, and the darts were thrown.
    const list = [{ menu: [{ line: 'A (WR) · 2026: games not on file (the weekly stats did not load)', sheet: 'A WR' }, { line: 'B (WR) · 2026: games not on file (the weekly stats did not load)', sheet: 'B WR' }] }];
    expect(failedLoads({ screens: list })).toEqual(['the weekly stats did not load']);
    const sheet = [{ menu: [{ line: 'A', sheet: 'A WR\n      dates, sites, results and missed games: not on file (the schedule did not load)' }] }];
    expect(failedLoads({ screens: sheet })).toEqual(['the schedule did not load']);
    expect(failedLoads({ blocks: new Map([['1', 'Lakers @ Heat · spread and total not on file (the odds feed did not load)']]) })).toEqual(['the odds feed did not load']);
  });
  it('leaves the news desk\'s own words alone', () => {
    const news = 'SEA: the team site did not load its inactives page before kickoff.';
    expect(failedLoads({ blocks: new Map([['1', `Cardinals @ Seahawks\n    Today's news:\n${news}`]]), skip: [news] })).toEqual([]);
  });
  it('asks again for a load that failed, and names what never loaded', async () => {
    let asked = 0;
    const got = await loadAllOrFail({ stats: async () => (++asked < 2 ? null : [1, 2]), snaps: async () => new Map([['a', 1]]) }, { gapMs: 0 });
    expect(got.stats).toEqual([1, 2]); expect(asked).toBe(2);
    const never = loadAllOrFail({ 'the weekly stats': async () => null, 'the schedule file': async () => ({ unavailable: true }), 'the snap counts': async () => { throw new Error('timeout'); }, ok: async () => [1] }, { tries: 2, gapMs: 0 });
    await expect(never).rejects.toBeInstanceOf(DartsDataMissing);
    await expect(never).rejects.toThrow('the weekly stats did not load; the schedule file did not load; the snap counts did not load');
  });
  it('lets the next run try again after a run that stopped for missing data', () => {
    const stopped = { status: 'failed', error: new DartsDataMissing(['the weekly stats did not load']).message };
    expect(isDataMissingRun(stopped)).toBe(true);
    expect(isDataMissingRun({ status: 'failed', error: 'darts insert: timeout' })).toBe(false);
    expect(isDataMissingRun({ status: 'ok', error: null })).toBe(false);
  });
});
