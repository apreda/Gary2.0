import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { filterNflWeekGames } from '../../scripts/lib/nflWeekWindow.js';

const games = [
  {id: 1, commence_time: '2026-11-02T01:20:00Z'}, // Sunday after DST ends.
  {id: 2, commence_time: '2026-11-03T01:20:00Z'}, // Monday night.
  {id: 3, commence_time: '2026-11-03T09:59:00Z'}, // Tuesday 4:59 AM ET.
  {id: 4, commence_time: '2026-11-03T10:00:00Z'}, // Tuesday 5:00 AM boundary.
  {id: 5, commence_time: 'invalid'},
];
describe('NFL week selection uses Eastern time on every host', () => {
  it.each(['UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'])('preserves the week boundary across DST with TZ=%s', TZ => {
    const module = new URL('../../scripts/lib/nflWeekWindow.js', import.meta.url).href;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import {filterNflWeekGames} from ${JSON.stringify(module)};
      console.log(JSON.stringify(filterNflWeekGames(${JSON.stringify(games)}, '2026-10-27', new Date('2026-11-01T17:00:00Z')).map(g=>g.id)));`],
    { encoding: 'utf8', env: {...process.env, TZ} });
    expect(JSON.parse(result)).toEqual([1, 2, 3]);
  });
  it('limits Monday to future games on Monday, including after midnight UTC', () => {
    expect(filterNflWeekGames(games, '2026-10-27', new Date('2026-11-02T17:00:00Z')).map(g=>g.id)).toEqual([2]);
  });
});
