import { describe, it, expect } from 'vitest';
import { diffAvailability, parseLateNewsAnswer, buildLateNewsAsk } from '../../../src/services/pickdesk/lateNews.js';

const row = (side, name, status, extra = {}) => ({ side, name, position: 'WR', status, note: null, ...extra });

describe('late news (founder GO, Oct 13 2026)', () => {
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

  it('reads only a stand or a scratch with a reason', () => {
    expect(parseLateNewsAnswer('{"decision":"scratch","why":"His QB is out."}')).toEqual({ decision: 'scratch', why: 'His QB is out.' });
    expect(parseLateNewsAnswer('ok {"decision":"stand","why":""}')).toEqual({ decision: 'stand', why: '' });
    expect(parseLateNewsAnswer('{"decision":"scratch","why":""}')).toBeNull();
    expect(parseLateNewsAnswer('{"decision":"maybe"}')).toBeNull();
  });

  it('asks one question after the pick, his words and the news', () => {
    const ask = buildLateNewsAsk({ league: 'NFL', pick: 'X +3', matchup: 'X @ Y', commence: '2026-10-18T17:00:00Z', homeTeam: 'Y', awayTeam: 'X',
      rationale: 'MY WORDS', changes: [{ side: 'home', name: 'A One', position: 'QB', from: 'Questionable', to: 'Inactive', note: null }], unresolved: [] });
    expect(ask).toContain('MY WORDS');
    expect(ask).toContain('- Y: A One (QB), Questionable → Inactive');
    expect(ask.match(/\?/g)).toHaveLength(1);
    const nba = buildLateNewsAsk({ league: 'NBA', pick: 'X +3', matchup: 'X @ Y', commence: '2026-10-22T23:30:00Z', homeTeam: 'Y', awayTeam: 'X',
      rationale: 'W', changes: [], unresolved: [{ side: 'away', name: 'B Two', position: 'SG', status: 'Questionable', note: 'Coach says game-time decision.' }] });
    expect(nba).toContain('- X: B Two (SG), questionable. Latest report: Coach says game-time decision.');
    expect(nba).toContain('questionable or day-to-day means the team has not ruled him in or out');
  });
});
