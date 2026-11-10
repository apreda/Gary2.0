import { describe, it, expect } from 'vitest';
import { lineStory, quarterbacks } from '../../src/services/sports/nfl/nflBettorData.js';

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

// Round 3, Nov 10 2026: the Nov 8 Browns read "Deshaun Watson" as the plain starter while this week's report had him
// questionable with a concussion and ESPN's chart had Shedeur Sanders next; Sanders started.
describe('THE QUARTERBACKS with the starter on this week\'s report', () => {
  it('says his report status beside his name and the next quarterback on the chart', () => {
    const d = { season: 2026, schedule: [], playerWeek: [] };
    const desk = '[AWAY] Cleveland Browns: Deshaun Watson (9th Season)\n[HOME] New Orleans Saints: Tyler Shough';
    const chart = new Map([['Cleveland Browns', { listed: [{ name: 'Deshaun Watson', game_status: 'Questionable', injury: 'Concussion' }],
      starter: new Map([['deshaunwatson', { spot: 'qb', next: 'Shedeur Sanders' }]]), qb1: 'Deshaun Watson' }]]);
    const text = quarterbacks(d, desk, 'New Orleans Saints', 'Cleveland Browns', '2026-11-08', { chart });
    expect(text.split('\n')[0]).toBe("Cleveland Browns: Deshaun Watson (Questionable on this week's injury report, concussion; next on ESPN's depth chart: Shedeur Sanders)");
    expect(text).toMatch(/^New Orleans Saints: Tyler Shough$/m);
  });
});
