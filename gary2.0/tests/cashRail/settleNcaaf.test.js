import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { settleNcaaf } from '../../src/services/cashRail/settleNcaaf.js';

// Oct 24 2026 SDSU @ Colorado State (BDL college plays + box score, saved from the live API). CSU won 56–49.
const { game, plays, stats } = JSON.parse(readFileSync(new URL('../fixtures/cashRail/sdsu-csu-ncaaf.json', import.meta.url), 'utf8'));

const HEJNY = 56065, HAWKINS = 82274, ROBINSON = 54448, MAHER = 56334, SAUNDERS = 83498;
const players = { [HEJNY]: 'Hauss Hejny', [HAWKINS]: 'Jaylon Hawkins', [ROBINSON]: 'Durell Robinson', [MAHER]: 'Tommy Maher', [SAUNDERS]: 'Stone Saunders' };
const m = (playerId, propType, kind, line, label, price) => ({ key: `${playerId}|${propType}|${kind}|${line}`, playerId, propType, kind, line, label, price });
const markets = [
  m(ROBINSON, 'anytime_td', 'milestone', 1, '1+', 120),
  m(ROBINSON, 'anytime_td', 'milestone', 3, '3+', 1800),
  m(HAWKINS, 'receiving_yards', 'over', 74.5, 'O 74.5', -110),
  m(HAWKINS, 'receiving_yards', 'milestone', 150, '150+', 900),
  m(HEJNY, 'passing_tds', 'milestone', 3, '3+', 260),
  m(HEJNY, 'rushing_yards', 'over', 90.5, 'O 90.5', -110),
  m(MAHER, 'longest_reception', 'over', 30.5, 'O 30.5', 105),
  { key: 'game|total|over|95.5', playerId: null, propType: 'game_total', kind: 'over', line: 95.5, label: 'O 95.5', price: -110 },
  { key: 'game|spread|home|-3.5', playerId: null, propType: 'game_spread_home', kind: 'spread', line: -3.5, label: '-3.5', price: -110 },
  { key: 'game|ml|away', playerId: null, propType: 'game_ml_away', kind: 'ml', line: null, label: 'ML', price: 140 },
];
const settle = (more = {}) => settleNcaaf({ markets, plays, stats, game, players, garyPick: null, prior: [], ...more });
const hit = (out, key) => out.hits.find(h => h.key === key);

describe('settleNcaaf on SDSU @ Colorado State', () => {
  it('cashes player bets off the box score: touchdowns rung by rung, ladders at the top rung reached', () => {
    const out = settle();
    expect(hit(out, `${ROBINSON}|anytime_td|1`)).toMatchObject({ who: 'Durell Robinson', market: 'Anytime TD', price: 120 });
    expect(hit(out, `${ROBINSON}|anytime_td|3`)).toMatchObject({ market: '3+ TDs', price: 1800 });
    expect(hit(out, `${HAWKINS}|receiving_yards`)).toMatchObject({ market: 'Rec yards', price: 900,
      rungs: [{ label: 'O 74.5', price: -110 }, { label: '150+', price: 900 }], play: '164 yds' });
    expect(hit(out, `${HEJNY}|passing_tds`)).toMatchObject({ market: 'Pass TDs', price: 260 });
    expect(hit(out, `${MAHER}|longest_reception`)).toMatchObject({ market: 'Longest catch', price: 105 });
  });

  it('a line he never got past is not a hit', () => {
    expect(hit(settle(), `${HEJNY}|rushing_yards`)).toBeUndefined();
  });

  it('the total cashes on the score that took it over; the spread and moneyline at the final', () => {
    const out = settle();
    expect(hit(out, 'game|total|over|95.5')).toMatchObject({ who: 'Game total', play: expect.stringMatching(/^Made it (9[6-9]|1\d\d) points$/) });
    expect(hit(out, 'game|total|over|95.5').when).toMatch(/^Q4 \d+:\d\d$/);
    expect(hit(out, 'game|spread|home|-3.5')).toMatchObject({ who: 'Rams', when: 'FINAL', play: 'Final 56–49' });
    expect(hit(out, 'game|ml|away')).toBeUndefined();
    expect(out).toMatchObject({ status: 'final', clock: 'FINAL' });
  });

  it('live: a bet is timed when the board first sees it, and keeps that time on every pass after', () => {
    const live = { ...game, status_state: 'in', period: 2, time: '8:42' };
    const first = settle({ game: live });
    expect(first).toMatchObject({ status: 'live', clock: 'Q2 8:42' });
    expect(hit(first, `${ROBINSON}|anytime_td|1`)).toMatchObject({ when: 'Q2 8:42', elapsed: 900 + 900 - 522 });
    const later = settle({ game: { ...live, period: 3, time: '10:00' }, prior: first.hits });
    expect(hit(later, `${ROBINSON}|anytime_td|1`)).toMatchObject({ when: 'Q2 8:42' });
    expect(later.clock).toBe('Q3 10:00');
  });
});
