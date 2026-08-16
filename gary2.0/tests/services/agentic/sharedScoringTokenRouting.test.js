import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.BALLDONTLIE_API_KEY ||= 'test-key';

const { fetchStats } = await import('../../../src/services/agentic/tools/statRouters/index.js');
const { ballDontLieService } = await import('../../../src/services/ballDontLieService.js');

const teams = [
  { id: 1, name: 'Chiefs', full_name: 'Kansas City Chiefs' },
  { id: 2, name: 'Rams', full_name: 'Los Angeles Rams' },
];

const completedGame = {
  status: 'Final',
  home_team: teams[0],
  visitor_team: teams[1],
  home_team_score: 27,
  visitor_team_score: 20,
  home_team_q1: 7,
  home_team_q2: 10,
  home_team_q3: 3,
  home_team_q4: 7,
  visitor_team_q1: 3,
  visitor_team_q2: 7,
  visitor_team_q3: 3,
  visitor_team_q4: 7,
};

function stubBdlRows() {
  const getTeams = vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue(teams);
  const getGames = vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue([completedGame]);
  return { getTeams, getGames };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shared quarter and half scoring token routing', () => {
  it('routes all three NFL scoring tokens through NFL BDL rows', async () => {
    const { getTeams, getGames } = stubBdlRows();

    for (const token of ['QUARTER_SCORING', 'FIRST_HALF_TRENDS', 'SECOND_HALF_TRENDS']) {
      const result = await fetchStats('NFL', token, 'Kansas City Chiefs', 'Los Angeles Rams', { season: 2025 });
      expect(result.error).toBeUndefined();
      expect(result.home?.games_analyzed).toBe(1);
      expect(result.away?.games_analyzed).toBe(1);
    }

    expect(getTeams).toHaveBeenCalledWith('americanfootball_nfl');
    expect(getGames).toHaveBeenCalledTimes(6);
    expect(getGames.mock.calls.every(([sport]) => sport === 'americanfootball_nfl')).toBe(true);
  });

  it('keeps NBA canonical and alias scoring tokens on NBA BDL rows', async () => {
    const { getTeams, getGames } = stubBdlRows();

    for (const token of ['QUARTER_SCORING', 'FIRST_HALF_SCORING', 'SECOND_HALF_SCORING']) {
      const result = await fetchStats('NBA', token, 'Kansas City Chiefs', 'Los Angeles Rams', { season: 2025 });
      expect(result.error).toBeUndefined();
    }

    expect(getTeams).toHaveBeenCalledWith('basketball_nba');
    expect(getGames.mock.calls.every(([sport]) => sport === 'basketball_nba')).toBe(true);
  });

  it('does not open these handlers to unrelated sports', async () => {
    const getTeams = vi.spyOn(ballDontLieService, 'getTeams');

    const result = await fetchStats('MLB', 'FIRST_HALF_TRENDS', 'Mets', 'Yankees', { season: 2026 });

    expect(result.error).toMatch(/belongs to NBA|not available/i);
    expect(getTeams).not.toHaveBeenCalled();
  });
});
