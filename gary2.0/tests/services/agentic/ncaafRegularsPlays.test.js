import { describe, it, expect } from 'vitest';
import { regularsLines } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafSchedule.js';

// "stat rows in 3 of 3 earlier games, the last Sep 19" read as "missed the last game" (Nov 10 2026 college round 5).
describe('a regular with no stat row in the last game', () => {
  const results = [5, 12, 19, 26].map((d, i) => ({ gameId: i + 1, date: `2026-09-${d}T23:00:00Z`, opponent: `Team ${i + 1}`, home: true }));
  const rows = [1, 2, 3].map((id) => ({ player: { id: 9, first_name: 'Jo', last_name: 'Smith', position_abbreviation: 'LB' }, game: { id }, total_tackles: 5 }));
  const line = (named) => regularsLines('Ducks', [], rows, results, new Set(['1', '2', '3', '4']), new Map(), { named, jerseys: {} }).find((l) => /Jo Smith/.test(l));

  it('names the last game by date and opponent when its play-by-play, on file, does not name him', () => {
    expect(line(new Map([['4', ['12|b|jones']]]))).toContain('the last Sep 19 vs Team 3; the play-by-play of the Sep 26 vs Team 4 game does not name him; his last 3 games');
    expect(line(new Map())).toContain('the last Sep 19 vs Team 3; his last 3 games');
  });
});

// The last game's lineup when none is on file (Nov 12 2026): a page that did not load says so, which stops the pick; a
// box neither school's site has, or posts in a form the desk reads, is said in plain words.
describe("the last game's starting lineup", () => {
  const results = [5, 12, 19, 26].map((d, i) => ({ gameId: i + 1, date: `2026-09-${d}T23:00:00Z`, opponent: `Team ${i + 1}`, home: true }));
  const rows = [1, 2, 3, 4].map((id) => ({ player: { id: 9, first_name: 'Jo', last_name: 'Smith', position_abbreviation: 'LB' }, game: { id }, total_tackles: 5 }));
  const lineup = [{ name: 'Jo Smith', key: 'josmith', position: 'LB' }];
  const starts = (why, ids = ['1', '2', '3']) => Object.assign(new Map(ids.map((id) => [id, lineup])), { missing: new Map([['4', why]]) });
  const said = (s) => regularsLines('Ducks', [], rows, results, new Set(['1', '2', '3', '4']), new Map(), null, s).find((l) => /starting lineup/.test(l));

  it('did not load when a page of a site did not load, even with no lineup on file at all', () => {
    expect(said(starts('not_loaded'))).toContain("the last game's starting lineup: did not load");
    expect(said(starts('not_loaded', []))).toContain('did not load');
  });
  it('not on file, with why, when no site has it', () => {
    expect(said(starts('no_site'))).toBe("  the last game's starting lineup: not on file (neither school posts its official box in a form the desk can read)");
    expect(said(starts('not_posted'))).not.toContain('did not load');
    expect(said(starts('no_site', []))).toBeUndefined();
  });
});
