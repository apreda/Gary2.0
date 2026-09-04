import { describe, it, expect } from 'vitest';
import { buildFootballBoxLine, buildFootballBoxLineFromPlays } from '../../src/services/gameRecap.js';

const row = (team, rush = 0, rec = 0, pass = 0) => ({
  team: { college: team },
  rushing_touchdowns: rush,
  receiving_touchdowns: rec,
  passing_touchdowns: pass,
});

// Founder, Sep 4 2026: the football headline card is the MLB card "to a tee
// except HR are TD for football".
describe('the football box line', () => {
  it('counts the real game: UMass 4, Rutgers 3 behind a 37-21 final', () => {
    const box = buildFootballBoxLine({
      playerStats: [
        row('Massachusetts', 1, 2, 3),
        row('Massachusetts', 0, 1),
        row('Rutgers', 0, 3, 3),
      ],
      awayTeam: 'Massachusetts Minutemen',
      homeTeam: 'Rutgers Scarlet Knights',
      awayScore: 37,
      homeScore: 21,
    });
    expect(box).toEqual({
      away: { runs: 37, hits: null, hr: null, td: 4 },
      home: { runs: 21, hits: null, hr: null, td: 3 },
    });
  });

  it('counts a touchdown once — a passing TD and its receiving TD are one score', () => {
    const box = buildFootballBoxLine({
      // The shut-out side still played, so it still has rows — a side with no
      // rows at all drops the box entirely (the test below).
      playerStats: [row('Ohio State', 0, 0, 4), row('Ohio State', 0, 4), row('Michigan', 0, 0)],
      awayTeam: 'Ohio State Buckeyes', homeTeam: 'Michigan Wolverines',
      awayScore: 28, homeScore: 0,
    });
    expect(box.away.td).toBe(4);
  });

  it('refuses a count the scoreboard cannot hold', () => {
    // Five touchdowns is 30 points minimum; the side scored 14.
    expect(buildFootballBoxLine({
      playerStats: [row('Toledo', 2, 3)],
      awayTeam: 'Toledo Rockets', homeTeam: 'Michigan State Spartans',
      awayScore: 14, homeScore: 21,
    })).toBeNull();
  });

  it('never builds half a box', () => {
    expect(buildFootballBoxLine({
      playerStats: [row('Toledo', 1, 1)],
      awayTeam: 'Toledo Rockets', homeTeam: 'Michigan State Spartans',
      awayScore: 12, homeScore: 21,
    })).toBeNull();
    expect(buildFootballBoxLine({ playerStats: [], awayTeam: 'A', homeTeam: 'B' })).toBeNull();
    expect(buildFootballBoxLine({ playerStats: null, awayTeam: 'A', homeTeam: 'B' })).toBeNull();
  });

  it('joins the sides however the feed spells them', () => {
    const box = buildFootballBoxLine({
      playerStats: [
        { team: { full_name: 'San José State Spartans' }, rushing_touchdowns: 2, receiving_touchdowns: 0 },
        { team_name: 'Eastern Michigan', rushing_touchdowns: 0, receiving_touchdowns: 1 },
      ],
      awayTeam: 'San José State Spartans', homeTeam: 'Eastern Michigan Eagles',
      awayScore: 17, homeScore: 10,
    });
    expect(box.away.td).toBe(2);
    expect(box.home.td).toBe(1);
  });

  it('skips a row whose team matches both sides or neither', () => {
    const box = buildFootballBoxLine({
      playerStats: [
        row('Miami', 2, 0),
        row('Nobody At All', 3, 3),
        row('Stanford', 0, 1),
      ],
      awayTeam: 'Miami Hurricanes', homeTeam: 'Stanford Cardinal',
      awayScore: 21, homeScore: 14,
    });
    expect(box.away.td).toBe(2);
    expect(box.home.td).toBe(1);
  });
});

const play = (team, value, type = 'Passing Touchdown') => ({
  scoring_play: true, score_value: value, type, team: { college: team },
});
const filler = { scoring_play: false, score_value: 0, type: 'Punt', team: { college: 'Rutgers' } };

// The play feed is the exact count: a touchdown is a six-point scoring play
// whoever scored it, so defense and returns are in it and the player box's
// rushing+receiving sum is not.
describe('the football box line, counted from plays', () => {
  it('counts the real game: UMass 4, Rutgers 3', () => {
    const box = buildFootballBoxLineFromPlays({
      plays: [
        filler,
        play('Massachusetts', 6), play('Massachusetts', 6),
        play('Massachusetts', 6), play('Massachusetts', 6, 'Rushing Touchdown'),
        play('Rutgers', 6), play('Rutgers', 6), play('Rutgers', 6),
        play('Massachusetts', 3, 'Field Goal Good'),
      ],
      awayTeam: 'Massachusetts Minutemen', homeTeam: 'Rutgers Scarlet Knights',
      awayScore: 37, homeScore: 21,
    });
    expect(box.away.td).toBe(4);
    expect(box.home.td).toBe(3);
  });

  it('sees the touchdown the player box cannot — a defensive return', () => {
    // Georgia Tech scored 13 on Sep 3 2026 with zero offensive touchdowns.
    const box = buildFootballBoxLineFromPlays({
      plays: [
        play('Georgia Tech', 6, 'Interception Return Touchdown'),
        play('Georgia Tech', 3, 'Field Goal Good'),
        play('Georgia Tech', 3, 'Field Goal Good'),
        play('Colorado', 6), play('Colorado', 6),
      ],
      awayTeam: 'Colorado Buffaloes', homeTeam: 'Georgia Tech Yellow Jackets',
      awayScore: 14, homeScore: 13,
    });
    expect(box.home.td).toBe(1);
    expect(box.away.td).toBe(2);
  });

  it('a shut-out side counts zero, not nothing', () => {
    const box = buildFootballBoxLineFromPlays({
      plays: [play('Ohio State', 6), play('Ohio State', 6)],
      awayTeam: 'Ohio State Buckeyes', homeTeam: 'Michigan Wolverines',
      awayScore: 14, homeScore: 0,
    });
    expect(box.home.td).toBe(0);
  });

  it('refuses a count the scoreboard cannot hold, and a game with no plays', () => {
    expect(buildFootballBoxLineFromPlays({
      plays: [play('Toledo', 6), play('Toledo', 6), play('Michigan State', 6)],
      awayTeam: 'Toledo Rockets', homeTeam: 'Michigan State Spartans',
      awayScore: 7, homeScore: 21,
    })).toBeNull();
    expect(buildFootballBoxLineFromPlays({ plays: [filler], awayTeam: 'A', homeTeam: 'B' })).toBeNull();
    expect(buildFootballBoxLineFromPlays({ plays: [], awayTeam: 'A', homeTeam: 'B' })).toBeNull();
  });
});
