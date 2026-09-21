import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create:vi.fn(), send:vi.fn(), research:vi.fn(), followup:vi.fn(), audit:vi.fn(), stats:vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({ createModelSession:mocks.create, sendToSession:mocks.send, sendToSessionWithRetry:mocks.send }));
vi.mock('../../../src/services/agentic/orchestrator/researchBriefing.js', () => ({
  buildResearchBriefing:mocks.research,
  extractResearcherQuestions:(text,max=6) => [...String(text).matchAll(/^ASK RESEARCHER: (.+)$/gm)].slice(0,max).map(m=>m[1]),
  createResearcherFollowUpSession:vi.fn(async()=>({})), askResearcher:mocks.followup,
}));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({fetchStats:mocks.stats, clearStatRouterCache:vi.fn()}));
vi.mock('../../../src/services/agentic/orchestrator/statAudit.js', () => ({auditPickRationale:mocks.audit, auditCountClaims:()=>[], buildStatAuditRetryMessage:()=>{throw new Error('NFL must not rewrite a rationale');}}));
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';
import { buildNflSystemPrompt } from '../../../src/services/agentic/orchestrator/nflPrompts.js';
import { buildPass1Message } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { getConstitution } from '../../../src/services/agentic/constitution/index.js';
import { assertGamePickPublication } from '../../../src/services/gamePickPublication.js';

const home='Carolina Panthers', away='Atlanta Falcons';
const game={home_team:home,away_team:away,spread_home:-2.5,spread_away:2.5,spread_home_odds:-118,spread_away_odds:-104,moneyline_home:-148,moneyline_away:126};
const rationale='I prefer the available quarterback and protection matchup.\n\nThe opposing running game remains a risk';
const answer=(why=rationale)=>({content:JSON.stringify({final_pick:`${home} -2.5 -118`,rationale:why,confidence_score:0.55}),finishReason:'stop'});
const tool=token=>({content:'',toolCalls:[{id:`check-${token}`,function:{name:'fetch_stats',arguments:JSON.stringify({sport:'NFL',token})}}],finishReason:'tool_calls'});
const run=(options={})=>runAgentLoop(buildNflSystemPrompt(),buildPass1Message('original desk',home,away,'September 21, 2026','NFL',-2.5)+'\n'+getConstitution('NFL').pass1Context,'americanfootball_nfl',home,away,{spread:-2.5,game,...options});
const sentText=()=>mocks.send.mock.calls.map(([,p])=>typeof p==='string'?p:JSON.stringify(p)).join('\n');

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('GARY_RESEARCHER','on'); vi.stubEnv('GARY_NFL_BROWSE','0');
  mocks.create.mockResolvedValue({provider:'codex-cli', modelName:'codex-gpt-6-astra'});
  mocks.send.mockRejectedValue(new Error('Unexpected extra model turn'));
  mocks.stats.mockResolvedValue({home_value:'Fixture home evidence',away_value:'Fixture away evidence',summary:'Fixture evidence returned unchanged.'});
  mocks.audit.mockReturnValue({unsupported:[],retryable:[],checked:0});
  mocks.followup.mockResolvedValue('A dated source reports the current role.');
});
afterEach(() => vi.unstubAllEnvs());

describe('NFL original-answer flow', () => {
  it('accepts the first complete answer, without case essays or a second formatting turn',async()=>{
    mocks.send.mockResolvedValueOnce(answer());
    const result=await run({bilateralCasePrompt:()=> 'LEGACY CASE ESSAY MUST NOT RUN'});
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({pick:`${home} -2.5 -118`,rationale,confidence:0.55});
    expect(result.path_home).toBeUndefined();
    expect(result._fullAssistantNarrative).toBe(answer().content);
    const publication = {...result, league:'NFL', game_id:123, homeTeam:home, awayTeam:away, commence_time:'2026-09-21T23:00:00Z'};
    expect(() => assertGamePickPublication(publication, 'NFL')).not.toThrow();
    expect(publication.rationale).toBe(rationale);
    expect(sentText().match(/What's the best bet at the posted number and price, and why\?/g)).toHaveLength(1);
    expect(sentText()).not.toMatch(/LEGACY CASE|INVESTIGATION COMPLETE|PASS [123]|Gary's Take|announcer|copyedit/);
  });
  it('delivers the entire briefing before the question and preserves the original reasons byte-for-byte',async()=>{
    const briefing='Complete source '+ 'Evidence '.repeat(1500)+' FINAL SOURCE SENTENCE';
    const original='  My reasons:\n• The available personnel\n• This opponent’s protection\n\nUnknowns remain  ';
    mocks.send.mockResolvedValueOnce(answer(original));
    const result=await run({scoutReport:'original desk',prebuiltResearchBriefing:briefing});
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(sentText()).toContain(briefing);
    expect(sentText().indexOf('FINAL SOURCE SENTENCE')).toBeLessThan(sentText().indexOf("What's the best bet at the posted number and price"));
    expect(result.rationale).toBe(original);
    expect(result._researchBriefing).toBe(briefing);
    expect(mocks.research).not.toHaveBeenCalled();
  });
  it('keeps tools available and publishes the answer immediately after their results',async()=>{
    mocks.send.mockResolvedValueOnce(tool('WEATHER')).mockResolvedValueOnce(answer());
    const result=await run();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(Array.isArray(mocks.send.mock.calls[1][1])).toBe(true);
    expect(result.rationale).toBe(rationale);
    expect(result._originalToolResponses).toHaveLength(1);
    expect(sentText()).not.toMatch(/PASS 2|PASS 3|Case for|INVESTIGATION COMPLETE/);
  });
  it('never imposes a stage transition after several tool turns',async()=>{
    for(const token of ['WEATHER','QB_STATS','RB_STATS','INJURIES','REST_SITUATION','RECENT_FORM']) mocks.send.mockResolvedValueOnce(tool(token));
    mocks.send.mockResolvedValueOnce(answer());
    const result=await run();
    expect(result.pick).toBe(`${home} -2.5 -118`);
    expect(mocks.send).toHaveBeenCalledTimes(7);
    expect(sentText()).not.toMatch(/PASS [123]|Case for|INVESTIGATION COMPLETE|Do NOT request more/);
  });
  it('handles duplicate tool requests without commanding a synthesis or case review',async()=>{
    mocks.send.mockResolvedValueOnce(tool('WEATHER')).mockResolvedValueOnce(tool('WEATHER')).mockResolvedValueOnce(answer());
    const result=await run();
    expect(result.rationale).toBe(rationale);
    expect(mocks.stats).toHaveBeenCalledTimes(1);
    expect(sentText()).toContain('already represented');
    expect(sentText()).not.toMatch(/INVESTIGATION COMPLETE|Do NOT re-request|Case for/);
  });
  it('returns a researcher answer without case or completion-marker instructions',async()=>{
    mocks.send.mockResolvedValueOnce({content:'ASK RESEARCHER: Who is the reported starter?',finishReason:'stop'}).mockResolvedValueOnce(answer());
    const result=await run({scoutReport:'original desk',prebuiltResearchBriefing:'Dated original research'});
    expect(mocks.followup).toHaveBeenCalledTimes(1);
    expect(sentText()).toContain('A dated source reports the current role.');
    expect(sentText()).toContain('Researcher follow-ups remaining: 5.');
    expect(sentText()).not.toMatch(/Continue Pass 1|including both cases|INVESTIGATION COMPLETE/);
    expect(result.rationale).toBe(rationale);
  });
  it('retains diagnostic stat warnings without asking for a rewritten rationale',async()=>{
    mocks.audit.mockReturnValue({unsupported:['Unmatched figure'],retryable:['Unmatched figure'],checked:1});
    mocks.send.mockResolvedValueOnce(answer());
    const result=await run();
    expect(result.rationale).toBe(rationale);
    expect(result._statAuditWarnings).toEqual(['Unmatched figure']);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('offers web access without assigning an investigation method',async()=>{
    mocks.create.mockResolvedValue({provider:'codex-cli',modelName:'codex-gpt-6-astra',browse:true});
    mocks.send.mockResolvedValueOnce(answer());
    const result=await run({gameTime:'2026-09-21T23:00:00Z'});
    expect(result.rationale).toBe(rationale);
    expect(sentText()).toContain('Web search and page reading are available.');
    expect(sentText()).not.toMatch(/READING THE WEB|weigh what you read|Name the date|Nothing you read replaces/);
  });
});
