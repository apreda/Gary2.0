import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),send:vi.fn()}));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js',()=>({createModelSession:mocks.create,sendToSession:mocks.send,sendToSessionWithRetry:mocks.send}));
import { runAgentLoop } from '../../../src/services/agentic/orchestrator/agentLoop.js';
import { parseGaryResponse, normalizePickFormat } from '../../../src/services/agentic/orchestrator/responseParser.js';
const home='Dallas Cowboys',away='New York Giants';
const game={home_team:home,away_team:away,spread_home:-3.5,spread_away:3.5,spread_home_odds:-110,spread_away_odds:-105,moneyline_home:-200,moneyline_away:160};
const rationale='The quarterback matchup is why I prefer Dallas';
const card=extra=>JSON.stringify({final_pick:'Dallas Cowboys -3.5 -110',confidence_score:0.63,rationale,...extra});
const run=()=>runAgentLoop('system','Original NFL desk','americanfootball_nfl',home,away,{game,spread:-3.5});
beforeEach(()=>{
  vi.resetAllMocks(); vi.stubEnv('GARY_RESEARCHER','off');
  mocks.create.mockResolvedValue({provider:'codex-cli',modelName:'codex-gpt-6-astra'});
  mocks.send.mockRejectedValue(new Error('Unexpected rewrite turn'));
});
afterEach(()=>vi.unstubAllEnvs());

describe('NFL does not commission replacement rationales',()=>{
  it.each(['NFL','americanfootball_nfl'])('accepts short original reasons without a heading or terminal punctuation (%s)',sport=>{
    expect(parseGaryResponse(card(),home,away,sport,game).rationale).toBe(rationale);
  });
  it('leaves other sports minimum-length validation unchanged',()=>{
    for(const sport of ['NBA','NCAAF','MLB']) expect(normalizePickFormat(JSON.parse(card()),home,away,sport,game)).toBeNull();
  });
  it.each([
    ['provider cutoff',card(),'max_tokens','final_output_truncated'],
    ['empty answer','','stop','empty_answer'],
    ['malformed JSON','{"final_pick":"Dallas Cowboys -3.5 -110","rationale":"unfinished','stop','invalid_final_answer'],
    ['missing rationale',card({rationale:''}),'stop','invalid_final_answer'],
    ['non-text rationale',card({rationale:{reason:'matchup'}}),'stop','invalid_final_answer'],
    ['non-text ticket',card({final_pick:123}),'stop','invalid_final_answer'],
    ['non-side market',card({type:'total',final_pick:'Over 45.5 -110'}),'stop','invalid_final_answer'],
    ['placeholder',card({rationale:'TBD'}),'stop','invalid_final_answer'],
    ['non-ticket prose','I am still considering the game.','stop','invalid_final_answer'],
    ['ineligible moneyline',card({final_pick:'Dallas Cowboys ML -200'}),'stop','moneyline_limit'],
  ])('reports %s without publishing or rewriting',async(_label,content,finishReason,code)=>{
    mocks.send.mockResolvedValueOnce({content,finishReason});
    const result=await run();
    expect(result.code).toBe(code);
    expect(result.pick).toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not alter an answer containing braces, quotes, line breaks or a formerly forbidden phrase',()=>{
    const original='  Key factors:\nThe report says "uncertain"; {availability} remains unresolved.\nMy judgment is not a fact  ';
    expect(parseGaryResponse(card({rationale:original}),home,away,'NFL',game).rationale).toBe(original);
  });
  it('rejects conflicting final objects rather than selecting a convenient answer',()=>{
    expect(parseGaryResponse(card()+'\n'+card({final_pick:'New York Giants +3.5 -105'}),home,away,'NFL',game)).toBeNull();
  });
});
