import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { disambiguatePitcherHits } from '../../src/services/pitcherIdentity.js';

const tomorrowSrc = readFileSync(new URL('../../src/services/tomorrowService.js', import.meta.url), 'utf8');

// Leakage-audit finding 5 (founder GO, Aug 18): when several players share an
// exact full name and the team id could not break the tie, the resolver
// guessed byName[0]. We are always resolving a PITCHER here, so position is a
// real discriminator — exactly one pitcher among the hits is safe; anything
// else returns null. Never guess.

describe('disambiguatePitcherHits', () => {
  const catcherSmith = { id: 101, position: 'C' };
  const relieverSmith = { id: 202, position: 'P' };

  it('picks the lone pitcher among same-name hits (the two-Will-Smiths case)', () => {
    expect(disambiguatePitcherHits([catcherSmith, relieverSmith])).toBe(202);
    expect(disambiguatePitcherHits([relieverSmith, catcherSmith])).toBe(202);
  });

  it('accepts SP, RP, and two-way positions as pitchers', () => {
    expect(disambiguatePitcherHits([{ id: 1, position: 'SP' }, catcherSmith])).toBe(1);
    expect(disambiguatePitcherHits([{ id: 2, position: 'RP' }, catcherSmith])).toBe(2);
    expect(disambiguatePitcherHits([{ id: 3, position: 'TWP' }, catcherSmith])).toBe(3);
  });

  it('returns null when the tie survives — two pitchers, or no position data', () => {
    expect(disambiguatePitcherHits([relieverSmith, { id: 303, position: 'SP' }])).toBe(null);
    expect(disambiguatePitcherHits([{ id: 1, position: '' }, { id: 2, position: null }])).toBe(null);
    expect(disambiguatePitcherHits([])).toBe(null);
    expect(disambiguatePitcherHits(null)).toBe(null);
  });
});

describe('resolver wiring', () => {
  it('routes the ambiguous-name path through the disambiguator, never a positional guess', () => {
    expect(tomorrowSrc).toContain('disambiguatePitcherHits(byName)');
    // The single-hit `byName.length === 1` return is legitimate; only the
    // multi-hit positional guess is banned.
    expect(tomorrowSrc).not.toContain('if (byName.length > 1) return byName[0].id');
  });
});
