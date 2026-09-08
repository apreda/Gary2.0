import {describe,it,expect,vi} from 'vitest';
import {buildMlbSelectionAsk,mlbComparisonPacket,MLB_SELECTION_MAX_PROMPT_BYTES,parseMlbSelection,selectMlbWinners,runMlbSelectionWindow} from '../../../src/services/pickdesk/mlbWinnersSelection.js';
import {winnersCandidate} from '../../../src/services/pickdesk/winnersAdmissions.js';
import {mlbJudgmentFixture} from '../../helpers/mlbJudgmentFixture.js';
const now=Date.parse('2026-09-08T17:00:00Z');
const candidate=id=>({id,game_id:String(id),pick_text:`Team ${id} -1.5 +110`,commence_time:'2026-09-08T17:20:00Z',
  pick_snapshot:{type:'spread',rationale:'Original baseball judgment',confidence:id===1?.99:.51},evidence_snapshot:{deskText:'Original facts',caseHome:'Home case',caseAway:'Away case'},review:{eligibility_only:true}});
const run=()=>({id:10,attempts:1,policy_version:'mlb-conviction-v3',game_date:'2026-09-08',cohort:1,input_snapshot:{observed_at:new Date(now).toISOString(),candidates:[candidate(1),candidate(2)],capacity:{remaining:1},slate:[],previous_selections:[]}});
const decision=()=>({summary:'The stronger complete-game judgment is the second ticket.',ranked_candidates:[
  {candidate_id:2,rank:1,selected:true,expected_outcome:'Team 2 wins by at least two runs',reason:'The original matchup and innings plan support this ticket.',comparison:'Its documented full-game plan is stronger than candidate 1.'},
  {candidate_id:1,rank:2,selected:false,expected_outcome:'Team 1 wins by at least two runs',reason:'The original pick remains plausible but has more uncertainty.',comparison:'Candidate 2 has a more persuasive full-game argument.'}]});
describe('Gary MLB Winners selection',()=>{
  it('uses actual judgment rather than confidence ordering and preserves every candidate',()=>{
    const result=parseMlbSelection(JSON.stringify(decision()),run());
    expect(result.ranked_candidates[0].candidate_id).toBe(2);
    const prompt=buildMlbSelectionAsk(run());
    expect(prompt).toContain('Original baseball judgment');expect(prompt).toContain('Home case');expect(prompt).toContain('Away case');
    expect(prompt).not.toContain('Original facts');
    expect(prompt).not.toContain('"confidence":');
    expect(prompt).toContain('factual review establishes eligibility; the choice is yours');
  });
  it('retains every complete original comparative record while the raw ledger remains unchanged',()=>{
    const r=run();
    r.input_snapshot.candidates=Array.from({length:15},(_,index)=>{
      const c=candidate(index+1);
      c.game_date='2026-09-08';c.league='MLB';c.policy_version='mlb-conviction-v3';c.odds=110;
      Object.assign(c.pick_snapshot,{homeTeam:`Home ${index}`,awayTeam:`Away ${index}`,spread:-1.5,decision_policy:'mlb-judgment-v1',model:'codex-gpt-6-astra',prompt_sha:'original-era'});
      Object.assign(c.evidence_snapshot,{snapshotVersion:2,pickIsHome:true,observedAt:'2026-09-08T16:50:00Z',
        deskText:`RAW-DESK-ONLY-${index}`,toolResponses:[{content:`RAW-TOOL-ONLY-${index}`}],pickSnapshot:{confidence:.99,duplicate:`DUPLICATE-SNAPSHOT-${index}`},
        caseHome:`FULL-HOME-${index} with all original reasons and caveats`,caseAway:`FULL-AWAY-${index} with all original opposing reasons`,
        researchBriefing:`FULL-RESEARCH-${index} with its original source citations and unresolved questions`});
      c.review={eligibility_only:true,initial_review:{facts:[`INITIAL-FACT-${index}`]},facts:[`CURRENT-FACT-${index}`],forecast_risks:[`UNCERTAINTY-${index}`],supplemental_evidence:[`SUPPLEMENT-${index}`]};
      return c;
    });
    const frozen=structuredClone(r);
    const prompt=buildMlbSelectionAsk(r);
    for(const c of r.input_snapshot.candidates){
      const packet=mlbComparisonPacket(c,r.game_date);
      expect(packet).toMatchObject({candidate_id:c.id,game_id:c.game_id,game_date:c.game_date,league:'MLB',starts:c.commence_time,odds:110,line:-1.5,picked_side:'home',
        original_decision:{observed_at:c.evidence_snapshot.observedAt,decision_policy:c.pick_snapshot.decision_policy,review_policy:c.policy_version}});
      expect(packet.rationale).toBe(c.pick_snapshot.rationale);
      expect(packet.cases).toEqual({home:c.evidence_snapshot.caseHome,away:c.evidence_snapshot.caseAway});
      expect(packet.research_briefing).toBe(c.evidence_snapshot.researchBriefing);
      expect(packet.factual_review).toEqual(c.review);
      expect(prompt).toContain(JSON.stringify(packet));
    }
    expect(prompt).not.toContain('RAW-DESK-ONLY');expect(prompt).not.toContain('RAW-TOOL-ONLY');expect(prompt).not.toContain('DUPLICATE-SNAPSHOT');
    expect(prompt).not.toContain('"confidence":');
    expect(prompt).toContain('original source desk and tool outputs remain in the immutable ledger');
    expect(r).toEqual(frozen);
  });
  it.each(['missing','duplicate','unseen','over-capacity','rank-gap','non-prefix','no-reason','string-boolean'])(
    'refuses malformed selection: %s',kind=>{
      const d=decision();
      if(kind==='missing')d.ranked_candidates.pop();
      if(kind==='duplicate')d.ranked_candidates[1].candidate_id=2;
      if(kind==='unseen')d.ranked_candidates[1].candidate_id=3;
      if(kind==='over-capacity')d.ranked_candidates[1].selected=true;
      if(kind==='rank-gap')d.ranked_candidates[1].rank=3;
      if(kind==='non-prefix'){d.ranked_candidates[0].selected=false;d.ranked_candidates[1].selected=true;}
      if(kind==='no-reason')d.ranked_candidates[0].reason='';
      if(kind==='string-boolean')d.ranked_candidates[0].selected='true';
      expect(parseMlbSelection(d,run())).toBeNull();
    });
  it('allows a reasoned zero-selection decision without forcing a quota',()=>{
    const d=decision();d.ranked_candidates.forEach(c=>c.selected=false);
    expect(parseMlbSelection(d,run())).not.toBeNull();
  });
  it('uses the game brain with original comparative records, search disabled, and a pregame deadline',async()=>{
    const oneShot=vi.fn(async()=>({success:true,data:JSON.stringify(decision())}));
    const result=await selectMlbWinners(run(),{oneShot,clock:()=>now,model:'codex-gpt-6-astra'});
    expect(result.ok).toBe(true);expect(oneShot.mock.calls[0][1]).toMatchObject({model:'gpt-6-astra',search:false,timeoutMs:360000});
  });
  it('fails oversized UTF8 packets before inference and persists failure without truncating any candidate',async()=>{
    const r=run();
    r.input_snapshot.candidates[1].evidence_snapshot.researchBriefing='⚾'.repeat(Math.ceil(MLB_SELECTION_MAX_PROMPT_BYTES/3));
    const before=structuredClone(r);
    const oneShot=vi.fn();
    const result=await selectMlbWinners(r,{oneShot,clock:()=>now,model:'codex-gpt-6-astra'});
    expect(result.ok).toBe(false);expect(result.prompt_bytes).toBeGreaterThan(MLB_SELECTION_MAX_PROMPT_BYTES);
    expect(result.error).toContain('no candidates were omitted or truncated');expect(oneShot).not.toHaveBeenCalled();
    expect(r).toEqual(before);
    const rpc=vi.fn(async(name)=>({data:name==='claim_mlb_winners_selection'?[r]:{completed:false,reason:'input budget exceeded'}}));
    const q={select(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:[{commence_time:r.input_snapshot.candidates[0].commence_time}]}).then(resolve);}};
    await runMlbSelectionWindow({from:()=>q,rpc},r.game_date,{now,select:()=>selectMlbWinners(r,{oneShot,clock:()=>now,model:'codex-gpt-6-astra'})});
    expect(rpc).toHaveBeenLastCalledWith('finish_mlb_winners_selection',expect.objectContaining({p_selection:null,p_error:result.error}));
    expect(oneShot).not.toHaveBeenCalled();expect(r).toEqual(before);
  });
  it('does not spend context on a large raw source desk already retained in the frozen ledger',async()=>{
    const r=run();r.input_snapshot.candidates[0].evidence_snapshot.deskText='RAW-EVIDENCE'.repeat(MLB_SELECTION_MAX_PROMPT_BYTES);
    const oneShot=vi.fn(async()=>({success:true,data:decision()}));
    const result=await selectMlbWinners(r,{oneShot,clock:()=>now,model:'codex-gpt-6-astra'});
    expect(result.ok).toBe(true);expect(result.prompt_bytes).toBeLessThan(MLB_SELECTION_MAX_PROMPT_BYTES);
    expect(oneShot.mock.calls[0][0]).not.toContain('RAW-EVIDENCE');
    expect(r.input_snapshot.candidates[0].evidence_snapshot.deskText.length).toBe(12*MLB_SELECTION_MAX_PROMPT_BYTES);
  });
  it.each(['web_search','command_execution','mcp_tool_call'])('rejects %s outside the frozen evidence',async type=>{
    const oneShot=async()=>({success:true,data:decision(),raw:JSON.stringify({type:'item.completed',item:{type}})});
    const result=await selectMlbWinners(run(),{oneShot,clock:()=>now,model:'codex-gpt-6-astra'});
    expect(result.ok).toBe(false);expect(result.error).toContain('outside the frozen');
  });
  it('does not publish an answer arriving after the cutoff',async()=>{
    let time=now;
    const result=await selectMlbWinners(run(),{model:'codex-gpt-6-astra',clock:()=>time,oneShot:async()=>{time=now+20*60000;return {success:true,data:decision()};}});
    expect(result.ok).toBe(false);expect(result.error).toContain('kickoff');
  });
  it('persists model failures without inventing an alternate selection',async()=>{
    const rpc=vi.fn(async(name)=>({data:name==='claim_mlb_winners_selection'?[run()]:{completed:false,reason:'provider unavailable'}}));
    const q={select(){return q;},eq(){return q;},then(resolve){return Promise.resolve({data:[{commence_time:'2026-09-08T17:20:00Z'}]}).then(resolve);}};
    const result=await runMlbSelectionWindow({from:()=>q,rpc},'2026-09-08',{now,select:async()=>({ok:false,error:'provider unavailable',model:'gpt-6-astra',ms:50})});
    expect(result.completed).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith('finish_mlb_winners_selection',expect.objectContaining({p_selection:null,p_error:'provider unavailable',p_attempt:1}));
  });
  it('stamps only new MLB game candidates with the new policy',()=>{
    const pick={game_id:'1',pick:'Team ML -120',odds:-120,commence_time:'2026-09-08T17:20:00Z',decision_policy:'mlb-judgment-v1'};
    expect(winnersCandidate({date:'2026-09-08',league:'MLB',kind:'game',pick}).policy_version).toBe('mlb-conviction-v3');
    expect(winnersCandidate({date:'2026-09-08',league:'MLB',kind:'game',pick:{...pick,decision_policy:'mlb-judgment-v2'}}).policy_version).toBe('mlb-conviction-v4');
    expect(winnersCandidate({date:'2026-09-08',league:'NFL',kind:'game',pick}).policy_version).toBe('exact-ticket-v2');
    expect(winnersCandidate({date:'2026-09-08',league:'MLB',kind:'game',pick:{...pick,decision_policy:undefined}}).policy_version).toBe('exact-ticket-v2');
  });
});

describe('v4 selection requires the original endorsed journal',()=>{
  const currentRun=()=>{
    const r=run();r.policy_version='mlb-conviction-v4';
    for(const c of r.input_snapshot.candidates){
      Object.assign(c,{policy_version:r.policy_version,game_date:r.game_date});
      Object.assign(c.pick_snapshot,{game_id:c.game_id,pick:c.pick_text,odds:110,type:'spread',spread:-1.5,homeTeam:`Team ${c.id}`,awayTeam:`Other ${c.id}`,
        commence_time:c.commence_time,decision_policy:'mlb-judgment-v2',judgment_run_id:`run-${c.id}`,price_endorsement:'endorse'});
      c.evidence_snapshot.mlbJudgment=mlbJudgmentFixture(c.pick_snapshot);
      c.review={schema_version:4,policy_version:r.policy_version,eligibility_only:true};
    }
    return r;
  };
  it('includes the unchanged initial judgment, stress test and price endorsement in comparative context',async()=>{
    const r=currentRun(),before=structuredClone(r);
    const oneShot=vi.fn(async()=>({success:true,data:decision()}));
    expect((await selectMlbWinners(r,{oneShot,clock:()=>now})).ok).toBe(true);
    expect(oneShot.mock.calls[0][0]).toContain('Original opening expectation');
    expect(mlbComparisonPacket(r.input_snapshot.candidates[0],r.game_date).recorded_judgment).toMatchObject({
      initial:r.input_snapshot.candidates[0].evidence_snapshot.mlbJudgment.initial,
      stress_test:r.input_snapshot.candidates[0].evidence_snapshot.mlbJudgment.stress,
      price_assessment:r.input_snapshot.candidates[0].evidence_snapshot.mlbJudgment.price,
    });
    expect(r).toEqual(before);
  });
  it.each([
    ['missing journal',c=>{delete c.evidence_snapshot.mlbJudgment;}],
    ['unpublished journal',c=>{delete c.evidence_snapshot.mlbJudgment.receipts.published;}],
    ['another run',c=>{c.pick_snapshot.judgment_run_id='other';}],
    ['declined price',c=>{c.pick_snapshot.price_endorsement='decline';c.evidence_snapshot.mlbJudgment.price.decision='decline';c.evidence_snapshot.mlbJudgment.winners_eligible=false;}],
    ['old factual policy',c=>{c.review.policy_version='mlb-conviction-v3';}],
    ['old factual schema',c=>{c.review.schema_version=3;}],
    ['repriced published ticket',c=>{c.pick_snapshot.odds=120;}],
    ['postgame receipt',c=>{c.evidence_snapshot.mlbJudgment.receipts.published.recorded_at=c.commence_time;}],
  ])('refuses %s without selecting around the invalid candidate',async(_label,mutate)=>{
    const r=currentRun();mutate(r.input_snapshot.candidates[0]);const oneShot=vi.fn();
    expect((await selectMlbWinners(r,{oneShot,clock:()=>now})).ok).toBe(false);
    expect(oneShot).not.toHaveBeenCalled();
  });
});
