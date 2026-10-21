import { describe, it, expect } from 'vitest';
import { departures, playoffStory } from '../../src/services/sports/nba/nbaOpeningNight.js';

const team = (id, full_name) => ({ id, full_name });
const BOS = team(2, 'Boston Celtics'), ORL = team(22, 'Orlando Magic'), NYK = team(20, 'New York Knicks'), MIA = team(16, 'Miami Heat');
const game = (date, home, visitor, hs, vs) => ({ date, home_team: home, visitor_team: visitor, home_team_score: hs, visitor_team_score: vs });

describe('last season\'s playoffs in a line', () => {
  it('names each round, its opponent and the series score, with a play-in first', () => {
    const games = [
      game('2026-04-15', BOS, MIA, 110, 100),
      ...[1, 2, 3, 4, 5].map((d) => game(`2026-04-2${d}`, BOS, ORL, d === 3 ? 90 : 110, 100)),
      ...[1, 2, 3, 4, 5, 6].map((d) => game(`2026-05-0${d}`, NYK, BOS, 110, [2, 5].includes(d) ? 120 : 100)),
    ];
    expect(playoffStory(games, 2)).toEqual([
      'won a play-in game against the Miami Heat',
      'beat the Orlando Magic 4-1 in the first round',
      'lost to the New York Knicks 2-4 in the conference semifinals',
    ]);
  });
});

describe('who left since last season', () => {
  it('lists last season\'s players missing from this roster, most minutes first, skipping players traded away during last season', () => {
    const data = { teams: {
      2: { name: 'Boston Celtics', players: {
        10: { name: 'Jaylen Brown', minutes: 2444, first: '2025-10-22', last: '2026-05-06' },
        11: { name: 'Chris Boucher', minutes: 93, first: '2025-10-22', last: '2026-01-10' },
        12: { name: 'Anfernee Simons', minutes: 900, first: '2025-10-22', last: '2026-02-01' },
        13: { name: 'Jayson Tatum', minutes: 300, first: '2026-03-01', last: '2026-05-06' },
      } },
      9: { name: 'Chicago Bulls', players: { 12: { name: 'Anfernee Simons', minutes: 700, first: '2026-02-05', last: '2026-04-12' } } },
    } };
    expect(departures(data, 2, [{ id: 13 }])).toEqual([{ id: 10, name: 'Jaylen Brown' }, { id: 11, name: 'Chris Boucher' }]);
  });
});
