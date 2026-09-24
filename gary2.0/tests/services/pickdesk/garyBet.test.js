import { describe, it, expect } from 'vitest';
import { buildBetAsk, parseBets, betRecord, BET_MIN_DOLLARS } from '../../../src/services/pickdesk/garyBet.js';

const t = [{ id: 'a', pick: 'Tigers ML -134', price: -134, matchup: 'Guardians @ Tigers', rationale: 'Skubal at home.', case_home: 'H', case_away: 'A' }];

describe("Gary's bet decision", () => {
  it("states the product facts and asks the bettor's question, with no rule for when to play", () => {
    const ask = buildBetAsk({ league: 'MLB', tickets: t, bankroll: { cash_on_hand_dollars: 8700, open_plays: [{ league: 'MLB', kind: 'game', pick_text: 'Rays ML -120', stake_dollars: 300 }] } });
    expect(ask).toContain('$8,700');
    expect(ask).toContain('Rays ML -120');
    expect(ask).toContain('$300');
    expect(ask).toContain('$100');
    expect(ask).toContain('no maximum');
    expect(ask.indexOf("THE AWAY SIDE'S CASE")).toBeLessThan(ask.indexOf("THE HOME SIDE'S CASE"));
    for (const banned of ['favorite', 'underdog', 'always play', 'never play', 'at least one', 'value bet', 'edge', 'expected value', '%']) {
      expect(ask.toLowerCase()).not.toContain(banned);
    }
  });
  it('says so when the balance is unavailable and nothing is at risk', () => {
    const ask = buildBetAsk({ league: 'MLB', tickets: t, bankroll: null });
    expect(ask).toContain('unavailable');
    expect(ask).toContain('Nothing at risk yet today.');
  });
  it('parses play with a whole-dollar stake at or above the minimum, and turns anything else into a pass', () => {
    const ok = parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 400, why: 'I like the arm.' }] }), t);
    expect(ok.get('a')).toEqual({ play: true, stake_dollars: 400, why: 'I like the arm.' });
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 50, why: 'x' }] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: '400', why: 'x' }] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 250.5, why: 'x' }] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 12000, why: 'all of it' }] }), t).get('a')).toMatchObject({ play: true, stake_dollars: 12000 });
    expect(parseBets('```json\n{"bets":[{"id":"a","play":true,"stake_dollars":150,"why":"fenced"}]}\n```', t).get('a')).toMatchObject({ play: true, stake_dollars: 150 });
    expect(parseBets('not json', t).get('a')).toEqual({ play: false, stake_dollars: null, why: '' });
    expect(parseBets(JSON.stringify({ bets: [] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'zzz', play: true, stake_dollars: 400, why: 'wrong id' }] }), t).get('a').play).toBe(false);
    expect(BET_MIN_DOLLARS).toBe(100);
  });
  it('a pass keeps no stake, and the stored record says so', () => {
    const p = parseBets(JSON.stringify({ bets: [{ id: 'a', play: false, stake_dollars: 900, why: 'no' }] }), t).get('a');
    expect(p).toEqual({ play: false, stake_dollars: null, why: 'no' });
    expect(betRecord(p, 'claude-opus-5-5')).toMatchObject({ play: false, stake_dollars: null, why: 'no', model: 'claude-opus-5-5' });
    expect(betRecord({ play: true, stake_dollars: 400, why: 'yes' }, 'm')).toMatchObject({ play: true, stake_dollars: 400 });
    expect(betRecord(undefined, null)).toMatchObject({ play: false, stake_dollars: null, why: '' });
  });
});
