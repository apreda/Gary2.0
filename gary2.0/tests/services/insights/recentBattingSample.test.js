import { beforeEach, describe, expect, it, vi } from 'vitest';
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../../src/services/insights/solText.js', () => ({ generateSolText: read }));
import { recentBattingSample } from '../../../src/services/insights/recentBattingSample.js';
import { computeHeatCheck } from '../../../src/services/insights/computers/heatCheck.js';
import { computeCoolingOff } from '../../../src/services/insights/computers/coolingOff.js';

beforeEach(() => { read.mockReset(); read.mockResolvedValue('{"reads":[]}'); });

describe('observed recent batting sample', () => {
  it.each([
    [{ plate_appearances: 70, at_bats: 57 }, { count: 70, unit: 'PA', field: 'plate_appearances' }],
    [{ plate_appearances: '70', at_bats: 57 }, { count: 70, unit: 'PA', field: 'plate_appearances' }],
    [{ at_bats: 57 }, { count: 57, unit: 'AB', field: 'at_bats' }],
    [{ plate_appearances: null, at_bats: 57 }, { count: 57, unit: 'AB', field: 'at_bats' }],
    [{ plate_appearances: '', at_bats: '57' }, { count: 57, unit: 'AB', field: 'at_bats' }],
    [{ plate_appearances: '  ', at_bats: 57 }, { count: 57, unit: 'AB', field: 'at_bats' }],
    [{ at_bats: 22 }, { count: 22, unit: 'AB', field: 'at_bats' }],
    [{ plate_appearances: 25, at_bats: 22 }, { count: 25, unit: 'PA', field: 'plate_appearances' }],
  ])('preserves the supplied count and unit (%j)', (split, sample) => {
    expect(recentBattingSample(split)).toEqual(sample);
  });
  it.each([
    {}, { plate_appearances: null, at_bats: null }, { plate_appearances: '', at_bats: '' },
    { plate_appearances: 0, at_bats: 57 }, { plate_appearances: 24, at_bats: 22 },
    { at_bats: 21 }, { at_bats: 0 }, { at_bats: -57 }, { at_bats: 57.1 },
    { at_bats: true }, { at_bats: [] }, { plate_appearances: 50, at_bats: 57 },
  ])('does not turn missing, invalid, short or contradictory counts into a sample (%j)', split => {
    expect(recentBattingSample(split)).toBeNull();
  });
});

function context(recent, matchup = false) {
  return { date: '2026-09-08', season: 2026,
    games: [{ id: 100, home_team: { id: 1, abbreviation: 'FIX' }, visitor_team: { id: 2, abbreviation: 'OPP' } }],
    helpers: { gameLabel: () => 'OPP @ FIX' },
    bdl: {
      getMlbLineups: vi.fn().mockResolvedValue({ FIX: { batters: [{ playerId: 7, name: 'Fixture Hitter', position: '3B' }] },
        OPP: { batters: [], pitcher: matchup ? { name: 'Fixture Pitcher', batsThrows: 'R/R' } : null } }),
      getMlbPlayerSeasonStats: vi.fn().mockResolvedValue([{ player: { id: 7, full_name: 'Fixture Hitter' }, batting_ops: 0.850, batting_hr: 20, gp: 100 }]),
      getMlbPlayerSplits: vi.fn().mockResolvedValue({ byDayMonth: [{ split_name: 'Last 15 Days', ...recent }],
        breakdown: [{ split_name: 'vs. Right', at_bats: 200, ops: 0.800 }, { split_name: 'vs. Left', at_bats: 100, ops: 0.900 }] }),
      getMlbPlayerProps: vi.fn().mockResolvedValue([]),
    },
  };
}

describe.each([
  ['heat', computeHeatCheck, 1.398], ['cooling', computeCoolingOff, 0.450],
])('%s collector sample provenance', (_name, compute, ops) => {
  it('renders AB when PA is absent and seals the observed count, unit, field and window', async () => {
    const rows = await compute(context({ ops, at_bats: 57 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toContain('57 AB');
    expect(rows[0].detail).not.toContain('57 PA');
    expect(rows[0].meta.computed_detail).toContain('57 AB');
    expect(rows[0].meta).toMatchObject({ recent_sample_version: 'recent-batting-sample-v1',
      recent_sample: { count: 57, unit: 'AB', field: 'at_bats', window: 'Last 15 Days', source: 'balldontlie_mlb_player_splits' } });
    expect(read.mock.calls[0][0]).toContain('57 AB');
  });
  it('uses the actual PA count when the source has both measurements', async () => {
    const [row] = await compute(context({ ops, plate_appearances: 70, at_bats: 57 }));
    expect(row.detail).toContain('70 PA');
    expect(row.detail).not.toContain('57 PA');
    expect(row.meta.recent_sample).toMatchObject({ count: 70, unit: 'PA', field: 'plate_appearances' });
  });
  it('allows null PA to fall back to real AB without interpreting null as zero', async () => {
    const [row] = await compute(context({ ops, plate_appearances: null, at_bats: 57 }));
    expect(row.detail).toContain('57 AB');
  });
  it('emits no row from missing samples or a reported short PA sample', async () => {
    expect(await compute(context({ ops, at_bats: null, plate_appearances: null }))).toEqual([]);
    expect(await compute(context({ ops, at_bats: 23, plate_appearances: 24 }))).toEqual([]);
  });
});
