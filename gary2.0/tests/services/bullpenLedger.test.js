import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bullpenLedgerDate,
  relieverBoxEntries,  outsToIp,
  penLeverageArms,
  penWindowComposition,
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

describe('pen-window composition (the Aug 26 six-eight autopsy fills)', () => {
  const arms = [
    { pid: 1, name: 'Miller', outs: 13, er: 1, pitches: 55, dates: ['2026-08-22', '2026-08-24'],
      marginOuts: [{ margin: 1, outs: 3 }, { margin: 0, outs: 4 }, { margin: 5, outs: 6 }] },
    { pid: 2, name: 'Suarez', outs: 11, er: 0, pitches: 48, dates: ['2026-08-23'],
      marginOuts: [{ margin: 2, outs: 5 }, { margin: null, outs: 6 }] },
    { pid: 3, name: 'Mopup', outs: 9, er: 6, pitches: 40, dates: ['2026-08-21'],
      marginOuts: [{ margin: 7, outs: 9 }] },
  ];

  it('formats outs as MLB innings', () => {
    expect(outsToIp(13)).toBe('4.1');
    expect(outsToIp(9)).toBe('3.0');
    expect(outsToIp(0)).toBe('0.0');
  });

  it('states the arms, the blowout share, and the unknown share', () => {
    const line = penWindowComposition(arms);
    expect(line).toContain('Miller 4.1IP');
    expect(line).toContain('Suarez 3.2IP');
    expect(line).toContain('Mopup 3.0IP');
    // Blowout outs: Miller margin-5 (6) + Mopup margin-7 (9) = 15 → 5.0 IP of 11.0
    expect(line).toContain('5.0 of 11.0 IP entered with a margin of 4+');
    // Suarez's unknown-entry 6 outs are named, not silently bucketed
    expect(line).toContain('entry context unknown for 2.0 IP');
  });

  it('ranks leverage arms by close-entry work and leaves mop-up men out', () => {
    const ranked = penLeverageArms(arms);
    expect(ranked.map((a) => a.name)).toEqual(['Miller', 'Suarez']);
    expect(ranked[0].closeApps).toBe(2); // margins 1 and 0
    expect(ranked[1].closeApps).toBe(1); // margin 2; the null entry counts nowhere
  });

  it('returns nothing rather than an empty claim when no arms pitched', () => {
    expect(penWindowComposition([])).toBe(null);
    expect(penLeverageArms([])).toEqual([]);
  });
});
