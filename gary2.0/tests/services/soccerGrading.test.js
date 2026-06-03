import { describe, it, expect } from 'vitest';
import { gradeSoccerGame } from '../../src/services/soccerGrading.js';

// gradeSoccerGame(pick, regHome, regAway) — reg = 90' regulation goals.
const MEX = 'Mexico', RSA = 'South Africa';

describe('gradeSoccerGame — 3-way moneyline (90 minutes)', () => {
  it('Home ML wins when home leads at 90', () => {
    expect(gradeSoccerGame({ pick: 'Mexico ML', type: 'moneyline', homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('won');
  });
  it('Home ML loses on a draw (no push for 3-way ML)', () => {
    expect(gradeSoccerGame({ pick: 'Mexico ML', type: 'moneyline', homeTeam: MEX, awayTeam: RSA }, 1, 1)).toBe('lost');
  });
  it('Draw pick wins on a level regulation score', () => {
    expect(gradeSoccerGame({ pick: 'Draw', type: 'draw', homeTeam: MEX, awayTeam: RSA }, 1, 1)).toBe('won');
  });
  it('Draw pick loses when someone wins in regulation', () => {
    expect(gradeSoccerGame({ pick: 'Draw', type: 'draw', homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('lost');
  });
  it('Away ML wins when away leads', () => {
    expect(gradeSoccerGame({ pick: 'South Africa ML', type: 'moneyline', homeTeam: MEX, awayTeam: RSA }, 0, 2)).toBe('won');
  });
});

describe('gradeSoccerGame — totals (goals)', () => {
  it('Over wins', () => {
    expect(gradeSoccerGame({ pick: 'Over 2.5', type: 'total', goal_line: 2.5, homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('won');
  });
  it('Under loses when goals exceed the line', () => {
    expect(gradeSoccerGame({ pick: 'Under 2.5', type: 'total', goal_line: 2.5, homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('lost');
  });
  it('whole-number total pushes when goals equal the line', () => {
    expect(gradeSoccerGame({ pick: 'Over 3', type: 'total', goal_line: 3, homeTeam: MEX, awayTeam: RSA }, 2, 1)).toBe('push');
  });
});

describe('gradeSoccerGame — Asian handicap (half lines)', () => {
  it('home -0.5 wins when home wins outright', () => {
    expect(gradeSoccerGame({ pick: 'Mexico', type: 'asian_handicap', handicap: -0.5, homeTeam: MEX, awayTeam: RSA }, 1, 0)).toBe('won');
  });
  it('home -1.5 loses on a one-goal win', () => {
    expect(gradeSoccerGame({ pick: 'Mexico', type: 'asian_handicap', handicap: -1.5, homeTeam: MEX, awayTeam: RSA }, 1, 0)).toBe('lost');
  });
  it('away +1.5 wins on a one-goal loss', () => {
    expect(gradeSoccerGame({ pick: 'South Africa', type: 'asian_handicap', handicap: 1.5, homeTeam: MEX, awayTeam: RSA }, 1, 0)).toBe('won');
  });
});

describe('gradeSoccerGame — guards', () => {
  it('returns null when score is missing', () => {
    expect(gradeSoccerGame({ pick: 'Draw', type: 'draw', homeTeam: MEX, awayTeam: RSA }, null, 1)).toBeNull();
  });
});
