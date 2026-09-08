import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { fetchTeamProfile } from '../../../src/services/agentic/scoutReport/shared/dataFetchers.js';

const team = { id: 1, full_name: 'New England Patriots' };
const prior = { team, season: 2025, season_type: 2, games_played: 17, total_points_per_game: 28.8 };
const final = { id: 100, season: 2026, season_type: 2, date: '2026-09-10T00:20:00Z', status: 'Final',
  home_team: { id: 31 }, visitor_team: team };

describe('NFL team baseline provenance at the season boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T19:00:00Z'));
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([team]);
    vi.spyOn(ballDontLieService, 'getStandingsGeneric').mockResolvedValue([]);
    vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue([]);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  const stats = (current, priorRows = [prior]) => vi.spyOn(ballDontLieService, 'getTeamSeasonStats')
    .mockImplementation(async (_sport, { season }) => season === 2026 ? [current] : priorRows);

  it('uses explicitly requested 2025 data when the 2026 endpoint seeds last year’s 17-game row before opening night', async () => {
    const reads = stats({ ...prior, season: 2026 });
    const profile = await fetchTeamProfile(team.full_name, 'NFL');
    expect(profile.seasonStatsSeason).toBe(2025);
    expect(profile.seasonStatsScope).toBe('prior_completed_regular_season');
    expect(profile.currentRegularGamesPlayed).toBe(0);
    expect(profile.seasonStatsLabel).toContain('not current-season form');
    expect(reads.mock.calls.map(([, query]) => query.season)).toContain(2025);
  });

  it.each(['preseason', 'another_team', 'future', 'unplayed'])('does not authorize current data from a %s game', async kind => {
    let game = { ...final, date: '2026-09-07T00:20:00Z' };
    if (kind === 'preseason') game.season_type = 1;
    if (kind === 'another_team') game.visitor_team = { id: 99 };
    if (kind === 'future') game.date = final.date;
    if (kind === 'unplayed') game.status = 'Scheduled';
    ballDontLieService.getGames.mockResolvedValue([game]);
    stats({ ...prior, season: 2026, games_played: 1 });
    expect((await fetchTeamProfile(team.full_name, 'NFL')).seasonStatsSeason).toBe(2025);
  });

  it('rejects the seeded 17-game aggregate even after this team’s first regular game finishes', async () => {
    vi.setSystemTime(new Date('2026-09-11T19:00:00Z'));
    ballDontLieService.getGames.mockResolvedValue([final]);
    stats({ ...prior, season: 2026 });
    expect((await fetchTeamProfile(team.full_name, 'NFL')).seasonStatsSeason).toBe(2025);
  });

  it('accepts a substantive current aggregate whose sample fits this team’s completed regular games', async () => {
    vi.setSystemTime(new Date('2026-09-11T19:00:00Z'));
    ballDontLieService.getGames.mockResolvedValue([final]);
    const current = { ...prior, season: 2026, games_played: 1, total_points_per_game: 21 };
    const reads = stats(current);
    const profile = await fetchTeamProfile(team.full_name, 'NFL');
    expect(profile.seasonStats).toEqual(current);
    expect(profile.seasonStatsSeason).toBe(2026);
    expect(profile.seasonStatsScope).toBe('current_regular_season');
    expect(profile.currentRegularGamesPlayed).toBe(1);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('leaves performance unavailable when only placeholder zeros and no verified prior data exist', async () => {
    stats({ team, season: 2026, games_played: 0, total_points_per_game: 0, opp_total_points_per_game: 0,
      rushing_yards_per_game: 0, net_passing_yards_per_game: 0 }, []);
    const profile = await fetchTeamProfile(team.full_name, 'NFL');
    expect(profile.seasonStats).toBeNull();
    expect(profile.seasonStatsSeason).toBeNull();
    expect(profile.seasonStatsScope).toBeNull();
  });

  it('does not relabel a wrong-season or postseason response as the requested regular-season baseline', async () => {
    stats({ ...prior, season: 2026 }, [{ ...prior, season_type: 1 }]);
    expect((await fetchTeamProfile(team.full_name, 'NFL')).seasonStats).toBeNull();
  });
});
