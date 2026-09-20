import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService as bdl } from '../../../src/services/ballDontLieService.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

const home = { id: 30, full_name: 'San Francisco 49ers' };
const away = { id: 29, full_name: 'Los Angeles Rams' };
const players = [
  { id: 27, first_name: 'Brock', last_name: 'Purdy', position_abbreviation: 'QB' },
  { id: 48, first_name: 'Mac', last_name: 'Jones', position_abbreviation: 'QB' },
  { id: 99, first_name: 'New', last_name: 'Receiver', position_abbreviation: 'WR' },
  { id: 98, first_name: 'Rookie', last_name: 'Runner', position_abbreviation: 'RB' },
];
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T19:00:00Z'));
  vi.spyOn(bdl, 'getGames').mockResolvedValue([]);
  vi.spyOn(bdl, 'getTeamSeasonStats').mockImplementation(async (_sport, { teamId, season }) => [{
    team: {id:teamId}, season, season_type:2, games_played:17, total_points_per_game:25,
    passing_touchdowns:33, passing_interceptions:16,
  }]);
  vi.spyOn(bdl, 'getNflTeamRoster').mockResolvedValue(players.map((player, i) => ({player, position:player.position_abbreviation, depth:i + 1})));
  vi.spyOn(bdl, 'getNflSeasonStatsByTeam').mockResolvedValue([
    {player:players[0], season:2025, games_played:9, passing_touchdowns:20, passing_interceptions:10, qbr:72.81},
    {player:players[1], season:2025, games_played:11, passing_touchdowns:13, passing_interceptions:6},
  ]);
  vi.spyOn(bdl, 'getNflPlayerSeasonStats').mockImplementation(async ({playerId}) => playerId === 99
    ? [{player:players[2], season:2025, games_played:16, receptions:80, receiving_touchdowns:0}] : []);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('NFL named player tokens', () => {
  it('keeps a split-QB season separate from combined team production', async () => {
    const result = await nflFetchers.QB_STATS('americanfootball_nfl',home,away,2026);
    expect(result.home.players).toHaveLength(2);
    expect(result.home.players[0]).toMatchObject({player_id:27,name:'Brock Purdy',games_played:9,
      stats_season:2025, stats_scope:'prior_completed_regular_season',stats:{passing_touchdowns:20,passing_interceptions:10,qbr:72.81,qb_rating:null}});
    expect(result.home.players[1].stats.passing_touchdowns).toBe(13);
    expect(result.home.passing_tds).toBeUndefined();
    expect(result.team_aggregates.home.passing_tds).toBe('33');
    expect(result.team_aggregates.bdl_baselines.home.season).toBe(2025);
    const delivered = summarizeStatForContext(result,'QB_STATS',home.full_name,away.full_name,'NFL');
    expect(delivered).toContain('Brock Purdy');
    expect(delivered).toContain('passing touchdowns 20');
    expect(delivered).toContain('games played 9');
    expect(delivered).toContain('stats season 2025');
    expect(delivered).toContain('Team aggregate context');
  });
  it('retrieves a transferred receiver by ID and retains measured zero', async () => {
    const result = await nflFetchers.WR_TE_STATS('americanfootball_nfl',home,away,2026);
    expect(result.home.players[0]).toMatchObject({player_id:99,stats_season:2025,
      stats:{receptions:80,receiving_touchdowns:0,receiving_yards:null}});
    expect(bdl.getNflPlayerSeasonStats).toHaveBeenCalledWith({playerId:99,season:2025});
  });
  it('does not invent a zero line for a rookie without an individual sample', async () => {
    const result = await nflFetchers.RB_STATS('americanfootball_nfl',home,away,2026);
    expect(result.home.players[0]).toMatchObject({player_id:98,stats:null,games_played:null,stats_scope:'unavailable'});
  });
  it('rejects wrong-season, postseason and seeded future totals for an individual', async () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    bdl.getGames.mockResolvedValue([{id:1,season:2026,season_type:2,status:'Final',date:'2026-09-13T17:00:00Z',home_team:home,visitor_team:away}]);
    bdl.getTeamSeasonStats.mockImplementation(async (_sport,{teamId,season}) => [{team:{id:teamId},season,season_type:2,games_played:season === 2026 ? 1 : 17,total_points_per_game:25}]);
    bdl.getNflSeasonStatsByTeam.mockResolvedValue([
      {player:players[0],season:2026,games_played:17,passing_touchdowns:999},
      {player:players[0],season:2025,games_played:9,passing_touchdowns:888},
      {player:players[0],season:2026,postseason:true,games_played:1,passing_touchdowns:777},
    ]);
    const result = await nflFetchers.QB_STATS('americanfootball_nfl',home,away,2026);
    expect(result.home.players[0].stats).toBeNull();
    expect(JSON.stringify(result.home)).not.toMatch(/999|888|777/);
  });
});
