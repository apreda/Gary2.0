import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { freezeBoard } from '../../src/services/cashRail/prices.js';

const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/cashRail/${name}`, import.meta.url), 'utf8'));
const row = (vendor, prop_type, line_value, market, player_id = 7) => ({ game_id: 1, player_id, vendor, prop_type, line_value, market });
const dec = p => (p > 0 ? 1 + p / 100 : 1 + 100 / -p);

describe('freezeBoard', () => {
  it('keeps the best price across books for the same rung', () => {
    const { markets } = freezeBoard([
      row('fanduel', 'receiving_yards', '70', { type: 'milestone', odds: 140 }),
      row('draftkings', 'receiving_yards', '70', { type: 'milestone', odds: 150 }),
    ], []);
    expect(markets).toEqual([{ key: '7|receiving_yards|milestone|70', playerId: 7, propType: 'receiving_yards', kind: 'milestone', line: 70, label: '70+', price: 150 }]);
  });

  it('takes only the over side of an over/under', () => {
    const { markets } = freezeBoard([row('fanduel', 'receiving_yards', '58.5', { type: 'over_under', over_odds: -113, under_odds: -105 })], []);
    expect(markets).toEqual([{ key: '7|receiving_yards|over|58.5', playerId: 7, propType: 'receiving_yards', kind: 'over', line: 58.5, label: 'O 58.5', price: -113 }]);
  });

  it('drops prop types it cannot settle and rows without a price', () => {
    const { markets } = freezeBoard([
      row('fanduel', 'kicking_points', '7', { type: 'milestone', odds: 120 }),
      row('fanduel', 'receptions', '5', { type: 'milestone', odds: null }),
    ], []);
    expect(markets).toEqual([]);
  });

  it('labels touchdown ladders and first TD the way the board reads them', () => {
    const { markets } = freezeBoard([
      row('fanduel', 'anytime_td', '1', { type: 'milestone', odds: 175 }),
      row('fanduel', 'anytime_td', '2', { type: 'milestone', odds: 1400 }),
      row('caesars', 'first_td', '0.5', { type: 'milestone', odds: 1000 }),
    ], []);
    expect(markets.map(m => [m.propType, m.label, m.price])).toEqual([
      ['anytime_td', '1+', 175], ['anytime_td', '2+', 1400], ['first_td', 'First TD', 1000],
    ]);
  });

  it('freezes the game lines: total over, both spreads, both moneylines', () => {
    const { markets } = freezeBoard([], [
      { vendor: 'caesars', spread_home_value: '-3.5', spread_home_odds: -110, spread_away_value: '3.5', spread_away_odds: -108, moneyline_home_odds: -190, moneyline_away_odds: 159, total_value: '47', total_over_odds: -114, total_under_odds: -106 },
      { vendor: 'fanduel', spread_home_value: '-3.5', spread_home_odds: -105, spread_away_value: '3.5', spread_away_odds: -115, moneyline_home_odds: -180, moneyline_away_odds: 150, total_value: '47', total_over_odds: -110, total_under_odds: -110 },
    ]);
    const by = Object.fromEntries(markets.map(m => [m.key, m.price]));
    expect(by).toEqual({
      'game|total|over|47': -110,
      'game|spread|home|-3.5': -105,
      'game|spread|away|3.5': -108,
      'game|ml|home': -180,
      'game|ml|away': 159,
    });
  });

  it('reads a half-line milestone as the next whole number and merges it with that rung', () => {
    const { markets } = freezeBoard([
      row('fanduel', 'anytime_td', '0.5', { type: 'milestone', odds: 195 }),
      row('draftkings', 'anytime_td', '1', { type: 'milestone', odds: 180 }),
      row('fanduel', 'anytime_td', '1.5', { type: 'milestone', odds: 1450 }),
    ], []);
    expect(markets.map(m => [m.key, m.label, m.price])).toEqual([
      ['7|anytime_td|milestone|1', '1+', 195], ['7|anytime_td|milestone|2', '2+', 1450],
    ]);
  });

  it('drops rungs nobody would bet (shorter than −200)', () => {
    const { markets } = freezeBoard([
      row('draftkings', 'receiving_yards', '10', { type: 'milestone', odds: -2800 }),
      row('draftkings', 'receiving_yards', '30', { type: 'milestone', odds: -280 }),
      row('draftkings', 'receiving_yards', '40', { type: 'milestone', odds: -144 }),
    ], []);
    expect(markets.map(m => m.label)).toEqual(['40+']);
  });

  it('keeps the bets people talk about: no attempts or completions, and quarter or half windows only for touchdowns', () => {
    const { markets } = freezeBoard([
      row('fanduel', 'rushing_attempts', '15', { type: 'milestone', odds: 120 }),
      row('fanduel', 'passing_completions', '25', { type: 'milestone', odds: 130 }),
      row('fanduel', 'passing_attempts', '35', { type: 'milestone', odds: 140 }),
      row('fanduel', 'receiving_yards_1q', '30', { type: 'milestone', odds: 236 }),
      row('fanduel', 'receptions_1h', '4', { type: 'milestone', odds: 300 }),
      row('fanduel', 'anytime_td_1q', '1', { type: 'milestone', odds: 900 }),
      row('fanduel', 'anytime_td_1h', '1', { type: 'milestone', odds: 410 }),
    ], []);
    expect(markets.map(m => m.propType)).toEqual(['anytime_td_1q', 'anytime_td_1h']);
  });

  it('keeps one over line per player prop and per game total: the line most books hang', () => {
    const { markets } = freezeBoard([
      row('fanduel', 'receiving_yards', '46.5', { type: 'over_under', over_odds: -112 }),
      row('draftkings', 'receiving_yards', '45.5', { type: 'over_under', over_odds: -115 }),
      row('betmgm', 'receiving_yards', '45.5', { type: 'over_under', over_odds: -110 }),
    ], [
      { vendor: 'a', total_value: '47', total_over_odds: -110 },
      { vendor: 'b', total_value: '46.5', total_over_odds: -111 },
      { vendor: 'c', total_value: '46.5', total_over_odds: -105 },
    ]);
    expect(markets.map(m => [m.key, m.price])).toEqual([
      ['7|receiving_yards|over|45.5', -110], ['game|total|over|46.5', -105],
    ]);
  });

  it('on tonight\'s real props, every frozen price is the best book\'s price for that rung', () => {
    const props = fixture('car-gb-props.json');
    const { markets } = freezeBoard(props, fixture('car-gb-odds.json'));
    expect(markets.length).toBeGreaterThan(50);
    for (const m of markets.filter(x => x.playerId != null && x.kind === 'milestone')) {
      const offers = props.filter(r => r.player_id === m.playerId && r.prop_type === m.propType && r.market.type === 'milestone' && Math.ceil(Number(r.line_value)) === m.line)
        .map(r => r.market.odds).filter(Number.isFinite);
      expect(dec(m.price)).toBe(Math.max(...offers.map(dec)));
    }
  });
});
