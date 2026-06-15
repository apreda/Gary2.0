import { describe, it, expect } from 'vitest';
import { countRealStats } from '../../../src/services/agentic/statsSubstance.js';

// A pick whose Tale of the Tape is entirely "N/A" means the stats pipeline
// returned nothing — Gary couldn't have analyzed the game. This helper backs the
// hard-fail gate that rejects such picks before they're ever stored.
describe('countRealStats — no-stats hard-fail gate', () => {
  const map = { xG: 'xg', POSS: 'poss' };

  it('returns 0 when every value is N/A (the broken WC case)', () => {
    const stats = [
      { token: 'xG', home: { team: 'A', xg: 'N/A' }, away: { team: 'B', xg: 'N/A' } },
      { token: 'POSS', home: { team: 'A', poss: 'N/A' }, away: { team: 'B', poss: 'N/A' } },
    ];
    expect(countRealStats(stats, map)).toBe(0);
  });

  it('counts a row with at least one real value', () => {
    const stats = [
      { token: 'xG', home: { team: 'A', xg: '1.8' }, away: { team: 'B', xg: 'N/A' } },
      { token: 'POSS', home: { team: 'A', poss: 'N/A' }, away: { team: 'B', poss: 'N/A' } },
    ];
    expect(countRealStats(stats, map)).toBe(1);
  });

  it('falls back to lowercased token when no map entry exists', () => {
    const stats = [{ token: 'PPG', home: { team: 'A', ppg: '112.4' }, away: { team: 'B', ppg: '108.1' } }];
    expect(countRealStats(stats, {})).toBe(1);
  });

  it('treats null/empty/whitespace as not real', () => {
    const stats = [
      { token: 'xG', home: { team: 'A', xg: '' }, away: { team: 'B', xg: null } },
      { token: 'POSS', home: { team: 'A', poss: 'N/A' }, away: { team: 'B' } },
    ];
    expect(countRealStats(stats, map)).toBe(0);
  });

  it('handles empty / non-array input safely', () => {
    expect(countRealStats([], map)).toBe(0);
    expect(countRealStats(null, map)).toBe(0);
    expect(countRealStats(undefined)).toBe(0);
  });
});
