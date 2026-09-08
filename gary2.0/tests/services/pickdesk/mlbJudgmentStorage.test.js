import { describe, it, expect, vi } from 'vitest';
import { createMlbJudgmentJournal, recoverMlbJudgmentPublication, mlbJudgmentDatabaseCall } from '../../../src/services/pickdesk/mlbJudgmentStorage.js';
const now = Date.parse('2026-09-08T18:00:00Z');
const game = {id:123,commence_time:'2026-09-08T23:00:00Z'};
const id='8c25b87a-fb2d-4e2d-9a4a-9ddd6c5d2ff9';
const receipt = phase => ({ok:true,run_id:id,phase,recorded_at:new Date(now).toISOString(),payload_sha256:`hash-${phase}`});
const make = db => createMlbJudgmentJournal({db,game,model:'brain',promptSha:'era',runId:id,clock:()=>now});
describe('durable MLB journal writer',()=>{
  it('bounds a stalled database and propagates cancellation to the underlying request',async()=>{
    let captured;
    const operation=()=>({abortSignal:signal=>{captured=signal;return new Promise(()=>{});}});
    await expect(mlbJudgmentDatabaseCall(operation,{timeoutMs:10})).rejects.toThrow('database deadline');
    expect(captured.aborted).toBe(true);
  });

  it('replays an uncertain RPC with identical run, source and payload, then chains the server hash',async()=>{
    const db={rpc:vi.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({data:receipt('initial_commit')}).mockResolvedValueOnce({data:receipt('factual_research')})};
    const journal=make(db),payload=journal.envelope({winner:'home'}),source={deskText:'Exact original desk'};
    await journal.record('initial_commit',payload,source);
    expect(db.rpc.mock.calls[0]).toEqual(db.rpc.mock.calls[1]);
    source.deskText='Changed later';
    expect(db.rpc.mock.calls[0][1].p_source_snapshot.deskText).toBe('Exact original desk');
    await journal.record('factual_research',journal.envelope({status:'not_requested'}));
    expect(db.rpc.mock.calls[2][1].p_expected_previous_hash).toBe('hash-initial_commit');
  });
  it('rejects changed content and steps without an initial durable receipt',async()=>{
    const db={rpc:vi.fn().mockResolvedValue({data:receipt('initial_commit')})},journal=make(db);
    await expect(journal.record('stress_test',{})).rejects.toThrow('no durable initial');
    await journal.record('initial_commit',{data:{winner:'home'}},{});
    await expect(journal.record('initial_commit',{data:{winner:'away'}},{})).rejects.toThrow('overwrite');
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it('binds publication to the exact saved snapshot and failure to an explicit error',async()=>{
    const db={rpc:vi.fn(async(name,args)=>({data:receipt(name==='start_mlb_judgment'?'initial_commit':args.p_phase)}))};
    const journal=make(db); await journal.record('initial_commit',journal.envelope({}),{});
    const pick={judgment_run_id:id,pick:'Home ML -150'}; await journal.publish(pick);
    expect(db.rpc.mock.calls[1][1].p_payload.data).toEqual({final_pick_snapshot:pick});
    await journal.fail('later failure cannot overwrite publication'); expect(db.rpc).toHaveBeenCalledTimes(2);
    const failed=make(db); await failed.record('initial_commit',failed.envelope({}),{}); await failed.fail('No final card');
    expect(db.rpc.mock.calls.at(-1)[1].p_payload.data).toEqual({error:'No final card'});
  });
  it('rejects a response for another run or phase',async()=>{
    const db={rpc:vi.fn().mockResolvedValue({data:{...receipt('initial_commit'),run_id:'another'}})};
    await expect(make(db).record('initial_commit',{},{})).rejects.toThrow('receipt');
    expect(db.rpc).toHaveBeenCalledTimes(2);
  });
});

describe('publication-gap recovery',()=>{
  const pick={game_id:'123',judgment_run_id:id,decision_policy:'mlb-judgment-v2',price_endorsement:'endorse',commence_time:game.commence_time,model:'brain',prompt_sha:'era',homeTeam:'Home',awayTeam:'Away',pick:'Home ML -150'};
  function fixture({published=false,change=()=>{}}={}) {
    const header={run_id:id,game_date:'2026-09-08',game_id:'123',model:'brain',prompt_sha:'era',commence_time:game.commence_time,
      source_snapshot:{gameKind:'moneyline',allowedTickets:[{id:'home-moneyline',pick:pick.pick}]}};
    const rows=['initial_commit','factual_research','stress_test','price_assessment'].map(phase=>({...receipt(phase),payload:{data:phase==='price_assessment'?{ticket_id:'home-moneyline',decision:'endorse'}:{}}}));
    if(published)rows.push({...receipt('published'),payload:{data:{final_pick_snapshot:structuredClone(pick)}}});
    change(header,rows);
    const db={from:vi.fn(table=>{
      const result={data:table==='mlb_judgment_runs'?header:rows};
      const q={select:()=>q,eq:()=>q,order:async()=>result,maybeSingle:async()=>result}; return q;
    }),rpc:vi.fn().mockResolvedValue({data:receipt('published')})};
    return db;
  }
  it('appends only the missing published phase using the saved price hash',async()=>{
    const db=fixture(); const recovered=await recoverMlbJudgmentPublication(db,pick,{gameDate:'2026-09-08',now});
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][1]).toMatchObject({p_run_id:id,p_phase:'published',p_expected_previous_hash:'hash-price_assessment',p_payload:{data:{final_pick_snapshot:pick}}});
    expect(recovered).toMatchObject({run_id:id,game_id:'123',game_date:'2026-09-08',winners_eligible:true,receipts:{published:{ok:true}}});
  });
  it('uses an existing receipt without rewriting it',async()=>{
    const db=fixture({published:true}); expect(await recoverMlbJudgmentPublication(db,{...pick},{gameDate:'2026-09-08',now})).toBeTruthy();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['wrong original era',(h)=>{h.prompt_sha='old'}],
    ['failed attempt',(_h,r)=>{r.push({...receipt('failed'),payload:{data:{error:'failed'}}})}],
    ['missing stress phase',(_h,r)=>{r.splice(2,1)}],
    ['different confirmed ticket',(_h,r)=>{r.at(-1).payload.data.final_pick_snapshot.pick='Away ML +144'}],
  ])('does not recover %s',async(_label,change)=>{
    const db=fixture({published:true,change}); expect(await recoverMlbJudgmentPublication(db,pick,{gameDate:'2026-09-08',now})).toBeNull(); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('does no write after first pitch',async()=>{
    const db=fixture(); expect(await recoverMlbJudgmentPublication(db,pick,{gameDate:'2026-09-08',now:Date.parse(game.commence_time)})).toBeNull(); expect(db.from).not.toHaveBeenCalled();
  });
});
