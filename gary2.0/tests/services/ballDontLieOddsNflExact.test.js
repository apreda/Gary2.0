import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGame: vi.fn(),
  getOddsV2: vi.fn(),
}));

vi.mock('../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getGame: mocks.getGame,
    getOddsV2: mocks.getOddsV2,
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
    id: 1393560,
    season: 2026,
    week: 2,
    postseason: false,
    date: '2026-08-15T20:00:00.000Z',
    home_team: { id: 16, full_name: 'Kansas City Chiefs' },
    visitor_team: { id: 14, full_name: 'Los Angeles Rams' },
  });
  mocks.getOddsV2.mockResolvedValue([{
    id: 99,
    game_id: 1393560,
    vendor: 'fanduel',
    moneyline_home_odds: '-125',
    moneyline_away_odds: '105',
    spread_home_value: '-1.5',
    spread_home_odds: '-110',
    spread_away_value: '1.5',
    spread_away_odds: '-110',
    total_value: '41.5',
    total_over_odds: '-108',
    total_under_odds: '-112',
  }]);
});

describe('BDL exact NFL game lookup', () => {
  it('uses only the canonical game id for the game and bookmaker transports', async () => {
    const rows = await ballDontLieOddsService.getNflGameWithOddsById('1393560');

    expect(mocks.getGame).toHaveBeenCalledOnce();
    expect(mocks.getGame).toHaveBeenCalledWith('americanfootball_nfl', '1393560', 1);
    expect(mocks.getOddsV2).toHaveBeenCalledOnce();
    expect(mocks.getOddsV2).toHaveBeenCalledWith({ game_ids: ['1393560'] }, 'nfl');
    expect(rows).toEqual([expect.objectContaining({
      id: 1393560,
      home_team: 'Kansas City Chiefs',
      away_team: 'Los Angeles Rams',
      commence_time: '2026-08-15T20:00:00.000Z',
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

  it('fails closed if an exact endpoint ever returns a different provider id', async () => {
    mocks.getGame.mockResolvedValueOnce({ id: 1393561 });

    await expect(ballDontLieOddsService.getNflGameWithOddsById('1393560'))
      .rejects.toThrow(/identity mismatch/);
    expect(mocks.getOddsV2).not.toHaveBeenCalled();
  });
});
