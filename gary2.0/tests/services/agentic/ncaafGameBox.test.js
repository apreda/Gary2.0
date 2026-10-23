import { describe, it, expect } from 'vitest';
import { pointsByKind, kindsInWords, boxAddsUp } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafGameBox.js';

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

  it('uses a game\'s player lines only when carries, catches and attempts add up', () => {
    expect(boxAddsUp({ players }, '150', line(29))).toBe(true);
    expect(boxAddsUp({ players }, '150', line(30))).toBe(false);
  });
});
