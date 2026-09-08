import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService as bdl } from '../../../src/services/ballDontLieService.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';

vi.mock('../../../src/services/agentic/tools/statRouters/footballAdvanced.js', () => ({
  advancedPair: vi.fn(async () => ({ledger:{},home:{offense:{overall:{epa_per_play:0.2,plays:1000}}},away:{offense:{overall:{epa_per_play:0.1,plays:1000}}}})),
  basisLine: () => 'Computed from 2025 play-by-play, prior-season fixture.',
  continuityFor: () => null,
}));

const home = { id: 31, name: 'Seahawks', full_name: 'Seattle Seahawks' };
const away = { id: 1, name: 'Patriots', full_name: 'New England Patriots' };
const fields = { total_points_per_game: 28, misc_total_takeaways: 19, misc_total_giveaways: 16,
  misc_turnover_differential: 3, defensive_interceptions: 10, passing_interceptions: 8, fumbles_lost: 8,
  rushing_fumbles: 16, receiving_fumbles: 9, fumbles_recovered: 9, passing_qb_rating: 112,
  passing_completion_pct: 70, yards_per_pass_attempt: 8, passing_touchdowns: 31, rushing_yards_per_game: 128,
  rushing_yards_per_rush_attempt: 4.4, rushing_touchdowns: 22, rushing_attempts: 494, rushing_long: 69,
  misc_fourth_down_attempts: 25, misc_fourth_down_convs: 18, misc_fourth_down_conv_pct: 72 };
const row = (team, season) => ({ team, season, season_type: 2, games_played: 17, ...fields,
  misc_total_takeaways: season === 2026 ? 999 : 19 });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T19:00:00Z'));
  vi.spyOn(bdl, 'getGames').mockResolvedValue([]);
  vi.spyOn(bdl, 'getTeamSeasonStats').mockImplementation(async (_sport, {teamId,season}) => [row(teamId === home.id ? home : away,season)]);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('supplemental NFL team baseline provenance', () => {
  it.each(['QB_STATS','TURNOVER_LUCK','FUMBLE_LUCK','FIELD_POSITION','FOURTH_DOWN_TENDENCY','RUSHING_EPA','NFL_SPECIAL_TEAMS'])('%s labels the explicit prior row instead of the seeded new-season totals', async token => {
    const result = await nflFetchers[token]('americanfootball_nfl',home,away,2026);
    expect(result.bdl_baselines).toMatchObject({ home: {season:2025,games_played:17}, away: {season:2025,games_played:17} });
    expect(JSON.stringify(result)).toContain('prior completed');
    expect(JSON.stringify(result)).not.toContain('2026 season');
    expect(JSON.stringify(result)).not.toContain('999');
  });

  it('does not turn future finals, preseason or another team’s game into last-five regular form', async () => {
    const game = {id:1,season:2026,season_type:2,date:'2026-09-10T00:20:00Z',status:'Final',
      home_team:home,visitor_team:away,home_team_score:30,visitor_team_score:10};
    bdl.getGames.mockResolvedValue([game,{...game,id:2,date:'2026-08-29T00:20:00Z',season_type:1},
      {...game,id:3,date:'2026-09-07T00:20:00Z',season_type:3},
      {...game,id:4,date:'2026-09-07T00:20:00Z',home_team:{id:90},visitor_team:{id:99}}]);
    const result = await nflFetchers.EPA_LAST_5('americanfootball_nfl',home,away,2026);
    expect(result.home.note).toBe('No completed games found');
    expect(result.away.note).toBe('No completed games found');
  });

  it('keeps the advanced play-ledger basis distinct from verified BDL aggregates', async () => {
    const result = await nflFetchers.OFFENSIVE_EPA('americanfootball_nfl',home,away,2026);
    expect(result.basis).toBe('Computed from 2025 play-by-play, prior-season fixture.');
    expect(result.bdl_baselines.home.season).toBe(2025);
    expect(result.bdl_sample).toContain('2025 prior completed');
    expect(result.sample).toBeUndefined();
    expect(result.home.epa_per_play).toBe(0.2);
    expect(JSON.stringify(result)).not.toContain('2026 season');
  });

  it('labels each side independently when only one current aggregate is verified after week one', async () => {
    vi.setSystemTime(new Date('2026-09-11T19:00:00Z'));
    bdl.getGames.mockImplementation(async (_sport,{team_ids}) => team_ids[0] === home.id ? [{
      id:10,season:2026,season_type:2,date:'2026-09-10T00:20:00Z',status:'Final',home_team:home,visitor_team:{id:99}
    }] : []);
    bdl.getTeamSeasonStats.mockImplementation(async (_sport,{teamId,season}) => [{
      ...row(teamId === home.id ? home : away,season),games_played:teamId === home.id && season === 2026 ? 1 : 17
    }]);
    const result = await nflFetchers.TURNOVER_LUCK('americanfootball_nfl',home,away,2026);
    expect(result.bdl_baselines).toMatchObject({home:{season:2026,games_played:1},away:{season:2025,games_played:17}});
    expect(result.sample).toContain('Seattle Seahawks: 2026 current regular season');
    expect(result.sample).toContain('New England Patriots: 2025 prior completed');
  });

  it('returns unavailable instead of manufactured zero rates when neither season is verified', async () => {
    bdl.getTeamSeasonStats.mockResolvedValue([]);
    const result = await nflFetchers.PASSING_EPA('americanfootball_nfl',home,away,2026);
    expect(result.error).toContain('unavailable');
    expect(result.home).toBeUndefined();
  });

  it('prints the opener on its Eastern date and does not list an earlier kickoff as upcoming', async () => {
    const game = {id:1,season:2026,season_type:2,date:'2026-09-10T00:20:00Z',status:'Scheduled',home_team:home,visitor_team:away};
    bdl.getGames.mockResolvedValue([game,{...game,id:2,date:'2026-09-08T17:00:00Z'}]);
    const result = await nflFetchers.SCHEDULE_CONTEXT('americanfootball_nfl',home,away,2026);
    expect(result.homeValue).toContain('(2026-09-09)');
    expect(result.homeValue).not.toContain('(2026-09-08)');
  });
});
