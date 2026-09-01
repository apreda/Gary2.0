import { describe, it, expect } from 'vitest';
import { mlbCappedMenu, mlbCaseHeadings, mlbPass1Opening } from '../../src/services/agentic/orchestrator/mlbCaseMenu.js';
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
  it('names the actual tickets on a capped board, home heading first', () => {
    const h = mlbCaseHeadings('Braves', 'Rockies', capped);
    expect(h.capped).toBe(true);
    expect(h.home).toBe('CASE FOR BRAVES -1.5 (-111) TONIGHT:');
    expect(h.away).toBe('CASE FOR ROCKIES +1.5 (-109), OR THE ROCKIES OUTRIGHT AT +210, TONIGHT:');
  });
  it('mirrors correctly when the away side is the capped favorite', () => {
    const h = mlbCaseHeadings('Rangers', 'Athletics', cappedAway);
    expect(h.home).toBe('CASE FOR RANGERS +1.5 (-125), OR THE RANGERS OUTRIGHT AT +184, TONIGHT:');
    expect(h.away).toBe('CASE FOR ATHLETICS -1.5 (+104) TONIGHT:');
  });
});

describe('Pass 1 and the bilateral prompt agree', () => {
  it('opens with the capped sentence and uses the ticket headings on a capped game', () => {
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-01', 'baseball_mlb', -1.5, { game: capped });
    expect(msg).toContain("The favorite's moneyline is past the house limit and is not a ticket, so the bet on this game is the run line, or the underdog outright.");
    expect(msg).toContain('CASE FOR BRAVES -1.5 (-111) TONIGHT:');
    expect(msg).toContain('CASE FOR ROCKIES +1.5 (-109), OR THE ROCKIES OUTRIGHT AT +210, TONIGHT:');
    expect(msg).not.toContain('CASE FOR BACKING');
    // Price-last ruling: the opening names the kind of bet, never the numbers.
    const opening = msg.split('\n').find((l) => l.startsWith("You're deciding"));
    expect(opening).not.toMatch(/-?\d{3}/);
  });
  it('reads exactly as before on a legal board', () => {
    const msg = buildPass1Message('DESK', 'Braves', 'Rockies', '2026-09-01', 'baseball_mlb', -1.5, { game: legal });
    expect(msg).toContain('The betting options and their prices come at the end, after you have been through everything.'.replace('you have', "you've"));
    expect(msg).toContain('CASE FOR BACKING BRAVES TONIGHT:');
    expect(msg).toContain('CASE FOR BACKING ROCKIES TONIGHT:');
  });
  it('the constitution bilateral prompt carries the same headings', () => {
    const p = MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies', capped);
    expect(p).toContain('CASE FOR BRAVES -1.5 (-111) TONIGHT:');
    expect(p).toContain('CASE FOR ROCKIES +1.5 (-109), OR THE ROCKIES OUTRIGHT AT +210, TONIGHT:');
    expect(MLB_CONSTITUTION.bilateralCasePrompt('Braves', 'Rockies')).toContain('CASE FOR BACKING BRAVES TONIGHT:');
  });
  it('mlbPass1Opening is the default sentence with no board', () => {
    expect(mlbPass1Opening(null, 'A', 'B')).toContain('The betting options and their prices come at the end');
  });
});
