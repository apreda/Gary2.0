import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),send:vi.fn(),reset:vi.fn(),fetch:vi.fn(),search:vi.fn()}));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js',()=>({createModelSession:mocks.create,sendToSessionWithRetry:mocks.send,resetSessionChat:mocks.reset}));
vi.mock('../../../src/services/agentic/flashInvestigationPrompts.js',()=>({getFlashInvestigationPrompt:()=>''}));
vi.mock('../../../src/services/agentic/orchestrator/spreadEvaluationFactors.js',()=>({getMlbSeasonAwareness:()=>''}));
vi.mock('../../../src/services/agentic/orchestrator/investigationFactors.js',()=>({INVESTIGATION_FACTORS:{baseball_mlb:{FIRST:['MLB_WEATHER'],SECOND:['MLB_WEATHER']}}}));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js',()=>({fetchStats:mocks.fetch}));
vi.mock('../../../src/services/pickdesk/webSearch.js',()=>({openaiWebSearch:mocks.search}));
vi.mock('../../../src/services/ballDontLieService.js',()=>({ballDontLieService:{}}));
vi.mock('../../../src/services/agentic/scoutReport/scoutReportBuilder.js',()=>({groundedWebSearch:vi.fn()}));
const {buildResearchBriefing,renderFindingsSoFar,createResearcherFollowUpSession,askResearcher}=await import('../../../src/services/agentic/orchestrator/researchBriefing.js');
const {renderEvidenceBriefing,COMPACT_RESEARCH_LIMITS}=await import('../../../src/services/agentic/orchestrator/evidenceQuality.js');
const huge={factor:'First factor',keyFinding:'interpretation '+ 'I'.repeat(9000),numbers:'2026 dated facts '+ 'N'.repeat(9000),context:'three dated games '+ 'C'.repeat(9000),sources:'MLB_WEATHER token '+ 'S'.repeat(9000),uncertainties:'sample conflict '+ 'U'.repeat(9000)};
const tool={toolCalls:[{function:{name:'fetch_stats',arguments:JSON.stringify({token:'MLB_WEATHER'})}}]};
const options=(signal)=>({signal,gameTime:'2026-09-05T02:00:00Z',researchModel:'codex-gpt-5.6-luna'});
beforeEach(()=>{vi.resetAllMocks();mocks.create.mockResolvedValue({provider:'codex-cli',tools:[]});});
describe('compact research carry-forward',()=>{
  it('bounds prior-factor content to the old 740-character budget while retaining provenance labels',()=>{
    expect(Object.values(COMPACT_RESEARCH_LIMITS).reduce((a,b)=>a+b,0)).toBe(740);
    const carry=renderFindingsSoFar([huge],true);
    expect(carry.length).toBeLessThan(1200);
    for(const text of ['interpretation','2026 dated facts','three dated games','MLB_WEATHER token','sample conflict'])expect(carry).toContain(text);
    expect(carry).toContain('compact excerpts');
    const full=renderEvidenceBriefing([huge]);
    expect(full.length).toBeGreaterThan(45000);
    expect(full).toContain(huge.uncertainties);
    expect(huge.keyFinding.length).toBeGreaterThan(9000);
  });
  it('does not deduplicate different full findings just because their compact prefixes match',()=>{
    const text=renderEvidenceBriefing([huge,{...huge,factor:'Different',numbers:huge.numbers+' a different ending'}],{compact:true});
    expect(text).not.toContain('Repeats the same research');
    expect(text).toContain('**Different**');
  });
  it('leaves the NBA legacy carry-forward field budgets unchanged',()=>{
    const text=renderFindingsSoFar([huge],false);
    expect(text).toContain('Key finding: '+huge.keyFinding.slice(0,260));
    expect(text).toContain('Numbers: '+huge.numbers.slice(0,260));
    expect(text).toContain('Context: '+huge.context.slice(0,220));
    expect(text.length).toBeLessThan(1000);
  });
  it('actually seeds the next factor compactly while returning every complete original finding',async()=>{
    mocks.send.mockResolvedValueOnce({content:JSON.stringify(huge)}).mockResolvedValueOnce({content:JSON.stringify({...huge,factor:'Second factor',numbers:huge.numbers+' different'})});
    const output=await buildResearchBriefing('original desk','baseball_mlb','H','A',options());
    const firstSeed=mocks.reset.mock.calls[0][1][0].parts[0].text;
    const secondSeed=mocks.reset.mock.calls[1][1][0].parts[0].text;
    expect(secondSeed.length-firstSeed.length).toBeLessThan(1200);
    expect(secondSeed).toContain('MLB_WEATHER token');
    expect(output.briefing).toContain(huge.uncertainties);
    expect(output.briefing).toContain(huge.numbers+' different');
    expect(output.briefing.length).toBeGreaterThan(90000);
  });
});
describe('research cancellation boundaries',()=>{
  it('does no work after an already-aborted request',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(buildResearchBriefing('original desk','baseball_mlb','H','A',options(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('forwards the signal and never executes tool calls returned by an aborted model request',async()=>{
    const controller=new AbortController();
    mocks.send.mockImplementation(async(_session,_message,callOptions)=>{expect(callOptions.signal).toBe(controller.signal);controller.abort();return tool;});
    await expect(buildResearchBriefing('original desk','baseball_mlb','H','A',options(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('does not resume the model, next tool, or later factors after an aborted stat request',async()=>{
    const controller=new AbortController();
    mocks.send.mockResolvedValue(tool);
    mocks.fetch.mockImplementation(async()=>{controller.abort();return {data:'too late'};});
    await expect(buildResearchBriefing('original desk','baseball_mlb','H','A',options(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.fetch).toHaveBeenCalledTimes(1);expect(mocks.reset).toHaveBeenCalledTimes(1);
  });
});

describe('ASK RESEARCHER cancellation boundaries',()=>{
  const followupOptions=(signal)=>({sport:'baseball_mlb',homeTeam:'H',awayTeam:'A',signal,options:{gameTime:'2026-09-05T02:00:00Z'}});
  it('rejects an already-aborted follow-up before session creation or model work',async()=>{
    const controller=new AbortController();controller.abort();
    await expect(createResearcherFollowUpSession(followupOptions(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    await expect(askResearcher({},['Weather?'],followupOptions(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
  });
  it('forwards session cancellation and rejects a session returned after the deadline',async()=>{
    const controller=new AbortController();
    mocks.create.mockImplementation(async(callOptions)=>{expect(callOptions.signal).toBe(controller.signal);controller.abort();return {};});
    await expect(createResearcherFollowUpSession(followupOptions(controller.signal))).rejects.toMatchObject({name:'AbortError'});
  });
  it('never runs tools returned after the model request is cancelled',async()=>{
    const controller=new AbortController();
    mocks.send.mockImplementation(async(_session,_message,callOptions)=>{expect(callOptions.signal).toBe(controller.signal);controller.abort();return tool;});
    await expect(askResearcher({},['Weather?'],followupOptions(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('stops before a second tool or model round when stat work completes after cancellation',async()=>{
    const controller=new AbortController();
    mocks.send.mockResolvedValue({toolCalls:[...tool.toolCalls,...tool.toolCalls]});
    mocks.fetch.mockImplementation(async(_sport,_token,_home,_away,callOptions)=>{expect(callOptions.signal).toBe(controller.signal);expect(callOptions.gameTime).toBe('2026-09-05T02:00:00Z');controller.abort();return {data:'late'};});
    await expect(askResearcher({},['Weather?'],followupOptions(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.fetch).toHaveBeenCalledTimes(1);expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('propagates grounding AbortError instead of turning it into a tool result',async()=>{
    const controller=new AbortController();
    mocks.send.mockResolvedValue({toolCalls:[{function:{name:'fetch_narrative_context',arguments:JSON.stringify({query:'Weather?'})}}]});
    mocks.search.mockImplementation(async(_query,callOptions)=>{expect(callOptions.signal).toBe(controller.signal);throw new DOMException('Cancelled','AbortError');});
    await expect(askResearcher({},['Weather?'],followupOptions(controller.signal))).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.search).toHaveBeenCalledTimes(1);expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('propagates stat AbortError even if the parent signal has not fired',async()=>{
    mocks.send.mockResolvedValue(tool);
    mocks.fetch.mockRejectedValue(new DOMException('Cancelled','AbortError'));
    await expect(askResearcher({},['Weather?'],followupOptions())).rejects.toMatchObject({name:'AbortError'});
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('uses options.signal and refreshes a reused session with the current cancellation scope',async()=>{
    const stale=new AbortController();stale.abort();
    const current=new AbortController();const session={signal:stale.signal};
    mocks.send.mockResolvedValue({content:'1. Clear skies.'});
    await expect(askResearcher(session,['Weather?'],{...followupOptions(),options:{signal:current.signal}})).resolves.toBe('1. Clear skies.');
    expect(session.signal).toBe(current.signal);
    expect(mocks.send.mock.calls[0][2].signal).toBe(current.signal);
  });
});
