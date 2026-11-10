import { describe, it, expect } from 'vitest';
import { pointsByKind, kindsInWords, boxAddsUp, turnoverDetail, publishedFumbles } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafGameBox.js';

// Duke 20, North Carolina 24 (Oct 17 2026): Duke's 20 held a fumble-return TD, so its offense scored 13.
const box = (scoring, away = 24) => ({
  teams: [{ id: '150', homeAway: 'home', score: 20 }, { id: '153', homeAway: 'away', score: away }],
  scoring,
});
const plays = [
  { type: 'Field Goal Good', scoringType: 'field-goal', text: 'Rece Verhoff 28 Yd Field Goal', home: 0, away: 3 },
  { type: 'Passing Touchdown', scoringType: 'touchdown', text: 'Jordan Shipp 5 Yd pass from Billy Edwards Jr. (Rece Verhoff Kick)', home: 0, away: 10 },
  // The try names a pass: the play is still a rushing TD.
  { type: 'Rushing Touchdown', scoringType: 'touchdown', text: 'Demon June 4 Yd Run (Rece Verhoff pass to Jordan Shipp for Two-Point Conversion)', home: 0, away: 18 },
  { type: 'Fumble Recovery (Opponent)', scoringType: 'touchdown', text: 'Andrew Pellicciotta 9 Yd Fumble Return (Gavin Strange Kick)', home: 7, away: 18 },
  { type: 'Field Goal Good', scoringType: 'field-goal', text: 'Gavin Strange 22 Yd Field Goal', home: 10, away: 18 },
  { type: 'Field Goal Good', scoringType: 'field-goal', text: 'Gavin Strange 21 Yd Field Goal', home: 13, away: 18 },
  { type: 'Passing Touchdown', scoringType: 'touchdown', text: 'Nate Sheppard 7 Yd pass from Walker Eget (Gavin Strange Kick)', home: 20, away: 18 },
  { type: 'Safety', scoringType: 'safety', text: 'Walker Eget sacked in the end zone for a SAFETY', home: 20, away: 20 },
];

describe('where a college game\'s points came from', () => {
  it('counts each side\'s scores by kind, returns and the try included', () => {
    const points = pointsByKind(box(plays, 20));
    expect(points['150'].points).toBe(20);
    expect(kindsInWords(points['150'].kinds)).toBe('1 passing TD, 1 fumble-return TD, 2 field goals');
    expect(kindsInWords(points['153'].kinds)).toBe('1 rushing TD, 1 passing TD, 1 field goal, 1 safety');
  });

  it('gives nothing when the scoring plays do not add up to the final', () => {
    expect(pointsByKind(box(plays, 24))).toBeNull();
    expect(pointsByKind(box(plays.filter((p) => p.home !== 10), 20))).toBeNull();
  });
});

describe('player lines against the team line', () => {
  const players = [
    { teamId: '150', stats: { passing: { passingAttempts: 41 }, rushing: { rushingAttempts: 9 } } },
    { teamId: '150', stats: { rushing: { rushingAttempts: 20 }, receiving: { receptions: 11 } } },
    { teamId: '150', stats: { receiving: { receptions: 13 } } },
    { teamId: '153', stats: { rushing: { rushingAttempts: 39 } } },
  ];
  const line = (carries) => new Map([['completionAttempts', '24-41'], ['rushingAttempts', String(carries)]]);

  it('uses a game\'s player lines only when carries, catches and attempts are within one of the team line', () => {
    expect(boxAddsUp({ players }, '150', line(29))).toBe(true);
    expect(boxAddsUp({ players }, '150', line(30))).toBe(true);
    expect(boxAddsUp({ players }, '150', line(31))).toBe(false);
  });
});

describe('how a college game\'s turnovers happened', () => {
  // Team 1 is away, team 2 is home. Scores read away-home.
  const play = (text, start, end, away, home, extra = {}) => ({ text, start: { team: { id: start } }, end: { team: { id: end } }, awayScore: away, homeScore: home, period: { number: 1 }, ...extra });
  const summary = {
    header: { competitions: [{ competitors: [{ homeAway: 'away', team: { id: '1' } }, { homeAway: 'home', team: { id: '2' } }] }] },
    drives: { previous: [
      { team: { id: '1' }, plays: [
        play('(15:00) #9 K.One kickoff 60 yards to the AAA05 #2 R.Two return 20 yards to the AAA25', '2', '1', 0, 0, { clock: { displayValue: '15:00' } }),
        play('(14:20) #5 A.Back rush middle for 3 yards gain to the AAA28 fumbled by #5 A.Back at AAA28 recovered by AAA #70 B.Line at AAA28', '1', '1', 0, 0, { clock: { displayValue: '14:20' } }),
        play('(13:40) #5 A.Back rush left for 2 yards gain to the AAA30 fumbled by #5 A.Back at AAA30 forced by #44 H.Hit recovered by HHH #44 H.Hit at AAA30', '1', '2', 0, 0, { clock: { displayValue: '13:40' } }),
      ] },
      { team: { id: '2' }, plays: [
        play('(13:10) #12 Q.Home pass complete to #1 W.Out for 30 yards to the AAA00 TOUCHDOWN, clock 13:02 #3 K.Kick kick attempt good', '2', '2', 0, 7, { clock: { displayValue: '13:10' } }),
      ] },
      { team: { id: '1' }, plays: [
        play('(12:55) #7 Q.Away pass intercepted by #21 C.Back at AAA40 #21 C.Back return 40 yards to the AAA00 TOUCHDOWN, clock 12:44 #3 K.Kick kick attempt good', '1', '2', 0, 14, { clock: { displayValue: '12:55' } }),
      ] },
    ] },
  };
  it('counts every fumble on the ground, the ones lost, and the points scored off each turnover', () => {
    const d = turnoverDetail(summary);
    expect(d['1']).toMatchObject({ fumbles: 2, lost: 1, picks: 1, pointsOff: 0 });
    expect(d['2']).toMatchObject({ fumbles: 0, lost: 0, picks: 0, takeaways: 2, pointsOff: 14 });
  });

  // Texas at Missouri (Oct 17 2026): Missouri's timeout after the fumble is logged under Missouri, and the touchdown that
  // followed read as 0 points off it.
  it('reads the possession after a turnover past the other team\'s timeout and the same turnover told twice', () => {
    const withTimeout = { ...summary, drives: { previous: [
      { team: { id: '1' }, plays: [
        play('(13:40) #5 A.Back rush left for 2 yards gain to the AAA30 fumbled by #5 A.Back at AAA30 forced by #44 H.Hit recovered by HHH #44 H.Hit at AAA30', '1', '2', 0, 0, { clock: { displayValue: '13:40' } }),
        play('(13:40) #5 A.Back rush left for 2 yards gain to the AAA30 fumbled by #5 A.Back at AAA30 forced by #45 H.Help recovered by HHH #44 H.Hit at AAA30', '1', '2', 0, 21, { clock: { displayValue: '13:31' } }),
      ] },
      { team: { id: '2' }, plays: [
        play('(13:20) #22 R.Home rush middle for 4 yards gain to the AAA26', '2', '2', 0, 0, { clock: { displayValue: '13:20' } }),
        play('Timeout AAA, clock 13:05', '1', '2', 0, 0, { clock: { displayValue: '13:05' }, type: { text: 'Timeout' } }),
        play('(13:00) #12 Q.Home pass complete to #1 W.Out for 26 yards to the AAA00 TOUCHDOWN, clock 12:52 #3 K.Kick kick attempt good', '2', '2', 0, 7, { clock: { displayValue: '13:00' } }),
      ] },
    ] } };
    const d = turnoverDetail(withTimeout);
    expect(d['1']).toMatchObject({ fumbles: 1, lost: 1 });
    expect(d['2']).toMatchObject({ takeaways: 1, pointsOff: 7, unsure: false });
  });

  // Texas State at Texas (Sep 5 2026): the plays told two Texas State fumbles, ESPN's and CFBD's boxes three, as did the
  // school's box. CFBD leaves a zero total out.
  it('takes every fumble from the published boxes, and says nothing when they differ', () => {
    const cfbd = (o) => new Map(Object.entries(o));
    expect(publishedFumbles(3, cfbd({ totalFumbles: '3', fumblesLost: '2' }))).toBe(3);
    expect(publishedFumbles(0, cfbd({ fumblesLost: '0' }))).toBe(0);
    expect(publishedFumbles(0, cfbd({ totalFumbles: '2', fumblesLost: '0' }))).toBeNull();
    expect(publishedFumbles(undefined, cfbd({ totalFumbles: '1', fumblesLost: '0' }))).toBeNull();
    expect(publishedFumbles(1, null)).toBeNull();
  });
});
