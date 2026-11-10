import { describe, it, expect } from 'vitest';
import { availabilityLines } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafSchedule.js';

// "stat rows in 7 of 8 games, the last Oct 24 (none in the last game)" read as "didn't play last week" (Nov 10 2026).
describe('a listed player with no stat row in the last game', () => {
  const results = [5, 12, 19, 26].map((d, i) => ({ gameId: i + 1, date: `2026-09-${d}T23:00:00Z`, opponent: `Team ${i + 1}`, home: true }));
  const rows = [1, 2, 3].map((id) => ({ player: { id: 9, first_name: 'Jo', last_name: 'Smith', position_abbreviation: 'LB' }, game: { id }, total_tackles: 5 }));
  const reported = [{ name: 'Jo Smith', status: 'Questionable' }];
  const line = (named, jerseys = {}) => availabilityLines('Ducks', reported, rows, results, 'checked', new Set(['1', '2', '3', '4']), new Map(), null, { named, jerseys })
    .find((l) => /Jo Smith/.test(l));

  it('says the play-by-play of that game does not name him only when it is on file and names no one of his name under any jersey', () => {
    expect(line(new Map([['4', ['12|b|jones']]]))).toContain('(none in the last game; the play-by-play of the Sep 26 vs Team 4 game does not name him)');
    expect(line(new Map())).toContain('(none in the last game);');
    expect(line(new Map([['4', ['44|j|smith']]]), { 9: '12' })).toContain('(none in the last game);');
  });
});
