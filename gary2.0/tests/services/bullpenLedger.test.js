import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bullpenLedgerDate,
  relieverBoxEntries,
  outsToIp,
} from '../../src/services/agentic/tools/statRouters/bullpenLedger.js';

const fetchersSrc = readFileSync(
  new URL('../../src/services/agentic/tools/statRouters/mlbFetchers.js', import.meta.url),
  'utf8',
);

// Aug 15 2026 KC bullpen defects (founder-authorized fix): the workload ledger
// stamped dates from the UTC gameDate instant, and counted anyone after the
// starter in the boxscore pitchers[] array — including position players
// mopping up a blowout — as a pen arm.

describe('bullpenLedgerDate', () => {
  it('prefers officialDate over the UTC gameDate instant', () => {
    // 8:10 PM ET start = next-day UTC: the exact KC failure shape.
    expect(bullpenLedgerDate({
      officialDate: '2026-08-15',
      gameDate: '2026-08-16T00:10:00Z',
    })).toBe('2026-08-15');
  });

  it('falls back to the ET calendar date of gameDate when officialDate is absent', () => {
    expect(bullpenLedgerDate({ gameDate: '2026-08-16T00:10:00Z' })).toBe('2026-08-15');
    // A day game keeps its own date either way.
    expect(bullpenLedgerDate({ gameDate: '2026-08-15T17:40:00Z' })).toBe('2026-08-15');
  });

  it('returns null when neither date exists rather than inventing one', () => {
    expect(bullpenLedgerDate({})).toBe(null);
    expect(bullpenLedgerDate(null)).toBe(null);
  });
});

describe('relieverBoxEntries', () => {
  const side = {
    pitchers: [601, 602, 603, 604],
    players: {
      ID601: { person: { fullName: 'The Starter' }, position: { code: '1', abbreviation: 'P' }, stats: { pitching: { inningsPitched: '5.0' } } },
      ID602: { person: { fullName: 'Real Reliever' }, position: { code: '1', abbreviation: 'P' }, stats: { pitching: { inningsPitched: '1.2' } } },
      ID603: { person: { fullName: 'Mop-Up Infielder' }, position: { code: '4', abbreviation: '2B' }, stats: { pitching: { inningsPitched: '1.0' } } },
      ID604: { person: { fullName: 'Two-Way Arm' }, position: { code: 'Y', abbreviation: 'TWP' }, stats: { pitching: { inningsPitched: '1.0' } } },
    },
  };

  it('drops the starter and keeps only actual pitchers in appearance order', () => {
    const entries = relieverBoxEntries(side);
    expect(entries.map((e) => e.player.person.fullName)).toEqual(['Real Reliever', 'Two-Way Arm']);
    expect(entries.map((e) => e.pid)).toEqual([602, 604]);
  });

  it('fails open when a box entry has no position data (absence is not evidence)', () => {
    const noPosition = {
      pitchers: [601, 605],
      players: {
        ID601: side.players.ID601,
        ID605: { person: { fullName: 'No Position Info' }, stats: { pitching: { inningsPitched: '2.0' } } },
      },
    };
    expect(relieverBoxEntries(noPosition).map((e) => e.player.person.fullName)).toEqual(['No Position Info']);
  });

  it('returns empty for a missing or malformed side', () => {
    expect(relieverBoxEntries(null)).toEqual([]);
    expect(relieverBoxEntries({ pitchers: null, players: {} })).toEqual([]);
  });
});

describe('MLB_BULLPEN_WORKLOAD wiring', () => {
  it('stamps ledger dates via bullpenLedgerDate, never a raw UTC slice', () => {
    expect(fetchersSrc).toContain('bullpenLedgerDate(game)');
    expect(fetchersSrc).not.toContain("(game.gameDate || '').split('T')[0]");
  });

  it('walks relievers through relieverBoxEntries in both the ledger and pen-form passes', () => {
    const uses = fetchersSrc.match(/relieverBoxEntries\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});

// (The Aug-26 composition/leverage prose devices were retired the same day —
// founder duplication audit. outsToIp remains the ledger's arithmetic.)
describe('outsToIp', () => {
  it('formats outs as MLB innings', () => {
    expect(outsToIp(13)).toBe('4.1');
    expect(outsToIp(9)).toBe('3.0');
    expect(outsToIp(0)).toBe('0.0');
  });
});
