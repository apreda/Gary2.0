import { describe, it, expect } from 'vitest';
import { nbaGameRows } from '../../src/services/gary/darts/nbaDartsBoard.js';

// Nov 10 2026 data round: a number carries what it came from.
const records = [{
  game_date: '2026-11-08',
  record: {
    home: { id: 1, abbr: 'AAA' }, away: { id: 2, abbr: 'BBB' }, final: { home: 100, away: 90 }, periods: [1, 2, 3, 4],
    teams: { home: { fga: 90, fgm: 40 }, away: { fga: 85, fgm: 35 } },
    players: [{ id: 7, name: 'Test Guy', side: 'home', min: 30.2, starter: true, pts: 20, reb: 10, ast: 5, oreb: 2, dreb: 8, fgm: 8, fga: 15, fg3m: 1, fg3a: 4, ftm: 3, fta: 4, pf: 2 }],
  },
}];
const who = { teamId: '1', playerId: 7, player: 'Test Guy' };

describe('NBA dart and prop sheet rows', () => {
  it('a rebound count sits against the missed field goals at each end', () => {
    expect(nbaGameRows(who, records, 'reb', new Map())[0]).toContain("10 (2 offensive of his team's 50 missed field goals, 8 defensive of BBB's 50)");
  });
  it('a points + rebounds + assists row says what the sum was made of', () => {
    expect(nbaGameRows(who, records, 'pra', new Map())[0]).toContain('35 (20 pts, 10 reb, 5 ast; 8-15 FG, 1-4 3PT, 3-4 FT)');
  });
});
