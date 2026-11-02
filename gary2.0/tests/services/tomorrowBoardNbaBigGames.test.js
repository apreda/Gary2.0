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
    // The 7:30 rivalry and the 10:00 headliner don't overlap: Home counts down to the 7:30 first.
    expect(big.map(b => b.matchup)).toEqual([
      'New York Knicks @ Philadelphia 76ers',
      'Los Angeles Lakers @ Golden State Warriors',
    ]);
    expect(big.map(b => b.hero)).toEqual([true, true]);
    expect(big[1]).toMatchObject({ league: 'NBA', bdl_game_id: 5 });
  });

  it('an ordinary night gets one game per window (7:00, then the 10:00 West Coast game), never the whole slate', () => {
    const big = buildBigGames(friday.filter(r => [1, 4, 6].includes(r.bdl_game_id)), { mlb: null });
    expect(big.map(b => b.bdl_game_id)).toEqual([1, 6]);
  });

  it('Monday night football takes the hero over an earlier NBA game; the NBA headliner stays in the ribbon', () => {
    // Nov 2 2026: Bears @ Seahawks 8:15 PM ET, Nets @ Knicks 7:30 PM ET.
    const mnf = { league: 'NFL', away_team: 'Chicago Bears', home_team: 'Seattle Seahawks', commence_time: '2026-11-03T01:15:00.000Z', bdl_game_id: 9 };
    const knicks = nba('Brooklyn Nets', 'New York Knicks', '2026-11-03T00:30:00.000Z', 7);
    const late = nba('Los Angeles Lakers', 'Golden State Warriors', '2026-11-03T03:30:00.000Z', 8);
    const big = buildBigGames([knicks, late, mnf], { mlb: null });
    expect(big[0]).toMatchObject({ league: 'NFL', rank: 1, hero: true });
    expect(big.filter(b => b.league === 'NBA').every(b => b.hero === false)).toBe(true);
    expect(big.some(b => b.matchup === 'Los Angeles Lakers @ Golden State Warriors')).toBe(true);
  });

  it('an NFL Sunday counts down to the best 1:00 game, the best late-afternoon game, then the night game', () => {
    const nfl = (away, home, t, id, spread = -6.5) => ({ league: 'NFL', away_team: away, home_team: home, commence_time: t, bdl_game_id: id, spread });
    const sunday = [
      nfl('Tennessee Titans', 'Jacksonville Jaguars', '2026-11-08T18:00:00.000Z', 1),
      nfl('Baltimore Ravens', 'Pittsburgh Steelers', '2026-11-08T18:00:00.000Z', 2, -2.5),
      nfl('New Orleans Saints', 'Carolina Panthers', '2026-11-08T18:00:00.000Z', 3),
      nfl('Las Vegas Raiders', 'Denver Broncos', '2026-11-08T21:05:00.000Z', 4),
      nfl('Dallas Cowboys', 'Philadelphia Eagles', '2026-11-08T21:25:00.000Z', 5, -3),
      nfl('Kansas City Chiefs', 'Buffalo Bills', '2026-11-09T01:20:00.000Z', 6),
      nba('Boston Celtics', 'New York Knicks', '2026-11-08T23:30:00.000Z', 7),
    ];
    const big = buildBigGames(sunday, { mlb: null });
    expect(big.filter(b => b.hero).map(b => b.bdl_game_id)).toEqual([2, 5, 6]);
    expect(big.slice(0, 3).map(b => b.rank)).toEqual([1, 2, 3]);
    // The 6:30 PM NBA rivalry overlaps the late game and the night game: in the list, never the hero.
    expect(big.find(b => b.bdl_game_id === 7)).toMatchObject({ hero: false });
    // Afternoon games that lost their window stay off the list.
    expect(big.some(b => [1, 3, 4].includes(b.bdl_game_id))).toBe(false);
  });
});
