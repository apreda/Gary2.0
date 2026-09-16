import {describe,it,expect} from 'vitest';
import {mlbGameSide,mlbMatchup,selectMlbScheduledGame,findMlbPlayerStats,partitionMlbPitchers} from '../../src/services/mlbIdentity.js';
const game=(id,home,away,time='2026-09-17T00:10:00Z')=>({gamePk:id,officialDate:'2026-09-16',gameDate:time,teams:{home:{team:{id:home,name:'Chicago White Sox'},score:1},away:{team:{id:away,name:'Boston Red Sox'},score:9}}});
describe('MLB source identity',()=>{
 it('does not confuse the Sox clubs or BDL IDs',()=>{
  expect(mlbGameSide(game(1,145,111),111)).toBe('away');
  expect(mlbMatchup(game(1,145,111),111,145)).toBe(false);
  expect(mlbMatchup(game(1,145,111),111,145,true)).toBe(true);
  expect(()=>mlbGameSide(game(1,145,111),6)).toThrow();
 });
 it('chooses an exact doubleheader start and refuses an ambiguous one',()=>{
  const first=game(1,145,111,'2026-09-16T17:10:00Z'),second=game(2,145,111);
  expect(selectMlbScheduledGame([first,second],{homeId:145,awayId:111,startTime:second.gameDate})).toBe(second);
  expect(()=>selectMlbScheduledGame([first,second],{homeId:145,awayId:111,startTime:'2026-09-16T20:00:00Z'})).toThrow();
 });
 it('never borrows the next day of a series',()=>{
  expect(()=>selectMlbScheduledGame([game(1,145,111)],{homeId:145,awayId:111,startTime:'2026-09-15T23:00:00Z'})).toThrow();
 });
 it('matches Savant on MLBAM ID despite shared surnames',()=>{
  const rows=[{player_id:1,last_name:'Smith',era:1},{player_id:2,last_name:'Smith',era:5}];
  expect(findMlbPlayerStats(rows,2).era).toBe(5);expect(findMlbPlayerStats(rows,3)).toBeNull();
 });
});

it('keeps a zero-out starter and does not promote a long reliever',()=>{
 const sp={player:{id:1},games_started:1,ip:0,er:4},rp={player:{id:2},games_started:0,ip:5,er:0};
 expect(partitionMlbPitchers([rp,sp])).toEqual({starter:sp,relievers:[rp]});
 expect(()=>partitionMlbPitchers([{ip:5}])).toThrow();
});

it('does not join a pitcher to another player who shares his surname',async()=>{
 const {findMlbNamedPlayerStats}=await import('../../src/services/mlbIdentity.js');
 const rows=[{player:{id:1,full_name:'Luis García'}},{player:{id:2,full_name:'Yimi García'}}];
 expect(findMlbNamedPlayerStats(rows,'Luis Garcia').player.id).toBe(1);
 expect(findMlbNamedPlayerStats(rows,'Garcia')).toBeNull();
 expect(()=>findMlbNamedPlayerStats([...rows,rows[0]],'Luis Garcia')).toThrow('Ambiguous');
});
