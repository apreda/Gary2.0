import { describe, it, expect } from 'vitest';
import { raceLine } from '../../src/services/agentic/scoutReport/sports/mlbSeptember.js';

describe('mlbSeptember — the race, as facts', () => {
  it('says games left, the division spot, the wild card gap, and whether the race is tight or over', () => {
    expect(raceLine({ gamesPlayed: 138, divisionRank: '2', gamesBack: '3.5', wildCardGamesBack: '0' }))
      .toBe('September: 24 games to play, 2nd in the division, 3.5 back, holding a wild card spot — in a tight race.');
    expect(raceLine({ gamesPlayed: 139, divisionRank: '5', gamesBack: '31.0', wildCardGamesBack: '24.5' }))
      .toBe('September: 23 games to play, 5th in the division, 31 back, 24.5 back of the last wild card — out of the race.');
    expect(raceLine({ gamesPlayed: 140, divisionRank: '1', gamesBack: '-', wildCardGamesBack: '-' }))
      .toBe('September: 22 games to play, 1st in the division.');
    expect(raceLine({ gamesPlayed: 140, divisionRank: '3', gamesBack: '9.0', wildCardGamesBack: '6.5' }))
      .toBe('September: 22 games to play, 3rd in the division, 9 back, 6.5 back of the last wild card.');
  });

  it('prints nothing without a standings row, and never a word about the bet', () => {
    expect(raceLine(null)).toBeNull();
    expect(raceLine({})).toBeNull();
    const line = raceLine({ gamesPlayed: 138, divisionRank: '2', gamesBack: '3.5', wildCardGamesBack: '0' });
    expect(line).not.toMatch(/\b(fade|bet|edge|value|favorite|underdog)\b/i);
  });
});
