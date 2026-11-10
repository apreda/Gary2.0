// An opponent's Out list keeps a player the report spells one way and the box another (Nov 10 2026 data round:
// Washington's "Alex Sarr", Out on Nov 2, read "WAS out: nobody" because the box has "Alexandre Sarr").
import { describe, expect, it } from 'vitest';
import { outWhoHadPlayed } from '../../src/services/sports/nba/nbaBettorData.js';

describe("NBA game rows: the opponent's Out list", () => {
  it('keeps players who had played under another spelling, and only them', () => {
    const played = ['Alexandre Sarr', 'Sergio De Larrea', 'Terrence Shannon Jr.', 'Jaylin Williams'];
    expect(outWhoHadPlayed(['Alex Sarr', 'Sergio de Larrea', 'Terrence Shannon Jr', 'Jalen Williams', 'Nobody Yet'], played))
      .toEqual(['Alex Sarr', 'Sergio de Larrea', 'Terrence Shannon Jr']);
  });
});
