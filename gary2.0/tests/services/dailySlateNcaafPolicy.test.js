import { beforeEach, describe, expect, it, vi } from 'vitest';

const odds = vi.hoisted(() => ({ getUpcomingGames: vi.fn() }));

vi.mock('../../src/services/oddsService.js', () => ({
  oddsService: odds,
}));

const {
  buildLeagueRows,
  dedupeDailySlateRows,
  partitionDailySlateRowsByIdentity,
} = await import('../../src/services/dailySlateService.js');

const sport = { key: 'americanfootball_ncaaf', league: 'NCAAF' };
const nflSport = { key: 'americanfootball_nfl', league: 'NFL' };

beforeEach(() => vi.clearAllMocks());

describe('daily NCAAF slate policy', () => {
  it('routes every exact provider game through one identity while preserving legacy rows', () => {
    const mlb = { league: 'MLB', bdl_game_id: 900, commence_time: '2026-08-15T23:00:00Z' };
    const ncaaf = { league: 'NCAAF', bdl_game_id: 901, commence_time: null };
    const legacy = { league: 'MLB', bdl_game_id: null, commence_time: '2026-08-15T23:00:00Z' };

    expect(partitionDailySlateRowsByIdentity([mlb, ncaaf, legacy])).toEqual({
      exactGameRows: [mlb, ncaaf],
      legacyRows: [legacy],
    });
  });

  it('dedupes corrected-time provider rows by exact game id for MLB as well as NCAAF', () => {
    const first = {
      date: '2026-08-15', league: 'MLB', bdl_game_id: 900,
      away_team: 'Away', home_team: 'Home', commence_time: '2026-08-15T23:00:00Z',
    };
    const corrected = { ...first, commence_time: '2026-08-15T23:10:00Z' };
    const doubleheader = { ...first, bdl_game_id: 901, commence_time: '2026-08-16T02:00:00Z' };

    expect(dedupeDailySlateRows([first, corrected, doubleheader])).toEqual([corrected, doubleheader]);
  });

  it('publishes a provider-verified date-only game with TIME TBD and exact identity', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 700,
      ncaaf_fbs_verified: true,
      home_team: 'Texas Longhorns',
      away_team: 'Ohio State Buckeyes',
      commence_time: null,
      scheduled_date: '2026-09-05',
      kickoff_status: 'date_only',
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
      commence_time: null,
      scheduled_date: '2026-09-05',
      kickoff_status: 'date_only',
      away_team: 'Ohio State Buckeyes',
      home_team: 'Texas Longhorns',
    })]);
  });

  it('keeps a confirmed late-UTC kickoff on its true ET slate', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 702,
      ncaaf_fbs_verified: true,
      home_team: 'TCU Horned Frogs',
      away_team: 'North Carolina Tar Heels',
      commence_time: '2026-09-06T01:30:00.000Z',
      scheduled_date: '2026-09-05',
      kickoff_status: 'confirmed',
    }]);

    const rows = await buildLeagueRows(sport, '2026-09-05');

    expect(rows).toEqual([expect.objectContaining({
      bdl_game_id: 702,
      commence_time: '2026-09-06T01:30:00.000Z',
      scheduled_date: '2026-09-05',
      kickoff_status: 'confirmed',
    })]);
  });

  it('files a confirmed post-midnight kickoff on the prior slate until 6 AM ET', async () => {
    odds.getUpcomingGames.mockResolvedValue([
      {
        id: 704,
        ncaaf_fbs_verified: true,
        home_team: 'Hawaii Rainbow Warriors',
        away_team: 'Stanford Cardinal',
        commence_time: '2026-09-06T05:30:00.000Z',
        scheduled_date: '2026-09-06',
        kickoff_status: 'confirmed',
      },
      {
        id: 705,
        ncaaf_fbs_verified: true,
        home_team: 'Army Black Knights',
        away_team: 'Navy Midshipmen',
        commence_time: '2026-09-06T10:00:00.000Z',
        scheduled_date: '2026-09-06',
        kickoff_status: 'confirmed',
      },
    ]);

    const rows = await buildLeagueRows(sport, '2026-09-05');
    expect(rows.map((row) => row.bdl_game_id)).toEqual([704]);
    expect(rows[0]).toMatchObject({
      date: '2026-09-05',
      scheduled_date: '2026-09-06',
      commence_time: '2026-09-06T05:30:00.000Z',
    });
  });

  it('fails closed instead of publishing an unverified college game', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 701,
      home_team: 'Unknown Home',
      away_team: 'Unknown Away',
      commence_time: '2026-09-05T19:00:00.000Z',
      scheduled_date: '2026-09-05',
      kickoff_status: 'confirmed',
    }]);

    await expect(buildLeagueRows(sport, '2026-09-05'))
      .rejects.toThrow(/without provider-verified FBS identity/);
  });

  it('fails closed if the NCAAF kickoff status is lost between adapters', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 703,
      ncaaf_fbs_verified: true,
      home_team: 'Known Home',
      away_team: 'Known Away',
      commence_time: null,
      scheduled_date: '2026-09-05',
    }]);

    await expect(buildLeagueRows(sport, '2026-09-05'))
      .rejects.toThrow(/missing a valid kickoff_status/);
  });

  it('fails closed when a verified row loses its provider game identity', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      ncaaf_fbs_verified: true,
      home_team: 'Known Home',
      away_team: 'Known Away',
      commence_time: null,
      scheduled_date: '2026-09-05',
      kickoff_status: 'date_only',
    }]);

    await expect(buildLeagueRows(sport, '2026-09-05'))
      .rejects.toThrow(/without a provider game id/);
  });
});

describe('daily NFL slate kickoff policy', () => {
  it('publishes a date-only NFL fixture as TIME TBD with no execution instant', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 800,
      home_team: 'Buffalo Bills',
      away_team: 'New York Jets',
      commence_time: null,
      scheduled_date: '2026-09-13',
      kickoff_status: 'date_only',
      estimated_time: true,
      spread_home: -3,
    }]);

    const rows = await buildLeagueRows(nflSport, '2026-09-13');

    expect(rows).toEqual([expect.objectContaining({
      date: '2026-09-13',
      league: 'NFL',
      bdl_game_id: 800,
      commence_time: null,
      scheduled_date: '2026-09-13',
      kickoff_status: 'date_only',
    })]);
  });

  it('preserves a confirmed NFL kickoff exactly', async () => {
    odds.getUpcomingGames.mockResolvedValue([{
      id: 801,
      home_team: 'Buffalo Bills',
      away_team: 'New York Jets',
      commence_time: '2026-09-13T17:00:00.000Z',
      scheduled_date: '2026-09-13',
      kickoff_status: 'confirmed',
    }]);

    const rows = await buildLeagueRows(nflSport, '2026-09-13');
    expect(rows).toEqual([expect.objectContaining({
      bdl_game_id: 801,
      commence_time: '2026-09-13T17:00:00.000Z',
      scheduled_date: '2026-09-13',
      kickoff_status: 'confirmed',
    })]);
  });
});
