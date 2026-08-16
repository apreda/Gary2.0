import { beforeEach, describe, expect, it, vi } from 'vitest';

const odds = vi.hoisted(() => ({ getUpcomingGames: vi.fn() }));

vi.mock('../../src/services/oddsService.js', () => ({
  oddsService: odds,
}));

const { buildLeagueRows } = await import('../../src/services/dailySlateService.js');

const sport = { key: 'americanfootball_ncaaf', league: 'NCAAF' };

beforeEach(() => vi.clearAllMocks());

describe('daily NCAAF slate policy', () => {
  it('publishes a provider-verified FBS game with its exact identity', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 700,
      ncaaf_fbs_verified: true,
      home_team: 'Texas Longhorns',
      away_team: 'Ohio State Buckeyes',
      commence_time: '2026-09-05T19:00:00.000Z',
      estimated_time: true,
      spread_home: -2.5,
      moneyline_home: -135,
      moneyline_away: 115,
      total: 51.5,
      line_vendor: 'fanduel',
    }]);

    const rows = await buildLeagueRows(sport, '2026-09-05');

    expect(rows).toEqual([expect.objectContaining({
      date: '2026-09-05',
      league: 'NCAAF',
      bdl_game_id: 700,
      commence_time: '2026-09-05T19:00:00.000Z',
      away_team: 'Ohio State Buckeyes',
      home_team: 'Texas Longhorns',
    })]);
  });

  it('fails closed instead of publishing an unverified college game', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 701,
      home_team: 'Unknown Home',
      away_team: 'Unknown Away',
      commence_time: '2026-09-05T19:00:00.000Z',
    }]);

    await expect(buildLeagueRows(sport, '2026-09-05'))
      .rejects.toThrow(/without provider-verified FBS identity/);
  });
});
