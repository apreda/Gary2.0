import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { fetchStartingQBs, fetchQBStatsByName, fetchKeyPlayers, formatKeyPlayers, formatStartingQBs } from '../../../src/services/agentic/scoutReport/sports/nfl.js';

const home = { id: 1, full_name: 'New England Patriots', abbreviation: 'NE' };
const away = { id: 31, full_name: 'Seattle Seahawks', abbreviation: 'SEA' };
const player = (id = 1) => ({ id, first_name: id === 1 ? 'Drake' : 'Sam', last_name: id === 1 ? 'Maye' : 'Darnold', position_abbreviation: 'QB', experience: '4th Season' });
const row = (id, season, games = 17) => ({ player: player(id), season, postseason: false, games_played: games, passing_yards: season === 2025 ? 4000 : 9999, passing_touchdowns: 30 });
const prior = { statsSeason: 2025, currentRegularGamesPlayed: 0 };
beforeEach(() => {
  ballDontLieService.clearCache();
  vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([home, away]);
  vi.spyOn(ballDontLieService, 'getStartingQBFromDepthChart').mockImplementation(async id => ({ name: id === 1 ? 'Drake Maye' : 'Sam Darnold', isBackup: false }));
  vi.spyOn(ballDontLieService, 'getNflTeamRoster').mockImplementation(async id => [{ depth: 1, position: 'QB', player: player(id) }]);
  vi.spyOn(ballDontLieService, 'getNflSeasonStatsByTeam').mockImplementation(async (id, season) => [row(id, season)]);
  vi.spyOn(ballDontLieService, 'getPlayersActive').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('NFL current roster and verified performance seasons', () => {
  it('uses current starting quarterbacks with each side’s explicitly selected prior performance baseline', async () => {
    const result = await fetchStartingQBs(home.full_name, away.full_name, 'NFL', null, 2026, { home: prior, away: prior });
    expect(ballDontLieService.getStartingQBFromDepthChart.mock.calls.map(call => call[1])).toEqual([2026, 2026]);
    expect(ballDontLieService.getNflSeasonStatsByTeam.mock.calls.map(call => call[1])).toEqual([2025, 2025]);
    expect(result.home).toMatchObject({ name: 'Drake Maye', statsSeason: 2025, passingYards: 4000 });
    expect(result.away).toMatchObject({ name: 'Sam Darnold', statsSeason: 2025, passingYards: 4000 });
    expect(formatStartingQBs(home.full_name, away.full_name, result)).toContain('2025-26 prior completed season baseline (not current-season form)');
  });

  it.each([0, 77.06])('labels the provider QBR field separately from quarterback rating (%s)', async qbr => {
    ballDontLieService.getNflSeasonStatsByTeam.mockImplementation(async (id, season) => [{ ...row(id, season), qbr, qb_rating: 112.7 }]);
    const result = await fetchStartingQBs(home.full_name, away.full_name, 'NFL', null, 2026, { home: prior, away: prior });
    expect(result.home).toMatchObject({ qbr, qbRating: 112.7 });
    const text = formatStartingQBs(home.full_name, away.full_name, result);
    expect(text).toContain(`QBR: ${qbr.toFixed(1)}`);
    expect(text).toContain('Rating: 112.7');
  });

  it('joins prior player production only to the current roster and labels different side baselines separately', async () => {
    ballDontLieService.getNflSeasonStatsByTeam.mockImplementation(async (id, season) => [row(id, season, season === 2026 ? 1 : 17), row(999, season)]);
    const result = await fetchKeyPlayers(home.full_name, away.full_name, 'NFL', 2026, {
      home: prior, away: { statsSeason: 2026, currentRegularGamesPlayed: 1 },
    });
    expect(ballDontLieService.getNflTeamRoster.mock.calls.map(call => call[1])).toEqual([2026, 2026]);
    expect(ballDontLieService.getNflSeasonStatsByTeam.mock.calls).toEqual([[1, 2025], [31, 2026]]);
    expect(result).toMatchObject({ rosterSeason: 2026, statsSeasons: { home: 2025, away: 2026 } });
    expect(result.home.offense).toHaveLength(1);
    expect(result.home.offense[0]).toMatchObject({ name: 'Drake Maye', passingYards: 4000 });
    expect(result.away.offense[0]).toMatchObject({ name: 'Sam Darnold', gamesPlayed: 1 });
    const formatted = formatKeyPlayers(home.full_name, away.full_name, result);
    expect(formatted).toContain('New England Patriots: 2025-26 prior completed season baseline (not current-season form)');
    expect(formatted).toContain('Seattle Seahawks: 2026-27 regular-season totals');
  });

  it('rejects a seeded current quarterback total whose games exceed verified current games', async () => {
    const result = await fetchQBStatsByName('Drake Maye', home.full_name, 2026, { statsSeason: 2026, currentRegularGamesPlayed: 1 });
    expect(result).toMatchObject({ statsSeason: 2025, passingYards: 4000 });
  });

  it('does not replace an explicitly unavailable baseline with the contaminated current endpoint', async () => {
    const result = await fetchQBStatsByName('Drake Maye', home.full_name, 2026, { statsSeason: null, currentRegularGamesPlayed: 0 });
    expect(ballDontLieService.getNflSeasonStatsByTeam).not.toHaveBeenCalled();
    expect(result.statsSeason).toBeNull();
    expect(result.passingYards).toBeNull();
  });

  it('does not relabel a wrong-season or postseason quarterback response as the selected baseline', async () => {
    ballDontLieService.getNflSeasonStatsByTeam.mockResolvedValue([row(1, 2026), { ...row(1, 2025), postseason: true }]);
    const result = await fetchQBStatsByName('Drake Maye', home.full_name, 2026, prior);
    expect(result.statsSeason).toBeNull();
    expect(result.passingYards).not.toBe(9999);
  });

  it('counts a receiver appearing in multiple depth-chart slots once and leaves room for other current receivers', async () => {
    const receiver = (id, first_name, last_name) => ({ id, first_name, last_name, position_abbreviation: 'WR', position: 'Wide Receiver' });
    const shaheed = receiver(640, 'Rashid', 'Shaheed');
    const kupp = receiver(794, 'Cooper', 'Kupp');
    ballDontLieService.getNflTeamRoster.mockResolvedValue([
      { depth: 1, position: 'WR-2', player: shaheed },
      { depth: 1, position: 'KR', player: shaheed },
      { depth: 1, position: 'PR', player: shaheed },
      { depth: 1, position: 'WR-3', player: kupp },
    ]);
    ballDontLieService.getNflSeasonStatsByTeam.mockResolvedValue([shaheed, kupp].map(player => ({ player, season: 2025,
      postseason: false, games_played: 17, receptions: 50, receiving_yards: 700 })));
    const result = await fetchKeyPlayers(home.full_name, away.full_name, 'NFL', 2026, { home: prior, away: prior });
    expect(result.away.offense.map(player => player.name)).toEqual(['Rashid Shaheed', 'Cooper Kupp']);
    expect(result.away.offense.map(player => player.position)).toEqual(['WR', 'WR']);
    expect(formatKeyPlayers(home.full_name, away.full_name, result).match(/Rashid Shaheed/g)).toHaveLength(4); // One receiving-target and one roster entry per team.
  });

  it('deduplicates the separate roster-depth section before its player cap', async () => {
    vi.spyOn(ballDontLieService, 'getTeamByNameGeneric').mockResolvedValueOnce(home).mockResolvedValueOnce(away);
    const repeated = { depth: 1, position: 'WR', player: { id: 640, first_name: 'Rashid', last_name: 'Shaheed' } };
    const next = { depth: 2, position: 'WR', player: { id: 794, first_name: 'Cooper', last_name: 'Kupp' } };
    ballDontLieService.getNflTeamRoster.mockResolvedValue([...Array(13).fill(repeated), next]);
    const result = await ballDontLieService.getNflRosterDepth(home.full_name, away.full_name, 2026);
    expect(result.home.map(player => player.name)).toEqual(['Rashid Shaheed', 'Cooper Kupp']);
    expect(result.away.map(player => player.name)).toEqual(['Rashid Shaheed', 'Cooper Kupp']);
  });

  it('retains numbered receiver slots in the roster-depth section without treating return duties as additional receivers', async () => {
    vi.spyOn(ballDontLieService, 'getTeamByNameGeneric').mockResolvedValueOnce(home).mockResolvedValueOnce(away);
    const receiver = (id, first_name, last_name) => ({ id, first_name, last_name, position_abbreviation: 'WR', position: 'Wide Receiver' });
    const shaheed = receiver(640, 'Rashid', 'Shaheed');
    const kupp = receiver(794, 'Cooper', 'Kupp');
    ballDontLieService.getNflTeamRoster.mockResolvedValue([
      { depth: 1, position: 'WR-2', player: shaheed }, { depth: 1, position: 'WR-3', player: kupp },
      { depth: 1, position: 'KR', player: shaheed }, { depth: 1, position: 'PR', player: shaheed },
    ]);
    const result = await ballDontLieService.getNflRosterDepth(home.full_name, away.full_name, 2026);
    expect(result.home.map(player => ({name:player.name,position:player.position}))).toEqual([
      { name: 'Rashid Shaheed', position: 'WR' }, { name: 'Cooper Kupp', position: 'WR' },
    ]);
  });
});
