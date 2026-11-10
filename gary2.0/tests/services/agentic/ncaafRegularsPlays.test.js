import { describe, it, expect } from 'vitest';
import { regularsLines } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafSchedule.js';

// "stat rows in 3 of 3 earlier games, the last Sep 19" read as "missed the last game" (Nov 10 2026 college round 5).
describe('a regular with no stat row in the last game', () => {
  const results = [5, 12, 19, 26].map((d, i) => ({ gameId: i + 1, date: `2026-09-${d}T23:00:00Z`, opponent: `Team ${i + 1}`, home: true }));
  const rows = [1, 2, 3].map((id) => ({ player: { id: 9, first_name: 'Jo', last_name: 'Smith', position_abbreviation: 'LB' }, game: { id }, total_tackles: 5 }));
  const line = (named) => regularsLines('Ducks', [], rows, results, new Set(['1', '2', '3', '4']), new Map(), { named, jerseys: {} }).find((l) => /Jo Smith/.test(l));

  it('says the last game\'s play-by-play does not name him only when it is on file', () => {
    expect(line(new Map([['4', ['12|b|jones']]]))).toContain("the last Sep 19 vs Team 3; the last game's play-by-play does not name him; his last 3 games");
    expect(line(new Map())).toContain('the last Sep 19 vs Team 3; his last 3 games');
  });
});
