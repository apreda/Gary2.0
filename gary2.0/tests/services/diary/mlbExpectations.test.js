import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/supabaseClient.js', () => ({ supabaseAdmin: {} }));
import { buildMlbExpectationSnapshot, reviewMlbExpectations, parseMlbExpectationReview, readMlbExpectationMemory, formatMlbExpectationMemory,
  MLB_EXPECTATION_PHASES, MLB_EXPECTATION_REVIEW_SYSTEM } from '../../../src/services/diary/mlbExpectations.js';
import { loadMlbExpectationGameEvidence, reviewMlbExpectationBatch } from '../../../scripts/review-mlb-expectations.js';

const RUN = '11111111-1111-4111-8111-111111111111';
const REVIEW_AT = Date.parse('2026-09-09T04:00:00Z');
function fixture(result = 'lost') {
  const pick = { game_id: '42', league: 'MLB', judgment_run_id: RUN, decision_policy: 'mlb-judgment-v2', pick: 'Red Sox ML', odds: -118,
    homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', commence_time: '2026-09-08T23:10:00Z' };
  const run = { run_id: RUN, game_id: '42', league: 'MLB', game_date: '2026-09-08', commence_time: pick.commence_time,
    created_at: '2026-09-08T20:00:00Z', source_snapshot: { deskText: 'Original pitching log: the starter threw 91 pitches on September 3.', game: { gamePk: 777 } } };
  const expectations = Object.fromEntries(MLB_EXPECTATION_PHASES.map(phase => [phase, {
    claim: `${phase}: Boston starter works five innings.`, evidence: 'Original pitching log: the starter threw 91 pitches on September 3.',
    disconfirming_observation: 'The starter leaves before completing five innings.' }]));
  const events = ['initial_commit', 'factual_research', 'stress_test', 'price_assessment', 'published'].map((phase, i) => ({
    event_id: i + 1, run_id: RUN, phase, recorded_at: `2026-09-08T20:0${i + 1}:00Z`, payload_sha256: `${phase}-hash`,
    payload: { schema_version: 1, policy_version: 'mlb-judgment-v2', game_id: '42', game_date: run.game_date,
      recorded_at: `2026-09-08T20:0${i + 1}:00Z`, data: phase === 'stress_test' ? { expectations }
        : phase === 'published' ? { final_pick_snapshot: pick } : { original: 'Original preserved phase evidence.' } },
  }));
  const snapshot = buildMlbExpectationSnapshot(run, events);
  const input = { snapshot, result: { id: 1, game_date: run.game_date, league: 'MLB', game_id: '42', pick_text: pick.pick, result },
    game_evidence: { game_id: '42', game_date: run.game_date, league: 'MLB', game_pk: 777, final: true, sources: [
      { source_id: 'box', kind: 'boxscore', url: 'https://statsapi.mlb.com/api/v1/game/777/boxscore', observed_at: '2026-09-09T03:50:00Z', text: 'Boston starter pitched 5.0 innings, allowing 2 runs.' },
      { source_id: 'final', kind: 'final', url: 'https://statsapi.mlb.com/api/v1/schedule', observed_at: '2026-09-09T03:50:00Z', text: 'Final score: Seattle 5, Boston 3.' },
    ] } };
  const response = { expectations: snapshot.expectations.map(item => ({ expectation_id: item.expectation_id,
    decision_review: { assessment: 'no_identified_error', explanation: 'The original workload observation was supported before first pitch.', evidence: [
      { source_id: item.expectation_id, quote: item.claim }, { source_id: 'pregame:desk', quote: run.source_snapshot.deskText }] },
    outcome_review: { status: 'observed', explanation: 'The box score records five innings from the starter.', evidence: [{ source_id: 'box', quote: 'Boston starter pitched 5.0 innings' }] } })) };
  return { run, events, input, response };
}
const oneShot = object => vi.fn(async () => ({ success: true, data: JSON.stringify(object) }));
const outputFor = async f => reviewMlbExpectations(f.input, { oneShot: oneShot(f.response), clock: () => REVIEW_AT });
const memoryRow = async (extra = {}) => {
  const f = fixture(), out = await outputFor(f);
  return { run_id: RUN, game_date: f.run.game_date, game_id: '42', policy_version: 'mlb-expectation-v1', review_model: out.model,
    review: out.review, final_evidence: { ...f.input, review_started_at: out.review_started_at, review_completed_at: out.review_completed_at },
    source_hash: 'original-hash', created_at: '2026-09-09T04:00:01Z', ...extra };
};

describe('prospective MLB expectation reviews', () => {
  it('preserves four exact pregame IDs and claims and separates a loss from observed expectations', async () => {
    const f = fixture(), saved = structuredClone(f.input);
    const out = await outputFor(f);
    expect(out).toMatchObject({ ok: true, model: 'codex-gpt-5.6-sol', review: { run_id: RUN, result: 'lost' } });
    expect(out.review.expectations).toHaveLength(4);
    expect(out.review.expectations[0]).toMatchObject({ expectation_id: `${RUN}:opening`, outcome_review: { status: 'observed' }, decision_review: { assessment: 'no_identified_error' } });
    expect(out.review.expectations[0].claim).toBeUndefined();
    expect(f.input).toEqual(saved);
    expect(MLB_EXPECTATION_REVIEW_SYSTEM).toContain('final score alone cannot establish');
  });
  it('preserves original tool evidence and its observation time without changing its text', () => {
    const f = fixture();
    f.run.source_snapshot.toolResponses = [
      { content: 'Original provider response with literal whitespace.\n', observedAt: '2026-09-08T19:59:00Z' },
      { content: { innings: '5.0', rest_days: 5 } },
    ];
    const snapshot = buildMlbExpectationSnapshot(f.run, f.events);
    expect(snapshot.original_sources.filter(s => s.source_id.startsWith('pregame:tool:'))).toEqual([
      { source_id: 'pregame:tool:0', kind: 'data', stage: 'pregame', text: f.run.source_snapshot.toolResponses[0].content, recorded_at: '2026-09-08T19:59:00Z' },
      { source_id: 'pregame:tool:1', kind: 'data', stage: 'pregame', text: '{"innings":"5.0","rest_days":5}', recorded_at: f.run.created_at },
    ]);
  });
  it.each(['won', 'lost', 'push', 'void'])('reviews %s by the same standard', async result => {
    const f = fixture(result);
    expect((await outputFor(f)).review.result).toBe(result);
  });
  it('rejects hindsight, duplicate or foreign immutable phases before any expectation is built', () => {
    for (const change of [f => { f.events[2].recorded_at = f.run.commence_time; },
      f => { f.events[2].payload.recorded_at = f.run.commence_time; }, f => { f.events[2].payload.game_id = 'other'; },
      f => { f.events[2].run_id = 'other'; }, f => { f.events.push(f.events[0]); },
      f => { f.events[4].payload.data.final_pick_snapshot.judgment_run_id = 'other'; },
      f => { delete f.events[2].payload.data.expectations.opening; }]) {
      const f = fixture(); change(f);
      expect(() => buildMlbExpectationSnapshot(f.run, f.events)).toThrow();
    }
  });
  it('rejects unsupported or cross-stage citations, rewritten IDs and future prescriptions', () => {
    for (const change of [r => { r.expectations[0].outcome_review.evidence[0].quote = 'Invented six scoreless innings'; },
      r => { r.expectations[0].decision_review.evidence[1] = { source_id: 'box', quote: 'Boston starter pitched 5.0 innings' }; },
      r => { r.expectations[0].expectation_id = `${RUN}:invented`; }, r => { r.expectations[1] = r.expectations[0]; },
      r => { r.expectations[0].decision_review.explanation = 'Going forward, fade favorites.'; },
      r => { r.expectations[0].outcome_review.variance = 'bad luck'; },
      r => { r.expectations[0].claim = 'A revised hindsight expectation'; }]) {
      const f = fixture(); change(f.response);
      expect(parseMlbExpectationReview(f.response, f.input)).toBeNull();
    }
  });
  it('keeps missing gameplay unknown and refuses to infer an expectation from the ticket result alone', async () => {
    const f = fixture(); f.input.game_evidence.sources = f.input.game_evidence.sources.filter(s => s.kind === 'final');
    for (const item of f.response.expectations) item.outcome_review = { status: 'unknown', explanation: 'The final score does not establish the starter workload.', evidence: [] };
    expect((await outputFor(f)).review.expectations.every(item => item.outcome_review.status === 'unknown')).toBe(true);
    f.response.expectations[0].outcome_review = { status: 'contradicted', explanation: 'Boston lost.', evidence: [{ source_id: 'final', quote: 'Final score: Seattle 5, Boston 3.' }] };
    expect(parseMlbExpectationReview(f.response, f.input)).toBeNull();
  });
  it('refuses wrong tickets, in-progress games and postdated source snapshots before calling the model', async () => {
    const call = vi.fn();
    for (const change of [f => { f.input.result.pick_text = 'Red Sox -1.5'; }, f => { f.input.result.game_id = '43'; },
      f => { f.input.result.result = 'pending'; }, f => { f.input.game_evidence.final = false; },
      f => { f.input.game_evidence.game_id = '43'; }, f => { f.input.snapshot.expectations[0].recorded_at = f.run.commence_time; },
      f => { f.input.game_evidence.sources[0].observed_at = '2026-09-10T00:00:00Z'; }]) {
      const f = fixture(); change(f);
      expect((await reviewMlbExpectations(f.input, { oneShot: call, clock: () => REVIEW_AT })).ok).toBe(false);
    }
    expect(call).not.toHaveBeenCalled();
  });
  it('accepts the database settlement spelling and rejects reporting-only result aliases before model work', async () => {
    const f = fixture(); f.input.result.result = ' WON ';
    expect((await outputFor(f)).review.result).toBe('won');
    const call = vi.fn();
    for (const result of ['win', 'loss', 'pushed', 'voided']) {
      f.input.result.result = result;
      expect((await reviewMlbExpectations(f.input, { oneShot: call, clock: () => REVIEW_AT })).ok).toBe(false);
    }
    expect(call).not.toHaveBeenCalled();
  });
});

function dbFixture(tables = {}, rpcData = true) {
  const calls = [];
  return { calls, rpc: vi.fn(async name => ({ data: name === 'record_mlb_expectation_review' ? rpcData : true, error: null })), from(table) {
    const filters = [];
    const q = { select() { return q; }, order(...args) { calls.push(['order', ...args]); return q; },
      eq(k, v) { filters.push([k, v]); calls.push(['eq', k, v]); return q; },
      gte() { return q; }, lte(...args) { calls.push(['lte', ...args]); return q; }, lt(...args) { calls.push(['lt', ...args]); return q; },
      async range(from, to) { return { data: (tables[table] || []).filter(row => filters.every(([k, v]) => row[k] === v)).slice(from, to + 1), error: null }; },
      async limit(n) { calls.push(['limit', n]); return { data: (tables[table] || []).slice(0, n), error: null }; } };
    return q;
  } };
}

describe('main Gary memory retrieval', () => {
  it('bounds the sample without filtering outcomes and rejects reviews unavailable at decision time', async () => {
    const good = await memoryRow(), late = await memoryRow({ created_at: '2026-09-10T00:00:00Z' });
    const db = dbFixture({ mlb_expectation_reviews: [good, late, { ...good, policy_version: 'legacy-hindsight' }] });
    const result = await readMlbExpectationMemory({ db, date: '2026-09-09', before: '2026-09-09T18:00:00Z', limit: 8 });
    expect(result).toMatchObject({ reviewed_games: 1, expectations: 4, excluded: 2 });
    expect(result.text).toContain(good.final_evidence.snapshot.expectations[0].claim);
    expect(result.text).toContain('What happened: observed');
    expect(result.text).toContain('[box]');
    expect(db.calls).toContainEqual(['lt', 'created_at', '2026-09-09T18:00:00Z']);
    expect(db.calls.some(call => call[1] === 'result')).toBe(false);
  });
  it('rejects tampered review IDs/citations and never feeds the current decision its own later review', async () => {
    const good = await memoryRow();
    for (const change of [row => { row.review.expectations[0].expectation_id = 'wrong'; },
      row => { row.final_evidence.review_completed_at = '2026-09-09T19:00:00Z'; },
      row => { row.final_evidence.snapshot.expectations[0].recorded_at = '2026-09-09T03:00:00Z'; },
      row => { row.review.expectations[0].outcome_review.evidence[0].quote = 'Not in the original source'; }]) {
      const row = structuredClone(good); change(row);
      expect((await readMlbExpectationMemory({ db: dbFixture({ mlb_expectation_reviews: [row] }), date: '2026-09-09', before: '2026-09-09T18:00:00Z' })).rows).toEqual([]);
    }
  });
  it('caps prompt memory at complete games and gives an unavailable read a finite deadline', async () => {
    const row = await memoryRow();
    const formatted = formatMlbExpectationMemory([row, row, row], { maxChars: 4000 });
    expect(formatted.length).toBeLessThanOrEqual(4000);
    expect(formatted).toContain('Memory displays 1 of 3');
    expect(formatted).toContain(`${RUN}:offense`);
    const db = dbFixture();
    const originalFrom = db.from;
    db.from = table => { const q = originalFrom(table); q.limit = () => new Promise(() => {}); return q; };
    await expect(readMlbExpectationMemory({ db, date: '2026-09-09', before: '2026-09-09T18:00:00Z', timeoutMs: 10 })).rejects.toThrow();
  });
});

describe('official gameplay binding and incremental worker', () => {
  const game = { gamePk: 777, gameDate: '2026-09-08T23:10:00Z', officialDate: '2026-09-08', status: { abstractGameState: 'Final' },
    teams: { home: { team: { id: 111, name: 'Boston Red Sox' } }, away: { team: { id: 136, name: 'Seattle Mariners' } } } };
  const deps = { schedule: async () => [game], boxscore: async () => ({ teams: { home: { team: game.teams.home.team, players: { p: { person: { fullName: 'Pitcher' }, stats: { pitching: { inningsPitched: '5.0' } } } } }, away: { team: game.teams.away.team, players: {} } } }), scoring: async () => ['[T1] Seattle scores — off Boston starter'], clock: () => REVIEW_AT };
  it('uses MLB gamePk for official data, never the BDL ID; preserves box and play sources', async () => {
    const f = fixture(), boxscore = vi.fn(deps.boxscore);
    const evidence = await loadMlbExpectationGameEvidence(f.input.snapshot, { ...deps, boxscore });
    expect(boxscore).toHaveBeenCalledWith(777, { signal: undefined });
    expect(evidence).toMatchObject({ game_id: '42', game_pk: 777, final: true });
    expect(evidence.sources.map(s => s.kind)).toEqual(['final', 'boxscore', 'plays']);
  });
  it('refuses ambiguous doubleheaders and date-only matchup matches without exact scheduled start', async () => {
    const snapshot = { ...fixture().input.snapshot, game_pk: null };
    await expect(loadMlbExpectationGameEvidence(snapshot, { ...deps, schedule: async () => [game, { ...game, gamePk: 778 }] })).rejects.toThrow('uniquely');
    await expect(loadMlbExpectationGameEvidence(snapshot, { ...deps, schedule: async () => [{ ...game, gameDate: '2026-09-08T20:10:00Z' }] })).rejects.toThrow('uniquely');
    await expect(loadMlbExpectationGameEvidence(snapshot, { ...deps, schedule: async () => [{ ...game, status: { abstractGameState: 'Live' } }] })).rejects.toThrow('not final');
  });
  it('reviews an exact settled original once, preserves all inputs and reports missing write receipts', async () => {
    const f = fixture(), out = await outputFor(f);
    const tables = { mlb_judgment_runs: [f.run], mlb_judgment_events: f.events, game_results: [f.input.result] };
    const db = dbFixture(tables), review = vi.fn(async () => out), collectEvidence = vi.fn(async () => f.input.game_evidence);
    const report = await reviewMlbExpectationBatch({ db }, { review, collectEvidence, clock: () => REVIEW_AT, log: () => {} });
    expect(report).toMatchObject({ reviewed: 1, unavailable: [] });
    expect(db.rpc).toHaveBeenCalledWith('record_mlb_expectation_review', expect.objectContaining({ p_run_id: RUN, p_review: out.review, p_final_evidence: expect.objectContaining({ snapshot: f.input.snapshot }) }));
    expect(db.rpc).toHaveBeenCalledWith('claim_mlb_expectation_review', expect.objectContaining({ p_run_id: RUN, p_lease_seconds: 420 }));
    expect(db.rpc).toHaveBeenCalledWith('finish_mlb_expectation_review_attempt', expect.objectContaining({ p_run_id: RUN, p_error: null }));
    const claimedToken = db.rpc.mock.calls.find(([name]) => name === 'claim_mlb_expectation_review')[1].p_lease_token;
    expect(db.rpc.mock.calls.find(([name]) => name === 'record_mlb_expectation_review')[1].p_lease_token).toBe(claimedToken);
    expect(db.rpc.mock.calls.find(([name]) => name === 'finish_mlb_expectation_review_attempt')[1].p_lease_token).toBe(claimedToken);
    const missing = await reviewMlbExpectationBatch({ db: dbFixture(tables, null) }, { review, collectEvidence, clock: () => REVIEW_AT, log: () => {} });
    expect(missing.reviewed).toBe(0);
    expect(missing.unavailable[0].error).toContain('not confirmed');
    const repeated = await reviewMlbExpectationBatch({ db: dbFixture({ ...tables, mlb_expectation_reviews: [{ run_id: RUN }] }) }, { review, collectEvidence, clock: () => REVIEW_AT, log: () => {} });
    expect(repeated.considered).toBe(0);
  });
  it('does not review a different ticket or conflicting duplicate results', async () => {
    const f = fixture(), review = vi.fn(), collectEvidence = vi.fn();
    for (const grades of [[{ ...f.input.result, pick_text: 'Red Sox -1.5' }], [f.input.result, { ...f.input.result, result: 'won' }]]) {
      const db = dbFixture({ mlb_judgment_runs: [f.run], mlb_judgment_events: f.events, game_results: grades });
      await reviewMlbExpectationBatch({ db }, { review, collectEvidence, clock: () => REVIEW_AT, log: () => {} });
    }
    expect(review).not.toHaveBeenCalled();
    expect(collectEvidence).not.toHaveBeenCalled();
  });

  it.each(['ticket_text', 'result_alias'])('uses the exact canonical settled row when a %s duplicate appears first', async kind => {
    const f = fixture(), out = await outputFor(f);
    const variant = { ...f.input.result, id: 2, ...(kind === 'ticket_text' ? { pick_text: '  red sox ML ' } : { result: 'loss' }) };
    const db = dbFixture({ mlb_judgment_runs: [f.run], mlb_judgment_events: f.events, game_results: [variant, f.input.result] });
    const review = vi.fn(async () => out);
    await reviewMlbExpectationBatch({ db }, { review, collectEvidence: async () => f.input.game_evidence, clock: () => REVIEW_AT, log: () => {} });
    expect(review.mock.calls[0][0].result).toEqual(f.input.result);
  });

  it('counts unpublished failed judgment attempts without repeatedly loading their histories', async () => {
    const f = fixture();
    const db = dbFixture({ mlb_judgment_runs: [f.run], mlb_judgment_events: f.events.filter(e => e.phase !== 'published'), game_results: [f.input.result] });
    const review = vi.fn();
    const report = await reviewMlbExpectationBatch({ db }, { review, clock: () => REVIEW_AT, log: () => {} });
    expect(report).toMatchObject({ considered: 1, unpublished: 1, deferred: 0, claimed: 0, unavailable: [] });
    expect(db.calls).not.toContainEqual(['eq', 'run_id', RUN]);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it('cancels a stalled source collection at the shared batch deadline without recording a review', async () => {
    const f = fixture(), db = dbFixture({ mlb_judgment_runs: [f.run], mlb_judgment_events: f.events, game_results: [f.input.result] });
    let signal;
    const collectEvidence = vi.fn((_snapshot, options) => { signal = options.signal; return new Promise(() => {}); });
    const review = vi.fn();
    const report = await reviewMlbExpectationBatch({ db, budgetMs: 15 }, { collectEvidence, review, clock: () => REVIEW_AT, log: () => {} });
    expect(signal.aborted).toBe(true);
    expect(report).toMatchObject({ reviewed: 0, budget_exhausted: true });
    expect(report.unavailable[0].error).toContain('deadline');
    expect(review).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.map(call => call[0])).toEqual(['claim_mlb_expectation_review']);
    expect(report.unavailable[0].recovery).toContain('Lease expiration');
  });

  it('passes shared cancellation and the remaining timeout to the model provider', async () => {
    const f = fixture(), db = dbFixture({ mlb_judgment_runs: [f.run], mlb_judgment_events: f.events, game_results: [f.input.result] });
    let providerOptions;
    const call = vi.fn((_prompt, options) => {
      providerOptions = options;
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    });
    const review = (input, options) => reviewMlbExpectations(input, { ...options, oneShot: call });
    const report = await reviewMlbExpectationBatch({ db, budgetMs: 15 }, { collectEvidence: async () => f.input.game_evidence,
      review, clock: () => REVIEW_AT, log: () => {} });
    expect(providerOptions.signal.aborted).toBe(true);
    expect(providerOptions.timeoutMs).toBeLessThanOrEqual(15);
    expect(report.budget_exhausted).toBe(true);
    expect(db.rpc.mock.calls.map(call => call[0])).toEqual(['claim_mlb_expectation_review']);
  });

  it('keeps the six-minute budget shared across successive source/model operations', async () => {
    const a = fixture(), b = JSON.parse(JSON.stringify(fixture()).replaceAll(RUN, '22222222-2222-4222-8222-222222222222').replaceAll('"42"', '"43"'));
    const db = dbFixture({ mlb_judgment_runs: [a.run, b.run], mlb_judgment_events: [...a.events, ...b.events], game_results: [a.input.result, b.input.result] });
    let clock = REVIEW_AT;
    const collectEvidence = async snapshot => { clock += 60_000; return { ...a.input.game_evidence, game_id: snapshot.game_id }; };
    const timeouts = [];
    const review = async (input, options) => {
      timeouts.push(options.timeoutMs);
      clock += timeouts.length === 1 ? 180_000 : 61_000;
      return { ok: true, review: {}, model: 'fixture', review_started_at: new Date(clock - 1000).toISOString(), review_completed_at: new Date(clock).toISOString() };
    };
    const report = await reviewMlbExpectationBatch({ db, limit: 2 }, { collectEvidence, review, clock: () => clock, log: () => {} });
    expect(timeouts).toEqual([180_000, 60_000]);
    expect(report).toMatchObject({ reviewed: 1, budget_exhausted: true });
    expect(db.rpc.mock.calls.map(call => call[0])).toEqual(['claim_mlb_expectation_review', 'record_mlb_expectation_review',
      'finish_mlb_expectation_review_attempt', 'claim_mlb_expectation_review']);
  });

  it('defers cooldowns and active leases, and gives new games a turn ahead of due old failures', async () => {
    const fixtures = Array.from({ length: 4 }, (_, i) => JSON.parse(JSON.stringify(fixture())
      .replaceAll(RUN, `${i + 1}1111111-1111-4111-8111-111111111111`).replaceAll('"42"', `"${42 + i}"`)));
    const db = dbFixture({ mlb_judgment_runs: fixtures.map(f => f.run), mlb_judgment_events: fixtures.flatMap(f => f.events),
      game_results: fixtures.map(f => f.input.result), mlb_expectation_review_attempts: [
        { run_id: fixtures[0].run.run_id, status: 'failed', attempts: 4, started_at: '2026-09-09T01:00:00Z', next_retry_at: '2026-09-09T03:00:00Z' },
        { run_id: fixtures[1].run.run_id, status: 'failed', attempts: 1, started_at: '2026-09-09T03:45:00Z', next_retry_at: '2026-09-09T04:15:00Z' },
        { run_id: fixtures[2].run.run_id, status: 'reviewing', lease_until: '2026-09-09T04:06:00Z' },
      ] });
    const collectEvidence = vi.fn(async () => { throw new Error('Official source temporarily unavailable'); });
    const report = await reviewMlbExpectationBatch({ db, limit: 1 }, { collectEvidence, clock: () => REVIEW_AT, log: () => {} });
    expect(report).toMatchObject({ considered: 4, deferred: 2, claimed: 1, reviewed: 0 });
    expect(collectEvidence.mock.calls[0][0].run_id).toBe(fixtures[3].run.run_id);
    expect(db.rpc).toHaveBeenCalledWith('finish_mlb_expectation_review_attempt', expect.objectContaining({
      p_run_id: fixtures[3].run.run_id, p_error: 'Official source temporarily unavailable',
    }));
  });

  it('requires an atomic claim before collection and retries least recently attempted games first', async () => {
    const a = fixture(), b = JSON.parse(JSON.stringify(fixture()).replaceAll(RUN, '22222222-2222-4222-8222-222222222222').replaceAll('"42"', '"43"'));
    const db = dbFixture({ mlb_judgment_runs: [a.run, b.run], mlb_judgment_events: [...a.events, ...b.events], game_results: [a.input.result, b.input.result],
      mlb_expectation_review_attempts: [
        { run_id: a.run.run_id, status: 'failed', started_at: '2026-09-09T03:00:00Z' },
        { run_id: b.run.run_id, status: 'failed', started_at: '2026-09-09T01:00:00Z' },
      ] });
    db.rpc.mockImplementation(async () => ({ data: false, error: null }));
    const collectEvidence = vi.fn(), review = vi.fn();
    const report = await reviewMlbExpectationBatch({ db, limit: 1 }, { collectEvidence, review, clock: () => REVIEW_AT, log: () => {} });
    expect(db.rpc.mock.calls.map(call => call[1].p_run_id)).toEqual([b.run.run_id, a.run.run_id]);
    expect(collectEvidence).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(report).toMatchObject({ deferred: 2, claimed: 0, unavailable: [] });
  });
});
