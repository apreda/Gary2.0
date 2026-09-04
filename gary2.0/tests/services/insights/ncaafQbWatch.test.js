import { beforeEach, describe, expect, it, vi } from 'vitest';

// THE QUARTERBACKS, for college (NCAAF Picks page parity, founder Sep 3-4
// 2026). College has no depth-chart feed, so the plate names the side's
// PASSING LEADER on this season's numbers — never a "starter" (the college
// starting-QB policy: a passing leader is evidence, not a confirmed start).
// A prior season is allowed only for a quarterback on THIS season's active
// roster, and it says so. NCAAF-owned: the NFL roster-depth feed is never read.

vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: vi.fn(async () => JSON.stringify({ reads: [] })),
}));

const { computeNcaafQbWatch } = await import('../../../src/services/insights/computers/ncaafQbWatch.js');

const stanford = { id: 13, conference: 1, college: 'Stanford', name: 'Cardinal', full_name: 'Stanford Cardinal', abbreviation: 'STAN' };
const miami = { id: 8, conference: 1, college: 'Miami', name: 'Hurricanes', full_name: 'Miami Hurricanes', abbreviation: 'MIA' };

const game = {
  id: 457163,
  date: '2026-09-05T23:30:00.000Z',
  season: 2026,
  week: 1,
  home_team: stanford,
  visitor_team: miami,
};

const player = (id, first, last, position = 'QB', team = stanford) => ({
  id, first_name: first, last_name: last, position: position === 'QB' ? 'Quarterback' : position,
  position_abbreviation: position, team,
});

const passing = (id, values, season = 2026) => ({
  player: { id },
  season,
  passing_attempts: 0, passing_completions: 0, passing_yards: 0,
  passing_touchdowns: 0, passing_interceptions: 0, passing_yards_per_game: 0,
  ...values,
});

let bdl;
let ctx;

beforeEach(() => {
  bdl = {
    getNcaafTeamPlayers: vi.fn(async () => []),
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

  it('names each side\'s passing leader from this season\'s numbers, as numbers the plate can print', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 13
      ? [player(501, 'Ben', 'Gulbranson'), player(502, 'Elijah', 'Brown'), player(503, 'Micah', 'Ford', 'RB')]
      : [player(601, 'Carson', 'Beck', 'QB', miami)]));
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ teamId, season }) => {
      if (season !== 2026) return [];
      if (teamId === 13) {
        return [
          passing(501, { passing_attempts: 120, passing_completions: 80, passing_yards: 1000, passing_touchdowns: 8, passing_interceptions: 3, passing_yards_per_game: 250 }),
          passing(502, { passing_attempts: 10, passing_completions: 6, passing_yards: 70, passing_yards_per_game: 35 }),
          passing(503, { rushing_yards: 400 }),
        ];
      }
      if (teamId === 8) {
        return [passing(601, { passing_attempts: 90, passing_completions: 60, passing_yards: 810, passing_touchdowns: 6, passing_interceptions: 1, passing_yards_per_game: 270 })];
      }
      return [];
    });

    const rows = await computeNcaafQbWatch(ctx);

    expect(rows.length).toBe(2);
    const home = rows.find((r) => r.meta.side === 'home');
    expect(home.category).toBe('quarterback');
    expect(home.headline).toBe("Ben Gulbranson leads STAN's passing this season");
    expect(home.headline).not.toMatch(/start/i);
    expect(home.detail).toContain('His 2026 line so far: 1000 passing yards, 66.7% completions, 8.33 yards per attempt, 8-3 TD-INT over 4 games.');
    expect(home.value).toBe('8.33 Y/A');
    expect(home.player_id).toBe(501);
    expect(home.team_id).toBe(13);
    expect(home.game_id).toBe(457163);
    expect(home.game).toBe('MIA @ STAN');
    expect(home.meta).toMatchObject({
      source: 'balldontlie_ncaaf_players+player_season_stats',
      qb: 'Ben Gulbranson',
      abbr: 'STAN',
      side: 'home',
      team_id: 13,
      stats_season: 2026,
      prior_season_line: false,
      passing: { yards: 1000, pct: 66.7, ypa: 8.33, td: 8, ints: 3, games: 4, season: 2026, prior: false },
    });
    const away = rows.find((r) => r.meta.side === 'away');
    expect(away.meta.qb).toBe('Carson Beck');
    expect(away.meta.passing.games).toBe(3);
    expect(bdl.getNflRosterDepth).not.toHaveBeenCalled();
    expect(bdl.getNflPlayerSeasonStats).not.toHaveBeenCalled();
  });

  it('falls back to last season only for a quarterback on this season\'s roster, and says so', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 13
      ? [player(501, 'Ben', 'Gulbranson'), player(502, 'Elijah', 'Brown')]
      : []));
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ teamId, playerIds, season }) => {
      if (season === 2026) return [];
      // The prior-season call asks for THIS roster's quarterbacks by id. A
      // transferred-out passer (999) with the bigger line is not on the
      // roster and must never win the plate.
      expect(teamId).toBeUndefined();
      expect(playerIds).toEqual([501, 502]);
      return [
        passing(999, { passing_attempts: 400, passing_completions: 280, passing_yards: 3600, passing_touchdowns: 30, passing_interceptions: 5, passing_yards_per_game: 300 }, 2025),
        passing(501, { passing_attempts: 200, passing_completions: 130, passing_yards: 1500, passing_touchdowns: 10, passing_interceptions: 6, passing_yards_per_game: 150 }, 2025),
      ];
    });

    const rows = await computeNcaafQbWatch(ctx);

    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.headline).toBe("Ben Gulbranson is STAN's returning passer on 2025 numbers");
    expect(row.headline).not.toMatch(/start/i);
    expect(row.detail).toContain('His 2025 season line: 1500 passing yards, 65.0% completions, 7.50 yards per attempt, 10-6 TD-INT over 10 games.');
    expect(row.player_id).toBe(501);
    expect(row.meta.stats_season).toBe(2025);
    expect(row.meta.prior_season_line).toBe(true);
    expect(row.meta.passing).toMatchObject({ season: 2025, prior: true, yards: 1500 });
  });

  it('writes nothing for a side with no passing line in either season', async () => {
    bdl.getNcaafTeamPlayers.mockImplementation(async (teamId) => (teamId === 13
      ? [player(501, 'Ben', 'Gulbranson')]
      : [player(601, 'Carson', 'Beck', 'QB', miami)]));
    bdl.getNcaafPlayerSeasonStats.mockImplementation(async ({ teamId, playerIds, season }) => {
      if (season === 2026 && teamId === 8) {
        return [passing(601, { passing_attempts: 30, passing_completions: 20, passing_yards: 240, passing_yards_per_game: 240 })];
      }
      return [];
    });

    const rows = await computeNcaafQbWatch(ctx);

    expect(rows.length).toBe(1);
    expect(rows[0].meta.side).toBe('away');
  });

  it('treats a roster fetch failure as no row, never a guess', async () => {
    bdl.getNcaafTeamPlayers.mockRejectedValue(new Error('503'));
    expect(await computeNcaafQbWatch(ctx)).toEqual([]);
  });
});
