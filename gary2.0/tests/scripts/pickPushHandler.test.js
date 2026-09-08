import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as delivery from '../../supabase/functions/notify-new-pick/delivery.ts';
import { ncaafSlateDateForInstant } from '../../supabase/functions/_shared/ncaafKickoff.js';

const source = stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/notify-new-pick/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, ''));
const now = Date.parse('2026-09-09T20:00:00Z');
const pick = { league:'NFL',game_id:42,awayTeam:'Away',homeTeam:'Home',pick:'Away +3',commence_time:'2026-09-09T21:00:00Z' };
const realDate = Date;
class FixtureDate extends realDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}

function fixture({ tokens = ['a','b'], picks = [pick], weekly = picks.filter(p => p.league === 'NFL'), dailyRows = null, clock = now, failTable = null, seen = [], send = () => 200 } = {}) {
  const events = []; const receipts = new Map(); const watermarks = new Set(seen);
  let handler;
  const sb = {
    from(table) {
      let operation = 'read'; let payload; let after = ''; let limit = 1000; const filters = {};
      const query = {
        select() { return query; }, eq(key,value) { filters[key]=value; return query; }, in(key,value) { filters[key]=value; return query; },
        gte() { return query; }, lt() { return query; }, order() { return query; },
        gt(_key,value) { after=value; return query; }, limit(value) { limit=value; return query; },
        upsert(value) { operation='upsert'; payload=value; return query; },
        update(value) { operation='update'; payload=value; return query; }, delete() { operation='delete'; return query; },
        then(resolve,reject) {
          events.push({table,operation,payload,filters,after});
          if (failTable === table) return Promise.resolve({data:null,error:{message:'Fixture unavailable'}}).then(resolve,reject);
          let data=[];
          if (table==='daily_picks') data=dailyRows ?? [{date:'2026-09-09',picks}];
          if (table==='weekly_nfl_picks') data=[{picks:weekly}];
          if (table==='push_tokens' && operation==='read') data=tokens.filter(token=>token>after).sort().slice(0,limit).map(device_token=>({device_token}));
          if (table==='pick_notify_state') {
            if (operation==='upsert') watermarks.add(payload.pick_key);
            data=[...watermarks].map(pick_key=>({pick_key}));
          }
          return Promise.resolve({data,error:null}).then(resolve,reject);
        },
      };
      return query;
    },
    async rpc(name,args) {
      events.push({rpc:name,args});
      const key=`${args.p_pick_key}/${args.p_device_key}`;
      if (name==='claim_pick_push') {
        const old=receipts.get(key);
        if (old && old.status!=='failed') return {data:{claimed:false,status:old.status}};
        const next={claimed:true,status:'sending',attempt_id:`fixture-${events.length}`};
        receipts.set(key,next); return {data:next};
      }
      receipts.set(key,{status:args.p_status});return {data:true};
    },
  };
  const request = async (url,options) => {
    if (url==='https://oauth2.googleapis.com/token') { events.push({authorization:true});return Response.json({access_token:'fixture-access'}); }
    if (url.startsWith('https://fcm.googleapis.com/')) {
      const message=JSON.parse(options.body).message;
      events.push({send:message.token,data:message.data});
      const result=send(message.token);
      if (result==='timeout') throw new Error('Fixture timeout');
      return Response.json({}, {status:result});
    }
    throw new Error('Unexpected fixture URL');
  };
  class ClockDate extends FixtureDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  vm.runInNewContext(source, {
    ...delivery, ncaafSlateDateForInstant, deliverPickAlert: (...args)=>delivery.deliverPickAlert(...args,request,()=>clock),
    createClient:()=>sb, Date:ClockDate, URL, URLSearchParams, Response, Request,
    TextEncoder, Uint8Array, btoa, atob, AbortSignal,
    crypto:{subtle:{digest:webcrypto.subtle.digest.bind(webcrypto.subtle),importKey:async()=>({}),sign:async()=>new Uint8Array([1,2,3])}},
    fetch:request, Deno:{env:{get:key=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'service-fixture',
      FIREBASE_PROJECT_ID:'fixture',FIREBASE_CLIENT_EMAIL:'fixture@example.invalid',FIREBASE_PRIVATE_KEY:'AQID'})[key]},serve:fn=>{handler=fn;}},
  });
  const run = async (suffix='',bearer='service-fixture',method='POST') => {
    const response=await handler(new Request(`https://fixture.invalid/notify-new-pick${suffix}`,{method,headers:{Authorization:`Bearer ${bearer}`}}));
    return {status:response.status,...await response.json()};
  };
  return {events,receipts,watermarks,run};
}

describe('actual scheduled pick-push handler with isolated providers',()=>{
  it('rejects public trigger and dry preview before any source, claim or send',async()=>{
    const f=fixture();expect((await f.run('?dry=1','anon-fixture')).status).toBe(401);
    expect((await f.run('','user-fixture')).status).toBe(401);expect(f.events).toEqual([]);
  });
  it('dry preview reads every active-device page but never authorizes, claims, writes or sends',async()=>{
    const f=fixture({tokens:Array.from({length:1001},(_,n)=>String(n).padStart(5,'0'))});
    const result=await f.run('?dry=1');expect(result.devices).toBe(1001);
    expect(f.events.filter(e=>e.table==='push_tokens')).toHaveLength(3);
    expect(f.events.filter(e=>e.table==='push_tokens').every(e=>e.filters.active===true)).toBe(true);
    expect(f.events.every(e=>e.operation==='read')).toBe(true);
  });
  it('retries only the known failed device after partial success',async()=>{
    let failed=true;
    const f=fixture({send:token=>token==='b'&&failed?503:200});
    expect(await f.run()).toMatchObject({accepted:1,failed:1,recorded:0});
    failed=false;expect(await f.run()).toMatchObject({accepted:1,failed:0,recorded:1});
    expect(f.events.filter(e=>e.send).map(e=>e.send).sort()).toEqual(['a','b','b']);
    expect(await f.run()).toMatchObject({reason:'No new pregame picks'});
  });
  it('records transport ambiguity as uncertain without retrying the device',async()=>{
    const f=fixture({tokens:['a'],send:()=> 'timeout'});
    expect(await f.run()).toMatchObject({unknown:1,accepted:0,recorded:1});
    await f.run();expect(f.events.filter(e=>e.send)).toHaveLength(1);
  });
  it.each(['daily_picks','weekly_nfl_picks','push_tokens','pick_notify_state'])('does not send or watermark failed %s loads',async table=>{
    const f=fixture({failTable:table});expect((await f.run()).status).toBe(500);
    expect(f.events.some(e=>e.send||e.rpc||e.operation==='upsert')).toBe(false);
  });
  it('honors already-sent legacy identities during rollout',async()=>{
    const f=fixture({seen:['2026-09-09|NFL|Away@Home|Away +3']});
    expect(await f.run()).toMatchObject({reason:'No new pregame picks'});
    expect(f.events.some(e=>e.send||e.rpc)).toBe(false);
  });
  it('uses exact weekly NFL and preserves provider alias IDs without a stale daily fallback',async()=>{
    const f=fixture({weekly:[{...pick,game_id:undefined,bdl_game_id:42}]});
    expect(await f.run()).toMatchObject({accepted:2,recorded:1});
    expect(f.events.find(e=>e.table==='weekly_nfl_picks').filters).toEqual({week_start:'2026-09-08',season:2026});
    expect(f.events.filter(e=>e.send).every(e=>e.data.game_id==='42')).toBe(true);
    expect(await fixture({weekly:[]}).run()).toMatchObject({reason:'No new pregame picks'});
  });
  it('loads the prior college slate after midnight without relabeling the published game date',async()=>{
    const f=fixture({clock:Date.parse('2026-09-10T05:00:00Z'),weekly:[],dailyRows:[
      {date:'2026-09-09',picks:[{...pick,league:'NCAAF',commence_time:'2026-09-10T06:00:00Z'}]},
      {date:'2026-09-10',picks:[]},
    ]});
    expect(await f.run()).toMatchObject({accepted:2,recorded:1});
    expect(f.events.find(e=>e.table==='daily_picks').filters.date).toEqual(['2026-09-10','2026-09-09']);
    expect(f.events.filter(e=>e.send).every(e=>e.data.game_date==='2026-09-09')).toBe(true);
  });
});
