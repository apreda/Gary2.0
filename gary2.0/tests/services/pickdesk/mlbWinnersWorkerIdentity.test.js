import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/supabaseClient.js', () => ({ supabaseAdmin: {} }));
import { winnersCandidate } from '../../../src/services/pickdesk/winnersAdmissions.js';
import { originalGameEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';
import { reviewCandidate } from '../../../scripts/run-winners-board.js';
import { mlbJudgmentFixture } from '../../helpers/mlbJudgmentFixture.js';

const now = Date.parse('2026-09-08T18:00:00Z');
function fixture(extra = {}) {
  const pick = { game_id: '42', league: 'MLB', pick: 'Red Sox ML', odds: -118, type: 'moneyline',
    homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners', commence_time: '2026-09-08T23:10:00Z',
    rationale: 'Original Boston judgment.', model: 'codex-gpt-6-astra', prompt_sha: 'judgment-era',
    decision_policy: 'mlb-judgment-v1', path_home: 'Original Boston case.', path_away: 'Original Seattle case.', ...extra };
  const evidence = originalGameEvidence({ pick: structuredClone(pick), deskText: 'ORIGINAL EXACT GAME DESK',
    result: { _evidenceObservedAt: '2026-09-08T17:55:00Z' } });
  return { id: 1, ...winnersCandidate({ date: '2026-09-08', league: 'MLB', kind: 'game', pick, evidence }) };
}

describe('MLB factual worker binds review to original game identity', () => {
  it('passes the complete original identity and evidence without changing its snapshot', async () => {
    const c = fixture(), before = structuredClone(c);
    const review = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    expect((await reviewCandidate(c, { now, gameReview: review })).status).toBe('qualified');
    expect(review).toHaveBeenCalledTimes(1);
    expect(review.mock.calls[0][0]).toMatchObject({ gameId: '42', gameDate: '2026-09-08', league: 'MLB',
      pickText: 'Red Sox ML', odds: -118, homeTeam: 'Boston Red Sox', awayTeam: 'Seattle Mariners',
      commenceTime: c.commence_time, pickIsHome: true, reviewPolicyVersion: 'mlb-conviction-v3',
      deskText: 'ORIGINAL EXACT GAME DESK', caseHome: 'Original Boston case.', caseAway: 'Original Seattle case.' });
    expect(c).toEqual(before);
  });

  it('keeps the Eastern game date when kickoff falls on the next UTC day', async () => {
    const c = fixture({ commence_time: '2026-09-09T02:10:00Z' });
    const review = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    expect((await reviewCandidate(c, { now, gameReview: review })).status).toBe('qualified');
    expect(review.mock.calls[0][0]).toMatchObject({ gameDate: '2026-09-08', commenceTime: c.commence_time });
  });

  it.each([
    ['another candidate game', c => { c.game_id = '999'; }],
    ['another candidate date', c => { c.game_date = '2026-09-09'; }],
    ['another candidate league', c => { c.league = 'NFL'; }],
    ['another candidate kind', c => { c.kind = 'prop'; }],
    ['changed candidate ticket', c => { c.pick_text = 'Mariners ML'; }],
    ['changed candidate price', c => { c.odds = 144; }],
    ['changed candidate start', c => { c.commence_time = '2026-09-08T23:40:00Z'; }],
    ['changed ticket fingerprint', c => { c.ticket_key = 'different'; }],
    ['changed market fingerprint', c => { c.market_key = 'different'; }],
    ['another snapshot game', c => { c.pick_snapshot.game_id = '999'; }],
    ['unstamped original policy', c => { delete c.pick_snapshot.decision_policy; }],
    ['another evidence game', c => { c.evidence_snapshot.pickSnapshot.game_id = '999'; }],
    ['changed original reasoning', c => { c.evidence_snapshot.pickSnapshot.rationale = 'Different decision.'; }],
    ['changed original model', c => { c.evidence_snapshot.pickSnapshot.model = 'another-model'; }],
    ['changed evidence policy', c => { c.evidence_snapshot.pickSnapshot.decision_policy = 'old'; }],
    ['changed evidence league', c => { c.evidence_snapshot.pickSnapshot.league = 'NFL'; }],
    ['changed evidence date', c => { c.evidence_snapshot.pickSnapshot.game_date = '2026-09-07'; }],
    ['changed evidence sides', c => { c.evidence_snapshot.homeTeam = 'New York Yankees'; }],
    ['changed evidence snapshot sides', c => { c.evidence_snapshot.pickSnapshot.homeTeam = 'New York Yankees'; }],
    ['changed evidence side selection', c => { c.evidence_snapshot.pickIsHome = false; }],
    ['changed evidence start', c => { c.evidence_snapshot.commenceTime = '2026-09-08T23:40:00Z'; }],
    ['changed evidence snapshot start', c => { c.evidence_snapshot.pickSnapshot.commence_time = '2026-09-08T23:40:00Z'; }],
    ['missing original envelope', c => { delete c.evidence_snapshot.snapshotVersion; }],
    ['missing observation time', c => { delete c.evidence_snapshot.observedAt; }],
    ['observation after review begins', c => { c.evidence_snapshot.observedAt = '2026-09-08T18:05:00Z'; }],
  ])('refuses %s before either reviewer runs', async (_label, change) => {
    const c = fixture(); change(c);
    const gameReview = vi.fn(), propReview = vi.fn();
    expect(await reviewCandidate(c, { now, gameReview, propReview })).toMatchObject({ ok: false, status: 'unavailable' });
    expect(gameReview).not.toHaveBeenCalled();
    expect(propReview).not.toHaveBeenCalled();
  });

  it('refuses contradictory signed lines between published and evidence snapshots', async () => {
    const c = fixture({ type: 'spread', spread: -1.5, pick: 'Red Sox -1.5' });
    c.evidence_snapshot.pickSnapshot.spread = 1.5;
    const review = vi.fn();
    expect((await reviewCandidate(c, { now, gameReview: review })).status).toBe('unavailable');
    expect(review).not.toHaveBeenCalled();
  });

  it('preserves historical desk-only review for old MLB policy', async () => {
    const c = fixture({ decision_policy: undefined });
    c.evidence_snapshot = { deskText: 'LEGACY ORIGINAL DESK', caseHome: 'Home case', caseAway: 'Away case' };
    const review = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    expect((await reviewCandidate(c, { now, gameReview: review })).status).toBe('qualified');
    expect(review.mock.calls[0][0].reviewPolicyVersion).toBe('exact-ticket-v2');
  });
});

describe('v4 worker gates new public decisions before review', () => {
  const staged = () => {
    const c = fixture({ decision_policy: 'mlb-judgment-v2', judgment_run_id: 'run-worker', price_endorsement: 'endorse', odds_visibility: 'odds_visible' });
    c.evidence_snapshot.mlbJudgment = mlbJudgmentFixture(c.pick_snapshot);
    return c;
  };
  it('passes the same complete prospective journal to factual review', async () => {
    const c = staged(), review = vi.fn(async () => ({ ok: true, status: 'qualified' }));
    expect(c.policy_version).toBe('mlb-conviction-v4');
    expect((await reviewCandidate(c, { now, gameReview: review })).status).toBe('qualified');
    expect(review.mock.calls[0][0]).toMatchObject({ reviewPolicyVersion: 'mlb-conviction-v4', mlbJudgment: c.evidence_snapshot.mlbJudgment });
  });
  it.each([
    ['journal missing', c => { delete c.evidence_snapshot.mlbJudgment; }],
    ['publication missing', c => { delete c.evidence_snapshot.mlbJudgment.receipts.published; }],
    ['receipt from a different run', c => { c.evidence_snapshot.mlbJudgment.receipts.stress_test.run_id = 'wrong'; }],
    ['price phase before stress', c => { c.evidence_snapshot.mlbJudgment.receipts.price_assessment.recorded_at = '2026-09-08T15:00:00Z'; }],
    ['wrong policy pairing', c => { c.policy_version = 'mlb-conviction-v3'; }],
    ['changed original final ticket', c => { c.evidence_snapshot.mlbJudgment.final_ticket.odds = 120; }],
    ['published after kickoff', c => { c.evidence_snapshot.mlbJudgment.receipts.published.recorded_at = c.commence_time; }],
  ])('rejects %s before reviewer inference', async (_label, mutate) => {
    const c = staged(); mutate(c); const review = vi.fn();
    expect((await reviewCandidate(c, { now, gameReview: review })).status).toBe('unavailable');
    expect(review).not.toHaveBeenCalled();
  });
  it('preserves the declined ordinary game call and avoids a factual call', async () => {
    const c = staged(); c.pick_snapshot.price_endorsement = 'decline'; c.evidence_snapshot.pickSnapshot.price_endorsement = 'decline';
    c.evidence_snapshot.mlbJudgment.price.decision = 'decline'; c.evidence_snapshot.mlbJudgment.winners_eligible = false;
    const before = structuredClone(c), review = vi.fn();
    expect((await reviewCandidate(c, { now, gameReview: review })).error).toContain('declined');
    expect(review).not.toHaveBeenCalled(); expect(c).toEqual(before);
  });
});
