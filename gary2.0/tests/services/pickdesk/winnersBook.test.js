import { describe, it, expect, vi } from 'vitest';
import { admittedGameKeys, isWinnersGame, gameTicketIdentity, propTicketIdentity, buildWinnersBook, tallyWinnersBook, unitsAtPrice } from '../../../src/services/pickdesk/winnersBook.js';
import { readAllRows, printWinnersBook } from '../../../scripts/winners-book.js';

const NOW = Date.parse('2026-09-05T04:00:00Z');
const candidate = (extra = {}) => ({
  id: 1, game_date: '2026-09-04', league: 'MLB', kind: 'game', game_id: '42', ticket_key: 'ticket-1',
  pick_text: 'Mariners ML', odds: 150, commence_time: '2026-09-04T23:00:00Z',
  pick_snapshot: { pick: 'Mariners ML', odds: 150, model: 'codex-gpt-6-astra', prompt_sha: 'game-v1' },
  policy_version: 'exact-ticket-v2', status: 'qualified', created_at: '2026-09-04T20:00:00Z',
  reviewed_at: '2026-09-04T20:05:00Z', admitted_at: '2026-09-04T20:06:00Z', review_model: 'codex-gpt-5.6-sol', ...extra,
});
const boardRow = (c) => ({ candidate_id: c.id, game_date: c.game_date, league: c.league, kind: c.kind,
  game_id: c.game_id, ticket_key: c.ticket_key, pick_snapshot: c.pick_snapshot, admitted_at: c.admitted_at, policy_version: c.policy_version });
const grade = (extra = {}) => ({ game_date: '2026-09-04', league: 'MLB', game_id: '42', pick_text: 'Mariners ML', result: 'won', ...extra });
const book = (c = candidate(), opts = {}) => buildWinnersBook({ candidates: [c], board: [boardRow(c)], gameResults: [grade()], now: NOW, ...opts });

describe('Exact immutable Winners result flags', () => {
  it('requires date, league, game ID, ticket and publication price after the cutover', () => {
    const boardKeys = admittedGameKeys([boardRow(candidate())]);
    const query = { gameDate: '2026-09-04', league: 'MLB', gameId: '42', pickText: 'Mariners ML', odds: 150, boardKeys, legacyWinner: true };
    expect(isWinnersGame(query)).toBe(true);
    for (const wrong of [{ gameDate: '2026-09-05' }, { league: 'NFL' }, { gameId: '43' }, { gameId: null }, { pickText: 'Mariners +1.5' }, { odds: 145 }, { odds: null }]) {
      expect(isWinnersGame({ ...query, ...wrong })).toBe(false);
    }
    expect(isWinnersGame({ ...query, boardKeys: new Set() })).toBe(false);
  });

  it('preserves the old definition only before September 4', () => {
    expect(isWinnersGame({ gameDate: '2026-09-03', boardKeys: new Set(), legacyWinner: true })).toBe(true);
    expect(isWinnersGame({ gameDate: '2026-09-03', boardKeys: new Set(), legacyWinner: false })).toBe(false);
    expect(isWinnersGame({ gameDate: null, boardKeys: new Set(), legacyWinner: true })).toBe(false);
  });
});

describe('Prospective candidate outcomes', () => {
  it('uses the candidate price for units and keeps picker, prompt and reviewer versions', () => {
    const row = book(candidate(), { gameResults: [grade({ odds: -200 })] })[0];
    expect(row).toMatchObject({ group: 'admitted', result: 'won', units: 1.5, odds: 150,
      pick_model: 'codex-gpt-6-astra', prompt_version: 'game-v1', review_model: 'codex-gpt-5.6-sol', policy_version: 'exact-ticket-v2' });
  });

  it('does not use another date, league, game, ticket or matchup-only grade', () => {
    for (const wrong of [{ game_date: '2026-09-03' }, { league: 'NFL' }, { game_id: '43' }, { game_id: null, matchup: 'Mariners @ Red Sox' }, { pick_text: 'Mariners +1.5' }]) {
      expect(book(candidate(), { gameResults: [grade(wrong)] })[0]).toMatchObject({ result: null, units: null, grade_status: 'missing_grade' });
    }
  });

  it('distinguishes pregame qualification without a slot after the candidate expires', () => {
    const expired = candidate({ admitted_at: null, status: 'expired' });
    const row = book(expired, { board: [], events: [
      { candidate_id: 1, event: 'qualified', occurred_at: '2026-09-04T20:05:00Z' },
      { candidate_id: 1, event: 'expired', occurred_at: '2026-09-04T23:00:01Z' },
    ] })[0];
    expect(row.group).toBe('qualified_not_admitted');
  });

  it('separates rejected, unavailable, awaiting review and unreviewed at kickoff', () => {
    for (const status of ['rejected', 'unavailable']) expect(book(candidate({ status, admitted_at: null }), { board: [] })[0].group).toBe(status);
    expect(book(candidate({ status: 'pending', reviewed_at: null }), { board: [] })[0].group).toBe('unreviewed_at_kickoff');
    expect(book(candidate({ status: 'reviewing', reviewed_at: null }), { board: [], now: Date.parse('2026-09-04T22:00:00Z') })[0].group).toBe('awaiting_review');
  });

  it('holds out late-created or late-admitted snapshots and refuses postgame qualification', () => {
    expect(book(candidate({ created_at: '2026-09-05T00:00:00Z' }))[0].group).toBe('timing_excluded');
    expect(book(candidate({ admitted_at: '2026-09-05T00:00:00Z' }))[0].group).toBe('timing_excluded');
    const late = candidate({ status: 'expired', reviewed_at: '2026-09-05T00:00:00Z', admitted_at: null });
    expect(book(late, { board: [], events: [{ candidate_id: 1, event: 'qualified', occurred_at: late.reviewed_at }] })[0].group).toBe('unreviewed_at_kickoff');
    expect(book(candidate({ commence_time: null }))[0].group).toBe('timing_excluded');
    const c = candidate();
    expect(book(c, { board: [{ ...boardRow(c), pick_snapshot: { ...c.pick_snapshot, odds: 175 } }] })[0].group).toBe('timing_excluded');
  });

  it('keeps the latest pregame decision and ignores later result-informed changes', () => {
    const c = candidate({ status: 'expired', admitted_at: null });
    const events = [
      { candidate_id: 1, event: 'qualified', occurred_at: '2026-09-04T20:05:00Z' },
      { candidate_id: 1, event: 'rejected', occurred_at: '2026-09-04T20:10:00Z' },
      { candidate_id: 1, event: 'qualified', occurred_at: '2026-09-05T01:00:00Z' },
    ];
    expect(book(c, { board: [], events })[0].group).toBe('rejected');
  });

  it('preserves published cutover tickets while excluding them from the new reviewer sample', () => {
    const row = book(candidate({ policy_version: 'legacy-captured-2026-09-04', created_at: '2026-09-05T00:00:00Z' }))[0];
    expect(row).toMatchObject({ published: true, group: 'timing_excluded' });
    expect(row.timing_reason).toContain('not a prospective v2 review');
  });

  it('does not count duplicate grades twice or choose between conflicting grades', () => {
    expect(book(candidate(), { gameResults: [grade(), grade()] })[0].result).toBe('won');
    expect(book(candidate(), { gameResults: [grade(), grade({ result: 'lost' })] })[0]).toMatchObject({ result: null, grade_status: 'conflicting_grades' });
    expect(book(candidate(), { gameResults: [grade({ result: 'pending' })] })[0].grade_status).toBe('missing_grade');
  });

  it('requires all seven prop identity fields and grades at original prop odds', () => {
    const p = candidate({ kind: 'prop', odds: -150, pick_text: 'Player under 5.5 strikeouts', admitted_at: null,
      pick_snapshot: { player: 'Jane Player', prop: 'Strikeouts 5.5', prop_type: 'stale_model_alias', line: 5.5, bet: 'under', odds: -150 } });
    const result = { game_date: p.game_date, sport: 'MLB', game_id: '42', player_name: 'Jane Player', prop_type: 'strikeouts', line_value: 5.5, bet: 'under', result: 'won', odds: -300 };
    expect(book(p, { board: [], propResults: [result] })[0].units).toBeCloseTo(2 / 3);
    for (const wrong of [{ game_date: '2026-09-03' }, { sport: 'MLB HR' }, { game_id: '43' }, { game_id: null }, { player_name: 'Other Player' }, { prop_type: 'hits' }, { line_value: 6.5 }, { bet: 'over' }]) {
      expect(book(p, { board: [], propResults: [{ ...result, ...wrong }] })[0].grade_status).toBe('missing_grade');
    }
    expect(propTicketIdentity({ ...result, line_value: 0 })).not.toBeNull();
    expect(propTicketIdentity({ ...result, line_value: null })).toBeNull();
    expect(gameTicketIdentity({ ...grade(), game_date: null })).toBeNull();
  });

  it('reports sample sizes, pushes, missing grades, unpriced wins and ROI denominator explicitly', () => {
    const rows = [
      ...book(),
      ...book(candidate({ id: 2 }), { gameResults: [grade({ result: 'lost' })] }),
      ...book(candidate({ id: 3 }), { gameResults: [grade({ result: 'push' })] }),
      ...book(candidate({ id: 4, odds: null }), { gameResults: [grade()] }),
      ...book(candidate({ id: 5 }), { gameResults: [] }),
    ];
    expect(tallyWinnersBook(rows)).toMatchObject({ candidates: 5, games: 1, won: 2, lost: 1, push: 1, missing: 1, unpriced: 1, priced: 2, units: 0.5, roi_pct: 25 });
    expect(unitsAtPrice('won', -200)).toBe(0.5);
    expect(unitsAtPrice('won', 0)).toBeNull();
    expect(unitsAtPrice('push', null)).toBe(0);
    expect(unitsAtPrice('void', 150)).toBe(0);
  });
});

describe('Read-only report plumbing', () => {
  it('pages beyond the API default and propagates an incomplete read', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, id) => ({ id })) }).mockResolvedValueOnce({ data: [{ id: 1000 }] });
    const query = () => ({ order: () => ({ range }) });
    expect(await readAllRows(query, 'test')).toHaveLength(1001);
    expect(range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    range.mockResolvedValue({ data: null, error: { message: 'connection lost' } });
    await expect(readAllRows(query, 'test')).rejects.toThrow('test: connection lost');
  });

  it('prints separate comparison groups and explicitly avoids claiming improvement', () => {
    const lines = [];
    printWinnersBook(book(), 'test dates', line => lines.push(line));
    const text = lines.join('\n');
    for (const group of ['admitted:', 'qualified_not_admitted:', 'rejected:', 'unavailable:', 'timing_excluded:']) expect(text).toContain(group);
    expect(text).toContain('not proof that admission improves betting performance');
    expect(text).toContain('picker codex-gpt-6-astra');
    expect(text).toContain('at its recorded candidate price');
  });
});
