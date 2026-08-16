import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGames: vi.fn(),
  getTeams: vi.fn(),
  axiosGet: vi.fn(),
  wait: vi.fn(),
}));

vi.mock('../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getGames: mocks.getGames,
    getTeams: mocks.getTeams,
  },
  getApiKey: () => 'test-key',
  BALLDONTLIE_API_BASE_URL: 'https://example.test',
}));

vi.mock('../../src/services/bdlRequestGate.js', () => ({
  waitForBdlRequestSlot: mocks.wait,
}));

vi.mock('axios', () => ({
  default: { get: mocks.axiosGet },
}));

const { ballDontLieOddsService } = await import('../../src/services/ballDontLieOddsService.js');

const fbs = (id, conference, full_name) => ({ id, conference, full_name });
const game = (id, date, awayConference = 1) => ({
  id,
  date,
  home_team: fbs(id * 10, 10, `Home ${id}`),
  visitor_team: fbs(id * 10 + 1, awayConference, `Away ${id}`),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeams.mockResolvedValue([]);
  mocks.axiosGet.mockResolvedValue({ data: { data: [] } });
});

describe('BDL NCAAF slate normalization', () => {
  it('queries both provider dates, preserves TIME TBD, and keeps only FBS', async () => {
    mocks.getGames.mockResolvedValue([
      game(1, '2026-09-05'),
      game(2, '2026-09-06T01:30:00Z'), // Sep 5 ET
      game(5, '2026-09-06T05:30:00Z'), // 1:30 AM ET Sep 6, still Sep 5 slate
      game(6, '2026-09-06T10:00:00Z'), // 6:00 AM ET Sep 6, next slate
      {
        ...game(3, '2026-09-06T18:00:00Z'), // Sep 6 ET
        home_team: { id: 30, full_name: 'Unresolved Tomorrow Home' },
        visitor_team: { id: 31, full_name: 'Unresolved Tomorrow Away' },
      },
      game(4, '2026-09-05T20:00:00Z', 20), // FCS opponent
    ]);
    mocks.getTeams.mockResolvedValue([
      fbs(10, 10, 'Home 1'), fbs(11, 1, 'Away 1'),
      fbs(20, 10, 'Home 2'), fbs(21, 1, 'Away 2'),
      fbs(50, 10, 'Home 5'), fbs(51, 1, 'Away 5'),
      fbs(60, 10, 'Home 6'), fbs(61, 1, 'Away 6'),
      fbs(40, 10, 'Home 4'), fbs(41, 20, 'Away 4'),
    ]);

    const rows = await ballDontLieOddsService
      .getGamesWithOddsForSport('americanfootball_ncaaf', '2026-09-05');

    expect(mocks.getGames).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { dates: ['2026-09-05', '2026-09-06'], per_page: 100 },
      10,
    );
    expect(rows.map((row) => row.id)).toEqual([1, 2, 5]);
    expect(rows[0]).toMatchObject({
      commence_time: null,
      scheduled_date: '2026-09-05',
      kickoff_status: 'date_only',
      estimated_time: true,
      ncaaf_fbs_verified: true,
    });
    expect(rows[1]).toMatchObject({
      commence_time: '2026-09-06T01:30:00.000Z',
      scheduled_date: '2026-09-05',
      kickoff_status: 'confirmed',
      estimated_time: false,
    });
    expect(rows[2]).toMatchObject({
      commence_time: '2026-09-06T05:30:00.000Z',
      scheduled_date: '2026-09-06',
      kickoff_status: 'confirmed',
    });
  });

  it('batches every FBS game id and follows odds cursors without truncating late-slate markets', async () => {
    const fullSlate = Array.from({ length: 102 }, (_, index) =>
      game(index + 1, '2026-09-05T16:00:00Z'));
    mocks.getGames.mockResolvedValue(fullSlate);
    mocks.axiosGet.mockImplementation(async (_url, config) => {
      const params = config.params;
      if (params.cursor === 'odds-page-2') {
        return {
          data: {
            data: [{ id: 'o-100', game_id: 100, vendor: 'book-b', moneyline_home_odds: -110 }],
            meta: { next_cursor: null },
          },
        };
      }
      if (params['game_ids[]']?.[0] === 101) {
        return {
          data: {
            data: [{ id: 'o-102', game_id: 102, vendor: 'book-c', moneyline_home_odds: -105 }],
            meta: { next_cursor: null },
          },
        };
      }
      return {
        data: {
          data: [{ id: 'o-1', game_id: 1, vendor: 'book-a', moneyline_home_odds: -115 }],
          meta: { next_cursor: 'odds-page-2' },
        },
      };
    });

    const rows = await ballDontLieOddsService
      .getGamesWithOddsForSport('americanfootball_ncaaf', '2026-09-05');

    expect(rows).toHaveLength(102);
    expect(mocks.axiosGet).toHaveBeenCalledTimes(3);
    expect(mocks.axiosGet.mock.calls[0][1].params['game_ids[]']).toHaveLength(100);
    expect(mocks.axiosGet.mock.calls[1][1].params).toMatchObject({
      'game_ids[]': expect.any(Array),
      cursor: 'odds-page-2',
      per_page: 100,
    });
    expect(mocks.axiosGet.mock.calls[2][1].params['game_ids[]']).toEqual([101, 102]);
    expect(rows.find(row => row.id === 1)?.bookmakers).toHaveLength(1);
    expect(rows.find(row => row.id === 100)?.bookmakers).toHaveLength(1);
    expect(rows.find(row => row.id === 102)?.bookmakers).toHaveLength(1);
    expect(mocks.wait).toHaveBeenCalledTimes(3);
  });

  it('throws when neither embedded teams nor the provider catalog resolve FBS identity', async () => {
    mocks.getGames.mockResolvedValue([{
      id: 9,
      date: '2026-09-05T20:00:00Z',
      home_team: { id: 90, full_name: 'Mystery Home' },
      visitor_team: { id: 91, full_name: 'Mystery Away' },
    }]);

    await expect(ballDontLieOddsService
      .getGamesWithOddsForSport('americanfootball_ncaaf', '2026-09-05'))
      .rejects.toThrow(/refusing a partial slate/);
    expect(mocks.getTeams).toHaveBeenCalledWith('americanfootball_ncaaf');
    expect(mocks.axiosGet).not.toHaveBeenCalled();
  });
});
