import { describe, expect, it } from 'vitest';

import {
  mapResearchFactors,
  researchConcurrencyForSport,
  resolveNflResearchBaseline,
  shouldUseNflResearchBaseline
} from '../../../src/services/agentic/orchestrator/footballResearchPolicy.js';

// (The factor-plan tests — buildResearchFactorPlan, the preseason evidence
// gate — died with the researcher's factor checklist, deleted Sep 1 2026.
// What survives here tests the functions still alive: the season-baseline
// resolution orchestratorMain stamps into options, and the generic worker
// helpers.)

describe('football research policy', () => {
  it('bounds only NFL factor research at three workers', () => {
    expect(researchConcurrencyForSport('americanfootball_nfl')).toBe(3);
    expect(researchConcurrencyForSport('NFL')).toBe(3);
    expect(researchConcurrencyForSport('americanfootball_ncaaf')).toBe(1);
    expect(researchConcurrencyForSport('baseball_mlb')).toBe(1);
  });

  it('keeps live context on the current season while reusing the performance baseline', () => {
    expect(shouldUseNflResearchBaseline('americanfootball_nfl', 'OFFENSIVE_EPA')).toBe(true);
    expect(shouldUseNflResearchBaseline('americanfootball_nfl', 'PLAYER_GAME_LOGS:Quarterback')).toBe(true);
    expect(shouldUseNflResearchBaseline('americanfootball_nfl', 'INJURIES')).toBe(false);
    expect(shouldUseNflResearchBaseline('americanfootball_nfl', 'SCHEDULE_CONTEXT')).toBe(false);
    expect(shouldUseNflResearchBaseline('americanfootball_nfl', 'STANDINGS')).toBe(false);
    expect(shouldUseNflResearchBaseline('americanfootball_ncaaf', 'OFFENSIVE_EPA')).toBe(false);
  });

  it('keeps result order while never exceeding the worker bound', async () => {
    let active = 0;
    let maxActive = 0;
    const jobs = Array.from({ length: 8 }, (_, index) => index);

    const results = await mapResearchFactors(jobs, 3, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2 + (value % 3)));
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(maxActive).toBe(3);
  });

  it('rejects on a factor error instead of returning a partial briefing', async () => {
    await expect(mapResearchFactors([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('factor failed');
      return value;
    })).rejects.toThrow('factor failed');
  });

  it('reuses a shared verified NFL baseline with explicit provenance', () => {
    const tape = {
      provenance: {
        home: { season: 2025, scope: 'prior_completed_regular_season' },
        away: { season: 2025, scope: 'prior_completed_regular_season' }
      }
    };
    expect(resolveNflResearchBaseline('americanfootball_nfl', tape)).toEqual({
      season: 2025,
      scope: 'prior_completed_regular_season',
      label: '2025 prior completed regular-season baseline (not current-season form)'
    });
  });

  it('does not guess when the two scout provenances disagree', () => {
    const tape = {
      provenance: {
        home: { season: 2025, scope: 'prior_completed_regular_season' },
        away: { season: 2026, scope: 'current_regular_season' }
      }
    };
    expect(resolveNflResearchBaseline('americanfootball_nfl', tape)).toBeNull();
    expect(resolveNflResearchBaseline('americanfootball_ncaaf', tape)).toBeNull();
  });
});
