import { describe, expect, it } from 'vitest';
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

describe('MLB judgment reply one bracket short', () => {
  it('closes the open brackets of a reply that stopped early and parses the whole content', async () => {
    const { closeOpenJson } = await import('../../../src/services/agentic/orchestrator/mlbJudgment.js');
    const reply = '{"winner":"home","expectations":{"items":[{"view":"a } inside \\"quotes\\""}]}';
    const closed = closeOpenJson(reply);
    expect(closed.endsWith('}]}}')).toBe(true);
    expect(JSON.parse(closed).expectations.items[0].view).toBe('a } inside "quotes"');
    // Complete JSON and a reply cut inside a string pass through unchanged.
    expect(closeOpenJson('{"a":1}')).toBe('{"a":1}');
    expect(closeOpenJson('{"a":"unterminated')).toBe('{"a":"unterminated');
  });
});
