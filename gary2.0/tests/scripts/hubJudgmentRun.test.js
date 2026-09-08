import { describe, expect, it, vi } from 'vitest';
import { runHubJudgmentPass, unavailableHubJudgments, hubJudgmentPassBudget } from '../../scripts/lib/hubJudgmentRun.js';

const date = '2026-09-08', asOf = '2026-09-08T15:00:00.000Z', failedAt = '2026-09-08T15:01:00.000Z';
function failedRefreshFixture() {
  const judgment = { schema_version: 1, status: 'ready', date, league: 'mlb', game_id: '10',
    primary_source_key: 'starter_form|10|21|2', as_of: '2026-09-08T14:00:00.000Z',
    valid_until: '2026-09-08T20:00:00.000Z', take: 'Original take', full_case: 'Complete original reasoning',
    input_fingerprint: 'a'.repeat(64), evidence: [{ facts: { innings: 4 } }] };
  const row = { id: 1, date, league: 'MLB', category: 'starter_form', game_id: '10', player_id: '21', team_id: '2',
    headline: 'Original headline', detail: 'Original evidence', meta: { computed_detail: 'Measured workload', sibling: { important: true }, judgment } };
  return { date, league: 'MLB', asOf, rows: [row], previousRows: [row], games: [] };
}

describe('bounded Hub research-to-judgment pass', () => {
  it.each([
    [0, 390_000, 330_000], [90_000, 330_000, 330_000],
    [150_000, 270_000, 270_000], [420_000, 0, 0], [480_000, 0, 0],
  ])('reserves publication time after %ims of source/slate reads', (elapsed, totalBudgetMs, budgetMs) => {
    expect(hubJudgmentPassBudget(1_000, 1_000 + elapsed)).toEqual({ totalBudgetMs, budgetMs });
    if (elapsed <= 420_000) expect(elapsed + totalBudgetMs + 60_000).toBeLessThanOrEqual(480_000);
  });

  it('starts no provider, synthesis or editor when the source/slate prelude exhausted the publication reserve', async () => {
    const collectContext = vi.fn(), synthesize = vi.fn(), orderJudgments = vi.fn();
    const result = await runHubJudgmentPass(failedRefreshFixture(), {
      ...hubJudgmentPassBudget(1_000, 421_000), collectContext, synthesize, orderJudgments, now: () => failedAt });
    expect(collectContext).not.toHaveBeenCalled(); expect(synthesize).not.toHaveBeenCalled(); expect(orderJudgments).not.toHaveBeenCalled();
    expect(result.invalidations[0]).toMatchObject({ status: 'context_unavailable', valid_until: failedAt });
    expect(result.failures[0].message).toContain('publication reserve');
  });

  it('skips the editor synchronously at the total deadline and preserves completed cases and withdrawals', async () => {
    const args = failedRefreshFixture(), orderJudgments = vi.fn();
    const settled = { rows: args.rows, invalidations: [{ game_id: 'other', status: 'context_changed' }], failures: [] };
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const result = await runHubJudgmentPass(args, { collectContext: async () => new Map(), orderJudgments,
        synthesize: async () => { clock.mockReturnValue(1_040); return settled; },
        totalBudgetMs: 40, budgetMs: 40, now: () => failedAt });
      expect(orderJudgments).not.toHaveBeenCalled();
      expect(result.rows[0].meta.judgment).toEqual(args.rows[0].meta.judgment);
      expect(result.invalidations).toEqual([{ game_id: 'other', status: 'context_changed' }]);
      expect(result.failures).toEqual([]);
      expect(result.editorial_diagnostics).toEqual([{ stage: 'editorial_order', status: 'budget_exhausted' }]);
    } finally { clock.mockRestore(); }
  });

  it('passes the complete original source pool and fresh checked context together', async () => {
    const rows = [{ category: 'heat_check', detail: 'Original source' }, { category: 'starter_form', detail: 'Opposing evidence' }];
    const previousRows = [{ meta: { judgment: { input_fingerprint: 'earlier' } } }];
    const context = new Map([['game', { complete: true, evidence: ['today’s lineup'] }]]);
    const collectContext = vi.fn().mockResolvedValue(context);
    const synthesize = vi.fn().mockResolvedValue({ rows, invalidations: [], failures: [] });
    const asOf = '2026-09-08T15:00:00.000Z';
    const result = await runHubJudgmentPass({ date: '2026-09-08', league: 'MLB', rows, games: [], previousRows, asOf },
      { collectContext, synthesize });
    expect(result.rows).toBe(rows);
    expect(synthesize.mock.calls[0][0]).toMatchObject({ rows, previousRows, asOf, contextByGame: context });
    expect(collectContext.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
    expect(synthesize.mock.calls[0][1].signal).toBe(collectContext.mock.calls[0][0].signal);
    expect(rows[0].detail).toBe('Original source');
  });

  it('does no research or generation after cancellation', async () => {
    const controller = new AbortController(); controller.abort(new Error('cancelled by owner'));
    const collectContext = vi.fn(), synthesize = vi.fn();
    await expect(runHubJudgmentPass({}, { signal: controller.signal, collectContext, synthesize })).rejects.toThrow('cancelled by owner');
    expect(collectContext).not.toHaveBeenCalled(); expect(synthesize).not.toHaveBeenCalled();
  });

  it('withdraws prior ready cases when context unexpectedly fails, keeping the original research and full argument', async () => {
    const args = failedRefreshFixture(), original = JSON.parse(JSON.stringify(args));
    const collectContext = vi.fn().mockRejectedValue(new Error('context unavailable')), synthesize = vi.fn();
    const result = await runHubJudgmentPass(args, { collectContext, synthesize, now: () => failedAt });
    expect(synthesize).not.toHaveBeenCalled();
    expect(result.failures).toEqual([{ stage: 'current_context', message: 'context unavailable' }]);
    expect(result.rows[0]).toEqual({ ...args.rows[0], meta: { computed_detail: 'Measured workload', sibling: { important: true } } });
    expect(result.invalidations).toEqual([{ ...args.previousRows[0].meta.judgment,
      status: 'context_unavailable', as_of: failedAt, valid_until: failedAt }]);
    result.invalidations[0].evidence[0].facts.innings = 99;
    expect(args).toEqual(original);
  });

  it('cannot invalidate another date, league, game, subject or already withdrawn case', () => {
    const args = failedRefreshFixture(), row = args.rows[0], previous = row.meta.judgment;
    args.previousRows.push(...[
      { ...row, date: '2026-09-09' }, { ...row, league: 'NFL' }, { ...row, game_id: '11' },
      { ...row, player_id: '22' },
      ...[{ date: '2026-09-09' }, { league: 'nfl' }, { game_id: '11' }, { status: 'context_changed' }]
        .map(change => ({ ...row, meta: { judgment: { ...previous, ...change } } })),
    ]);
    const result = unavailableHubJudgments({ ...args, asOf: failedAt }, new Error('failed'));
    expect(result.invalidations).toHaveLength(1);
    expect(result.invalidations[0].primary_source_key).toBe(previous.primary_source_key);
  });

  it('enforces its deadline even when a provider ignores cancellation', async () => {
    const synthesize = vi.fn();
    const result = await runHubJudgmentPass(failedRefreshFixture(), {
      collectContext: () => new Promise(() => {}), synthesize, budgetMs: 15, now: () => failedAt,
    });
    expect(result.failures[0].message).toContain('deadline');
    expect(result.invalidations[0].status).toBe('context_unavailable');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('withdraws a pending pass if cancellation arrives after research begins', async () => {
    const controller = new AbortController();
    const result = await runHubJudgmentPass(failedRefreshFixture(), { signal: controller.signal,
      collectContext: async () => { controller.abort(new Error('cancelled during verification')); return new Map(); },
      synthesize: vi.fn(), now: () => failedAt });
    expect(result.failures[0].message).toBe('cancelled during verification');
    expect(result.invalidations[0].valid_until).toBe(failedAt);
  });

  it('bounds an uncooperative synthesis call and safely withdraws after an unexpected synthesis error', async () => {
    for (const synthesize of [() => new Promise(() => {}), async () => { throw new Error('unexpected synthesis failure'); }]) {
      const result = await runHubJudgmentPass(failedRefreshFixture(), {
        collectContext: async () => new Map(), synthesize, budgetMs: 15, now: () => failedAt,
      });
      expect(result.invalidations[0].status).toBe('context_unavailable');
      expect(result.failures).toHaveLength(1);
      expect(result.rows[0].meta.judgment).toBeUndefined();
    }
  });

  it('leaves synthesis time to return completed cases and per-game failures before the outer timeout', async () => {
    const settled = { rows: [{ meta: { judgment: { status: 'ready', game_id: 'completed' } } }],
      invalidations: [{ status: 'context_changed', game_id: 'unfinished' }],
      failures: [{ game_id: 'unfinished', message: 'Hub synthesis deadline exceeded' }] };
    const result = await runHubJudgmentPass(failedRefreshFixture(), { budgetMs: 80,
      collectContext: async () => new Map(), now: () => failedAt,
      synthesize: async (_, { budgetMs }) => {
        await new Promise(resolve => setTimeout(resolve, budgetMs + 2));
        return settled;
      } });
    expect(result).toBe(settled);
  });

  it('orders the completed set with a separate injection and diagnostic stream after synthesis', async () => {
    const args = failedRefreshFixture(), generateText = vi.fn(), generateEditorialText = vi.fn();
    const settled = { rows: args.rows, invalidations: [], failures: [], diagnostics: [{ attempt: 1 }] };
    const synthesize = vi.fn(async () => settled);
    const orderJudgments = vi.fn(async ({ rows }) => ({ rows, diagnostics: [{ status: 'reused' }] }));
    const result = await runHubJudgmentPass(args, { collectContext: async () => new Map(), synthesize,
      orderJudgments, generateText, generateEditorialText, now: () => failedAt });
    expect(synthesize.mock.calls[0][1].generateText).toBe(generateText);
    expect(orderJudgments.mock.calls[0][0]).toMatchObject({ rows: settled.rows, games: args.games });
    expect(orderJudgments.mock.calls[0][1].generateText).toBe(generateEditorialText);
    expect(orderJudgments.mock.calls[0][1].budgetMs).toBeLessThanOrEqual(60_000);
    expect(result.diagnostics).toEqual([{ attempt: 1 }]);
    expect(result.editorial_diagnostics).toEqual([{ status: 'reused' }]);
  });

  it('bounds even an uncooperative editor within the total deadline without withdrawing completed judgments', async () => {
    const args = failedRefreshFixture(), original = structuredClone(args.rows);
    const settled = { rows: args.rows, invalidations: [], failures: [] }, started = Date.now();
    const result = await runHubJudgmentPass(args, { collectContext: async () => new Map(),
      synthesize: async () => settled, orderJudgments: () => new Promise(() => {}),
      budgetMs: 25, editorialBudgetMs: 60_000, totalBudgetMs: 40, now: () => failedAt });
    expect(Date.now() - started).toBeLessThan(500);
    expect(result.rows).toEqual(original);
    expect(result.invalidations).toEqual([]); expect(result.failures).toEqual([]);
    expect(result.editorial_diagnostics[0]).toMatchObject({ status: 'failed' });
  });
});
