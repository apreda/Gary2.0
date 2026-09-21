import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create:vi.fn(), send:vi.fn(), research:vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({ createModelSession:mocks.create, sendToSession:mocks.send, sendToSessionWithRetry:mocks.send }));
vi.mock('../../../src/services/agentic/orchestrator/researchBriefing.js', () => ({ buildResearchBriefing:mocks.research, extractResearcherQuestions:() => [], createResearcherFollowUpSession:vi.fn(), askResearcher:vi.fn() }));
vi.mock('../../../src/services/agentic/tools/statRouters/index.js', () => ({fetchStats:vi.fn(async()=>({summary:'Weather unchanged in the supplied fixture.'})),clearStatRouterCache:vi.fn()}));
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';
import { buildNflSystemPrompt } from '../../../src/services/agentic/orchestrator/nflNbaPrompts.js';
import { buildPass1Message } from '../../../src/services/agentic/orchestrator/passBuilders.js';
import { getConstitution } from '../../../src/services/agentic/constitution/index.js';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('GARY_RESEARCHER','on'); vi.stubEnv('GARY_NFL_BROWSE','0');
  mocks.create.mockResolvedValue({provider:'codex-cli', modelName:'codex-gpt-6-astra'});
});
afterEach(() => vi.unstubAllEnvs());

describe('NFL actual decision loop', () => {
  it('delivers a decision-stage tool result before completing the decision and formatting it',async()=>{
    const home='Carolina Panthers',away='Atlanta Falcons';
    const rationale='The current personnel, broader body of work and different opposing assignments support my choice. The other team has a legitimate countercase, including potential improvement from its opening performance, but I prefer this side after considering the full matchup. '.repeat(5).trim();
    mocks.send.mockResolvedValueOnce({content:`Case for ${home}\n${rationale}\n\nCase for ${away}\n${rationale}\n\nINVESTIGATION COMPLETE`,finishReason:'stop'})
      .mockResolvedValueOnce({content:'',toolCalls:[{id:'weather-check',function:{name:'fetch_stats',arguments:JSON.stringify({sport:'NFL',token:'WEATHER'})}}],finishReason:'tool_calls'})
      .mockResolvedValueOnce({content:`Final Decision: ${home} -2.5 (-118)\n\n${rationale}`,finishReason:'stop'})
      .mockResolvedValueOnce({content:JSON.stringify({final_pick:`${home} -2.5 -118`,rationale,confidence_score:0.55}),finishReason:'stop'});
    const result=await runAgentLoop('system','original desk','NFL',home,away,{spread:-2.5,game:{home_team:home,away_team:away,spread_home:-2.5,spread_away:2.5,spread_home_odds:-118,spread_away_odds:-104}});
    expect(mocks.send).toHaveBeenCalledTimes(4);
    expect(mocks.send.mock.calls[1][1]).toContain('Do NOT output JSON yet.');
    expect(Array.isArray(mocks.send.mock.calls[2][1])).toBe(true);
    expect(mocks.send.mock.calls[3][1]).toContain('PASS 3 - FORMAT ONLY');
    expect(result.pick).toBe(`${home} -2.5 -118`);
  });
  it('delivers complete research, considers both sides and formats after the separate decision even if JSON appears early', async () => {
    const home='Carolina Panthers', away='Atlanta Falcons';
    const constitution=getConstitution('NFL');
    const rationale='My assessment uses the current available personnel, the established coaching context and the different assignments facing both teams. The opponent has a credible counterargument, but I judge the full matchup to support this side. I considered the same possibilities for improvement and deterioration for each team. This is a judgment about this game rather than a guarantee that the previous result repeats. '.repeat(3).trim();
    const json=JSON.stringify({final_pick:`${home} -2.5 -118`,rationale,confidence_score:0.55});
    mocks.send.mockResolvedValueOnce({content:`Case for ${home}\n${rationale}\n\nCase for ${away}\n${rationale}\n\nINVESTIGATION COMPLETE`,finishReason:'stop'})
      .mockResolvedValueOnce({content:`Final Decision: ${home} -2.5 (-118)\n\nGary's Take\n\n${rationale}\n\n${json}`,finishReason:'stop'})
      .mockResolvedValueOnce({content:json,finishReason:'stop'});
    const briefing='Complete source reference and attributed assessment. '+ 'Evidence '.repeat(1500)+' FINAL SOURCE SENTENCE';
    const result=await runAgentLoop(buildNflSystemPrompt(constitution),buildPass1Message('original desk',home,away,'September 20, 2026','NFL',-2.5),'americanfootball_nfl',home,away,{
      modelOverride:'codex-gpt-6-astra',scoutReport:'original desk',prebuiltResearchBriefing:briefing,spread:-2.5,
      bilateralCasePrompt:constitution.bilateralCasePrompt,
      game:{home_team:home,away_team:away,spread_home:-2.5,spread_away:2.5,spread_home_odds:-118,spread_away_odds:-104,moneyline_home:-148,moneyline_away:126},
    });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls[0][1]).toContain(briefing);
    expect(mocks.send.mock.calls[1][1]).toContain('Do NOT output JSON yet.');
    expect(mocks.send.mock.calls[2][1]).toContain('PASS 3 - FORMAT ONLY');
    expect(mocks.send.mock.calls[2][1]).toContain('Preserve the spread or moneyline decision already made');
    expect(result.pick).toContain(home);
    expect(result.odds).toBe(-118);
    expect(result._researchBriefing).toBe(briefing);
    expect(result.path_home).toContain(rationale);
    expect(result.path_away).toContain(rationale);
  });
});
