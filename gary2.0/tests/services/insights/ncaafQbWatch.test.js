import { beforeEach, describe, expect, it, vi } from 'vitest';

// THE QUARTERBACKS, for college (NCAAF Picks page parity, founder Sep 3-4
// 2026). College has no depth-chart feed, so the plate names the side's
// PASSING LEADER — never a "starter" (the college starting-QB policy).
//
// Truth sources (verified live Sep 4 2026): BDL's active roster names who is
// on the team NOW; per-game player_stats rows (seasons[]) say who has thrown
// and when. The season-totals endpoint is NOT read: its "2026" rows carried
// full prior-season lines before Week 1 was played (Beck 352 attempts for a
// Miami that had not kicked off), so a "this season" line off it was a lie.
// A prior season is allowed only for a quarterback on THIS season's active
// roster, labeled with the year and, when he threw it elsewhere, the school.
// NCAAF-owned: the NFL roster-depth feed is never read.

const ledger = vi.hoisted(() => ({ gamesWithRowsToday: vi.fn(async () => new Set()) }));
vi.mock('../../../src/services/insights/ncaafLaneLedger.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, gamesWithRowsToday: ledger.gamesWithRowsToday };
});
vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: vi.fn(async () => JSON.stringify({ reads: [] })),
}));

const { computeNcaafQbWatch } = await import('../../../src/services/insights/computers/ncaafQbWatch.js');

const stanford = { id: 13, conference: 1, college: 'Stanford', name: 'Cardinal', full_name: 'Stanford Cardinal', abbreviation: 'STAN' };
const miami = { id: 8, conference: 1, college: 'Miami', name: 'Hurricanes', full_name: 'Miami Hurricanes', abbreviation: 'MIA' };
const duke = { id: 20, conference: 1, college: 'Duke', name: 'Blue Devils', full_name: 'Duke Blue Devils', abbreviation: 'DUKE' };

const game = { id: 457163, date: '2026-09-05T23:30:00.000Z', season: 2026, week: 1, home_team: stanford, visitor_team: miami };

const player = (id, first, last, position = 'QB', team = stanford) => ({
  id, first_name: first, last_name: last, position: position === 'QB' ? 'Quarterback' : position,
  position_abbreviation: position, team,
});

const gameRow = (playerId, team, gameId, date, values, season = 2026) => ({
  player: { id: playerId }, team,
  game: { id: gameId, date, season, home_team: null, visitor_team: null },
  passing_attempts: 0, passing_completions: 0, passing_yards: 0, passing_touchdowns: 0, passing_interceptions: 0,
  ...values,
});

let bdl;
let ctx;

beforeEach(() => {
  vi.clearAllMocks();
  ledger.gamesWithRowsToday.mockResolvedValue(new Set());
  bdl = {
    getNcaafTeamPlayers: vi.fn(async () => []),
    getNcaafPlayerGameStats: vi.fn(async () => []),
    getNcaafPlayerSeasonStats: vi.fn(async () => []),
    getNflRosterDepth: vi.fn(async () => ({ home: [], away: [] })),
    getNflPlayerSeasonStats: vi.fn(async () => []),
  };
  ctx = {
    date: '2026-09-05',
    season: 2026,
    league: 'ncaaf',
    games: [game],
    bdl,
    helpers: { gameLabel: (g) => `${g.visitor_team.abbreviation} @ ${g.home_team.abbreviation}` },
  };
});

describe('computeNcaafQbWatch', () => {
  it('is a no-op for any league but NCAAF and never reads the NFL depth chart', async () => {
    expect(await computeNcaafQbWatch({ ...ctx, league: 'nfl' })).toEqual([]);
    expect(bdl.getNcaafTeamPlayers).not.toHaveBeenCalled();
    expect(bdl.getNflRosterDepth).not.toHaveBeenCalled();
  });

  it('names each side\'s passing leader from this season\'s per-game rows, aggregated into the plate\'s numbers', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 13
      ? [player(501, 'Ben', 'Gulbranson'), player(502, 'Elijah', 'Brown'), player(503, 'Micah', 'Ford', 'RB')]
      : [player(601, 'Carson', 'Beck', 'QB', miami)]));
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds, season }) => {
      expect(season).toBe(2026);
      expect(playerIds.sort()).toEqual([501, 502, 601]);
      return [
        gameRow(501, stanford, 11, '2026-08-29T20:00:00.000Z', { passing_attempts: 30, passing_completions: 20, passing_yards: 250, passing_touchdowns: 2, passing_interceptions: 1 }),
        gameRow(501, stanford, 12, '2026-09-01T20:00:00.000Z', { passing_attempts: 40, passing_completions: 24, passing_yards: 310, passing_touchdowns: 1, passing_interceptions: 2 }),
        gameRow(502, stanford, 12, '2026-09-01T20:00:00.000Z', { passing_attempts: 3, passing_completions: 2, passing_yards: 20 }),
        gameRow(601, miami, 13, '2026-08-30T20:00:00.000Z', { passing_attempts: 36, passing_completions: 24, passing_yards: 324, passing_touchdowns: 3, passing_interceptions: 0 }),
      ];
    });

    const rows = await computeNcaafQbWatch(ctx);

    expect(rows.length).toBe(2);
    const home = rows.find((r) => r.meta.side === 'home');
    expect(home.category).toBe('quarterback');
    expect(home.headline).toBe("Ben Gulbranson leads STAN's passing this season");
    expect(home.headline).not.toMatch(/start/i);
    expect(home.detail).toContain('His 2026 line so far: 560 passing yards, 62.9% completions, 8.00 yards per attempt, 3-3 TD-INT over 2 games.');
    expect(home.value).toBe('8.00 Y/A');
    expect(home.player_id).toBe(501);
    expect(home.team_id).toBe(13);
    expect(home.game_id).toBe(457163);
    expect(home.meta).toMatchObject({
      source: 'balldontlie_ncaaf_players_active+player_stats',
      qb: 'Ben Gulbranson', abbr: 'STAN', side: 'home', team_id: 13, stats_season: 2026, prior_season_line: false,
      passing: { yards: 560, pct: 62.9, ypa: 8, td: 3, ints: 3, games: 2, season: 2026, prior: false, attempts: 70 },
    });
    const away = rows.find((r) => r.meta.side === 'away');
    expect(away.meta.qb).toBe('Carson Beck');
    expect(away.meta.passing.games).toBe(1);
    expect(bdl.getNcaafPlayerSeasonStats).not.toHaveBeenCalled();
    expect(bdl.getNflRosterDepth).not.toHaveBeenCalled();
  });

  it('falls back to last season only for a quarterback on this season\'s roster, naming the school he threw for', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 8
      ? [player(55826, 'Darian', 'Mensah', 'QB', miami), player(68591, 'Luke', 'Nickel', 'QB', miami)]
      : [player(501, 'Ben', 'Gulbranson')]));
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ playerIds, season }) => {
      if (season === 2026) return [];
      // The prior-season call asks for THIS roster's quarterbacks by id — a
      // transferred-out passer is never among them, so he can never win.
      expect(playerIds.every((id) => [55826, 68591, 501].includes(id))).toBe(true);
      return [
        gameRow(55826, duke, 21, '2025-09-06T20:00:00.000Z', { passing_attempts: 35, passing_completions: 25, passing_yards: 300, passing_touchdowns: 3, passing_interceptions: 0 }, 2025),
        gameRow(55826, duke, 22, '2025-09-13T20:00:00.000Z', { passing_attempts: 30, passing_completions: 18, passing_yards: 210, passing_touchdowns: 1, passing_interceptions: 1 }, 2025),
        gameRow(68591, miami, 23, '2025-11-22T20:00:00.000Z', { passing_attempts: 1, passing_completions: 1, passing_yards: 12 }, 2025),
      ];
    });

    const rows = await computeNcaafQbWatch(ctx);

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.headline).toBe("Darian Mensah is MIA's returning passer on 2025 numbers");
    expect(row.headline).not.toMatch(/start/i);
    expect(row.detail).toContain('His 2025 season line, thrown for DUKE: 510 passing yards, 66.2% completions, 7.85 yards per attempt, 4-1 TD-INT over 2 games.');
    expect(row.detail).toContain("He is on MIA's active roster this season");
    expect(row.player_id).toBe(55826);
    expect(row.meta.stats_season).toBe(2025);
    expect(row.meta.prior_season_line).toBe(true);
    expect(row.meta.prior_team).toBe('DUKE');
    expect(row.meta.passing).toMatchObject({ season: 2025, prior: true, yards: 510, attempts: 65 });
  });

  it('never hands the plate to a passer under the attempts floor — a mop-up line is not a passing leader', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 8
      ? [player(68591, 'Luke', 'Nickel', 'QB', miami)]
      : []));
    bdl.getNcaafPlayerGameStats.mockImplementation(async ({ season }) => (season === 2026
      ? [gameRow(68591, miami, 31, '2026-08-29T20:00:00.000Z', { passing_attempts: 4, passing_completions: 2, passing_yards: 9 })]
      : [gameRow(68591, miami, 23, '2025-11-22T20:00:00.000Z', { passing_attempts: 1, passing_completions: 1, passing_yards: 12 }, 2025)]));

    expect(await computeNcaafQbWatch(ctx)).toEqual([]);
  });

  it('skips games that already carry a quarterback row today and stops when the budget is spent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
    process.env.GARY_NCAAF_LANE_BUDGET_MS = '60000';
    const later = { ...game, id: 457170, date: '2026-09-06T00:00:00.000Z', home_team: duke, visitor_team: miami };
    const earlier = { ...game, id: 457150, date: '2026-09-05T16:00:00.000Z' };
    ctx.games = [later, game, earlier];
    ledger.gamesWithRowsToday.mockResolvedValue(new Set(['457150']));
    const rosters = [];
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => {
      rosters.push(teamId);
      vi.setSystemTime(new Date(Date.now() + 61_000));
      return [];
    });

    await computeNcaafQbWatch(ctx);

    expect(ledger.gamesWithRowsToday).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-05', category: 'quarterback' }));
    // The done game is skipped; the first undone game (by kickoff) is worked;
    // the budget is spent before the next one starts.
    expect(rosters).toEqual([8, 13]);
    delete process.env.GARY_NCAAF_LANE_BUDGET_MS;
    vi.useRealTimers();
  });

  it('treats a roster fetch failure as no row, never a guess', async () => {
    bdl.getNcaafTeamPlayers.mockRejectedValue(new Error('503'));
    expect(await computeNcaafQbWatch(ctx)).toEqual([]);
  });
});
