import { describe, it, expect } from 'vitest';
import { offRosterStatus } from '../../src/services/gary/agentic/scoutReport/sports/nflGameByGame.js';

// Round 3, Nov 10 2026: Dameon Pierce, released from IR with an injury settlement two days before the game, read
// "Questionable" on the Nov 8 Eagles report.
describe('a listed player off the roster since his last game', () => {
  it('reads Released, not a game status', () => {
    const rows = [{ week: '7', team: 'PHI', status: 'ACT' }, { week: '8', team: 'PHI', status: 'RES' }, { week: '9', team: 'PHI', status: 'CUT' }];
    expect(offRosterStatus(rows, 'PHI', 7)).toBe('Released');
    expect(offRosterStatus(rows.slice(0, 2), 'PHI', 7)).toBe(null);
  });
});
