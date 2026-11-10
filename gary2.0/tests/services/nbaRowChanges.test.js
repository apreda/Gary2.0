// A game row says who joined the five and who came back, from the team's stored games before it (Nov 10 2026 data round
// 4: Cleveland's Nov 2 row named Meleek Thomas among the starters with nothing to say it was his first start; Atlanta's
// Nov 7 row read Jalen Johnson's 36 minutes with nothing to say he had missed three games).
import { describe, expect, it } from 'vitest';
import { backFromMissing, newToTheFive, summariesByTeam } from '../../src/services/sports/nba/nbaGameRecordText.js';

const cle = { id: 5, abbr: 'CLE' }, opp = { id: 9, abbr: 'OPP' };
const game = (id, date, starters, played) => ({ game_id: String(id), game_date: date,
  summary: { date, home: { ...cle, score: 100 }, away: { ...opp, score: 90 }, starters: { home: starters, away: [] }, played: { home: played, away: [] } } });
const five = ['Donovan Mitchell', 'James Harden', 'Evan Mobley', 'Jarrett Allen', 'Max Strus'];
const byTeam = summariesByTeam([
  game(1, '2026-10-29', five, [...five, 'Sam Merrill']),
  game(2, '2026-10-31', five, [...five, 'Sam Merrill']),
  game(3, '2026-11-02', ['Donovan Mitchell', 'James Harden', 'Evan Mobley', 'Meleek Thomas', 'Max Strus'], [...five, 'Meleek Thomas']),
]);

describe('newToTheFive', () => {
  it('names a starter new since the last game, and a first start', () => {
    expect(newToTheFive(byTeam, 5, 3, 2)).toBe("not in the five for the team's game before: Meleek Thomas (his first start this season)");
    expect(newToTheFive(byTeam, 5, 2, 1)).toBe('');
  });
  it('says nothing when a game before this one is not stored', () => {
    expect(newToTheFive(byTeam, 5, 3, 3)).toBe('');
  });
});

describe('backFromMissing', () => {
  it("names who played after missing the team's last games, and one in none of them", () => {
    const later = summariesByTeam([...byTeam.get('5'), game(4, '2026-11-04', five, [...five, 'Sam Merrill', 'Bench Guy'])]);
    expect(backFromMissing(later, 5, 4, 3)).toBe("back from missing: Sam Merrill (not in the team's last game), Bench Guy (not in any of the team's 3 games before this one)");
    expect(backFromMissing(later, 5, 4, 3, (name) => name !== 'Bench Guy')).toBe("back from missing: Sam Merrill (not in the team's last game)");
  });
});
