import { describe, expect, it } from 'vitest';
import {
  calculateNflHitRate,
  getNflGameTotalContext,
  isSupportedNflPropType,
  isNflTouchdownPropType
} from '../../../src/services/agentic/nflPropsAgenticContext.js';

describe('NFL touchdown market coverage', () => {
  it('recognizes all supported passing, rushing, receiving, and anytime aliases', () => {
    for (const type of [
      'passing_touchdowns', 'passing_tds', 'player_pass_tds',
      'rushing_touchdowns', 'player_rush_tds',
      'receiving_touchdowns', 'player_rec_tds',
      'anytime_touchdown', 'player_anytime_td'
    ]) {
      expect(isNflTouchdownPropType(type), type).toBe(true);
    }
    expect(isNflTouchdownPropType('receiving_yards')).toBe(false);
  });

  it('accepts only exact full-game markets that the deterministic grader supports', () => {
    for (const type of [
      'passing_tds', 'passing_completions', 'rushing_attempts',
      'longest_pass', 'longest_reception', 'longest_rush',
      'rushing_receiving_yards', 'anytime_td',
    ]) {
      expect(isSupportedNflPropType(type), type).toBe(true);
    }
    expect(isSupportedNflPropType('passing_yards_1q')).toBe(false);
    expect(isSupportedNflPropType('kicking_yards')).toBe(false);
    expect(isSupportedNflPropType('')).toBe(false);
  });

  it('grades receiving-TD and anytime-TD recent hit rates from the right fields', () => {
    const games = [
      { rec_tds: 1, rush_tds: 0 },
      { rec_tds: 0, rush_tds: 1 },
      { rec_tds: 0, rush_tds: 0 }
    ];

    const receiving = calculateNflHitRate(games, 'receiving_touchdowns', 0.5);
    expect(receiving.hitsOver).toBe(1);
    expect(receiving.values).toEqual([1, 0, 0]);

    const anytime = calculateNflHitRate(games, 'anytime_touchdown', 0.5);
    expect(anytime.hitsOver).toBe(2);
    expect(anytime.values).toEqual([1, 1, 0]);
  });

  it('maps official passing and rushing attempt tokens to the verified recent log fields', () => {
    const games = [
      { pass_tds: 2, pass_comp: 24, pass_att: 33, rush_att: 7 },
      { pass_tds: 1, pass_comp: 20, pass_att: 29, rush_att: 5 },
    ];
    expect(calculateNflHitRate(games, 'passing_tds', 1.5).hitsOver).toBe(1);
    expect(calculateNflHitRate(games, 'passing_completions', 21.5).hitsOver).toBe(1);
    expect(calculateNflHitRate(games, 'passing_attempts', 30.5).hitsOver).toBe(1);
    expect(calculateNflHitRate(games, 'rushing_attempts', 6.5).hitsOver).toBe(1);
  });
});

describe('NFL game environment', () => {
  it('preserves a pick-em spread instead of treating zero as missing', () => {
    const context = getNflGameTotalContext({
      total: { line: 44 },
      spread: { home: { point: 0 } }
    }, 'Home', 'Away');

    expect(context.available).toBe(true);
    expect(context.spread).toBe(0);
    expect(context.gameScript).toBe('TOSS_UP');
    expect(context.impliedPoints.home.points).toBe(22);
    expect(context.impliedPoints.away.points).toBe(22);
  });

  it('uses the home spread to calculate implied team totals', () => {
    const context = getNflGameTotalContext({
      total: { line: 47 },
      spread: { home: { point: -3 } }
    }, 'Chiefs', 'Raiders');

    expect(context.favorite).toBe('Chiefs');
    expect(context.impliedPoints.home.points).toBe(25);
    expect(context.impliedPoints.away.points).toBe(22);
  });
});
