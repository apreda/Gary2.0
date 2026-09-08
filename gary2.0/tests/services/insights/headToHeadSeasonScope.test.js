import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/insights/laneReads.js', () => ({ attachLaneReads: vi.fn() }));
const { computeHeadToHead, buildHeadToHeadRows } = await import('../../../src/services/insights/computers/headToHead.js');
const { attachLaneReads } = await import('../../../src/services/insights/laneReads.js');

const slate = { id: 900, date: '2026-09-08T23:00:00Z',
  home_team: { id: 12, abbreviation: 'KC', name: 'Royals' },
  away_team: { id: 1, abbreviation: 'ARI', name: 'Diamondbacks' } };
// This is the actual getMlbSeasonGameIndex projection of the documented
// provider fields season_type, postseason, home_team_data and away_team_data.
const indexed = (change = {}) => ({ date: '2026-09-07T18:10:00.000Z', status: 'STATUS_FINAL',
  seasonType: 'regular', postseason: false, homeId: 12, awayId: 1,
  homeRuns: 4, awayRuns: 5, ...change });
const collect = (entries, game = slate) => computeHeadToHead({ date: '2026-09-08', season: 2026, games: [game],
  bdl: { getMlbSeasonGameIndex: async () => new Map(entries.map((entry, index) => [index + 1, entry])) },
  helpers: { gameLabel: () => 'ARI @ KC' } });

beforeEach(() => vi.clearAllMocks());

describe('MLB head-to-head regular-season scope', () => {
  it('does not inflate the current season series with spring exhibitions or postseason meetings', async () => {
    const [row] = await collect([
      indexed({ date: '2026-02-26T20:10:00.000Z', seasonType: 'spring_training', homeRuns: 10, awayRuns: 13 }),
      indexed({ date: '2026-03-14T01:05:00.000Z', seasonType: 'spring_training', homeRuns: 5, awayRuns: 11 }),
      indexed(),
      indexed({ date: '2026-10-10T01:00:00.000Z', seasonType: 'postseason', postseason: true, homeRuns: 7, awayRuns: 2 }),
      indexed({ awayId: 2 }),
    ]);
    expect(row.headline).toBe('Diamondbacks are 1-0 vs Royals this season');
    expect(row.meta).toMatchObject({ wins: 1, losses: 0, games: 1, season_type: 'regular',
      source: 'BALLDONTLIE completed regular-season games' });
    expect(row.meta.meetings).toEqual([{ date: '2026-09-07T18:10:00.000Z', away: 'ARI', home: 'KC',
      away_runs: 5, home_runs: 4, dom_won: true }]);
  });

  it('keeps legitimate March regular-season meetings instead of guessing the season from the month', async () => {
    const [row] = await collect([indexed({ date: '2026-03-27T18:10:00.000Z' }), indexed()]);
    expect(row.meta.games).toBe(2);
    expect(row.meta.meetings[0].date).toBe('2026-03-27T18:10:00.000Z');
  });

  it('does not claim a season series from untyped, contradictory, tied or incomplete results', async () => {
    expect(await collect([
      indexed({ seasonType: undefined }), indexed({ seasonType: 'unknown' }),
      indexed({ seasonType: 'spring_training' }), indexed({ postseason: true }),
      indexed({ postseason: undefined }), indexed({ homeRuns: 5 }),
      indexed({ homeRuns: null }), indexed({ awayRuns: '' }),
      indexed({ homeRuns: false }), indexed({ awayRuns: -1 }), indexed({ homeRuns: 4.5 }),
      indexed({ status: 'STATUS_IN_PROGRESS' }),
    ])).toEqual([]);
  });

  it('keeps the final current-game ledger behavior and the exact slate anchor', async () => {
    const entries = [indexed({ homeRuns: 8, awayRuns: 2 }), indexed({ homeRuns: 1, awayRuns: 4 })];
    const [row] = await collect(entries, { ...slate, status: 'STATUS_FINAL' });
    expect(row.category).toBe('head_to_head');
    expect(row.game_id).toBe(900);
    expect(row.team_id).toBe(12);
    expect(row.meta).toMatchObject({ wins: 1, losses: 1, games: 2 });
  });

  it('builds a historical game from earlier regular finals, excluding its own ID and later results without voice work', () => {
    const index = new Map([
      [1, indexed({ date: '2026-07-04T01:00:00Z' })],
      [900, indexed({ date: '2026-07-03T23:00:00Z' })],
      [2, indexed({ date: '2026-07-05T01:00:00Z' })],
      [3, indexed({ date: '2026-08-01T01:00:00Z' })],
    ]);
    const [row] = buildHeadToHeadRows({ date: '2026-07-04', season: 2026,
      games: [{ ...slate, date: '2026-07-05T01:00:00Z', status: 'STATUS_FINAL' }],
      helpers: { gameLabel: () => 'ARI @ KC' } }, index);
    expect(row.meta.games).toBe(1);
    expect(row.meta.meetings[0].date).toBe('2026-07-04T01:00:00Z');
    expect(row.meta.history_before).toBe('2026-07-05T01:00:00.000Z');
    expect(attachLaneReads).not.toHaveBeenCalled();
  });

  it('admits an earlier doubleheader game for the later game but requires a known time for same-day history', () => {
    const index = new Map([
      [1, indexed({ date: '2026-09-07T23:00:00Z' })],
      [901, indexed({ date: '2026-09-08T17:00:00Z' })],
      [902, indexed({ date: '2026-09-08T23:00:00Z' })],
    ]);
    const ctx = { date: '2026-09-08', season: 2026, helpers: { gameLabel: () => 'ARI @ KC' } };
    const known = buildHeadToHeadRows({ ...ctx, games: [{ ...slate, id: 902 }] }, index);
    expect(known[0].meta.games).toBe(2);
    const unknown = buildHeadToHeadRows({ ...ctx, games: [{ ...slate, id: 902, date: '2026-09-08' }] }, index);
    expect(unknown[0].meta.games).toBe(1);
    expect(unknown[0].meta.history_before_date).toBe('2026-09-08');
  });
});
