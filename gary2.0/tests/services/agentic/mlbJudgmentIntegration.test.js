import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), research: vi.fn(), follow: vi.fn(), ask: vi.fn(), fetch: vi.fn(), stalled: false }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({ createModelSession: mocks.create, sendToSession: mocks.send, sendToSessionWithRetry: mocks.send }));
vi.mock('../../../src/services/agentic/orchestrator/researchBriefing.js', () => ({ buildResearchBriefing: mocks.research, extractResearcherQuestions: () => [], createResearcherFollowUpSession: mocks.follow, askResearcher: mocks.ask }));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({fetchStats:mocks.fetch,clearStatRouterCache:vi.fn()}));
vi.mock('../../../src/services/agentic/orchestrator/orchestratorHelpers.js', async original => ({...await original(),
  isInvestigationSufficient:()=>({categoryCount:0,totalCalls:mocks.stalled?10:0})}));
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';
import { originalGameEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';

const home = 'Los Angeles Dodgers', away = 'Cincinnati Reds';
const game = { id: 123, home_team: home, away_team: away, commence_time: '2026-09-08T23:00:00Z', moneyline_home: -172, moneyline_away: 144 };
const expectations = Object.fromEntries(['opening','middle','finish','offense'].map(id => [id, {
  claim: `Observable ${id} expectation`, evidence: `Original ${id} evidence`, disconfirming_observation: `Contrary ${id} event`,
}]));
const initial = { winner:'home', ticket_id:'home-moneyline', whole_game_view:'The full game favors the home club beyond the starter matchup.', expectations,
  strongest_opposing_case:'The opposing starter can suppress the opening offense.', uncertain_assumption:'The starter workload has not been confirmed.',
  factual_questions:[{id:'q1',question:'Is an innings restriction announced?',expectation_id:'opening',why_it_matters:'It changes the expected relief innings.'}] };
const stress = { winner:'home',ticket_id:'home-moneyline', whole_game_view:'The middle and finish support the expected home win despite the opposing starter.',expectations,
  strongest_alternative:{scenario:'The opposing starter goes deeper.',effect_on_expected_outcome:'The offense faces fewer relief innings.',response:'The later matchup still supports the home call, with uncertainty.'},changed_side:false,revision_evidence:[] };
const price = {ticket_id:'home-moneyline',decision:'endorse',reason:'I support this ticket given the complete baseball read.'};
const response = content => ({ content: typeof content === 'string' ? content : JSON.stringify(content), toolCalls:null, finishReason:'stop' });
const card = (side = home) => ({pick:`${side} ML ${side === home ? '-172' : '+144'}`,bet_type:'moneyline',confidence_score:63,
  rationale:'The entire game favors the selected side through the opening matchup, middle innings and finishing options. The opposing starter remains the main risk to the call. '.repeat(8)});
function setup({decline=false,formatted=true}={}) {
  const record = vi.fn(async phase => ({ok:true,run_id:'run-1',phase,recorded_at:new Date().toISOString(),payload_sha256:`hash-${phase}`}));
  mocks.send.mockResolvedValueOnce(response('Both clubs have paths across the game.\nINVESTIGATION COMPLETE'))
    .mockResolvedValueOnce(response(initial)).mockResolvedValueOnce(response(stress))
    .mockResolvedValueOnce(response({...price,decision:decline?'decline':'endorse'}));
  if (!formatted) mocks.send.mockResolvedValueOnce(response('My call is the recorded home moneyline; the whole game is the basis.'));
  mocks.send.mockResolvedValueOnce(response(card()));
  const options = {game,spread:0,scoutReport:'Exact research desk',originalGaryDesk:'Exact original Gary desk',prebuiltResearchBriefing:'Original attributed briefing',
    mlbJudgmentJournal:{record},mlbExpectationMemory:{rows:[],text:'Only previously completed expectations'},modelOverride:'codex-gpt-6-astra'};
  return {record,options,run:()=>runAgentLoop('system','Original first read','baseball_mlb',home,away,options)};
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.stalled=false; mocks.fetch.mockResolvedValue({home:{team:home,value:3},away:{team:away,value:4},source:'Original tool source'}); vi.stubEnv('GARY_RESEARCHER','on'); vi.stubEnv('GARY_CHILD_DEADLINE_AT','');
  mocks.create.mockResolvedValue({provider:'codex-cli',modelName:'codex-gpt-6-astra'});
  mocks.follow.mockResolvedValue({provider:'codex-cli'}); mocks.ask.mockResolvedValue('Attributed report says a workload restriction is announced.');
  mocks.send.mockRejectedValue(new Error('Unexpected extra model turn'));
});
afterEach(()=>vi.unstubAllEnvs());
describe('staged MLB process through the actual game loop',()=>{
  it.each([true,false])('records before price and returns the bound card, early JSON %s',async formatted=>{
    const fixture=setup({formatted}); const result=await fixture.run();
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({pick:'Los Angeles Dodgers ML -172',decision_policy:'mlb-judgment-v2',judgment_run_id:'run-1',price_endorsement:'endorse',read_winner:home});
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(fixture.record.mock.calls.map(c=>c[0])).toEqual(['initial_commit','factual_research','stress_test','price_assessment']);
    expect(fixture.record.mock.calls[0][2]).toMatchObject({deskText:'Exact original Gary desk',researchBriefing:'Original attributed briefing',odds_visibility:'odds_visible'});
    expect(mocks.send.mock.calls[0][1]).toContain('Only previously completed expectations');
    expect(mocks.ask.mock.invocationCallOrder[0]).toBeGreaterThan(fixture.record.mock.invocationCallOrder[0]);
    expect(mocks.send.mock.calls[4][1]).toContain('RECORDED MLB DECISION');
    expect(mocks.send.mock.calls[4][1]).toContain('FORMATTING FROM THE RECORDED SOURCES ONLY');
    if(!formatted){
      expect(mocks.send.mock.calls[5][1]).toContain('RECORDED MLB DECISION');
      expect(mocks.send.mock.calls[5][1]).toContain('FORMATTING FROM THE RECORDED SOURCES ONLY');
    }
    expect(originalGameEvidence({result,pick:result,deskText:'desk'}).mlbJudgment.price.decision).toBe('endorse');
  });
  it('does not force the only priced team when the original market is incomplete',async()=>{
    const fixture=setup(); fixture.options.game={...game,moneyline_home:-250};
    const result=await fixture.run(); expect(result).toMatchObject({code:'market_unavailable',retryModel:false});
    expect(mocks.create).not.toHaveBeenCalled(); expect(fixture.record).not.toHaveBeenCalled();
  });
  it('keeps a declined price as the same ordinary call with explicit rationale instructions',async()=>{
    const fixture=setup({decline:true}); const result=await fixture.run();
    expect(result.price_endorsement).toBe('decline'); expect(result._mlbJudgment.winners_eligible).toBe(false);
    expect(mocks.send.mock.calls[4][1]).toContain('decline to endorse the wager at this price');
  });
  it('stops at a failed initial receipt before factual research or price assessment',async()=>{
    const fixture=setup(); fixture.record.mockRejectedValue(new Error('Durable database unavailable'));
    await expect(fixture.run()).rejects.toThrow('Durable database unavailable');
    expect(mocks.ask).not.toHaveBeenCalled(); expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it('preserves unavailable research instead of calling it confirmed',async()=>{
    const fixture=setup(); mocks.ask.mockRejectedValue(new Error('Source unavailable'));
    const result=await fixture.run(); expect(result._mlbJudgment.research.status).toBe('unavailable');
    expect(mocks.send.mock.calls[2][1]).toContain('Source unavailable');
  });
  it('delivers outstanding tool responses before a forced decision transition',async()=>{
    const fixture=setup(); mocks.stalled=true;
    const tool = n => ({content:'',finishReason:'tool_calls',toolCalls:[{id:`tool-${n}`,type:'function',function:{name:'fetch_stats',arguments:JSON.stringify({token:['RECENT_FORM','MLB_SP_ERA','MLB_BULLPEN_ERA'][n-1],sport:'MLB'})}}]});
    mocks.send.mockReset().mockResolvedValueOnce(tool(1)).mockResolvedValueOnce(tool(2)).mockResolvedValueOnce(tool(3))
      .mockResolvedValueOnce(response('The latest tool evidence is now received.'))
      .mockResolvedValueOnce(response(initial)).mockResolvedValueOnce(response(stress)).mockResolvedValueOnce(response(price)).mockResolvedValueOnce(response(card()));
    const result=await fixture.run(); expect(result.decision_policy).toBe('mlb-judgment-v2');
    expect(mocks.send.mock.calls[3][2]).toMatchObject({isFunctionResponse:true});
    expect(mocks.send.mock.calls[4][1]).toContain('Record your initial baseball judgment');
    expect(fixture.record.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.send.mock.invocationCallOrder[3]);
    expect(fixture.record.mock.calls[0][2].conversation.some(m=>m.content==='The latest tool evidence is now received.')).toBe(true);
    expect(result._originalToolResponses).toEqual(fixture.record.mock.calls[0][2].toolResponses);
    expect(result._originalToolResponses).toHaveLength(3); // Includes unavailable-token responses.
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a formatter that replaces the recorded Dodgers ticket with Reds value',async()=>{
    const fixture=setup(); const prior=mocks.send.getMockImplementation();
    mocks.send.mockReset().mockResolvedValueOnce(response('INVESTIGATION COMPLETE')).mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response(stress)).mockResolvedValueOnce(response(price)).mockResolvedValueOnce(response(card(away))).mockImplementation(prior);
    await expect(fixture.run()).rejects.toThrow('Final MLB card changed');
  });
  it.each(['pass2','pass3','format-retry'])('refuses new source tools in %s after the recorded price assessment',async phase=>{
    const fixture=setup();
    mocks.create.mockResolvedValue({provider:'anthropic',modelName:'anthropic-claude-sonnet-5'});
    fixture.options.modelOverride='anthropic-claude-sonnet-5';
    mocks.send.mockReset().mockResolvedValueOnce(response('INVESTIGATION COMPLETE')).mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response(stress)).mockResolvedValueOnce(response(price));
    if(phase!=='pass2')mocks.send.mockResolvedValueOnce(response('The recorded home moneyline remains my call.'));
    if(phase==='format-retry')mocks.send.mockResolvedValueOnce({...response('Incomplete final output'),finishReason:'max_tokens'});
    mocks.send.mockResolvedValueOnce({content:'I will verify an additional stat before formatting.',finishReason:'tool_calls',toolCalls:[
      {id:'after-judgment',type:'function',function:{name:'fetch_stats',arguments:JSON.stringify({token:'MLB_BULLPEN_ERA',sport:'MLB'})}},
    ]});
    await expect(fixture.run()).rejects.toMatchObject({code:'mlb_judgment_locked_evidence'});
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.ask).toHaveBeenCalledTimes(1); // Only the recorded targeted research.
    expect(fixture.record.mock.calls.map(call=>call[0])).toEqual(['initial_commit','factual_research','stress_test','price_assessment']);
    expect(mocks.send.mock.calls.at(-1)[1]).toContain('FORMATTING FROM THE RECORDED SOURCES ONLY');
    expect(fixture.record.mock.calls[0][2].toolResponses).toEqual([]);
  });
  it('rejects a new text researcher request from the formatter without executing or silently ignoring it',async()=>{
    const fixture=setup();
    mocks.send.mockReset().mockResolvedValueOnce(response('INVESTIGATION COMPLETE')).mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response(stress)).mockResolvedValueOnce(response(price))
      .mockResolvedValueOnce(response('ASK RESEARCHER: Is there a new lineup change?'));
    await expect(fixture.run()).rejects.toMatchObject({code:'mlb_judgment_locked_evidence'});
    expect(mocks.ask).toHaveBeenCalledTimes(1); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('does not invite a malformed tool retry after the original judgment is locked',async()=>{
    const fixture=setup();
    mocks.send.mockReset().mockResolvedValueOnce(response('INVESTIGATION COMPLETE')).mockResolvedValueOnce(response(initial))
      .mockResolvedValueOnce(response(stress)).mockResolvedValueOnce(response(price))
      .mockRejectedValueOnce(new Error('MALFORMED_FUNCTION_CALL'));
    await expect(fixture.run()).rejects.toMatchObject({code:'mlb_judgment_locked_evidence'});
    expect(mocks.send).toHaveBeenCalledTimes(5); expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
