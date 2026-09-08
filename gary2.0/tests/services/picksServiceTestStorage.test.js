import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({adminFrom:vi.fn(),anonFrom:vi.fn(),getSession:vi.fn(),signIn:vi.fn()}));
vi.mock('../../src/supabaseClient.js',()=>({supabase:{from:mocks.anonFrom,auth:{getSession:mocks.getSession,signInAnonymously:mocks.signIn}},supabaseAdmin:{from:mocks.adminFrom}}));
const {storeTestPicks}=await import('../../src/services/picksService.js');
const today='2026-09-08';
const pick=(arm='arm-a',extra={})=>({league:'NFL',game_id:42,bdl_game_id:42,test_arm:arm,homeTeam:'Home',awayTeam:'Away',pick:'Home ML -140',type:'moneyline',odds:-140,rationale:'Original NFL judgment.',commence_time:'2026-09-10T23:20:00Z',...extra});
function database({seed=null,simultaneousReads=false,readError=null,malformedReceipt=false,alwaysContended=false}={}) {
  const db={rows:new Map(seed?[[seed.date,structuredClone(seed)]]:[]),tables:[],writes:[],reads:0};
  let nextId=2,waiting=[];
  const from=table=>{
    db.tables.push(table);let mode='read',value,fields='*',filters=[];
    const q={select(columns){fields=columns;return q;},eq(key,wanted){filters.push([key,wanted]);return q;},is(key,wanted){filters.push([key,wanted]);return q;},limit(){return q;},
      update(v){mode='update';value=v;return q;},insert(v){mode='insert';value=v;return q;},abortSignal(){return q;},
      async then(resolve,reject){try {
        const select=row=>fields==='*'?structuredClone(row):Object.fromEntries(fields.split(',').map(key=>[key.trim(),structuredClone(row[key.trim()])]));
        if(mode==='read') {
          db.reads++;
          const rows=[...db.rows.values()].filter(row=>filters.every(([key,wanted])=>row[key]===wanted));
          const response={data:rows.map(select),error:readError};
          if(simultaneousReads && db.reads<=2)await new Promise(done=>{waiting.push(done);if(waiting.length===2)waiting.forEach(f=>f());});
          return resolve(response);
        }
        db.writes.push({mode,value:structuredClone(value),filters});
        if(mode==='insert') {
          if(db.rows.has(value.date))return resolve({data:null,error:{code:'23505',message:'duplicate date'}});
          const row={id:nextId++,updated_at:new Date().toISOString(),...structuredClone(value)};db.rows.set(row.date,row);
          return resolve({data:malformedReceipt?[]:[select(row)],error:null});
        }
        const row=[...db.rows.values()].find(row=>filters.every(([key,wanted])=>(row[key]??null)===wanted));
        if(!row || alwaysContended)return resolve({data:[],error:null});
        Object.assign(row,structuredClone(value));
        return resolve({data:malformedReceipt?[]:[select(row)],error:null});
      } catch(error){return reject?.(error);}}
    };return q;
  };
  mocks.adminFrom.mockImplementation(from);mocks.anonFrom.mockImplementation(from);
  return db;
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime('2026-09-08T17:00:00Z');Object.values(mocks).forEach(m=>m.mockReset());mocks.getSession.mockResolvedValue({data:{session:{}}});});
afterEach(()=>vi.useRealTimers());
const original=()=>({id:1,date:today,picks:[pick('existing')],test_name:'existing-test',test_notes:'keep these notes',updated_at:'2026-09-08T16:59:59.000Z'});
describe('isolated test_daily_picks storage',()=>{
  it('uses the explicit target date and preserves exact NFL identity, test arm and rationale',async()=>{
    const db=database(),input=pick();
    expect(await storeTestPicks([input],'new-test','notes',{date:'2026-09-10'})).toMatchObject({success:true,count:1,date:'2026-09-10'});
    expect(db.rows.get('2026-09-10').picks).toEqual([input]);expect(db.rows.has(today)).toBe(false);
    expect(mocks.adminFrom).toHaveBeenCalled();expect(mocks.anonFrom).not.toHaveBeenCalled();expect(mocks.getSession).not.toHaveBeenCalled();
    expect(new Set(db.tables)).toEqual(new Set(['test_daily_picks']));
  });
  it('preserves the execution-date default and prior metadata when no new labels are supplied',async()=>{
    const db=database({seed:original()});
    expect(await storeTestPicks([pick('new')])).toMatchObject({success:true,count:1,date:today});
    expect(db.rows.get(today)).toMatchObject({test_name:'existing-test',test_notes:'keep these notes',picks:[pick('existing'),pick('new')]});
  });
  it('preserves simultaneous different arms for the same game in an existing date row',async()=>{
    const db=database({seed:original(),simultaneousReads:true});
    const results=await Promise.all([storeTestPicks([pick('a')],'a'),storeTestPicks([pick('b')],'b')]);
    expect(results.every(result=>result.success)).toBe(true);
    expect(db.rows.get(today).picks.map(p=>p.test_arm).sort()).toEqual(['a','b','existing']);
    expect(db.writes.filter(w=>w.mode==='update').every(w=>w.filters.some(([key])=>key==='updated_at'))).toBe(true);
  });
  it('recovers the date insert race without discarding either arm',async()=>{
    const db=database({simultaneousReads:true});
    const results=await Promise.all([storeTestPicks([pick('a')],'a'),storeTestPicks([pick('b')],'b')]);
    expect(results.every(result=>result.success)).toBe(true);expect(db.rows.get(today).picks.map(p=>p.test_arm).sort()).toEqual(['a','b']);
  });
  it.each(['2026-02-30','2026-09-10,2026-09-11','not-a-date'])('rejects invalid explicit date %s before storage',async date=>{
    const db=database();expect(await storeTestPicks([pick()],null,null,{date})).toMatchObject({success:false});expect(db.tables).toEqual([]);
  });
  it('fails closed on an unreadable or malformed existing row',async()=>{
    let db=database({readError:{message:'permission denied'}});
    expect(await storeTestPicks([pick()])).toMatchObject({success:false});expect(db.writes).toEqual([]);
    db=database({seed:{...original(),picks:{invalid:'original data'}}});
    expect(await storeTestPicks([pick()])).toMatchObject({success:false});expect(db.writes).toEqual([]);
  });
  it('does not acknowledge a write without an exact returned storage snapshot',async()=>{
    database({malformedReceipt:true});expect(await storeTestPicks([pick()])).toMatchObject({success:false});
  });
  it('bounds repeated concurrent changes without overwriting another writer',async()=>{
    const db=database({seed:original(),alwaysContended:true});
    expect(await storeTestPicks([pick('new')])).toMatchObject({success:false});
    expect(db.writes.length).toBeLessThanOrEqual(5);expect(db.rows.get(today).picks).toEqual(original().picks);
  });
});
