import { describe, it, expect } from 'vitest';
import { lineStory } from '../../src/services/sports/nfl/nflBettorData.js';

// lineStory is shared by the NFL, college and the NBA.
describe('lineStory with no listed move', () => {
  const at = (h) => `2026-10-22T${String(h).padStart(2, '0')}:00:00.000Z`;
  const board = (h, over = {}) => ({ at: at(h), spread_home: -7.5, total: 47.5, ml_home: -300, ml_away: 250, sp_home: -110, sp_away: -110, books: 1, ...over });

  // Oct 23 2026 data audit: the Thunder went from -300 to -335 under the 2.5-point mark, the story said neither line had
  // moved, and the read called it a settled market.
  it('gives the drift of a moneyline that moved under the mark, never "not moved"', () => {
    const text = lineStory({ path: [board(1)], now: board(9, { ml_home: -335, ml_away: 270 }), book: 'fanduel' }, 'Oklahoma City Thunder', 'Denver Nuggets');
    const [, still] = text.split('\n');
    expect(still).not.toMatch(/moneylines? (?:has|have) not moved/i);
    expect(still).toMatch(/-300 to -335 \(75\.0% to 77\.0% implied\)/);
  });
});
