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
  mocks.getGames.mockResolvedValue([
    {
      id: 100,
      season: 2099,
      week: 1,
      date: '2099-08-15',
      home_team: { id: 1, full_name: 'Home TBD' },
      visitor_team: { id: 2, full_name: 'Away TBD' },
    },
    {
      id: 101,
      season: 2099,
      week: 1,
      date: '2099-08-16T00:20:00Z',
      home_team: { id: 3, full_name: 'Home Confirmed' },
      visitor_team: { id: 4, full_name: 'Away Confirmed' },
    },
  ]);
  mocks.getOddsV2.mockResolvedValue([
    { id: 1, game_id: 100, vendor: 'fanduel', moneyline_home_odds: -110 },
    { id: 2, game_id: 101, vendor: 'fanduel', moneyline_home_odds: -120 },
  ]);
});

describe('BDL NFL slate kickoff normalization', () => {
  it('keeps date-only games visible while preserving a separate exact kickoff', async () => {
    const rows = await ballDontLieOddsService
      .getGamesWithOddsForSport('americanfootball_nfl', '2099-08-15');

    expect(rows.map((row) => row.id)).toEqual([100, 101]);
    expect(rows[0]).toMatchObject({
      commence_time: null,
      scheduled_date: '2099-08-15',
      kickoff_status: 'date_only',
      estimated_time: true,
    });
    expect(rows[1]).toMatchObject({
      commence_time: '2099-08-16T00:20:00.000Z',
      scheduled_date: '2099-08-15',
      kickoff_status: 'confirmed',
      estimated_time: false,
    });
    expect(JSON.stringify(rows)).not.toContain('T20:00:00');
  });
});
