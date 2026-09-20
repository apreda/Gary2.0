import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/mlbStatsApiService.js', async importOriginal => ({
  ...await importOriginal(),
  findMlbTeam: vi.fn(async name => ({ id: name === 'Giants' ? 1 : 2 })),
  getMlbRecentGames: vi.fn(),
}));

import { getMlbRecentGames } from '../../../src/services/mlbStatsApiService.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { mlbFetchers } from '../../../src/services/agentic/mlbJuneEra/tools/statRouters/mlbFetchers.js';

const home = { id: 1, name: 'Giants' };
const away = { id: 2, name: 'Dodgers' };
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('active June MLB calendar data', () => {
  it.each(['2026-09-19T16:00:00Z', '2026-09-20T01:00:00Z'])(
    'keeps Friday night on Friday, with zero full days off on Saturday at %s', async now => {
      vi.setSystemTime(new Date(now));
      getMlbRecentGames.mockResolvedValue([
        { officialDate: '2026-09-18', gameDate: '2026-09-19T02:15:00Z' },
      ]);
      const result = await mlbFetchers.MLB_REST_SITUATION('baseball_mlb', home, away, 2026, {});
      expect(result.homeValue).toBe('0 full calendar day(s) off (last played 2026-09-18; as of 2026-09-19)');
      expect(result.awayValue).toBe(result.homeValue);
    },
  );

  it('counts full off days from the resumed session, including spring DST', async () => {
    vi.setSystemTime(new Date('2026-03-09T04:30:00Z'));
    getMlbRecentGames.mockResolvedValue([
      { officialDate: '2026-03-05', gameDate: '2026-03-05T21:00:00Z', resumeDate: '2026-03-07T20:00:00Z', resumeGameDate: '2026-03-07' },
      { officialDate: '2026-03-06', gameDate: '2026-03-07T02:00:00Z' },
    ]);
    const result = await mlbFetchers.MLB_REST_SITUATION('baseball_mlb', home, away, 2026, {});
    expect(result.homeValue).toBe('1 full calendar day(s) off (last played 2026-03-07; as of 2026-03-09)');
  });

  it.each(['2026-09-19T16:00:00Z', '2026-09-20T01:00:00Z'])(
    'includes the late West Coast UTC day and excludes current-day games from Statcast at %s', async now => {
      vi.setSystemTime(new Date(now));
      const games = vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue([
        { id: 900, date: '2026-09-19T18:00:00Z', status: 'STATUS_FINAL' },
        { id: 2, date: '2026-09-19T02:15:00Z', status: 'STATUS_FINAL' },
        { id: 500, date: '2026-09-18T23:00:00Z', status: 'STATUS_FINAL' },
        { id: 400, date: '2026-09-17T23:00:00Z', status: 'STATUS_FINAL' },
        { id: 600, date: '2026-09-16T23:00:00Z', status: 'STATUS_FINAL' },
        { id: 1000, date: '2026-09-12T02:00:00Z', status: 'STATUS_FINAL' },
        { id: 999, date: 'invalid', status: 'STATUS_FINAL' },
      ]);
      const appearances = vi.spyOn(ballDontLieService, 'getMlbPlateAppearances').mockResolvedValue([]);
      await mlbFetchers.MLB_STATCAST('baseball_mlb', home, away, 2026, {});
      expect(games).toHaveBeenCalledWith('baseball_mlb', {
        team_ids: [1], per_page: 50,
        dates: ['2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14', '2026-09-13', '2026-09-12'],
      });
      expect(appearances.mock.calls.map(([id]) => id)).toEqual([2, 500, 400, 2, 500, 400]);
    },
  );
});
