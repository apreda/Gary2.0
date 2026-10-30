import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/gary/agentic/tools/statRouters/mlbFetchers.js', () => ({ findParkData: vi.fn().mockReturnValue(null) }));

const { buildBigGames } = await import('../../src/services/content/tomorrowBoard/bigGames.js');

const nba = (away, home, commence_time, id) => ({ league: 'NBA', away_team: away, home_team: home, commence_time, bdl_game_id: id });
// Friday Oct 30 2026's NBA slate (times UTC).
const friday = [
  nba('Charlotte Hornets', 'Washington Wizards', '2026-10-30T23:00:00.000Z', 1),
  nba('Chicago Bulls', 'Boston Celtics', '2026-10-30T23:30:00.000Z', 2),
  nba('New York Knicks', 'Philadelphia 76ers', '2026-10-30T23:30:00.000Z', 3),
  nba('Indiana Pacers', 'Miami Heat', '2026-10-31T00:00:00.000Z', 4),
  nba('Los Angeles Lakers', 'Golden State Warriors', '2026-10-31T02:00:00.000Z', 5),
  nba('Denver Nuggets', 'Phoenix Suns', '2026-10-31T02:00:00.000Z', 6),
];

describe('big games on an NBA night', () => {
  it('a night of NBA always has a big game: the headliner first, a rivalry second, never the whole slate', () => {
    const big = buildBigGames(friday, { mlb: null });
    expect(big.map(b => b.matchup)).toEqual([
      'Los Angeles Lakers @ Golden State Warriors',
      'New York Knicks @ Philadelphia 76ers',
    ]);
    expect(big[0]).toMatchObject({ league: 'NBA', rank: 1, bdl_game_id: 5 });
  });

  it('an ordinary second game stays off: one headliner only', () => {
    const big = buildBigGames(friday.filter(r => [1, 4, 6].includes(r.bdl_game_id)), { mlb: null });
    expect(big).toHaveLength(1);
  });

  it('the NFL\'s national window still outranks the NBA headliner', () => {
    const tnf = { league: 'NFL', away_team: 'Carolina Panthers', home_team: 'Green Bay Packers', commence_time: '2026-10-30T00:15:00.000Z', bdl_game_id: 9 };
    const big = buildBigGames([tnf, ...friday], { mlb: null });
    expect(big[0].league).toBe('NFL');
    expect(big[1].matchup).toBe('Los Angeles Lakers @ Golden State Warriors');
  });
});
