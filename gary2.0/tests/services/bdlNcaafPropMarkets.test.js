import { describe,it,expect,vi } from 'vitest';
import {ncaafPropOddsService,transformBdlNcaafMarkets} from '../../src/services/bdlNcaafPropMarkets.js';
import {withPickDataIntegrity} from '../../src/services/pickDataIntegrity.js';
const home={id:1,full_name:'Pittsburgh Panthers'},away={id:2,full_name:'Syracuse Orange'};
const players=new Map([['7',{name:'Exact Player',team:home.full_name}]]);
const market=(extra={})=>({id:8,game_id:9,player_id:7,prop_type:'passing_yards',line_value:'250.5',vendor:'fanduel',market:{type:'over_under',over_odds:-110,under_odds:-115},updated_at:'2026-09-16T17:00:00Z',...extra});
const target={homeTeam:home.full_name,awayTeam:away.full_name,commenceTime:'2026-09-17T23:30:00Z',bdlGameId:9};
const service=()=>({getGame:vi.fn().mockResolvedValue({id:9,home_team:home,visitor_team:away,date:target.commenceTime}),getTeams:vi.fn().mockResolvedValue([home,away]),getActivePlayersComplete:vi.fn(async(_,id)=>[{id:id===1?7:8,first_name:id===1?'Exact':'Away',last_name:'Player'}])});
describe('BDL NCAAF current primary connection',()=>{
 it('reads the exact current game and joins provider player IDs to both rosters',async()=>{
  const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:[market()]})});
  const rows=await ncaafPropOddsService.getPlayerPropMarkets({...target,service:service(),fetchImpl});
  expect(fetchImpl.mock.calls[0][0]).toBe('https://api.balldontlie.io/ncaaf/v1/odds/player_props?game_id=9');
  expect(rows[0]).toMatchObject({player:'Exact Player',player_id:7,team:home.full_name,line:250.5,over_odds:-110,under_odds:-115,over_vendor:'fanduel',source_markets:[market()]});
 });
 it('preserves observed zero lines and the difference between an integer milestone and an over/under ticket',()=>{
  const rows=transformBdlNcaafMarkets([market({line_value:'0'}),market({line_value:'250',market:{type:'milestone',odds:150}})],{gameId:9,players});
  expect(rows.map(p=>p.line)).toEqual([0,249.5]);expect(rows[1].under_odds).toBeNull();
 });
 it.each([market({game_id:10}),market({player_id:88}),market({line_value:null}),market({market:{type:'unknown'}})])('rejects broken identity/price payloads',row=>{
  expect(()=>transformBdlNcaafMarkets([row],{gameId:9,players})).toThrow();
 });
 it('does not substitute another provider on denial or report denial as no markets',async()=>{
  const fetchImpl=vi.fn().mockResolvedValue({ok:false,status:401});
  await expect(withPickDataIntegrity(()=>ncaafPropOddsService.getPlayerPropMarkets({...target,service:service(),fetchImpl}))).rejects.toMatchObject({code:'required_data_unavailable',retryModel:false});
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it('distinguishes a verified empty board from a malformed successful response',async()=>{
  for(const [body,pattern] of [[{data:[]},'verified empty'],[{error:'unavailable'},'invalid response shape']]){
   await expect(ncaafPropOddsService.getPlayerPropMarkets({...target,service:service(),fetchImpl:async()=>({ok:true,json:async()=>body})})).rejects.toThrow(pattern);
  }
 });
 it('rejects a wrong kickoff before requesting markets',async()=>{
  const fetchImpl=vi.fn();const b=service();b.getGame.mockResolvedValue({home_team:home,visitor_team:away,date:'2026-09-18T23:30:00Z'});
  await expect(ncaafPropOddsService.getPlayerPropMarkets({...target,service:b,fetchImpl})).rejects.toThrow('identity or kickoff mismatch');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
});

describe('MLB/NFL provider ticket lines',()=>{
 it('keeps zero and decimal lines and maps reach-N milestones without changing settlement',async()=>{
  const {propMarketLine}=await import('../../src/services/propMarketLine.js');
  expect(propMarketLine({line_value:'0',market:{type:'over_under'}})).toBe(0);
  expect(propMarketLine({line_value:'300',market:{type:'milestone'}})).toBe(299.5);
  expect(propMarketLine({line_value:'0.5',market:{type:'milestone'}})).toBe(0.5);
  expect(()=>propMarketLine({line_value:null})).toThrow();
 });
});
