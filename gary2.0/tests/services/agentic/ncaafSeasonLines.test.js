import { describe, it, expect } from 'vitest';
import { seasonGames, seasonLines } from '../../../src/services/gary/agentic/orchestrator/ncaafRead.js';

// Oregon on Oct 17 2026: Dante Moore out, Brock Thomas starting, an 84-0 FCS win inside the season.
const desk = `THIS SEASON GAME BY GAME (2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every completed game this season, newest first.

Oregon Ducks (3-2):
  Sat, Oct 10 · L 15-17 vs UCLA Bruins — opponent: Big Ten, now 5-0
      quarterback: Dylan Raiola 6-of-19, 43 yds, 0 TD, 2 INT; Brock Thomas 11-of-15, 126 yds, 1 TD, 0 INT
      offense: 63 plays, 29% success · 27 runs for 73 (2.7), 34% success · passing 17-35 for 199 (5.7 per attempt), 25% success
      defense: 71 plays, 35% success allowed · 47 runs for 140 (3.0), 31% success allowed · passing 13-23 for 205 (8.9 per attempt)
  Fri, Sep 18 · W 84-0 vs Portland State Vikings — opponent: FCS, now 2-4
      quarterback: Dante Moore 19-of-23, 280 yds, 4 TD, 0 INT
      offense: 95 plays · 51 runs for 273 (5.4) · passing 35-43 for 453 (10.5 per attempt)
      defense: 38 plays · 17 runs for 2 (0.1) · passing 8-20 for 101 (5.1 per attempt)
  Sat, Sep 5 · W 34-27 vs Boise State Broncos — opponent: Pac-12, now 5-1
      quarterback: Dante Moore 28-of-37, 378 yds, 3 TD, 0 INT
      units: the per-game unit lines are not available for this game

Nebraska Cornhuskers (1-0):
  Sat, Oct 10 · W 20-17 (OT) @ Indiana Hoosiers — opponent: Big Ten, now 6-1
      quarterback: Anthony Colandrea 25-of-43, 262 yds, 0 TD, 1 INT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

describe('college season lines', () => {
  const teams = seasonGames(desk);

  it('reads each game: result, FCS, who threw the most passes, yards', () => {
    expect(teams.map((t) => [t.team, t.games.length])).toEqual([['Oregon Ducks', 3], ['Nebraska Cornhuskers', 1]]);
    expect(teams[0].games[0]).toMatchObject({ result: 'L', pf: 15, pa: 17, fcs: false, qb: 'Dylan Raiola', off: 272, def: 345 });
    expect(teams[0].games[1]).toMatchObject({ fcs: true, qb: 'Dante Moore' });
    expect(teams[0].games[2]).toMatchObject({ off: null, def: null });
    expect(teams[1].games[0]).toMatchObject({ result: 'W', pf: 20, pa: 17, qb: 'Anthony Colandrea' });
  });

  it('keeps FCS games out, lists five games or fewer one by one, and splits by quarterback', () => {
    const text = seasonLines('Oregon Ducks', teams[0].games, 'Brock Thomas');
    expect(text).toMatch(/against FBS teams, 2 games: 1-1, L 15-17 vs UCLA Bruins \(272 yards, allowed 345\), W 34-27 vs Boise State Broncos\n/);
    expect(text).toMatch(/against FCS teams: W 84-0 vs Portland State Vikings/);
    expect(text).toMatch(/Brock Thomas, this week's quarterback, threw the most passes in none/);
    expect(text).toMatch(/With Dante Moore throwing the most passes, 1 game: 1-0/);
  });

  it('says so when this week\'s quarterback threw the most passes in every game', () => {
    expect(seasonLines('Nebraska Cornhuskers', teams[1].games, 'Anthony Colandrea')).toMatch(/threw the most passes in all 1\./);
  });
});
