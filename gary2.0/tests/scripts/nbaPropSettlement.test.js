import { describe, it, expect } from 'vitest';
import { findNbaBoxPlayer, nbaDidNotPlay } from '../../scripts/lib/results/grading.js';

const row = (first, last, extra = {}) => ({ player: { first_name: first, last_name: last }, min: '30:00', pts: 10, ...extra });
const box = (home, visitor) => ({ id: 1, status: 'Final', home_team: { players: home }, visitor_team: { players: visitor } });

describe('the NBA prop player', () => {
  it('takes the full name over a teammate with the same surname and initial', () => {
    const jaylin = row('Jaylin', 'Williams', { pts: 3 });
    const jalen = row('Jalen', 'Williams', { pts: 21 });
    expect(findNbaBoxPlayer([box([jaylin, jalen], [])], 'Jalen Williams')).toBe(jalen);
  });
  it('takes surname and initial only when one player in the game fits', () => {
    const herb = row('Herbert', 'Jones');
    expect(findNbaBoxPlayer([box([herb], [])], 'Herb Jones')).toBe(herb);
    expect(findNbaBoxPlayer([box([row('Davion', 'Mitchell'), row('Donovan', 'Mitchell')], [])], 'Dav Mitchell')).toBeNull();
  });
  it('reads a row with no minutes and no stats as did not play', () => {
    expect(nbaDidNotPlay(row('Kawhi', 'Leonard', { min: '0', pts: 0 }))).toBe(true);
    expect(nbaDidNotPlay(row('Kawhi', 'Leonard', { min: '0:45', pts: 0 }))).toBe(false);
  });
});
