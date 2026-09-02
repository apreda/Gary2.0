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

  it('walks relievers through relieverBoxEntries in the single pen walk (Aug 27 rework)', () => {
    // The Aug-27 founder-spec rebuild collapsed the two walks (ledger +
    // pen-form window) into ONE boxscore walk — position-player filtering
    // still applies to every appearance through relieverBoxEntries.
    const uses = fetchersSrc.match(/relieverBoxEntries\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(1);
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

// ═══ EVERY ARM, NEWEST WORK FIRST (founder GO, Sep 2 2026) ═══
import {
  summarizeRelieverLog,
  isPenArm,
  renderOuting,
  situationPhrase,
  renderArmBlock,
  penAvailabilityLines,
  clubNick,
  ipToOuts,
  shiftDate,
} from '../../src/services/agentic/tools/statRouters/bullpenLedger.js';

const split = (date, over = {}, stat = {}) => ({
  date,
  gameType: 'R',
  isHome: true,
  opponent: { name: 'Seattle Mariners' },
  ...over,
  stat: { gamesStarted: 0, inningsPitched: '1.0', earnedRuns: 0, hits: 0, baseOnBalls: 0, strikeOuts: 1, numberOfPitches: 15, saves: 0, holds: 0, blownSaves: 0, wins: 0, losses: 0, inheritedRunners: 0, inheritedRunnersScored: 0, ...stat },
});

describe('summarizeRelieverLog', () => {
  it('sums the regular season only, newest three first, and dates the last outing', () => {
    const log = [
      split('2026-03-10', { gameType: 'S' }, { earnedRuns: 9 }), // spring: never counts
      split('2026-08-24'),
      split('2026-08-29', { isHome: false, opponent: { name: 'New York Yankees' } }, { holds: 1, numberOfPitches: 13 }),
      split('2026-08-31', {}, { strikeOuts: 2, saves: 1, numberOfPitches: 15 }),
    ];
    const s = summarizeRelieverLog(log, '2026-09-01');
    expect(s.g).toBe(3);
    expect(s.er).toBe(0);
    expect(s.outs).toBe(9);
    expect(s.sv).toBe(1);
    expect(s.hld).toBe(1);
    expect(s.last3.map((r) => r.date)).toEqual(['2026-08-31', '2026-08-29', '2026-08-24']);
    expect(s.daysSinceLast).toBe(1);
    expect(s.last7).toEqual({ g: 2, outs: 6, er: 0, pitches: 28 });
    expect(s.pitchesByDate.get('2026-08-31')).toBe(15);
  });
});

describe('isPenArm', () => {
  it('keeps a pure reliever and a bulk arm used in relief this fortnight; drops the rotation and tonight\'s starter', () => {
    const reliever = summarizeRelieverLog([split('2026-08-31')], '2026-09-01');
    expect(isPenArm(reliever)).toBe(true);
    // A starter whose latest appearance was a start never prints in the pen.
    const starter = summarizeRelieverLog([split('2026-08-20', {}, { gamesStarted: 1, inningsPitched: '6.0' }), split('2026-08-26', {}, { gamesStarted: 1, inningsPitched: '5.0' })], '2026-09-01');
    expect(isPenArm(starter)).toBe(false);
    // Bello's shape: starts on the record, used as the bulk arm three days ago.
    const bulk = summarizeRelieverLog([split('2026-08-10', {}, { gamesStarted: 1, inningsPitched: '5.0' }), split('2026-08-29', {}, { inningsPitched: '4.1', earnedRuns: 4, numberOfPitches: 94 })], '2026-09-01');
    expect(isPenArm(bulk)).toBe(true);
    // A swingman whose last relief use is a month old is rotation, not pen.
    const stale = summarizeRelieverLog([split('2026-07-20'), split('2026-08-26', {}, { gamesStarted: 1 }), split('2026-07-30', {}, { gamesStarted: 1 })], '2026-09-01');
    expect(isPenArm(stale)).toBe(false);
    expect(isPenArm(summarizeRelieverLog([], '2026-09-01'))).toBe(false);
  });
});

describe('renderOuting + renderArmBlock', () => {
  it('prints one outing as a line and one arm newest work first, season last', () => {
    const outing = renderOuting(split('2026-08-31', { isHome: false, opponent: { name: 'Boston Red Sox' } }, { hits: 2, earnedRuns: 1, strikeOuts: 3, numberOfPitches: 23, blownSaves: 1, inheritedRunners: 1, inheritedRunnersScored: 1 }));
    expect(outing).toBe('08-31 @ Red Sox, 1.0 IP, 2 H, 1 ER, 0 BB, 3 K, 23 p, inherited 1/1 scored (BS)');
    const sum = summarizeRelieverLog([split('2026-08-24'), split('2026-08-29'), split('2026-08-31', {}, { saves: 1 })], '2026-09-01');
    const lines = renderArmBlock({ name: 'Aroldis Chapman', hand: 'L', sum, usage: '47 G, 7× back-to-back days, avg 16 pitches' });
    expect(lines[0]).toBe('  Aroldis Chapman (LHP) — 1 SV, 0 HLD');
    expect(lines[1]).toBe('    Role, as used: finished the game 0 of 3 times · has not entered with runners on base');
    expect(lines[2]).toContain('Last pitched: yesterday (08-31), 15 pitches');
    expect(lines[2]).toContain('last 7 days: 2 G, 2.0 IP, 0 ER, 30 pitches');
    expect(lines[3]).toMatch(/^    Last 3 outings, newest first: 08-31 vs Mariners/);
    // Season is the LAST line; the usage string's own "N G, " is not repeated.
    expect(lines[4]).toMatch(/^    Season: 3 G, 0\.00 ERA, 0\.00 WHIP, 3 K, 0 BB in 3\.0 IP — every rate here rests on 3\.0 IP · Usage: 7× back-to-back days/);
    expect(lines).toHaveLength(5);
  });
  it('tags a bulk arm with his starts and a man who has not pitched', () => {
    const bulk = summarizeRelieverLog([split('2026-08-10', {}, { gamesStarted: 1, inningsPitched: '5.0' }), split('2026-08-29', {}, { inningsPitched: '4.1' })], '2026-09-01');
    expect(renderArmBlock({ name: 'Brayan Bello', hand: 'R', sum: bulk, usage: null })[0]).toBe('  Brayan Bello (RHP) — 0 SV, 0 HLD · 1 GS this season');
    const none = summarizeRelieverLog([], '2026-09-01');
    expect(renderArmBlock({ name: 'New Guy', hand: null, sum: none, usage: null })[1]).toContain('Has not pitched this season');
  });
  it('carries the situation of each outing and the role counts when the play-by-play is known', () => {
    const ctx = { inning: 4, half: 'T', awayScore: 8, homeScore: 1, maxOn: 2 };
    expect(situationPhrase(ctx, true)).toBe('in T4 trailing 1-8, 2 on');
    expect(situationPhrase(ctx, false)).toBe('in T4 leading 8-1, 2 on');
    expect(situationPhrase({ inning: 9, half: 'B', awayScore: 3, homeScore: 3, maxOn: 3 }, true)).toBe('in B9 tied 3-3, bases loaded');
    expect(situationPhrase(null, true)).toBeNull();
    const r = split('2026-09-01', { game: { gamePk: 824716 }, player: { id: 681544 } }, { inningsPitched: '2.1', hits: 2, earnedRuns: 1, baseOnBalls: 1, strikeOuts: 2, numberOfPitches: 53, inheritedRunners: 1, gamesFinished: 0 });
    expect(renderOuting(r, ctx)).toBe('09-01 vs Mariners: in T4 trailing 1-8, 2 on, 2.1 IP, 2 H, 1 ER, 1 BB, 2 K, 53 p, inherited 0/1 scored');
    const sum = summarizeRelieverLog([split('2026-08-28', {}, { gamesFinished: 1 }), r], '2026-09-02');
    const ctxByPk = new Map([[824716, new Map([[681544, ctx]])]]);
    const lines = renderArmBlock({ name: 'Wyatt Olds', hand: 'R', sum, usage: null, ctxByPk });
    expect(lines[1]).toBe('    Role, as used: finished the game 1 of 2 times · entered with runners on base 1 time (1 inherited, 0 scored)');
    expect(lines[3]).toContain('09-01 vs Mariners: in T4 trailing 1-8, 2 on, 2.1 IP');
    const avail = penAvailabilityLines([{ name: 'Wyatt Olds', sum }], '2026-09-02', ctxByPk);
    expect(avail[0]).toBe('Pitched yesterday (09-01): Wyatt Olds 53 p (in T4 trailing 1-8, 2 on, 2.1 IP).');
  });
});

describe('penAvailabilityLines', () => {
  it('lists yesterday with pitch counts, consecutive days, and who has sat three days — as facts', () => {
    const arms = [
      { name: 'Speier', sum: summarizeRelieverLog([split('2026-08-30'), split('2026-08-31', {}, { numberOfPitches: 15 })], '2026-09-01') },
      { name: 'Muñoz', sum: summarizeRelieverLog([split('2026-08-31', {}, { numberOfPitches: 28 })], '2026-09-01') },
      { name: 'Vargas', sum: summarizeRelieverLog([split('2026-08-27')], '2026-09-01') },
      { name: 'Grinder', sum: summarizeRelieverLog([split('2026-08-28'), split('2026-08-29'), split('2026-08-31')], '2026-09-01') },
    ];
    const lines = penAvailabilityLines(arms, '2026-09-01');
    expect(lines[0]).toBe('Pitched yesterday (08-31): Speier 15 p (1.0 IP), Muñoz 28 p (1.0 IP), Grinder 15 p (1.0 IP).');
    expect(lines[1]).toBe('Pitched both of the last two days: Speier. Pitched 3 of the last 4 days: Grinder.');
    expect(lines[2]).toBe('Not used in the last 3 days: Vargas.');
    expect(lines.join(' ')).not.toMatch(/unavailable|fresh|tired|should/i);
  });
});

describe('small helpers', () => {
  it('nicknames, innings, calendar shifts', () => {
    expect(clubNick('Boston Red Sox')).toBe('Red Sox');
    expect(clubNick('Toronto Blue Jays')).toBe('Blue Jays');
    expect(clubNick('Athletics')).toBe('Athletics');
    expect(ipToOuts('1.2')).toBe(5);
    expect(ipToOuts('0.0')).toBe(0);
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31');
  });
});

describe('MLB_CLOSER_RELIEVER_STATS wiring', () => {
  it('delegates to the roster-first pen builder — never the BDL stint list again', () => {
    expect(fetchersSrc).toContain("MLB_CLOSER_RELIEVER_STATS: async (sport, home, away, season, options) => fetchPenArms(");
    expect(fetchersSrc).toContain("import { fetchPenArms } from './penArms.js';");
  });
});
