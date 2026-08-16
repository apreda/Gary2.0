import { describe, expect, it } from 'vitest';
import {
  footballHubRunIsEmptyFailure,
  shouldUpgradeFootballFantasyEvidence,
} from '../../scripts/lib/insightRunPolicy.js';

describe('football fantasy Hub persistence', () => {
  it('allows only the monotonic prior-baseline to current-season transition', () => {
    const baseline = {
      category: 'fantasy_usage',
      meta: { evidence_scope: 'prior_season_baseline' },
    };
    const current = {
      category: 'fantasy_usage',
      meta: { evidence_scope: 'current_season' },
    };

    expect(shouldUpgradeFootballFantasyEvidence(baseline, current)).toBe(true);
    expect(shouldUpgradeFootballFantasyEvidence(current, baseline)).toBe(false);
    expect(shouldUpgradeFootballFantasyEvidence(current, current)).toBe(false);
  });

  it('never opens the exception for a non-fantasy Hub category', () => {
    expect(shouldUpgradeFootballFantasyEvidence(
      { category: 'trenches', meta: { evidence_scope: 'prior_season_baseline' } },
      { category: 'trenches', meta: { evidence_scope: 'current_season' } },
    )).toBe(false);
  });

  it('fails a false-green active football slate but accepts a real dark day', () => {
    expect(footballHubRunIsEmptyFailure({ league: 'NFL', gameCount: 3, connectionCount: 0 })).toBe(true);
    expect(footballHubRunIsEmptyFailure({ league: 'NCAAF', gameCount: 0, connectionCount: 0 })).toBe(false);
    expect(footballHubRunIsEmptyFailure({ league: 'MLB', gameCount: 12, connectionCount: 0 })).toBe(false);
    expect(footballHubRunIsEmptyFailure({ league: 'NFL', gameCount: 3, connectionCount: 1 })).toBe(false);
  });
});
