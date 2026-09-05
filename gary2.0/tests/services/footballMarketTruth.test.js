import { describe, expect, it } from 'vitest';
import {
  americanImpliedProbability,
  homeSpreadReference,
  spreadForSide,
  footballMarketUnavailable,
} from '../../src/services/marketTruth.js';
import { validateSpreadMLDirection } from '../../src/services/oddsService.js';

describe('football market-side truth', () => {
  it('requires an actual spread and valid price on at least one selectable side', () => {
    for (const game of [{}, { spread_home: -3.5 }, { spread_home_odds: -110 },
      { spread_home: 0, spread_home_odds: 0 }, { spread_home: 0, spread_home_odds: '' },
      { spread_home: 0, spread_home_odds: -110.5 }]) {
      expect(footballMarketUnavailable(game, 'NCAAF')?.code).toBe('market_unavailable');
    }
    expect(footballMarketUnavailable({ spread_home: 0, spread_home_odds: -110 }, 'NCAAF')).toBeNull();
    expect(footballMarketUnavailable({ spread_away: 3.5, spread_away_odds: '-105' }, 'NFL')).toBeNull();
    expect(footballMarketUnavailable({}, 'MLB')).toBeNull();
  });
  it('derives the canonical home reference by negating an away-only line', () => {
    expect(homeSpreadReference({ spread_home: -2.5, spread_away: 2.5 })).toBe(-2.5);
    expect(homeSpreadReference({ spread_home: null, spread_away: 2.5 })).toBe(-2.5);
    expect(homeSpreadReference({ spread_home: null, spread_away: -2.5 })).toBe(2.5);
    expect(homeSpreadReference({}, 0)).toBe(0);
  });

  it('prefers explicit selected-side lines and derives only missing sides', () => {
    expect(spreadForSide({ spread_home: -3.5, spread_away: 4 }, 'away')).toBe(4);
    expect(spreadForSide({ spread_home: -3.5, spread_away: null }, 'away')).toBe(3.5);
    expect(spreadForSide({ spread_home: null, spread_away: 4 }, 'home')).toBe(-4);
  });

  it('compares both moneyline implied probabilities on both-negative boards', () => {
    expect(americanImpliedProbability(-115)).toBeGreaterThan(americanImpliedProbability(-105));
    expect(validateSpreadMLDirection({
      spread_home: 1.5,
      moneyline_home: -105,
      moneyline_away: -115,
    }, 'book', 'americanfootball_nfl')).toBe(true);
    expect(validateSpreadMLDirection({
      spread_home: -1.5,
      moneyline_home: -115,
      moneyline_away: -105,
    }, 'book', 'americanfootball_nfl')).toBe(true);
  });

  it('still rejects a genuine spread/moneyline direction mismatch', () => {
    expect(validateSpreadMLDirection({
      spread_home: -2.5,
      moneyline_home: 130,
      moneyline_away: -150,
    }, 'book', 'americanfootball_nfl')).toBe(false);
  });

  it('keeps MLB run-line direction exempt', () => {
    expect(validateSpreadMLDirection({
      spread_home: -1.5,
      moneyline_home: 130,
      moneyline_away: -150,
    }, 'book', 'baseball_mlb')).toBe(true);
  });
});
