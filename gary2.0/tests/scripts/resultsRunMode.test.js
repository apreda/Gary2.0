import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FOOTBALL_SETTLEMENT_SPORTS,
  nflWeekStartForDate,
  parseResultsRunArgs,
  runFootballSettlementDates,
  sportAllowed,
} from '../../scripts/lib/resultsRunMode.js';

describe('results run-mode parsing', () => {
  it('finds an explicit date on either side of the football flag', () => {
    expect(parseResultsRunArgs(['--football-settlements', '2026-09-12'])).toEqual({
      footballSettlements: true,
      explicitDate: '2026-09-12',
    });
    expect(parseResultsRunArgs(['2026-09-12', '--football-settlements'])).toEqual({
      footballSettlements: true,
      explicitDate: '2026-09-12',
    });
  });

  it('leaves the historical full run as the default', () => {
    expect(parseResultsRunArgs([])).toEqual({
      footballSettlements: false,
      explicitDate: null,
    });
  });
});

describe('football result scope', () => {
  const football = new Set(FOOTBALL_SETTLEMENT_SPORTS);

  it('includes NFL and NCAAF without opening any MLB lane', () => {
    expect(sportAllowed('NFL', football)).toBe(true);
    expect(sportAllowed('ncaaf', football)).toBe(true);
    expect(sportAllowed('MLB', football)).toBe(false);
    expect(sportAllowed('MLB HR', football)).toBe(false);
  });

  it.each([
    ['2026-09-07', '2026-09-01'], // Monday closes the prior Tue–Mon week
    ['2026-09-08', '2026-09-08'], // Tuesday opens the next publication week
    ['2026-09-12', '2026-09-08'], // Saturday
    ['2026-09-13', '2026-09-08'], // Sunday
    ['2027-01-01', '2026-12-29'], // year boundary
  ])('maps %s to NFL week %s', (date, expected) => {
    expect(nflWeekStartForDate(date)).toBe(expected);
  });
});

describe('football settlement date resilience', () => {
  it('attempts yesterday before today and completes both dates', async () => {
    const attempted = [];

    await expect(runFootballSettlementDates(
      ['2026-08-15', '2026-08-14'],
      async (date) => attempted.push(date),
    )).resolves.toEqual(['2026-08-14', '2026-08-15']);
    expect(attempted).toEqual(['2026-08-14', '2026-08-15']);
  });

  it('continues to today after yesterday fails, then reports the retained failure', async () => {
    const attempted = [];

    await expect(runFootballSettlementDates(
      ['2026-08-15', '2026-08-14'],
      async (date) => {
        attempted.push(date);
        if (date === '2026-08-14') throw new Error('provider unavailable');
      },
    )).rejects.toMatchObject({
      message: 'Football settlement failed for 2026-08-14',
      settlementFailures: [expect.objectContaining({ date: '2026-08-14' })],
    });
    expect(attempted).toEqual(['2026-08-14', '2026-08-15']);
  });
});

describe('NFL generation week window', () => {
  const picksRunner = readFileSync(
    new URL('../../scripts/run-agentic-picks.js', import.meta.url),
    'utf8',
  );

  it('closes a Tuesday-start publication week on the following Tuesday boundary', () => {
    expect(picksRunner).toContain('weekEndDate.setDate(weekEndDate.getDate() + 7)');
    expect(picksRunner).not.toContain('weekEndDate.setDate(weekEndDate.getDate() + 8)');
  });
});

describe('near-real-time football workflow wiring', () => {
  const runner = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
  const footballWorkflow = readFileSync(
    new URL('../../../.github/workflows/football-results.yml', import.meta.url),
    'utf8',
  );
  const fullWorkflow = readFileSync(
    new URL('../../../.github/workflows/daily-results.yml', import.meta.url),
    'utf8',
  );
  const nflGenerationWorkflow = readFileSync(
    new URL('../../../.github/workflows/nfl-only.yml', import.meta.url),
    'utf8',
  );
  const ncaafGenerationWorkflow = readFileSync(
    new URL('../../../.github/workflows/ncaaf-only.yml', import.meta.url),
    'utf8',
  );
  const nflIdentityMigration = readFileSync(
    new URL('../../supabase/migrations/20260815172523_nfl_results_game_id_identity.sql', import.meta.url),
    'utf8',
  );

  it('reuses the hardened grader but limits the frequent pass to football settlement', () => {
    expect(runner).toContain("processPropBets(targetDate, footballSports, { settlementOnly: true })");
    expect(runner).toContain("processGenericGames('daily_picks', targetDate, 'NCAAF', { settlementOnly: true })");
    expect(runner).toContain("processGenericGames('weekly_nfl_picks', weekStart, 'NFL', { settlementOnly: true })");
    expect(runner).toContain('if (!settlementOnly)');
    expect(runner).toContain('if (RUN_OPTIONS.footballSettlements)');
    expect(runner).toContain('waitForBdlRequestSlot(`football-results ${path}`)');
    expect(runner).toContain('nflGames.filter((game) => nflFinalIds.has(String(game.id)) && referencedNFLGameIds.has(String(game.id)))');
    expect(runner).toContain('[...ncaafFinalIds].filter((gameId) => referencedNCAAFGameIds.has(gameId))');
  });

  it('keeps the existing full/MLB cadence and serializes both writers', () => {
    expect(fullWorkflow).toContain("cron: '0 6 * * *'");
    expect(fullWorkflow).toContain("cron: '0 13 * * *'");
    expect(fullWorkflow).toContain('group: results-grading');
    expect(footballWorkflow).toContain('group: results-grading');
    expect(footballWorkflow).toContain('cancel-in-progress: false');
  });

  it('polls within 15 minutes during football final windows and calls only the narrow mode', () => {
    expect(footballWorkflow).toContain("cron: '7,22,37,52 0-9,16-23 * 1,2,8-12 *'");
    expect(footballWorkflow).toContain('args=(--football-settlements)');
    expect(footballWorkflow).toContain('node scripts/run-all-results.js "${args[@]}"');
    expect(footballWorkflow).toContain("grep -q '^FOOTBALL_SETTLEMENT_OUTCOME='");
  });

  it('grades both ET football slates in the same serialized cloud writer lane', () => {
    expect(footballWorkflow).toContain('group: results-grading');
    expect(footballWorkflow).toContain('dates=("$(date +%F)" "$(date -d yesterday +%F)")');
    expect(footballWorkflow).toContain('node run-grade-insights.js --date "${dates[$index]}" --league NFL,NCAAF');
    expect(footballWorkflow).toContain('sleep 61');
  });

  it('uses exact NFL game identity while keeping a migration-order-safe fallback', () => {
    expect(runner).toContain('supportsExactNFLResultIdentity');
    expect(runner).toContain("supabase.from('nfl_results').select('game_id')");
    expect(runner).toContain("targetTable === 'nfl_results'");
    expect(runner).toContain("if (exactGameIdentity) query = query.is('game_id', null)");
    expect(nflIdentityMigration).toMatch(/add column if not exists game_id text/i);
    expect(nflIdentityMigration).toMatch(/drop index if exists public\.idx_nfl_results_unique_pick/i);
    expect(nflIdentityMigration).toMatch(/create unique index if not exists nfl_results_exact_game_pick_idx/i);
    expect(nflIdentityMigration).toContain('where game_id is not null');
    expect(nflIdentityMigration).toMatch(/create unique index if not exists nfl_results_legacy_game_pick_idx/i);
    expect(nflIdentityMigration).toContain('where game_id is null');
  });

  it('uses only real football generation entry points and keeps NCAAF props opt-in/fail-closed', () => {
    expect(nflGenerationWorkflow).toContain('node scripts/run-agentic-nfl-props.js');
    expect(nflGenerationWorkflow).not.toContain('run-agentic-nfl-td.js');
    expect(nflGenerationWorkflow).toContain('--matchup "$MATCHUP" --limit 1');

    expect(ncaafGenerationWorkflow).toContain('node scripts/run-agentic-picks.js --ncaaf');
    expect(ncaafGenerationWorkflow).toContain('run_props:');
    expect(ncaafGenerationWorkflow).toContain('if: ${{ inputs.run_props }}');
    expect(ncaafGenerationWorkflow).toContain('if [ -z "$NCAAF_THE_ODDS_API_KEY" ]');
    expect(ncaafGenerationWorkflow).toContain('node scripts/run-agentic-ncaaf-props.js');
  });
});
