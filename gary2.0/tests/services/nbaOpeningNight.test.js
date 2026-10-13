import { describe, it, expect } from 'vitest';
import { playoffStory } from '../../src/services/nbaOpeningNight.js';

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
