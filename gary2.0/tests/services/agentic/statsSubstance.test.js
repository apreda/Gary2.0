import { describe, it, expect } from 'vitest';
import {
  countRealStats,
  countRealVerifiedTaleRows,
  shouldReuseScoutReport
} from '../../../src/services/agentic/statsSubstance.js';

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

describe('football verified-tape scout cache policy', () => {
  const tape = (rows) => ({ verifiedTaleOfTape: { rows } });

  it('refuses an NFL scout whose only populated rows are metadata', () => {
    const scout = tape([
      { token: 'L5_FORM', home: { value: 'N/A' }, away: { value: 'N/A' } },
      { token: 'RECORD', home: { value: '12-5' }, away: { value: '9-8' } },
      { token: 'POINTS_GM', home: { value: 'N/A' }, away: { value: 'N/A' } },
      { token: 'KEY_INJURIES', home: { value: 'None' }, away: { value: 'Player (O)' } }
    ]);

    expect(countRealVerifiedTaleRows(scout.verifiedTaleOfTape)).toBe(0);
    expect(shouldReuseScoutReport(scout, 'americanfootball_nfl')).toBe(false);
  });

  it('reuses an NFL scout with a genuine performance value, including zero', () => {
    const scout = tape([
      { token: 'POINTS_GM', home: { value: 0 }, away: { value: '24.3' } }
    ]);

    expect(countRealVerifiedTaleRows(scout.verifiedTaleOfTape)).toBe(1);
    expect(shouldReuseScoutReport(scout, 'NFL')).toBe(true);
  });

  it('refuses an all-missing NCAAF opener scout so a later tier can rebuild it', () => {
    const scout = tape([
      { token: 'RECORD', home: { value: 'N/A' }, away: { value: 'N/A' } },
      { token: 'PASS_YDS_GM', home: { value: 'N/A' }, away: { value: 'N/A' } },
      { token: 'RUSH_YDS_GM', home: { value: 'N/A' }, away: { value: 'N/A' } },
      { token: 'KEY_INJURIES', home: { value: 'None' }, away: { value: 'None' } },
    ]);

    expect(countRealVerifiedTaleRows(scout.verifiedTaleOfTape)).toBe(0);
    expect(shouldReuseScoutReport(scout, 'americanfootball_ncaaf')).toBe(false);
  });

  it('refuses an old all-zero NCAAF opener cache but keeps zeros beside played-game evidence', () => {
    const placeholder = tape([
      { token: 'PASS_YDS_GM', home: { value: '0.0' }, away: { value: 0 } },
      { token: 'RUSH_YDS_GM', home: { value: 0 }, away: { value: '0.0' } },
    ]);
    expect(shouldReuseScoutReport(placeholder, 'NCAAF')).toBe(false);

    const played = tape([
      { token: 'PASS_YDS_GM', home: { value: '248.5' }, away: { value: 0 } },
      { token: 'RUSH_YDS_GM', home: { value: 0 }, away: { value: '166.0' } },
    ]);
    expect(shouldReuseScoutReport(played, 'americanfootball_ncaaf')).toBe(true);
  });

  it('does not change non-NFL cache reuse behavior', () => {
    const allMissing = tape([
      { token: 'STARTER_ERA', home: { value: 'N/A' }, away: { value: 'N/A' } }
    ]);
    expect(shouldReuseScoutReport(allMissing, 'baseball_mlb')).toBe(true);
  });
});
