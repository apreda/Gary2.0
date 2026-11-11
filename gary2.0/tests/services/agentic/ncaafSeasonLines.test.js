import { describe, it, expect } from 'vitest';
import { seasonGames, seasonLines } from '../../../src/services/gary/agentic/orchestrator/ncaafRead.js';
import { opponentClause, firstStartThisSeason, usualStartersMissing, siteName } from '../../../src/services/gary/agentic/scoutReport/sports/ncaafSchedule.js';

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

  it('keeps FCS games out, lists every game newest first, and splits by quarterback', () => {
    const text = seasonLines('Oregon Ducks', teams[0].games, 'Brock Thomas');
    expect(text).toMatch(/^Oregon Ducks \(2-1\), against FBS teams, 2 games, newest first: L 15-17 vs UCLA Bruins \(Big Ten; 272 yards, allowed 345\), W 34-27 vs Boise State Broncos \(Pac-12\)\n/);
    // Oct 31 2026: the team's own record once; none on opponents or quarterbacks.
    expect(text).not.toMatch(/\d+-\d+ now|: 1-0/);
    expect(text).toMatch(/against FCS teams: W 84-0 vs Portland State Vikings/);
    expect(text).toMatch(/Brock Thomas, this week's quarterback, threw the most passes in none/);
    expect(text).toMatch(/With Dante Moore throwing the most passes, 1 game: /);
  });

  // Oct 23 2026 data audit: from six games the board averaged the season, and Virginia's last three (about 250 yards
  // gained, 433 allowed) read as "346 yards a game, 344 allowed".
  it('lists six games or more one by one, never as an average', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ result: i < 3 ? 'L' : 'W', pf: 20 + i, pa: 24, at: 'vs', opponent: `Team ${i}`, fcs: false, qb: 'Beau Pribula', off: 250 + i, def: 430 }));
    const text = seasonLines('Virginia Cavaliers', six, 'Beau Pribula');
    expect(text).toMatch(/^Virginia Cavaliers \(3-3\), against FBS teams, 6 games, newest first: L 20-24 vs Team 0 \(250 yards, allowed 430\), .*W 25-24 vs Team 5 \(255 yards, allowed 430\)/);
    expect(text).not.toMatch(/a game|per game/);
  });

  it('says so when this week\'s quarterback threw the most passes in every game', () => {
    expect(seasonLines('Nebraska Cornhuskers', teams[1].games, 'Anthony Colandrea')).toMatch(/threw the most passes in all 1\./);
  });

  // Rows built from Nov 10 2026: who the game was against, then the score. The opponent's own games carry scores and
  // overtimes of their own.
  it('reads rows with the opponent before the score', () => {
    const newer = `THIS SEASON GAME BY GAME (2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every completed game this season, newest first.

North Carolina Tar Heels (5-3):
  Sat, Oct 24 · vs Syracuse Orange — opponent: ACC, talent No. 35 of 138, not in the AP Top 25 that week; its quarterback that day: Steve Angeli (started) 20-of-34, 256 yds, 3 runs for 1 (sacks included); its games, newest first: W 42-41 (OT) @ UConn Huskies (QB Steve Angeli; ran 120 on 30, passed for 310), L 10-24 @ Clemson Tigers — L 30-31 (OT) — by quarter 10-3-7-3, opponent 0-10-0-13, overtime 7-8
      quarterback: Billy Edwards Jr. (started) 25-of-38, 290 yds, 2 TD, 1 INT
      offense: 31 runs for 120 · passing 25-38 for 290 · 1 giveaway (1 INT), 7 opponent points off it · no fumbles · third down 6-14
      defense: 35 runs for 140 · 2 sacks for -14 yards · passing 20-34 for 256 · 2 sacks, 5 tackles for loss · 0 takeaways · opponent did not fumble
  Sat, Sep 12 · vs East Tennessee State Buccaneers — opponent: FCS; its quarterback that day: Mason Mims (started) 23-of-31, 178 yds — W 35-3 — by quarter 7-14-14-0, opponent 0-0-0-3
      quarterback: Billy Edwards Jr. (started) 20-of-25, 240 yds, 3 TD, 0 INT
  Sat, Aug 29 · vs TCU Horned Frogs (neutral site) — opponent: Big 12, talent No. 40 of 138; its quarterback that day: Jaden Craig (started) 20-of-32, 175 yds; its games: under Duke Blue Devils' Sat, Oct 3 game above — W 15-10 — by quarter 10-2-3-0, opponent 10-0-0-0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    const [unc] = seasonGames(newer);
    expect(unc.games.map((g) => [g.result, g.pf, g.pa, g.ot, g.at, g.opponent, g.fcs, g.oppNow])).toEqual([
      ['L', 30, 31, true, 'vs', 'Syracuse Orange', false, 'ACC'],
      ['W', 35, 3, false, 'vs', 'East Tennessee State Buccaneers', true, 'FCS'],
      ['W', 15, 10, false, 'vs', 'TCU Horned Frogs', false, 'Big 12'],
    ]);
    expect(unc.games[0]).toMatchObject({ qb: 'Billy Edwards Jr. (started)', off: 410, def: 382 });
  });

  // Round 5: the opponent clause's parts are split by " · ", as "; " splits its quarterbacks. Rows stored before read too.
  it('splits the opponent clause by dots and still reads an FCS label', () => {
    expect(opponentClause('ACC, talent No. 35 of 138, its games, newest first: W 42-41 (OT) @ UConn Huskies', 'A 25-of-38, 290 yds; B 4-of-5, 30 yds'))
      .toBe('ACC, talent No. 35 of 138 · its quarterback that day: A 25-of-38, 290 yds; B 4-of-5, 30 yds · its games, newest first: W 42-41 (OT) @ UConn Huskies');
    const row = `THIS SEASON GAME BY GAME (2026)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nEvery completed game this season, newest first.\n\nNorth Carolina Tar Heels (1-0):\n  Sat, Sep 12 · vs East Tennessee State Buccaneers — opponent: ${opponentClause('FCS', 'Mason Mims (started) 23-of-31, 178 yds')} — W 35-3 — by quarter 7-14-14-0, opponent 0-0-0-3\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    expect(seasonGames(row)[0].games[0]).toMatchObject({ result: 'W', pf: 35, pa: 3, fcs: true, oppNow: 'FCS' });
  });

  // Round 5: Ohio State at USC, Fahey's first start after Sayin started every game before; silent when any earlier
  // game's starting quarterback is not on file, and with no earlier game.
  it('says a first start of the season only when every earlier starter is known', () => {
    const qb = (name) => [{ name, key: name.toLowerCase().replace(/[^a-z]/g, ''), position: 'QB' }];
    expect(firstStartThisSeason([qb('Julian Sayin'), qb('Julian Sayin')], 'Luke Fahey')).toBe(true);
    expect(firstStartThisSeason([qb('Julian Sayin'), qb('Luke Fahey')], 'Luke Fahey')).toBe(false);
    expect(firstStartThisSeason([qb('Julian Sayin'), undefined], 'Luke Fahey')).toBe(false);
    expect(firstStartThisSeason([], 'Luke Fahey')).toBe(false);
  });
});

describe('usualStartersMissing', () => {
  // Navy's official boxes list the center "OC": Toran Smith started Sep 5 to Oct 3 and was out of the Oct 10 lineup.
  it('names a usual starting center the school lists as OC', () => {
    const lineup = (names) => names.map(([name, position]) => ({ name, position, key: name.toLowerCase().replace(/[^a-z]/g, '') }));
    const map = new Map([
      ['1', lineup([['Toran Smith', 'OC'], ['Cam Nichols', 'OC'], ['Blake Horvath', 'QB']])],
      ['2', lineup([['Toran Smith', 'OC'], ['Cam Nichols', 'OC'], ['Blake Horvath', 'QB']])],
      ['3', lineup([['Matthew Tomaszewski', 'OG'], ['Cam Nichols', 'OC'], ['Blake Horvath', 'QB']])],
    ]);
    expect(usualStartersMissing(map, ['1', '2', '3'], '3')).toBe('Toran Smith (OC) (each started most of their 2 earlier games with a lineup on file)');
  });
});

describe('siteName', () => {
  it('drops a closing (City, ST) that the site line prints next', () => {
    expect(siteName({ name: 'Memorial Stadium (Norman, OK)', city: 'Norman', state: 'OK' })).toBe('Memorial Stadium');
    expect(siteName({ name: 'Tiger Stadium (LA)', city: 'Baton Rouge', state: 'LA' })).toBe('Tiger Stadium');
    expect(siteName({ name: 'Memorial Stadium (Lincoln)', city: 'Norman', state: 'OK' })).toBe('Memorial Stadium (Lincoln)');
  });
});
