import { describe, it, expect } from 'vitest';
import { gameTimeWords } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafSchedule.js';

// Duke's 'Jayden "Duke" Scott' had a box row, and a guard in the official starting lineup had none; both read "did not
// play" (Nov 10 2026 college data round).
describe('a game-time decision on a past row', () => {
  const box = { players: [{ first: 'Jayden', last: 'Scott' }], named: [] };
  const lineup = [{ name: 'Jake Guarnera', key: 'jakeguarnera', jersey: '64', position: 'OL' }];
  it('reads a box row past a quoted nickname, and a starter in the official lineup as played', () => {
    expect(gameTimeWords(box, ['Jayden "Duke" Scott', 'Jake Guarnera', 'Sam Lee'], lineup))
      .toBe('Jayden "Duke" Scott (played), Jake Guarnera (played: in the official starting lineup), Sam Lee (did not play: no box row, not in the play-by-play)');
  });
});
