import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nbaPlayerTotals, settleNba } from '../../src/services/cashRail/settleNba.js';

// Oct 29 2026 CLE @ ATL (BDL NBA plays, saved from the live API). ATL won 114–111.
const { game, plays } = JSON.parse(readFileSync(new URL('../fixtures/cashRail/cle-atl-nba-plays.json', import.meta.url), 'utf8'));

const OKONGWU = 3547244, NAW = 666400, HARDEN = 192, JOHNSON = 17896040, MCCOLLUM = 303;
const players = { [OKONGWU]: 'Onyeka Okongwu', [NAW]: 'Nickeil Alexander-Walker', [HARDEN]: 'James Harden',
  [JOHNSON]: 'Jalen Johnson', [MCCOLLUM]: 'CJ McCollum' };
const m = (playerId, propType, kind, line, label, price) => ({ key: `${playerId}|${propType}|${kind}|${line}`, playerId, propType, kind, line, label, price });
const markets = [
  m(OKONGWU, 'points', 'over', 22.5, 'O 22.5', -110),
  m(OKONGWU, 'points', 'milestone', 25, '25+', 150),
  m(OKONGWU, 'points', 'milestone', 30, '30+', 320),
  m(OKONGWU, 'points_rebounds_assists', 'over', 38.5, 'O 38.5', 105),
  m(OKONGWU, 'double_double', 'milestone', 1, 'Yes', 140),
  m(NAW, 'threes', 'over', 2.5, 'O 2.5', 120),
  m(HARDEN, 'points', 'over', 25.5, 'O 25.5', -115),
  m(JOHNSON, 'assists', 'milestone', 7, '7+', 160),
  m(MCCOLLUM, 'steals', 'milestone', 2, '2+', 400),
  { key: 'game|total|over|220.5', playerId: null, propType: 'game_total', kind: 'over', line: 220.5, label: 'O 220.5', price: -110 },
  { key: 'game|spread|home|-1.5', playerId: null, propType: 'game_spread_home', kind: 'spread', line: -1.5, label: '-1.5', price: -105 },
  { key: 'game|spread|away|1.5', playerId: null, propType: 'game_spread_away', kind: 'spread', line: 1.5, label: '+1.5', price: -115 },
  { key: 'game|ml|home', playerId: null, propType: 'game_ml_home', kind: 'ml', line: null, label: 'ML', price: -118 },
  { key: 'game|ml|away', playerId: null, propType: 'game_ml_away', kind: 'ml', line: null, label: 'ML', price: 100 },
];
const settle = (ps = plays, g = game, more = {}) => settleNba({ markets, plays: ps, game: g, players, garyPick: null, ...more });
const hit = (out, key) => out.hits.find(h => h.key === key);

describe('NBA player totals from the play-by-play', () => {
  it('match the official box score for every player who scored, rebounded or passed', () => {
    const box = {
      [OKONGWU]: { points: 29, rebounds: 12, assists: 2, threes: 4, steals: 1, blocks: 1 },
      [NAW]: { points: 25, rebounds: 3, assists: 1, threes: 4, steals: 0, blocks: 1 },
      [HARDEN]: { points: 24, rebounds: 5, assists: 4, threes: 3, steals: 0, blocks: 0 },
      [JOHNSON]: { points: 17, rebounds: 8, assists: 7, threes: 2, steals: 0, blocks: 0 },
      [MCCOLLUM]: { points: 5, rebounds: 3, assists: 8, threes: 0, steals: 2, blocks: 0 },
      9: { points: 14, rebounds: 8, assists: 1, threes: 1, steals: 0, blocks: 2 },
    };
    const totals = nbaPlayerTotals(plays);
    for (const [pid, stats] of Object.entries(box)) {
      for (const [stat, v] of Object.entries(stats)) expect([pid, stat, totals.get(`${pid}|${stat}`) ?? 0]).toEqual([pid, stat, v]);
    }
  });
});

describe('settleNba on CLE @ ATL', () => {
  it('folds a player\'s points ladder into one hit at the rung he reached, never the one he missed', () => {
    const h = hit(settle(), `${OKONGWU}|points`);
    expect(h).toMatchObject({ who: 'Onyeka Okongwu', market: 'Points', price: 150,
      rungs: [{ label: 'O 22.5', price: -110 }, { label: '25+', price: 150 }] });
    expect(h.when).toMatch(/^(Q[1-4]|OT) \d+:\d\d$/);
  });

  it('cashes threes, combos, assists, steals and the double-double', () => {
    const out = settle();
    expect(hit(out, `${NAW}|threes`)).toMatchObject({ market: 'Threes', price: 120, play: '3rd three' });
    expect(hit(out, `${OKONGWU}|points_rebounds_assists`)).toMatchObject({ market: 'Pts + reb + ast', price: 105 });
    expect(hit(out, `${JOHNSON}|assists`)).toMatchObject({ market: 'Assists', price: 160, play: '7th assist' });
    expect(hit(out, `${MCCOLLUM}|steals`)).toMatchObject({ market: 'Steals', price: 400 });
    expect(hit(out, `${OKONGWU}|double_double`)).toMatchObject({ market: 'Double-double', price: 140 });
  });

  it('a line he never got past is not a hit', () => {
    expect(hit(settle(), `${HARDEN}|points`)).toBeUndefined();
  });

  it('cashes the game total on the basket that took it over, and the spread and moneyline at the final', () => {
    const out = settle();
    expect(hit(out, 'game|total|over|220.5')).toMatchObject({ who: 'Game total', market: 'Over 220.5', play: expect.stringMatching(/^Made it 22\d points$/) });
    expect(hit(out, 'game|spread|home|-1.5')).toMatchObject({ who: 'Hawks', market: 'Spread −1.5', when: 'FINAL', play: 'Final 114–111' });
    expect(hit(out, 'game|ml|home')).toMatchObject({ who: 'Hawks', market: 'Moneyline' });
    expect(hit(out, 'game|spread|away|1.5')).toBeUndefined();
    expect(hit(out, 'game|ml|away')).toBeUndefined();
    expect(out).toMatchObject({ status: 'final', clock: 'FINAL', possession: null, situation: null });
  });

  it('mid-game: only what has cashed so far, the clock off the last play, and no game lines yet', () => {
    const half = plays.filter(p => p.period <= 2);
    const out = settle(half, { ...game, status_state: 'in' });
    expect(out.status).toBe('live');
    expect(out.clock).toBe('HALF');
    expect(hit(out, 'game|ml|home')).toBeUndefined();
    const early = plays.filter(p => p.period === 1).slice(0, 40);
    const last = early[early.length - 1];
    expect(settle(early, { ...game, status_state: 'in' }).clock).toBe(`Q1 ${last.clock}`);
  });

  it('marks Gary\'s own pick', () => {
    const out = settle(plays, game, { garyPick: { type: 'spread', side: 'home', line: -1.5 } });
    expect(hit(out, 'game|spread|home|-1.5').gary).toBe(true);
  });
});

describe('settleNba situation line (the NFL card shows down and distance there)', () => {
  const ordered = [...plays].sort((a, b) => a.order - b.order);
  const live = { ...game, status_state: 'in' };
  const at = i => settle(ordered.slice(0, i + 1), live).situation;

  it('reads the latest bucket by the scorer and the shot', () => {
    expect(at(8)).toBe('MOBLEY FREE THROW');
    expect(at(18)).toBe('MOBLEY DUNK');
    expect(at(19)).toBe('ALEXANDER-WALKER THREE');
    expect(at(20)).toBe('HARDEN LAYUP');
  });

  it('a run of 8 or more unanswered reads as the run', () => {
    expect(at(116)).toBe('CLE 8–0 RUN');
  });

  it('a timeout reads as the team that called it', () => {
    expect(at(41)).toBe('ATL TIMEOUT');
  });

  it('nothing at the final, and no possession guess (basketball plays come out of order)', () => {
    const out = settle();
    expect(out.situation).toBeNull();
    expect(settle(ordered.slice(0, 21), live).possession).toBeNull();
  });
});
