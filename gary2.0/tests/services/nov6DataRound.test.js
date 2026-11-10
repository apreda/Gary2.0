import { describe, expect, it } from 'vitest';
import { reconcileNflStatus } from '../../src/services/sports/nfl/nflAvailability.js';
import { withOfficialReport, weekPassers } from '../../src/services/sports/nfl/nflPlayerContext.js';
import { gameWeatherLine } from '../../src/services/sports/nfl/nflGameWeather.js';
import { nextListed } from '../../src/services/sports/nba/nbaGameRecordText.js';

// The failures the Nov 1-5 2026 data checks found on real games.
describe('an NFL player ruled out after the report', () => {
  const official = (comment) => ({ officialStatus: true, noteCurrent: true, status: 'Questionable', comment });

  it('reads Out when the note has ruled him out or put him on a list', () => {
    expect(reconcileNflStatus(official("Brown (knee/ankle) has been ruled out for Sunday's game against the Dolphins.")).status).toBe('Out');
    expect(reconcileNflStatus(official('The Chiefs placed Sneed (knee) on injured reserve Saturday.')).status).toBe('Out');
  });

  it('stays Questionable when the note looks back at the last game', () => {
    expect(reconcileNflStatus(official("Smith was ruled out of last Sunday's game and practiced fully Wednesday.")).status).toBe('Questionable');
  });

  it('reads Out on the props and darts boards too, and only on this week\'s note', () => {
    const feed = (date) => [{ player: { first_name: 'A.J.', last_name: 'Brown', team: { full_name: 'New England Patriots' } }, status: 'Questionable',
      comment: "Brown has been ruled out for Sunday's game against the Dolphins.", date }];
    const read = (date) => withOfficialReport(feed(date), [{ team: 'New England Patriots', kickoff: '2026-11-01T18:00:00Z', final: true,
      report: { players: [{ name: 'A.J. Brown', game_status: 'Questionable' }] } }])[0].status;
    expect(read('2026-10-31T20:00:00Z')).toBe('Out');
    expect(read('2026-10-20T20:00:00Z')).toBe('Questionable');
  });
});

describe('a past NFL game in the rain', () => {
  it('has a weather line for 0.04 inches of drizzle', () => {
    const line = gameWeatherLine({ roof: 'outdoors', temp: 70, wind: 5 }, { precip: 0.04, snow: 0, conditions: ['light drizzle', 'drizzle'] });
    expect(line).toContain('0.04 in. of precipitation');
  });
});

describe('how an NBA player was listed for his next game', () => {
  const game = (date, listed, played) => ({ game_id: date, game_date: date, summary: { home: { id: 5 }, away: { id: 9 }, listed: { home: listed, away: [] }, played: { home: played, away: [] } } });
  const byTeam = (...games) => new Map([['5', games]]);

  it('never takes a teammate\'s absence: Jaylin Williams played, Jalen Williams had the surgery', () => {
    const teams = byTeam(game('2026-10-28', [], ['Jaylin Williams']), game('2026-10-31', [{ name: 'Jalen Williams', status: 'Out', reason: 'Left Ankle Surgery' }], ['Jaylin Williams']));
    expect(nextListed(teams, 5, '2026-10-28', 'Jaylin Williams')).toBeNull();
  });

  it('still finds the same player under the report\'s spelling', () => {
    const sarr = byTeam(game('2026-10-28', [], ['Alexandre Sarr']), game('2026-10-31', [{ name: 'Alex Sarr', status: 'Out', reason: 'Knee' }], []));
    expect(nextListed(sarr, 5, '2026-10-28', 'Alexandre Sarr')).toContain('Out for the next game');
    const bailey = byTeam(game('2026-10-28', [], ['Airious Bailey']), game('2026-10-31', [{ name: 'Ace Bailey', status: 'Questionable', reason: 'Knee' }], ['Airious Bailey']));
    expect(nextListed(bailey, 5, '2026-10-28', 'Airious Bailey')).toContain('Questionable for the next game');
  });
});

describe("a game's quarterback", () => {
  // Nov 10 2026: Baker Mayfield threw three passes in the Buccaneers' 16-0 Week 8 win, so the game had no quarterback and
  // every Buccaneers read said his games at quarterback were "not on file (the weekly player stats did not load)".
  it('is named when his side threw under five passes all game', () => {
    const row = (team, position, player_display_name, attempts) => ({ season: '2026', week: '8', team, position, player_display_name, attempts });
    const by = weekPassers([row('TB', 'QB', 'Baker Mayfield', '3'), row('ATL', 'QB', 'Michael Penix Jr.', '24'), row('ATL', 'WR', 'Drake London', '1')]);
    expect(by.get('2026|8|TB')).toEqual(['Baker Mayfield']);
    expect(by.get('2026|8|ATL')).toEqual(['Michael Penix Jr.']);
  });
});
