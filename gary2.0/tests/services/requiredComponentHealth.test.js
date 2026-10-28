import {it,expect} from 'vitest';
import {collegeComponentRows} from '../../src/services/gary/requiredComponentHealth.js';
it('records absent data as individual failures and checked empty availability as success',()=>{const rows=collegeComponentRows({sides:{home:{availability:'checked',injuries:[],quarterback:{name:'Named QB'},coaches:[]}},reason:'Away report unavailable'}, {date:'2026-09-19',game:{id:42,home_team:{id:1},away_team:{id:2}}});expect(rows).toHaveLength(6);expect(rows.filter(r=>r.status==='ok').map(r=>r.component)).toEqual(['quarterback','availability']);expect(rows.filter(r=>r.team_id==='2').every(r=>r.status==='fail')).toBe(true);});

it('does not write an undefined game into the incident ledger', () => {
  expect(collegeComponentRows({}, {date:'2026-09-19',game:{home_team:{id:1},away_team:{id:2}}})).toEqual([]);
});

it('lists a researched team with no current report or unverifiable extras as unresolved; no research stays a failure (Oct 28 2026)', () => {
  const side = (availability, invalid, sources) => ({ availability, injuries: [], quarterback: { name: 'QB' }, coaches: [{ role: 'head coach' }],
    diagnostics: { current_sources: sources, invalid_injuries: invalid, reported_qb: 'QB' } });
  const availability = (home, away) => collegeComponentRows({ sides: { home, away } }, { date: '2026-10-24', game: { id: 458065, home_team: { id: 103 }, away_team: { id: 134 } } })
    .filter(r => r.component === 'availability').map(r => r.status);
  expect(availability(side('partial', 2, 4), side('unavailable', 1, 4))).toEqual(['unresolved', 'unresolved']);
  expect(availability(side('unavailable', 0, 0), side('checked', 0, 4))).toEqual(['ok', 'fail']);
});
