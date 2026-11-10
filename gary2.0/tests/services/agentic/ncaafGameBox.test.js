import { describe, it, expect } from 'vitest';
import { pointsByKind, kindsInWords, boxAddsUp, turnoverDetail, publishedFumbles, gameBoxFromSummary, ncaafReturns, officialSackPlays, ncaafFlowLines } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafGameBox.js';

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

// Florida Atlantic at Florida (Sep 5 2026): a catch overturned on review read its original 25 yards; Arkansas's runs with a
// holding foul after them were left out.
describe('runs and pass plays by the score at the snap', () => {
  it('reads the final ruling, and a run or catch that stood with a foul after it', () => {
    const snap = (text, type, extra = {}) => ({ text, type: { text: type }, start: { team: { id: '1' } }, awayScore: 0, homeScore: 0, period: { number: 1 }, ...extra });
    const summary = {
      header: { competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: 'away', score: '0', team: { id: '1' } }, { homeAway: 'home', score: '0', team: { id: '2' } }] }] },
      boxscore: { players: [{ team: { id: '1' }, statistics: [{ name: 'rushing', keys: ['rushingAttempts'], athletes: [{ athlete: { id: '9', lastName: 'Back' }, stats: ['2'] }] }] }] },
      drives: { previous: [{ team: { id: '1' }, plays: [
        snap('(09:07) #10 C.Pass pass incomplete deep middle to #2 K.End. The previous play is under automatic review. CALL OVERTURNED. (Original Play: (09:07) #10 C.Pass pass complete deep middle to #2 K.End caught at FLA23, for 25 yards to the FLA23)', 'Pass Incompletion'),
        snap('(08:30) #5 A.Back rush middle for 7 yards gain to the ARK47 PENALTY ARK Holding (#75 K.Line) 10 yards from ARK47 to ARK37', 'Penalty', { statYardage: -3 }),
        snap('(08:00) #5 A.Back rush left for 22 yards gain (16) to the UNA03, out of bounds PENALTY ARK Holding (#75 K.Line) 10 yards', 'Penalty'),
        snap('(07:30) #5 A.Back rush left for 9 yards gain to the UNA03 PENALTY UNA Offside 5 yards. NO PLAY', 'Penalty'),
      ] }] },
    };
    expect(gameBoxFromSummary(summary, '1').byScore['1'].close).toEqual({ runs: 2, runYards: 23, passes: 1, passYards: 0 });
  });
});

// Tennessee at Texas (Sep 26 2026): ESPN's players added up to 1 kickoff return for 21; the school's box and CFBD's had 2 for 19.
describe('a team\'s returns', () => {
  it('keeps the box\'s returns when CFBD agrees, and prints CFBD\'s count without a long when not', () => {
    const box = { players: [{ teamId: '251', stats: { kickReturns: { kickReturns: 1, kickReturnYards: 21, longKickReturn: 21, kickReturnTouchdowns: 0 } } }] };
    const cfbd = (o) => new Map(Object.entries(o));
    expect(ncaafReturns(box, '251', cfbd({ kickReturns: '1', kickReturnYards: '21' }))).toBe('1 kickoff return for 21 (long 21)');
    expect(ncaafReturns(box, '251', cfbd({ kickReturns: '2', kickReturnYards: '19', puntReturns: '1', puntReturnYards: '4' }))).toBe('2 kickoff returns for 19, 1 punt return for 4');
    expect(ncaafReturns(box, '251', null)).toBe('1 kickoff return for 21 (long 21)');
  });
});

// Auburn at Arkansas (Nov 7 2026): the plays gave Arkansas's six sacks taken 35 yards, the school's box 42.
describe('the sacks split out of the runs', () => {
  it('takes the official box\'s count and yards when it has them, else the plays\'', () => {
    const plays = { mine: { n: 6, yards: -35 }, theirs: { n: 2, yards: -10 } };
    expect(officialSackPlays(plays, { made: [2, 10], taken: [6, 42] })).toEqual({ mine: { n: 6, yards: -42 }, theirs: { n: 2, yards: -10 } });
    expect(officialSackPlays(plays, undefined)).toBe(plays);
  });
});

describe('quarterback hurries', () => {
  it('says nothing when CFBD\'s team box gives another count', () => {
    const box = { teams: [{ id: '1', homeAway: 'home', totals: {} }, { id: '2', homeAway: 'away', totals: {} }], scoring: [], bigPlays: [],
      players: [{ teamId: '1', stats: { defensive: { hurries: 5 } } }, { teamId: '2', stats: { defensive: { hurries: 1 } } }] };
    const cfbd = (n) => new Map([['qbHurries', String(n)]]);
    expect(ncaafFlowLines(box, '1', {}, { cfbd: { 1: cfbd(5), 2: cfbd(1) } })[1]).toContain('quarterback hurries made 5, taken 1');
    expect(ncaafFlowLines(box, '1', {}, { cfbd: { 1: cfbd(1), 2: cfbd(1) } })[1]).toContain('quarterback hurries not on file');
  });
});

// Tennessee (Sep 12 2026): ESPN's players were credited with 7 sacks, its team row and CFBD with 6.
describe('who made the sacks', () => {
  it('names the sackers only when their credits add up to the team count', () => {
    const box = (team) => ({ teams: [{ id: '1', homeAway: 'home', totals: {} }, { id: '2', homeAway: 'away', totals: {} }], scoring: [], bigPlays: [],
      defTotals: { 1: { sacks: team }, 2: { sacks: 0 } },
      players: [{ teamId: '1', name: 'X Gilliam', stats: { defensive: { sacks: 3 } } }, { teamId: '1', name: 'E Spillman', stats: { defensive: { sacks: 1 } } }] });
    const line = (b) => ncaafFlowLines(b, '1', { 1: 'Tennessee', 2: 'Opp' }).find((l) => l.startsWith('who made'));
    expect(line(box(4))).toContain('Tennessee sacks by X Gilliam 3, E Spillman;');
    expect(line(box(3))).toContain('Tennessee sacks by: not on file');
  });
});

// Oklahoma at Florida (Nov 7 2026): Florida's starter Tramell Jones Jr. was never found, so a reliever could read as the starter.
describe('the starting quarterback from the plays', () => {
  it('finds a passer whose last name ends in Jr.', () => {
    const passer = (id, last, att) => ({ athlete: { id, firstName: 'T', lastName: last, displayName: `T ${last}` }, stats: [String(att)] });
    const summary = {
      header: { competitions: [{ status: { type: { completed: true } }, competitors: [{ homeAway: 'away', score: '0', team: { id: '1' } }, { homeAway: 'home', score: '0', team: { id: '2' } }] }] },
      boxscore: { players: [{ team: { id: '1' }, statistics: [{ name: 'passing', keys: ['passingAttempts'], athletes: [passer('8', 'Jones Jr.', 20), passer('9', 'Philo', 6)] }] }] },
      drives: { previous: [{ team: { id: '1' }, plays: [
        { text: '(14:55) #10 T.Jones Jr. pass complete short left to #1 W.Out for 8 yards', type: { text: 'Pass Reception' }, start: { team: { id: '1' } }, period: { number: 1 } },
        { text: '(02:00) #12 T.Philo pass incomplete short right', type: { text: 'Pass Incompletion' }, start: { team: { id: '1' } }, period: { number: 4 } },
      ] }] },
    };
    expect(gameBoxFromSummary(summary, '1').starterQb['1']).toBe('T Jones Jr.');
  });
});
