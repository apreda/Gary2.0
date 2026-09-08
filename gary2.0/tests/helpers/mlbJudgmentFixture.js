import { MLB_EXPECTATION_IDS, MLB_JUDGMENT_PHASES } from '../../src/services/agentic/orchestrator/mlbJudgment.js';
import { pickSideOf } from '../../src/services/closingLine.js';

/** A complete synthetic journal; no model calls, storage or production records. */
export function mlbJudgmentFixture(pick, { gameDate = '2026-09-08', recordedAt = '2026-09-08T16:00:00Z' } = {}) {
  const side = pickSideOf(pick), type = pick.type || 'moneyline';
  const opposite = side === 'home' ? 'away' : 'home';
  const line = type === 'spread' ? pick.spread ?? pick.line : null;
  const final_ticket = { id: `${side}-${type}`, side, type, line, odds: pick.odds, pick: pick.pick };
  const allowedTickets = [final_ticket, { id: `${opposite}-${type}`, side: opposite, type, line: type === 'spread' ? -line : null, odds: -110,
    pick: `${opposite === 'home' ? pick.homeTeam : pick.awayTeam} ${type === 'spread' ? -line : 'ML'}` }];
  const expectations = Object.fromEntries(MLB_EXPECTATION_IDS.map(id => [id, { claim: `Original ${id} expectation`, evidence: `Original evidence for ${id}`, disconfirming_observation: `A specific contrary ${id} event` }]));
  const initial = { winner: side, ticket_id: final_ticket.id, whole_game_view: 'Original full-game baseball judgment.', expectations,
    strongest_opposing_case: 'The other side has a documented path through the middle innings.', uncertain_assumption: 'The announced lineup stays intact.', factual_questions: [] };
  const stress = { winner: side, ticket_id: final_ticket.id, whole_game_view: 'The current full-game judgment survives this specific alternative.', expectations: structuredClone(expectations),
    strongest_alternative: { scenario: 'The starter exits unusually early.', effect_on_expected_outcome: 'The middle-inning sequence could reverse the outcome.', response: 'The original full-game evidence supports the expectation while leaving that risk unresolved.' }, changed_side: false, revision_evidence: [] };
  const price = { ticket_id: final_ticket.id, decision: pick.price_endorsement || 'endorse', reason: 'The exact ticket assessment after the sporting view.' };
  return { schema_version: 1, policy_version: 'mlb-judgment-v2', odds_visibility: 'odds_visible', odds_visible: true, run_id: pick.judgment_run_id,
    game_id: pick.game_id, game_date: gameDate, home_team: pick.homeTeam, away_team: pick.awayTeam, gameKind: type === 'spread' ? 'runline' : 'moneyline', allowedTickets,
    initial, research: { status: 'not_requested', questions: [], results: null }, stress, price, final_ticket, winners_eligible: price.decision === 'endorse',
    receipts: Object.fromEntries([...MLB_JUDGMENT_PHASES, 'published'].map((phase, index) => [phase, { ok: true, run_id: pick.judgment_run_id, phase, event_id: index + 1,
      payload_sha256: `test-only-${phase}`, recorded_at: new Date(Date.parse(recordedAt) + index * 1000).toISOString() }])) };
}
