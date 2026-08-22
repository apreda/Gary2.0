import { describe, expect, it } from 'vitest';
import { classifyPickMarketSide } from '../../scripts/lib/pickSideClassification.js';

describe('pick-side audit classification', () => {
  it('does not mistake plus-money juice for a spread underdog', () => {
    expect(classifyPickMarketSide({
      type: 'spread',
      pick: 'Detroit Lions -0.5 +100',
      spread: -0.5,
      odds: 100,
    })).toBe('favorite');
  });

  it('classifies spreads from the authoritative spread field', () => {
    expect(classifyPickMarketSide({ type: 'spread', spread: 3.5 })).toBe('underdog');
    expect(classifyPickMarketSide({ type: 'spread', spread: 0 })).toBe('pickem');
    expect(classifyPickMarketSide({ type: 'spread', spread: null })).toBe('unknown');
  });

  it('classifies moneylines from their price', () => {
    expect(classifyPickMarketSide({ type: 'moneyline', odds: 135 })).toBe('underdog');
    expect(classifyPickMarketSide({ type: 'moneyline', odds: -155 })).toBe('favorite');
  });
});
