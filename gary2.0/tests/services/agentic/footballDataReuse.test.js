import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: axiosGet }),
    get: axiosGet
  }
}));

import {
  ballDontLieService,
  summarizeNflPlayerGameLogs
} from '../../../src/services/ballDontLieService.js';
import {
  fetchKeyPlayers,
  fetchQBStatsByName
} from '../../../src/services/agentic/scoutReport/sports/nfl.js';
import { fetchTeamProfile } from '../../../src/services/agentic/scoutReport/shared/dataFetchers.js';
import { buildVerifiedTaleOfTape } from '../../../src/services/agentic/scoutReport/shared/taleOfTape.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';

const home = { id: 11, name: 'Home', full_name: 'Home Team' };
const away = { id: 22, name: 'Away', full_name: 'Away Team' };

function logRow(playerId, date, stats = {}) {
  return {
    player: { id: playerId },
    team: { id: playerId === 1 ? 11 : 22 },
    game: {
      id: `${playerId}-${date}`,
      date,
      status: 'Final',
      home_team: { id: playerId === 1 ? 11 : 99, abbreviation: 'HOM' },
      visitor_team: { id: playerId === 1 ? 99 : 22, abbreviation: 'AWY' }
    },
    ...stats
  };
}

describe('football BDL request reuse', () => {
  beforeEach(() => {
    ballDontLieService.clearCache();
    axiosGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('single-flights four concurrent identical NFL team-directory reads', async () => {
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const getTeams = vi.fn(() => pending);
    vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue({ getTeams });

    const reads = Array.from({ length: 4 }, () =>
      ballDontLieService.getTeams('americanfootball_nfl')
    );
    // Shared football-cache inspection adds one asynchronous filesystem gate
    // before the in-process single-flight is installed.
    await new Promise((resolve) => setImmediate(resolve));

    expect(getTeams).toHaveBeenCalledTimes(1);
    release({ data: [home, away] });
    const results = await Promise.all(reads);
    expect(results.every((teams) => teams.length === 2)).toBe(true);

    const cached = await ballDontLieService.getTeams('americanfootball_nfl');
    expect(cached).toEqual([home, away]);
    expect(getTeams).toHaveBeenCalledTimes(1);
  });

  it('uses an exact prior completed NFL season row during August and carries provenance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T16:00:00Z'));
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([home, away]);
    const getSeasonStats = vi.spyOn(ballDontLieService, 'getTeamSeasonStats').mockResolvedValue([
      { team: { id: 999 }, total_points_per_game: 99.9 },
      {
        team: { id: 11 },
        wins: 12,
        losses: 5,
        total_points_per_game: 28.4,
        opp_total_points_per_game: 20.1,
        rushing_yards_per_game: 131.2,
        net_passing_yards_per_game: 239.7
      }
    ]);
    vi.spyOn(ballDontLieService, 'getStandingsGeneric').mockResolvedValue([]);

    const profile = await fetchTeamProfile('Home Team', 'NFL');

    expect(getSeasonStats).toHaveBeenCalledTimes(1);
    expect(getSeasonStats).toHaveBeenCalledWith('americanfootball_nfl', {
      teamId: 11,
      season: 2025,
      postseason: false
    });
    expect(profile.seasonStats.team.id).toBe(11);
    expect(profile.seasonStatsSeason).toBe(2025);
    expect(profile.seasonStatsScope).toBe('prior_completed_regular_season');
    expect(profile.seasonStatsLabel).toBe('2025 prior completed regular-season baseline (not current-season form)');
    expect(profile.record).toBe('12-5');
    expect(profile.recordSeason).toBe(2025);
  });

  it('falls back to the exact prior NFL row when a current-season row is non-substantive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T16:00:00Z'));
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([home, away]);
    const getSeasonStats = vi.spyOn(ballDontLieService, 'getTeamSeasonStats')
      .mockResolvedValueOnce([{ team: { id: 11 }, wins: 0, losses: 0 }])
      .mockResolvedValueOnce([
        { team: { id: 22 }, total_points_per_game: 99.9 },
        { team: { id: 11 }, total_points_per_game: 27.1 }
      ]);
    vi.spyOn(ballDontLieService, 'getStandingsGeneric').mockResolvedValue([]);

    const profile = await fetchTeamProfile('Home Team', 'NFL');

    expect(getSeasonStats.mock.calls.map(([, options]) => options.season)).toEqual([2026, 2025]);
    expect(profile.seasonStats).toMatchObject({ team: { id: 11 }, total_points_per_game: 27.1 });
    expect(profile.seasonStatsSeason).toBe(2025);
    expect(profile.seasonStatsScope).toBe('prior_completed_regular_season');
  });

  it('keeps the exact current NFL row when it has substantive fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T16:00:00Z'));
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([home, away]);
    const getSeasonStats = vi.spyOn(ballDontLieService, 'getTeamSeasonStats').mockResolvedValue([
      { team: { id: 22 }, total_points_per_game: 99.9 },
      { team: { id: 11 }, total_points_per_game: 25.3 }
    ]);
    vi.spyOn(ballDontLieService, 'getStandingsGeneric').mockResolvedValue([]);

    const profile = await fetchTeamProfile('Home Team', 'NFL');

    expect(getSeasonStats).toHaveBeenCalledTimes(1);
    expect(getSeasonStats.mock.calls[0][1].season).toBe(2026);
    expect(profile.seasonStats).toMatchObject({ team: { id: 11 }, total_points_per_game: 25.3 });
    expect(profile.seasonStatsSeason).toBe(2026);
    expect(profile.seasonStatsScope).toBe('current_regular_season');
  });

  it('does not add prior-season fallback behavior to NCAAF profiles', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T16:00:00Z'));
    const ncaafTeam = { id: 44, name: 'Tigers', full_name: 'Example Tigers' };
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([ncaafTeam]);
    const getSeasonStats = vi.spyOn(ballDontLieService, 'getTeamSeasonStats').mockResolvedValue([]);
    vi.spyOn(ballDontLieService, 'getStandingsGeneric').mockResolvedValue([]);

    const profile = await fetchTeamProfile('Example Tigers', 'NCAAF');

    expect(getSeasonStats).toHaveBeenCalledTimes(1);
    expect(getSeasonStats.mock.calls[0][1].season).toBe(2026);
    expect(profile.seasonStatsSeason).toBe(2026);
  });

  it('places prior-season NFL provenance in the verified tape and labels the visible baseline', () => {
    const stats = {
      total_points_per_game: 28.4,
      opp_total_points_per_game: 20.1,
      rushing_yards_per_game: 131.2,
      net_passing_yards_per_game: 239.7
    };
    const tape = buildVerifiedTaleOfTape(
      'Home Team',
      'Away Team',
      {
        record: '12-5', seasonStats: stats, seasonStatsSeason: 2025,
        seasonStatsScope: 'prior_completed_regular_season',
        seasonStatsLabel: '2025 prior completed regular-season baseline (not current-season form)'
      },
      {
        record: '9-8', seasonStats: stats, seasonStatsSeason: 2025,
        seasonStatsScope: 'prior_completed_regular_season',
        seasonStatsLabel: '2025 prior completed regular-season baseline (not current-season form)'
      },
      'NFL'
    );

    expect(tape.rows.map((row) => row.name)).toEqual([
      'L5 Form', 'Record', 'Points/Gm · 2025 baseline', 'Opp Pts/Gm · 2025 baseline',
      'Rush Yds/Gm · 2025 baseline', 'Pass Yds/Gm · 2025 baseline', 'Key Injuries'
    ]);
    expect(tape.rows.slice(2, 6).map((row) => row.token)).toEqual([
      'POINTS_GM', 'OPP_PTS_GM', 'RUSH_YDS_GM', 'PASS_YDS_GM'
    ]);
    expect(tape.text).toContain('Home Team: 2025 prior completed regular-season baseline (not current-season form)');
    expect(tape.provenance.home).toMatchObject({ season: 2025, scope: 'prior_completed_regular_season' });
    expect(tape.provenance.home.label).toContain('not current-season form');
    expect(tape.rows.find((row) => row.token === 'POINTS_GM').statProvenance.home.season).toBe(2025);
  });

  it('emits NCAAF yardage tokens that map directly to iOS-decoded storage keys', () => {
    const homeStats = {
      passing_yards_per_game: 260.5,
      rushing_yards_per_game: 180.2,
      opp_passing_yards: 2200,
      opp_rushing_yards: 1300,
    };
    const awayStats = {
      passing_yards_per_game: 235.1,
      rushing_yards_per_game: 155.4,
      opp_passing_yards: 2450,
      opp_rushing_yards: 1510,
    };
    const tape = buildVerifiedTaleOfTape(
      'Home College',
      'Away College',
      { record: '9-3', seasonStats: homeStats },
      { record: '8-4', seasonStats: awayStats },
      'NCAAF',
    );

    expect(tape.rows.map((row) => row.token)).toEqual([
      'L5_FORM',
      'RECORD',
      'PASS_YDS_GM',
      'RUSH_YDS_GM',
      'TOTAL_YPG',
      'OPP_PASSING_YARDS',
      'OPP_RUSHING_YARDS',
      'KEY_INJURIES',
    ]);
    expect(tape.rows.map((row) => row.token)).not.toEqual(expect.arrayContaining([
      'TOTAL_YDS_GM', 'OPP_PASS_YDS', 'OPP_RUSH_YDS',
    ]));
  });

  it('batches all NFL prop-player game logs into one BDL request and caches each summary', async () => {
    axiosGet.mockResolvedValue({
      data: {
        data: [
          logRow(1, '2026-09-01', { passing_yards: 100 }),
          logRow(2, '2026-09-03', { receiving_yards: 80, receiving_targets: 7 }),
          logRow(1, '2026-09-08', { passing_yards: 250 }),
          logRow(2, '2026-09-10', { receiving_yards: 40, receiving_targets: 5 })
        ],
        meta: { next_cursor: null }
      }
    });

    const first = await ballDontLieService.getNflPlayerGameLogsBatch([1, 2], 2026, 5);

    expect(axiosGet).toHaveBeenCalledTimes(1);
    const requestUrl = axiosGet.mock.calls[0][0];
    expect(requestUrl).toContain('player_ids[]=1');
    expect(requestUrl).toContain('player_ids[]=2');
    expect(requestUrl).toContain('season_type=2');
    expect(first[1].games.map(game => game.pass_yds)).toEqual([250, 100]);
    expect(first[2].games.map(game => game.rec_yds)).toEqual([40, 80]);

    const second = await ballDontLieService.getNflPlayerGameLogsBatch([2, 1], 2026, 5);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('keeps NFL preseason logs in their own season-type cache and request scope', async () => {
    axiosGet.mockResolvedValue({
      data: {
        data: [logRow(1, '2026-08-08', { rushing_yards: 44 })],
        meta: { next_cursor: null }
      }
    });

    const result = await ballDontLieService.getNflPlayerGameLogsBatch(
      [1],
      2026,
      5,
      15,
      { seasonType: 1 },
    );

    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0][0]).toContain('seasons[]=2026');
    expect(axiosGet.mock.calls[0][0]).toContain('season_type=1');
    expect(result[1].games[0].rush_yds).toBe(44);
  });

  it('falls back to per-player game-log requests if a multi-ID request is rejected', async () => {
    axiosGet.mockImplementation(async (url) => {
      if (url.includes('player_ids[]=1') && url.includes('player_ids[]=2')) {
        const error = new Error('multi-player query rejected');
        error.response = { status: 400 };
        throw error;
      }
      const playerId = url.includes('player_ids[]=1') ? 1 : 2;
      return {
        data: {
          data: [logRow(playerId, '2026-09-08', { rushing_yards: playerId * 10 })]
        }
      };
    });

    const result = await ballDontLieService.getNflPlayerGameLogsBatch([1, 2], 2026, 5);

    expect(axiosGet).toHaveBeenCalledTimes(3);
    expect(result[1].averages.rush_yds).toBe('10.0');
    expect(result[2].averages.rush_yds).toBe('20.0');
  });

  it('follows cursor pages before summarizing batched NFL game logs', async () => {
    axiosGet
      .mockResolvedValueOnce({
        data: {
          data: [logRow(1, '2026-09-01', { passing_yards: 100 })],
          meta: { next_cursor: 123 }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: [logRow(1, '2026-09-08', { passing_yards: 250 })],
          meta: { next_cursor: null }
        }
      });

    const result = await ballDontLieService.getNflPlayerGameLogsBatch([1], 2026, 5);

    expect(axiosGet).toHaveBeenCalledTimes(2);
    expect(axiosGet.mock.calls[1][0]).toContain('cursor=123');
    expect(result[1].games.map(game => game.pass_yds)).toEqual([250, 100]);
  });

  it('follows every NCAAF games cursor while preserving the exact two-date request and deduping overlap', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      date: '2099-09-05T16:00:00Z',
    }));
    const getGames = vi.fn(async (params) => {
      if (params.cursor === 'page-3') {
        return {
          data: [{ id: 102, date: '2099-09-06T01:00:00Z' }],
          meta: { next_cursor: null },
        };
      }
      if (params.cursor === 'page-2') {
        return {
          data: [
            { id: 100, date: '2099-09-05T16:00:00Z' },
            { id: 101, date: '2099-09-06T00:30:00Z' },
          ],
          meta: { next_cursor: 'page-3' },
        };
      }
      return { data: firstPage, meta: { next_cursor: 'page-2' } };
    });
    vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue({ getGames });
    const params = { dates: ['2099-09-05', '2099-09-06'], per_page: 100 };

    const games = await ballDontLieService.getGames('americanfootball_ncaaf', params);

    expect(getGames).toHaveBeenCalledTimes(3);
    expect(getGames).toHaveBeenNthCalledWith(1, params);
    expect(getGames).toHaveBeenNthCalledWith(2, { ...params, cursor: 'page-2' });
    expect(getGames).toHaveBeenNthCalledWith(3, { ...params, cursor: 'page-3' });
    expect(games).toHaveLength(102);
    expect(games.map(game => game.id).slice(-3)).toEqual([100, 101, 102]);
  });

  it('coalesces concurrent full-season football schedule reads and splits them per team', async () => {
    const getGames = vi.fn().mockResolvedValue({
      data: [
        { id: 1, home_team: home, visitor_team: { id: 99 }, status: 'Final' },
        { id: 2, home_team: { id: 98 }, visitor_team: away, status: 'Final' },
        { id: 3, home_team: home, visitor_team: away, status: 'Final' }
      ]
    });
    vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue({ getGames });

    const paramsFor = (teamId) => ({ team_ids: [teamId], seasons: [2026], per_page: 100 });
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getGames('americanfootball_nfl', paramsFor(11)),
      ballDontLieService.getGames('americanfootball_nfl', paramsFor(22))
    ]);

    expect(getGames).toHaveBeenCalledTimes(1);
    expect(getGames).toHaveBeenCalledWith({ team_ids: [11, 22], seasons: [2026], per_page: 100 });
    expect(homeGames.map(game => game.id)).toEqual([1, 3]);
    expect(awayGames.map(game => game.id)).toEqual([2, 3]);

    await Promise.all([
      ballDontLieService.getGames('americanfootball_nfl', paramsFor(11)),
      ballDontLieService.getGames('americanfootball_nfl', paramsFor(22))
    ]);
    expect(getGames).toHaveBeenCalledTimes(1);
  });

  it('falls back to original per-team schedule reads if a multi-team query is rejected', async () => {
    const getGames = vi.fn().mockImplementation(async (params) => {
      if (params.team_ids.length > 1) throw new Error('multi-team query rejected');
      const teamId = params.team_ids[0];
      return {
        data: [{
          id: teamId,
          home_team: { id: teamId },
          visitor_team: { id: 99 },
          status: 'Final'
        }]
      };
    });
    vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue({ getGames });

    const paramsFor = (teamId) => ({ team_ids: [teamId], seasons: [2026], per_page: 100 });
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getGames('americanfootball_ncaaf', paramsFor(11)),
      ballDontLieService.getGames('americanfootball_ncaaf', paramsFor(22))
    ]);

    expect(getGames).toHaveBeenCalledTimes(3);
    expect(homeGames.map(game => game.id)).toEqual([11]);
    expect(awayGames.map(game => game.id)).toEqual([22]);
  });

  it('does not batch or alter non-football game reads', async () => {
    const getGames = vi.fn().mockResolvedValue({ data: [] });
    vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue({ getGames });

    const homeParams = { team_ids: [11], seasons: [2026], per_page: 100 };
    const awayParams = { team_ids: [22], seasons: [2026], per_page: 100 };
    await Promise.all([
      ballDontLieService.getGames('baseball_mlb', homeParams),
      ballDontLieService.getGames('baseball_mlb', awayParams)
    ]);

    expect(getGames).toHaveBeenCalledTimes(2);
    expect(getGames).toHaveBeenNthCalledWith(1, homeParams);
    expect(getGames).toHaveBeenNthCalledWith(2, awayParams);
  });

  it('coalesces concurrent football team-season reads and preserves per-team caches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { team: { id: 11 }, passing_yards_per_game: 250 },
          { team: { id: 22 }, passing_yards_per_game: 225 }
        ]
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const paramsFor = (teamId) => ({ teamId, season: 2026, postseason: false });
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats('americanfootball_nfl', paramsFor(11)),
      ballDontLieService.getTeamSeasonStats('americanfootball_nfl', paramsFor(22))
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = fetchMock.mock.calls[0][0];
    expect(requestUrl).toContain('team_ids[]=11');
    expect(requestUrl).toContain('team_ids[]=22');
    expect(homeStats).toEqual([{ team: { id: 11 }, passing_yards_per_game: 250 }]);
    expect(awayStats).toEqual([{ team: { id: 22 }, passing_yards_per_game: 225 }]);

    await Promise.all([
      ballDontLieService.getTeamSeasonStats('americanfootball_nfl', paramsFor(11)),
      ballDontLieService.getTeamSeasonStats('americanfootball_nfl', paramsFor(22))
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to original one-team season-stat reads for unlabelled rows', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url) => {
      const hasHome = url.includes('team_ids[]=11');
      const hasAway = url.includes('team_ids[]=22');
      if (hasHome && hasAway) {
        return { ok: true, json: async () => ({ data: [{ passing_yards_per_game: 999 }] }) };
      }
      return {
        ok: true,
        json: async () => ({ data: [{ passing_yards_per_game: hasHome ? 250 : 225 }] })
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: 11, season: 2026 }),
      ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: 22, season: 2026 })
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(homeStats[0].passing_yards_per_game).toBe(250);
    expect(awayStats[0].passing_yards_per_game).toBe(225);
  });

  it('preserves the existing game-log averages, splits, and trend calculations', () => {
    const summary = summarizeNflPlayerGameLogs([
      logRow(1, '2026-09-01', { rushing_attempts: 5, rushing_yards: 20, receiving_targets: 2, receptions: 1 }),
      logRow(1, '2026-09-15', { rushing_attempts: 15, rushing_yards: 80, receiving_targets: 8, receptions: 6 })
    ], 5);

    expect(summary.games[0].rush_yds).toBe(80);
    expect(summary.averages.rush_yds).toBe('50.0');
    expect(summary.targetTrend).toMatchObject({ lastGame: 8, l2Avg: '5.0' });
    expect(summary.usageTrend).toMatchObject({ lastGame: 29, level: 'ELITE' });
    expect(summary.splits.home.games + summary.splits.away.games).toBe(2);
  });

  it('does not summarize a partial NFL box as a completed game log', () => {
    const summary = summarizeNflPlayerGameLogs([
      logRow(1, '2026-09-01', { rushing_attempts: 10 }),
      {
        ...logRow(1, '2026-09-15', { rushing_attempts: 99 }),
        game: { ...logRow(1, '2026-09-15').game, status: 'In Progress' },
      },
    ], 5);

    expect(summary.gamesAnalyzed).toBe(1);
    expect(summary.averages.rush_att).toBe('10.0');
  });

  it('uses cached team season stats for the starting-QB lookup', async () => {
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([
      { id: 11, name: 'Team', full_name: 'Home Team', abbreviation: 'HOM' }
    ]);
    const seasonStats = vi.spyOn(ballDontLieService, 'getNflSeasonStatsByTeam').mockResolvedValue([
      {
        player: { id: 7, first_name: 'Test', last_name: 'Quarterback', position_abbreviation: 'QB', team: { full_name: 'Home Team' } },
        passing_yards: 1234,
        passing_touchdowns: 9,
        games_played: 6
      }
    ]);

    const result = await fetchQBStatsByName('Test Quarterback', 'Home Team', 2026);

    expect(seasonStats).toHaveBeenCalledWith(11, 2026);
    expect(result).toMatchObject({ name: 'Test Quarterback', passingYards: 1234, passingTds: 9 });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('keeps home and away NFL rosters aligned with their own season stats', async () => {
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([home, away]);
    const roster = vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockImplementation(async (teamId) => [{
      depth: 1,
      position: 'QB',
      player: {
        id: teamId,
        first_name: teamId === 11 ? 'Home' : 'Away',
        last_name: 'Quarterback',
        position_abbreviation: 'QB'
      }
    }]);
    const seasonStats = vi.spyOn(ballDontLieService, 'getNflSeasonStatsByTeam').mockImplementation(async (teamId) => [{
      player: { id: teamId },
      passing_yards: teamId === 11 ? 3100 : 2700,
      passing_touchdowns: teamId === 11 ? 25 : 19
    }]);

    const result = await fetchKeyPlayers('Home Team', 'Away Team', 'NFL', 2026);

    expect(roster.mock.calls.map(([teamId]) => teamId)).toEqual([11, 22]);
    expect(seasonStats.mock.calls.map(([teamId]) => teamId)).toEqual([11, 22]);
    expect(result.home.offense[0]).toMatchObject({ name: 'Home Quarterback', passingYards: 3100 });
    expect(result.away.offense[0]).toMatchObject({ name: 'Away Quarterback', passingYards: 2700 });
  });

  it('reuses cached roster calls when building roster depth', async () => {
    vi.spyOn(ballDontLieService, 'getTeamByNameGeneric')
      .mockResolvedValueOnce(home)
      .mockResolvedValueOnce(away);
    const roster = vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockImplementation(async (teamId) => [
      {
        depth: 1,
        position: 'QB',
        player: { id: teamId, first_name: `QB${teamId}`, last_name: 'Player' }
      }
    ]);

    const result = await ballDontLieService.getNflRosterDepth('Home Team', 'Away Team', 2026);

    expect(roster).toHaveBeenCalledTimes(2);
    expect(result.home).toHaveLength(1);
    expect(result.away).toHaveLength(1);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('does not fetch unused team-game rows for red-zone defense', async () => {
    const teamStats = vi.spyOn(ballDontLieService, 'getTeamStats').mockResolvedValue([]);
    vi.spyOn(ballDontLieService, 'getTeamSeasonStats').mockImplementation(async (_sport, { teamId }) => [{
      team: { id: teamId },
      opp_total_points_per_game: teamId === 11 ? 18 : 24
    }]);

    const result = await nflFetchers.RED_ZONE_DEFENSE('americanfootball_nfl', home, away, 2026);

    expect(teamStats).not.toHaveBeenCalled();
    expect(result.home.opp_ppg).toBe('18.0');
    expect(result.away.opp_ppg).toBe('24.0');
  });

  it('uses the scout-report schedule query shape for NFL L5 and schedule tokens', async () => {
    const calls = [];
    vi.spyOn(ballDontLieService, 'getGames').mockImplementation(async (_sport, params) => {
      calls.push(params);
      return [];
    });

    await nflFetchers.EPA_LAST_5('americanfootball_nfl', home, away, 2026);
    await nflFetchers.SCHEDULE_CONTEXT('americanfootball_nfl', home, away, 2026);

    expect(calls).toHaveLength(4);
    expect(calls.every(params => params.per_page === 100)).toBe(true);
    expect(calls.every(params => params.seasons[0] === 2026)).toBe(true);
  });
});
