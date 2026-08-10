/**
 * PITCHER ARC pins (Aug 4 2026 — the Bieber/Chandler/Schlittler autopsy).
 * Fixtures are REAL numbers pulled live from the MLB Stats API on Aug 4:
 * Bieber (MLBAM 669456) and Chandler (696149). If a formatter's output
 * drifts, the desk's arc lines drift with it.
 */
import { describe, it, expect } from 'vitest';
import {
  outsFromIp, ipFromOuts, recentWindowLine, monthArcLine,
  careerLine, longLayoffFlag, earlyCareerFlag,
} from '../../../src/services/agentic/scoutReport/sports/pitcherArc.js';

// Chandler's last 6 starts before Aug 3 (getPitcherLastStarts shape, oldest→newest)
const CHANDLER_L6 = [
  { date: '2026-06-25', opponent: 'Seattle Mariners', ip: '5.1', h: 5, er: 1, k: 4, bb: 3 },
  { date: '2026-06-30', opponent: 'Philadelphia Phillies', ip: '6.1', h: 7, er: 5, k: 6, bb: 2 },
  { date: '2026-07-05', opponent: 'Washington Nationals', ip: '4.0', h: 6, er: 4, k: 0, bb: 4 },
  { date: '2026-07-11', opponent: 'Milwaukee Brewers', ip: '4.2', h: 5, er: 2, k: 6, bb: 3 },
  { date: '2026-07-22', opponent: 'New York Yankees', ip: '6.1', h: 2, er: 0, k: 5, bb: 1 },
  { date: '2026-07-28', opponent: 'Arizona Diamondbacks', ip: '4.0', h: 7, er: 3, k: 3, bb: 1 },
];

const BIEBER_SEASONS = [
  { season: '2018', ip: '114.2', gs: 19 }, { season: '2019', ip: '214.1', gs: 33 },
  { season: '2020', ip: '77.1', gs: 12 }, { season: '2021', ip: '96.2', gs: 16 },
  { season: '2022', ip: '200.0', gs: 31 }, { season: '2023', ip: '128.0', gs: 21 },
  { season: '2024', ip: '12.0', gs: 2 }, { season: '2025', ip: '40.1', gs: 7 },
  { season: '2026', ip: '37.0', gs: 8 },
];
const BIEBER_CAREER = { era: '3.32', ip: '920.1', gs: 149, w: 69, l: 36 };

describe('IP arithmetic', () => {
  it('converts baseball notation to outs and back', () => {
    expect(outsFromIp('5.2')).toBe(17);
    expect(outsFromIp('0.2')).toBe(2);
    expect(outsFromIp('7.0')).toBe(21);
    expect(ipFromOuts(45)).toBe('15.0');
    expect(ipFromOuts(17)).toBe('5.2');
  });
  it('returns null on garbage instead of corrupting math', () => {
    expect(outsFromIp(null)).toBeNull();
    expect(outsFromIp('—')).toBeNull();
  });
});

describe('recentWindowLine', () => {
  it("computes Chandler's last-3: the 3.00 the game desk never saw", () => {
    // Jul 11 + Jul 22 + Jul 28 = 4.2 + 6.1 + 4.0 IP = 45 outs; 5 ER → 3.00
    expect(recentWindowLine(CHANDLER_L6, 3))
      .toBe('Last 3 starts: 15.0 IP, 5 ER (3.00 ERA), 14 K, 5 BB');
  });
  it('returns null under n starts and on malformed rows', () => {
    expect(recentWindowLine(CHANDLER_L6.slice(0, 2), 3)).toBeNull();
    expect(recentWindowLine([{ ip: 'x', er: 1 }, { ip: '5.0', er: 1 }, { ip: '5.0', er: 1 }], 3)).toBeNull();
  });
});

describe('monthArcLine', () => {
  it("decomposes Bieber's 2026 season by month", () => {
    const rows = [
      { month: 7, era: '5.64', ip: '22.1' },
      { month: 8, era: '1.59', ip: '5.2' },
      { month: 6, era: '6.00', ip: '9.0' },
    ];
    expect(monthArcLine(rows)).toBe('By month: Jun 6.00 (9.0 IP) · Jul 5.64 (22.1 IP) · Aug 1.59 (5.2 IP)');
  });
  it('stays silent for a one-month season (it IS the season line)', () => {
    expect(monthArcLine([{ month: 4, era: '3.00', ip: '20.0' }])).toBeNull();
    expect(monthArcLine([])).toBeNull();
  });
});

describe('careerLine', () => {
  it("prints Bieber's baseline — the fact that reframes his 5.74", () => {
    expect(careerLine(BIEBER_CAREER, BIEBER_SEASONS))
      .toBe('Career: 3.32 ERA, 920.1 IP, 149 starts, 69-36 (2018-2026)');
  });
  it('stays silent when career == this season (rookie)', () => {
    expect(careerLine({ era: '4.49', ip: '110.1', gs: 21 }, [{ season: '2026', ip: '110.1', gs: 21 }])).toBeNull();
    expect(careerLine(null, BIEBER_SEASONS)).toBeNull();
  });
});

describe('longLayoffFlag', () => {
  it('fires for Bieber: two tiny seasons after an established workload', () => {
    const flag = longLayoffFlag({
      name: 'Shane Bieber', label: 'away',
      seasons: BIEBER_SEASONS, season: 2026, firstStartDate: '2026-06-23',
    });
    expect(flag).toContain('Shane Bieber (away)');
    expect(flag).toContain('12.0 IP in 2024 and 40.1 IP in 2025');
    expect(flag).toContain('Jun 23');
    expect(flag).toContain('2026 season-long numbers span only the starts since');
  });
  it('does not fire for a continuously established starter', () => {
    const steady = BIEBER_SEASONS.map(s => ({ ...s, ip: '180.0' }));
    expect(longLayoffFlag({ name: 'X', label: 'home', seasons: steady, season: 2026 })).toBeNull();
  });
  it('does not fire for a young arm with no established history (earlyCareerFlag territory)', () => {
    const young = [{ season: '2025', ip: '31.1', gs: 4 }];
    expect(longLayoffFlag({ name: 'X', label: 'home', seasons: young, season: 2026 })).toBeNull();
  });
});

describe('earlyCareerFlag', () => {
  it('fires for Chandler: 21 of 25 career starts this season', () => {
    expect(earlyCareerFlag({ name: 'Bubba Chandler', label: 'away', careerGs: 25, seasonGs: 21 }))
      .toBe('Bubba Chandler (away): 21 of his 25 career MLB starts have come this season. Season-long splits and rate stats accumulate from his first MLB starts onward.');
  });
  it('fires with the all-starts phrasing for a true rookie', () => {
    expect(earlyCareerFlag({ name: 'R', label: 'home', careerGs: 12, seasonGs: 12 }))
      .toContain('All 12 of his career MLB starts have come this season.');
  });
  it('stays silent for veterans and for tiny season samples', () => {
    expect(earlyCareerFlag({ name: 'V', label: 'home', careerGs: 149, seasonGs: 8 })).toBeNull();
    expect(earlyCareerFlag({ name: 'N', label: 'home', careerGs: 4, seasonGs: 4 })).toBeNull();
  });
});

/**
 * TEAM-CHANGE FLAGS (Aug 10 2026 — the universal "first start for club"
 * fabrication). /mlb/v1/stats rows carry NO team ids — only team_name — and
 * the raw fetch included spring rows, so from Aug 6-9 every starter on every
 * desk was flagged as debuting for a new club (Wheeler "all 18 with another
 * club", Scherzer "all 11" vs his real 8). These pins hold the rebuilt,
 * chrono-row + team_name–joined derivation to: silence for stay-put arms,
 * true flags for real movers, and silence over guessing when attribution
 * is incomplete.
 */
import { teamChangeFlags } from '../../../src/services/agentic/scoutReport/sports/pitcherArc.js';

const startRow = (team_name, homeId, gs = 1) =>
  ({ team_name, games_started: gs, _game: homeId == null ? {} : { homeId } });

describe('teamChangeFlags', () => {
  const TOR = { clubId: 29, clubNames: ['Toronto Blue Jays'] };

  it('stays fully silent for a pitcher whose every start is with the current club (Bieber regression)', () => {
    const rows = [
      startRow('Toronto Blue Jays', 29), startRow('Toronto Blue Jays', 12),
      startRow('Toronto Blue Jays', 29), startRow('Toronto Blue Jays', 7),
      startRow('Toronto Blue Jays', 29), startRow('Toronto Blue Jays', 3),
      startRow('Toronto Blue Jays', 29), startRow('Toronto Blue Jays', 15),
      startRow('Toronto Blue Jays', 22),
    ];
    expect(teamChangeFlags({ name: 'Shane Bieber', label: 'Blue Jays', season: 2026, ...TOR, rows })).toEqual([]);
  });

  it('folds diacritics on both sides of the team-name join', () => {
    const rows = [startRow('Torónto Blue Jays', 29), startRow('Toronto Blue Jays', 29)];
    expect(teamChangeFlags({ name: 'S', label: 'Blue Jays', season: 2026, ...TOR, rows })).toEqual([]);
  });

  it('prints the true debut flag when every season start came with another club', () => {
    const rows = Array.from({ length: 23 }, (_, i) => startRow('Miami Marlins', i % 2 ? 7 : 4));
    const flags = teamChangeFlags({
      name: 'Jesus Luzardo', label: 'Phillies', season: 2026,
      clubId: 22, clubNames: ['Philadelphia Phillies'], rows,
    });
    expect(flags).toEqual([
      'Jesus Luzardo (Phillies): first start for Phillies — all 23 of his 2026 starts came with another club.',
    ]);
  });

  it('prints the two-club split flag for a real mid-season mover', () => {
    const rows = [
      ...Array.from({ length: 18 }, () => startRow('Miami Marlins', 7)),
      startRow('Philadelphia Phillies', 22), startRow('Philadelphia Phillies', 22),
    ];
    const flags = teamChangeFlags({
      name: 'J', label: 'Phillies', season: 2026,
      clubId: 22, clubNames: ['Philadelphia Phillies'], rows,
    });
    expect(flags).toEqual([
      'J (Phillies): 2/20 2026 starts with Phillies, 18 with prior team. BDL season stats / home-away splits / ERA are aggregated across both teams — most of the sample is NOT from the current team or ballpark.',
    ]);
  });

  it('omits the "most of the sample" claim when the current club holds the majority', () => {
    const rows = [
      ...Array.from({ length: 14 }, () => startRow('Philadelphia Phillies', 22)),
      ...Array.from({ length: 3 }, () => startRow('Miami Marlins', 7)),
    ];
    const [flag, ...rest] = teamChangeFlags({
      name: 'J', label: 'Phillies', season: 2026,
      clubId: 22, clubNames: ['Philadelphia Phillies'], rows,
    });
    expect(rest).toEqual([]);
    expect(flag).toBe('J (Phillies): 14/17 2026 starts with Phillies, 3 with prior team. BDL season stats / home-away splits / ERA are aggregated across both teams.');
  });

  it('ignores relief rows — current-club relief work does not negate a first start', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => startRow('Miami Marlins', 7)),
      startRow('Boston Red Sox', 2, 0), startRow('Boston Red Sox', 8, 0),
    ];
    const flags = teamChangeFlags({
      name: 'R', label: 'Red Sox', season: 2026,
      clubId: 2, clubNames: ['Boston Red Sox'], rows,
    });
    expect(flags).toEqual([
      'R (Red Sox): first start for Red Sox — all 10 of his 2026 starts came with another club.',
    ]);
  });

  it('chooses silence over "another club" when any start row lacks a team name', () => {
    const rows = [...Array.from({ length: 7 }, () => startRow('Miami Marlins', 7)), startRow(null, 7)];
    expect(teamChangeFlags({
      name: 'U', label: 'Phillies', season: 2026,
      clubId: 22, clubNames: ['Philadelphia Phillies'], rows,
    })).toEqual([]);
  });

  it('prints the thin-home-sample flag only when home attribution is complete', () => {
    const oneHome = [
      startRow('Philadelphia Phillies', 22),
      ...Array.from({ length: 11 }, () => startRow('Philadelphia Phillies', 7)),
    ];
    expect(teamChangeFlags({
      name: 'H', label: 'Phillies', season: 2026,
      clubId: 22, clubNames: ['Philadelphia Phillies'], rows: oneHome,
    })).toEqual([
      'H (Phillies): 1 home start at current team venue this season. Any "home ERA" figure is built on essentially zero sample at this park.',
    ]);
    const missingHomeIds = oneHome.map((r, i) => (i === 3 ? startRow('Philadelphia Phillies', null) : r));
    expect(teamChangeFlags({
      name: 'H', label: 'Phillies', season: 2026,
      clubId: 22, clubNames: ['Philadelphia Phillies'], rows: missingHomeIds,
    })).toEqual([]);
  });

  it('is null-safe: no rows, no club names, no club id, no name → no flags', () => {
    expect(teamChangeFlags({ name: 'X', label: 'L', season: 2026, clubId: 1, clubNames: ['A'], rows: [] })).toEqual([]);
    expect(teamChangeFlags({ name: 'X', label: 'L', season: 2026, clubId: 1, clubNames: [], rows: [startRow('A', 1)] })).toEqual([]);
    expect(teamChangeFlags({ name: 'X', label: 'L', season: 2026, clubId: null, clubNames: ['A'], rows: [startRow('A', 1)] })).toEqual([]);
    expect(teamChangeFlags({ name: '', label: 'L', season: 2026, clubId: 1, clubNames: ['A'], rows: [startRow('A', 1)] })).toEqual([]);
  });
});
