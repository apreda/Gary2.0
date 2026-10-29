// The NBA news Gary reads keeps only this season's regular-season games (Oct 23 2026 data audit: a team that had not
// played reached Gary through its exhibitions, "Jokić 7-for-8" and "Evan was elite", and Gary's Spurs and Nuggets reads
// leaned on "with Lu Dort and Isaiah Joe having departed").
import { describe, expect, it } from 'vitest';
import { newsForGary, newsFacts } from '../../../src/services/gary/agentic/orchestrator/nbaRead.js';

const RULE = '━'.repeat(40);
const deskWith = (news) => `CURRENT STATE & CONTEXT\n${RULE}\n--- TODAY'S GAME CONTEXT & NEWS ---\n${news}\n${RULE}\n`;
const row = (name, min, pts, fgm, fga, fg3m, fg3a) => ({ name, min, pts, fgm, fga, fg3m, fg3a, ftm: 0, fta: 0, oreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnover: 0, pf: 0 });
const side = (rows, team, fullName) => Object.assign(rows, { team, fullName, totals: { fgm: 43, fga: 95, fg3m: 14, fg3a: 31, ftm: 16, fta: 20, pts: 116, reb: 40, oreb: 10, ast: 25, stl: 8, blk: 6, turnover: 11, pf: 22 } });
const spurs = { id: 27, city: 'San Antonio', name: 'Spurs', full_name: 'San Antonio Spurs' };
const thunder = { id: 21, city: 'Oklahoma City', name: 'Thunder', full_name: 'Oklahoma City Thunder' };
const box = Object.assign(side([row('Shai Gilgeous-Alexander', 36, 32, 13, 27, 3, 7), row('Jared McCain', 22, 20, 7, 9, 6, 8)], 'Thunder', 'Oklahoma City Thunder'),
  { opponent: side([row('Victor Wembanyama', 34, 12, 1, 13, 0, 4)], 'Spurs', 'San Antonio Spurs') });
const seasons = [
  { team: 'Oklahoma City Thunder', id: 21, city: 'Oklahoma City', nickname: 'Thunder', boxes: [box],
    games: [{ id: 1, home_team: spurs, visitor_team: thunder, home_team_score: 104, visitor_team_score: 116, postseason: false }] },
  { team: 'Denver Nuggets', id: 8, city: 'Denver', nickname: 'Nuggets', games: [], boxes: [] },
];
const names = new Map([['Oklahoma City Thunder', ['Shai Gilgeous-Alexander', 'Jared McCain']], ['Denver Nuggets', ['Nikola Jokic', 'Jamal Murray', 'DeMar DeRozan']]]);
const facts = newsFacts(seasons, names, [spurs, thunder, { id: 14, city: 'Los Angeles', name: 'Lakers', full_name: 'Los Angeles Lakers' }]);
const read = (news) => newsForGary(deskWith(news), { facts, start: '2026-10-20', asOf: new Date('2026-10-23T00:07:00Z'), season: 2026 });

describe('the NBA news Gary reads', () => {
  it('keeps the regular season and drops what the teams did before it', () => {
    const news = read([
      "Shai Gilgeous-Alexander scored 32 points at San Antonio. McCain went 7-for-9, and Wembanyama finished 1-for-13.",
      '',
      "Denver's last game was a 121–106 win at the Lakers on October 16.",
      '',
      'Nikola Jokić went 7-for-8 in that game.',
      '',
      'Murray supplied the strongest impression. Malone was concise: "Jamal was elite."',
      '',
      'The supporting cast has several developments worth watching:',
      '- DeRozan scored 14 points against Los Angeles.',
      '',
      'Denver waived two players on October 17. Tip is 9:30 p.m. Eastern on ESPN.',
    ].join('\n'));
    expect(news).toContain('McCain went 7-for-9');
    expect(news).toContain('Denver waived two players on October 17');
    for (const gone of ['121–106', '7-for-8', 'impression', 'worth watching', 'DeRozan']) expect(news).not.toContain(gone);
  });

  it('drops last season: departures, awards and months before the league year', () => {
    const news = read([
      'With Lu Dort and Isaiah Joe having departed, perimeter shooting is a question.',
      '',
      'Keldon Johnson won the Sixth Man of the Year award.',
      '',
      'Dallas hired its coach in May.',
      '',
      'Holmgren left Tuesday\'s game briefly and returned; Embiid departed with a left knee injury.',
    ].join('\n'));
    expect(news).toBe("Holmgren left Tuesday's game briefly and returned; Embiid departed with a left knee injury.");
  });
  it('checks "fouled out" against the box, game by game (Oct 29 2026 hunt)', () => {
    const fouls = (pf) => Object.assign(side([{ ...row('Jared McCain', 30, 10, 4, 9, 2, 5), pf }], 'Thunder', 'Oklahoma City Thunder'),
      { opponent: side([row('Victor Wembanyama', 34, 12, 1, 13, 0, 4)], 'Spurs', 'San Antonio Spurs') });
    const f = (pf) => newsFacts([{ ...seasons[0], boxes: [fouls(pf)] }, seasons[1]], names, [spurs, thunder]);
    const said = (pf) => newsForGary(deskWith('McCain fouled out against San Antonio.\n\nTip is 8 p.m.'), { facts: f(pf), start: '2026-10-20', asOf: new Date('2026-10-23T00:07:00Z'), season: 2026 });
    expect(said(5)).not.toContain('fouled out');
    expect(said(6)).toContain('McCain fouled out against San Antonio');
  });
});
