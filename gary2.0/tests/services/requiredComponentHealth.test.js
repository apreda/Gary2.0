import {it,expect} from 'vitest';
import {collegeComponentRows} from '../../src/services/requiredComponentHealth.js';
it('records absent data as individual failures and checked empty availability as success',()=>{const rows=collegeComponentRows({sides:{home:{availability:'checked',injuries:[],quarterback:{name:'Named QB'},coaches:[]}},reason:'Away report unavailable'}, {date:'2026-09-19',game:{id:42,home_team:{id:1},away_team:{id:2}}});expect(rows).toHaveLength(6);expect(rows.filter(r=>r.status==='ok').map(r=>r.component)).toEqual(['quarterback','availability']);expect(rows.filter(r=>r.team_id==='2').every(r=>r.status==='fail')).toBe(true);});

it('does not write an undefined game into the incident ledger', () => {
  expect(collegeComponentRows({}, {date:'2026-09-19',game:{home_team:{id:1},away_team:{id:2}}})).toEqual([]);
});
