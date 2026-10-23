import { describe, it, expect } from 'vitest';
import { nationalNbaGames } from '../../../src/services/winners/nbaNationalGames.js';

const event = (away, home, names, [ar, hr] = ['0-0', '0-0'], date = '2026-10-23T23:00Z') => ({
  date,
  competitions: [{
    broadcasts: [{ market: names ? 'national' : 'home', names: names || ['FanDuel SN'] }],
    competitors: [
      { homeAway: 'home', team: { name: home }, records: [{ summary: hr }] },
      { homeAway: 'away', team: { name: away }, records: [{ summary: ar }] },
    ],
  }],
});
const slate = [
  { bdl_game_id: 1, away_team: 'New York Knicks', home_team: 'Boston Celtics', commence_time: '2026-10-23T23:00:00Z' },
  { bdl_game_id: 2, away_team: 'Houston Rockets', home_team: 'San Antonio Spurs', commence_time: '2026-10-24T01:30:00Z' },
  { bdl_game_id: 3, away_team: 'Atlanta Hawks', home_team: 'Charlotte Hornets', commence_time: '2026-10-23T23:00:00Z' },
  { bdl_game_id: 4, away_team: 'Brooklyn Nets', home_team: 'Toronto Raptors', commence_time: '2026-10-23T23:00:00Z' },
];

describe('NBA big games: the national-TV games', () => {
  it('takes national TV only, matches the slate, and keeps two: better records first, then the later tip', () => {
    const events = [
      event('Knicks', 'Celtics', ['Prime Video'], ['1-1', '1-1']),
      event('Rockets', 'Spurs', ['Prime Video'], ['1-1', '1-1']),
      event('Hawks', 'Hornets', null, ['2-0', '2-0']),           // local TV
      event('Nets', 'Raptors', ['NBA TV'], ['2-0', '2-0']),      // NBA TV is not national TV here
    ];
    const picked = nationalNbaGames(events, slate);
    expect(picked.map((g) => g.row.bdl_game_id)).toEqual([2, 1]);
    expect(picked[0].networks).toEqual(['Prime Video']);
    const three = [...events, event('Hawks', 'Hornets', ['ESPN'], ['2-0', '2-0'])];
    expect(nationalNbaGames(three, slate).map((g) => g.row.bdl_game_id)).toEqual([3, 2]);
  });
});
