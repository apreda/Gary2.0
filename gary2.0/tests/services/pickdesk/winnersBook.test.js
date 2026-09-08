import { describe, it, expect, vi } from 'vitest';
import { admittedGameKeys, isWinnersGame, gameTicketIdentity, propTicketIdentity, buildWinnersBook, buildMlbSelectionBook, tallyWinnersBook, unitsAtPrice } from '../../../src/services/pickdesk/winnersBook.js';
import { readAllRows, readWinnersBook, readWinnersReport, printWinnersBook, printMlbSelectionBook } from '../../../scripts/winners-book.js';

const NOW = Date.parse('2026-09-05T04:00:00Z');
const candidate = (extra = {}) => ({
  id: 1, game_date: '2026-09-04', league: 'MLB', kind: 'game', game_id: '42', ticket_key: 'ticket-1',
  pick_text: 'Mariners ML', odds: 150, commence_time: '2026-09-04T23:00:00Z',
  pick_snapshot: { pick: 'Mariners ML', odds: 150, model: 'codex-gpt-6-astra', prompt_sha: 'game-v1' },
  policy_version: 'exact-ticket-v2', status: 'qualified', created_at: '2026-09-04T20:00:00Z',
  reviewed_at: '2026-09-04T20:05:00Z', admitted_at: '2026-09-04T20:06:00Z', review_model: 'codex-gpt-5.6-sol', ...extra,
});

const judgmentCandidate = (extra = {}) => candidate({
  policy_version: 'mlb-conviction-v3', admitted_at: '2026-09-04T20:08:00Z',
  pick_snapshot: { ...candidate().pick_snapshot, decision_policy: 'mlb-judgment-v1', rationale: 'The original game read.' }, ...extra,
});
const publicPick = (c, extra = {}) => ({ ...c.pick_snapshot, game_date: c.game_date, league: c.league,
  game_id: c.game_id, commence_time: c.commence_time, ...extra });
const selection = (c, extra = {}) => ({ id: 101, game_date: c.game_date, league: c.league, kind: 'game',
  policy_version: 'mlb-conviction-v3', cohort: 0, window_start: '2026-09-04T20:00:00Z',
  input_snapshot: { candidates: [c], capacity: { remaining: 2, total_limit: 6, cohort_limit: 2, already_admitted: 0 } },
  selection: { ranked_candidates: [{ candidate_id: c.id, rank: 1, selected: true,
    reason: 'This is my strongest read.', expected_outcome: 'Seattle wins.', comparison: 'The other candidates have less settled pitching assignments.' }], summary: 'My early choices.' },
  status: 'completed', model: 'codex-gpt-6-astra', attempts: 1,
  created_at: '2026-09-04T20:06:00Z', completed_at: '2026-09-04T20:07:00Z', ...extra });
const mlbBook = (c = judgmentCandidate(), extra = {}) => buildMlbSelectionBook({
  publicPicks: [publicPick(c)], candidates: [c], board: [boardRow(c)], selectionRuns: [selection(c)],
  gameResults: [grade()], now: NOW, ...extra,
});

describe('Gary MLB selection measurement', () => {
  it('retains the complete comparison, original odds and exact admission', () => {
    const c = judgmentCandidate();
    const row = mlbBook(c, { gameResults: [grade({ odds: -300 })], board: [{ ...boardRow(c), reason: 'Gary selected Seattle over the alternatives.' }] })[0];
    expect(row).toMatchObject({ group: 'admitted', published: true, odds: 150, units: 1.5,
      decision_policy: 'mlb-judgment-v1', selection_run_id: 101, selection_model: 'codex-gpt-6-astra',
      selection_window: '2026-09-04T20:00:00Z', expected_outcome: 'Seattle wins.', board_reason: 'Gary selected Seattle over the alternatives.' });
    expect(row.selection_history[0]).toMatchObject({ valid_decision: true, rank: 1, selected: true,
      reason: 'This is my strongest read.', comparison: 'The other candidates have less settled pitching assignments.',
      capacity: { remaining: 2, total_limit: 6 } });
  });

  it('counts only an explicit completed Gary decision as considered but not selected', () => {
    const c = judgmentCandidate({ admitted_at: null });
    const run = selection(c);
    run.selection.ranked_candidates[0].selected = false;
    expect(mlbBook(c, { board: [], selectionRuns: [run] })[0].group).toBe('considered_not_selected');
    expect(mlbBook(c, { board: [], selectionRuns: [] })[0].group).toBe('qualified_unconsidered');
    expect(mlbBook(c, { board: [] })[0].group).toBe('selected_not_admitted');
    for (const status of ['failed', 'expired', 'selecting']) {
      expect(mlbBook(c, { board: [], selectionRuns: [selection(c, { status, completed_at: null })] })[0].group).toBe(`selection_${status}`);
    }
  });

  it('does not let a failed retry erase Gary’s earlier actual comparison', () => {
    const c = judgmentCandidate({ admitted_at: null });
    const first = selection(c);
    first.selection.ranked_candidates[0].selected = false;
    const row = mlbBook(c, { board: [], selectionRuns: [first, selection(c, { id: 102, status: 'failed', created_at: '2026-09-04T21:00:00Z', completed_at: null })] })[0];
    expect(row.group).toBe('considered_not_selected');
    expect(row.selection_history).toHaveLength(2);
    expect(row.selection_run_id).toBe(101);
  });

  it('preserves actual provider failures and earlier attempts without attributing a rejection to Gary', () => {
    const c = judgmentCandidate({ admitted_at: null });
    const attempt_history = [{ attempt: 1, error: 'Provider timed out', at: '2026-09-04T20:07:00Z', model: 'gpt-6-astra' }];
    const rows = mlbBook(c, { board: [], selectionRuns: [selection(c, { status: 'failed', error: 'Provider timed out',
      ms: 360000, attempt_history, lease_until: null })] });
    expect(rows[0]).toMatchObject({ group: 'selection_failed', reason: 'selection failed: Provider timed out' });
    expect(rows[0].selection_history[0]).toMatchObject({ error: 'Provider timed out', attempt_history, ms: 360000, lease_until: null });
    const lines = [];
    printMlbSelectionBook(rows, 'fixture', line => lines.push(line));
    expect(lines.join('\n')).toContain('Attempt 1, 2026-09-04T20:07:00Z, model gpt-6-astra: Provider timed out');
  });

  it('includes public picks absent from the candidate queue and keeps unavailable and factual blocks separate', () => {
    const c = judgmentCandidate();
    const rows = mlbBook(c, { publicPicks: [publicPick(c), publicPick(c, { game_id: '43', pick: 'Royals ML', odds: -125 })] });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ group: 'unconsidered', candidate_id: null, status: 'not_queued', grade_status: 'missing_grade' });
    for (const [status, group] of [['rejected', 'factual_blocked'], ['unavailable', 'unavailable'], ['pending', 'unreviewed_at_kickoff']]) {
      const blocked = judgmentCandidate({ status, reviewed_at: status === 'pending' ? null : c.reviewed_at });
      expect(mlbBook(blocked, { board: [], selectionRuns: [] })[0].group).toBe(group);
    }
  });

  it('holds out late, malformed, wrong-era and mismatched comparison records', () => {
    const c = judgmentCandidate({ admitted_at: null });
    const invalid = [
      { completed_at: '2026-09-04T23:00:00Z' },
      { created_at: '2026-09-04T20:04:00Z' },
      { policy_version: 'exact-ticket-v2' },
      { game_date: '2026-09-03' },
      { selection: { ranked_candidates: [] } },
      { input_snapshot: { candidates: [{ ...c, odds: 200 }] } },
      { input_snapshot: { candidates: [{ ...c, status: 'rejected' }] } },
    ];
    for (const change of invalid) {
      expect(mlbBook(c, { board: [], selectionRuns: [selection(c, change)] })[0].group).toBe('selection_record_invalid');
    }
    expect(mlbBook(judgmentCandidate(), { selectionRuns: [] })[0]).toMatchObject({ published: true, group: 'selection_record_missing' });
  });

  it('requires the whole comparison to account for all candidates exactly once', () => {
    const c = judgmentCandidate({ admitted_at: null });
    const run = selection(c);
    run.input_snapshot.candidates.push(judgmentCandidate({ id: 2, game_id: '43', ticket_key: 'other' }));
    expect(mlbBook(c, { board: [], selectionRuns: [run] })[0].group).toBe('selection_record_invalid');
    run.selection.ranked_candidates.push({ ...run.selection.ranked_candidates[0] });
    expect(mlbBook(c, { board: [], selectionRuns: [run] })[0].group).toBe('selection_record_invalid');
  });

  it('never conflates exact tickets, conflicting grades or public/candidate policy changes', () => {
    const c = judgmentCandidate();
    expect(mlbBook(c, { gameResults: [grade({ pick_text: 'Mariners +1.5' })] })[0].grade_status).toBe('missing_grade');
    expect(mlbBook(c, { gameResults: [grade(), grade({ result: 'lost' })] })[0]).toMatchObject({ grade_status: 'conflicting_grades', result: null, units: null });
    expect(mlbBook(c, { publicPicks: [publicPick(c, { decision_policy: 'other-policy' })] })[0].group).toBe('ledger_conflict');
    expect(mlbBook(c, { candidates: [c, { ...c, id: 2 }] })[0].group).toBe('ledger_conflict');
    expect(mlbBook(c, { publicPicks: [publicPick(c, { odds: 144 })] })[0]).toMatchObject({ group: 'unconsidered', odds: 144, units: 1.44 });
  });

  it('does not rebrand legacy picks as new selections and prints policy/prompt cohorts separately', () => {
    const legacy = candidate();
    const oldRows = mlbBook(legacy, { selectionRuns: [] });
    expect(oldRows[0]).toMatchObject({ decision_policy: 'unstamped', policy_version: 'exact-ticket-v2', group: 'admitted' });
    const lines = [];
    printMlbSelectionBook([...oldRows, ...mlbBook()], 'fixture', line => lines.push(line));
    const text = lines.join('\n');
    expect(text.match(/all_public:/g)).toHaveLength(2);
    expect(text).toContain('mlb-judgment-v1 | picker');
    expect(text).toContain('unstamped | picker');
    expect(text).toContain('Original public odds');
    expect(text).toContain('selected true');
    expect(text).toContain('Compared with other picks:');
  });
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
  function fixtureDb(tables = {}, failures = {}) {
    return { from: vi.fn(table => {
      const builder = {};
      for (const method of ['select', 'gte', 'lte', 'in', 'order']) builder[method] = () => builder;
      builder.range = async (start, end) => ({ data: (tables[table] || []).slice(start, end + 1), error: failures[table] || null });
      return builder;
    }) };
  }

  it('reads public picks and all selection runs while preserving old candidate-only consumers', async () => {
    const c = judgmentCandidate();
    const db = fixtureDb({ winners_candidates: [c], winners_board: [boardRow(c)], game_results: [grade()],
      winners_selection_runs: [selection(c)], daily_picks: [{ date: c.game_date, picks: JSON.stringify([publicPick(c)]) }] });
    const legacy = await readWinnersBook(db, { until: '2026-09-04' });
    expect(legacy).toHaveLength(1);
    expect(db.from.mock.calls.some(([table]) => table === 'daily_picks')).toBe(false);
    const report = await readWinnersReport(db, { until: '2026-09-04' });
    expect(report.rows).toHaveLength(1);
    expect(report.mlb[0].group).toBe('admitted');
    expect(report.selection_runs).toHaveLength(1);
  });

  it('fails explicitly when public coverage or the selection ledger cannot be read completely', async () => {
    for (const picks of ['broken json', { pick: 'Mariners ML' }, [null], [{ pick: 'Mariners ML' }]]) {
      await expect(readWinnersReport(fixtureDb({ daily_picks: [{ date: '2026-09-04', picks }] }))).rejects.toThrow('daily_picks');
    }
    await expect(readWinnersReport(fixtureDb({}, { winners_selection_runs: { message: 'read failed' } }))).rejects.toThrow('winners_selection_runs: read failed');
  });
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
