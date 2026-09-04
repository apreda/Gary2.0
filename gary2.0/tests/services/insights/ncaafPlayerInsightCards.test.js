import { beforeEach, describe, expect, it, vi } from 'vitest';

// PLAYER INTEL, for college (NCAAF Picks page parity, founder Sep 3-4 2026):
// the NFL pack's contents — season line, LAST N log with the opponent and the
// site off the team's own game index, HOME/ROAD splits, the day's posted
// props — for the college leaders by role. Current season first; before a
// team's first game, LAST SEASON for the players on THIS season's roster,
// labeled. NCAAF-owned: no NFL feed is read.

const { buildNcaafPlayerInsightCards } = await import('../../../src/services/insights/ncaafPlayerInsightCards.js');

const stanford = { id: 13, conference: 1, college: 'Stanford', name: 'Cardinal', full_name: 'Stanford Cardinal', abbreviation: 'STAN' };
const miami = { id: 8, conference: 1, college: 'Miami', name: 'Hurricanes', full_name: 'Miami Hurricanes', abbreviation: 'MIA' };
const iowa = { id: 60, conference: 5, college: 'Iowa', name: 'Hawkeyes', full_name: 'Iowa Hawkeyes', abbreviation: 'IOWA' };

const game = { id: 457163, date: '2026-10-10T23:30:00.000Z', season: 2026, week: 7, home_team: stanford, visitor_team: miami };

const player = (id, first, last, position, team = stanford) => ({
  id, first_name: first, last_name: last, position, position_abbreviation: position, team,
});
const stanfordRoster = [
  player(501, 'Ben', 'Gulbranson', 'QB'),
  player(502, 'Elijah', 'Brown', 'QB'),
  player(503, 'Micah', 'Ford', 'RB'),
  player(504, 'Emmett', 'Mosley V', 'WR'),
  player(505, 'Tiger', 'Bachmeier', 'WR'),
  player(506, 'Sam', 'Roush', 'TE'),
  player(507, 'Chris', 'Davis', 'WR'),
  player(508, 'David', 'Bailey', 'LB'),
];

const seasonRow = (id, values, season = 2026) => ({
  player: { id }, team: stanford, season,
  passing_attempts: 0, passing_completions: 0, passing_yards: 0, passing_touchdowns: 0, passing_interceptions: 0,
  rushing_attempts: 0, rushing_yards: 0, rushing_touchdowns: 0,
  receptions: 0, receiving_yards: 0, receiving_touchdowns: 0,
  ...values,
});

const gameRow = (playerId, gameId, date, values) => ({
  player: { id: playerId }, team: stanford,
  game: { id: gameId, date, season: 2026, home_team: null, visitor_team: null },
  passing_attempts: 0, passing_completions: 0, passing_yards: 0, passing_touchdowns: 0, passing_interceptions: 0,
  rushing_attempts: 0, rushing_yards: 0, rushing_touchdowns: 0,
  receptions: 0, receiving_targets: 0, receiving_yards: 0, receiving_touchdowns: 0,
  ...values,
});

function finalGame(id, date, team, opponent, scored, allowed, { home = true } = {}) {
  const [homeTeam, awayTeam] = home ? [team, opponent] : [opponent, team];
  const [homeScore, awayScore] = home ? [scored, allowed] : [allowed, scored];
  return { id, date, season: 2026, status: 'post', status_state: 'final', home_team: homeTeam, visitor_team: awayTeam, home_score: homeScore, away_score: awayScore };
}

let bdl;

beforeEach(() => {
  bdl = {
    getNcaafTeamPlayers: vi.fn(async (teamId) => (teamId === 13 ? stanfordRoster : [])),
    getNcaafPlayerSeasonStats: vi.fn(async () => []),
    getNcaafPlayerGameStats: vi.fn(async () => []),
    getGames: vi.fn(async () => []),
    getNflRosterDepth: vi.fn(),
    getNflPlayerGameLogsBatch: vi.fn(),
  };
});

describe('buildNcaafPlayerInsightCards', () => {
  it('packs the leaders by role with the NFL sections: season line, dated log off the game index, splits, props', async () => {
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ teamId, season }) => (teamId === 13 && season === 2026 ? [
      seasonRow(501, { passing_attempts: 120, passing_completions: 80, passing_yards: 1000, passing_touchdowns: 8, passing_interceptions: 3, rushing_attempts: 20, rushing_yards: 90 }),
      seasonRow(502, { passing_attempts: 10, passing_yards: 70 }),
      seasonRow(503, { rushing_attempts: 80, rushing_yards: 400, rushing_touchdowns: 4, receptions: 10, receiving_yards: 60 }),
      seasonRow(504, { receptions: 30, receiving_yards: 420, receiving_touchdowns: 3 }),
      seasonRow(505, { receptions: 22, receiving_yards: 300 }),
      seasonRow(506, { receptions: 15, receiving_yards: 180, receiving_touchdowns: 2 }),
      seasonRow(507, { receptions: 4, receiving_yards: 40 }),
      seasonRow(508, { total_tackles: 40 }),
    ] : []));
    bdl.getGames.mockImplementation(async (sport, params) => {
      expect(sport).toBe('americanfootball_ncaaf');
      return params.team_ids[0] === 13 ? [
        finalGame(1, '2026-09-05T23:00:00.000Z', stanford, iowa, 24, 10),
        finalGame(2, '2026-09-12T23:00:00.000Z', stanford, miami, 20, 31, { home: false }),
        finalGame(3, '2026-09-19T23:00:00.000Z', stanford, iowa, 27, 13),
        { id: 4, date: '2026-10-17T23:00:00.000Z', status: 'pre', home_team: stanford, visitor_team: iowa },
      ] : [];
    });
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds, season }) => {
      expect(season).toBe(2026);
      expect(playerIds).toContain(501);
      return [
        gameRow(501, 1, '2026-09-05T23:00:00.000Z', { passing_attempts: 30, passing_completions: 20, passing_yards: 250, passing_touchdowns: 2, passing_interceptions: 1 }),
        gameRow(501, 2, '2026-09-12T23:00:00.000Z', { passing_attempts: 40, passing_completions: 24, passing_yards: 310, passing_touchdowns: 1, passing_interceptions: 2, rushing_yards: 35 }),
        gameRow(501, 3, '2026-09-19T23:00:00.000Z', { passing_attempts: 25, passing_completions: 18, passing_yards: 200, passing_touchdowns: 3 }),
        gameRow(504, 1, '2026-09-05T23:00:00.000Z', { receptions: 6, receiving_targets: 9, receiving_yards: 90, receiving_touchdowns: 1 }),
        gameRow(504, 3, '2026-09-19T23:00:00.000Z', { receptions: 4, receiving_targets: 5, receiving_yards: 50 }),
        gameRow(503, 1, '2026-09-05T23:00:00.000Z', { rushing_attempts: 18, rushing_yards: 110, rushing_touchdowns: 1 }),
      ];
    });
    const propEntries = [
      { sport: 'NCAAF', player: 'Ben Gulbranson', team: 'Stanford Cardinal', prop: 'player_pass_yds', line: 245.5, odds: '-115', bet: 'over', game_id: '457163' },
      { sport: 'NCAAF', player: 'Ben Gulbranson', team: 'Stanford Cardinal', prop: 'player_pass_tds', line: 1.5, odds: '+105', bet: 'over', game_id: '457163' },
      { sport: 'NCAAF', player: 'Ben Gulbranson', team: 'Stanford Cardinal', prop: 'player_pass_yds', line: 260.5, odds: '-110', bet: 'under', game_id: '999999' },
      { sport: 'MLB', player: 'Ben Gulbranson', prop: 'batter_hits', line: 0.5, odds: '-120', game_id: '457163' },
    ];

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [game], bdl, propEntries });

    // QB1, RB1, the top three receivers — the depth chart's key players.
    expect(packs.map((p) => p.player_id).sort()).toEqual(['501', '503', '504', '505', '506']);
    expect(packs.every((p) => p.league === 'NCAAF' && p.game_id === '457163' && p.date === '2026-10-10')).toBe(true);

    const qb = packs.find((p) => p.player_id === '501');
    expect(qb.player_name).toBe('Ben Gulbranson');
    expect(qb.team_abbr).toBe('STAN');
    expect(qb.payload).toMatchObject({
      type: 'quarterback', name: 'Ben Gulbranson', team: 'STAN', position: 'QB', game: 'MIA @ STAN',
      opponent: { name: 'Miami Hurricanes', hand: null }, statsSectionTitle: 'THE SHEET',
    });
    expect(qb.payload.season).toEqual({ line1: '1000 pass yds · 8 TD · 3 INT · 120 att', line2: '90 rush yds · 20 carries — 2026 season' });
    expect(qb.payload.formRows[0]).toEqual({ label: 'LAST 3', value: '253.3 pass yds/g', detail: null });
    // Newest first, the opponent and the site from the team's own game index.
    expect(qb.payload.formRows.slice(1)).toEqual([
      { label: 'vs Iowa Hawkeyes', value: '18/25, 200 yds, 3 TD, 0 INT', detail: null },
      { label: 'at Miami Hurricanes', value: '24/40, 310 yds, 1 TD, 2 INT, 35 rush yds', detail: null },
      { label: 'vs Iowa Hawkeyes', value: '20/30, 250 yds, 2 TD, 1 INT', detail: null },
    ]);
    expect(qb.payload.splits).toEqual([
      { label: 'HOME', value: '225 pass yds/g', detail: '2 games' },
      { label: 'ROAD', value: '310 pass yds/g', detail: '1 game' },
    ]);
    // Only this game's college props, one per market.
    expect(qb.payload.props).toEqual([
      { label: 'PASS YDS', line: '245.5', odds: '-115', rate: null },
      { label: 'PASS TDS', line: '1.5', odds: '+105', rate: null },
    ]);

    const wr = packs.find((p) => p.player_id === '504');
    expect(wr.payload.type).toBe('skill');
    expect(wr.payload.season.line1).toBe('30 rec · 420 rec yds · 3 TD');
    expect(wr.payload.formRows[0]).toEqual({ label: 'LAST 2', value: '70 rec yds/g', detail: null });
    expect(wr.payload.formRows[1]).toEqual({ label: 'vs Iowa Hawkeyes', value: '4 rec 50 yds (5 tgt)', detail: null });
    expect(wr.payload.props).toBeNull();

    const rb = packs.find((p) => p.player_id === '503');
    expect(rb.payload.season.line1).toBe('400 rush yds · 80 carries · 4 TD');
    expect(rb.payload.formRows[1]).toEqual({ label: 'vs Iowa Hawkeyes', value: '18 car 110 yds 1 TD', detail: null });

    expect(bdl.getNflRosterDepth).not.toHaveBeenCalled();
    expect(bdl.getNflPlayerGameLogsBatch).not.toHaveBeenCalled();
  });

  it('reads last season only for this season\'s roster before the first game, and labels every section with the year', async () => {
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ teamId, playerIds, season }) => {
      if (season === 2026) return [];
      expect(teamId).toBeUndefined();
      expect(playerIds).toEqual(stanfordRoster.map((p) => p.id));
      return [
        seasonRow(999, { passing_attempts: 400, passing_yards: 3600, passing_touchdowns: 30 }, 2025),
        seasonRow(501, { passing_attempts: 200, passing_completions: 130, passing_yards: 1500, passing_touchdowns: 10, passing_interceptions: 6 }, 2025),
        seasonRow(504, { receptions: 40, receiving_yards: 600, receiving_touchdowns: 5 }, 2025),
      ];
    });
    bdl.getGames.mockImplementation(async (sport, params) => (params.seasons[0] === 2025 && params.team_ids[0] === 13
      ? [finalGame(11, '2025-11-22T23:00:00.000Z', stanford, iowa, 17, 20)]
      : []));
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ season }) => (season === 2025 ? [
      { ...gameRow(501, 11, '2025-11-22T23:00:00.000Z', { passing_attempts: 33, passing_completions: 21, passing_yards: 240, passing_touchdowns: 1, passing_interceptions: 0 }), game: { id: 11, date: '2025-11-22T23:00:00.000Z', season: 2025 } },
    ] : []));

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-09-05', games: [game], bdl, propEntries: [] });

    expect(packs.map((p) => p.player_id).sort()).toEqual(['501', '504']);
    const qb = packs.find((p) => p.player_id === '501');
    expect(qb.payload.season.line2).toBe('2025 season — prior season, he is on the 2026 active roster');
    expect(qb.payload.formRows[0].label).toBe('LAST 1 — 2025 SEASON');
    expect(qb.payload.formRows[1]).toEqual({ label: 'vs Iowa Hawkeyes', value: '21/33, 240 yds, 1 TD, 0 INT', detail: null });
    const wr = packs.find((p) => p.player_id === '504');
    expect(wr.payload.season.line2).toBe('2025 season — prior season, he is on the 2026 active roster');
    expect(wr.payload.formRows).toBeNull();
  });

  it('writes no pack for a player with no grounded section and none for a game whose roster fails', async () => {
    const other = { ...game, id: 457164, home_team: iowa, visitor_team: miami };
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => {
      if (teamId === 13) return stanfordRoster;
      if (teamId === 60) throw new Error('503');
      return [];
    });

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-09-05', games: [game, other], bdl, propEntries: [] });

    expect(packs).toEqual([]);
  });
});
