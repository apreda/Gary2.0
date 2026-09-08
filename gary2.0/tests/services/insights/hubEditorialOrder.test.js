import { describe, expect, it, vi } from 'vitest';
import { orderHubJudgments, withoutHubEditorialOrder } from '../../../src/services/insights/hubEditorialOrder.js';

const at = '2026-09-08T16:00:00.000Z';
function fixture() {
  const rows = [10, 11, 12].map((game, index) => ({ date: '2026-09-08', league: 'MLB',
    category: 'starter_form', game_id: game, player_id: index + 100, team_id: index + 200,
    headline: 'Original research', detail: 'Original detail', relevance_score: 99 - index,
    meta: { sibling: { preserved: true }, judgment: { schema_version: 1, status: 'ready',
      date: '2026-09-08', league: 'mlb', game_id: String(game),
      primary_source_key: `starter_form|${game}|${index + 100}|${index + 200}`,
      input_fingerprint: String(index + 1).repeat(64), as_of: at, generated_at: '2026-09-08T15:00:00.000Z',
      valid_until: '2026-09-08T22:00:00.000Z', take: `Approved interpretation for game ${game}.`,
      explanation: 'The measured evidence supports this particular interpretation.',
      full_case: 'The full approved argument remains intact.', counterargument: 'The opposing case remains plausible.',
      critical_condition: null, what_changed: null, watch_for: 'A change in the assignment.',
      prominence: 'standard', horizon: 'pregame', evidence: [{ id: 'source', facts: { games: 4 } }] } } }));
  return { date: '2026-09-08', league: 'MLB', rows,
    games: rows.map(row => ({ id: row.game_id, date: '2026-09-08T23:00:00Z', status: 'Scheduled' })) };
}
const ordered = rows => ({ order: rows.map(row => ({ game_id: row.meta.judgment.game_id,
  source_key: row.meta.judgment.primary_source_key })) });
const options = { now: () => at };

describe('optional complete-set Hub editorial order', () => {
  it('ranks exact identities in one call and preserves every approved argument, evidence, clock and source field', async () => {
    const args = fixture(), before = structuredClone(args);
    const model = vi.fn(async () => JSON.stringify(ordered([...args.rows].reverse())));
    const result = await orderHubJudgments(args, { ...options, generateText: model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(result.rows.map(row => row.meta.judgment.editorial_rank)).toEqual([3, 2, 1]);
    expect(result.diagnostics[0]).toMatchObject({ status: 'generated', count: 3 });
    expect(new Set(result.rows.map(row => row.meta.judgment.editorial_fingerprint)).size).toBe(1);
    expect(withoutHubEditorialOrder(result.rows)).toEqual(before.rows);
    expect(args).toEqual(before);
    expect(model.mock.calls[0][0]).toContain('full approved argument');
    expect(model.mock.calls[0][0]).not.toContain('relevance_score');
  });

  it('reuses an unchanged complete argument set after source reordering and fresh checks with zero model calls', async () => {
    const args = fixture();
    const first = await orderHubJudgments(args, { ...options, generateText: async () => JSON.stringify(ordered(args.rows)) });
    const checkedLater = first.rows.map(row => ({ ...row, meta: { ...row.meta, judgment: { ...row.meta.judgment,
      as_of: '2026-09-08T16:30:00.000Z', valid_until: '2026-09-08T22:30:00.000Z' } } })).reverse();
    const model = vi.fn();
    const second = await orderHubJudgments({ ...args, rows: checkedLater }, {
      generateText: model, now: () => '2026-09-08T17:00:00.000Z', budgetMs: 0 });
    expect(model).not.toHaveBeenCalled();
    expect(second.rows).toBe(checkedLater);
    expect(second.diagnostics[0].status).toBe('reused');
    expect(second.rows.map(row => row.meta.judgment.generated_at)).toEqual(first.rows.map(row => row.meta.judgment.generated_at));
  });

  it.each(['argument', 'evidence', 'kickoff', 'membership'])('reorders when the substantive %s changes, without renewing its old rank', async change => {
    const args = fixture();
    const first = await orderHubJudgments(args, { ...options, generateText: async () => JSON.stringify(ordered(args.rows)) });
    args.rows = structuredClone(first.rows);
    if (change === 'argument') args.rows[0].meta.judgment.full_case = 'A materially different approved argument.';
    if (change === 'evidence') args.rows[0].meta.judgment.input_fingerprint = 'a'.repeat(64);
    if (change === 'kickoff') args.games[0].date = '2026-09-08T23:30:00Z';
    if (change === 'membership') { args.rows.pop(); args.games.pop(); }
    const model = vi.fn(async () => JSON.stringify(ordered(args.rows)));
    const result = await orderHubJudgments(args, { ...options, generateText: model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(result.diagnostics[0].input_fingerprint).not.toBe(first.diagnostics[0].input_fingerprint);
    expect(result.diagnostics[0].status).toBe('generated');
  });

  it.each(['missing', 'duplicate', 'wrongGame', 'wrongSource', 'extraProse', 'malformed'])('rejects a %s order as a whole while leaving all cases readable', async mode => {
    const args = fixture();
    args.rows.forEach(row => Object.assign(row.meta.judgment, { editorial_rank: 1, editorial_fingerprint: 'old-order' }));
    const value = ordered(args.rows);
    if (mode === 'missing') value.order.pop();
    if (mode === 'duplicate') value.order[1] = value.order[0];
    if (mode === 'wrongGame') value.order[0].game_id = '0010';
    if (mode === 'wrongSource') value.order[0].source_key = value.order[1].source_key;
    if (mode === 'extraProse') value.order[0].take = 'A rewritten take';
    const model = vi.fn(async () => mode === 'malformed' ? 'not json' : JSON.stringify(value));
    const result = await orderHubJudgments(args, { ...options, generateText: model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(result.diagnostics[0].status).toBe('failed');
    expect(result.rows).toEqual(withoutHubEditorialOrder(args.rows));
    expect(result.rows.every(row => row.meta.judgment.status === 'ready' && !row.meta.judgment.editorial_rank)).toBe(true);
  });

  it('does not retry provider failure or wait beyond the bounded ordering deadline', async () => {
    for (const generateText of [vi.fn(async () => { throw new Error('editor unavailable'); }), vi.fn(() => new Promise(() => {}))]) {
      const args = fixture(), started = Date.now();
      const result = await orderHubJudgments(args, { ...options, generateText, budgetMs: 15 });
      expect(generateText).toHaveBeenCalledTimes(1);
      expect(result.diagnostics[0].status).toBe('failed');
      expect(result.rows).toEqual(args.rows);
      expect(Date.now() - started).toBeLessThan(500);
    }
    const model = vi.fn();
    const result = await orderHubJudgments(fixture(), { ...options, generateText: model, budgetMs: 0 });
    expect(model).not.toHaveBeenCalled(); expect(result.diagnostics[0].status).toBe('budget_exhausted');
  });

  it('rejects an order if a game starts before it returns and never includes an expired or wrong-partition case', async () => {
    const args = fixture(); let clock = at;
    const result = await orderHubJudgments(args, { now: () => clock, generateText: async () => {
      clock = '2026-09-08T23:00:01.000Z'; return JSON.stringify(ordered(args.rows));
    } });
    expect(result.diagnostics[0]).toMatchObject({ status: 'failed', message: 'Current editorial set changed during ordering' });
    expect(result.rows).toEqual(args.rows);
    args.rows[0].meta.judgment.valid_until = at;
    args.rows[1].meta.judgment.league = 'nfl';
    const model = vi.fn();
    const single = await orderHubJudgments(args, { ...options, generateText: model });
    expect(model).not.toHaveBeenCalled();
    expect(single.diagnostics[0].status).toBe('single');
    expect(single.rows.map(row => row.meta.judgment.editorial_rank)).toEqual([undefined, undefined, 1]);
  });

  it('rejects ambiguous exact-game judgments before asking a model to choose between them', async () => {
    const args = fixture(); args.rows.push(structuredClone(args.rows[0]));
    const model = vi.fn();
    const result = await orderHubJudgments(args, { ...options, generateText: model });
    expect(model).not.toHaveBeenCalled(); expect(result.diagnostics[0].message).toContain('repeats');
  });
});
