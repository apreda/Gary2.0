import { describe, it, expect } from 'vitest';
import { pickSide, matchGame } from '../src/services/teamMatch.js';

describe('pickSide — shared-mascot collisions cannot flip the side', () => {
  it('Red Sox (away) vs White Sox (home), short stored names', () => {
    expect(pickSide('Red Sox ML -104', 'White Sox', 'Red Sox')).toBe('away');
    expect(pickSide('White Sox ML', 'White Sox', 'Red Sox')).toBe('home');
  });

  it('Red Sox / White Sox with FULL stored names', () => {
    expect(pickSide('Red Sox ML', 'Chicago White Sox', 'Boston Red Sox')).toBe('away');
    expect(pickSide('White Sox ML', 'Chicago White Sox', 'Boston Red Sox')).toBe('home');
  });

  it('distinct mascots resolve normally', () => {
    expect(pickSide('Dodgers ML', 'Giants', 'Dodgers')).toBe('away');
    expect(pickSide('Giants ML', 'Giants', 'Dodgers')).toBe('home');
  });

  it('substring team names resolve via unique words', () => {
    expect(pickSide('Inter Miami ML', 'Inter', 'Inter Miami')).toBe('away');
    expect(pickSide('Inter ML', 'Inter', 'Inter Miami')).toBe('home');
  });

  it('does not match a token inside a longer word', () => {
    // "red" must not match inside "Predators"; away here is "Predators".
    expect(pickSide('Kings ML', 'Kings', 'Predators')).toBe('home');
  });

  it('returns null when the pick names no distinguishing token', () => {
    expect(pickSide('Sox ML', 'White Sox', 'Red Sox')).toBeNull();
  });
});

describe('matchGame — ID match is never second-guessed by an unreadable name', () => {
  // The Jul 15 2026 All-Star Game bug: BDL's home_team/away_team objects were
  // unpopulated placeholders ({ name: "Unknown" }) for this exhibition game.
  // The old code treated "unknown" not containing "nl" as proof the pick's
  // home/away was reversed, and swapped the scores — inverting a real 4-0 AL
  // win into a false NL win.
  const unknownTeamGame = {
    id: 8712499,
    home_team: { name: 'Unknown' },
    away_team: { name: 'Unknown' },
    home_team_data: { runs: 0 },
    away_team_data: { runs: 4 },
  };

  it('placeholder/unreadable provider team name -> NOT swapped (trusts the pick)', () => {
    const result = matchGame([unknownTeamGame], 'NL', 'AL', 8712499);
    expect(result).not.toBeNull();
    expect(result.swapped).toBe(false);
    expect(result.game.id).toBe(8712499);
  });

  it('empty-string provider team name -> NOT swapped', () => {
    const game = { id: 42, home_team: { name: '' }, away_team: { name: '' } };
    expect(matchGame([game], 'Giants', 'Dodgers', 42).swapped).toBe(false);
  });

  it('a REAL, readable mismatch still correctly flags swapped', () => {
    // BDL says home=Dodgers; the pick stored home=Giants -> genuinely reversed.
    const game = { id: 7, home_team: { full_name: 'Los Angeles Dodgers' }, away_team: { full_name: 'San Francisco Giants' } };
    const result = matchGame([game], 'Giants', 'Dodgers', 7);
    expect(result.swapped).toBe(true);
  });

  it('a real, matching provider name -> NOT swapped (normal case, unaffected)', () => {
    const game = { id: 7, home_team: { full_name: 'San Francisco Giants' }, away_team: { full_name: 'Los Angeles Dodgers' } };
    const result = matchGame([game], 'Giants', 'Dodgers', 7);
    expect(result.swapped).toBe(false);
  });

  it('no game_id -> falls back to name matching, swapped when reversed', () => {
    const game = { id: 9, home_team: { full_name: 'Los Angeles Dodgers' }, away_team: { full_name: 'San Francisco Giants' } };
    const result = matchGame([game], 'Giants', 'Dodgers', null);
    expect(result.swapped).toBe(true);
  });
});

