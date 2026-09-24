import { describe, it, expect } from 'vitest';
import { firstInningChance, menuSize, nflGameFromRow, prescreenMlb, nflMarkets } from '../../../src/services/darts/dartsScreen.js';
import { buildCategoryAsk, accept, formulaFill, FORMULA_FILL } from '../../../src/services/darts/dartsBrain.js';

describe('the dart screen', () => {
  it('sizes the menu at three per throw, never under eight, and the whole board when it is small', () => {
    expect(menuSize(5, 112)).toBe(15); expect(menuSize(2, 40)).toBe(8); expect(menuSize(0, 40)).toBe(8); expect(menuSize(2, 23)).toBe(23);
  });
  it('prices a first-inning run from both clubs, shrunk toward the league', () => {
    const even = firstInningChance(3, 3);
    expect(even).toBeGreaterThan(0.45); expect(even).toBeLessThan(0.6);
    expect(firstInningChance(8, 8)).toBeGreaterThan(firstInningChance(1, 1));
    expect(firstInningChance(null, null)).toBeCloseTo(1 - 0.7 * 0.7, 2);
  });
  it('maps an nflverse weekly row to the sheet and model shape', () => {
    const g = nflGameFromRow({ week: '3', opponent_team: 'DET', completions: '22', attempts: '31', passing_yards: '288', passing_tds: '2', passing_interceptions: '1', carries: '4', rushing_yards: '17', rushing_tds: '0', receptions: '', targets: '', receiving_yards: '', receiving_tds: '' });
    expect(g).toMatchObject({ week: 3, opp: 'DET', pass_comp: 22, pass_att: 31, pass_yds: 288, pass_tds: 2, ints: 1, rush_att: 4, rush_yds: 17, receptions: 0, targets: 0 });
  });
  it('pre-screens home-run batters by power and hits batters by contact', () => {
    const c = new Map([
      ['B1', { id: 'B1', seasonHr: 30, ops: '0.900', heat: 'steady', order: 3 }],
      ['B2', { id: 'B2', seasonHr: 5, ops: '0.950', heat: 'hot', order: 1 }],
      ['B3', { id: 'B3', seasonHr: 12, ops: '0.700', heat: 'cold', order: 8 }],
    ]);
    expect(prescreenMlb('hr', c, ['B1', 'B2', 'B3']).map((x) => x.id)).toEqual(['B1', 'B3', 'B2']);
    expect(prescreenMlb('multihit', c, ['B1', 'B2', 'B3']).map((x) => x.id)).toEqual(['B2', 'B1', 'B3']);
    expect(prescreenMlb('hr', c, ['B1', 'B2', 'B3'], 2)).toHaveLength(2);
  });
  it('builds two-sided markets for yardage and one-sided for touchdowns', () => {
    const board = { eligible: { recyds: ['P1'], td: ['P2'] }, candidates: new Map([
      ['P1', { id: 'P1', player: 'A', team: 'T', gameId: '9', rec: { line: 55.5, over: -110, under: -110 } }],
      ['P2', { id: 'P2', player: 'B', team: 'T', gameId: '9', td: { odds: 150 } }],
    ]) };
    expect(nflMarkets('recyds', board)[0]).toMatchObject({ prop_type: 'receiving_yards', line: 55.5, over_odds: -110, under_odds: -110 });
    expect(nflMarkets('td', board)[0]).toMatchObject({ prop_type: 'anytime_td', line: 0.5, over_odds: 150, under_odds: null });
  });
});

describe('the throw', () => {
  const menu = [{ id: 'B1', sheet: 'Player One\n    home_runs 0.5 (+300) — last 5: 1 0 0 1 0' }, { id: 'B2', sheet: 'Player Two\n    home_runs 0.5 (+420) — last 5: 0 0 0 0 1' }, { id: 'B3', sheet: 'Player Three\n    x' }];
  const board = { candidates: new Map([['B1', { team: 'A' }], ['B2', { team: 'B' }], ['B3', { team: 'A' }]]) };
  it('asks the bettor\'s question over the menu with no rule for how to answer', () => {
    const ask = buildCategoryAsk({ league: 'MLB', kind: 'hr', count: 2, menu, dateLong: 'Thursday' });
    expect(ask).toContain('Which 2 are the best bets in HOME RUN today?');
    expect(ask).toContain('[B1] Player One');
    for (const banned of ['value', 'edge', 'favorite', 'underdog', 'always', 'never pick', 'probability', '%']) expect(ask.toLowerCase()).not.toContain(banned);
    const sided = buildCategoryAsk({ league: 'NFL', kind: 'recyds', count: 3, menu, dateLong: 'Sunday' });
    expect(sided).toContain('Over or under, your call on each.');
  });
  it('keeps only darts from the menu, one per player and per club when asked, and the menu order fills the rest last', () => {
    const taken = [];
    const r = accept([{ id: '[B1]', reason: 'He has it.' }, { id: 'B1', reason: 'again' }, { id: 'B9', reason: 'off menu' }, { id: 'B3', reason: 'same club' }], { kind: 'hr', menu, count: 2, taken, perClub: true, board });
    expect(taken.map((t) => t.id)).toEqual(['B1']);
    expect(r.missing).toBe(1); expect(r.problems.join(' ')).toContain('B9 is not on the board'); expect(r.problems.join(' ')).toContain('one from each club');
    const filled = formulaFill({ kind: 'hr', menu, count: 2, taken, perClub: true, board });
    expect(filled).toHaveLength(1); expect(filled[0]).toMatchObject({ id: 'B2', model: FORMULA_FILL }); expect(filled[0].reason).toContain('Next on the board by the numbers');
    expect(taken).toHaveLength(2);
  });
  it('a sided dart needs a priced side', () => {
    const b = { candidates: new Map([['P1', { rec: { line: 50.5, over: -115, under: null } }]]) };
    const taken = [];
    const r = accept([{ id: 'P1', side: 'under', reason: 'x' }], { kind: 'recyds', menu: [{ id: 'P1', sheet: 's' }], count: 1, taken, board: b });
    expect(taken).toHaveLength(0); expect(r.problems[0]).toContain('no under price');
  });
});
