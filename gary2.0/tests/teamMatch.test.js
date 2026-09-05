import { describe, it, expect } from 'vitest';
import { pickSide, matchGame, canGroundGameScore } from '../src/services/teamMatch.js';

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

describe('matchGame — provider identity and ambiguous legacy games', () => {
  const first = { id: 101, home_team: { name: 'Chicago Cubs' }, away_team: { name: 'Cincinnati Reds' } };
  const second = { ...first, id: 102 };

  it('never substitutes the other half of a doubleheader for a missing explicit id', () => {
    expect(matchGame([first], 'Cubs', 'Reds', 102)).toBeNull();
    expect(matchGame([first, second], 'Cubs', 'Reds', '102')).toEqual({ game: second, swapped: false });
  });

  it('does not treat an alternate provider id field as the BDL id', () => {
    expect(matchGame([{ ...first, gamePk: 102, espn_id: '102' }], 'Cubs', 'Reds', 102)).toBeNull();
  });

  it('rejects ambiguous legacy doubleheaders in either input order', () => {
    expect(matchGame([first, second], 'Cubs', 'Reds', null)).toBeNull();
    expect(matchGame([second, first], 'Cubs', 'Reds', null)).toBeNull();
  });

  it('does not choose between conflicting copies of an exact provider game', () => {
    expect(matchGame([first, { ...first, home_team_score: 9 }], 'Cubs', 'Reds', 101)).toBeNull();
  });

  it('keeps a unique legacy name match, including blank historical ids', () => {
    expect(matchGame([first], 'Cubs', 'Reds', null)).toEqual({ game: first, swapped: false });
    expect(matchGame([first], 'Cubs', 'Reds', '  ')).toEqual({ game: first, swapped: false });
  });

  it('cannot guess a legacy game from missing or indistinguishable labels', () => {
    expect(matchGame([first], '', '', null)).toBeNull();
    const sox = { id: 103, home_team: { name: 'Chicago White Sox' }, visitor_team: { name: 'Boston Red Sox' } };
    expect(matchGame([sox], 'Sox', 'Sox', null)).toBeNull();
    expect(matchGame([sox], 'Red Sox', 'White Sox', null)).toEqual({ game: sox, swapped: true });
  });

  it('requires positive evidence of the away team before swapping an exact match', () => {
    const unrelated = { ...first, home_team: { name: 'Unmapped exhibition team' } };
    expect(matchGame([unrelated], 'Cubs', 'Reds', 101)).toEqual({ game: unrelated, swapped: false });
    const sox = { id: 103, home_team: { name: 'Chicago White Sox' }, away_team: { name: 'Boston Red Sox' } };
    expect(matchGame([sox], 'Red Sox', 'White Sox', 103)).toEqual({ game: sox, swapped: true });
  });

  it('normalizes whitespace around an exact id without weakening its match', () => {
    expect(matchGame([first, second], 'Cubs', 'Reds', ' 102 ')).toEqual({ game: second, swapped: false });
  });

  it('keeps ambiguous or missing exact identities out of name/date-only grounding', () => {
    expect(canGroundGameScore([first], 'Cubs', 'Reds', 102)).toBe(false);
    expect(canGroundGameScore([], 'Cubs', 'Reds', 102)).toBe(false);
    expect(canGroundGameScore([first, second], 'Cubs', 'Reds', null)).toBe(false);
    expect(canGroundGameScore([first], 'Cubs', 'Reds', null)).toBe(false);
    expect(canGroundGameScore([], '', '', null)).toBe(false);
  });

  it('preserves grounding for a named legacy game absent from the provider', () => {
    expect(canGroundGameScore([], 'Dodgers', 'Giants', null)).toBe(true);
    expect(canGroundGameScore([first], 'Dodgers', 'Giants', null)).toBe(true);
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
