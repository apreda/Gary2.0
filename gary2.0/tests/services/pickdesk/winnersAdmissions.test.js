import { describe, it, expect, vi } from 'vitest';
import { canonicalProp, coreProp, winnersCandidate, enqueueWinnersCandidate, isProductionWinnersRun, confirmedPublishedGame, winnersPickIsHome } from '../../../src/services/pickdesk/winnersAdmissions.js';
vi.mock('../../../src/supabaseClient.js',()=>({supabaseAdmin:{}}));
const { reviewCandidate, reviewNext, reviewAndRelease, reconcilePublished }=await import('../../../scripts/run-winners-board.js');
const now=Date.parse('2026-09-04T17:00:00Z');
const prop=(over={})=>({game_id:'42',player:'José Player',prop:'player_points',line:10.5,bet:'over',odds:'-110',confidence:.64,rationale:'original card',commence_time:'2026-09-04T23:00:00Z',sport:'NBA',...over});
const candidate=p=>winnersCandidate({date:'2026-09-04',league:'NBA',kind:'prop',pick:p});
function fakeClient(tables={}) {
  const writes=[]; const filters=[];
  return {writes,filters,from(table){let insert=false;
    const q={select(){return q;},maybeSingle(){return q;},eq(k,v){filters.push([table,'eq',k,v]);return q;},gte(){return q;},lte(){return q;},in(k,v){filters.push([table,'in',k,v]);return q;},is(k,v){filters.push([table,'is',k,v]);return q;},
      upsert(value,options){insert=true;writes.push({table,value,options});return q;},update(value){insert=true;writes.push({table,value,update:true});return q;},
      then(resolve){return Promise.resolve({data:insert?null:(tables[table]??null),error:null}).then(resolve);},
    };return q;
  }};
}
describe('canonical exact Winners tickets',()=>{
  it('recognizes full spread tickets and mascot moneylines without guessing unknown teams',()=>{
    expect(winnersPickIsHome({pick:'Oklahoma -21.5 -110',homeTeam:'Oklahoma',awayTeam:'UTEP'})).toBe(true);
    expect(winnersPickIsHome({pick:'UTEP +21.5 -110',homeTeam:'Oklahoma',awayTeam:'UTEP'})).toBe(false);
    expect(winnersPickIsHome({pick:'Red Sox ML -144',homeTeam:'Boston Red Sox',awayTeam:'Seattle Mariners'})).toBe(true);
    expect(winnersPickIsHome({pick:'Unknown -3 -110',homeTeam:'Oklahoma',awayTeam:'UTEP'})).toBeNull();
  });
  it('does not treat dry runs, tests or disabled storage as production publication',()=>{
    expect(isProductionWinnersRun()).toBe(true);
    for(const options of [{dryRun:true},{useTestTable:true},{shouldStore:false},{shouldStore:true,useTestTable:true}])expect(isProductionWinnersRun(options)).toBe(false);
  });
  it('checks the actual stored game after append, refusing skipped incoming versions',async()=>{
    const pick={game_id:'7',pick:'Oklahoma -21.5 -110',odds:-110,rationale:'original reasoning',model:'Astra',prompt_sha:'era'};
    const stored={...pick,public_id:'the-published-snapshot'};
    const readPublished=vi.fn(async()=>({storedPick:stored}));
    expect(await confirmedPublishedGame({date:'2026-09-04',league:'NCAAF',pick},{readPublished})).toBe(stored);
    expect(readPublished).toHaveBeenCalledWith('NCAAF','2026-09-04','7');
    expect(await confirmedPublishedGame({date:'2026-09-04',league:'NCAAF',pick:{...pick,rationale:'a regenerated card'}},{readPublished})).toBeNull();
    expect(await confirmedPublishedGame({date:'2026-09-04',league:'NCAAF',pick:{...pick,odds:-115}},{readPublished})).toBeNull();
    await expect(confirmedPublishedGame({date:'2026-09-04',league:'NCAAF',pick},{readPublished:async()=>({error:'offline'})})).rejects.toThrow('offline');
  });
  it('deduplicates raw versus formatted prop text and keeps price/line changes distinct',()=>{
    const raw=candidate(prop());
    const display=candidate(prop({player:'Jose Player',prop:'points 10.5',line:'10.50'}));
    expect(raw.ticket_key).toBe(display.ticket_key);
    expect(raw.market_key).toBe(display.market_key);
    expect(raw.ticket_key).not.toBe(candidate(prop({odds:-115})).ticket_key);
    expect(raw.ticket_key).not.toBe(candidate(prop({line:11.5})).ticket_key);
    expect(raw.market_key).toBe(candidate(prop({odds:-115})).market_key);
    expect(display.pick_text).not.toContain('10.5 10.5');
  });
  it('requires exact identity, line, direction, price and future-time metadata',()=>{
    for(const p of [prop({game_id:''}),prop({line:null}),prop({bet:'yes'}),prop({odds:'bad'}),prop({odds:-110.5}),prop({commence_time:null}),prop({prop:'points 11.5',line:10.5})]) expect(candidate(p).status).toBe('unavailable');
    expect(candidate(prop({prop:'points 10.5',line:null})).status).toBe('pending');
    expect(canonicalProp(prop({prop:'points 10.5'})).prop).toBe('points');
    expect(canonicalProp(prop({prop:'points 10.5',prop_type:'stale_model_alias'})).prop).toBe('points');
  });
  it('excludes HR and touchdown lanes across storage formats',()=>{
    for(const type of ['home_runs 0.5','player_anytime_td','Home Runs 0.5','batter_home_runs','first_touchdown'])expect(coreProp(prop({prop:type}))).toBe(false);
    expect(coreProp(prop())).toBe(true);
  });
  it('only fills absent original evidence on an unadmitted candidate',async()=>{
    const client=fakeClient(); await enqueueWinnersCandidate(client,{date:'2026-09-04',league:'NBA',kind:'prop',pick:prop(),evidence:{deskText:'original'}});
    expect(client.writes[0].options.ignoreDuplicates).toBe(true);
    expect(client.filters).toContainEqual(['winners_candidates','is','admitted_at',null]);
    expect(client.filters).toContainEqual(['winners_candidates','is','evidence_snapshot->>deskText',null]);
    expect(client.filters).toContainEqual(['winners_candidates','in','status',['pending','unavailable']]);
  });
});
describe('durable worker',()=>{
  it('passes the original research as labeled source evidence with the final spread',async()=>{
    const pick={game_id:'7',pick:'Oklahoma -21.5 -110',type:'spread',spread:-21.5,odds:-110,homeTeam:'Oklahoma',awayTeam:'UTEP',commence_time:'2026-09-04T23:00:00Z'};
    const c=winnersCandidate({date:'2026-09-04',league:'NCAAF',kind:'game',pick,evidence:{deskText:'ORIGINAL DESK',researchBriefing:'ORIGINAL RESEARCH',caseHome:'H',caseAway:'A'}});
    const review=vi.fn(async()=>({ok:true,status:'qualified'}));
    await reviewCandidate(c,{gameReview:review,now});
    expect(review.mock.calls[0][0]).toMatchObject({pickIsHome:true,betLine:-21.5,odds:-110});
    expect(review.mock.calls[0][0].deskText).toContain('ORIGINAL RESEARCH');
    expect(review.mock.calls[0][0].deskText).toContain('not independent verification');
  });
  it('releases a finished review while the other bounded reader is still running',async()=>{
    let finishSlow;
    const release=vi.fn(async()=>{});
    const slow=reviewAndRelease({}, {review:()=>new Promise(resolve=>{finishSlow=resolve;}),release});
    await reviewAndRelease({}, {review:async()=>true,release});
    expect(release).toHaveBeenCalledTimes(1);
    finishSlow(true);await slow;
    expect(release).toHaveBeenCalledTimes(2);
  });
  it('uses canonical prop data and refuses absent or postgame evidence without a model call',async()=>{
    const review=vi.fn(async()=>({ok:true,status:'qualified'}));
    const c=candidate(prop({prop:'points 10.5'})); c.evidence_snapshot={deskText:'original',observedAt:'2026-09-04T16:00:00Z'};
    expect((await reviewCandidate(c,{propReview:review,now})).status).toBe('qualified');
    expect(review.mock.calls[0][0]).toMatchObject({propType:'points',line:10.5,side:'over'});
    await reviewCandidate({...c,evidence_snapshot:{}},{propReview:review,now});
    await reviewCandidate({...c,evidence_snapshot:{deskText:'late',observedAt:'2026-09-05T00:00:00Z'}},{propReview:review,now});
    await reviewCandidate(c,{propReview:review,now:Date.parse(c.commence_time)});
    expect(review).toHaveBeenCalledTimes(1);
  });
  it('records provider failure as unavailable and honors the claim attempt token',async()=>{
    const c={...candidate(prop()),id:17,attempts:2};
    const rpc=vi.fn(async(name)=>({data:name==='claim_winners_candidate'?[c]:false,error:null}));
    await reviewNext({rpc},{review:async()=>{throw new Error('provider offline');}});
    expect(rpc.mock.calls[1]).toEqual(['finish_winners_review',expect.objectContaining({p_id:17,p_attempt:2,p_status:'unavailable',p_reason:'provider offline'})]);
  });
  it('recovers only original exact-ticket game evidence and includes NFL weekly publication',async()=>{
    const game={game_id:'g1',league:'MLB',homeTeam:'H',awayTeam:'A',pick:'H ML -120',odds:-120,commence_time:'2026-09-04T23:00:00Z',path_home:'home case',path_away:'away case'};
    const nfl={...game,game_id:'n1',league:'NFL',homeTeam:'N',awayTeam:'F',pick:'N -3 -110',odds:-110};
    const client=fakeClient({daily_picks:{picks:[game]},prop_picks:{picks:[prop()]},weekly_nfl_picks:[{picks:[nfl,{...nfl,game_id:'tomorrow',commence_time:'2026-09-05T23:00:00Z'}]}],pick_desks:[{matchup:'A @ H',pick:game.pick,desk:'original MLB',created_at:'2026-09-04T16:00:00Z'},{matchup:'F @ N',pick:'DIFFERENT PICK',desk:'wrong',created_at:'2026-09-04T16:00:00Z'}]});
    await reconcilePublished(client,'2026-09-04',{now});
    const rows=client.writes.filter(x=>!x.update).map(x=>x.value);
    expect(rows).toHaveLength(3);
    expect(rows.find(x=>x.game_id==='g1').evidence_snapshot).toMatchObject({deskText:'original MLB',caseHome:'home case',pickIsHome:true});
    expect(rows.find(x=>x.game_id==='n1').evidence_snapshot).toEqual({});
    expect(rows.find(x=>x.kind==='prop').evidence_snapshot).toEqual({});
  });
});
