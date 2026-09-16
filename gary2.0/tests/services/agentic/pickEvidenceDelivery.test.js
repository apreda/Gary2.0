import { describe, it, expect, vi } from 'vitest';
import { summarizeStatForContext as current, pruneContextIfNeeded as pruneCurrent } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';
import { summarizeStatForContext as june, summarizeMlbPlayerGameLogs, pruneContextIfNeeded as pruneJune } from '../../../src/services/agentic/mlbJuneEra/orchestratorHelpers.js';
import { renderFindingsSoFar } from '../../../src/services/agentic/orchestrator/researchBriefing.js';
import { withPickDataIntegrity, recordPickDataFailure, assertPickDataIntegrity } from '../../../src/services/pickDataIntegrity.js';
import { getCachedOrFetch } from '../../../src/services/ballDontLieService.js';

describe('complete source evidence at the model boundary', () => {
  const result = { home: { team: { id: 11, name: 'Home club' }, players: Array.from({length:30},(_,i)=>({player:{id:i+1,name:`Player ${i+1}`},era:3.9271,ops:0.880,zero:0,unavailable:null})) }, away: { team:{id:22,name:'Away club'}, era:0 }, source:'provider', season:2026, coverage:{start:'2026-08-01',end:'2026-09-15',complete:false}, note:'Not the same as career stats.' };
  for (const sport of ['MLB','NBA','NFL','NCAAF']) {
    it(`${sport} retains names, nested IDs, zeroes, precision, sample and source`, () => {
      const text = current(result,'PLAYER_GAME_LOGS','Home','Away',sport);
      for (const field of ['Player 30','Home club','Away club','3.9271','0.88','2026-08-01','2026-09-15',result.note,'provider']) expect(text).toContain(field);
      expect(text).not.toContain('[object Object]');
    });
  }
  it('June receives the complete MLB payload, including partial-data diagnostics',()=>{
    const text=june({...result,error:'one side failed'},'MLB_PITCHER_SCOUTING','Home','Away');
    expect(JSON.parse(text.slice(text.indexOf('\n')+1))).toEqual({...result,error:'one side failed'});
  });
  it('keeps all requested game rows, including non-start pitching appearances',()=>{
    const rows=Array.from({length:24},(_,i)=>({player:{id:9,name:'Exact Player'},game_id:i+1,games_started:0,ip:'0.0',er:i}));
    const text=summarizeMlbPlayerGameLogs('Exact Player',rows);
    expect(JSON.parse(text.slice(text.indexOf('\n')+1)).games).toEqual(rows);
  });
  it.each([pruneCurrent,pruneJune])('does not evict an old source packet or research answer',prune=>{
    const messages=Array.from({length:35},(_,i)=>({role:i%2?'user':'assistant',content:`source ${i} identity, stats and qualifier`}));
    expect(prune(messages,8)).toEqual(messages);
  });
  it('keeps the end of long research fields and URLs when passing to the next factor',()=>{
    const long='Evidence '.repeat(100);
    for(const aware of [false,true]){
      const text=renderFindingsSoFar([{factor:'Pitching',findings:long+'NAME AT END',numbers:long+'0.03847',context:long+'2025 prior team',sources:['https://source.example/'+long+'source-end']}],aware);
      for(const value of ['NAME AT END','0.03847','2025 prior team'])expect(text).toContain(value);
      if(aware)expect(text).toContain('source-end');
    }
  });
});

describe('source failures cannot become a successful pick',()=>{
  it('catches a terminal BDL error even if an old adapter returns an empty array',async()=>{
    await expect(withPickDataIntegrity(async()=>{
      await getCachedOrFetch('audit-failed-read',async()=>{throw Object.assign(new Error('invalid response'),{status:503});},0).catch(()=>[]);
      assertPickDataIntegrity();
      return {pick:'must not publish'};
    })).rejects.toMatchObject({code:'required_data_unavailable',retryModel:false,failures:[{source:'BDL:audit-failed-read',code:'503'}]});
  });
  it('isolates concurrent games and permits a verified empty sample/observed zero',async()=>{
    const [bad,good]=await Promise.allSettled([
      withPickDataIntegrity(async()=>{recordPickDataFailure('game A source',{status:401});await Promise.resolve();return 'bad';}),
      withPickDataIntegrity(async()=>{await Promise.resolve();assertPickDataIntegrity();return {games:[],value:0};})
    ]);
    expect(bad.status).toBe('rejected');expect(good.value).toEqual({games:[],value:0});
  });
  it('keeps a nested read failure through an outer catch',async()=>{
    await expect(withPickDataIntegrity(async()=>{
      await withPickDataIntegrity(async()=>{recordPickDataFailure('nested',{code:'bad_shape'});throw Error('swallowed');}).catch(()=>null);
    })).rejects.toMatchObject({code:'required_data_unavailable'});
  });
});

describe('research tool process context',()=>{
 it('delivers the complete game identity and long data fields without deleting shared objects',async()=>{
  const {serializableOptions}=await import('../../../src/services/agentic/tools/mcp/mcpContext.js');
  const club={id:137,name:'San Francisco Giants'};
  const input={game:{gamePk:123,id:456,home_team_data:club,commence_time:'2026-09-17T01:45:00Z'},home:club,sourceText:'x'.repeat(21000)+' Final source qualifier',signal:new AbortController().signal};
  const output=serializableOptions(input);
  expect(output.game).toEqual(input.game);expect(output.home).toEqual(club);expect(output.sourceText).toEqual(input.sourceText);expect(output.signal).toBeUndefined();
 });
});

describe('failed tool receipts and shared source requests',()=>{
 it('stops the parent decision when a child tool reported a source failure',async()=>{
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {readMcpLog}=await import('../../../src/services/agentic/tools/mcp/mcpContext.js');
  const dir=mkdtempSync(join(tmpdir(),'gary-receipt-test-'));const file=join(dir,'tools.log');
  try{
   writeFileSync(file,JSON.stringify({code:'required_data_unavailable',failures:[{source:'roster',code:'401'}]})+'\n');
   await expect(withPickDataIntegrity(async()=>{readMcpLog(file);return {pick:'blocked'};})).rejects.toMatchObject({code:'required_data_unavailable',failures:[{source:'MCP:roster',code:'401'}]});
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('marks every waiting pick when their shared transport fails',async()=>{
  let reject;const source=new Promise((_,no)=>{reject=no;});
  const run=()=>withPickDataIntegrity(async()=>{await getCachedOrFetch('shared-audit-failure',()=>source,0).catch(()=>[]);return 'blocked';});
  const first=run();const second=run();reject(Object.assign(new Error('denied'),{status:401}));
  const outcomes=await Promise.allSettled([first,second]);
  expect(outcomes.every(o=>o.status==='rejected'&&o.reason.code==='required_data_unavailable')).toBe(true);
 });
});
