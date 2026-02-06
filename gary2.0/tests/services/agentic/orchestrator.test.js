import { describe, it, expect } from 'vitest';
import {
  normalizeSportToLeague,
  getInvestigatedFactors,
  INVESTIGATION_FACTORS
} from '../../../src/services/agentic/agenticOrchestrator.js';

// ─── normalizeSportToLeague ───────────────────────────────────────────
describe('normalizeSportToLeague', () => {
  it('maps API sport keys to league names', () => {
    expect(normalizeSportToLeague('basketball_nba')).toBe('NBA');
    expect(normalizeSportToLeague('americanfootball_nfl')).toBe('NFL');
    expect(normalizeSportToLeague('icehockey_nhl')).toBe('NHL');
    expect(normalizeSportToLeague('basketball_ncaab')).toBe('NCAAB');
    expect(normalizeSportToLeague('americanfootball_ncaaf')).toBe('NCAAF');
  });

  it('passes through already-normalized league names', () => {
    expect(normalizeSportToLeague('NBA')).toBe('NBA');
    expect(normalizeSportToLeague('NFL')).toBe('NFL');
    expect(normalizeSportToLeague('NHL')).toBe('NHL');
    expect(normalizeSportToLeague('NCAAB')).toBe('NCAAB');
    expect(normalizeSportToLeague('NCAAF')).toBe('NCAAF');
  });

  it('returns unknown sports as-is (fallback)', () => {
    expect(normalizeSportToLeague('baseball_mlb')).toBe('baseball_mlb');
    expect(normalizeSportToLeague('unknown')).toBe('unknown');
  });
});

// ─── INVESTIGATION_FACTORS structure ──────────────────────────────────
describe('INVESTIGATION_FACTORS', () => {
  it('has entries for all 5 sports', () => {
    expect(INVESTIGATION_FACTORS).toHaveProperty('basketball_nba');
    expect(INVESTIGATION_FACTORS).toHaveProperty('americanfootball_nfl');
    expect(INVESTIGATION_FACTORS).toHaveProperty('icehockey_nhl');
    expect(INVESTIGATION_FACTORS).toHaveProperty('basketball_ncaab');
    expect(INVESTIGATION_FACTORS).toHaveProperty('americanfootball_ncaaf');
  });

  it('each sport has factor categories with token arrays', () => {
    for (const [sport, factors] of Object.entries(INVESTIGATION_FACTORS)) {
      expect(Object.keys(factors).length).toBeGreaterThan(0);
      for (const [factor, tokens] of Object.entries(factors)) {
        expect(Array.isArray(tokens), `${sport}.${factor} should be an array`).toBe(true);
        expect(tokens.length, `${sport}.${factor} should have at least 1 token`).toBeGreaterThan(0);
      }
    }
  });
});

// ─── getInvestigatedFactors ───────────────────────────────────────────
describe('getInvestigatedFactors', () => {
  it('returns 100% coverage for unknown sport', () => {
    const result = getInvestigatedFactors([], 'baseball_mlb');
    expect(result.coverage).toBe(1.0);
    expect(result.useFallback).toBe(true);
  });

  it('returns 0% coverage with empty history', () => {
    const result = getInvestigatedFactors([], 'basketball_nba');
    expect(result.coverage).toBe(0);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.covered.length).toBe(0);
  });

  it('recognizes covered factors from toolCallHistory tokens', () => {
    const history = [
      { token: 'NET_RATING', timestamp: Date.now() },
      { token: 'OFFENSIVE_RATING', timestamp: Date.now() },
      { token: 'PACE', timestamp: Date.now() },
    ];
    const result = getInvestigatedFactors(history, 'basketball_nba');
    expect(result.covered).toContain('EFFICIENCY');
    expect(result.covered).toContain('PACE_TEMPO');
    expect(result.coverage).toBeGreaterThan(0);
  });

  it('handles preloaded factors', () => {
    const result = getInvestigatedFactors([], 'basketball_nba', ['INJURIES']);
    expect(result.covered).toContain('INJURIES');
  });

  it('uses prefix matching for player-specific tokens', () => {
    const history = [
      { token: 'PLAYER_GAME_LOGS:LeBron James', timestamp: Date.now() },
    ];
    const result = getInvestigatedFactors(history, 'basketball_nba');
    expect(result.covered).toContain('PLAYER_PERFORMANCE');
  });
});
