/**
 * NAME JOIN pins. foldName (Aug 5 2026, the Luzardo outage) folds accents and
 * punctuation; lastNameOf (Aug 13 2026) strips the generational suffix, because
 * `name.split(' ').pop()` was returning "Jr." as the surname and silently
 * dropping everyday bats — Jazz Chisholm Jr. never matched a Savant row.
 */
import { describe, it, expect } from 'vitest';
import { foldName, lastNameOf } from '../../src/utils/nameUtils.js';

describe('foldName — cross-source folding', () => {
  it('folds accents, punctuation, case and whitespace', () => {
    expect(foldName('Jesús Luzardo')).toBe(foldName('Jesus Luzardo'));
    expect(foldName("Andrew O'Hara")).toBe('andrew ohara');
    expect(foldName('  Trent   Grisham ')).toBe('trent grisham');
  });
});

describe('lastNameOf — the surname, suffix stripped', () => {
  it('never returns a generational suffix', () => {
    expect(lastNameOf('Jazz Chisholm Jr.')).toBe('chisholm');
    expect(lastNameOf('Bobby Witt Jr.')).toBe('witt');
    expect(lastNameOf('Ken Griffey III')).toBe('griffey');
    expect(lastNameOf('Ronald Acuña Jr.')).toBe('acuna');
  });

  it('leaves ordinary names alone and survives junk', () => {
    expect(lastNameOf('Trent Grisham')).toBe('grisham');
    expect(lastNameOf('Ichiro')).toBe('ichiro');
    expect(lastNameOf('')).toBe('');
    expect(lastNameOf(null)).toBe('');
  });

  it('joins a suffixed lineup name to a feed row that spells it differently', () => {
    expect(lastNameOf('Jazz Chisholm Jr.')).toBe(lastNameOf('Chisholm'));
    expect(lastNameOf('Ronald Acuña Jr.')).toBe(lastNameOf('Acuna Jr.'));
  });
});
