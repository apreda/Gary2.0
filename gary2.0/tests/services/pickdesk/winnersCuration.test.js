import { describe,it,expect } from 'vitest';
import { curationPacket, parseCuration, selectWithinSchedule, assessWinners, curationBatches } from '../../../src/services/pickdesk/winnersCuration.js';
const candidate=(id)=>({id,pick_text:'Home -3.5 -110',odds:-110,commence_time:'2026-09-12T20:00:00Z',pick_snapshot:{rationale:'The line holds against this matchup because the passing protection is intact.',confidence:0.99},evidence_snapshot:{observedAt:'2026-09-12T10:00:00Z',deskText:'Official source: the starting offensive line practiced together all week.'}});
const run=(extra={})=>({game_date:'2026-09-12',league:'NFL',input_snapshot:{candidates:[candidate(1),candidate(2),candidate(3)],capacity:2,used:0,reserved:2,prior:[],window:{number:1},plan:{target:4,windows:[{},{},{}]},...extra}});
const row=(id,assessment='clear')=>({candidate_id:id,rank:id,assessment,reason:'The original matchup supports the specific cover.',opposing_case:'The opposing pass rush remains a meaningful risk.',comparison:'Better supported than the weaker original alternatives.',source_quote:'the starting offensive line practiced together all week.',rationale_quote:'the passing protection is intact.'});
const assessment=(grades=['clear','lean','toss_up'])=>({summary:'A supported cover, a lean, and a balanced matchup.',ranked_candidates:grades.map((g,i)=>row(i+1,g))});
describe('Winners curation of original decisions',()=>{
 it('excludes confidence numbers and marks undated source evidence unavailable',()=>{
  expect(curationPacket(candidate(1))).not.toHaveProperty('confidence');
  const c=candidate(1);delete c.evidence_snapshot.observedAt;
  expect(curationPacket(c).source_record).toBe('');
 });
 it('requires exact original supporting quotes and complete unique ranking',()=>{
  expect(parseCuration(assessment(),run())).not.toBeNull();
  const p=assessment();p.ranked_candidates[0].source_quote='A made up game advantage';
  expect(parseCuration(p,run())).toBeNull();
  expect(parseCuration({...assessment(),ranked_candidates:[row(1),row(1),row(3)]},run())).toBeNull();
 });
 it('fills the scheduled quota with the best relative reads, including leans',()=>{
  expect(selectWithinSchedule(assessment(),run()).ranked_candidates.filter(c=>c.selected).map(c=>c.candidate_id)).toEqual([1,2]);
  expect(selectWithinSchedule(assessment(['clear','clear','lean']),run()).ranked_candidates.filter(c=>c.selected).map(c=>c.candidate_id)).toEqual([1,2]);
  expect(selectWithinSchedule(assessment(['lean','lean','toss_up']),run()).ranked_candidates.filter(c=>c.selected).map(c=>c.candidate_id)).toEqual([1,2]);
 });
 it('fills normal places even when all original reads are balanced or unsupported',()=>{
  expect(selectWithinSchedule(assessment(['toss_up','toss_up','unsupported']),run()).ranked_candidates.filter(c=>c.selected).map(c=>c.candidate_id)).toEqual([1,2]);
 });
 it('allows exactly one sixth only in the last window when every admitted judgment is clear',()=>{
  const r=run({capacity:1,used:4,reserved:0,prior:Array.from({length:4},()=>({selection:{assessment:'clear'}})),window:{number:3},plan:{target:5,windows:[{},{},{}]}});
  expect(selectWithinSchedule(assessment(['clear','clear','clear']),r).ranked_candidates.filter(c=>c.selected)).toHaveLength(2);
  r.input_snapshot.prior[0].selection.assessment='lean';
  expect(selectWithinSchedule(assessment(['clear','clear','clear']),r).ranked_candidates.filter(c=>c.selected)).toHaveLength(1);
 });
 it('rejects an otherwise valid comparison that consulted outside tools',async()=>{
  const result=await assessWinners(run(),{clock:()=>Date.parse('2026-09-12T18:00Z'),oneShot:async()=>({success:true,data:JSON.stringify(assessment()),raw:JSON.stringify({type:'item.completed',item:{type:'command_execution'}})})});
  expect(result.ok).toBe(false);expect(result.error).toContain('outside');
 });
 it('accepts a complete comparison with a CLI diagnostic and no outside actions',async()=>{
  const result=await assessWinners(run(),{clock:()=>Date.parse('2026-09-12T18:00Z'),oneShot:async()=>({success:true,data:JSON.stringify(assessment()),raw:JSON.stringify({type:'item.completed',item:{type:'error',message:'Skill descriptions were shortened'}})})});
  expect(result.ok).toBe(true);
 });
 it('reads every complete large record before a global comparison, without losing article tails',async()=>{
  const large=run();
  large.input_snapshot.candidates.forEach(c=>{c.evidence_snapshot.deskText+=' Original article detail.'.repeat(200)+` FINAL-${c.id}`;});
  const batches=curationBatches(large,10000);
  expect(batches).toHaveLength(3);
  let calls=0;
  const result=await assessWinners(large,{clock:()=>Date.parse('2026-09-12T18:00Z'),maxReadBytes:10000,oneShot:async prompt=>{
   calls++;
   if(prompt.startsWith('Compare the already-completed')) {
    expect(prompt).toContain('original_evidence_assessment');
    return {success:true,data:assessment(['clear','clear','clear'])};
   }
   const ids=large.input_snapshot.candidates.filter(c=>prompt.includes(`FINAL-${c.id}`)).map(c=>c.id);
   expect(ids).toHaveLength(1);
   return {success:true,data:{summary:'A complete original evidence reading.',ranked_candidates:ids.map((id,i)=>({...row(id),rank:i+1}))}};
  }});
  expect(result.ok).toBe(true);expect(result.selection.reading_batches).toBe(3);expect(calls).toBe(4);
 });
 it('refuses to truncate a single record that cannot fit',async()=>{
  const r=run();r.input_snapshot.candidates[0].evidence_snapshot.deskText+='a'.repeat(12000);
  let calls=0;
  const result=await assessWinners(r,{clock:()=>Date.parse('2026-09-12T18:00Z'),maxReadBytes:10000,oneShot:async()=>{calls++;}});
  expect(result.ok).toBe(false);expect(result.error).toContain('not truncated');expect(calls).toBe(0);
 });
});
