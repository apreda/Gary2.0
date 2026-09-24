import { describe, expect, it } from 'vitest';

import {
  buildResearchFactorPlan,
  mapResearchFactors,
  researchConcurrencyForSport,
} from '../../../src/services/agentic/orchestrator/footballResearchPolicy.js';
import { INVESTIGATION_FACTORS } from '../../../src/services/agentic/orchestrator/investigationFactors.js';

describe('football research policy', () => {
  it('bounds NFL and MLB subscription research while preserving other providers and sports', () => {
    expect(researchConcurrencyForSport('americanfootball_nfl')).toBe(3);
    expect(researchConcurrencyForSport('NFL')).toBe(3);
    expect(researchConcurrencyForSport('americanfootball_ncaaf')).toBe(1);
    expect(researchConcurrencyForSport('baseball_mlb')).toBe(1);
    expect(researchConcurrencyForSport('baseball_mlb', 'codex-cli')).toBe(3);
    expect(researchConcurrencyForSport('MLB', 'codex-cli')).toBe(3);
    expect(researchConcurrencyForSport('baseball_mlb', 'anthropic')).toBe(1);
    expect(researchConcurrencyForSport('basketball_nba', 'codex-cli')).toBe(1);
  });

  it('finishes all eight MLB factors in ordered results using at most three simultaneous workers', async () => {
    const factors = Object.keys(INVESTIGATION_FACTORS.baseball_mlb);
    let active = 0, peak = 0;
    const seen = [];
    const results = await mapResearchFactors(factors, researchConcurrencyForSport('baseball_mlb', 'codex-cli'), async (factor, i) => {
      peak = Math.max(peak, ++active);
      seen.push(factor);
      await new Promise(resolve => setTimeout(resolve, 8 - i));
      active--;
      return factor;
    });
    expect(factors).toHaveLength(8);
    expect(peak).toBe(3);
    expect(new Set(seen).size).toBe(8);
    expect(results).toEqual(factors);
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

  it('groups NFL by weekly context while retaining every token and other sports', () => {
    const nflPlan = buildResearchFactorPlan('americanfootball_nfl', INVESTIGATION_FACTORS.americanfootball_nfl);
    const ncaafPlan = buildResearchFactorPlan('americanfootball_ncaaf', INVESTIGATION_FACTORS.americanfootball_ncaaf);

    expect(nflPlan.mode).toBe('nfl_weekly_context');
    expect(nflPlan.factors).toHaveLength(5);
    expect(new Set(nflPlan.factors.flatMap(f => f.tokens))).toEqual(new Set(Object.values(INVESTIGATION_FACTORS.americanfootball_nfl).flat()));
    expect(nflPlan.factors[0].name).toBe('TEAM_IDENTITY_AND_HISTORY');
    expect(ncaafPlan.factors).toHaveLength(5);
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

});

describe('college factor grouping', () => {
 it('retains every token while reducing independent research starts', async () => {
  const {INVESTIGATION_FACTORS}=await import('../../../src/services/agentic/orchestrator/investigationFactors.js');
  const map=INVESTIGATION_FACTORS.americanfootball_ncaaf;
  const plan=buildResearchFactorPlan('americanfootball_ncaaf',map);
  expect(plan.mode).toBe('ncaaf_grouped_research');
  expect(plan.factors).toHaveLength(5);
  expect(new Set(plan.factors.flatMap(f=>f.tokens))).toEqual(new Set(Object.values(map).flat()));
 });
});
