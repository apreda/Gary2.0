import { describe, expect, it } from 'vitest';
import { followQuarter } from '../../src/services/sports/nba/nbaGameRecord.js';
import { offFloor, withoutHimLine, projectedFives, isGarbage } from '../../src/services/sports/nba/nbaWithoutHim.js';

const H = [1, 2, 3, 4, 5], A = [11, 12, 13, 14, 15];
const players = [...H.map((id) => ({ id, side: 'home', quarters: [{ q: 1, min: 12 }] })), ...A.map((id) => ({ id, side: 'away', quarters: [{ q: 1, min: 12 }] })),
  { id: 6, side: 'home', quarters: [{ q: 1, min: 0 }] }];

describe('stretches on the floor', () => {
  it("splits a quarter at each substitution, with both fives and each side's points", () => {
    // Home 1 out for 6 with 0:30 left (the box's minutes are whole and cut down, so 1 reads 11 and 6 reads 0).
    players[0].quarters = [{ q: 1, min: 11 }];
    const plays = [
      { period: 1, clock: '10:00', order: 1, type: 'Made Shot', home_score: 2, away_score: 0 },
      { period: 1, clock: '5:00', order: 2, type: 'Made Shot', home_score: 2, away_score: 3 },
      { period: 1, clock: '0:30', order: 3, type: 'Substitution', participants: [6, 1] },
      { period: 1, clock: '0:10', order: 4, type: 'Made Shot', home_score: 4, away_score: 3 },
    ];
    const t = followQuarter(plays, players, 1);
    const sorted = t.stints.map((s) => ({ ...s, home: [...s.home].sort((x, y) => x - y), away: [...s.away].sort((x, y) => x - y) }));
    expect(sorted).toEqual([
      { from: 720, to: 30, home: [1, 2, 3, 4, 5], away: A, margin: 0, pts: [2, 3] },
      { from: 30, to: 0, home: [2, 3, 4, 5, 6], away: A, margin: -1, pts: [2, 0] },
    ]);
  });
});

describe('a team without a player', () => {
  const stint = (q, from, to, home, margin, pts, away = A) => ({ q, from, to, home, away, margin, pts });
  const box = (min6) => [{ id: 1, name: 'Star Man', side: 'home', min: 36, starter: true }, { id: 2, name: 'Second Guy', side: 'home', min: 34, starter: true },
    { id: 6, name: 'Bench Kid', side: 'home', min: min6 }, ...A.map((id) => ({ id, name: `Opp ${id}`, side: 'away', min: 30, starter: id <= 13 }))];
  const played = (date) => ({ game_date: date, home: { id: 9, abbr: 'HOM' }, away: { id: 8, abbr: 'AWY' }, final: { home: 100, away: 90 }, periods: [1, 2, 3, 4], stintQuarters: [1, 2, 3, 4], players: box(10),
    stints: [stint(1, 720, 0, [1, 2, 3, 4, 5], 0, [30, 20]),
      stint(2, 720, 0, [2, 3, 4, 5, 6], 10, [20, 30]), // he sits, their starters 11-13 on
      stint(3, 720, 0, [2, 3, 4, 5, 6], 0, [10, 20], [14, 15, 16, 17, 18]), // he sits, their bench
      stint(4, 720, 0, [2, 3, 4, 5, 6], 25, [5, 10])] }); // he sits, up 25 in the 4th with 12:00 left
  const missed = { ...played('2026-11-05'), players: box(30).filter((p) => p.id !== 1), stints: [stint(1, 720, 0, [2, 3, 4, 5, 6], 0, [28, 25])] };

  it('counts the minutes he sat, garbage time apart, by who the other team had on the floor', () => {
    const o = offFloor([played('2026-11-01'), missed], 9, 'Star Man', ['Star Man', 'Second Guy', 'Bench Kid']);
    expect(o.played).toBe(1);
    expect(o.off).toEqual({ secs: 2160, pts: [35, 60] });
    expect(o.garbage).toEqual({ secs: 720, pts: [5, 10] });
    expect(o.vsStarters).toEqual({ secs: 720, pts: [20, 30] });
    expect(o.vsBench).toEqual({ secs: 720, pts: [10, 20] });
    // The projected group without him, in every game: three stretches he sat and the game he missed.
    expect(o.group).toMatchObject({ names: ['Second Guy', 'Bench Kid'], secs: 2880, pts: [63, 85] });
    expect(o.missed.map((m) => m.line)).toEqual(['W 100-90 vs AWY (Nov 5)']);
    expect(o.gamesSince).toBe(1);
  });

  it('says nothing below the minutes floor', () => {
    expect(withoutHimLine([played('2026-11-01')], { teamId: 9, team: 'Home', name: 'Star Man', status: 'Out' })).toBeNull();
  });

  it('reads garbage time the way the line says it', () => {
    expect(isGarbage({ q: 4, from: 400, margin: -20 })).toBe(true);
    expect(isGarbage({ q: 4, from: 400, margin: 19 })).toBe(false);
    expect(isGarbage({ q: 4, from: 300, margin: 15 })).toBe(true);
    expect(isGarbage({ q: 3, from: 300, margin: 40 })).toBe(false);
  });

  it("reads the desk's projected fives", () => {
    expect(projectedFives('[AWAY] Los Angeles Lakers: Luka Doncic (PG), Austin Reaves (SG), Walker Kessler (C)\n[HOME] Detroit Pistons: Cade Cunningham (PG; Out on the injury report)'))
      .toEqual({ 'Los Angeles Lakers': ['Luka Doncic', 'Austin Reaves', 'Walker Kessler'], 'Detroit Pistons': ['Cade Cunningham'] });
  });
});
