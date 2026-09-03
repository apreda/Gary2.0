import { describe, it, expect } from 'vitest';
import {
  hitterProfile, hitterDistribution, pitcherProfile, pitcherDistribution, probOver,
  marketProbabilities, implied, payout, screenBoard, rowsBefore, lineupRates, empiricalDistribution, LEAGUE,
} from '../../../src/services/pickdesk/propModel.js';

const day = (i) => `2026-07-${String(1 + (i % 28)).padStart(2, '0')}`;
const hitterRow = (i, over = {}) => ({
  plate_appearances: 4, at_bats: 4, hits: 1, total_bases: 1, hr: 0, rbi: 0, runs: 0, bb: 0, k: 1, doubles: 0, triples: 0, stolen_bases: 0,
  _game: { date: over.date || `2026-0${i < 28 ? 7 : 8}-${String(1 + (i % 28)).padStart(2, '0')}` }, ...over,
});
const sum = (d) => d.reduce((a, b) => a + b, 0);

describe('the prop model — arithmetic', () => {
  it('vig-free market probabilities sum to one and favor the juiced side', () => {
    const m = marketProbabilities(-130, 105);
    expect(m.over + m.under).toBeCloseTo(1, 9);
    expect(m.over).toBeGreaterThan(0.5);
    expect(m.oneSided).toBe(false);
    expect(marketProbabilities(240, null)).toMatchObject({ oneSided: true });
    expect(marketProbabilities(null, null)).toBeNull();
    expect(implied(-110)).toBeCloseTo(0.5238, 3);
    expect(payout(-110)).toBeCloseTo(0.909, 3);
    expect(payout(150)).toBe(1.5);
  });

  it('a hitter distribution is a probability distribution and P(over) falls as the line rises', () => {
    const rows = Array.from({ length: 40 }, (_, i) => hitterRow(i, { hits: i % 3 === 0 ? 2 : i % 2, total_bases: i % 3 === 0 ? 3 : i % 2 }));
    const p = hitterProfile(rows);
    expect(p.games).toBe(40);
    for (const t of ['hits', 'total_bases', 'hits_runs_rbis', 'walks', 'home_runs', 'rbis']) {
      const d = hitterDistribution(p, t);
      expect(sum(d)).toBeCloseTo(1, 6);
      expect(probOver(d, 0.5)).toBeGreaterThanOrEqual(probOver(d, 1.5));
      expect(probOver(d, 1.5)).toBeGreaterThanOrEqual(probOver(d, 2.5));
    }
    expect(hitterDistribution(p, 'nonsense')).toBeNull();
  });

  it('rates are shrunk toward the league and pulled by the last 30 days', () => {
    const cold = Array.from({ length: 60 }, (_, i) => hitterRow(i, { hits: 0, date: `2026-06-${String(1 + (i % 28)).padStart(2, '0')}` }));
    const p = hitterProfile(cold, { asOf: '2026-08-01' });
    // 240 PA of zero hits, prior 100 PA at the league rate → well under league, not zero.
    expect(p.rates.hits).toBeGreaterThan(0);
    expect(p.rates.hits).toBeLessThan(LEAGUE.hits);
    expect(p.rates.hits).toBeCloseTo((100 * LEAGUE.hits) / 340, 4);
  });

  it('the empirical blend carries clumpiness a Poisson misses', () => {
    // RBI: 0 in 16 of 20 games, 4 in the other four — same mean as an even spread.
    const rows = Array.from({ length: 20 }, (_, i) => hitterRow(i, { rbi: i % 5 === 0 ? 4 : 0, date: day(i) }));
    const p = hitterProfile(rows, { asOf: '2026-08-01' });
    const d = hitterDistribution(p, 'rbis');
    const emp = empiricalDistribution(p.rows, 'rbis', '2026-08-01');
    expect(emp[0]).toBeGreaterThan(0.75);
    expect(emp[0]).toBeLessThan(0.85);
    // The blended P(over 0.5) sits between the pure Poisson and the pure empirical 20%.
    const pOver = probOver(d, 0.5);
    expect(pOver).toBeGreaterThan(0.2);
    expect(pOver).toBeLessThan(0.5);
  });

  it('the replay never peeks: rows on or after the date are excluded', () => {
    const rows = [hitterRow(0, { date: '2026-08-01' }), hitterRow(1, { date: '2026-08-02' }), hitterRow(2, { date: '2026-08-03' })];
    expect(rowsBefore(rows, '2026-08-02')).toHaveLength(1);
    expect(rowsBefore(rows, null)).toHaveLength(3);
  });

  it('a starter distribution uses his batters faced and the lineup scale', () => {
    const starts = Array.from({ length: 12 }, (_, i) => ({
      ip: 6, pitching_outs: 18, p_k: 6, p_bb: 2, p_hits: 5, er: 2, games_started: 1, batters_faced: 24, _game: { date: day(i) },
    }));
    const p = pitcherProfile(starts, { asOf: '2026-08-01' });
    expect(p.starts).toBe(12);
    expect(p.expectedBf).toBeCloseTo(24, 6);
    const base = probOver(pitcherDistribution(p, 'pitcher_strikeouts'), 5.5);
    const whiffy = probOver(pitcherDistribution(p, 'pitcher_strikeouts', { k: LEAGUE.k * 1.3 }), 5.5);
    const contact = probOver(pitcherDistribution(p, 'pitcher_strikeouts', { k: LEAGUE.k * 0.7 }), 5.5);
    expect(whiffy).toBeGreaterThan(base);
    expect(contact).toBeLessThan(base);
    expect(sum(pitcherDistribution(p, 'pitcher_outs'))).toBeCloseTo(1, 6);
    expect(probOver(pitcherDistribution(p, 'pitcher_outs'), 17.5)).toBeGreaterThan(0.5);
  });

  it('lineup rates need five covered batters', () => {
    const rows = Array.from({ length: 10 }, (_, i) => hitterRow(i, { k: 2, bb: 1, date: day(i) }));
    expect(lineupRates([rows, rows, rows, rows], { asOf: '2026-08-01' })).toBeNull();
    const r = lineupRates([rows, rows, rows, rows, rows], { asOf: '2026-08-01' });
    expect(r.covered).toBe(5);
    expect(r.k).toBeCloseTo(0.5, 6);
  });
});

describe('screenBoard', () => {
  const hot = Array.from({ length: 40 }, (_, i) => hitterRow(i, { hits: 2, total_bases: 3, date: day(i) }));
  const cold = Array.from({ length: 40 }, (_, i) => hitterRow(i, { hits: 0, total_bases: 0, date: day(i) }));
  const thin = Array.from({ length: 3 }, (_, i) => hitterRow(i, { date: day(i) }));
  const markets = [
    { player: 'Hot Hitter', prop_type: 'hits', line: 0.5, over_odds: -110, under_odds: -110 },
    { player: 'Cold Hitter', prop_type: 'hits', line: 0.5, over_odds: -110, under_odds: -110 },
    { player: 'Thin Sample', prop_type: 'hits', line: 0.5, over_odds: -110, under_odds: -110 },
    { player: 'Hot Hitter', prop_type: 'home_runs', line: 0.5, over_odds: 400, under_odds: null },
  ];
  const ctx = { asOf: '2026-08-01', rowsFor: (k) => ({ 'hot hitter': hot, 'cold hitter': cold, 'thin sample': thin })[k], lineupFor: () => null };

  it('ranks by the gap, picks the side, and skips samples under five games', () => {
    const out = screenBoard(markets, ctx);
    expect(out.map((r) => r.market.player)).not.toContain('Thin Sample');
    const hotHits = out.find((r) => r.market.player === 'Hot Hitter' && r.market.prop_type === 'hits');
    const coldHits = out.find((r) => r.market.player === 'Cold Hitter');
    expect(hotHits.side).toBe('over');
    expect(coldHits.side).toBe('under');
    expect(hotHits.edge).toBeGreaterThan(0);
    expect(coldHits.edge).toBeGreaterThan(0);
    expect(out[0].edge).toBeGreaterThanOrEqual(out[out.length - 1].edge);
    for (const r of out) { expect(r.pModel).toBeGreaterThan(0); expect(r.pModel).toBeLessThan(1); expect(r.odds).not.toBeNull(); }
  });

  it('the market prior pulls the model toward the price (blend 1 = the market itself)', () => {
    const raw = screenBoard(markets, { ...ctx, marketBlend: 0 }).find((r) => r.market.player === 'Hot Hitter' && r.market.prop_type === 'hits');
    const all = screenBoard(markets, { ...ctx, marketBlend: 1 }).find((r) => r.market.player === 'Hot Hitter' && r.market.prop_type === 'hits');
    expect(Math.abs(all.edge)).toBeLessThan(1e-9);
    expect(raw.edge).toBeGreaterThan(all.edge);
  });
});

describe('the screened board (propsBrain) — the August replay policy', async () => {
  const { selectCandidates, buildScreenedBoard } = await import('../../../src/services/pickdesk/propsBrain.js');
  const mk = (player, prop_type, side, edge, odds, team = 'SEA') => ({ market: { player, team, prop_type, line: 0.5, over_odds: side === 'over' ? odds : -110, under_odds: side === 'under' ? odds : -110 }, side, edge, odds, pModel: 0.6, pMarket: 0.5 });
  it('favorites -130..-200 at 4+ points lead, then -129..+150 at 6+, never +151 or a blocked market-side, two per player, three deep', () => {
    const screened = [
      mk('Long', 'hits', 'over', 0.30, 220),                    // +151 and longer: never
      mk('Blocked', 'total_bases', 'under', 0.25, -150),        // lost in both halves: off the menu
      mk('A', 'walks', 'under', 0.09, -160), mk('A', 'rbis', 'under', 0.08, -170), mk('A', 'runs_scored', 'under', 0.07, -140),
      mk('B', 'hits_runs_rbis', 'over', 0.05, -135),
      mk('C', 'total_bases', 'over', 0.12, 115),                // fill band, 6+
      mk('D', 'pitcher_walks', 'over', 0.03, -180),             // favorite band but under 4 points
      mk('E', 'hits', 'over', 0.02, -105),
    ];
    const picked = selectCandidates(screened).map((s) => `${s.market.player} ${s.market.prop_type} ${s.side}`);
    expect(picked).toEqual(['A walks under', 'A rbis under', 'B hits_runs_rbis over']);   // A capped at 2; C waits behind the favorites
    const thin = selectCandidates([mk('E', 'hits', 'over', 0.02, -105), mk('F', 'walks', 'under', 0.01, -120), mk('Long', 'hits', 'over', 0.30, 220)]);
    expect(thin.map((s) => s.market.player)).toEqual(['E', 'F']);                         // the floor completes the pair inside the window
    expect(selectCandidates([mk('Long', 'hits', 'over', 0.30, 220)])).toEqual([]);
  });
  it('prints one bet per line in policy order with the cleared clause', () => {
    const cands = [mk('Randy Arozarena', 'walks', 'under', 0.08, -148), mk('Julio Rodriguez', 'total_bases', 'over', 0.1, 127)];
    const b = buildScreenedBoard(cands, { clearedClauseFor: (k) => (k === 'julio rodriguez' ? 'over in 6 of his last 15' : null) });
    expect(b.text).toBe("═══ THE PROP BOARD (tonight's board) ═══\n  Randy Arozarena (SEA): UNDER walks 0.5 (-148)\n  Julio Rodriguez (SEA): OVER total_bases 0.5 (+127) — over in 6 of his last 15");
    expect([...b.players]).toEqual(['randy arozarena', 'julio rodriguez']);
    expect(buildScreenedBoard([], {})).toEqual({ text: '', players: new Set() });
  });
});

describe('THE HOME RUN BOARD (propsBrain)', async () => {
  const { selectHrCandidates, buildHomeRunBoard, THE_PROPS_ASK, THE_HOME_RUN_ASK } = await import('../../../src/services/pickdesk/propsBrain.js');
  const hr = (player, edge, odds) => ({ market: { player, team: 'LAD', prop_type: 'home_runs', line: 0.5, over_odds: odds, under_odds: null }, side: 'over', edge, odds, pModel: 0.15, pMarket: 0.14 });
  it('takes the three biggest gaps on takeable prices — value, not the sluggers', () => {
    const screened = [hr('Slugger', 0.01, 180), hr('Value A', 0.06, 550), hr('Value B', 0.05, 700), hr('Too Long', 0.09, 1200), hr('Value C', 0.04, 420), hr('Value D', 0.03, 380),
      { market: { player: 'Not HR', prop_type: 'hits', line: 0.5, over_odds: -150, under_odds: 120 }, side: 'over', edge: 0.2, odds: -150 }];
    expect(selectHrCandidates(screened).map((s) => s.market.player)).toEqual(['Value A', 'Value B', 'Value C']);
    const b = buildHomeRunBoard(selectHrCandidates(screened), { clearedClauseFor: (k) => (k === 'value a' ? 'over in 2 of his last 15' : null) });
    expect(b.text).toBe('═══ THE HOME RUN BOARD (one long shot, or none) ═══\n  Value A (LAD): OVER home_runs 0.5 (+550) — over in 2 of his last 15\n  Value B (LAD): OVER home_runs 0.5 (+700)\n  Value C (LAD): OVER home_runs 0.5 (+420)');
    expect(buildHomeRunBoard([])).toEqual({ text: '', players: new Set() });
  });
  it('the ask carries the home-run card contract', () => {
    expect(THE_PROPS_ASK).toContain(THE_HOME_RUN_ASK);
    expect(THE_HOME_RUN_ASK).toBe('From THE HOME RUN BOARD, when one is printed, take one home run bet or none; it publishes as its own card.');
  });
});
