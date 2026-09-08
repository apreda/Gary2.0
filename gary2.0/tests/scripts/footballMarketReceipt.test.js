import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { exactFootballMarketBook } from '../../scripts/lib/footballMarketReceipt.js';

describe('football exact sportsbook receipt', () => {
  const board = [
    { book: 'draftkings', spread: -3, spread_odds: -118, ml: -170 },
    { book: 'fanduel', spread: -3.5, spread_odds: -104, ml: -180 },
    { book: 'fanatics', spread: -3.5, spread_odds: 100, ml: -180 },
    { book: 'betrivers', spread: -3.5, spread_odds: -104, ml: -195 },
  ];
  const pick = { type: 'spread', pick: 'Seattle Seahawks -3.5 -104', spread: -3.5, spreadOdds: -104, odds: -104 };
  it('recovers the opening-night desk book without moving its ticket', () => {
    const before = structuredClone({ board, pick });
    expect(exactFootballMarketBook(board, pick, 'FanDuel')).toBe('fanduel');
    expect({ board, pick }).toEqual(before);
  });
  it('requires both the exact selected-side spread and price', () => {
    expect(exactFootballMarketBook(board, { ...pick, spread: 3.5 }, 'fanduel')).toBeNull();
    expect(exactFootballMarketBook(board, { ...pick, spreadOdds: -110 }, 'fanduel')).toBeNull();
    expect(exactFootballMarketBook(board, { ...pick, book: 'draftkings' }, 'fanduel')).toBe('fanduel');
  });
  it('accepts numeric strings and the odds fallback when spreadOdds is absent', () => {
    expect(exactFootballMarketBook(board, { ...pick, spread: '-3.5', spreadOdds: null }, 'fanduel')).toBe('fanduel');
  });
  it('retains exact moneyline and directional total matching', () => {
    expect(exactFootballMarketBook(board, { type: 'moneyline', odds: -170 })).toBe('draftkings');
    const totals = [{ book: 'fanduel', total: '44.5', total_over_odds: -110, total_under_odds: -105 }];
    expect(exactFootballMarketBook(totals, { type: 'total', pick: 'Under 44.5', total: 44.5, odds: -105 })).toBe('fanduel');
    expect(exactFootballMarketBook(totals, { type: 'total', pick: 'Over 44.5', total: 44.5, odds: -105 })).toBeNull();
  });
  it.each([null, '', 0, -99])('does not name a book for invalid odds %s', odds => {
    expect(exactFootballMarketBook([{ book: 'fanduel', spread: -3.5, spread_odds: odds }], { ...pick, spreadOdds: odds, odds })).toBeNull();
  });
  it('uses the exact receipt for football publication fields in the runner', () => {
    const source = readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');
    expect(source).toContain('exactFootballMarketBook(sportsbookOdds,');
    expect(source).toContain('spreadOdds: finalSpreadOdds }, game.line_vendor)');
    expect(source).toContain('const bestLineBook = isFootballPick ? exactFootballBook');
  });
});
