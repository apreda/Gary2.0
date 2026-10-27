import { describe, it, expect } from 'vitest';
import { startersFromBoxPage, teamStarters, startedIn, startersAmong } from '../../src/services/sports/ncaaf/ncaafStarters.js';

const POS = ['OL', 'OL', 'OL', 'OL', 'OL', 'QB', 'RB', 'TE', 'WR', 'WR', 'WR'];
const DEF = ['CB', 'CB', 'DE', 'DE', 'DL', 'DL', 'LB', 'LB', 'LB', 'S', 'S'];
const roster = (team, positions, from) => positions.map((p, i) => [String(from + i), `Player${from + i},${team}`, p]);
const row = ([n, name, p]) => `<tr class="s-table-body__row s-table-body__row--index-0"><td>${n}</td><td><div class="clickable"> ${name}</div></td><td>${p}</td></tr>`;
const table = (label, unit, rows) => `<picture><img alt="${label}"></picture><div>${unit}</div><table><tbody>${rows.map(row).join('')}</tbody></table>`;

// The current page: four tables (each team's offense, then each team's defense), each under the team's logo.
const page = (date, [a, b]) => `<title>Football vs ${b} on ${date} - Box Score</title><h2 class="x"> Starters</h2>`
  + table(a, 'Offense', [['3', 'Hawkins Jr., Michael', 'QB'], ...roster(a, POS.slice(0, 10), 50).slice(0, 10)])
  + table(b, 'Offense', roster(b, POS, 10)) + table(a, 'Defense', roster(a, DEF, 70)) + table(b, 'Defense', roster(b, DEF, 30)) + 'Player Participation';

// The older page: one table per team, captioned with its abbreviation.
const older = (date, [a, b]) => `<title>Football vs X on ${date} - Box Score</title><section id="starters" aria-label="Participation">`
  + [a, b].map((label, t) => `<table sortable-table=""><caption>${label}</caption><tbody>${roster(label, [...POS, ...DEF], t * 30).map(([n, name, p]) => `<tr><td>${n}</td><td>${name}</td><td>${p}</td></tr>`).join('')}</tbody></table>`).join('') + '</section>';

describe('official box starters', () => {
  it('reads both teams from the current page, names as written on the roster', () => {
    const box = startersFromBoxPage(page('10/17/2026', ['Cincinnati', 'West Virginia']));
    expect(box.date).toBe('2026-10-17');
    expect(box.teams.map((t) => [t.label, t.starters.length])).toEqual([['Cincinnati', 22], ['West Virginia', 22]]);
    expect(box.teams[0].starters[0]).toMatchObject({ name: 'Michael Hawkins Jr.', jersey: '3', position: 'QB', unit: 'offense' });
  });

  it('reads the older page and takes the unit from the position', () => {
    const box = startersFromBoxPage(older('09/05/2026', ['GSU', 'KSU']));
    expect(box.date).toBe('2026-09-05');
    expect(box.teams.map((t) => t.label)).toEqual(['GSU', 'KSU']);
    expect(box.teams[1].starters.filter((s) => s.unit === 'offense')).toHaveLength(11);
  });

  it('is nothing when a page has no lineup for one team', () => {
    expect(startersFromBoxPage('<title>Football vs X on 9/5/2026</title><p>no lineup</p>')).toBeNull();
  });

  it('finds a game on the opponent site and keeps the right team, by abbreviation or initials', async () => {
    const html = older('09/12/2026', ['GSU', 'KSU']);
    const fetchImpl = async (url) => ({ ok: true, text: async () => (url.includes('/boxscore') ? html : '<a href="/sports/football/stats/2026/georgia-state/boxscore/14829">') });
    const got = await teamStarters({ college: 'Georgia State', abbr: 'GAST' }, [{ gameId: 7, date: '2026-09-12T23:00:00Z', opponent: { college: 'Kennesaw State', abbr: 'KENN' } }], 2026, { fetchImpl });
    expect(got.get('7')[0].name).toBe('GSU Player0');
  });

  it('matches a starter by name, or by last name and first initial', () => {
    const starters = [{ name: 'Michael Hawkins Jr.', key: 'michaelhawkins' }, { name: 'Matt Sieg', key: 'mattsieg' }];
    expect(startedIn(starters, 'Michael Hawkins')).toBe(true);
    expect(startedIn(starters, 'Matthew Sieg')).toBe(true);
    expect(startedIn(starters, 'Nate Gabriel')).toBe(false);
  });

  it('pairs a nickname by last name on the same side of the ball, when no other starter shares it', () => {
    const starters = [{ name: 'Ezekiel Durham-Campbell', key: 'ezekieldurhamcampbell', unit: 'defense' }, { name: 'Nick Krahe', key: 'nickkrahe', unit: 'offense' },
      { name: 'Kevin Brown', key: 'kevinbrown', unit: 'offense' }];
    const got = startersAmong(starters, [{ name: 'Zeke Durham-Campbell', unit: 'defense' }, { name: 'Taylor Brown', unit: 'defense' }, { name: 'Cam Cook', unit: 'offense' }]);
    expect([...got.started]).toEqual(['Zeke Durham-Campbell']);
    expect(got.unmatched.map((x) => x.name)).toEqual(['Nick Krahe', 'Kevin Brown']);
  });
});
