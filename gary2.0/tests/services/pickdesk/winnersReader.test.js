import { describe, it, expect } from 'vitest';
import { readerPacket, parseRead, readCandidate, buildReadAsk, readerChecklist, readNext, READER_SYSTEM } from '../../../src/services/pickdesk/winnersReader.js';

const game = (over = {}) => ({ id: 1, kind: 'game', league: 'MLB', game_date: '2026-09-25', game_id: 'g1', pick_text: 'Tigers ML -134', odds: -134,
  commence_time: '2026-09-25T23:00:00Z', lease_until: '2026-09-25T20:15:00Z', attempts: 1,
  pick_snapshot: { rationale: 'Skubal has gone six innings in eight straight.', confidence: 0.7, homeTeam: 'Tigers', awayTeam: 'Guardians' },
  evidence_snapshot: { observedAt: '2026-09-25T18:00:00Z', deskText: 'Official: Skubal six innings in eight straight starts.', caseHome: 'Detroit case', caseAway: 'Cleveland case' }, ...over });
const answer = (assessment = 'clear') => ({ assessment, reason: 'The record shows the length edge.', opposing_case: 'Cleveland pen is rested.',
  source_quote: 'six innings in eight straight starts', rationale_quote: 'six innings in eight straight', reasons: [{ claim: 'a', why: 'b' }, { claim: 'c', why: 'd' }] });
const clock = () => Date.parse('2026-09-25T19:00:00Z');

describe('the Winners reader', () => {
  it('shows the cases before the ticket, never the confidence, and marks undated evidence unavailable', () => {
    const p = readerPacket(game());
    expect(JSON.stringify(p)).not.toContain('0.7');
    expect(p.cases.map((c) => c.club)).toEqual(['Guardians', 'Tigers']);
    const ask = buildReadAsk(game(), 'CHECKLIST');
    expect(ask.indexOf('Cleveland case')).toBeLessThan(ask.indexOf('Tigers ML -134'));
    expect(ask).toContain('THE QUESTIONS:\nCHECKLIST');
    for (const banned of ['rank', 'stake', 'coverage', 'quota', 'compare']) expect((READER_SYSTEM + ask).toLowerCase()).not.toContain(banned);
    expect(readerPacket(game({ evidence_snapshot: { deskText: 'x' } })).source_record).toBe('');
  });
  it("reads Adam's checklist files: one per league for games, one for props", () => {
    expect(readerChecklist('MLB', 'game')).toContain('PART 1');
    expect(readerChecklist('NFL', 'game').length).toBeGreaterThan(100);
    expect(readerChecklist('MLB', 'prop')).toContain('The exact line');
    expect(readerChecklist('XFL', 'game')).toBe('');
  });
  it('requires exact quotes for clear and lean, not for toss-up or unsupported', () => {
    expect(parseRead(answer(), game())?.assessment).toBe('clear');
    expect(parseRead({ ...answer('lean'), source_quote: 'made up' }, game())).toBeNull();
    expect(parseRead({ ...answer('toss_up'), source_quote: '' }, game())?.assessment).toBe('toss_up');
    expect(parseRead(answer('great'), game())).toBeNull();
    expect(parseRead({ ...answer(), reason: 'short' }, game())).toBeNull();
    expect(parseRead(JSON.stringify(answer('unsupported')), game({ evidence_snapshot: {} }))?.assessment).toBe('unsupported');
  });
  it('a record that does not fit is unavailable, never truncated; outside tools fail the read', async () => {
    const big = game(); big.evidence_snapshot.deskText += 'a'.repeat(20000);
    let calls = 0;
    const r = await readCandidate(big, { maxReadBytes: 10000, clock, oneShot: async () => { calls++; } });
    expect(r.ok).toBe(false); expect(r.error).toContain('not truncated'); expect(calls).toBe(0);
    const t = await readCandidate(game(), { clock, oneShot: async () => ({ success: true, data: JSON.stringify(answer()), raw: JSON.stringify({ type: 'item.completed', item: { type: 'command_execution' } }) }) });
    expect(t.ok).toBe(false); expect(t.error).toContain('outside');
    const late = await readCandidate(game({ commence_time: '2026-09-25T19:01:00Z' }), { clock, oneShot: async () => { calls++; } });
    expect(late.ok).toBe(false); expect(late.error).toContain('Insufficient time'); expect(calls).toBe(0);
  });
  it('grades a game with its reasons, and a prop from its desk and rationale alone', async () => {
    const g = await readCandidate(game(), { clock, oneShot: async (prompt) => { expect(prompt).toContain('THE CASES'); return { success: true, data: JSON.stringify(answer()), raw: '', model: 'gpt-5.6-sol' }; } });
    expect(g).toMatchObject({ ok: true, grade: 'clear', model: 'gpt-5.6-sol' }); expect(g.reasons).toHaveLength(2); expect(g.review).not.toHaveProperty('reasons');
    const prop = game({ kind: 'prop', pick_snapshot: { rationale: 'Skubal six innings in eight straight.', player: 'Tarik Skubal', bet: 'over', prop: 'pitcher_outs 17.5', line: 17.5 } });
    const r = await readCandidate(prop, { clock, oneShot: async (prompt) => { expect(prompt).not.toContain('THE CASES'); expect(prompt).toContain('A player prop.'); return { success: true, data: JSON.stringify({ ...answer('lean'), rationale_quote: 'six innings in eight straight' }), raw: '' }; } });
    expect(r.ok).toBe(true); expect(r.grade).toBe('lean');
  });
  it('claims one, reads it, and hands the grade to the gate; an empty queue is false', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push([name, args]); if (name === 'claim_winners_read') return { data: calls.length === 1 ? [game()] : [] }; return { data: { stored: true, status: 'graded', admitted: true, why: 'admitted' } }; } };
    const log = { log: () => {} };
    expect(await readNext(client, { log, read: async () => ({ ok: true, grade: 'clear', review: { reason: 'r' }, reasons: [{ claim: 'a', why: 'b' }, { claim: 'c', why: 'd' }], model: 'm', ms: 1200 }) })).toBe(true);
    expect(calls[1]).toEqual(['finish_winners_read', { p_id: 1, p_attempt: 1, p_grade: 'clear', p_review: { reason: 'r' }, p_reasons: [{ claim: 'a', why: 'b' }, { claim: 'c', why: 'd' }], p_model: 'm', p_ms: 1200 }]);
    expect(await readNext(client, { log, read: async () => { throw new Error('never'); } })).toBe(false);
  });
});
