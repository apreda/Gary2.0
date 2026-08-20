import { beforeEach, describe, expect, it, vi } from 'vitest';

const bdl = vi.hoisted(() => ({
  getGames: vi.fn(),
  getTeams: vi.fn(),
  getTeamStats: vi.fn(),
  getOddsV2: vi.fn(),
  getPlayersActive: vi.fn(),
  getNflAdvancedRushingStats: vi.fn(),
  getNflAdvancedReceivingStats: vi.fn(),
  getNflPlayerGameLogsBatch: vi.fn(),
  getNcaafPlayerSeasonStats: vi.fn(),
  getNflPlayerInjuries: vi.fn(),
  getNflRosterDepth: vi.fn(),
  getNflStandings: vi.fn(),
  getNflPlayerSeasonStats: vi.fn(),
}));

vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: bdl,
}));

// The Gary layer is a live content-model call; tests keep the computed detail
// by letting the read attach deterministically.
vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: vi.fn(async () => JSON.stringify({ reads: [] })),
}));

const {
  aggregateFootballTeamStats,
  footballDataInternals,
  footballSeasonForDate,
  loadFootballSlate,
  loadFootballTeamGameStats,
  selectFootballOddsByGame,
} = await import('../../../src/services/insights/footballData.js');
const { generateInsightConnections } = await import('../../../src/services/insights/generateInsightConnections.js');

const away = { id: 1, abbreviation: 'BUF', name: 'Bills', full_name: 'Buffalo Bills' };
const home = { id: 2, abbreviation: 'MIA', name: 'Dolphins', full_name: 'Miami Dolphins' };
const nflSlateGame = {
  id: 900,
  date: '2026-09-11T00:20:00.000Z', // Sep 10, 8:20 PM ET
  season: 2026,
  week: 1,
  visitor_team: away,
  home_team: home,
};

function historicalGame(id = 800) {
  return {
    id,
    date: '2026-09-01T17:00:00.000Z',
    season: 2026,
    status: 'Final',
    visitor_team: away,
    home_team: home,
    visitor_team_score: 24,
    home_team_score: 14,
  };
}

function teamBox(team, values, id = 800) {
  return {
    team,
    game: historicalGame(id),
    ...values,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  bdl.getGames.mockResolvedValue([]);
  bdl.getTeams.mockResolvedValue([]);
  bdl.getTeamStats.mockResolvedValue([]);
  bdl.getOddsV2.mockResolvedValue([]);
  bdl.getPlayersActive.mockResolvedValue({ data: [], meta: null });
  bdl.getNflAdvancedRushingStats.mockResolvedValue([]);
  bdl.getNflAdvancedReceivingStats.mockResolvedValue([]);
  bdl.getNflPlayerGameLogsBatch.mockResolvedValue({});
  bdl.getNcaafPlayerSeasonStats.mockResolvedValue([]);
  bdl.getNflPlayerInjuries.mockResolvedValue([]);
  bdl.getNflRosterDepth.mockResolvedValue({ home: [], away: [] });
  bdl.getNflStandings.mockResolvedValue([]);
  bdl.getNflPlayerSeasonStats.mockResolvedValue([]);
});

describe('football season and exact-date slates', () => {
  it('uses August as the season cutover', () => {
    expect(footballSeasonForDate('2026-07-31')).toBe(2025);
    expect(footballSeasonForDate('2026-08-01')).toBe(2026);
    expect(footballSeasonForDate('2027-01-10')).toBe(2026);
    expect(footballSeasonForDate('bad-date')).toBeNull();
  });

  it('loads both UTC dates and every NFL season type, then keeps only the requested ET slate', async () => {
    const service = {
      getGames: vi.fn().mockResolvedValue([
        nflSlateGame,
        nflSlateGame,
        { ...nflSlateGame, id: 901, date: '2026-09-12T00:20:00.000Z' },
      ]),
    };
    const games = await loadFootballSlate({ bdl: service, league: 'NFL', date: '2026-09-10' });

    expect(service.getGames).toHaveBeenCalledWith(
      'americanfootball_nfl',
      {
        dates: ['2026-09-10', '2026-09-11'],
        season_type: [1, 2, 3],
        per_page: 100,
      },
    );
    expect(games).toHaveLength(1);
    expect(games[0].away_team.id).toBe(away.id);
    expect(footballDataInternals.gameDateFromRow({ game: { date: '2026-09-10T00:20:00.000Z' } }))
      .toBe('2026-09-09');
  });

  it('uses the existing generic NCAAF method with an exact dates array', async () => {
    const collegeGame = {
      ...nflSlateGame,
      id: 901,
      date: '2026-08-29T16:00:00.000Z',
      visitor_team: { id: 10, abbreviation: 'UNC', conference: 1 },
      home_team: { id: 43, abbreviation: 'TCU', conference: 3 },
    };
    const service = {
      getGames: vi.fn().mockResolvedValue([collegeGame]),
      getTeams: vi.fn().mockResolvedValue([
        { id: 10, conference: 1 },
        { id: 43, conference: 3 },
      ]),
    };
    const games = await loadFootballSlate({ bdl: service, league: 'ncaaf', date: '2026-08-29' });

    expect(service.getGames).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { dates: ['2026-08-29', '2026-08-30'], per_page: 100 },
    );
    expect(games.map((game) => game.id)).toEqual([901]);
  });

  it('assigns confirmed NCAAF kickoffs before 6 AM ET to the prior insight slate', async () => {
    const service = {
      getGames: vi.fn().mockResolvedValue([
        {
          id: 902,
          date: '2026-08-30T05:30:00.000Z',
          visitor_team: { id: 10, abbreviation: 'UNC' },
          home_team: { id: 43, abbreviation: 'TCU' },
        },
        {
          id: 903,
          date: '2026-08-30T10:00:00.000Z',
          visitor_team: { id: 10, abbreviation: 'UNC' },
          home_team: { id: 43, abbreviation: 'TCU' },
        },
      ]),
      getTeams: vi.fn().mockResolvedValue([
        { id: 10, conference: 1 },
        { id: 43, conference: 3 },
      ]),
    };

    const games = await loadFootballSlate({ bdl: service, league: 'ncaaf', date: '2026-08-29' });
    expect(games.map((game) => game.id)).toEqual([902]);
  });

  it('does not spend a team-directory request on an honest NCAAF dark day', async () => {
    const service = {
      getGames: vi.fn().mockResolvedValue([]),
      getTeams: vi.fn(),
    };

    await expect(loadFootballSlate({ bdl: service, league: 'ncaaf', date: '2026-08-15' }))
      .resolves.toEqual([]);
    expect(service.getTeams).not.toHaveBeenCalled();
  });

  it('merges the next provider UTC date, keeps late ET/date-only games, and removes FCS', async () => {
    const service = {
      getGames: vi.fn().mockResolvedValue([
        {
          id: 910,
          date: '2026-09-06T01:30:00.000Z', // 9:30 PM ET Sep 5
          visitor_team: { id: 10, conference: 1 },
          home_team: { id: 43, conference: 3 },
        },
        {
          id: 911,
          date: '2026-09-05',
          visitor_team: { id: 11, conference: 10 },
          home_team: { id: 44, conference: 4 },
        },
        {
          id: 912,
          date: '2026-09-05T20:00:00Z',
          visitor_team: { id: 12, conference: 20 },
          home_team: { id: 45, conference: 4 },
        },
        {
          id: 913,
          date: '2026-09-06T18:00:00Z',
          // A next-ET-day identity gap must not suppress the Sep 5 slate.
          visitor_team: { id: 13 },
          home_team: { id: 46 },
        },
      ]),
      getTeams: vi.fn(),
    };
    service.getTeams.mockResolvedValue([
      { id: 10, conference: 1 }, { id: 43, conference: 3 },
      { id: 11, conference: 10 }, { id: 44, conference: 4 },
      { id: 12, conference: 20 }, { id: 45, conference: 4 },
    ]);

    const games = await loadFootballSlate({ bdl: service, league: 'NCAAF', date: '2026-09-05' });

    expect(service.getGames).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { dates: ['2026-09-05', '2026-09-06'], per_page: 100 },
    );
    expect(games.map((game) => game.id)).toEqual([910, 911]);
    expect(service.getTeams).toHaveBeenCalledWith('americanfootball_ncaaf');
  });

  it('fails closed when the provider cannot resolve an NCAAF team to FBS or FCS', async () => {
    const service = {
      getGames: vi.fn().mockResolvedValue([{
        id: 920,
        date: '2026-09-05T20:00:00Z',
        visitor_team: { id: 10 },
        home_team: { id: 43, conference: 3 },
      }]),
      getTeams: vi.fn().mockResolvedValue([{ id: 43, conference: 3 }]),
    };
    await expect(loadFootballSlate({ bdl: service, league: 'NCAAF', date: '2026-09-05' }))
      .rejects.toThrow(/provider-grounded FBS identity/);
  });
});

describe('football team data grounding', () => {
  it('requests only the current season through the day before the slate', async () => {
    const service = { getTeamStats: vi.fn().mockResolvedValue([
      teamBox(away, { rushing_yards: 120 }, 800),
      teamBox(home, { rushing_yards: 90 }, 800),
      { ...teamBox(away, { rushing_yards: 999 }, 801), game: { ...historicalGame(801), season: 2025 } },
      { ...teamBox(away, { rushing_yards: 999 }, 802), game: { ...historicalGame(802), date: '2026-09-10T17:00:00Z' } },
      { ...teamBox(away, { rushing_yards: 999 }, 803), game: { ...historicalGame(803), status: 'Scheduled' } },
    ]) };

    const rows = await loadFootballTeamGameStats({
      bdl: service,
      league: 'nfl',
      season: 2026,
      date: '2026-09-10',
      games: [{ ...nflSlateGame, away_team: away }],
    });

    expect(service.getTeamStats).toHaveBeenCalledWith(
      'americanfootball_nfl',
      { team_ids: [1, 2], seasons: [2026], per_page: 100, season_type: 2 },
      10,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.game.season === 2026)).toBe(true);
  });

  it('uses NCAAF end_date because that route supports the server-side cutoff', async () => {
    const service = {
      getGames: vi.fn().mockResolvedValue([]),
      getTeamStats: vi.fn().mockResolvedValue([]),
    };
    await loadFootballTeamGameStats({
      bdl: service,
      league: 'ncaaf',
      season: 2026,
      date: '2026-09-12',
      games: [{
        id: 457200,
        away_team: { id: 10 },
        home_team: { id: 43 },
      }],
    });

    expect(service.getTeamStats).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { team_ids: [10, 43], seasons: [2026], end_date: '2026-09-12', per_page: 100 },
      10,
    );
    expect(service.getGames).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { team_ids: [10, 43], seasons: [2026], end_date: '2026-09-12', per_page: 100 },
      10,
    );
  });

  it('joins NCAAF team boxes to authoritative final games because the box schema omits status', async () => {
    const finalGame = {
      id: 457100,
      // Sep 11, 8:30 PM ET lives under Sep 12 in the provider's UTC date.
      date: '2026-09-12T00:30:00.000Z',
      season: 2026,
      status: 'post',
      visitor_team: { id: 10 },
      home_team: { id: 43 },
      away_score: 35,
      home_score: 14,
    };
    const service = {
      getGames: vi.fn().mockResolvedValue([
        finalGame,
        { ...finalGame, id: 457101, status: 'in' },
      ]),
      getTeamStats: vi.fn().mockResolvedValue([
        {
          team: { id: 10 },
          game: { id: 457100, date: finalGame.date, season: 2026, week: 2 },
          rushing_yards: 220,
        },
        {
          team: { id: 10 },
          game: { id: 457101, date: finalGame.date, season: 2026, week: 2 },
          rushing_yards: 999,
        },
      ]),
    };

    const rows = await loadFootballTeamGameStats({
      bdl: service,
      league: 'ncaaf',
      season: 2026,
      date: '2026-09-12',
      games: [{ id: 457200, away_team: { id: 10 }, home_team: { id: 43 } }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rushing_yards: 220,
      game: { id: 457100, status: 'post', away_score: 35, home_score: 14 },
    });
  });

  it('reports an unavailable NCAAF final-game index as a lane failure, not an honest empty sample', async () => {
    const service = {
      getGames: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      getTeamStats: vi.fn(),
    };

    await expect(loadFootballTeamGameStats({
      bdl: service,
      league: 'ncaaf',
      season: 2026,
      date: '2026-09-12',
      games: [{ id: 457200, away_team: { id: 10 }, home_team: { id: 43 } }],
    })).rejects.toThrow(/final-game index unavailable.*provider unavailable/);
    expect(service.getTeamStats).not.toHaveBeenCalled();
  });

  it('aggregates only actual box fields and keeps zero turnovers as real data', () => {
    const rows = [
      teamBox(away, {
        rushing_yards: 120,
        net_passing_yards: 240,
        total_yards: 380,
        turnovers: 0,
        yards_per_play: 6.2,
        sacks: 1,
        third_down_conversions: 6,
        third_down_attempts: 12,
        possession_time: '31:30',
      }),
    ];
    const stats = aggregateFootballTeamStats(rows, { league: 'nfl' }).get('1');

    expect(stats).toMatchObject({
      games: 1,
      rushingYardsPerGame: 120,
      passingYardsPerGame: 240,
      totalYardsPerGame: 380,
      turnoversPerGame: 0,
      yardsPerPlay: 6.2,
      sacksPerGame: 1,
      pointsPerGame: 24,
      thirdDownPct: 50,
    });
    expect(stats.possessionSecondsPerGame).toBe(1890);
  });

  it('chooses a deterministic complete BDL odds row and drops other games', () => {
    const selected = selectFootballOddsByGame([
      { game_id: 900, vendor: 'Sparse', total_value: '47.5', updated_at: '2026-09-10T10:00:00Z' },
      { game_id: 900, vendor: 'Complete', total_value: '48.5', spread_home_value: '-3', moneyline_home_odds: -150, updated_at: '2026-09-10T09:00:00Z' },
      { game_id: 999, vendor: 'Wrong game', total_value: '70' },
      { game_id: 900, vendor: 'Missing total' },
    ], new Set([900]));

    expect([...selected.keys()]).toEqual(['900']);
    expect(selected.get('900').row.vendor).toBe('Complete');
    expect(selected.get('900').total).toBe(48.5);
  });
});

describe('football generator registration and row contract', () => {
  it('builds NFL fantasy usage, recent trend, and market context only from current grounded data', async () => {
    bdl.getGames.mockResolvedValue([nflSlateGame]);
    bdl.getNflAdvancedRushingStats.mockResolvedValue([
      {
        player: { id: 101, first_name: 'Feature', last_name: 'Back', position_abbreviation: 'RB' },
        rush_attempts: 60,
      },
    ]);
    bdl.getNflAdvancedReceivingStats.mockResolvedValue([
      {
        player: { id: 202, first_name: 'Volume', last_name: 'Wideout', position_abbreviation: 'WR' },
        targets: 32,
      },
      {
        player: { id: 303, first_name: 'Other', last_name: 'Player', position_abbreviation: 'RB' },
        targets: 40,
      },
    ]);
    bdl.getPlayersActive.mockResolvedValue({
      data: [
        { id: 101, first_name: 'Feature', last_name: 'Back', position_abbreviation: 'RB', team: away },
        { id: 202, first_name: 'Volume', last_name: 'Wideout', position_abbreviation: 'WR', team: home },
        { id: 303, first_name: 'Other', last_name: 'Player', position_abbreviation: 'RB', team: { id: 99 } },
      ],
      meta: null,
    });
    bdl.getNflPlayerGameLogsBatch.mockResolvedValue({
      101: {
        games: [
          { date: '2026-09-10T17:00:00Z', rush_att: 99, targets: 10 },
          { date: '2026-09-07T17:00:00Z', rush_att: 19, targets: 3 },
          { date: '2026-08-31T17:00:00Z', rush_att: 17, targets: 3 },
          { date: '2026-08-24T17:00:00Z', rush_att: 8, targets: 2 },
          { date: '2026-08-17T17:00:00Z', rush_att: 8, targets: 2 },
          { date: '2026-08-10T17:00:00Z', rush_att: 7, targets: 2 },
        ],
      },
      202: {
        games: [
          { date: '2026-09-07T17:00:00Z', targets: 9 },
          { date: '2026-08-31T17:00:00Z', targets: 8 },
          { date: '2026-08-24T17:00:00Z', targets: 7 },
          { date: '2026-08-17T17:00:00Z', targets: 6 },
        ],
      },
    });
    bdl.getOddsV2.mockResolvedValue([{
      game_id: 900,
      vendor: 'Book A',
      total_value: 52,
      spread_home_value: -8,
    }]);

    const result = await generateInsightConnections({ date: '2026-09-10', league: 'NFL' });
    const fantasy = result.connections.filter((row) => row.category.startsWith('fantasy_'));

    expect(new Set(fantasy.map((row) => row.category))).toEqual(new Set([
      'fantasy_usage', 'fantasy_trend', 'fantasy_matchup',
    ]));
    expect(bdl.getPlayersActive).toHaveBeenCalledWith(
      'americanfootball_nfl',
      { player_ids: ['101', '202', '303'], per_page: 100 },
      10,
    );
    expect(fantasy.every((row) => row.game_id === 900)).toBe(true);
    expect(fantasy.every((row) => ['101', '202'].includes(String(row.player_id)))).toBe(true);
    expect(fantasy.every((row) => row.meta?.season === 2026)).toBe(true);
    expect(fantasy.find((row) => row.player_id === 101 && row.category === 'fantasy_usage')?.detail)
      .not.toContain('99');
    expect(fantasy.every((row) => ['1', '2'].includes(String(row.team_id)))).toBe(true);
    expect(fantasy.every((row) => row.meta?.kind === row.category)).toBe(true);
    expect(fantasy.find((row) => row.category === 'fantasy_usage')?.detail).toMatch(/not a projection|snap-share/);
    expect(fantasy.find((row) => row.category === 'fantasy_matchup')?.detail).toContain('not a coverage grade or projection');
  });

  it('keeps the NFL fantasy desk empty before current regular-season opportunity exists', async () => {
    bdl.getGames.mockResolvedValue([{
      ...nflSlateGame,
      date: '2026-08-16T00:00:00.000Z',
      season_type: 1,
    }]);
    bdl.getNflAdvancedRushingStats.mockResolvedValue([]);
    bdl.getNflAdvancedReceivingStats.mockResolvedValue([]);

    const result = await generateInsightConnections({ date: '2026-08-15', league: 'NFL' });

    expect(result.connections.filter((row) => row.category.startsWith('fantasy_'))).toEqual([]);
  });

  it('uses a roster-verified, visibly labeled prior-season NFL baseline during preseason', async () => {
    bdl.getGames.mockResolvedValue([{
      ...nflSlateGame,
      date: '2026-08-16T00:00:00.000Z',
      season_type: 1,
    }]);
    bdl.getNflAdvancedRushingStats.mockImplementation(async ({ season }) => season === 2025 ? [{
      player: { id: 101, first_name: 'Feature', last_name: 'Back', position_abbreviation: 'RB' },
      team: { id: 99, abbreviation: 'OLD' },
      rush_attempts: 230,
    }] : []);
    bdl.getNflAdvancedReceivingStats.mockResolvedValue([]);
    bdl.getPlayersActive.mockResolvedValue({
      data: [{ id: 101, first_name: 'Feature', last_name: 'Back', position_abbreviation: 'RB', team: away }],
      meta: null,
    });
    bdl.getNflPlayerGameLogsBatch.mockResolvedValue({
      101: {
        games: [
          { date: '2025-12-28T18:00:00Z', rush_att: 18, targets: 4 },
          { date: '2025-12-21T18:00:00Z', rush_att: 16, targets: 3 },
          { date: '2025-12-14T18:00:00Z', rush_att: 17, targets: 2 },
        ],
      },
    });

    const result = await generateInsightConnections({ date: '2026-08-15', league: 'NFL' });
    const fantasy = result.connections.filter((row) => row.category.startsWith('fantasy_'));

    expect(fantasy.map((row) => row.category)).toEqual(['fantasy_usage']);
    expect(fantasy[0]).toMatchObject({ player_id: 101, team_id: 1, game_id: 900 });
    expect(fantasy[0].headline).toContain('2025 baseline');
    expect(fantasy[0].detail).toContain('prior-season baseline, not current form');
    expect(fantasy[0].meta).toMatchObject({
      kind: 'fantasy_usage',
      team: 'BUF',
      season: 2025,
      evidence_scope: 'prior_season_baseline',
    });
    expect(bdl.getNflPlayerGameLogsBatch).toHaveBeenCalledWith([101], 2025, 5);
  });

  it('emits exact-game NFL rows in only the supported grounded categories', async () => {
    bdl.getGames.mockResolvedValue([nflSlateGame]);
    bdl.getTeamStats.mockResolvedValue([
      teamBox(away, {
        rushing_yards: 130,
        net_passing_yards: 190,
        total_yards: 350,
        turnovers: 0,
        yards_per_play: 6.1,
        sacks: 1,
      }),
      teamBox(home, {
        rushing_yards: 80,
        net_passing_yards: 250,
        total_yards: 330,
        turnovers: 3,
        yards_per_play: 5.4,
        sacks: 4,
      }),
    ]);

    const result = await generateInsightConnections({ date: '2026-09-10', league: 'NFL' });

    expect(result.season).toBe(2026);
    expect(result.gameCount).toBe(1);
    expect(new Set(result.connections.map((row) => row.category))).toEqual(new Set([
      'trenches', 'quarterback', 'turnover_edge', 'explosive_play', 'pass_rush', 'pace_script',
    ]));
    expect(result.connections.every((row) => row.game_id === 900)).toBe(true);
    expect(result.connections.every((row) => row.game === 'BUF @ MIA')).toBe(true);
    expect(result.connections.every((row) => row.meta?.source === 'balldontlie_team_stats')).toBe(true);
    expect(result.connections.some((row) => /SP\+|FPI|EPA|havoc/i.test(`${row.headline} ${row.detail}`))).toBe(false);
  });

  it('keeps a new-season NCAAF slate honest when current-season stats are absent', async () => {
    bdl.getGames.mockResolvedValue([{
      id: 457157,
      date: '2026-08-29T16:00:00.000Z',
      season: 2026,
      visitor_team: { id: 10, abbreviation: 'UNC', conference: 1 },
      home_team: { id: 43, abbreviation: 'TCU', conference: 3 },
    }]);
    bdl.getTeams.mockResolvedValue([
      { id: 10, conference: 1 },
      { id: 43, conference: 3 },
    ]);
    bdl.getTeamStats.mockResolvedValue([]);
    bdl.getOddsV2.mockResolvedValue([]);

    const result = await generateInsightConnections({ date: '2026-08-29', league: 'NCAAF' });

    expect(result).toMatchObject({ date: '2026-08-29', league: 'ncaaf', season: 2026, gameCount: 1 });
    expect(result.connections).toEqual([]);
    expect(bdl.getGames).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { dates: ['2026-08-29', '2026-08-30'], per_page: 100 },
    );
  });

  it('does not manufacture an NCAAF fantasy lane from team-game evidence', async () => {
    const slate = {
      id: 457157,
      date: '2026-09-12T16:00:00.000Z',
      season: 2026,
      visitor_team: { id: 10, abbreviation: 'UNC', conference: 1 },
      home_team: { id: 43, abbreviation: 'TCU', conference: 3 },
    };
    const completed = {
      id: 457100,
      date: '2026-09-05T16:00:00.000Z',
      season: 2026,
      status: 'post',
      visitor_team: { id: 10 },
      home_team: { id: 43 },
      away_score: 35,
      home_score: 14,
    };
    bdl.getGames
      .mockResolvedValueOnce([slate])
      .mockResolvedValueOnce([completed]);
    bdl.getTeams.mockResolvedValue([
      { id: 10, conference: 1 },
      { id: 43, conference: 3 },
    ]);
    bdl.getTeamStats.mockResolvedValue([
      {
        team: { id: 10 },
        game: {
          id: 457100,
          date: '2026-09-05T16:00:00.000Z',
          season: 2026,
          week: 2,
        },
        rushing_yards: 220,
        passing_yards: 280,
        total_yards: 500,
        turnovers: 0,
        yards_per_play: 7.2,
      },
      {
        team: { id: 43 },
        game: {
          id: 457100,
          date: '2026-09-05T16:00:00.000Z',
          season: 2026,
          week: 2,
        },
        rushing_yards: 90,
        passing_yards: 160,
        total_yards: 250,
        turnovers: 3,
        yards_per_play: 4.1,
      },
    ]);

    const result = await generateInsightConnections({ date: '2026-09-12', league: 'NCAAF' });

    expect(result.connections.length).toBeGreaterThan(0);
    expect(result.connections.some((row) => row.category.startsWith('fantasy_'))).toBe(false);
    expect(bdl.getNflAdvancedRushingStats).not.toHaveBeenCalled();
    expect(bdl.getNflAdvancedReceivingStats).not.toHaveBeenCalled();
  });

  it('builds NCAAF fantasy usage only from exact current-season player totals', async () => {
    const slate = {
      id: 457157,
      date: '2026-09-12T16:00:00.000Z',
      season: 2026,
      visitor_team: { id: 10, abbreviation: 'UNC', conference: 1 },
      home_team: { id: 43, abbreviation: 'TCU', conference: 3 },
    };
    bdl.getGames.mockResolvedValue([slate]);
    bdl.getTeams.mockResolvedValue([
      { id: 10, conference: 1 },
      { id: 43, conference: 3 },
    ]);
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ season }) => season === 2026 ? [
      {
        player: { id: 501, first_name: 'Current', last_name: 'Quarterback', position_abbreviation: 'QB' },
        team: { id: 10, abbreviation: 'UNC' },
        passing_attempts: 210,
      },
      {
        player: { id: 502, first_name: 'Current', last_name: 'Runner', position_abbreviation: 'RB' },
        team: { id: 10, abbreviation: 'UNC' },
        rushing_attempts: 92,
        receptions: 14,
      },
      {
        player: { id: 503, first_name: 'Current', last_name: 'Receiver', position_abbreviation: 'WR' },
        team: { id: 43, abbreviation: 'TCU' },
        receptions: 48,
      },
    ] : []);

    const result = await generateInsightConnections({ date: '2026-09-12', league: 'NCAAF' });
    const fantasy = result.connections.filter((row) => row.category.startsWith('fantasy_'));

    expect(fantasy).toHaveLength(3);
    expect(fantasy.every((row) => row.category === 'fantasy_usage')).toBe(true);
    expect(fantasy.every((row) => row.meta?.kind === 'fantasy_usage')).toBe(true);
    expect(fantasy.every((row) => row.meta?.evidence_scope === 'current_season')).toBe(true);
    expect(fantasy.every((row) => row.meta?.season === 2026)).toBe(true);
    expect(new Set(fantasy.map((row) => String(row.team_id)))).toEqual(new Set(['10', '43']));
    expect(bdl.getPlayersActive).not.toHaveBeenCalled();
  });

  it('labels and roster-validates an NCAAF prior-season fantasy baseline', async () => {
    const slate = {
      id: 457157,
      date: '2026-08-29T16:00:00.000Z',
      season: 2026,
      visitor_team: { id: 10, abbreviation: 'UNC', conference: 1 },
      home_team: { id: 43, abbreviation: 'TCU', conference: 3 },
    };
    bdl.getGames.mockResolvedValue([slate]);
    bdl.getTeams.mockResolvedValue([
      { id: 10, conference: 1 },
      { id: 43, conference: 3 },
    ]);
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ season }) => season === 2025 ? [
      {
        player: { id: 601, first_name: 'Returning', last_name: 'Back', position_abbreviation: 'RB' },
        team: { id: 10, abbreviation: 'UNC' },
        rushing_attempts: 150,
        receptions: 25,
      },
      {
        player: { id: 602, first_name: 'Departed', last_name: 'Wideout', position_abbreviation: 'WR' },
        team: { id: 43, abbreviation: 'TCU' },
        receptions: 65,
      },
    ] : []);
    bdl.getPlayersActive.mockResolvedValue({
      data: [{
        id: 601,
        first_name: 'Returning',
        last_name: 'Back',
        position_abbreviation: 'RB',
        team: { id: 10, abbreviation: 'UNC' },
      }],
      meta: null,
    });

    const result = await generateInsightConnections({ date: '2026-08-29', league: 'NCAAF' });
    const fantasy = result.connections.filter((row) => row.category.startsWith('fantasy_'));

    expect(fantasy).toHaveLength(1);
    expect(fantasy[0]).toMatchObject({ player_id: 601, team_id: 10, game_id: 457157 });
    expect(fantasy[0].headline).toContain('2025 baseline');
    expect(fantasy[0].detail).toContain('prior-season baseline');
    expect(fantasy[0].meta).toMatchObject({
      kind: 'fantasy_usage',
      team: 'UNC',
      season: 2025,
      evidence_scope: 'prior_season_baseline',
    });
    expect(bdl.getPlayersActive).toHaveBeenCalledWith(
      'americanfootball_ncaaf',
      { player_ids: ['601', '602'], per_page: 100 },
      10,
    );
  });

  it('emits only material BDL total-vs-slate context for the market lane', async () => {
    const games = [
      nflSlateGame,
      { ...nflSlateGame, id: 901, visitor_team: { id: 3, abbreviation: 'KC' }, home_team: { id: 4, abbreviation: 'DEN' } },
      { ...nflSlateGame, id: 902, visitor_team: { id: 5, abbreviation: 'NYJ' }, home_team: { id: 6, abbreviation: 'NE' } },
    ];
    bdl.getGames.mockResolvedValue(games);
    bdl.getOddsV2.mockResolvedValue([
      { game_id: 900, vendor: 'Book A', total_value: '55' },
      { game_id: 901, vendor: 'Book A', total_value: '45' },
      { game_id: 902, vendor: 'Book A', total_value: '44' },
    ]);

    const result = await generateInsightConnections({ date: '2026-09-10', league: 'NFL' });
    const markets = result.connections.filter((row) => row.meta?.source === 'balldontlie_odds');

    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({ category: 'pace_script', game_id: 900, game: 'BUF @ MIA', line_val: 55 });
    expect(markets[0].detail).toContain('median across 3 games');
  });

  it('uses the canonical sportsbook order and never calls a prediction market current', () => {
    const selected = selectFootballOddsByGame([
      { game_id: 900, vendor: 'Kalshi', total_value: '27.5', updated_at: '2026-08-15T22:00:00Z' },
      { game_id: 900, vendor: 'DraftKings', total_value: '35.5', updated_at: '2026-08-15T21:59:00Z' },
      { game_id: 900, vendor: 'FanDuel', total_value: '36.5', updated_at: '2026-08-15T21:58:00Z' },
    ], new Set([900]));
    expect(selected.get('900')).toMatchObject({
      total: 36.5,
      row: { vendor: 'FanDuel' },
    });
  });
});

describe('NFL depth lanes (availability, QB watch, situational)', () => {
  // An August-dated run needs an August slate game — the ET slate filter
  // rightly drops a September kickoff from an Aug 20 request.
  const preseasonSlateGame = { ...nflSlateGame, date: '2026-08-21T00:00:00.000Z' };

  const injuryReport = (overrides = {}) => ({
    player: {
      id: 112,
      first_name: 'Tank',
      last_name: 'Dell',
      position: 'Wide Receiver',
      position_abbreviation: 'WR',
      team: { id: 2, abbreviation: 'MIA', full_name: 'Miami Dolphins', name: 'Dolphins' },
    },
    status: 'Questionable',
    comment: 'Dell (knee) participated in full-team drills Monday, a beat reporter reports.',
    date: '2026-09-08T15:00:00.000Z',
    ...overrides,
  });

  it('carries the wire injury report verbatim with its date, capped and severity-first', async () => {
    bdl.getGames.mockResolvedValue([nflSlateGame]);
    bdl.getNflPlayerInjuries.mockResolvedValue([
      injuryReport(),
      injuryReport({
        player: { id: 500, first_name: 'Left', last_name: 'Tackle', position_abbreviation: 'OT',
                  team: { id: 1, abbreviation: 'BUF', full_name: 'Buffalo Bills', name: 'Bills' } },
        status: 'Out',
        comment: 'Tackle (back) has been ruled out.',
      }),
    ]);

    const result = await generateInsightConnections({ date: '2026-09-10', league: 'NFL' });
    const injuries = result.connections.filter((r) => r.category === 'injury');

    expect(injuries.length).toBe(2);
    // The season-ending word outranks the maybe.
    expect(injuries[0].headline).toContain('Left Tackle (OT) is out for BUF');
    expect(injuries[0].tone).toBe('bad');   // makeRow canon: caution -> bad
    expect(injuries[0].value).toBe('OUT');
    const dell = injuries.find((r) => r.player_id === 112);
    expect(dell.detail).toContain('full-team drills');
    expect(dell.detail).toContain('Reported Sep 8');
    expect(dell.meta.source).toBe('balldontlie_player_injuries');
    expect(injuries.every((r) => r.game_id === 900)).toBe(true);
  });

  it('names each starter with a real season line, labeling a prior-season line as such', async () => {
    bdl.getGames.mockResolvedValue([preseasonSlateGame]);
    bdl.getNflRosterDepth.mockResolvedValue({
      home: [{ id: 57, name: 'Quality Starter', position: 'QB', depth: 1, college: 'Ohio State', experience: '4th Season', injuryStatus: null }],
      away: [{ id: 91, name: 'Rookie Arm', position: 'QB', depth: 1, college: 'Oregon', experience: 'Rookie', injuryStatus: 'Questionable' }],
    });
    bdl.getNflPlayerSeasonStats.mockImplementation(async ({ playerId, season }) => {
      if (playerId === 57 && season === 2025) {
        return [{
          games_played: 17, passing_yards: 4100, passing_completion_pct: 66.8,
          yards_per_pass_attempt: 7.6, passing_touchdowns: 24, passing_interceptions: 9,
        }];
      }
      return [];
    });

    const result = await generateInsightConnections({ date: '2026-08-20', league: 'NFL' });
    const qbs = result.connections.filter((r) => r.category === 'quarterback' && r.player_id != null);

    expect(qbs.length).toBe(2);
    const vet = qbs.find((r) => r.player_id === 57);
    expect(vet.headline).toBe('Quality Starter starts at quarterback for MIA');
    expect(vet.detail).toContain('His 2025 season line');
    expect(vet.detail).toContain('24-9 TD-INT');
    expect(vet.meta.prior_season_line).toBe(true);
    const rookie = qbs.find((r) => r.player_id === 91);
    expect(rookie.detail).toContain('No 2026 or 2025 passing line on file yet');
    expect(rookie.detail).toContain('listed questionable');
  });

  it('reads the standings as a preseason ledger in August and as the real table in season', async () => {
    bdl.getGames.mockImplementation(async (sport, params) =>
      (params?.dates?.[0] === '2026-08-20' ? [preseasonSlateGame] : [nflSlateGame]));
    bdl.getNflStandings.mockResolvedValue([
      { team: { id: 1, abbreviation: 'BUF', conference: 'AFC', division: 'EAST' },
        wins: 1, losses: 0, ties: 0, overall_record: '1-0', home_record: '0-0', road_record: '1-0',
        win_streak: 1, points_for: 28, points_against: 9, point_differential: 19 },
      { team: { id: 2, abbreviation: 'MIA', conference: 'AFC', division: 'EAST' },
        wins: 0, losses: 1, ties: 0, overall_record: '0-1', home_record: '0-1', road_record: '0-0',
        win_streak: -1, points_for: 16, points_against: 24, point_differential: -8 },
    ]);

    const preseason = await generateInsightConnections({ date: '2026-08-20', league: 'NFL' });
    const preRow = preseason.connections.find((r) => r.category === 'situational');
    expect(preRow.detail).toContain('in the preseason');
    expect(preRow.meta.preseason).toBe(true);
    expect(preRow.headline).not.toContain('division game');

    const inSeason = await generateInsightConnections({ date: '2026-09-10', league: 'NFL' });
    const row = inSeason.connections.find((r) => r.category === 'situational');
    expect(row.detail).toContain('this season');
    expect(row.headline).toContain('a division game');
    expect(row.detail).toContain('BUF is 1-0 on the road');
    expect(row.meta.source).toBe('balldontlie_standings');
  });

  it('keeps every NFL depth lane an NCAAF no-op because its feeds are NFL endpoints', async () => {
    bdl.getGames.mockResolvedValue([]);
    bdl.getTeams.mockResolvedValue([]);
    bdl.getNflPlayerInjuries.mockResolvedValue([injuryReport()]);

    const result = await generateInsightConnections({ date: '2026-09-12', league: 'NCAAF' });
    expect(result.connections.filter((r) => ['injury', 'situational'].includes(r.category))).toEqual([]);
    expect(bdl.getNflPlayerInjuries).not.toHaveBeenCalled();
    expect(bdl.getNflStandings).not.toHaveBeenCalled();
    expect(bdl.getNflRosterDepth).not.toHaveBeenCalled();
  });
});
