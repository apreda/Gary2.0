import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGame: vi.fn(),
  getOddsV2: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getGame: mocks.getGame,
    getOddsV2: mocks.getOddsV2,
    getTeams: mocks.getTeams,
  },
  getApiKey: () => 'test-key',
  BALLDONTLIE_API_BASE_URL: 'https://example.test',
}));

vi.mock('../../src/services/bdlRequestGate.js', () => ({
  waitForBdlRequestSlot: vi.fn(),
}));

const { ballDontLieOddsService } = await import('../../src/services/ballDontLieOddsService.js');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getGame.mockResolvedValue({
    id: 5059617,
    season: 2026,
    week: 1,
    date: '2026-08-29T23:30:00.000Z',
    home_team: { id: 1, full_name: 'Georgia Bulldogs', conference_id: 10 },
    visitor_team: { id: 2, full_name: 'Clemson Tigers', conference_id: 1 },
  });
  mocks.getOddsV2.mockResolvedValue([{
    id: 700,
    game_id: 5059617,
    vendor: 'fanduel',
    moneyline_home_odds: '-135',
    moneyline_away_odds: '115',
    spread_home_value: '-2.5',
    spread_home_odds: '-110',
    spread_away_value: '2.5',
    spread_away_odds: '-110',
    total_value: '48.5',
    total_over_odds: '-108',
    total_under_odds: '-112',
  }]);
  mocks.getTeams.mockResolvedValue([]);
});

describe('BDL exact NCAAF game lookup', () => {
  it('uses exact game and game-id odds transports while retaining FBS provenance', async () => {
    const rows = await ballDontLieOddsService.getNcaafGameWithOddsById('5059617');

    expect(mocks.getGame).toHaveBeenCalledOnce();
    expect(mocks.getGame).toHaveBeenCalledWith('americanfootball_ncaaf', '5059617', 1);
    expect(mocks.getTeams).not.toHaveBeenCalled();
    expect(mocks.getOddsV2).toHaveBeenCalledOnce();
    expect(mocks.getOddsV2).toHaveBeenCalledWith({ game_ids: ['5059617'] }, 'ncaaf');
    expect(rows).toEqual([expect.objectContaining({
      id: 5059617,
      home_team: 'Georgia Bulldogs',
      away_team: 'Clemson Tigers',
      commence_time: '2026-08-29T23:30:00.000Z',
      ncaaf_fbs_verified: true,
      ncaaf_fbs_verification_source: 'provider_exact',
      bookmakers: [expect.objectContaining({
        key: 'fanduel',
        markets: expect.arrayContaining([
          expect.objectContaining({ key: 'h2h' }),
          expect.objectContaining({ key: 'spreads' }),
          expect.objectContaining({ key: 'totals' }),
        ]),
      })],
    })]);
  });

  it('fails closed before fetching odds when the exact game is non-FBS', async () => {
    mocks.getGame.mockResolvedValueOnce({
      id: 5059617,
      date: '2026-08-29T23:30:00.000Z',
      home_team: { id: 1, full_name: 'Georgia Bulldogs', conference_id: 10 },
      visitor_team: { id: 99, full_name: 'Example FCS', conference_id: 99 },
    });
    mocks.getTeams.mockResolvedValueOnce([
      { id: 1, conference: 10 },
      { id: 99, conference: 20 },
    ]);

    await expect(ballDontLieOddsService.getNcaafGameWithOddsById('5059617'))
      .resolves.toEqual([]);
    expect(mocks.getTeams).toHaveBeenCalledWith('americanfootball_ncaaf');
    expect(mocks.getOddsV2).not.toHaveBeenCalled();
  });

  it('rejects a mismatched provider identity', async () => {
    mocks.getGame.mockResolvedValueOnce({ id: 5059618 });

    await expect(ballDontLieOddsService.getNcaafGameWithOddsById('5059617'))
      .rejects.toThrow(/identity mismatch/);
    expect(mocks.getOddsV2).not.toHaveBeenCalled();
  });
});
