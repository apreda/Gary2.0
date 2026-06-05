import { describe, it, expect } from 'vitest';
import { normalizeLeague, SPORTS, sportBySlug, sportByCode } from '@/lib/gary/leagues';

describe('normalizeLeague (iOS effectiveLeague port)', () => {
  it('maps API sport keys', () => {
    expect(normalizeLeague('basketball_nba')).toBe('NBA');
    expect(normalizeLeague('baseball_mlb')).toBe('MLB');
    expect(normalizeLeague('soccer_world_cup')).toBe('WC');
    expect(normalizeLeague('americanfootball_nfl')).toBe('NFL');
    expect(normalizeLeague('icehockey_nhl')).toBe('NHL');
  });
  it('prefers league over sport', () => {
    expect(normalizeLeague('NBA', 'baseball_mlb')).toBe('NBA');
  });
  it('falls back to sport when league empty', () => {
    expect(normalizeLeague('', 'basketball_ncaab')).toBe('NCAAB');
    expect(normalizeLeague(undefined, 'WC')).toBe('WC');
  });
  it('NBA does not swallow WNBA', () => {
    expect(normalizeLeague('wnba')).toBe('WNBA');
  });
  it('MLB HR stays distinct; WBC folds into MLB', () => {
    expect(normalizeLeague('MLB HR')).toBe('MLB HR');
    expect(normalizeLeague('wbc')).toBe('MLB');
  });
  it('unknown → raw uppercased; nothing → null', () => {
    expect(normalizeLeague('xfl')).toBe('XFL');
    expect(normalizeLeague('', '')).toBeNull();
  });
});

describe('SPORTS config', () => {
  it('has 7 routable sports', () => {
    expect(SPORTS.map(s => s.slug)).toEqual(['mlb', 'nba', 'nhl', 'nfl', 'ncaab', 'ncaaf', 'world-cup']);
  });
  it('resolves slug and code', () => {
    expect(sportBySlug('world-cup')?.code).toBe('WC');
    expect(sportByCode('WC')?.slug).toBe('world-cup');
  });
});
