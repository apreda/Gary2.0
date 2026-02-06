import { describe, it, expect } from 'vitest';
import {
  normalizeTeamName,
  mascotToken,
  resolveTeamByName,
  normalizePlayerName,
  fuzzyMatchPlayerName,
  fixBdlInjuryStatus,
  applyBuyTheHook,
  formatStatValue,
  safeStatValue,
  isGameCompleted,
  buildMarketSnapshot,
  getEstDate
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

// ─── mascotToken ──────────────────────────────────────────────────────
describe('mascotToken', () => {
  it('returns last word lowercased', () => {
    expect(mascotToken('Boston Celtics')).toBe('celtics');
    expect(mascotToken('Golden State Warriors')).toBe('warriors');
  });

  it('handles single-word names', () => {
    expect(mascotToken('Heat')).toBe('heat');
  });

  it('returns empty string for empty input', () => {
    expect(mascotToken()).toBe('');
    expect(mascotToken('')).toBe('');
  });
});

// ─── resolveTeamByName ────────────────────────────────────────────────
describe('resolveTeamByName', () => {
  const teams = [
    { id: 1, full_name: 'Boston Celtics' },
    { id: 2, full_name: 'Los Angeles Lakers' },
    { id: 3, full_name: 'Golden State Warriors' },
  ];

  it('matches exact full name', () => {
    expect(resolveTeamByName('Boston Celtics', teams)).toEqual(teams[0]);
  });

  it('matches via city alias normalization', () => {
    expect(resolveTeamByName('LA Lakers', teams)).toEqual(teams[1]);
  });

  it('matches via mascot token', () => {
    expect(resolveTeamByName('Warriors', teams)).toEqual(teams[2]);
  });

  it('returns null for no match', () => {
    expect(resolveTeamByName('Toronto Raptors', teams)).toBeNull();
  });

  it('returns null for empty/invalid input', () => {
    expect(resolveTeamByName('', teams)).toBeNull();
    expect(resolveTeamByName('Celtics', null)).toBeNull();
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

// ─── fuzzyMatchPlayerName ─────────────────────────────────────────────
describe('fuzzyMatchPlayerName', () => {
  it('matches exact after normalization', () => {
    expect(fuzzyMatchPlayerName('LeBron James', 'lebron james')).toBe(true);
  });

  it('matches D.J. vs DJ', () => {
    expect(fuzzyMatchPlayerName('D.J. Moore', 'DJ Moore')).toBe(true);
  });

  it('matches abbreviated first name', () => {
    expect(fuzzyMatchPlayerName('J. Smith', 'John Smith')).toBe(true);
  });

  it('rejects different players', () => {
    expect(fuzzyMatchPlayerName('LeBron James', 'Kevin Durant')).toBe(false);
  });

  it('matches partial name inclusion', () => {
    expect(fuzzyMatchPlayerName('LeBron', 'LeBron James')).toBe(true);
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

  it('corrects Out status when description says questionable', () => {
    const injury = { status: 'Out', description: 'Feb 5: Questionable with ankle soreness' };
    const result = fixBdlInjuryStatus(injury);
    expect(result.status).toBe('Questionable');
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

// ─── applyBuyTheHook ──────────────────────────────────────────────────
describe('applyBuyTheHook', () => {
  it('buys hook on negative half-point spread', () => {
    const result = applyBuyTheHook(-7.5, -110);
    expect(result.spread).toBe(-7);
    expect(result.odds).toBe(-120);
    expect(result.hooked).toBe(true);
  });

  it('buys hook on positive half-point spread', () => {
    const result = applyBuyTheHook(3.5, -110);
    expect(result.spread).toBe(3);
    expect(result.odds).toBe(-120);
    expect(result.hooked).toBe(true);
  });

  it('does not hook whole-number spreads', () => {
    const result = applyBuyTheHook(-7, -110);
    expect(result.hooked).toBe(false);
    expect(result.spread).toBe(-7);
    expect(result.odds).toBe(-110);
  });

  it('handles non-number inputs', () => {
    const result = applyBuyTheHook(null, -110);
    expect(result.hooked).toBe(false);
  });
});

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

// ─── getEstDate ───────────────────────────────────────────────────────
describe('getEstDate', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getEstDate(new Date('2026-02-06T12:00:00Z'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles string input', () => {
    const result = getEstDate('2026-01-15T00:00:00Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
