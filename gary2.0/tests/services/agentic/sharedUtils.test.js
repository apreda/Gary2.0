import { describe, it, expect } from 'vitest';
import {
  normalizeTeamName,
  normalizePlayerName,
  fixBdlInjuryStatus,
  formatStatValue,
  safeStatValue,
  isGameCompleted,
  buildMarketSnapshot
} from '../../../src/services/agentic/sharedUtils.js';

// ─── normalizeTeamName ────────────────────────────────────────────────
describe('normalizeTeamName', () => {
  it('lowercases and trims', () => {
    expect(normalizeTeamName('  Boston Celtics  ')).toBe('boston celtics');
  });

  it('replaces city aliases', () => {
    expect(normalizeTeamName('Los Angeles Lakers')).toBe('la lakers');
    expect(normalizeTeamName('New York Knicks')).toBe('ny knicks');
    expect(normalizeTeamName('San Antonio Spurs')).toBe('sa spurs');
    expect(normalizeTeamName('New Orleans Pelicans')).toBe('no pelicans');
    expect(normalizeTeamName('Oklahoma City Thunder')).toBe('okc thunder');
    expect(normalizeTeamName('Golden State Warriors')).toBe('gs warriors');
    expect(normalizeTeamName('Las Vegas Aces')).toBe('vegas aces');
  });

  it('handles Utah Hockey Club alias', () => {
    expect(normalizeTeamName('Utah Hockey Club')).toBe('utah');
  });

  it('strips special characters', () => {
    expect(normalizeTeamName("Trail Blazer's")).toBe('trail blazer s');
  });

  it('returns empty string for undefined/empty input', () => {
    expect(normalizeTeamName()).toBe('');
    expect(normalizeTeamName('')).toBe('');
  });

  it('throws on null (default param only covers undefined)', () => {
    expect(() => normalizeTeamName(null)).toThrow();
  });
});

// ─── normalizePlayerName ──────────────────────────────────────────────
describe('normalizePlayerName', () => {
  it('lowercases and strips periods', () => {
    expect(normalizePlayerName('D.J. Moore')).toBe('dj moore');
  });

  it('strips Jr/Sr/III suffixes', () => {
    expect(normalizePlayerName('Robert Griffin III')).toBe('robert griffin');
    expect(normalizePlayerName('Gary Trent Jr.')).toBe('gary trent');
  });

  it('handles apostrophes', () => {
    expect(normalizePlayerName("De'Aaron Fox")).toBe('deaaron fox');
  });

  it('returns empty for null/undefined', () => {
    expect(normalizePlayerName(null)).toBe('');
    expect(normalizePlayerName(undefined)).toBe('');
  });
});

// ─── fixBdlInjuryStatus ──────────────────────────────────────────────
describe('fixBdlInjuryStatus', () => {
  it('marks season-ending keywords as SEASON-LONG', () => {
    const injury = { status: 'Out', description: 'Jan 5: ACL tear, out for the season' };
    const result = fixBdlInjuryStatus(injury);
    expect(result.duration).toBe('SEASON-LONG');
    expect(result.isEdge).toBe(false);
  });

  it('corrects Out status when latest update says questionable', () => {
    const injury = { status: 'Out', description: 'Feb 5: Questionable with ankle soreness' };
    const result = fixBdlInjuryStatus(injury);
    expect(result.status).toBe('Questionable');
  });

  it('keeps Out status when description has historical questionable but latest is ruled out', () => {
    const injury = { status: 'Out', description: 'Feb 5: Questionable with calf concern; Feb 7: Ruled out for Saturday' };
    const result = fixBdlInjuryStatus(injury);
    expect(result.status).toBe('Out');
  });

  it('keeps Out status when description mentions questionable historically then out for game', () => {
    const injury = { status: 'Out', description: 'Feb 3: Questionable with knee soreness. Feb 5: Will not play Saturday' };
    const result = fixBdlInjuryStatus(injury);
    expect(result.status).toBe('Out');
  });

  it('marks surgery as SEASON-LONG', () => {
    const injury = { status: 'Out', description: 'Oct 1: Underwent surgery on right knee' };
    const result = fixBdlInjuryStatus(injury);
    expect(result.duration).toBe('SEASON-LONG');
    expect(result.isEdge).toBe(false);
  });

  it('returns null/undefined input unchanged', () => {
    expect(fixBdlInjuryStatus(null)).toBeNull();
    expect(fixBdlInjuryStatus(undefined)).toBeUndefined();
  });
});

// applyBuyTheHook tests removed Jul 6 2026: the function was deleted from
// sharedUtils in an earlier cleanup and these tests had been failing against
// a function that no longer exists.

// ─── formatStatValue / safeStatValue ──────────────────────────────────
describe('formatStatValue', () => {
  it('formats numbers to specified decimals', () => {
    expect(formatStatValue(3.14159, 2)).toBe(3.14);
  });

  it('returns N/A for null/undefined/NaN', () => {
    expect(formatStatValue(null)).toBe('N/A');
    expect(formatStatValue(undefined)).toBe('N/A');
    expect(formatStatValue(NaN)).toBe('N/A');
  });

  it('passes through strings', () => {
    expect(formatStatValue('hello')).toBe('hello');
  });
});

describe('safeStatValue', () => {
  it('returns the number when valid', () => {
    expect(safeStatValue(0)).toBe(0);
    expect(safeStatValue(42)).toBe(42);
  });

  it('returns null for missing values', () => {
    expect(safeStatValue(null)).toBeNull();
    expect(safeStatValue(undefined)).toBeNull();
    expect(safeStatValue(NaN)).toBeNull();
  });
});

// ─── isGameCompleted ──────────────────────────────────────────────────
describe('isGameCompleted', () => {
  it('recognizes various final statuses', () => {
    expect(isGameCompleted('Final')).toBe(true);
    expect(isGameCompleted('final')).toBe(true);
    expect(isGameCompleted('FINAL')).toBe(true);
    expect(isGameCompleted('post')).toBe(true);
    expect(isGameCompleted('completed')).toBe(true);
  });

  it('rejects non-final statuses', () => {
    expect(isGameCompleted('in_progress')).toBe(false);
    expect(isGameCompleted('scheduled')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isGameCompleted(null)).toBe(false);
    expect(isGameCompleted(undefined)).toBe(false);
    expect(isGameCompleted('')).toBe(false);
  });
});

// ─── buildMarketSnapshot ──────────────────────────────────────────────
describe('buildMarketSnapshot', () => {
  it('returns empty snapshot for no bookmakers', () => {
    const snap = buildMarketSnapshot([], 'Home', 'Away');
    expect(snap.spread.home).toBeNull();
    expect(snap.spread.away).toBeNull();
    expect(snap.moneyline.home).toBeNull();
    expect(snap.moneyline.away).toBeNull();
    expect(snap.total).toBeNull();
  });

  it('extracts spreads and moneylines correctly', () => {
    const bookmakers = [{
      title: 'FanDuel',
      markets: [
        {
          key: 'spreads',
          outcomes: [
            { name: 'Boston Celtics', price: -110, point: -5.5 },
            { name: 'LA Lakers', price: -110, point: 5.5 }
          ]
        },
        {
          key: 'h2h',
          outcomes: [
            { name: 'Boston Celtics', price: -220, point: undefined },
            { name: 'LA Lakers', price: 180, point: undefined }
          ]
        }
      ]
    }];

    const snap = buildMarketSnapshot(bookmakers, 'Boston Celtics', 'Los Angeles Lakers');
    expect(snap.spread.home.point).toBe(-5.5);
    expect(snap.spread.away.point).toBe(5.5);
    expect(snap.moneyline.home.price).toBe(-220);
    expect(snap.moneyline.away.price).toBe(180);
  });

  it('extracts game totals', () => {
    const bookmakers = [{
      title: 'DraftKings',
      markets: [{
        key: 'totals',
        outcomes: [
          { name: 'Over', point: 215.5, price: -110 },
          { name: 'Under', point: 215.5, price: -110 }
        ]
      }]
    }];

    const snap = buildMarketSnapshot(bookmakers, 'Home', 'Away');
    expect(snap.total.line).toBe(215.5);
    expect(snap.total.over.price).toBe(-110);
    expect(snap.total.under.price).toBe(-110);
  });
});
