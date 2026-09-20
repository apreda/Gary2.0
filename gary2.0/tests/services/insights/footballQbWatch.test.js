import { beforeEach, describe, expect, it, vi } from 'vitest';

const { computeFootballQbWatch } = await import('../../../src/services/insights/computers/footballQbWatch.js');

function game(index) {
  return {
    id: 1000 + index,
    away_team: { id: 2000 + index * 2, abbreviation: `A${index}`, full_name: `Away ${index}` },
    home_team: { id: 2001 + index * 2, abbreviation: `H${index}`, full_name: `Home ${index}` },
  };
}

describe('NFL quarterback write-ups', () => {
  let ctx;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = {
      league: 'nfl',
      date: '2026-09-20',
      season: 2026,
      games: Array.from({ length: 6 }, (_, index) => game(index)),
      helpers: { gameLabel: (g) => `${g.away_team.abbreviation} @ ${g.home_team.abbreviation}` },
      bdl: {
        nflStandingsCountable: vi.fn(async () => true),
        getNflRosterDepth: vi.fn(async () => ({ away: [], home: [] })),
        getStartingQBFromDepthChart: vi.fn(async (teamId) => ({
          id: teamId,
          name: `Quarterback ${teamId}`,
        })),
        getNflPlayerSeasonStats: vi.fn(async ({ playerId }) => [{
          player_id: playerId,
          passing_yards: 400,
          passing_completion_pct: 65,
          yards_per_pass_attempt: 8,
          passing_touchdowns: 3,
          passing_interceptions: 1,
          games_played: 2,
        }]),
      },
    };
  });

  it('writes prose for every named starter rather than only the shared eight-row default', async () => {
    const rows = await computeFootballQbWatch(ctx);

    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.meta.read && row.detail === row.meta.read)).toBe(true);
    expect(rows.every((row) => row.meta.research_copy_version === 'grounded-quarterback-writeup-v1')).toBe(true);
    expect(rows.every((row) => !row.detail.includes('line so far:'))).toBe(true);
    expect(rows[0].detail).toContain('Through 2 games in 2026');
    expect(rows[0].detail).toContain('3-1 touchdown-to-interception line');
    expect(rows[0].meta.computed_detail).toContain('2026 line so far:');
  });

  it('writes an honest designation instead of a stat dump when no passing sample exists', async () => {
    ctx.games = ctx.games.slice(0, 1);
    ctx.bdl.getNflPlayerSeasonStats.mockResolvedValue([]);

    const rows = await computeFootballQbWatch(ctx);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.detail.includes('quarterback designation rather than a performance profile'))).toBe(true);
    expect(rows.every((row) => row.meta.computed_detail.includes('No 2026 or 2025 passing line on file yet'))).toBe(true);
  });
});
