import { describe, expect, it } from 'vitest';
import { nflSeason, ncaafSeason } from '../../src/utils/dateUtils.js';

describe('football season identity in Eastern time', () => {
  it('turns both football seasons over when August begins', () => {
    const july = new Date('2026-07-31T16:00:00Z');
    const august = new Date('2026-08-01T16:00:00Z');
    expect(nflSeason(july)).toBe(2025);
    expect(ncaafSeason(july)).toBe(2025);
    expect(nflSeason(august)).toBe(2026);
    expect(ncaafSeason(august)).toBe(2026);
  });

  it('keeps January postseason games in the season that began the prior year', () => {
    const postseason = new Date('2027-01-20T18:00:00Z');
    expect(nflSeason(postseason)).toBe(2026);
    expect(ncaafSeason(postseason)).toBe(2026);
  });
});
