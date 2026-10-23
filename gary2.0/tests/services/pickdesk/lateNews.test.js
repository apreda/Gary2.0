import { describe, it, expect } from 'vitest';
import { diffAvailability, findMlbGame } from '../../../src/services/winners/lateNews.js';

const row = (side, name, status, extra = {}) => ({ side, name, position: 'WR', status, note: null, ...extra });

describe('late news (founder GO, Oct 13 2026)', () => {
  it('MLB: finds tonight\'s game when the pick names the clubs short and the schedule names them in full', () => {
    const game = (pk, away, home, at) => ({ gamePk: pk, gameDate: at, teams: { away: { team: { name: away } }, home: { team: { name: home } } } });
    const schedule = [game(1, 'Milwaukee Brewers', 'Los Angeles Dodgers', '2026-10-15T00:00:00Z'), game(2, 'Chicago White Sox', 'Boston Red Sox', '2026-10-14T17:05:00Z')];
    expect(findMlbGame(schedule, { homeTeam: 'Dodgers', awayTeam: 'Brewers', commence: '2026-10-15T00:00:00+00:00' })?.gamePk).toBe(1);
    expect(findMlbGame(schedule, { homeTeam: 'Red Sox', awayTeam: 'White Sox', commence: '2026-10-14T17:05:00Z' })?.gamePk).toBe(2);
    expect(findMlbGame(schedule, { homeTeam: 'Los Angeles Dodgers', awayTeam: 'Milwaukee Brewers', commence: '2026-10-15T00:00:00Z' })?.gamePk).toBe(1);
    expect(findMlbGame(schedule, { homeTeam: 'Brewers', awayTeam: 'Dodgers', commence: '2026-10-15T00:00:00Z' })).toBeUndefined();
  });

  it('finds a status change, a new listing and a player off the report; an unchanged report is clear', () => {
    const before = { rows: [row('home', 'A One', 'Questionable'), row('away', 'B Two', 'Out')] };
    expect(diffAvailability(before, before, 'NFL')).toEqual({ changes: [], unresolved: [] });
    const after = { rows: [row('home', 'A One', 'Inactive'), row('home', 'C Three', 'Out')] };
    const { changes } = diffAvailability(before, after, 'NFL');
    expect(changes.map((c) => `${c.name}:${c.from}>${c.to}`).sort()).toEqual(['A One:Questionable>Inactive', 'B Two:Out>off the report', 'C Three:not listed>Out']);
  });

  it('names an NBA player still undecided at the check; the NFL has settled its own by then', () => {
    const report = { rows: [row('home', 'A One', 'Questionable')] };
    expect(diffAvailability(report, report, 'NBA').unresolved).toHaveLength(1);
    expect(diffAvailability(report, report, 'NFL').unresolved).toHaveLength(0);
  });

  it('MLB: a new starting pitcher and a regular out of tonight\'s lineup are news; a lineup being posted is not', () => {
    const before = { rows: [row('home', 'Ace Arm', 'Starting pitcher', { position: 'SP' })] };
    const after = { rows: [row('home', 'Spot Starter', 'Starting pitcher', { position: 'SP' }), row('home', 'Lead Off', 'In the lineup'),
      row('home', 'Star Bat', "Not in tonight's lineup")] };
    const { changes } = diffAvailability(before, after, 'MLB');
    expect(changes.map((c) => c.name).sort()).toEqual(['Spot Starter', 'Star Bat']);
    expect(changes.find((c) => c.name === 'Spot Starter').from).toBe('Ace Arm was the starting pitcher');
  });

});
