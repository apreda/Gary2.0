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
