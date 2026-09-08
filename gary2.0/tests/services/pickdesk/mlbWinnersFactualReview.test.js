import { describe, expect, it, vi } from 'vitest';
import { reviewPick, reviewProp, REVIEW_POLICY_VERSION } from '../../../src/services/pickdesk/winnersReviewer.js';
import { GAME_ML_CAP } from '../../../src/services/agentic/orchestrator/orchestratorConfig.js';
import {
  MLB_REVIEW_POLICY_VERSION, MLB_FACTUAL_REVIEW_SYSTEM, buildMlbFactualAsk,
  mlbFactualVerdict, parseMlbFactualReview, reviewMlbFactualPick,
} from '../../../src/services/pickdesk/mlbWinnersFactualReview.js';

const START = Date.parse('2026-09-08T18:00:00Z');
const now = () => START;
const input = {
  reviewPolicyVersion: MLB_REVIEW_POLICY_VERSION, league: 'MLB', gameDate: '2026-09-08', gameId: '1042',
  homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', pickIsHome: true,
  pickText: 'Red Sox ML', odds: -118, betType: 'moneyline',
  deskText: 'ORIGINAL DESK: Boston starter A threw 91 pitches on September 3. Dated 2026 samples and Seattle opposing bullpen information.',
  caseHome: 'ORIGINAL HOME CASE', caseAway: 'ORIGINAL AWAY CASE',
  rationale: 'ORIGINAL CARD: Boston is my expected winner on the supplied matchup evidence. Their starter can handle a normal workload.',
  observedAt: '2026-09-08T17:55:00Z', commenceTime: '2026-09-08T23:10:00Z',
};
const yes = evidence => ({ answer: 'yes', evidence });
const source = () => ({ url: 'https://www.mlb.com/news/september-8-pregame', published_at: '2026-09-08T16:00:00Z', evidence: 'Starter A is confirmed; no reported workload restriction.' });
const answer = () => ({
  facts: [{ claim: 'Starter A threw 91 pitches on September 3.', decisive: true, status: 'supported', evidence: 'The dated pitching log lists 91 pitches.', source: 'Original source desk, pitching log September 3, 2026.' }],
  facts_review_complete: yes('All decisive present and historical premises were checked against their original samples.'),
  ticket_alignment: yes('The original card expects Boston to win outright, matching the moneyline.'),
  news_checked: yes('The dated pregame starter report confirms no new material contradiction.'),
  news_sources: [source()],
  opposing_case: { strongest_point: 'Seattle has rested relievers.', response_in_original: 'The original card weighs Boston starter and lineup evidence.', remaining_doubt: 'Seattle could still get to the starter.' },
  forecast_risks: ['Whether the starter pitches well and the offense converts chances remains uncertain.'],
  clarification_needs: [], decided_by: 'The original factual premises are supported.',
});
const missing = () => {
  const object = answer();
  object.facts.push({ claim: 'Starter A has no announced pitch restriction today.', decisive: true, status: 'unverified', evidence: 'The original case asserts unrestricted availability but the desk has no current report.', source: 'Original card; current restriction status not established.' });
  object.clarification_needs.push({ claim: object.facts[1].claim, question: 'Did Boston announce a pitch restriction for Starter A on September 8?', why_decisive: 'The original card explicitly relies on unrestricted availability.', source_needed: 'Dated team or MLB pregame report.' });
  return object;
};
const clarified = (object = missing(), status = 'supported') => ({ results: [{ claim: object.clarification_needs[0].claim, question: object.clarification_needs[0].question, status, evidence: status === 'supported' ? 'The dated team report states there is no restriction.' : 'The status remains unavailable.', sources: status === 'unverified' ? [] : [source()] }] });
const response = object => ({ success: true, data: JSON.stringify(object) });
const runner = (...objects) => {
  const oneShot = vi.fn();
  for (const object of objects) oneShot.mockResolvedValueOnce(response(object));
  return oneShot;
};
const run = (oneShot, changes = {}, options = {}) => reviewPick({ ...input, ...changes }, { oneShot, now, ...options });

describe('MLB factual policy routing and substantive review', () => {
  it('checks original evidence once with Sol while normal forecast risks and absent price prose do not gate', async () => {
    const oneShot = runner(answer());
    const out = await run(oneShot);
    expect(out).toMatchObject({ ok: true, status: 'qualified', verdict: 'STRONG', policy_version: MLB_REVIEW_POLICY_VERSION, model: 'codex-gpt-5.6-sol' });
    expect(out.review).toMatchObject({ schema_version: 3, league: 'MLB', eligibility_only: true, clarification_attempt: null, supplemental_evidence: [] });
    expect(out.review.forecast_risks).toHaveLength(1);
    expect(out.review.ticket).toMatchObject({ pick_text: input.pickText, odds: input.odds });
    expect(out.review.ticket).toMatchObject({ game_date: input.gameDate, league: input.league, game_id: input.gameId,
      home_team: input.homeTeam, away_team: input.awayTeam, commence_time: input.commenceTime });
    expect(out.review.card).toBeUndefined();
    expect(oneShot).toHaveBeenCalledTimes(1);
    expect(oneShot.mock.calls[0][1]).toMatchObject({ model: 'gpt-5.6-sol', search: true, effort: 'high', breakerKey: 'codex-review' });
    for (const original of [input.deskText, input.rationale, input.caseHome, input.caseAway, input.commenceTime]) expect(oneShot.mock.calls[0][0]).toContain(original);
    expect(MLB_FACTUAL_REVIEW_SYSTEM).toContain('Price justification');
  });

  it('retains legacy routing by default and refuses v3 for props or other sports', async () => {
    const oldCall = vi.fn().mockResolvedValue({ success: false, error: 'fixture stop' });
    const old = await run(oldCall, { reviewPolicyVersion: REVIEW_POLICY_VERSION });
    expect(old.policy_version).toBe(REVIEW_POLICY_VERSION);
    expect(old.error).toBe('blind read: fixture stop');
    const oneShot = vi.fn();
    expect((await run(oneShot, { league: 'NFL' })).status).toBe('unavailable');
    expect((await reviewProp(input, { oneShot, now })).status).toBe('unavailable');
    expect((await run(oneShot, { reviewPolicyVersion: 'future-unknown-policy' })).error).toBe('unsupported explicit review policy');
    expect(oneShot).not.toHaveBeenCalled();
    expect(mlbFactualVerdict({ schema_version: 2, policy_version: REVIEW_POLICY_VERSION }).status).toBe('unavailable');
  });

  it('reviews signed run-line outcomes without requiring the +1.5 side to win outright', async () => {
    const ask = buildMlbFactualAsk({ ...input, betType: 'spread', betLine: 1.5 }, new Date(START).toISOString());
    expect(ask).toContain('A +1.5 pick need not predict an outright upset.');
    expect(ask).toContain('An outright-win argument alone does not establish a two-run-margin argument.');
    expect(ask).toContain('The existing house moneyline limit remains in force');
    const out = await run(runner(answer()), { betType: 'spread', betLine: 1.5, pickText: 'Red Sox +1.5' });
    expect(out.review.ticket.line).toBe(1.5);
    const mismatch = answer();
    mismatch.ticket_alignment = { answer: 'no', evidence: 'The original argument only picks Boston to win; it does not address a two-run margin.' };
    expect((await run(runner(mismatch), { betType: 'spread', betLine: -1.5, pickText: 'Red Sox -1.5' })).status).toBe('rejected');
    expect((await run(runner(answer()), { betType: 'spread', pickText: 'Red Sox -1.5' })).review.ticket.line).toBe(-1.5);
  });

  it('keeps known false decisive claims rejected without requesting a better narrative', async () => {
    const object = missing();
    object.facts[0].status = 'contradicted';
    object.facts[0].evidence = 'The pitching log says 31 pitches, contradicting the asserted 91.';
    const oneShot = runner(object);
    const out = await run(oneShot);
    expect(out.status).toBe('rejected');
    expect(out.decided_by).toContain('decisive factual contradiction');
    expect(oneShot).toHaveBeenCalledTimes(1);
  });

  it('does not turn an incidental unknown fact or unanswered sporting objection into rejection', async () => {
    const object = missing();
    object.facts[1].decisive = false;
    object.clarification_needs = [];
    object.opposing_case.response_in_original = 'not addressed';
    const oneShot = runner(object);
    expect((await run(oneShot)).status).toBe('qualified');
    expect(oneShot).toHaveBeenCalledTimes(1);
  });

  it('refuses incomplete or postdated factual verification and never promotes historical schemas', async () => {
    for (const edit of [object => { object.facts = []; }, object => { object.facts[0].source = ''; }, object => { object.facts_review_complete.answer = 'unknown'; }, object => { object.news_sources = []; }, object => { object.news_sources[0].published_at = '2026-09-09'; }, object => { object.news_checked.answer = 'unknown'; }]) {
      const object = answer(); edit(object);
      expect((await run(runner(object))).status).toBe('unavailable');
    }
    expect(parseMlbFactualReview('not json')).toBeNull();
    expect(parseMlbFactualReview('{}')).toBeNull();
    expect((await run(runner({}))).error).toBe('factual review: unparseable answer');
    const { review } = await run(runner(answer()));
    expect(mlbFactualVerdict({ ...review, review_completed_at: input.commenceTime }).status).toBe('unavailable');
    expect(mlbFactualVerdict({ ...review, review_started_at: input.commenceTime }).status).toBe('unavailable');
  });
});

describe('one bounded, dated MLB factual clarification', () => {
  it('resolves a concrete question and preserves original findings, ticket and separate supplemental citations', async () => {
    const object = missing();
    const original = structuredClone(input);
    const oneShot = runner(object, clarified(object));
    const out = await run(oneShot);
    expect(out.status).toBe('qualified');
    expect(oneShot).toHaveBeenCalledTimes(2);
    expect(out.review.initial_review.facts[1].status).toBe('unverified');
    expect(out.review.facts[1]).toMatchObject({ status: 'supported', evidence_origin: 'supplemental_clarification' });
    expect(out.review.clarification_attempt).toMatchObject({ status: 'completed', started_at: new Date(START).toISOString(), completed_at: new Date(START).toISOString() });
    expect(out.review.supplemental_evidence[0]).toMatchObject({ claim: object.facts[1].claim, observed_at: new Date(START).toISOString(), sources: [source()] });
    expect(out.clarification_needs).toEqual([]);
    expect(input).toEqual(original);
    expect(out.review.ticket).toMatchObject({ pick_text: input.pickText, odds: input.odds });
    expect(oneShot.mock.calls[1][0]).toContain(object.clarification_needs[0].question);
    expect(oneShot.mock.calls[1][0]).toContain('Do not generate a new pick');
    expect(oneShot.mock.calls[1][0]).toContain(input.rationale);
  });

  it('can discover a real contradiction during clarification instead of retrying until pass', async () => {
    const object = missing();
    const second = clarified(object, 'contradicted');
    second.results[0].evidence = 'The team announced a 45-pitch limit.';
    const oneShot = runner(object, second);
    const out = await run(oneShot);
    expect(out.status).toBe('rejected');
    expect(out.review.initial_review.facts[1].status).toBe('unverified');
    expect(out.review.facts[1].status).toBe('contradicted');
    expect(oneShot).toHaveBeenCalledTimes(2);
  });

  it('cannot retroactively validate an initial future-dated news source when clarification finishes later', async () => {
    let clock = START;
    const object = missing();
    object.news_sources[0].published_at = '2026-09-08T18:01:00Z';
    const second = clarified(object);
    second.results[0].sources[0].published_at = '2026-09-08T18:01:00Z';
    const oneShot = vi.fn().mockImplementationOnce(async () => response(object))
      .mockImplementationOnce(async () => { clock = START + 120_000; return response(second); });
    const out = await run(oneShot, {}, { now: () => clock });
    expect(oneShot).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ status: 'unavailable', decided_by: 'initial current-news sources lack verified dates at their observation time' });
    expect(out.review.initial_review.completed_at).toBe('2026-09-08T18:00:00.000Z');
    expect(out.review.review_completed_at).toBe('2026-09-08T18:02:00.000Z');
    expect(out.review.initial_review.news_sources[0].published_at).toBe('2026-09-08T18:01:00Z');
  });

  it('validates supplemental sources against their own observation stage, not the initial or overall cutoff', async () => {
    let clock = START;
    const object = missing();
    const second = clarified(object);
    second.results[0].sources[0].published_at = '2026-09-08T18:01:00Z';
    const oneShot = vi.fn().mockImplementationOnce(async () => response(object))
      .mockImplementationOnce(async () => { clock = START + 120_000; return response(second); });
    const out = await run(oneShot, {}, { now: () => clock });
    expect(out.status).toBe('qualified');
    expect(out.review.supplemental_evidence[0].observed_at).toBe('2026-09-08T18:02:00.000Z');
    const earlierObservation = structuredClone(out.review);
    earlierObservation.supplemental_evidence[0].observed_at = '2026-09-08T18:00:00.000Z';
    expect(mlbFactualVerdict(earlierObservation)).toMatchObject({ status: 'unavailable', decided_by: 'supplemental factual sources lack valid observation times' });
    const missingInitialObservation = structuredClone(out.review);
    delete missingInitialObservation.initial_review.completed_at;
    expect(mlbFactualVerdict(missingInitialObservation).status).toBe('unavailable');
  });

  it('keeps unanswered questions explicit after the single follow-up', async () => {
    const object = missing();
    const oneShot = runner(object, clarified(object, 'unverified'));
    const out = await run(oneShot);
    expect(out.status).toBe('unavailable');
    expect(out.clarification_needs).toEqual(object.clarification_needs);
    expect(out.review.supplemental_evidence).toEqual([]);
    expect(oneShot).toHaveBeenCalledTimes(2);
  });

  it('refuses unrelated answers, changed questions, duplicate claims and late or absent citations', async () => {
    for (const change of [result => { result.claim = 'A different premise'; }, result => { result.question = 'Will Boston win?'; }, result => { result.sources[0].published_at = '2026-09-09'; }, result => { result.sources = []; }]) {
      const second = clarified(); change(second.results[0]);
      const oneShot = runner(missing(), second);
      const out = await run(oneShot);
      expect(out.status).toBe('unavailable');
      expect(out.review.facts[1].status).toBe('unverified');
      expect(out.review.clarification_attempt.status).toBe('unavailable');
      expect(oneShot).toHaveBeenCalledTimes(2);
    }
    const duplicate = clarified(); duplicate.results.push(duplicate.results[0]);
    expect((await run(runner(missing(), duplicate))).status).toBe('unavailable');
  });

  it('retains original questions if the clarification tool fails without a third call', async () => {
    const oneShot = runner(missing()).mockRejectedValueOnce(new Error('search offline'));
    const out = await run(oneShot);
    expect(out.status).toBe('unavailable');
    expect(out.review.clarification_attempt).toMatchObject({ status: 'unavailable', reason: 'search offline' });
    expect(out.clarification_needs[0].question).toBe(missing().clarification_needs[0].question);
    expect(oneShot).toHaveBeenCalledTimes(2);
  });

  it('does not invent a clarification when the model has no concrete decisive question', async () => {
    const object = missing(); object.clarification_needs = [];
    const oneShot = runner(object);
    expect((await run(oneShot)).status).toBe('unavailable');
    expect(oneShot).toHaveBeenCalledTimes(1);
  });

  it('honors a shared timeout budget and reports insufficient runway with the question intact', async () => {
    let clock = START;
    const oneShot = vi.fn(async () => { clock += 350_000; return response(missing()); });
    const out = await run(oneShot, {}, { now: () => clock });
    expect(out.status).toBe('unavailable');
    expect(out.review.clarification_attempt).toMatchObject({ status: 'not_attempted', reason: 'insufficient pregame runway or shared review budget' });
    expect(out.clarification_needs).toHaveLength(1);
    expect(oneShot).toHaveBeenCalledTimes(1);
    expect(oneShot.mock.calls[0][1].timeoutMs).toBeLessThan(360_000);
  });

  it('does not accept a clarification that finishes after kickoff', async () => {
    let clock = START;
    const oneShot = vi.fn().mockImplementationOnce(async () => response(missing()))
      .mockImplementationOnce(async () => { clock = START + 60_000; return response(clarified()); });
    const out = await run(oneShot, { commenceTime: new Date(START + 50_000).toISOString() }, { now: () => clock });
    expect(out).toMatchObject({ ok: false, status: 'unavailable', error: 'clarification completed after kickoff' });
    expect(out.review.initial_review.facts[1].status).toBe('unverified');
    expect(out.review.supplemental_evidence).toEqual([]);
  });

  it('validates policy, exact ticket and pregame source times before model calls', async () => {
    const oneShot = vi.fn();
    for (const changes of [{ gameId: null }, { gameDate: null }, { odds: null }, { odds: -118.5 }, { betType: 'total' }, { betType: 'spread', pickText: 'Boston' }, { deskText: '' }, { pickIsHome: null }, { observedAt: 'bad time' }, { observedAt: '2026-09-09' }, { commenceTime: new Date(START + 10_000).toISOString() }]) {
      expect((await run(oneShot, changes)).status).toBe('unavailable');
    }
    expect((await reviewMlbFactualPick({ ...input, reviewPolicyVersion: REVIEW_POLICY_VERSION }, { oneShot, now })).status).toBe('unavailable');
    expect(oneShot).not.toHaveBeenCalled();
  });

  it('preserves the moneyline house cap without substituting a run line or another side', async () => {
    const oneShot = vi.fn();
    const out = await run(oneShot, { odds: GAME_ML_CAP - 1 });
    expect(out).toMatchObject({ status: 'unavailable', error: 'original moneyline exceeds the existing house limit; it cannot be substituted during review' });
    expect(oneShot).not.toHaveBeenCalled();
    expect((await run(runner(answer()), { odds: GAME_ML_CAP })).status).toBe('qualified');
    expect((await run(runner(answer()), { betType: 'spread', betLine: -1.5, pickText: 'Red Sox -1.5', odds: -110 })).review.ticket)
      .toMatchObject({ bet_type: 'spread', line: -1.5, pick_text: 'Red Sox -1.5' });
  });
});
