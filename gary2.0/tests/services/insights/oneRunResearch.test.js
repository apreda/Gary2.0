import { describe, expect, it, vi } from 'vitest';
import { computeRegressionWatch } from '../../../src/services/insights/computers/regressionWatch.js';

const game = { id: 900, home_team: { id: 1, name: 'Fixture Club', abbreviation: 'FIX' },
  visitor_team: { id: 3, name: 'Other Club', abbreviation: 'OTH' } };
const final = (override = {}) => ({ status: 'STATUS_FINAL', seasonType: 'regular', postseason: false,
  date: '2026-09-01T20:00:00Z', homeId: 1, awayId: 2, homeRuns: 4, awayRuns: 3, ...override });
const source = () => new Map(Array.from({ length: 12 }, (_, index) => [index + 1, final()]));
const compute = index => computeRegressionWatch({ games: [game], season: 2026, date: '2026-09-08',
  bdl: { getMlbSeasonGameIndex: vi.fn().mockResolvedValue(index) } });

describe('one-run source boundary', () => {
  it('compares actual completed regular-season records and preserves source game identities', async () => {
    const index = source();
    index.set(20, final({ homeRuns: 6, awayRuns: 2, date: '2026-09-07T20:00:00Z' }));
    index.set(21, final({ homeRuns: 1, awayRuns: 4 }));
    const [row] = await compute(index);
    expect(row.headline).toBe('Fixture Club are 12-0 in one-run games (1.000 win rate)');
    expect(row.detail).toContain('They are 1-1 in their other 2 completed games.');
    expect(row.tone).toBe('neutral');
    expect(row.meta).toMatchObject({ kind: 'one_run_record', one_run_wins: 12, one_run_losses: 0,
      other_wins: 1, other_losses: 1, through_date: '2026-09-07', history_before: '2026-09-08',
      research_facts_version: 'observed-stats-v1', computed_detail: row.detail });
    expect(row.meta.source_game_ids).toEqual([...index.keys()]);
    expect(row.detail).not.toMatch(/premium|market|regress|\.500|expect|should/);
  });
  it('excludes spring, postseason, current slate and same-day or future results in Eastern time', async () => {
    const index = source();
    index.set(30, final({ seasonType: 'spring' }));
    index.set(31, final({ postseason: true }));
    index.set(32, final({ status: 'STATUS_IN_PROGRESS' }));
    index.set(33, final({ date: '2026-09-08T04:01:00Z' }));
    index.set(34, final({ date: '2026-09-09T20:00:00Z' }));
    index.set(35, final({ date: '2025-09-07T20:00:00Z' }));
    index.set(900, final());
    index.set(36, final({ date: '2026-09-08T03:00:00Z' })); // Sep 7 in ET
    const [row] = await compute(index);
    expect(row.meta.one_run_wins).toBe(13);
    expect(row.meta.source_game_ids).toEqual([...Array.from({ length: 12 }, (_, i) => i + 1), 36]);
  });
  it.each([null, false, '', -1, 1.5])('fails closed for an incomplete season score %j', score => {
    const index = source();
    index.set(30, final({ homeRuns: score }));
    return expect(compute(index)).resolves.toEqual([]);
  });
  it.each(['2026-09-01', 'not-a-date', null])('fails closed for an unverified historical date %j', date => {
    const index = source();
    index.set(30, final({ date }));
    return expect(compute(index)).resolves.toEqual([]);
  });
  it('does not create a season record after provider pagination failure', async () => {
    const getMlbSeasonGameIndex = vi.fn().mockRejectedValue(new Error('partial index'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await computeRegressionWatch({ games: [game], season: 2026, date: '2026-09-08', bdl: { getMlbSeasonGameIndex } })).toEqual([]);
    expect(getMlbSeasonGameIndex).toHaveBeenCalledWith(2026, 60, { throwOnError: true });
    log.mockRestore();
  });
});
