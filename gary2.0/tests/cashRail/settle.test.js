import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { settleNfl } from '../../src/services/cashRail/settle.js';

// Last week's NE @ CHI (BDL plays, saved by the live probe). CHI won 30–24.
const { game, plays } = JSON.parse(readFileSync(new URL('../fixtures/cashRail/ne-chi-plays.json', import.meta.url), 'utf8'));

const SWIFT = 465, MAYE = 279866, WILLIAMS = 277867, ODUNZE = 277866;
const players = { [SWIFT]: "D'Andre Swift", [MAYE]: 'Drake Maye', [WILLIAMS]: 'Caleb Williams', [ODUNZE]: 'Rome Odunze', 9001: 'Jaylon Johnson' };
const m = (playerId, propType, kind, line, label, price) => ({ key: `${playerId}|${propType}|${kind}|${line}`, playerId, propType, kind, line, label, price });

const markets = [
  m(SWIFT, 'first_td', 'milestone', 0.5, 'First TD', 600),
  m(MAYE, 'first_td', 'milestone', 0.5, 'First TD', 2000),
  m(MAYE, 'anytime_td', 'milestone', 1, '1+', 260),
  m(WILLIAMS, 'anytime_td', 'milestone', 1, '1+', 900),
  m(ODUNZE, 'receiving_yards', 'over', 52.5, 'O 52.5', -115),
  m(ODUNZE, 'receiving_yards', 'milestone', 60, '60+', 130),
  m(ODUNZE, 'receiving_yards', 'milestone', 70, '70+', 210),
  { key: 'game|total|over|50.5', playerId: null, propType: 'game_total', kind: 'over', line: 50.5, label: 'O 50.5', price: -105 },
  { key: 'game|spread|home|-3.5', playerId: null, propType: 'game_spread_home', kind: 'spread', line: -3.5, label: '-3.5', price: -110 },
  { key: 'game|spread|away|3.5', playerId: null, propType: 'game_spread_away', kind: 'spread', line: 3.5, label: '+3.5', price: -110 },
  { key: 'game|ml|home', playerId: null, propType: 'game_ml_home', kind: 'ml', line: null, label: 'ML', price: -170 },
];
const settle = (ps = plays, g = game, more = {}) => settleNfl({ markets, plays: ps, game: g, players, garyPick: null, ...more });
const hit = (out, key) => out.hits.find(h => h.key === key);

describe('settleNfl on NE @ CHI', () => {
  it('cashes first TD for the first touchdown\'s scorer only', () => {
    const out = settle();
    expect(hit(out, `${SWIFT}|first_td`)).toMatchObject({ who: "D'Andre Swift", market: 'First TD scorer', price: 600, when: 'Q1 1:38', elapsed: 802 });
    expect(hit(out, `${MAYE}|first_td`)).toBeUndefined();
  });

  it('cashes anytime TD for a quarterback who runs one in, never for the passer of a TD pass', () => {
    const out = settle();
    expect(hit(out, `${MAYE}|anytime_td|1`)).toMatchObject({ market: 'Anytime TD', price: 260, when: 'Q2 11:33' });
    expect(hit(out, `${WILLIAMS}|anytime_td|1`)).toBeUndefined();
  });

  it('climbs a yardage ladder on the exact play that crosses each rung and stops where he stops', () => {
    const h = hit(settle(), `${ODUNZE}|receiving_yards`);
    expect(h.rungs).toEqual([{ label: 'O 52.5', price: -115 }, { label: '60+', price: 130 }]);
    expect(h).toMatchObject({ who: 'Rome Odunze', market: 'Rec yards', price: 130, when: 'Q4 3:32', elapsed: 3388 });
    expect(h.play).toBe('21-yd catch · 69 yds');
  });

  it('cashes the game total over on the score that crosses it, and the spread and moneyline at the final', () => {
    const out = settle();
    expect(hit(out, 'game|total|over|50.5')).toMatchObject({ who: 'Game total', market: 'Over 50.5', when: 'Q4 1:34' });
    expect(hit(out, 'game|spread|home|-3.5')).toMatchObject({ who: 'Bears', market: 'Spread −3.5', when: 'FINAL' });
    expect(hit(out, 'game|ml|home')).toMatchObject({ who: 'Bears', market: 'Moneyline', when: 'FINAL' });
    expect(hit(out, 'game|spread|away|3.5')).toBeUndefined();
  });

  it('reports the game state from the last play', () => {
    const out = settle();
    expect(out).toMatchObject({ status: 'final', clock: 'FINAL', elapsed_s: 3600 });
    const mid = settle(plays.slice(0, 60), { ...game, status_state: 'in' });
    expect(mid.status).toBe('live');
    expect(mid.clock).toMatch(/^Q\d \d{1,2}:\d{2}$/);
    expect(mid.possession).toMatch(/^(NE|CHI)$/);
  });

  it('is idempotent', () => {
    expect(settle()).toEqual(settle());
  });

  it('drops a hit when its play is gone (a touchdown taken back)', () => {
    const without = plays.filter(p => p.id !== '401873010832');
    const out = settle(without);
    expect(hit(out, `${SWIFT}|first_td`)).toBeUndefined();
  });

  it('keeps settling in overtime, past 3600 seconds', () => {
    const ot = { id: 'ot1', type_slug: 'rush', period: 5, clock_display: '6:00', stat_yardage: 30, scoring_play: false,
      participants: [{ player_id: ODUNZE, type: 'rusher' }], team: { abbreviation: 'CHI' } };
    const otMarkets = [...markets, m(ODUNZE, 'rushing_yards', 'milestone', 25, '25+', 900)];
    const out = settleNfl({ markets: otMarkets, plays: [...plays.filter(p => p.type_slug !== 'end-of-game'), ot], game: { ...game, status_state: 'in' }, players, garyPick: null });
    expect(hit(out, `${ODUNZE}|rushing_yards`)).toMatchObject({ elapsed: 3840, when: 'OT 6:00' });
  });

  it('counts an interception returned for a touchdown as the defender\'s anytime TD', () => {
    const pick6 = { id: 'p6', type_slug: 'interception-return-touchdown', period: 4, clock_display: '0:20', stat_yardage: 0, scoring_play: true,
      away_score: 31, home_score: 30, participants: [{ player_id: MAYE, type: 'passer' }, { player_id: 9001, type: 'interception_returner' }], team: { abbreviation: 'NE' } };
    const out = settleNfl({ markets: [...markets, m(9001, 'anytime_td', 'milestone', 1, '1+', 2500)], plays: [...plays.filter(p => p.type_slug !== 'end-of-game'), pick6], game: { ...game, status_state: 'in' }, players, garyPick: null });
    expect(hit(out, '9001|anytime_td|1')).toMatchObject({ who: 'Jaylon Johnson', price: 2500 });
    expect(hit(out, `${MAYE}|anytime_td|1`).when).toBe('Q2 11:33');
  });

  it('marks the game hit that is Gary\'s pick', () => {
    const out = settle(plays, game, { garyPick: { type: 'spread', side: 'home', line: -3.5 } });
    expect(hit(out, 'game|spread|home|-3.5').gary).toBe(true);
    expect(hit(out, 'game|ml|home').gary).toBeUndefined();
  });

  it('never shows a bet for a player it has no name for', () => {
    const out = settleNfl({ markets, plays, game, players: {}, garyPick: null });
    expect(out.hits.every(h => h.key.startsWith('game|'))).toBe(true);
  });
});
