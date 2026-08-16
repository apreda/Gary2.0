import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  nflExact: vi.fn(),
  ncaafExact: vi.fn(),
  slate: vi.fn(),
}));

vi.mock('../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {},
}));

vi.mock('../../src/services/ballDontLieOddsService.js', () => ({
  ballDontLieOddsService: {
    getNflGameWithOddsById: mocks.nflExact,
    getNcaafGameWithOddsById: mocks.ncaafExact,
    getGamesWithOddsForSport: mocks.slate,
  },
}));

const { oddsService } = await import('../../src/services/oddsService.js');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nflExact.mockResolvedValue([{
    id: 1393560,
    sport_key: 'americanfootball_nfl',
    home_team: 'Kansas City Chiefs',
    away_team: 'Los Angeles Rams',
    commence_time: '2099-08-15T20:00:00.000Z',
    bookmakers: [{
      key: 'fanduel',
      title: 'fanduel',
      markets: [
        { key: 'h2h', outcomes: [
          { name: 'Kansas City Chiefs', price: -125 },
          { name: 'Los Angeles Rams', price: 105 },
        ] },
        { key: 'spreads', outcomes: [
          { name: 'Kansas City Chiefs', point: -1.5, price: -110 },
          { name: 'Los Angeles Rams', point: 1.5, price: -110 },
        ] },
      ],
    }],
  }]);
});

describe('odds service exact NFL path', () => {
  it('bypasses every date-page lookup and still flattens verified bookmaker odds', async () => {
    const rows = await oddsService.getUpcomingGames('americanfootball_nfl', {
      targetDate: '2099-08-15',
      gameId: '1393560',
      nocache: true,
    });

    expect(mocks.nflExact).toHaveBeenCalledOnce();
    expect(mocks.nflExact).toHaveBeenCalledWith('1393560');
    expect(mocks.slate).not.toHaveBeenCalled();
    expect(rows).toEqual([expect.objectContaining({
      id: 1393560,
      moneyline_home: -125,
      moneyline_away: 105,
      spread_home: -1.5,
      spread_away: 1.5,
      line_vendor: 'fanduel',
    })]);
  });

  it('routes an exact NCAAF id without opening the date-slate adapter', async () => {
    mocks.ncaafExact.mockResolvedValueOnce([{
      id: 5059617,
      sport_key: 'americanfootball_ncaaf',
      home_team: 'Georgia Bulldogs',
      away_team: 'Clemson Tigers',
      commence_time: '2099-08-15T23:30:00.000Z',
      ncaaf_fbs_verified: true,
      ncaaf_fbs_verification_source: 'provider_exact',
      bookmakers: [{
        key: 'fanduel',
        title: 'fanduel',
        markets: [{ key: 'h2h', outcomes: [
          { name: 'Georgia Bulldogs', price: -135 },
          { name: 'Clemson Tigers', price: 115 },
        ] }],
      }],
    }]);

    const rows = await oddsService.getUpcomingGames('americanfootball_ncaaf', {
      targetDate: '2099-08-15',
      gameId: '5059617',
      nocache: true,
    });

    expect(mocks.ncaafExact).toHaveBeenCalledOnce();
    expect(mocks.ncaafExact).toHaveBeenCalledWith('5059617');
    expect(mocks.nflExact).not.toHaveBeenCalled();
    expect(mocks.slate).not.toHaveBeenCalled();
    expect(rows).toEqual([expect.objectContaining({
      id: 5059617,
      moneyline_home: -135,
      moneyline_away: 115,
      ncaaf_fbs_verification_source: 'provider_exact',
    })]);
  });

  it('preserves the established date-slate path when no exact id is supplied', async () => {
    mocks.slate.mockResolvedValueOnce([]);

    await oddsService.getUpcomingGames('americanfootball_nfl', {
      targetDate: '2099-08-16',
      nocache: true,
    });

    expect(mocks.slate).toHaveBeenCalledOnce();
    expect(mocks.slate).toHaveBeenCalledWith('americanfootball_nfl', '2099-08-16');
    expect(mocks.nflExact).not.toHaveBeenCalled();
    expect(mocks.ncaafExact).not.toHaveBeenCalled();
  });

  it('preserves NCAAF date-slate discovery when no exact id is supplied', async () => {
    mocks.slate.mockResolvedValueOnce([]);

    await oddsService.getUpcomingGames('americanfootball_ncaaf', {
      targetDate: '2099-08-17',
      nocache: true,
    });

    expect(mocks.slate).toHaveBeenCalledOnce();
    expect(mocks.slate).toHaveBeenCalledWith('americanfootball_ncaaf', '2099-08-17');
    expect(mocks.nflExact).not.toHaveBeenCalled();
    expect(mocks.ncaafExact).not.toHaveBeenCalled();
  });
});
