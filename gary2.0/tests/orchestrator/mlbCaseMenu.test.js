import { describe, it, expect } from 'vitest';
import { mlbCappedMenu, mlbCaseHeadings, mlbCaseOrder, mlbPass1Opening, ticketMenu, menuTruthLines } from '../../src/services/agentic/orchestrator/mlbCaseMenu.js';
import { buildPass1Message } from '../../src/services/agentic/orchestrator/passBuilders.js';
import { MLB_CONSTITUTION } from '../../src/services/agentic/constitution/mlbConstitution.js';

const capped = { moneyline_home: -230, moneyline_away: 210, spread_home: -1.5, spread_home_odds: -111, spread_away: 1.5, spread_away_odds: -109 };
const cappedAway = { moneyline_home: 184, moneyline_away: -220, spread_home: 1.5, spread_home_odds: -125, spread_away: -1.5, spread_away_odds: 104 };
const legal = { moneyline_home: -150, moneyline_away: 130, spread_home: -1.5, spread_home_odds: 120, spread_away: 1.5, spread_away_odds: -140 };

describe('mlbCaseOrder — the case written last alternates by game id (founder GO, Sep 2)', () => {
  it('even id home first, odd id away first, no id home first', () => {
    expect(mlbCaseOrder({ id: 5059862 })).toBe('home-first');
    expect(mlbCaseOrder({ id: 5059863 })).toBe('away-first');
    expect(mlbCaseOrder({ bdl_game_id: '5059863' })).toBe('away-first');
    expect(mlbCaseOrder({})).toBe('home-first');
    expect(mlbCaseOrder(null)).toBe('home-first');
  });
  it('the headings print in the game\'s order and name the club read last', () => {
    const even = mlbCaseHeadings('Braves', 'Rockies', { ...legal, id: 100 });
    expect(even.first).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(even.second).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(even.lastSide).toBe('away');
    const odd = mlbCaseHeadings('Braves', 'Rockies', { ...legal, id: 101 });
    expect(odd.first).toBe('CASE FOR BACKING ROCKIES TONIGHT:');
    expect(odd.second).toBe('CASE FOR BACKING BRAVES TONIGHT:');
    expect(odd.lastSide).toBe('home');
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-02', 'baseball_mlb', -1.5, { game: { ...legal, id: 101 } });
    expect(msg.indexOf('CASE FOR BACKING ROCKIES TONIGHT:')).toBeLessThan(msg.indexOf('CASE FOR BACKING BRAVES TONIGHT:'));
    const p = MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies', { ...legal, id: 101 });
    expect(p.indexOf('CASE FOR BACKING ROCKIES TONIGHT:')).toBeLessThan(p.indexOf('CASE FOR BACKING BRAVES TONIGHT:'));
  });
});

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

describe('what the price already holds (founder GO, Sep 3 2026)', () => {
  it('both openers carry the sentence verbatim, after "The board comes first"', async () => {
    const { mlbPass1Opening, MLB_PRICED_IN_SENTENCE } = await import('../../src/services/agentic/orchestrator/mlbCaseMenu.js');
    expect(MLB_PRICED_IN_SENTENCE).toBe('The prices on the board were set after the starters, the records, the run differential, the season offense and pen numbers, and the park were known. The question is not whether those things exist, everyone can see them, but whether the price has accounted for them correctly for tonight\'s game. Records and run differential describe what has happened; they are not reasons for or against a price.');
    for (const h of [{ kind: 'moneyline' }, { kind: 'runline', fav: 'Dodgers', dog: 'Padres' }]) {
      const msg = mlbPass1Opening(h);
      expect(msg.indexOf('The board comes first; everything else follows.')).toBeLessThan(msg.indexOf(MLB_PRICED_IN_SENTENCE));
      expect(msg).not.toMatch(/cheap|expensive|underdog|favorite is|value/i);
    }
  });
  it('the Aug 19 "price is not a message" clause is retired from the MLB constitution', async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../../src/services/agentic/constitution/mlbConstitution.js', import.meta.url), 'utf8');
    expect(text).not.toContain('The price is not a message about the game');
    expect(text).toContain('The market already knows what you know');
  });
});

describe('where to look (founder GO, Sep 3 2026)', () => {
  it('both openers carry the where-to-look line after the priced-in sentence, and it names places only', async () => {
    const { mlbPass1Opening, MLB_PRICED_IN_SENTENCE, MLB_WHERE_TO_LOOK } = await import('../../src/services/agentic/orchestrator/mlbCaseMenu.js');
    for (const h of [{ kind: 'moneyline' }, { kind: 'runline', fav: 'Dodgers', dog: 'Padres' }]) {
      const msg = mlbPass1Opening(h);
      expect(msg.indexOf(MLB_PRICED_IN_SENTENCE)).toBeLessThan(msg.indexOf(MLB_WHERE_TO_LOOK));
    }
    expect(MLB_WHERE_TO_LOOK).toContain('which arms in each pen can actually go tonight');
    expect(MLB_WHERE_TO_LOOK).not.toMatch(/\b(edge|value|fade|favorite|underdog|means|therefore|so take|bet the)\b/i);
  });
});
