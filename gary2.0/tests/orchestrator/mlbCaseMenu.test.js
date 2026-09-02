import { describe, it, expect } from 'vitest';
import { mlbCappedMenu, mlbCaseHeadings, mlbPass1Opening, ticketMenu, menuTruthLines } from '../../src/services/agentic/orchestrator/mlbCaseMenu.js';
import { buildPass1Message } from '../../src/services/agentic/orchestrator/passBuilders.js';
import { MLB_CONSTITUTION } from '../../src/services/agentic/constitution/mlbConstitution.js';

const capped = { moneyline_home: -230, moneyline_away: 210, spread_home: -1.5, spread_home_odds: -111, spread_away: 1.5, spread_away_odds: -109 };
const cappedAway = { moneyline_home: 184, moneyline_away: -220, spread_home: 1.5, spread_home_odds: -125, spread_away: -1.5, spread_away_odds: 104 };
const legal = { moneyline_home: -150, moneyline_away: 130, spread_home: -1.5, spread_home_odds: 120, spread_away: 1.5, spread_away_odds: -140 };

describe('mlbCappedMenu', () => {
  it('names the tickets when the home favorite is past the cap', () => {
    const m = mlbCappedMenu(capped, 'Braves', 'Rockies');
    expect(m).toEqual({ fav: 'Braves', favLine: '-1.5 (-111)', dog: 'Rockies', dogLine: '+1.5 (-109)', dogMl: '+210' });
  });
  it('handles an away favorite', () => {
    const m = mlbCappedMenu(cappedAway, 'Rangers', 'Athletics');
    expect(m.fav).toBe('Athletics');
    expect(m.dog).toBe('Rangers');
    expect(m.dogMl).toBe('+184');
  });
  it('is null on a legal board, a missing board, or an unpriced run line', () => {
    expect(mlbCappedMenu(legal, 'A', 'B')).toBeNull();
    expect(mlbCappedMenu(null, 'A', 'B')).toBeNull();
    expect(mlbCappedMenu({ ...capped, spread_home_odds: null }, 'A', 'B')).toBeNull();
  });
});

describe('mlbCaseHeadings', () => {
  it('keeps the who-wins headings on a legal board', () => {
    const h = mlbCaseHeadings('Braves', 'Rockies', legal);
    expect(h.capped).toBe(false);
    expect(h.home).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(h.away).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('a run-line game keeps the club names in the headings; the kind and tickets ride the opener (founder, Sep 2)', () => {
    const h = mlbCaseHeadings('Braves', 'Rockies', capped);
    expect(h.kind).toBe('runline');
    expect(h.fav).toBe('Braves');
    expect(h.dog).toBe('Rockies');
    expect(h.home).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(h.away).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('never puts a line in a heading, whichever side is the run-line favorite', () => {
    const h = mlbCaseHeadings('Rangers', 'Athletics', cappedAway);
    expect(h.kind).toBe('runline');
    expect(h.fav).toBe('Athletics');
    expect(h.home).toBe('CASE FOR BACKING RANGERS TONIGHT:');
    expect(h.away).toBe('CASE FOR BACKING ATHLETICS TONIGHT:');
  });
});

describe('Pass 1 and the bilateral prompt agree', () => {
  it('names the game kind before the desk and asks the run line on a run-line game', () => {
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-01', 'baseball_mlb', -1.5, { game: capped });
    expect(msg).toContain('Tonight is a run-line game: Braves -1.5 or Rockies +1.5.');
    expect(msg).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(msg).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(msg).not.toContain('-1.5 TONIGHT:');
    expect(msg).not.toContain('+1.5 TONIGHT:');
    expect(msg.toLowerCase()).not.toContain('house limit');
    expect(msg).not.toContain('OUTRIGHT AT');
    // Price-last ruling: the opening names the kind of bet, never the numbers.
    const opening = msg.split('\n').find((l) => l.startsWith("You're deciding"));
    expect(opening).not.toMatch(/-?\d{3}/);
  });
  it('reads exactly as before on a legal board', () => {
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-01', 'baseball_mlb', -1.5, { game: legal });
    expect(msg).toContain('The board comes first; everything else follows.');
    expect(msg).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(msg).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('the constitution bilateral prompt carries the same headings', () => {
    const p = MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies', capped);
    expect(p).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(p).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(p).toContain('the case for taking that side tonight');
    expect(MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies')).toContain('CASE FOR BACKING BRAVES TONIGHT:');
  });
  it('mlbPass1Opening names the kind of game, prices at the end either way', () => {
    expect(mlbPass1Opening({ kind: 'moneyline' })).toContain('The board comes first; everything else follows.');
    const rl = mlbPass1Opening({ kind: 'runline', fav: 'Braves', dog: 'Rockies' });
    expect(rl).toContain('Tonight is a run-line game: Braves -1.5 or Rockies +1.5.');
    expect(rl.toLowerCase()).not.toContain('house limit');
  });
});

describe('ticketMenu / menuTruthLines — one definition of a ticket', () => {
  it('drops a capped moneyline and lists every priced ticket, home first by default', () => {
    const m = ticketMenu(capped, 'Braves', 'Rockies');
    expect(m.dropped).toEqual(['Braves -230']);
    expect(m.tickets).toEqual(['Braves -1.5 (-111)', 'Rockies +210', 'Rockies +1.5 (-109)']);
    const lines = menuTruthLines(capped, 'Braves', 'Rockies', { when: 'tonight' });
    expect(lines[0]).toBe('House limit: no moneyline heavier than -179. Braves -230 is past it and is not a ticket tonight.');
    expect(lines[1]).toBe('Tickets on this game: Braves -1.5 (-111) · Rockies +210 · Rockies +1.5 (-109)');
  });
  it('football order is away-first and the wording is the week', () => {
    const lines = menuTruthLines(cappedAway, 'Rangers', 'Athletics', { when: 'this week', order: 'away-first' });
    expect(lines[0]).toContain('is not a ticket this week');
    expect(lines[1]).toBe('Tickets on this game: Athletics -1.5 (+104) · Rangers +184 · Rangers +1.5 (-125)');
  });
  it('a legal board lists both moneylines and both lines, nothing dropped', () => {
    const m = ticketMenu(legal, 'A', 'B');
    expect(m.dropped).toEqual([]);
    expect(m.tickets.length).toBe(4);
  });
  it('an unpriced line is not a ticket', () => {
    const m = ticketMenu({ ...legal, spread_home_odds: null, spread_away_odds: null }, 'A', 'B');
    expect(m.tickets).toEqual(['A -150', 'B +130']);
  });
});
