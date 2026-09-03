import { describe, it, expect } from 'vitest';
import {
  implied, deVig, profitPerUnit, marketFromBoard, consensusHome, penAvailability, starterLeash, lineupAbsence, adjust, priceTickets, decide, DEFAULT_WEIGHTS,
} from '../../../src/services/shadow/marketModel.js';

const board = { moneyline_home: -144, moneyline_away: 122, spread_home: -1.5, spread_home_odds: 150, spread_away: 1.5, spread_away_odds: -175 };

describe('shadow marketModel — the market', () => {
  it('prices and de-vigs', () => {
    expect(implied(-150)).toBeCloseTo(0.6, 5);
    expect(deVig(-144, 122)).toBeCloseTo(0.5673, 3);
    expect(profitPerUnit(-144)).toBeCloseTo(0.6944, 3);
    expect(profitPerUnit(122)).toBeCloseTo(1.22, 5);
    const m = marketFromBoard(board);
    expect(m.pHome).toBeCloseTo(0.5673, 3);
    expect(m.runline.fav).toBe('home');
    expect(m.runline.pFavCover).toBeCloseTo(deVig(150, -175), 6);
    expect(marketFromBoard({ moneyline_home: -144, moneyline_away: 122, spread_home: -2.5, spread_away: 2.5 }).runline).toBeNull();
  });

  it('takes the median across books when they ride the game', () => {
    const bks = [
      { key: 'fanduel', markets: [{ key: 'h2h', outcomes: [{ name: 'Boston Red Sox', price: -144 }, { name: 'Seattle Mariners', price: 122 }] }] },
      { key: 'draftkings', markets: [{ key: 'h2h', outcomes: [{ name: 'Boston Red Sox', price: -150 }, { name: 'Seattle Mariners', price: 126 }] }] },
      { key: 'caesars', markets: [{ key: 'h2h', outcomes: [{ name: 'Boston Red Sox', price: -140 }, { name: 'Seattle Mariners', price: 118 }] }] },
    ];
    const c = consensusHome(bks, 'Boston Red Sox', 'Seattle Mariners');
    expect(c).toBeCloseTo(deVig(-144, 122), 6);
    expect(consensusHome([], 'a', 'b')).toBeNull();
  });
});

describe('shadow marketModel — tonight features', () => {
  const arm = (name, pitchesByDate) => ({ name, sum: { pitchesByDate } });
  it('pen availability counts the top four leverage arms who can go', () => {
    const arms = [
      arm('Closer', { '2026-09-02': 28 }),                       // 28 yesterday → down
      arm('Setup', { '2026-09-02': 12, '2026-09-01': 15 }),      // both of the last two days → down
      arm('Third', { '2026-09-01': 10, '2026-08-31': 9, '2026-08-30': 11 }), // three of last four → down
      arm('Fourth', { '2026-08-30': 20 }),                       // fine
      arm('Fifth', {}),                                          // not top four
    ];
    const p = penAvailability(arms, '2026-09-03');
    expect(p).toMatchObject({ score: 0.25, available: 1, of: 4 });
    expect(p.down).toHaveLength(3);
    expect(p.down[0]).toContain('28 pitches yesterday');
    expect(penAvailability([], '2026-09-03').score).toBeNull();
  });

  it('starter leash from the last three starts', () => {
    const log = [
      { date: '2026-08-10', stat: { gamesStarted: 1, numberOfPitches: 95 } },
      { date: '2026-08-16', stat: { gamesStarted: 1, numberOfPitches: 88 } },
      { date: '2026-08-22', stat: { gamesStarted: 0, numberOfPitches: 20 } }, // relief, ignored
      { date: '2026-08-28', stat: { gamesStarted: 1, numberOfPitches: 91 } },
    ];
    expect(starterLeash(log, '2026-09-03')).toEqual({ expectedPitches: 91, short: false, daysSince: 6 });
    const capped = log.map((r) => ({ ...r, stat: { ...r.stat, numberOfPitches: 60 } }));
    expect(starterLeash(capped, '2026-09-03').short).toBe(true);
    expect(starterLeash(log, '2026-09-20').short).toBe(true); // 23 days since
    expect(starterLeash([], '2026-09-03')).toEqual({ expectedPitches: null, short: null, daysSince: null });
  });

  it('regulars missing from the confirmed nine', () => {
    const hitters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((n, i) => ({ player: { full_name: n }, batting_gp: 130 - i * 4 }));
    const lineup = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'X', 'Y'].map((n, i) => ({ name: n, battingOrder: i + 1 }));
    const l = lineupAbsence(lineup, hitters);
    expect(l.count).toBe(2);
    expect(l.missing).toEqual(['H', 'I']);
    expect(lineupAbsence(lineup.slice(0, 8), hitters).count).toBeNull();
    expect(lineupAbsence(lineup, []).count).toBeNull();
  });
});

describe('shadow marketModel — the decision', () => {
  const features = (over = {}) => ({
    home: { pen: { score: 1, available: 4, of: 4, down: [] }, lineup: { missing: [], count: 0 }, leash: { short: false }, ...(over.home || {}) },
    away: { pen: { score: 0.5, available: 2, of: 4, down: ['x', 'y'] }, lineup: { missing: [], count: 0 }, leash: { short: false }, ...(over.away || {}) },
  });

  it('adjusts toward home when the away pen is short, and records every driver', () => {
    const a = adjust(features());
    expect(a.pts).toBe(1);
    expect(a.drivers).toHaveLength(1);
    expect(a.drivers[0].name).toBe('pen availability');
    const b = adjust(features({ home: { lineup: { missing: ['Star', 'Second'], count: 2 }, leash: { short: true, expectedPitches: 62, daysSince: 5 } } }));
    expect(b.pts).toBeCloseTo(1 - 1.6 - 1.0, 5);
    expect(b.drivers.map((d) => d.name)).toEqual(['pen availability', 'home regulars missing', 'home starter short leash']);
  });

  it('caps the total adjustment', () => {
    const big = adjust(features({ home: { lineup: { missing: ['a', 'b', 'c', 'd'], count: 4 }, leash: { short: true } } }), { ...DEFAULT_WEIGHTS, lineup: 3 });
    expect(big.pts).toBe(-4);
  });

  it('prices every ticket and picks the best; a moneyline wins ties', () => {
    const market = marketFromBoard(board);
    const r = priceTickets({ pHomeAdj: 0.60, board, market, homeName: 'Red Sox', awayName: 'Mariners', deltaPts: 3 });
    expect(r.tickets).toHaveLength(4);
    expect(r.tickets.map((t) => t.label)).toContain('Red Sox -1.5');
    expect(r.choice.ev).toBe(Math.max(...r.tickets.map((t) => t.ev)));
    const ml = r.tickets.find((t) => t.label === 'Red Sox ML');
    expect(ml.ev).toBeCloseTo(0.6 * profitPerUnit(-144) - 0.4, 4);
    // a dead tie goes to the moneyline
    const tie = priceTickets({ pHomeAdj: 0.5, board: { moneyline_home: -110, moneyline_away: -110, spread_home: -1.5, spread_home_odds: -110, spread_away: 1.5, spread_away_odds: -110 }, market: { pHome: 0.5, runline: { fav: 'home', pFavCover: 0.5 } }, homeName: 'H', awayName: 'A', deltaPts: 0 });
    expect(tie.choice.type).toBe('moneyline');
  });

  it('decide: start from the market, move for tonight, take the best ticket; least-bad when all are negative', () => {
    const d = decide({ board, features: features(), homeName: 'Red Sox', awayName: 'Mariners' });
    expect(d.ok).toBe(true);
    expect(d.pHomeMarket).toBeCloseTo(0.5673, 3);
    expect(d.pHomeAdj).toBeCloseTo(0.5773, 3);
    expect(d.choice.side).toBe('home');
    const flat = decide({ board, features: features({ away: { pen: { score: 1, available: 4, of: 4, down: [] } } }), homeName: 'Red Sox', awayName: 'Mariners' });
    expect(flat.adjustment.pts).toBe(0);
    expect(flat.choice).toBeTruthy(); // every game gets a bet
    expect(flat.tickets.every((t) => t.ev <= 0)).toBe(true);
    expect(decide({ board: {}, features: features(), homeName: 'a', awayName: 'b' }).ok).toBe(false);
  });
});

describe('shadow marketModel — names', () => {
  it('matches accented and plain spellings of the same man', async () => {
    const { nameKey, lineupAbsence } = await import('../../../src/services/shadow/marketModel.js');
    expect(nameKey('José Ramírez')).toBe(nameKey('Jose Ramirez'));
    const hitters = ['Jose Ramirez', 'Andres Gimenez', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((n, i) => ({ player: { full_name: n }, batting_gp: 120 - i }));
    const lineup = ['José Ramírez', 'Andrés Giménez', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((n, i) => ({ name: n, battingOrder: i + 1 }));
    expect(lineupAbsence(lineup, hitters).count).toBe(0);
  });
});
