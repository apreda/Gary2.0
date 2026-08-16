import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGames: vi.fn(),
  getOddsV2: vi.fn(),
}));

vi.mock('../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getGames: mocks.getGames,
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
});

describe('BDL NBA empty-slate policy', () => {
  it('does not require odds when the games source successfully decodes an empty slate', async () => {
    mocks.getGames.mockResolvedValue([]);
    mocks.getOddsV2.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401 },
    }));

    await expect(ballDontLieOddsService
      .getGamesWithOddsForSport('basketball_nba', '2026-08-16'))
      .resolves.toEqual([]);

    expect(mocks.getGames).toHaveBeenCalledWith(
      'basketball_nba',
      { dates: ['2026-08-16'], per_page: 100 },
      10,
    );
    expect(mocks.getOddsV2).not.toHaveBeenCalled();
  });

  it('still fails closed when the games transport fails', async () => {
    mocks.getGames.mockRejectedValue(Object.assign(new Error('games unavailable'), {
      response: { status: 503 },
    }));

    await expect(ballDontLieOddsService
      .getGamesWithOddsForSport('basketball_nba', '2026-08-16'))
      .rejects.toThrow(/games unavailable/);
    expect(mocks.getOddsV2).not.toHaveBeenCalled();
  });

  it('still fails closed when a non-empty NBA slate cannot fetch odds', async () => {
    mocks.getGames.mockResolvedValue([{
      id: 42,
      datetime: '2026-08-17T00:00:00Z',
      home_team: { full_name: 'Home' },
      visitor_team: { full_name: 'Away' },
    }]);
    mocks.getOddsV2.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401 },
    }));

    await expect(ballDontLieOddsService
      .getGamesWithOddsForSport('basketball_nba', '2026-08-16'))
      .rejects.toThrow(/status code 401/);
    expect(mocks.getOddsV2).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-array games contract instead of treating it as empty', async () => {
    mocks.getGames.mockResolvedValue({ data: [] });

    await expect(ballDontLieOddsService
      .getGamesWithOddsForSport('basketball_nba', '2026-08-16'))
      .rejects.toThrow(/games source returned a non-array slate/);
    expect(mocks.getOddsV2).not.toHaveBeenCalled();
  });
});
