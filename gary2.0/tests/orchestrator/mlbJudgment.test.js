import { describe, expect, it, vi } from 'vitest';
import { buildMlbJudgmentTickets, MLB_EXPECTATION_IDS, MLB_JUDGMENT_PHASES, MLB_JUDGMENT_POLICY, runMlbJudgment } from '../../src/services/agentic/orchestrator/mlbJudgment.js';

const time = '2026-09-08T20:00:00.000Z';
const game = { moneyline_home: -150, moneyline_away: 130, spread_home: -1.5, spread_home_odds: 120, spread_away: 1.5, spread_away_odds: -140 };
const input = () => ({ gameId: 125800, gameDate: '2026-09-08', homeTeam: 'Home Club', awayTeam: 'Away Club', ...buildMlbJudgmentTickets(game, 'Home Club', 'Away Club') });
const expectations = () => Object.fromEntries(MLB_EXPECTATION_IDS.map(id => [id, {
  claim: `Concrete ${id} expectation from this matchup`, evidence: `Original ${id} evidence; uncertainty remains`, disconfirming_observation: `An observable contrary ${id} event`,
}]));
const initial = () => ({ winner: 'home', ticket_id: 'home-moneyline', whole_game_view: 'The complete game supports the home outcome, including relief innings.', expectations: expectations(),
  strongest_opposing_case: 'The opposing lineup can change the middle innings.', uncertain_assumption: 'The announced pitcher has his usual workload.',
  factual_questions: [{ id: 'q1', question: 'Was a pitch restriction announced today?', expectation_id: 'opening', why_it_matters: 'A confirmed restriction would alter the expected starter workload.' }] });
const stress = () => ({ winner: 'home', ticket_id: 'home-moneyline', whole_game_view: 'The original expectation survives the stated contrary sequence, with uncertainty.', expectations: expectations(),
  strongest_alternative: { scenario: 'The starter exits before the middle innings.', effect_on_expected_outcome: 'The relief sequence changes and could reverse the expected outcome.', response: 'The complete original record still supports the current outcome; the early-exit risk remains.' },
  changed_side: false, revision_evidence: [] });
const price = () => ({ ticket_id: 'home-moneyline', decision: 'endorse', reason: 'I endorse this exact ticket given the sporting judgment and its acknowledged uncertainty.' });
const receipt = phase => ({ ok: true, run_id: 'run-1', phase, event_id: 1, recorded_at: time, payload_sha256: `hash-${phase}` });

function setup({ first = initial(), second = stress(), third = price(), fixture = input(), researchAnswer = [{ question_id: 'q1', answer: 'No restriction reported in the supplied dated announcement.', source: 'original announcement', observed_at: time }] } = {}) {
  const timeline = [];
  const answers = [first, second, third];
  const ask = vi.fn(async (_prompt, { phase }) => { timeline.push(`ask:${phase}`); return JSON.stringify(answers[ask.mock.calls.length - 1]); });
  const research = vi.fn(async () => { timeline.push('research'); return researchAnswer; });
  const record = vi.fn(async phase => { timeline.push(`record:${phase}`); return receipt(phase); });
  const options = { input: fixture, ask, research, record, clock: () => Date.parse(time) };
  return { options, timeline, ask, research, record };
}

describe('MLB original ticket menu', () => {
  it('retains the exact moneyline cap and changes the game kind before the read', () => {
    const at = buildMlbJudgmentTickets({ ...game, moneyline_home: -179 }, 'Home', 'Away');
    expect(at.gameKind).toBe('moneyline');
    expect(at.allowedTickets[0]).toEqual({ id: 'home-moneyline', side: 'home', type: 'moneyline', line: null, odds: -179, pick: 'Home ML -179' });
    const past = buildMlbJudgmentTickets({ ...game, moneyline_home: -180 }, 'Home', 'Away');
    expect(past.gameKind).toBe('runline');
    expect(past.allowedTickets).toEqual([
      { id: 'home-spread', side: 'home', type: 'spread', line: -1.5, odds: 120, pick: 'Home -1.5 +120' },
      { id: 'away-spread', side: 'away', type: 'spread', line: 1.5, odds: -140, pick: 'Away +1.5 -140' },
    ]);
  });

  it('preserves away-favorite run-line prices and never borrows the opposing price', () => {
    const result = buildMlbJudgmentTickets({ moneyline_home: 184, moneyline_away: -220, spread_home: 1.5, spread_home_odds: -125, spread_away: -1.5, spread_away_odds: 104 }, 'Home', 'Away');
    expect(result.gameKind).toBe('runline');
    expect(result.allowedTickets.map(t => [t.side, t.line, t.odds])).toEqual([['home', 1.5, -125], ['away', -1.5, 104]]);
  });

  it.each([0, true, ' ', -99, 1.91, -110.5, Infinity])('does not turn malformed price %s into a supplied ticket', odds => {
    expect(buildMlbJudgmentTickets({ moneyline_home: odds }, 'Home', 'Away').allowedTickets).toEqual([]);
  });

  it('keeps the existing moneyline kind when the capped run line is incomplete', () => {
    const result = buildMlbJudgmentTickets({ ...game, moneyline_home: -220, spread_home_odds: null }, 'Home', 'Away');
    expect(result.gameKind).toBe('moneyline');
    expect(result.allowedTickets.map(t => t.id)).toEqual(['away-moneyline']);
  });
});

describe('prospective MLB judgment sequencing', () => {
  it('records each phase before the next operation and returns its bound original ticket', async () => {
    const fixture = setup();
    const result = await runMlbJudgment(fixture.options);
    expect(fixture.timeline).toEqual(['ask:initial_commit', 'record:initial_commit', 'research', 'record:factual_research', 'ask:stress_test', 'record:stress_test', 'ask:price_assessment', 'record:price_assessment']);
    expect(result).toMatchObject({ schema_version: 1, policy_version: MLB_JUDGMENT_POLICY, odds_visibility: 'odds_visible', odds_visible: true, run_id: 'run-1', winners_eligible: true,
      final_ticket: { id: 'home-moneyline', side: 'home', odds: -150 } });
    expect(Object.keys(result.receipts)).toEqual(MLB_JUDGMENT_PHASES);
    expect(fixture.record.mock.calls[0][1]).toMatchObject({ game_id: 125800, game_date: '2026-09-08', recorded_at: time, data: initial(), input: { gameKind: 'moneyline' } });
    expect(fixture.research).toHaveBeenCalledWith(initial().factual_questions);
  });

  it('waits for the durable initial receipt before any research or subsequent model turn', async () => {
    const fixture = setup();
    let resolveInitial;
    fixture.options.record = vi.fn(async phase => phase === 'initial_commit' ? new Promise(resolve => { resolveInitial = resolve; }) : receipt(phase));
    const pending = runMlbJudgment(fixture.options);
    await vi.waitFor(() => expect(resolveInitial).toBeTypeOf('function'));
    expect(fixture.research).not.toHaveBeenCalled();
    expect(fixture.ask).toHaveBeenCalledTimes(1);
    resolveInitial(receipt('initial_commit'));
    await pending;
    expect(fixture.ask).toHaveBeenCalledTimes(3);
  });

  it('waits for the durable stress-test receipt before price assessment', async () => {
    const fixture = setup();
    let resolveStress;
    fixture.options.record = vi.fn(async phase => phase === 'stress_test' ? new Promise(resolve => { resolveStress = resolve; }) : receipt(phase));
    const pending = runMlbJudgment(fixture.options);
    await vi.waitFor(() => expect(resolveStress).toBeTypeOf('function'));
    expect(fixture.ask).toHaveBeenCalledTimes(2);
    resolveStress(receipt('stress_test'));
    await pending;
    expect(fixture.ask).toHaveBeenCalledTimes(3);
  });

  it.each(MLB_JUDGMENT_PHASES)('stops if persisting %s fails, without skipping ahead', async phase => {
    const fixture = setup();
    fixture.options.record = vi.fn(async current => { if (current === phase) throw new Error('durable store unavailable'); return receipt(current); });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('durable store unavailable');
    expect(fixture.ask).toHaveBeenCalledTimes({ initial_commit: 1, factual_research: 1, stress_test: 2, price_assessment: 3 }[phase]);
  });

  it.each([undefined, false, { ok: true }, { ...receipt('initial_commit'), ok: false }, { ...receipt('initial_commit'), phase: 'stress_test' },
    { ...receipt('initial_commit'), recorded_at: 'invalid' }, { ...receipt('initial_commit'), payload_sha256: '' }])('refuses a missing or malformed durable receipt %j', async invalidReceipt => {
    const fixture = setup();
    fixture.options.record = vi.fn(async () => invalidReceipt);
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('matching durable receipt');
    expect(fixture.research).not.toHaveBeenCalled();
    expect(fixture.ask).toHaveBeenCalledTimes(1);
  });

  it('does not splice phase receipts from separate decision runs', async () => {
    const fixture = setup();
    fixture.options.record = async phase => ({ ...receipt(phase), run_id: phase === 'initial_commit' ? 'run-1' : 'run-2' });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('matching durable receipt');
    expect(fixture.ask).toHaveBeenCalledTimes(1);
  });

  it('loads recorded mechanism memory before initial judgment and identifies its limits', async () => {
    const fixture = setup();
    fixture.options.readMemory = vi.fn(async () => { fixture.timeline.push('memory'); return [{ claim: 'Original prospective relief expectation', claim_status: 'unknown' }]; });
    await runMlbJudgment(fixture.options);
    expect(fixture.timeline[0]).toBe('memory');
    expect(fixture.ask.mock.calls[0][0]).toContain('Original prospective relief expectation');
    expect(fixture.ask.mock.calls[0][0]).toContain('They are not betting rules');
  });

  it('records no-question research explicitly without calling the researcher', async () => {
    const fixture = setup({ first: { ...initial(), factual_questions: [] } });
    const result = await runMlbJudgment(fixture.options);
    expect(fixture.research).not.toHaveBeenCalled();
    expect(result.research).toEqual({ status: 'not_requested', questions: [], results: null });
    expect(fixture.record.mock.calls[1][0]).toBe('factual_research');
  });

  it.each([null, '', [], { error: 'budget exhausted' }, { ok: false }, { success: false }])('records unavailable research %j before proceeding from the original evidence', async researchAnswer => {
    const fixture = setup({ researchAnswer });
    const result = await runMlbJudgment(fixture.options);
    expect(result.research.status).toBe('unavailable');
    expect(fixture.ask.mock.calls[1][0]).toContain('Unavailable answers remain unresolved');
  });

  it('records an exception or missing callback as unresolved research', async () => {
    const fixture = setup();
    fixture.options.research = async () => { throw new Error('shared research budget expired'); };
    expect((await runMlbJudgment(fixture.options)).research).toMatchObject({ status: 'unavailable', error: 'shared research budget expired' });
    const missing = setup();
    delete missing.options.research;
    expect((await runMlbJudgment(missing.options)).research.status).toBe('unavailable');
  });

  it('isolates the original decision from mutations inside the persistence callback', async () => {
    const fixture = setup();
    fixture.options.record = async (phase, payload) => { if (phase === 'initial_commit') payload.data.winner = 'away'; return receipt(phase); };
    const result = await runMlbJudgment(fixture.options);
    expect(result.initial.winner).toBe('home');
    expect(result.stress.changed_side).toBe(false);
  });
});

describe('MLB sporting outcome, structured expectations and price boundaries', () => {
  it('allows an evidence-based sporting change before the price stage and preserves both views', async () => {
    const revised = { ...stress(), winner: 'away', ticket_id: 'away-moneyline', changed_side: true,
      revision_evidence: [{ source: 'targeted_research', evidence: 'The dated announcement confirms a workload restriction.', effect_on_baseball_view: 'The newly confirmed workload changes the expected full-game pitching sequence.' }] };
    const fixture = setup({ second: revised, third: { ...price(), ticket_id: 'away-moneyline' } });
    const result = await runMlbJudgment(fixture.options);
    expect(result.initial.winner).toBe('home');
    expect(result.stress.winner).toBe('away');
    expect(result.final_ticket.odds).toBe(130);
  });

  it('permits a decline while retaining the original sporting call and exact price', async () => {
    const fixture = setup({ third: { ...price(), decision: 'decline', reason: 'The unresolved sporting assumption leaves me unwilling to endorse the ticket at this price.' } });
    const result = await runMlbJudgment(fixture.options);
    expect(result.winners_eligible).toBe(false);
    expect(result.final_ticket).toEqual(input().allowedTickets[0]);
    expect(fixture.record.mock.calls.at(-1)[1].data.decision).toBe('decline');
  });

  it('allows +1.5 on the other side of the outright winner when that cover is the expected outcome', async () => {
    const fixtureInput = { ...input(), ...buildMlbJudgmentTickets({ ...game, moneyline_home: -210 }, 'Home Club', 'Away Club') };
    const fixture = setup({ fixture: fixtureInput, first: { ...initial(), ticket_id: 'away-spread' }, second: { ...stress(), ticket_id: 'away-spread' }, third: { ...price(), ticket_id: 'away-spread' } });
    const result = await runMlbJudgment(fixture.options);
    expect(result.stress.winner).toBe('home');
    expect(result.final_ticket).toMatchObject({ side: 'away', line: 1.5 });
  });

  it.each([
    ['missing whole-game phase', value => { delete value.expectations.finish; }],
    ['empty disconfirming observation', value => { value.expectations.middle.disconfirming_observation = ''; }],
    ['missing opposing case', value => { value.strongest_opposing_case = null; }],
    ['unknown expectation question', value => { value.factual_questions[0].expectation_id = 'price'; }],
    ['duplicate question id', value => { value.factual_questions.push({ ...value.factual_questions[0] }); }],
    ['three research questions', value => { value.factual_questions.push({ ...value.factual_questions[0], id: 'q2' }, { ...value.factual_questions[0], id: 'q3' }); }],
    ['unknown ticket', value => { value.ticket_id = 'home-total'; }],
    ['ML side is not expected winner', value => { value.winner = 'away'; }],
    ['probability substituted for judgment', value => { value.probability = 0.51; }],
  ])('rejects an initial judgment with %s before recording or researching', async (_label, mutate) => {
    const first = initial(); mutate(first);
    const fixture = setup({ first });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('MLB judgment');
    expect(fixture.record).not.toHaveBeenCalled();
    expect(fixture.research).not.toHaveBeenCalled();
  });

  it('rejects a -1.5 outcome when its team is not the expected winner', async () => {
    const fixtureInput = { ...input(), ...buildMlbJudgmentTickets({ ...game, moneyline_home: -210 }, 'Home Club', 'Away Club') };
    const fixture = setup({ fixture: fixtureInput, first: { ...initial(), winner: 'away', ticket_id: 'home-spread' } });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('contradicts the expected ticket outcome');
  });

  it.each([
    ['undeclared side change', value => { value.winner = 'away'; value.ticket_id = 'away-moneyline'; }],
    ['false declared side change', value => { value.changed_side = true; }],
    ['non-boolean change declaration', value => { value.changed_side = 'false'; }],
    ['side change with no evidence', value => { value.winner = 'away'; value.ticket_id = 'away-moneyline'; value.changed_side = true; }],
    ['price-driven revision', value => { value.winner = 'away'; value.ticket_id = 'away-moneyline'; value.changed_side = true; value.revision_evidence = [{ source: 'price', evidence: '+130', effect_on_baseball_view: 'Payout' }]; }],
    ['missing alternative scenario', value => { value.strongest_alternative.scenario = ''; }],
  ])('rejects a stress test with %s before price assessment', async (_label, mutate) => {
    const second = stress(); mutate(second);
    const fixture = setup({ second });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('MLB judgment');
    expect(fixture.ask).toHaveBeenCalledTimes(2);
    expect(fixture.record.mock.calls.map(call => call[0])).toEqual(['initial_commit', 'factual_research']);
  });

  it('rejects a revision attributed to research that did not complete', async () => {
    const second = { ...stress(), winner: 'away', ticket_id: 'away-moneyline', changed_side: true,
      revision_evidence: [{ source: 'targeted_research', evidence: 'Claimed verification', effect_on_baseball_view: 'Claimed effect' }] };
    const fixture = setup({ second, researchAnswer: null });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('unavailable targeted research');
  });

  it.each([
    ['side switch', { ...price(), ticket_id: 'away-moneyline' }],
    ['market switch', { ...price(), ticket_id: 'home-spread' }],
    ['invented repricing', { ...price(), odds: -120 }],
    ['extra outcome change', { ...price(), winner: 'away' }],
    ['missing endorsement reason', { ...price(), reason: '' }],
    ['extra investigation loop', { ...price(), decision: 'investigate' }],
  ])('rejects a price-stage %s without a final receipt', async (_label, third) => {
    const fixture = setup({ third });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('MLB judgment');
    expect(fixture.record.mock.calls.map(call => call[0])).toEqual(['initial_commit', 'factual_research', 'stress_test']);
  });

  it.each(['not JSON', '[]', 'null', 'A pick first\n{"winner":"home"}', '```json\n{}\n```'])('fails closed on malformed model response %s', async response => {
    const fixture = setup(); fixture.options.ask = async () => response;
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('MLB judgment');
    expect(fixture.record).not.toHaveBeenCalled();
  });

  it('accepts a complete fenced JSON response through the same-session text adapter', async () => {
    const fixture = setup();
    const answers = [initial(), stress(), price()];
    fixture.options.ask = async () => ({ text: `\`\`\`json\n${JSON.stringify(answers.shift())}\n\`\`\`` });
    expect((await runMlbJudgment(fixture.options)).price.decision).toBe('endorse');
  });

  it.each([
    ['empty menu', value => { value.allowedTickets = []; }],
    ['capped moneyline', value => { value.allowedTickets[0].odds = -180; }],
    ['string odds', value => { value.allowedTickets[0].odds = '-150'; }],
    ['duplicate side', value => { value.allowedTickets[1].side = 'home'; }],
    ['duplicate id', value => { value.allowedTickets[1].id = value.allowedTickets[0].id; }],
    ['new market', value => { value.allowedTickets[0].type = 'total'; }],
  ])('rejects input containing %s before any model call', async (_label, mutate) => {
    const fixtureInput = input(); mutate(fixtureInput);
    const fixture = setup({ fixture: fixtureInput });
    await expect(runMlbJudgment(fixture.options)).rejects.toThrow('MLB judgment');
    expect(fixture.ask).not.toHaveBeenCalled();
  });
});
