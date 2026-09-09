import { describe, expect, it, vi } from 'vitest';
import { firstJsonObject } from '../../../src/services/agentic/orchestrator/mlbJudgment.js';

// Sep 9 2026: the Claude bridge's first staged MLB judgment on the cascade
// returned valid JSON inside prose and the game fell through to the unfunded
// API rungs. The parser now takes the one complete object a reply carries.
describe('MLB judgment reply parsing', () => {
  it('finds the complete top-level object inside prose and fences', () => {
    const reply = 'Here is my recorded judgment:\n```json\n{"winner":"home","ticket_id":"t1","whole_game_view":"the Tigers\' {bullpen} holds a \\"lead\\"","expectations":{"a":1}}\n```\nRecorded.';
    const json = firstJsonObject(reply);
    expect(JSON.parse(json)).toMatchObject({ winner: 'home', ticket_id: 't1', expectations: { a: 1 } });
  });

  it('honours strings and escapes so an inner brace cannot end the object early', () => {
    const reply = 'x {"view":"} not the end {","n":{"deep":true}} trailing }';
    expect(JSON.parse(firstJsonObject(reply))).toEqual({ view: '} not the end {', n: { deep: true } });
  });

  it('returns null when no complete object exists', () => {
    expect(firstJsonObject('no object here')).toBeNull();
    expect(firstJsonObject('{"unterminated": true')).toBeNull();
  });
});

describe('MLB judgment reply repair', () => {
  it('escapes raw line breaks inside JSON strings and leaves structure alone', async () => {
    const { repairJsonText } = await import('../../../src/services/agentic/orchestrator/mlbJudgment.js');
    const reply = '{"winner":"home","whole_game_view":"I expect the Tigers to win.\nThe pen holds.\tTabbed","expectations":{"a":"x\r\ny"}}';
    const parsed = JSON.parse(repairJsonText(reply));
    expect(parsed.whole_game_view).toBe('I expect the Tigers to win.\nThe pen holds.\tTabbed');
    expect(parsed.expectations.a).toBe('x\r\ny');
    // Already-valid JSON passes through unchanged.
    const valid = '{"k":"a\\nb","n":{"deep":true}}';
    expect(repairJsonText(valid)).toBe(valid);
  });
});

describe('MLB judgment shape contract (Sep 9 2026)', () => {
  const exp = { claim: 'c', evidence: 'e', disconfirming_observation: 'd' };
  const expectations = { opening: exp, middle: exp, finish: exp, offense: exp };
  const input = {
    gameId: '5059953', gameDate: '2026-09-09', homeTeam: 'Tigers', awayTeam: 'Twins', gameKind: 'moneyline',
    allowedTickets: [
      { id: 'home-moneyline', side: 'home', type: 'moneyline', line: null, odds: -132, pick: 'Tigers ML -132' },
      { id: 'away-moneyline', side: 'away', type: 'moneyline', line: null, odds: 112, pick: 'Twins ML +112' },
    ],
  };
  const good = { winner: 'home', ticket_id: 'home-moneyline', whole_game_view: 'v', expectations, strongest_opposing_case: 's', uncertain_assumption: 'u', factual_questions: [] };
  // The Sep 9 bridge reply: the three trailing fields nested inside expectations.
  const misnested = { winner: 'home', ticket_id: 'home-moneyline', whole_game_view: 'v', expectations: { ...expectations, strongest_opposing_case: 's', uncertain_assumption: 'u', factual_questions: [] } };
  const stress = { winner: 'home', ticket_id: 'home-moneyline', whole_game_view: 'v', expectations, strongest_alternative: { scenario: 's', effect_on_expected_outcome: 'e', response: 'r' }, changed_side: false, revision_evidence: [] };
  const price = { ticket_id: 'home-moneyline', decision: 'endorse', reason: 'r' };
  const record = async (phase) => ({ ok: true, run_id: 'run-1', phase, payload_sha256: 'sha', recorded_at: new Date().toISOString() });

  it('asks once more, in the same session, when a reply is not the requested shape', async () => {
    const { runMlbJudgment } = await import('../../../src/services/agentic/orchestrator/mlbJudgment.js');
    const replies = [JSON.stringify(misnested), JSON.stringify(good), JSON.stringify(stress), JSON.stringify(price)];
    const prompts = [];
    const ask = vi.fn(async (prompt) => { prompts.push(prompt); return replies.shift(); });
    const result = await runMlbJudgment({ input, ask, research: vi.fn(), record });
    expect(ask).toHaveBeenCalledTimes(4);
    expect(prompts[1]).toContain('did not satisfy the required shape');
    expect(prompts[1]).toContain('initial judgment has an invalid schema');
    expect(result.initial.winner).toBe('home');
    expect(prompts[0]).toContain('exactly these seven top-level keys');
  });

  it('fails the brain after one correction, never a third ask for the same step', async () => {
    const { runMlbJudgment } = await import('../../../src/services/agentic/orchestrator/mlbJudgment.js');
    const ask = vi.fn(async () => JSON.stringify(misnested));
    await expect(runMlbJudgment({ input, ask, research: vi.fn(), record })).rejects.toThrow(/invalid schema/);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
