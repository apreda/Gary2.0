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
    expect(ok.get('a')).toEqual({ play: true, stake_dollars: 400, why: 'I like the arm.', parlay: false, parlay_line: '' });
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 50, why: 'x' }] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: '400', why: 'x' }] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 250.5, why: 'x' }] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'a', play: true, stake_dollars: 12000, why: 'all of it' }] }), t).get('a')).toMatchObject({ play: true, stake_dollars: 12000 });
    expect(parseBets('```json\n{"bets":[{"id":"a","play":true,"stake_dollars":150,"why":"fenced"}]}\n```', t).get('a')).toMatchObject({ play: true, stake_dollars: 150 });
    expect(parseBets('not json', t).get('a')).toEqual({ play: false, stake_dollars: null, why: '', parlay: false, parlay_line: '' });
    expect(parseBets(JSON.stringify({ bets: [] }), t).get('a').play).toBe(false);
    expect(parseBets(JSON.stringify({ bets: [{ id: 'zzz', play: true, stake_dollars: 400, why: 'wrong id' }] }), t).get('a').play).toBe(false);
    expect(BET_MIN_DOLLARS).toBe(100);
  });
  it('a pass keeps no stake, and the stored record says so', () => {
    const p = parseBets(JSON.stringify({ bets: [{ id: 'a', play: false, stake_dollars: 900, why: 'no' }] }), t).get('a');
    expect(p).toEqual({ play: false, stake_dollars: null, why: 'no', parlay: false, parlay_line: '' });
    expect(betRecord(p, 'claude-opus-5-5')).toMatchObject({ play: false, stake_dollars: null, why: 'no', model: 'claude-opus-5-5' });
    expect(betRecord({ play: true, stake_dollars: 400, why: 'yes' }, 'm')).toMatchObject({ play: true, stake_dollars: 400 });
    expect(betRecord(undefined, null)).toMatchObject({ play: false, stake_dollars: null, why: '', parlay: false });
  });
  it('asks for the parlay mark with the marks so far until the ticket is built, and never once it is', () => {
    const open = { locked: false, legs: [{ text: 'Yankees ML', odds: -150, matchup: 'Rays @ Yankees', commence_time: '2026-09-24T23:05:00Z' }], slate_games: 15, games_to_pick: 6, builds_at: '2099-09-24T21:55:00Z' };
    const ask = buildBetAsk({ league: 'MLB', tickets: t, bankroll: null, parlay: open });
    expect(ask).toContain('- Yankees ML (-150) · Rays @ Yankees · 7:05 PM ET');
    expect(ask).toContain('You build it at 5:55 PM ET');
    expect(ask).toContain('6 of today\'s 15 games are still to be picked.');
    expect(buildBetAsk({ league: 'MLB', tickets: t, bankroll: null, parlay: { ...open, builds_at: '2020-01-01T00:00:00Z' } })).toContain('You build it next');
    expect(ask).toContain('"parlay":false');
    expect(buildBetAsk({ league: 'MLB', tickets: t, bankroll: null, parlay: { ...open, locked: true } })).not.toContain('parlay');
    const yes = parseBets(JSON.stringify({ bets: [{ id: 'a', play: false, why: 'no money', parlay: true, parlay_line: 'Skubal at home.' }] }), t).get('a');
    expect(betRecord(yes, 'm')).toMatchObject({ play: false, parlay: true, parlay_line: 'Skubal at home.' });
  });
});
