import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completedPlayerCardGameIds } from '../../../scripts/lib/playerCardStorage.js';

// PLAYER INTEL, for college (NCAAF Picks page parity, founder Sep 3-4 2026):
// the NFL pack's contents — season line, LAST N log with the opponent and the
// site off the pair's game index, HOME/ROAD splits, the day's posted props —
// for the college leaders by role. Truth sources: the active roster (who is
// here) and per-game player_stats rows (who has played; the season line is
// their sum). The season-totals endpoint is never read — its "2026" rows were
// prior-season lines before Week 1. Before a team's first game, LAST SEASON
// for the players on THIS season's roster, labeled. Budgeted and additive
// across the day's passes. NCAAF-owned: no NFL feed is read.

const { buildNcaafPlayerInsightCards } = await import('../../../src/services/insights/ncaafPlayerInsightCards.js');

const stanford = { id: 13, conference: 1, college: 'Stanford', name: 'Cardinal', full_name: 'Stanford Cardinal', abbreviation: 'STAN' };
const miami = { id: 8, conference: 1, college: 'Miami', name: 'Hurricanes', full_name: 'Miami Hurricanes', abbreviation: 'MIA' };
const iowa = { id: 60, conference: 5, college: 'Iowa', name: 'Hawkeyes', full_name: 'Iowa Hawkeyes', abbreviation: 'IOWA' };
const duke = { id: 20, conference: 1, college: 'Duke', name: 'Blue Devils', full_name: 'Duke Blue Devils', abbreviation: 'DUKE' };

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

const gameRow = (playerId, gameId, date, values, { season = 2026, team = stanford, week = null } = {}) => ({
  player: { id: playerId }, team,
  game: { id: gameId, date, season, week, home_team: null, visitor_team: null },
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
  vi.useRealTimers();
  bdl = {
    getNcaafTeamPlayers: vi.fn(async (teamId) => (teamId === 13 ? stanfordRoster : [])),
    getNcaafPlayerGameStats: vi.fn(async () => []),
    getNcaafPlayerSeasonStats: vi.fn(async () => []),
    getGames: vi.fn(async () => []),
    getNflRosterDepth: vi.fn(),
    getNflPlayerGameLogsBatch: vi.fn(),
  };
});

describe('buildNcaafPlayerInsightCards', () => {
  it('resumes only a completed game with new named subjects, keeps verified identity without invented stats, and skips it once stored', async () => {
    const other = { ...game, id: 457164 };
    const existing = [game, other].flatMap((g) => [8, 13].map((team) => ({
      date: '2026-10-10', league: 'NCAAF', game_id: String(g.id), player_id: `${g.id}-${team}`,
      payload: { card_build: { version: 1, built_at: '2026-09-05T12:00:00Z', game_complete: true, team_id: String(team) } },
    })));
    const subjects = [{ game_id: '457163', player_id: '508', headline: 'Unchanged availability read' }];
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => teamId === 13
      ? stanfordRoster : [player(801, 'Miami', 'Quarterback', 'QB', miami)]);
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds }) => [
      gameRow(playerIds.includes(501) ? 501 : 801, 1, '2026-09-05T20:00:00Z', { passing_attempts: 30, passing_yards: 250 }),
    ]);
    const done = completedPlayerCardGameIds(existing, { requiredPlayers: subjects });
    const checkpoint = vi.fn();
    const packs = await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [other, game], bdl, done, subjects, onGameBuilt: checkpoint });
    expect(packs.every((p) => p.game_id === '457163')).toBe(true);
    const named = packs.find((p) => p.player_id === '508');
    expect(named).toMatchObject({ player_name: 'David Bailey', team_abbr: 'STAN', payload: {
      position: 'LB', season: null, formRows: null, splits: null, props: null,
      card_build: { game_complete: true },
    } });
    expect(subjects[0].headline).toBe('Unchanged availability read');
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(bdl.getNcaafTeamPlayers).toHaveBeenCalledTimes(2);
    const nextDone = completedPlayerCardGameIds([...existing, ...packs], { requiredPlayers: subjects });
    expect([...nextDone].sort()).toEqual(['457163', '457164']);
    expect(await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [game, other], bdl, done: nextDone, subjects })).toEqual([]);
    expect(bdl.getNcaafTeamPlayers).toHaveBeenCalledTimes(2);
  });

  it('does not invent an unrostered subject, borrow a subject from another game, or count identity alone as base-game completion', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => teamId === 13 ? stanfordRoster : []);
    const subjects = [
      { game_id: '457163', player_id: '508' },
      { game_id: '457163', player_id: '999999' },
      { game_id: '457164', player_id: '502' },
    ];
    const packs = await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [game], bdl, subjects });
    expect(packs.map((p) => p.player_id)).toEqual(['508']);
    expect(packs[0].payload.card_build.game_complete).toBe(false);
    expect(packs[0].payload.season).toBeNull();
    expect(completedPlayerCardGameIds(packs).size).toBe(0);
  });

  it('packs the leaders by role from the per-game rows: summed season line, dated log off the pair\'s game index, splits, props', async () => {
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds, season }) => {
      expect(season).toBe(2026);
      // The roster's skill players, both quarterbacks included; never the linebacker.
      expect([...playerIds].sort((a, b) => a - b)).toEqual([501, 502, 503, 504, 505, 506, 507]);
      return [
        gameRow(501, 1, '2026-09-05T23:00:00.000Z', { passing_attempts: 30, passing_completions: 20, passing_yards: 250, passing_touchdowns: 2, passing_interceptions: 1 }),
        gameRow(501, 2, '2026-09-12T23:00:00.000Z', { passing_attempts: 40, passing_completions: 24, passing_yards: 310, passing_touchdowns: 1, passing_interceptions: 2, rushing_attempts: 4, rushing_yards: 35 }),
        gameRow(501, 3, '2026-09-19T23:00:00.000Z', { passing_attempts: 25, passing_completions: 18, passing_yards: 200, passing_touchdowns: 3 }),
        gameRow(502, 3, '2026-09-19T23:00:00.000Z', { passing_attempts: 3, passing_completions: 2, passing_yards: 20 }),
        gameRow(503, 1, '2026-09-05T23:00:00.000Z', { rushing_attempts: 18, rushing_yards: 110, rushing_touchdowns: 1, receptions: 2, receiving_yards: 15 }),
        gameRow(503, 2, '2026-09-12T23:00:00.000Z', { rushing_attempts: 20, rushing_yards: 90 }),
        gameRow(504, 1, '2026-09-05T23:00:00.000Z', { receptions: 6, receiving_targets: 9, receiving_yards: 90, receiving_touchdowns: 1 }),
        gameRow(504, 3, '2026-09-19T23:00:00.000Z', { receptions: 4, receiving_targets: 5, receiving_yards: 50 }),
        gameRow(505, 2, '2026-09-12T23:00:00.000Z', { receptions: 5, receiving_targets: 7, receiving_yards: 70 }),
        gameRow(506, 2, '2026-09-12T23:00:00.000Z', { receptions: 3, receiving_targets: 4, receiving_yards: 40, receiving_touchdowns: 1 }),
        gameRow(507, 1, '2026-09-05T23:00:00.000Z', { receptions: 1, receiving_targets: 1, receiving_yards: 8 }),
      ];
    });
    bdl.getGames.mockImplementation(async (sport, params) => {
      expect(sport).toBe('americanfootball_ncaaf');
      expect([...params.team_ids].sort((a, b) => a - b)).toEqual([8, 13]);
      expect(params.seasons).toEqual([2026]);
      return [
        finalGame(1, '2026-09-05T23:00:00.000Z', stanford, iowa, 24, 10),
        finalGame(2, '2026-09-12T23:00:00.000Z', stanford, miami, 20, 31, { home: false }),
        finalGame(3, '2026-09-19T23:00:00.000Z', stanford, iowa, 27, 13),
        { id: 4, date: '2026-10-17T23:00:00.000Z', status: 'pre', home_team: stanford, visitor_team: iowa },
      ];
    });
    const propEntries = [
      { sport: 'NCAAF', player: 'Ben Gulbranson', team: 'Stanford Cardinal', prop: 'player_pass_yds', line: 245.5, odds: '-115', bet: 'over', game_id: '457163' },
      { sport: 'NCAAF', player: 'Ben Gulbranson', team: 'Stanford Cardinal', prop: 'player_pass_tds', line: 1.5, odds: '+105', bet: 'over', game_id: '457163' },
      { sport: 'NCAAF', player: 'Ben Gulbranson', team: 'Stanford Cardinal', prop: 'player_pass_yds', line: 260.5, odds: '-110', bet: 'under', game_id: '999999' },
      { sport: 'MLB', player: 'Ben Gulbranson', prop: 'batter_hits', line: 0.5, odds: '-120', game_id: '457163' },
    ];

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [game], bdl, propEntries });

    // QB1 (above the floor), RB1, the top three receivers — the key players.
    expect(packs.map((p) => p.player_id).sort()).toEqual(['501', '503', '504', '505', '506']);
    expect(packs.every((p) => p.league === 'NCAAF' && p.game_id === '457163' && p.date === '2026-10-10')).toBe(true);
    expect(bdl.getNcaafPlayerSeasonStats).not.toHaveBeenCalled();
    expect(bdl.getNcaafTeamPlayers).toHaveBeenCalledWith(13, 360);

    const qb = packs.find((p) => p.player_id === '501');
    expect(qb.player_name).toBe('Ben Gulbranson');
    expect(qb.team_abbr).toBe('STAN');
    expect(qb.payload).toMatchObject({
      type: 'quarterback', name: 'Ben Gulbranson', team: 'STAN', position: 'QB', game: 'MIA @ STAN',
      opponent: { name: 'Miami Hurricanes', hand: null }, statsSectionTitle: 'THE SHEET',
    });
    expect(qb.payload.season).toEqual({ line1: '760 pass yds · 6 TD · 3 INT · 95 att', line2: '35 rush yds · 4 carries — 2026 season, 3 games' });
    expect(qb.payload.formRows[0]).toEqual({ label: 'LAST 3', value: '253.3 pass yds/g', detail: null });
    // Newest first, the opponent and the site off the pair's game index.
    expect(qb.payload.formRows.slice(1)).toEqual([
      { label: 'vs Iowa Hawkeyes', value: '18/25, 200 yds, 3 TD, 0 INT', detail: null },
      { label: 'at Miami Hurricanes', value: '24/40, 310 yds, 1 TD, 2 INT, 35 rush yds', detail: null },
      { label: 'vs Iowa Hawkeyes', value: '20/30, 250 yds, 2 TD, 1 INT', detail: null },
    ]);
    expect(qb.payload.splits).toEqual([
      { label: 'HOME', value: '225 pass yds/g', detail: '2 games' },
      { label: 'ROAD', value: '310 pass yds/g', detail: '1 game' },
    ]);
    expect(qb.payload.props).toEqual([
      { label: 'PASS YDS', line: '245.5', odds: '-115', rate: null },
      { label: 'PASS TDS', line: '1.5', odds: '+105', rate: null },
    ]);

    const wr = packs.find((p) => p.player_id === '504');
    expect(wr.payload.type).toBe('skill');
    expect(wr.payload.season).toEqual({ line1: '10 rec · 140 rec yds · 1 TD', line2: '2026 season, 2 games' });
    expect(wr.payload.formRows[0]).toEqual({ label: 'LAST 2', value: '70 rec yds/g', detail: null });
    expect(wr.payload.formRows[1]).toEqual({ label: 'vs Iowa Hawkeyes', value: '4 rec 50 yds (5 tgt)', detail: null });
    expect(wr.payload.props).toBeNull();

    const rb = packs.find((p) => p.player_id === '503');
    expect(rb.payload.season.line1).toBe('200 rush yds · 38 carries · 1 TD');
    expect(rb.payload.season.line2).toBe('2 rec · 15 rec yds — 2026 season, 2 games');
    expect(rb.payload.formRows[1]).toEqual({ label: 'at Miami Hurricanes', value: '20 car 90 yds', detail: null });

    expect(bdl.getNflRosterDepth).not.toHaveBeenCalled();
    expect(bdl.getNflPlayerGameLogsBatch).not.toHaveBeenCalled();
  });

  it('labels the log by week when the pair\'s game index is unavailable, and keeps splits off', async () => {
    bdl.getNcaafPlayerGameStats.mockResolvedValue([
      gameRow(501, 1, '2026-09-05T23:00:00.000Z', { passing_attempts: 30, passing_completions: 20, passing_yards: 250 }, { week: 1 }),
    ]);
    bdl.getGames.mockRejectedValue(new Error('503'));

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [game], bdl, propEntries: [] });
    const qb = packs.find((p) => p.player_id === '501');

    expect(qb.payload.formRows[1]).toEqual({ label: 'Wk 1 · Sep 5', value: '20/30, 250 yds, 0 TD, 0 INT', detail: null });
    expect(qb.payload.splits).toBeNull();
  });

  it('reads last season only for this season\'s roster before the first game, labels every section with the year, and names the prior school', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 8
      ? [player(55826, 'Darian', 'Mensah', 'QB', miami), player(603, 'Mark', 'Fletcher Jr.', 'RB', miami)]
      : []));
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds, season }) => {
      if (season === 2026) return [];
      expect([...playerIds].sort((a, b) => a - b)).toEqual([603, 55826]);
      return [
        gameRow(55826, 21, '2025-09-06T20:00:00.000Z', { passing_attempts: 35, passing_completions: 25, passing_yards: 300, passing_touchdowns: 3 }, { season: 2025, team: duke }),
        gameRow(55826, 22, '2025-09-13T20:00:00.000Z', { passing_attempts: 30, passing_completions: 18, passing_yards: 210, passing_touchdowns: 1, passing_interceptions: 1 }, { season: 2025, team: duke }),
        gameRow(603, 23, '2025-11-22T20:00:00.000Z', { rushing_attempts: 15, rushing_yards: 88, rushing_touchdowns: 1 }, { season: 2025, team: miami }),
      ];
    });
    bdl.getGames.mockImplementation(async (sport, params) => (params.seasons[0] === 2025
      ? [finalGame(23, '2025-11-22T20:00:00.000Z', miami, iowa, 17, 20)]
      : []));

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-09-05', games: [game], bdl, propEntries: [] });

    expect(packs.map((p) => p.player_id).sort()).toEqual(['55826', '603']);
    const qb = packs.find((p) => p.player_id === '55826');
    expect(qb.payload.season.line2).toBe('2025 season at DUKE, 2 games — prior season; he is on the 2026 MIA roster');
    expect(qb.payload.formRows[0].label).toBe('LAST 2 — 2025 SEASON');
    // Duke's games are not in the Miami-Stanford index: labeled by date.
    expect(qb.payload.formRows[1].label).toBe('Sep 13, 2025');
    expect(qb.payload.splits).toBeNull();
    const rb = packs.find((p) => p.player_id === '603');
    expect(rb.payload.season.line2).toBe('2025 season, 1 game — prior season; he is on the 2026 MIA roster');
    expect(bdl.getNcaafPlayerGameStats).toHaveBeenCalledWith({ playerIds: [55826, 603], season: 2025 }, 360);
    expect(bdl.getGames).toHaveBeenCalledWith('americanfootball_ncaaf', {
      team_ids: [8, 13], seasons: [2025], per_page: 100,
    }, 360);
    expect(rb.payload.formRows[1]).toEqual({ label: 'vs Iowa Hawkeyes', value: '15 car 88 yds 1 TD', detail: null });
  });

  it('skips a rostered passer under the attempts floor, writes no pack for a player with no section, and none for a game whose roster fails', async () => {
    const other = { ...game, id: 457164, home_team: iowa, visitor_team: miami };
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => {
      if (teamId === 13) return [player(502, 'Elijah', 'Brown', 'QB')];
      if (teamId === 60) throw new Error('503');
      return [];
    });
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ season }) => (season === 2026
      ? [gameRow(502, 3, '2026-09-19T23:00:00.000Z', { passing_attempts: 3, passing_completions: 2, passing_yards: 20 })]
      : []));

    const packs = await buildNcaafPlayerInsightCards({ date: '2026-09-05', games: [game, other], bdl, propEntries: [] });

    expect(packs).toEqual([]);
  });

  it('works games in kickoff order, skips games already packed today, and stops when the budget is spent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
    process.env.GARY_NCAAF_LANE_BUDGET_MS = '60000';
    const later = { ...game, id: 457170, date: '2026-09-06T00:00:00.000Z', home_team: duke, visitor_team: miami };
    const middle = { ...game, date: '2026-09-05T23:30:00.000Z' };
    const earlier = { ...game, id: 457150, date: '2026-09-05T16:00:00.000Z' };
    const rosters = [];
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => {
      rosters.push(teamId);
      vi.setSystemTime(new Date(Date.now() + 61_000));
      return [];
    });

    await buildNcaafPlayerInsightCards({ date: '2026-09-05', games: [later, middle, earlier], bdl, propEntries: [], done: new Set(['457150']) });

    expect(rosters).toEqual([8, 13]);
    delete process.env.GARY_NCAAF_LANE_BUDGET_MS;
  });

  it('checkpoints completed games before another game starts and marks both grounded sides', async () => {
    const written = [];
    const later = { ...game, id: 457164, date: '2026-10-11T00:00:00Z' };
    let rosterCalls = 0;
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => {
      rosterCalls += 1;
      if (rosterCalls === 3) expect(written.map((rows) => rows[0].game_id)).toEqual(['457163']);
      const team = teamId === 8 ? miami : stanford;
      return [player(teamId * 100, 'Starting', 'Quarterback', 'QB', team)];
    });
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds }) => [
      gameRow(playerIds[0], 1, '2026-09-05T20:00:00Z', { passing_attempts: 30, passing_yards: 250 }),
    ]);
    const packs = await buildNcaafPlayerInsightCards({
      date: '2026-10-10', games: [later, game], bdl,
      onGameBuilt: async (rows) => { written.push(rows); },
    });
    expect(written).toHaveLength(2);
    expect(packs).toHaveLength(4);
    expect(packs.every((pack) => pack.payload.card_build.game_complete)).toBe(true);
    expect(written[0].map((pack) => pack.payload.card_build.team_id).sort()).toEqual(['13', '8']);
  });

  it('stores a successful side but keeps the game retryable after the other roster fails', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => {
      if (teamId === 8) throw new Error('roster unavailable');
      return [stanfordRoster[0]];
    });
    bdl.getNcaafPlayerGameStats.mockResolvedValue([
      gameRow(501, 1, '2026-09-05T20:00:00Z', { passing_attempts: 30, passing_yards: 250 }),
    ]);
    const checkpoint = vi.fn();
    const packs = await buildNcaafPlayerInsightCards({ date: '2026-10-10', games: [game], bdl, onGameBuilt: checkpoint });
    expect(packs).toHaveLength(1);
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(packs[0].payload.card_build).toMatchObject({ version: 1, team_id: '13', game_complete: false });
  });
});
