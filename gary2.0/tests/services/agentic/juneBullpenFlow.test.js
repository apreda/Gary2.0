import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), fetch: vi.fn() }));
vi.mock('../../../src/services/agentic/mlbJuneEra/sessionManager.js', () => ({
  createGeminiSession: mocks.create, sendToSessionWithRetry: mocks.send, sendToSession: mocks.send,
}));
vi.mock('../../../src/services/agentic/mlbJuneEra/tools/statRouters/index.js', () => ({ fetchStats: mocks.fetch, clearStatRouterCache: vi.fn() }));
vi.mock('../../../src/services/agentic/mlbJuneEra/orchestratorHelpers.js', async original => ({
  ...await original(), pruneContextIfNeeded: messages => messages.filter(m => m.role !== 'tool'),
}));
import { runAgentLoop } from '../../../src/services/agentic/mlbJuneEra/agentLoop.js';
import { originalGameEvidence } from '../../../src/services/pickdesk/originalGameEvidence.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';

const reply = content => ({ content, toolCalls: null, finishReason: 'stop' });
const call = (token, id) => ({ content: '', finishReason:'tool_calls', toolCalls:[{id,type:'function',function:{name:'fetch_stats',arguments:JSON.stringify({token,sport:'MLB'})}}] });
const game = {home_team:'Home',away_team:'Away',moneyline_home:-110,moneyline_away:105,spread_home:-1.5,spread_home_odds:150};
const card = JSON.stringify({pick:'Home ML (-110)',bet_type:'moneyline',confidence_score:60,
  rationale:'The home starter can limit the relief innings needed, while the visitors have a path through their offense. Bullpen availability remains unknown; reported workload alone does not establish clearance. '.repeat(6)});
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console,'log').mockImplementation(()=>{}); });
afterEach(() => vi.restoreAllMocks());

describe('the active MLB June research and decision flow', () => {
  it('returns the requested recent player games in both research and the decision, not an entire season', async () => {
    const rows=Array.from({length:145},(_,i)=>({game_id:i,player:{id:9,first_name:'Exact',last_name:'Player'},games_started:0,ip:'0.0',er:0,
      _game:{date:new Date(Date.now()-(146-i)*86400000).toISOString(),status:'STATUS_FINAL'}}));
    vi.spyOn(ballDontLieService,'getPlayersGeneric').mockResolvedValue([{id:9,first_name:'Exact',last_name:'Player',team:{name:'Home'}}]);
    vi.spyOn(ballDontLieService,'getMlbPlayerGameRowsChrono').mockResolvedValue(rows);
    let sessions=0,researchTool=false,brainStep=0;
    mocks.create.mockImplementation(async o=>({...o,kind:sessions++===0?'brain':'research',provider:'codex-cli'}));
    const logs=count=>({content:'',finishReason:'tool_calls',toolCalls:[{id:`games-${count}`,type:'function',function:{name:'fetch_player_game_logs',arguments:JSON.stringify({sport:'MLB',player_name:'Exact Player',num_games:count})}}]});
    mocks.send.mockImplementation(async (session,message)=>{
      if(session.kind==='research') {
        if(typeof message==='string' && message.startsWith('Investigate factor:') && !researchTool){researchTool=true;return logs(5);}
        return reply(JSON.stringify({factor:'Recent games',keyFinding:'Dated game rows',numbers:'No invented values',context:'Requested recent sample'}));
      }
      if(brainStep++===0)return logs(2);
      if(brainStep===2)return reply('Both teams considered.\nINVESTIGATION COMPLETE');
      return reply(card);
    });
    const result=await runAgentLoop('June system','Original scout','baseball_mlb','Home','Away',{game,scoutReport:'Original scout',spread:-1.5});
    expect(result.error).toBeUndefined();
    const received=result._originalToolResponses.map(r=>JSON.parse(r.content.slice(r.content.indexOf('\n')+1)).games);
    expect(received).toEqual([rows.slice(-5).reverse(),rows.slice(-2).reverse()]);
  });
  it.each([true,false])('saves exact research and decision responses through context pruning, early exit %s', async early => {
    let sessions=0, researchTool=false, brainStep=0;
    mocks.create.mockImplementation(async o=>({...o,kind:sessions++===0?'brain':'research',provider:'codex-cli'}));
    mocks.fetch.mockImplementation(async (_sport,token,_h,_a,options)=>({
      homeValue:`ALL HOME ARMS ${token}: Arm 1 through Arm 9; 2026-09-13 and 2026-09-15 separated by an off-day.`,
      awayValue:'ALL AWAY ARMS through the final pitcher. Availability UNKNOWN.',
      source:'Fixture StatsAPI',cutoff:options.bullpenSnapshot.cutoff,
    }));
    mocks.send.mockImplementation(async (session, message) => {
      if(session.kind==='research') {
        if(typeof message==='string' && message.startsWith('Investigate factor:') && !researchTool) { researchTool=true;return call('MLB_BULLPEN','research-pen'); }
        return reply(JSON.stringify({factor:'Observed evidence',keyFinding:'Availability UNKNOWN',numbers:'Dated source observations',context:'No inferred clearance.'}));
      }
      const step=brainStep++;
      if(step===0)return call('MLB_CLOSER_RELIEVER_STATS','decision-pen');
      if(step===1)return reply('Both teams have plausible paths through their starter and lineup. Bullpen workload dates are observations; clearance remains unknown.\nINVESTIGATION COMPLETE');
      if(step===2 && !early)return reply('Evaluation complete; proceed to the final decision.');
      return reply(card);
    });
    const snapshot={version:'bullpen-game-evidence-v2',cutoff:'2026-09-16T16:00:00Z',home:{pitchers:[{id:9,availability:'unknown'}]}};
    const result=await runAgentLoop('June system','Original scout with every arm','baseball_mlb','Home','Away',{
      game,scoutReport:'Original scout with every arm',bullpenSnapshot:snapshot,spread:-1.5,
    });
    expect(result.error).toBeUndefined();
    expect(result._originalToolResponses.map(r=>r.phase)).toEqual(['research','decision']);
    const delivered=mocks.send.mock.calls.filter(c=>Array.isArray(c[1])).flatMap(c=>c[1]);
    for(const receipt of result._originalToolResponses)expect(delivered.some(r=>r.content===receipt.content)).toBe(true);
    expect(result._originalToolResponses[1]).toMatchObject({toolCallId:'decision-pen'});
    expect(result._originalToolResponses[0].content).toContain('final pitcher');
    expect(mocks.fetch.mock.calls.every(c=>c[4].bullpenSnapshot===snapshot)).toBe(true);
    expect(mocks.create.mock.calls[0][0].systemPrompt).toContain('Two games separated by an off-day');
    result._context={bullpenSnapshot:snapshot};
    const saved=originalGameEvidence({result,pick:result,deskText:'Original scout'});
    snapshot.home.pitchers[0].availability='MUTATED'; result._originalToolResponses[0].content='MUTATED';
    expect(saved.bullpenSnapshot.home.pitchers[0].availability).toBe('unknown');
    expect(saved.toolResponses[0].content).toContain('final pitcher');
  });
});
