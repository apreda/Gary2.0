import { describe, expect, it } from 'vitest';
import {
  footballHubRunIsEmptyFailure,
  shouldRepairFootballMarketVendor,
  shouldPreserveCurrentFootballFantasySnapshot,
  shouldUpgradeFootballFantasyEvidence,
  insightRunJudgmentsEnabled,
} from '../../scripts/lib/insightRunPolicy.js';
import { dailyContentStages, collegeCardStages, fantasyContentStages } from '../../scripts/lib/dailyContentPipeline.js';

describe('observational Hub default and explicit judgment opt-in', () => {
  it('keeps every existing daily insight/card stage observational without changing stage ownership', () => {
    const stages = dailyContentStages('2026-09-08', {});
    const insights = stages.filter(stage => stage.args[0] === 'run-insight-connections.js');
    expect(insights.map(stage => stage.id)).toEqual([
      'mlb-insights', 'mlb-cards', 'nfl-cards', 'ncaaf-cards', 'nfl-insights', 'ncaaf-insights', 'ncaaf-card-subjects',
    ]);
    expect(insights.every(stage => !insightRunJudgmentsEnabled(stage.args))).toBe(true);
    expect(collegeCardStages('2026-09-08', {}).every(stage => !insightRunJudgmentsEnabled(stage.args))).toBe(true);
    expect(fantasyContentStages('2026-09-08', {}, new Date('2026-09-08T16:00:00Z'))
      .every(stage => !insightRunJudgmentsEnabled(stage.args))).toBe(true);
  });

  it('requires an explicit judgment mode, not a date, league, dry run or report filename', () => {
    for (const args of [[], ['--league', 'NFL,NCAAF'], ['--dry-run'], ['--judgment-output', '/tmp/preview.json'], ['--with-judgments=false']]) {
      expect(insightRunJudgmentsEnabled(args)).toBe(false);
    }
    expect(insightRunJudgmentsEnabled(['--league', 'MLB', '--with-judgments'])).toBe(true);
    expect(insightRunJudgmentsEnabled(['--judgments-only', '--dry-run'])).toBe(true);
  });
});

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

  it('refreshes grounded player snapshots but never downgrades current evidence to a baseline', () => {
    const current = [{ category: 'fantasy_usage', meta: { evidence_scope: 'current_season' } }];
    const baseline = [{ category: 'fantasy_usage', meta: { evidence_scope: 'prior_season_baseline' } }];
    expect(shouldPreserveCurrentFootballFantasySnapshot(current, baseline)).toBe(true);
    expect(shouldPreserveCurrentFootballFantasySnapshot(baseline, current)).toBe(false);
    expect(shouldPreserveCurrentFootballFantasySnapshot([], baseline)).toBe(false);
  });

  it('fails a false-green active football slate but accepts a real dark day', () => {
    expect(footballHubRunIsEmptyFailure({ league: 'NFL', gameCount: 3, connectionCount: 0 })).toBe(true);
    expect(footballHubRunIsEmptyFailure({ league: 'NCAAF', gameCount: 0, connectionCount: 0 })).toBe(false);
    expect(footballHubRunIsEmptyFailure({ league: 'MLB', gameCount: 12, connectionCount: 0 })).toBe(false);
    expect(footballHubRunIsEmptyFailure({ league: 'NFL', gameCount: 3, connectionCount: 1 })).toBe(false);
  });
});

describe('football market vendor repair', () => {
  it.each(['kalshi', 'polymarket', 'OpeningSnapshot'])(
    'allows a one-way repair from %s to a canonical sportsbook',
    (vendor) => {
      expect(shouldRepairFootballMarketVendor(
        { category: 'pace_script', meta: { vendor } },
        { category: 'pace_script', meta: { vendor: 'fanduel' } },
      )).toBe(true);
    },
  );

  it('never reverses the repair or opens a different category to churn', () => {
    expect(shouldRepairFootballMarketVendor(
      { category: 'pace_script', meta: { vendor: 'fanduel' } },
      { category: 'pace_script', meta: { vendor: 'kalshi' } },
    )).toBe(false);
    expect(shouldRepairFootballMarketVendor(
      { category: 'trenches', meta: { vendor: 'kalshi' } },
      { category: 'trenches', meta: { vendor: 'fanduel' } },
    )).toBe(false);
  });
});
