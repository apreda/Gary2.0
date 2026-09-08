import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildVerifiedTaleOfTape,buildNflRecentFormRow,replaceNflTaleRecentForm } from '../../../src/services/agentic/scoutReport/shared/taleOfTape.js';

const home = {id:31,name:'Seattle Seahawks',full_name:'Seattle Seahawks'};
const away = {id:1,name:'New England Patriots',full_name:'New England Patriots'};
const profiles = [{teamId:31,currentRegularGamesPlayed:0},{teamId:1,currentRegularGamesPlayed:0}];
const game = (id,date,hs,as,extra={}) => ({id,date,season:2026,season_type:2,status:'Final',home_team:home,visitor_team:away,
  home_team_score:hs,visitor_team_score:as,...extra});
const tape = (games,sport='NFL') => buildVerifiedTaleOfTape(home.full_name,away.full_name,...profiles,sport,{},games,games);
beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-08T19:00:00Z'));});
afterEach(() => vi.useRealTimers());

describe('NFL card recent form uses the current regular-season evidence window', () => {
  it('does not mix preseason, prior regular season and postseason into opening-night L5 form', () => {
    const result = tape([
      game(1,'2026-08-28T00:00:00Z',17,17,{season_type:1}),
      game(2,'2026-02-08T23:30:00Z',29,13,{season:2025,season_type:3}),
      game(3,'2026-01-04T21:00:00Z',21,10,{season:2025}),
    ]);
    const row = result.rows.find(row=>row.token==='L5_FORM');
    expect(row.name).toBe('L5 Form · 2026 regular');
    expect(row.home.value).toBe('N/A'); expect(row.away.value).toBe('N/A');
    expect(row.statProvenance.home).toMatchObject({season:2026,phase:'regular',games_used:0});
    expect(result.text).toContain('L5 Form · 2026 regular');
    expect(result.text).not.toContain('2-1');
  });

  it('counts scored and scoreless ties, sorts by date and uses exactly the latest five valid finals', () => {
    vi.setSystemTime(new Date('2026-10-20T19:00:00Z'));
    const result = tape([
      game(1,'2026-09-01T17:00:00Z',10,20), // old sixth game excluded
      game(2,'2026-09-08T17:00:00Z',20,10),
      game(3,'2026-09-15T17:00:00Z',17,17),
      game(4,'2026-09-22T17:00:00Z',0,0),
      game(5,'2026-09-29T17:00:00Z',10,20),
      game(6,'2026-10-06T17:00:00Z',20,10),
      game(7,'2026-10-13T17:00:00Z',null,null),
      game(8,'2026-10-27T17:00:00Z',50,0),
      game(9,'2026-10-19T17:00:00Z',7,0,{status:'In Progress'}),
    ]);
    const row = result.rows.find(row=>row.token==='L5_FORM');
    expect(row.home.value).toBe('2-1-2'); expect(row.away.value).toBe('1-2-2');
    expect(row.statProvenance.home.game_ids).toEqual([6,5,4,3,2]);
    expect(row.statProvenance.home.games_used).toBe(5);
  });

  it('requires the exact team instead of matching another team with a shared nickname', () => {
    const row = tape([game(1,'2026-09-07T17:00:00Z',20,10,{home_team:{id:99,name:'Other Seahawks'},visitor_team:{id:90,name:'Other Patriots'}})])
      .rows.find(row=>row.token==='L5_FORM');
    expect(row.home.value).toBe('N/A'); expect(row.away.value).toBe('N/A');
  });

  it('keeps the other leagues’ existing row labels and form behavior', () => {
    const result = tape([game(1,'2026-09-07T17:00:00Z',20,10)],'NBA');
    const row = result.rows.find(row=>row.token==='L5_FORM');
    expect(row.name).toBe('L5 Form'); expect(row.home.value).toBe('1-0'); expect(row.away.value).toBe('0-1');
  });

  it('repairs only the saved display row and line using the original publication cutoff', () => {
    vi.setSystemTime(new Date('2026-10-20T19:00:00Z'));
    const original = {rows:[
      {name:'L5 Form',token:'L5_FORM',home:{team:home.full_name,value:'2-3'},away:{team:away.full_name,value:'2-3'}},
      {name:'Points/Gm · 2025 baseline',token:'POINTS_GM',home:{team:home.full_name,value:'28.4'},away:{team:away.full_name,value:'28.8'}},
    ],text:'Original source heading\nL5 Form                2-3  |  2-3\nPoints/Gm · 2025 baseline        28.4  |  28.8',provenance:{era:'original'}};
    const newRow = buildNflRecentFormRow({homeTeam:home.full_name,awayTeam:away.full_name,homeTeamId:home.id,awayTeamId:away.id,
      season:2026,before:'2026-09-08T19:50:30.921Z',recentHome:[game(1,'2026-09-10T00:20:00Z',20,10)],recentAway:[]});
    const fixed = replaceNflTaleRecentForm(original,newRow);
    expect(fixed.rows[0].home.value).toBe('N/A');
    expect(fixed.rows[0].statProvenance.home.as_of).toBe('2026-09-08T19:50:30.921Z');
    expect(fixed.rows[1]).toBe(original.rows[1]); expect(fixed.provenance).toBe(original.provenance);
    expect(fixed.text.split('\n')[0]).toBe(original.text.split('\n')[0]);
    expect(fixed.text.split('\n')[2]).toBe(original.text.split('\n')[2]);
    expect(original.rows[0].home.value).toBe('2-3');
    expect(() => replaceNflTaleRecentForm({...original,rows:[...original.rows,original.rows[0]]},newRow)).toThrow('exactly one');
  });
});
