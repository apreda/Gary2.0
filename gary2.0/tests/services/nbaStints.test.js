import { describe, expect, it } from 'vitest';
import { followQuarter } from '../../src/services/sports/nba/nbaGameRecord.js';

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
