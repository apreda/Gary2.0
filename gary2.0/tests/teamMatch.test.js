import { describe, it, expect } from 'vitest';
import { pickSide } from '../src/services/teamMatch.js';
import { gradeSoccerGame } from '../src/services/soccerGrading.js';

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

describe('gradeSoccerGame uses robust side detection', () => {
  it('away moneyline win', () => {
    expect(gradeSoccerGame({ type: 'moneyline', pick: 'Brazil ML', homeTeam: 'Mexico', awayTeam: 'Brazil' }, 0, 2)).toBe('won');
  });
  it('shared-word national teams do not fabricate a loss', () => {
    // "Korea Republic" (home) vs "Congo" — a Korea pick must grade as home, not collide.
    expect(gradeSoccerGame({ type: 'moneyline', pick: 'Korea Republic ML', homeTeam: 'Korea Republic', awayTeam: 'Congo' }, 2, 0)).toBe('won');
  });
});
