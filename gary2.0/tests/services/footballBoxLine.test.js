import { describe, it, expect } from 'vitest';
import { buildFootballBoxLine } from '../../src/services/gameRecap.js';

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
