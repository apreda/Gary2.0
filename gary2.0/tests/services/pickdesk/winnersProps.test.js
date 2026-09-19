import {describe,it,expect,vi} from 'vitest';
import {winnersCandidate} from '../../../src/services/pickdesk/winnersAdmissions.js';
import {propPacket,propSelectionAsk,parsePropSelection,readPropSelection,chooseProps,assessProps,runPropsSelection} from '../../../src/services/pickdesk/winnersProps.js';
import { winnersDatabaseCall } from '../../../src/services/pickdesk/winnersDatabaseCall.js';
import {loadConfirmedPropHistory,mlbPropsAsk} from '../../../src/services/pickdesk/propsBrain.js';
import {hitterDistribution,probOver} from '../../../src/services/pickdesk/propModel.js';
const now=Date.parse('2026-09-17T15:00:00Z');
const candidate=(id,extra={})=>({...winnersCandidate({date:'2026-09-17',league:'MLB',kind:'prop',pick:{game_id:String(id),player:`Player ${id}`,prop:'hits 0.5',line:.5,bet:'over',odds:110,commence_time:'2026-09-17T16:00:00Z',rationale:'Gary relies on the verified matchup evidence.'},evidence:{observedAt:'2026-09-17T14:00:00Z',deskText:'The verified matchup evidence comes from the full original player history.'}}),id,cohort:3,...extra});
const row=(id,rank=1,assessment='lean')=>({candidate_id:id,rank,assessment,reason:'A supported preference with normal uncertainty.',opposing_case:'The opposing pitcher can still prevent a hit.',price_reason:'The offered +110 price is considered against that uncertainty.',source_quote:'verified matchup evidence',rationale_quote:'verified matchup evidence'});
const reading=(cs,grade='lean')=>({summary:'Compare the original supported prop arguments.',ranked_candidates:cs.map((c,i)=>row(c.id,i+1,grade))});
describe('daily prop Winners',()=>{
 it('ends a stalled database claim without issuing a duplicate claim',async()=>{
  vi.useFakeTimers();
  try {
   const rpc=vi.fn(()=>new Promise(()=>{}));
   const done=expect(winnersDatabaseCall({rpc},'claim_winners_props',{},1000)).rejects.toThrow('database response timed out');
   await vi.advanceTimersByTimeAsync(1000); await done;
   expect(rpc).toHaveBeenCalledTimes(1);
  } finally {vi.useRealTimers();}
 });
 it('uses the remaining database lease and leaves time to save the same decision',async()=>{
  const c=candidate(1), run={lease_until:new Date(now+120_000).toISOString(),input_snapshot:{candidates:[c]}};
  const call=vi.fn(async()=>({success:true,data:reading([c])}));
  expect((await assessProps(run,{oneShot:call,clock:()=>now})).ok).toBe(true);
  expect(call.mock.calls[0][1].timeoutMs).toBe(60_000);
  call.mockClear();
  expect((await assessProps({...run,lease_until:new Date(now+60_000).toISOString()},{oneShot:call,clock:()=>now})).ok).toBe(false);
  expect(call).not.toHaveBeenCalled();
 });
 it('keeps full source and invalidates wrong identity, missing or future evidence',()=>{
  const c=candidate(1);expect(propPacket(c,now).source_record).toBe(c.evidence_snapshot.deskText);
  expect(propPacket({...c,odds:140},now).source_record).toBe('');
  expect(propPacket({...c,evidence_snapshot:{...c.evidence_snapshot,observedAt:'2026-09-17T15:30:00Z'}},now).source_record).toBe('');
 });
 it('writes one complete copy of a record several props share and keeps a different record its own',()=>{
  const shared='The verified matchup evidence comes from the full original player history.';
  const own='A separate complete record: the verified matchup evidence for this prop alone.';
  const cs=[candidate(1),candidate(2,{evidence_snapshot:{observedAt:'2026-09-17T14:00:00Z',deskText:own}}),candidate(3)];
  const ask=propSelectionAsk(cs,now);
  expect(ask.split(shared).length-1).toBe(1);
  expect(ask.split(own).length-1).toBe(1);
  expect(ask.match(/"source_record_id":\d+/g)).toEqual(['"source_record_id":1','"source_record_id":2','"source_record_id":1']);
  expect(ask).toContain('"record_id":1');
  expect(ask).toContain('"record_id":2');
 });
 it('keeps props that share one record in the same batch so the record is never sent twice',async()=>{
  const shared='The verified matchup evidence comes from the full original player history.';
  const own='A separate complete record: the verified matchup evidence for this prop alone.';
  const cs=[candidate(1),candidate(2,{evidence_snapshot:{observedAt:'2026-09-17T14:00:00Z',deskText:own}}),candidate(3)];
  const run={input_snapshot:{candidates:cs,prior:[]}};
  const maxBytes=Buffer.byteLength(propSelectionAsk([cs[0],cs[2]],now));
  const prompts=[];
  const call=vi.fn(async prompt=>{
   prompts.push(prompt);
   if(prompt.startsWith('Each full original source'))return {success:true,data:JSON.stringify({summary:'global comparison',ordered_ids:[1,3,2]})};
   return {success:true,data:reading(cs.filter(c=>prompt.includes(`"candidate_id":${c.id},"league"`)))};
  });
  const result=await assessProps(run,{oneShot:call,clock:()=>now,maxBytes});
  expect(result.ok).toBe(true);
  expect(prompts[0]).toContain('"candidate_id":1,"league"');
  expect(prompts[0]).toContain('"candidate_id":3,"league"');
  expect(prompts[0].split(shared).length-1).toBe(1);
  expect(prompts[1]).toContain('"candidate_id":2,"league"');
  expect(prompts[1]).not.toContain('"candidate_id":1,"league"');
 });
 it('requires complete ranks, real quotes and price reasoning for supported picks',()=>{
  const cs=[candidate(1),candidate(2)],good=reading(cs);
  expect(parsePropSelection(good,cs,now)).toEqual(good);
  expect(parsePropSelection({...good,ranked_candidates:[row(1),row(1,2)]},cs,now)).toBeNull();
  expect(parsePropSelection({...good,ranked_candidates:[{...row(1),source_quote:'This fact never appeared'},row(2,2)]},cs,now)).toBeNull();
 });
 // Sep 18 2026: the Claude rungs answer correctly but narrate before the fence,
 // so a strip anchored at position 0 discarded four graded props as "not a JSON
 // object" and the board published nothing. The reading must not depend on which
 // rung answered.
 it('reads a graded comparison the same however the answering rung wraps it',()=>{
  const cs=[candidate(1),candidate(2)],good=reading(cs),body=JSON.stringify(good);
  for (const wrapped of [
    body,
    '```json\n'+body+'\n```',
    'I cross-checked both props against their exact source records.\n\n```json\n'+body+'\n```',
    'I checked {every} claim and here it is:\n```json\n'+body+'\n```',
    'Here is the ranked assessment:\n'+body,
  ]) expect(readPropSelection(wrapped,cs,now).value).toEqual(good);
  expect(readPropSelection('no object here at all',cs,now).reason).toBe('not a JSON object');
 });
 it('names the contract rule and the row a rejected reading broke',async()=>{
  const cs=[candidate(1),candidate(2)],good=reading(cs);
  expect(readPropSelection(good,cs,now)).toEqual({value:good,reason:null});
  expect(readPropSelection('not json',cs,now).reason).toBe('not a JSON object');
  expect(readPropSelection({...good,ranked_candidates:[row(1)]},cs,now).reason).toBe('ranked_candidates has 1 rows for 2 candidates');
  expect(readPropSelection({...good,ranked_candidates:[row(1),row(1,2)]},cs,now).reason).toBe('row 2: candidate 1 ranked twice');
  expect(readPropSelection({...good,ranked_candidates:[row(1,1,'toss_up'),row(2,2,'clear')]},cs,now).reason).toBe('row 2: clear ranked after toss_up');
  expect(readPropSelection({...good,ranked_candidates:[{...row(1),source_quote:'This fact never appeared'},row(2,2)]},cs,now).reason).toBe('row 1: source_quote is not an exact passage of the original source_record');
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  const run={input_snapshot:{candidates:cs,prior:[]}},bad=JSON.stringify({...good,ranked_candidates:[row(1),{...row(2,2),price_reason:'short'}]});
  const result=await assessProps(run,{oneShot:async()=>({success:true,data:bad}),clock:()=>now});
  expect(result.error).toBe('Incomplete or unsupported prop comparison: row 2: price_reason shorter than 10 characters');
  expect(log.mock.calls.some(([line])=>line.includes('rejected reading of candidates 1, 2: row 2: price_reason shorter than 10 characters') && line.includes(bad))).toBe(true);
  log.mockRestore();
 });
 it('permits zero and enforces six across sports, two per game and one per player',()=>{
  const cs=Array.from({length:10},(_,i)=>candidate(i+1,{league:i%2?'NFL':'MLB'}));
  const run={input_snapshot:{candidates:cs,prior:[]}};
  expect(chooseProps(reading(cs,'toss_up'),run).ranked_candidates.filter(r=>r.selected)).toHaveLength(0);
  expect(chooseProps(reading(cs),run).ranked_candidates.filter(r=>r.selected)).toHaveLength(6);
  const sameGame=cs.map(c=>({...c,league:'MLB',game_id:'1'}));
  expect(chooseProps(reading(sameGame),{input_snapshot:{candidates:sameGame}}).ranked_candidates.filter(r=>r.selected)).toHaveLength(2);
  const samePlayer=cs.map(c=>({...c,league:'MLB',pick_snapshot:{...c.pick_snapshot,player:'José Test'}}));
  expect(chooseProps(reading(samePlayer),{input_snapshot:{candidates:samePlayer}}).ranked_candidates.filter(r=>r.selected)).toHaveLength(1);
 });
 it('reserves later slate places and carries unused earlier places forward',()=>{
  const cs=Array.from({length:8},(_,i)=>candidate(i+1,{cohort:i<4?1:3}));
  const picked=chooseProps(reading(cs),{input_snapshot:{candidates:cs}}).ranked_candidates.filter(r=>r.selected);
  expect(picked.map(r=>r.candidate_id)).toEqual([1,2,5,6,7,8]);
 });
 it('never truncates a record, uses external data or publishes on model failure',async()=>{
  const c=candidate(1),run={input_snapshot:{candidates:[c]}};
  const call=vi.fn(async()=>({success:true,data:reading([c])}));
  expect((await assessProps(run,{oneShot:call,clock:()=>now,maxBytes:10})).ok).toBe(false);expect(call).not.toHaveBeenCalled();
  expect((await assessProps(run,{oneShot:async()=>({success:false,error:'provider failed'}),clock:()=>now})).error).toBe('provider failed');
  const result=await assessProps(run,{oneShot:call,clock:()=>now});expect(result.ok).toBe(true);expect(result.selection.ranked_candidates[0].selected).toBe(true);
 });
 it('reads whole batches two at a time so a slower fallback reader still finishes before first pitch',async()=>{
  const cs=[candidate(1),candidate(2),candidate(3)],run={input_snapshot:{candidates:cs,prior:[]}};
  const maxBytes=Buffer.byteLength(propSelectionAsk([cs[0],cs[1]],now))-1;
  const pending=[],call=vi.fn(prompt=>new Promise(resolve=>pending.push({prompt,resolve})));
  const tick=()=>new Promise(r=>setImmediate(r));
  const result=assessProps(run,{oneShot:call,clock:()=>now,maxBytes});
  await tick();expect(call).toHaveBeenCalledTimes(2);
  pending.splice(0,2).forEach((p,i)=>p.resolve({success:true,data:reading([cs[i]]),model:'claude-sonnet-5'}));
  await tick();expect(call).toHaveBeenCalledTimes(3);
  pending.shift().resolve({success:true,data:reading([cs[2]]),model:'claude-sonnet-5'});
  await tick();expect(call).toHaveBeenCalledTimes(4);
  expect(pending[0].prompt).toContain('"candidate_id":3');
  pending.shift().resolve({success:true,data:JSON.stringify({summary:'global comparison',ordered_ids:[3,1,2]}),model:'claude-sonnet-5'});
  const done=await result;expect(done.ok).toBe(true);expect(done.model).toBe('claude-sonnet-5');
  expect(done.selection.ranked_candidates.map(r=>r.candidate_id)).toEqual([3,1,2]);
 });
 it('waits for a sibling read to settle before failing so no reader is left running',async()=>{
  const own='A separate complete record: the verified matchup evidence for this prop alone.';
  const cs=[candidate(1),candidate(2,{evidence_snapshot:{observedAt:'2026-09-17T14:00:00Z',deskText:own}})];
  const run={input_snapshot:{candidates:cs,prior:[]}};
  const maxBytes=Math.max(...cs.map(c=>Buffer.byteLength(propSelectionAsk([c],now))));
  let settleSibling;
  const call=vi.fn(prompt=>prompt.includes('"candidate_id":2,"league')
   ? new Promise(resolve=>{settleSibling=()=>resolve({success:true,data:reading([cs[1]])});})
   : Promise.resolve({success:false,error:'provider failed'}));
  const tick=()=>new Promise(r=>setImmediate(r));
  const pending=assessProps(run,{oneShot:call,clock:()=>now,maxBytes});
  let settled=false;pending.then(()=>{settled=true;});
  await tick();await tick();await tick();
  expect(call).toHaveBeenCalledTimes(2);
  expect(settled).toBe(false);
  settleSibling();
  const result=await pending;
  expect(result.ok).toBe(false);
  expect(result.error).toBe('provider failed');
 });
 it('retries only the idempotent commit after an uncertain write',async()=>{
  const c=candidate(1),rpc=vi.fn().mockResolvedValueOnce({data:[{id:4,attempts:1,input_snapshot:{candidates:[c]}}]})
   .mockResolvedValueOnce({error:new Error('network')}).mockResolvedValueOnce({data:{completed:true,admitted:1}});
  const call=vi.fn(async()=>({success:true,data:reading([c])}));
  await runPropsSelection({rpc},'2026-09-17',{oneShot:call,clock:()=>now});
  expect(call).toHaveBeenCalledTimes(1);expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[2]);
 });
});
describe('HR inputs and starter exposure',()=>{
 it('does not demand nonexistent core bets on an HR-only or thin menu',()=>{
  expect(mlbPropsAsk({hrOnly:true})).not.toContain('Take two prop bets');
  expect(mlbPropsAsk({coreCount:0})).not.toContain('Take two prop bets');
  expect(mlbPropsAsk({coreCount:1})).toContain('at most one core prop');
  expect(mlbPropsAsk({coreCount:2})).toContain('Take two prop bets');
 });
 const side=(base)=>({pitcher:{name:`Pitcher ${base}`,playerId:base},batters:Array.from({length:9},(_,i)=>({name:`Batter ${base+i+1}`,playerId:base+i+1}))});
 it('loads all 20 participants even when only one hitter has a priced prop',async()=>{
  const fetch=vi.fn(async()=>[{hr:1}]);
  const map=await loadConfirmedPropHistory({home:side(1),away:side(11)},[{player:'Batter 2',player_id:2}],{commence_time:'2026-09-17T20:00:00Z'},{getMlbPlayerGameRowsChrono:fetch});
  expect(map.size).toBe(20);expect(map.has('pitcher 11')).toBe(true);expect(fetch).toHaveBeenCalledWith('11',2026,{throwOnError:true});
 });
 it('fails on empty history, a provider error or conflicting BDL identity',async()=>{
  const lineups={home:side(1),away:side(11)},game={commence_time:'2026-09-17T20:00:00Z'};
  await expect(loadConfirmedPropHistory(lineups,[],game,{getMlbPlayerGameRowsChrono:async()=>[]})).rejects.toThrow('empty');
  await expect(loadConfirmedPropHistory(lineups,[],game,{getMlbPlayerGameRowsChrono:async()=>{throw new Error('401');}})).rejects.toThrow('401');
  await expect(loadConfirmedPropHistory(lineups,[{player:'Batter 2',player_id:999}],game,{})).rejects.toThrow('Ambiguous');
 });
 it('does not use MLB person IDs as BDL IDs',async()=>{
  const home=side(1);home.pitcher={name:'Pitcher 1',personId:123456};
  const fetch=vi.fn(async()=>[{hr:0}]);
  await loadConfirmedPropHistory({home,away:side(11)},[],{commence_time:'2026-09-17T20:00:00Z',home_team:{id:8}},{getMlbActivePlayerNameIndex:async()=>new Map([['pitcher 1',{id:1,teamId:8}]]),getMlbPlayerGameRowsChrono:fetch});
  expect(fetch.mock.calls.some(c=>c[0]==='123456')).toBe(false);
 });
 it('limits starter HR adjustment to his share of plate appearances',()=>{
  const profile={rates:{hr:.04},paDist:new Map([[4,1]]),rows:[],games:0};
  const base=probOver(hitterDistribution(profile,'home_runs'),.5);
  const half=probOver(hitterDistribution(profile,'home_runs',{hr:.048,expectedBf:18}),.5);
  const all=probOver(hitterDistribution(profile,'home_runs',{hr:.048,expectedBf:36}),.5);
  expect(half).toBeGreaterThan(base);expect(half).toBeLessThan(all);
 });
});
