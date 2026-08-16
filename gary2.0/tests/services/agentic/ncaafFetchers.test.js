import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import {
  ncaafFetchers,
  selectNcaafTeamStats
} from '../../../src/services/agentic/tools/statRouters/ncaafFetchers.js';

const home = { id: 11, full_name: 'Home State' };
const away = { id: 22, full_name: 'Away Tech' };

describe('selectNcaafTeamStats', () => {
  it('selects by team id instead of trusting array order', () => {
    const homeRow = { team: { id: 11 }, passing_yards: 111 };
    const awayRow = { team: { id: 22 }, passing_yards: 222 };
    expect(selectNcaafTeamStats([awayRow, homeRow], 11)).toBe(homeRow);
    expect(selectNcaafTeamStats([homeRow, awayRow], '22')).toBe(awayRow);
  });

  it('rejects an explicitly mismatched singleton', () => {
    expect(selectNcaafTeamStats([{ team_id: 22, passing_yards: 222 }], 11)).toBeNull();
  });

  it('accepts a singleton only when BDL omitted team identity', () => {
    const row = { passing_yards: 111 };
    expect(selectNcaafTeamStats([row], 11)).toBe(row);
  });
});
describe('NCAAF BDL fetcher pairing', () => {
  let originalGetTeamSeasonStats;

  beforeEach(() => {
    originalGetTeamSeasonStats = ballDontLieService.getTeamSeasonStats;
  });

  afterEach(() => {
    ballDontLieService.getTeamSeasonStats = originalGetTeamSeasonStats;
  });

  it('keeps home and away rows distinct even when responses are reversed', async () => {
    const homeRow = {
      team: { id: 11 },
      passing_yards: 0,
      passing_yards_per_game: 0,
      passing_touchdowns: 0,
      passing_interceptions: 0
    };
    const awayRow = {
      team: { id: 22 },
      passing_yards: 987,
      passing_yards_per_game: 246.75,
      passing_touchdowns: 8,
      passing_interceptions: 3
    };
    const calls = [];
    ballDontLieService.getTeamSeasonStats = async (sport, options) => {
      calls.push({ sport, options });
      return options.teamId === home.id ? [awayRow, homeRow] : [homeRow, awayRow];
    };

    const result = await ncaafFetchers.NCAAF_PASSING_OFFENSE(
      'americanfootball_ncaaf', home, away, 2026
    );

    expect(result.error).toBeUndefined();
    expect(result.home).toEqual({
      team: 'Home State',
      passing_yards: 0,
      passing_ypg: '0.0',
      passing_tds: 0,
      passing_ints: 0
    });
    expect(result.away).toEqual({
      team: 'Away Tech',
      passing_yards: 987,
      passing_ypg: '246.8',
      passing_tds: 8,
      passing_ints: 3
    });
    expect(calls).toEqual([
      { sport: 'americanfootball_ncaaf', options: { teamId: 11, season: 2026 } },
      { sport: 'americanfootball_ncaaf', options: { teamId: 22, season: 2026 } }
    ]);
  });

  it('fails closed when BDL labels a row as the wrong team', async () => {
    ballDontLieService.getTeamSeasonStats = async (_sport, options) => [
      { team_id: options.teamId === home.id ? away.id : home.id, passing_yards: 100 }
    ];

    const result = await ncaafFetchers.NCAAF_PASSING_OFFENSE(
      'americanfootball_ncaaf', home, away, 2026
    );

    expect(result.error).toMatch(/no team-matched NCAAF season stats/i);
    expect(result.home).toEqual({ team: 'Home State' });
    expect(result.away).toEqual({ team: 'Away Tech' });
  });

  it('does not turn a fully missing total into a fabricated zero', async () => {
    ballDontLieService.getTeamSeasonStats = async (_sport, options) => [
      { team: { id: options.teamId } }
    ];

    const result = await ncaafFetchers.NCAAF_TOTAL_OFFENSE(
      'americanfootball_ncaaf', home, away, 2026
    );

    expect(result.home.total_yards).toBe('N/A');
    expect(result.home.total_ypg).toBe('N/A');
    expect(result.away.total_yards).toBe('N/A');
    expect(result.away.total_ypg).toBe('N/A');
  });
});
