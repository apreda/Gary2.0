import { describe, it, expect } from 'vitest';
import { normalizeSportToLeague } from '../../../src/services/agentic/orchestrator/index.js';

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
    // baseball_mlb/soccer_world_cup joined the mapping after this test was written —
    // probe with a genuinely unmapped key.
    expect(normalizeSportToLeague('cricket_t20')).toBe('cricket_t20');
    expect(normalizeSportToLeague('unknown')).toBe('unknown');
  });
});

// (INVESTIGATION_FACTORS + getInvestigatedFactors structure tests died with
// the researcher's factor checklist, deleted Sep 1 2026.)
