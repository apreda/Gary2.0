import { describe, it, expect } from 'vitest';
import { buildBetStep, buildStakeStep, parseBetStep, parseStakeStep, combineBets, betRecord, bankrollBlock, BET_STEP } from '../../../src/services/pickdesk/garyBet.js';

const t = [{ id: 'a', pick: 'Tigers ML -134', matchup: 'Guardians @ Tigers', rationale: 'Skubal at home.', case_home: 'H', case_away: 'A' }];
const brief = {
  start_dollars: 10000, started_on: '2026-09-16', equity_dollars: 10277, cash_dollars: 9877, riding_dollars: 400,
  season: { won: 107, lost: 83, push: 1, net: 277, risked: 35305 },
  last7: { from: '2026-09-29', to: '2026-10-05', won: 23, lost: 20, push: 1, net: -988, risked: 13500 },
  yesterday: { date: '2026-10-05', won: 1, lost: 1, push: 0, net: -270, risked: 500, bets: [
    { pick_text: 'White Sox ML +130', league: 'MLB', kind: 'game', stake: 100, result: 'won', net: 130, automatic_pass: true },
    { pick_text: 'Yankees ML -120', league: 'MLB', kind: 'game', stake: 400, result: 'lost', net: -400, automatic_pass: false },
  ] },
  riding: [{ pick_text: 'Rays ML -120', league: 'MLB', kind: 'game', stake: 400, automatic_pass: false }],
};

describe("Gary's bet step", () => {
  it('round one: the product fact and both cases, then bet or pass, with no bankroll, amount or rule', () => {
    const ask = buildBetStep({ tickets: t });
    expect(ask).toContain('Every game gets a pick because the app needs one.');
    expect(ask).toContain('the case for betting it, then the case for passing on it');
    expect(ask).toContain('You choose the amount next.');
    expect(ask).not.toContain('YOUR BANKROLL');
    expect(ask).not.toContain('stake_dollars');
    expect(ask.indexOf("THE AWAY SIDE'S CASE")).toBeLessThan(ask.indexOf("THE HOME SIDE'S CASE"));
    for (const banned of ['favorite', 'underdog', 'always bet', 'never bet', 'at least one', 'value bet', 'edge', 'expected value', 'parlay', 'minimum', 'maximum', '%']) {
      expect(ask.toLowerCase()).not.toContain(banned);
    }
  });
  it('round two: the goal and the bankroll with no dollar amount he could copy, then how much', () => {
    const ask = buildStakeStep({ tickets: t, brief });
    expect(ask).toContain("You're betting it:");
    expect(ask).toContain('YOUR GOAL');
    expect(ask).toContain('You have $10,277 now: $9,877 in cash and $400 riding');
    expect(ask).toContain('Season: 107-83-1, up $277 on $35,305 bet.');
    expect(ask).not.toContain('Last 7 days');
    expect(ask).toContain('- White Sox ML +130 (MLB, automatic MLB game you passed on): won');
    expect(ask).toContain('Riding right now ($400 in all):');
    expect(ask).toContain('- Rays ML -120 (MLB)');
    expect(ask).not.toMatch(/: \$100|: \$400|\+\$130/);
    expect(ask).toContain('How much do you put on it?');
    expect(ask).not.toContain('NOTEBOOK');
  });
  it('asked in the pick session it lists the tickets without repeating the case, and props say so', () => {
    const ask = buildBetStep({ tickets: [{ id: 'p1', pick: 'Olson over hits_runs_rbis 0.5', price: -177 }], inSession: true, kind: 'prop' });
    expect(ask).toContain('- TICKET p1: Olson over hits_runs_rbis 0.5 (-177)');
    expect(ask).toContain('Every game gets its prop picks because the app needs them.');
    expect(ask).not.toContain('YOUR CASE');
  });
  it('says so when the bankroll is unavailable', () => {
    expect(bankrollBlock(null)).toContain('unavailable');
  });
  it('parses the decision, then the amount; a bet without a whole-dollar amount above zero is a pass', () => {
    const d = parseBetStep(JSON.stringify({ bets: [{ id: 'a', case_bet: 'arm', case_pass: 'pen', bet: true, why: 'I like the arm.' }] }), t);
    expect(d.usable).toBe(true);
    expect(d.decisions.get('a')).toEqual({ bet: true, why: 'I like the arm.', case_bet: 'arm', case_pass: 'pen' });
    const s = parseStakeStep(JSON.stringify({ bets: [{ id: 'a', stake_dollars: 400, why: 'Big spot.' }] }), t);
    expect(s.usable).toBe(true);
    expect(combineBets(t, d.decisions, s.stakes).get('a')).toEqual({ bet: true, stake_dollars: 400, why: 'Big spot.', case_bet: 'arm', case_pass: 'pen' });
    expect(parseStakeStep(JSON.stringify({ bets: [{ id: 'a', stake_dollars: 12000 }] }), t).stakes.get('a')).toMatchObject({ stake_dollars: 12000 });
    for (const bad of [0, '400', 250.5]) expect(parseStakeStep(JSON.stringify({ bets: [{ id: 'a', stake_dollars: bad }] }), t).usable).toBe(false);
    expect(combineBets(t, d.decisions, new Map()).get('a')).toMatchObject({ bet: false, stake_dollars: null, case_pass: 'pen' });
    expect(parseBetStep('```json\n{"bets":[{"id":"a","bet":true,"why":"fenced"}]}\n```', t).decisions.get('a')).toMatchObject({ bet: true });
    expect(parseBetStep('not json', t)).toMatchObject({ usable: false });
    expect(parseBetStep(JSON.stringify({ bets: [] }), t).usable).toBe(false);
    expect(parseBetStep(JSON.stringify({ bets: [{ id: 'zzz', bet: true }] }), t).usable).toBe(false);
    expect(parseBetStep(JSON.stringify({ bets: [{ id: 'a', would_bet: false }] }), t, { automatic: true }).decisions.get('a')).toMatchObject({ bet: true, would_bet: false });
  });
  it('a pass keeps no stake, and the stored record says which step and where it was asked', () => {
    const p = combineBets(t, parseBetStep(JSON.stringify({ bets: [{ id: 'a', bet: false, why: 'no', case_pass: 'pen' }] }), t).decisions).get('a');
    expect(p).toMatchObject({ bet: false, stake_dollars: null, why: 'no', case_pass: 'pen' });
    expect(betRecord(p, 'claude-opus-5-5', 'in_session')).toMatchObject({ play: false, winners: false, stake_dollars: null, why: 'no', model: 'claude-opus-5-5', asked: 'in_session', step: BET_STEP });
    expect(betRecord({ bet: true, stake_dollars: 400, why: 'yes' }, 'm')).toMatchObject({ play: true, winners: true, stake_dollars: 400, asked: 'separate' });
    expect(betRecord(undefined, null)).toMatchObject({ play: false, stake_dollars: null, why: '' });
  });
});
