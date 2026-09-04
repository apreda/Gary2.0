import { describe, expect, it } from 'vitest';
import {
  NCAAF_CONFERENCE_DISPLAY,
  resolveNcaafTeamMetadata,
} from '../../src/services/ncaafGameMetadata.js';

/**
 * NCAAF game metadata (founder, Aug 25 2026) — conference + AP rank stamps for
 * the app's college navigation. Provider-grounded: exact identity or nulls.
 */

const sources = {
  byName: new Map([
    ['usc trojans', { id: 61, full_name: 'USC Trojans', conference: '4', abbreviation: 'USC' }],
    ['san jose state spartans', { id: 90, full_name: 'San José State Spartans', conference: '8' }],
    ['notre dame fighting irish', { id: 87, full_name: 'Notre Dame Fighting Irish', conference: '6' }],
    ['north dakota state bison', { id: 140, full_name: 'North Dakota State Bison', conference: '17' }],
  ]),
  rankByTeamId: new Map([['61', 21]]),
};

describe('resolveNcaafTeamMetadata', () => {
  it('resolves conference display name and AP rank by exact identity', () => {
    expect(resolveNcaafTeamMetadata('USC Trojans', sources))
      .toEqual({ conference: 'Big Ten', ranking: 21, abbreviation: 'USC' });
  });

  it('handles accented provider names and team objects', () => {
    expect(resolveNcaafTeamMetadata({ full_name: 'San José State Spartans' }, sources))
      .toEqual({ conference: 'Mountain West', ranking: null, abbreviation: null });
  });

  it('independents display as Independents', () => {
    expect(resolveNcaafTeamMetadata('Notre Dame Fighting Irish', sources).conference)
      .toBe('Independents');
  });

  it('a non-FBS conference id maps to null, never a guessed name', () => {
    expect(resolveNcaafTeamMetadata('North Dakota State Bison', sources))
      .toEqual({ conference: null, ranking: null, abbreviation: null });
  });

  it('an unresolvable team gets nulls, never a substring match', () => {
    // Unresolved means unresolved: no conference, no rank, and no short form
    // to print on a card (Sep 4 2026 — the resolver now carries the provider's
    // own abbreviation so college pick cards stop printing whole school names).
    expect(resolveNcaafTeamMetadata('USC', sources))
      .toEqual({ conference: null, ranking: null, abbreviation: null });
  });
});

describe('the conference display map', () => {
  it('covers exactly the FBS directory ids', () => {
    expect(Object.keys(NCAAF_CONFERENCE_DISPLAY).map(Number).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(NCAAF_CONFERENCE_DISPLAY[10]).toBe('SEC');
    expect(NCAAF_CONFERENCE_DISPLAY[6]).toBe('Independents');
  });
});
