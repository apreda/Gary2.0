import { describe, expect, it } from 'vitest';

import {
  buildResearchFactorPlan,
  findMissingRequiredResearchFactors,
  isNflAugustPreseasonResearch,
  mapResearchFactors,
  researchConcurrencyForSport,
  resolveNflResearchBaseline,
  shouldUseNflResearchBaseline
} from '../../../src/services/agentic/orchestrator/footballResearchPolicy.js';
import { INVESTIGATION_FACTORS } from '../../../src/services/agentic/orchestrator/investigationFactors.js';

describe('football research policy', () => {
  it('bounds only NFL factor research at three workers', () => {
    expect(researchConcurrencyForSport('americanfootball_nfl')).toBe(3);
    expect(researchConcurrencyForSport('NFL')).toBe(3);
    expect(researchConcurrencyForSport('americanfootball_ncaaf')).toBe(1);
    expect(researchConcurrencyForSport('baseball_mlb')).toBe(1);
  });

  it('still dispatches every NFL evidence factor exactly once', async () => {
    const factors = Object.keys(INVESTIGATION_FACTORS.americanfootball_nfl);
    const seen = [];
    const results = await mapResearchFactors(factors, 3, async (factor) => {
      seen.push(factor);
      return factor;
    });

    expect(factors).toHaveLength(18);
    expect(new Set(seen)).toEqual(new Set(factors));
    expect(results).toEqual(factors);
  });

  it('uses the verified scout as a bounded August NFL preseason evidence plan', () => {
    const options = {
      gameTime: '2026-08-15T23:00:00.000Z',
      researchSeasonScope: 'prior_completed_regular_season'
    };
    const plan = buildResearchFactorPlan(
      'americanfootball_nfl',
      INVESTIGATION_FACTORS.americanfootball_nfl,
      options
    );

    expect(isNflAugustPreseasonResearch('americanfootball_nfl', options)).toBe(true);
    expect(plan.mode).toBe('nfl_august_preseason_scout');
    expect(plan.factors.map((factor) => factor.name)).toEqual([
      'QB_SITUATION',
      'SKILL_PLAYERS',
      'INJURIES',
      'TRENCHES',
      'COACHING',
      'EFFICIENCY'
    ]);
    expect(plan.factors.every((factor) => factor.required)).toBe(true);
    expect(plan.factors.every((factor) => factor.tokens.length === 0)).toBe(true);
    expect(plan.factors.every((factor) => factor.source === 'verified_scout_report')).toBe(true);
  });

  it('does not compact regular-season NFL, other sports, or an unverified baseline', () => {
    const regularSeason = {
      gameTime: '2026-09-13T17:00:00.000Z',
      researchSeasonScope: 'prior_completed_regular_season'
    };
    const unverifiedAugust = {
      gameTime: '2026-08-15T23:00:00.000Z',
      researchSeasonScope: 'current_regular_season'
    };

    const regularPlan = buildResearchFactorPlan(
      'americanfootball_nfl',
      INVESTIGATION_FACTORS.americanfootball_nfl,
      regularSeason
    );
    const unverifiedPlan = buildResearchFactorPlan(
      'americanfootball_nfl',
      INVESTIGATION_FACTORS.americanfootball_nfl,
      unverifiedAugust
    );
    const ncaafPlan = buildResearchFactorPlan(
      'americanfootball_ncaaf',
      INVESTIGATION_FACTORS.americanfootball_ncaaf,
      unverifiedAugust
    );

    expect(regularPlan.mode).toBe('full_research');
    expect(regularPlan.factors).toHaveLength(18);
    expect(unverifiedPlan.factors).toHaveLength(18);
    expect(ncaafPlan.factors).toHaveLength(Object.keys(INVESTIGATION_FACTORS.americanfootball_ncaaf).length);
  });

  it('fails the preseason evidence gate instead of accepting a partial briefing', () => {
    const plan = buildResearchFactorPlan(
      'NFL',
      INVESTIGATION_FACTORS.americanfootball_nfl,
      {
        gameTime: '2026-08-15T23:00:00.000Z',
        researchSeasonScope: 'prior_completed_regular_season'
      }
    );
    const findings = plan.factors.map((factor) => ({
      factor: factor.name,
      keyFinding: `Verified scout finding for ${factor.name} and both teams.`
    }));

    expect(findMissingRequiredResearchFactors(plan, findings)).toEqual([]);
    findings[2] = null;
    findings[4] = { factor: 'COACHING', keyFinding: 'short' };
    expect(findMissingRequiredResearchFactors(plan, findings)).toEqual(['INJURIES', 'COACHING']);
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
