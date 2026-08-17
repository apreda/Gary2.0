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
  mocks.getOddsV2.mockResolvedValue([]);
});

describe('BDL MLB interruption status', () => {
  it('carries a delayed provider state into the slate contract without changing its time', async () => {
    mocks.getGames.mockResolvedValue([{
      id: 410,
      date: '2026-08-17T23:10:00Z',
      status: 'Delayed',
      home_team: { full_name: 'New York Yankees' },
      away_team: { full_name: 'Boston Red Sox' },
    }]);

    const games = await ballDontLieOddsService
      .getGamesWithOddsForSport('baseball_mlb', '2026-08-17');

    expect(games).toEqual([expect.objectContaining({
      id: 410,
      commence_time: '2026-08-17T23:10:00Z',
      game_status: 'delayed',
      status_detail: 'DELAYED',
    })]);
  });
});
