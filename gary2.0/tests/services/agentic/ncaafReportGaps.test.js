import { describe, it, expect } from 'vitest';
import { gamesWithoutRowBeforeLast } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafSchedule.js';

// A report player with stat rows in 5 of 7 games: which two had none was not on the desk (Nov 10 2026).
describe('a report player\'s games with no stat row', () => {
  it('names the games before his last row that have none, once more than three rows', () => {
    const games = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ gameId: n, date: `2026-09-0${n}` }));
    const entry = (ids) => ({ games: new Map(ids.map((id) => [String(id), {}])) });
    expect(gamesWithoutRowBeforeLast(entry([1, 3, 4, 6, 7]), games).map((g) => g.gameId)).toEqual([2, 5]);
    expect(gamesWithoutRowBeforeLast(entry([1, 3, 5]), games)).toEqual([]);
  });
});
