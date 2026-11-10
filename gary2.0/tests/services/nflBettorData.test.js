import { describe, it, expect } from 'vitest';
import { gameByGame, lineStory, nflGameFull, quarterbacks, skillPlayers, teamGames } from '../../src/services/sports/nfl/nflBettorData.js';

// lineStory is shared by the NFL, college and the NBA.
describe('lineStory with no listed move', () => {
  const at = (h) => `2026-10-22T${String(h).padStart(2, '0')}:00:00.000Z`;
  const board = (h, over = {}) => ({ at: at(h), spread_home: -7.5, total: 47.5, ml_home: -300, ml_away: 250, sp_home: -110, sp_away: -110, books: 1, ...over });

  // Oct 23 2026 data audit: the Thunder went from -300 to -335 under the 2.5-point mark, the story said neither line had
  // moved, and the read called it a settled market.
  it('gives the drift of a moneyline that moved under the mark, never "not moved"', () => {
    const text = lineStory({ path: [board(1)], now: board(9, { ml_home: -335, ml_away: 270 }), book: 'fanduel' }, 'Oklahoma City Thunder', 'Denver Nuggets');
    const [, still] = text.split('\n');
    expect(still).not.toMatch(/moneylines? (?:has|have) not moved/i);
    expect(still).toMatch(/-300 to -335 \(75\.0% to 77\.0% implied\)/);
  });
});

// Round 3, Nov 10 2026: the Nov 8 Browns read "Deshaun Watson" as the plain starter while this week's report had him
// questionable with a concussion and ESPN's chart had Shedeur Sanders next; Sanders started.
describe('THE QUARTERBACKS with the starter on this week\'s report', () => {
  it('says his report status beside his name and the next quarterback on the chart', () => {
    const d = { season: 2026, schedule: [], playerWeek: [] };
    const desk = '[AWAY] Cleveland Browns: Deshaun Watson (9th Season)\n[HOME] New Orleans Saints: Tyler Shough';
    const chart = new Map([['Cleveland Browns', { listed: [{ name: 'Deshaun Watson', game_status: 'Questionable', injury: 'Concussion' }],
      starter: new Map([['deshaunwatson', { spot: 'qb', next: 'Shedeur Sanders' }]]), qb1: 'Deshaun Watson' }]]);
    const text = quarterbacks(d, desk, 'New Orleans Saints', 'Cleveland Browns', '2026-11-08', { chart });
    expect(text.split('\n')[0]).toBe("Cleveland Browns: Deshaun Watson (Questionable on this week's injury report, concussion; next on ESPN's depth chart: Shedeur Sanders)");
    expect(text).toMatch(/^New Orleans Saints: Tyler Shough$/m);
  });
});

// Round 4, Nov 10 2026: Dameon Pierce, released by the Eagles, read "Released on this week's injury report".
describe('CARRIES AND TARGETS for a released player', () => {
  it('says he was released and the roster week, not that he is on the report', () => {
    const g = { game_id: 'g7', season: '2026', game_type: 'REG', week: '7', gameday: '2026-10-25', home_team: 'PHI', away_team: 'NYG', home_score: '20', away_score: '10' };
    const d = { season: 2026, schedule: [g], teamWeek: [], snaps: [],
      playerWeek: [{ player_id: 'p1', player_display_name: 'Dameon Pierce', position: 'RB', team: 'PHI', game_id: 'g7', week: '7', season: '2026', carries: 9, rushing_yards: 40 }],
      rosterWeekly: [{ gsis_id: 'p1', team: 'PHI', season: '2026', week: '9', status: 'CUT' }] };
    const text = skillPlayers(d, 'Philadelphia Eagles', '2026-11-12', '• Dameon Pierce (Running Back) (Released) - The Eagles released Pierce.');
    expect(text).toMatch(/Dameon Pierce \(RB\) · released \(the club's Wk 9 roster\): Wk 7/);
    expect(text).not.toMatch(/injury report/);
  });
});

// Round 4b, Nov 10 2026: the Colts' Wk 8 head read "Anthony Richardson (relief)" with no word that he came in at Q4 11:08
// down 35, and the Ravens' listed Fagnano before Huntley, who came in first.
describe('the game head\'s quarterbacks', () => {
  it('lists them in the order they played, with when each later one first dropped back and the score then', () => {
    const g = { game_id: 'g8', season: '2026', game_type: 'REG', week: '8', gameday: '2026-11-01', home_team: 'BUF', away_team: 'BAL', home_score: '30', away_score: '6' };
    const qb = (name, att) => ({ player_id: name, player_display_name: name, position: 'QB', team: 'BAL', game_id: 'g8', week: '8', season: '2026', attempts: att, completions: 1 });
    const d = { season: 2026, schedule: [g], teamWeek: [], snaps: [], playerWeek: [qb('Lamar Jackson', 1), qb('Joe Fagnano', 21), qb('Tyler Huntley', 4)],
      ledgerGames: new Map([['g8', { game_id: 'g8', starters: { BAL: { name: 'J.Fagnano', started: 'L.Jackson' } },
        qbFirst: { 'BAL|L.Jackson': { i: 0, q: 1, clock: '15:00', diff: 0 }, 'BAL|T.Huntley': { i: 1, q: 1, clock: '10:00', diff: -7 }, 'BAL|J.Fagnano': { i: 2, q: 2, clock: '9:39', diff: -6 } } }]]) };
    const head = gameByGame(d, 'Baltimore Ravens', '2026-11-12').split('\n').find((l) => /^  Wk 8 /.test(l));
    expect(head).toMatch(/QB Lamar Jackson \(started, left early\) 1-of-1.*; Tyler Huntley \(relief, first dropback Q1 10:00, down 7\) 1-of-4.*; Joe Fagnano \(first dropback Q2 9:39, down 6\) 1-of-21/);
  });
});

// Round 4b, Nov 10 2026: the Packers' Wk 9 drives line read "2 began in Patriots territory (15 points)"; the play-by-play has
// 22 points off their four takeaways (three touchdowns, one with a two-point try).
describe('the drives line after takeaways', () => {
  it('gives the points from the takeaways when the play-by-play finds every one the box counts, and nothing otherwise', () => {
    const g = { game_id: 'g9', season: '2026', game_type: 'REG', week: '9', gameday: '2026-11-08', home_team: 'NE', away_team: 'GB', home_score: '27', away_score: '45' };
    const side = { drives: 10, drive_end_of_half: 0, drive_tds: 5, red_zone_trips: 0, opp_territory_drives: 0 };
    const tk = (pts, td) => ({ team: 'GB', q: 1, clock: '14:32', kind: 'interception', points: pts, td, fg: false });
    const d = { season: 2026, schedule: [g], snaps: [], playerWeek: [],
      teamWeek: [{ game_id: 'g9', team: 'NE', passing_interceptions: 3, fumbles_lost_total: 1 }, { game_id: 'g9', team: 'GB' }],
      ledgerGames: new Map([['g9', { game_id: 'g9', lines: { GB: side, NE: side }, takeaways: [tk(7, true), tk(0, false), tk(7, true), tk(8, true)] }]]) };
    const drives = (dd) => nflGameFull(dd, teamGames(dd, 'GB', 2026, '2026-11-12')[0], 'GB', '2026-11-12').split('\n').find((l) => /^\s*drives:/.test(l));
    expect(drives(d)).toMatch(/Packers 10 \(5 TD\); no red-zone trips; none began in Patriots territory; after its 4 takeaways: 22 points \(3 TD\) · Patriots/);
    d.ledgerGames.get('g9').takeaways.pop();
    expect(drives(d)).not.toMatch(/takeaway/);
  });
});
