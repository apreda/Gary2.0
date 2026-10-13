import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({claude:vi.fn(),codex:vi.fn()}));
vi.mock('../../../src/services/gary/agentic/orchestrator/providerAdapters/claudeCliSession.js',()=>({claudeCliWebSearch:m.claude}));
vi.mock('../../../src/services/gary/agentic/orchestrator/providerAdapters/codexCliSession.js',()=>({codexCliWebSearch:m.codex}));
import {searchGrounded} from '../../../src/services/content/insights/ncaafSearch.js';
beforeEach(()=>{vi.clearAllMocks();m.claude.mockResolvedValue({success:false,error:'Claude capped'});m.codex.mockResolvedValue({success:false,error:'GPT capped'});});
// College context searches are background work (founder, Oct 1 2026): GPT 6.1
// Sol on the business login, then the personal login, then Claude Opus last.
describe('college subscription search',()=>{
 it('uses the business GPT login first and retains actual transport evidence',async()=>{m.codex.mockResolvedValueOnce({success:true,data:'Verified source report',raw:[{type:'web_search_result',url:'https://school.edu'}]});const r=await searchGrounded('research');expect(r.transport).toBe('business-gpt-0');expect(r.raw).toHaveLength(1);expect(m.codex).toHaveBeenCalledTimes(1);expect(m.codex.mock.calls[0][1].codexHomes[0]).toContain('.codex-plus');expect(m.claude).not.toHaveBeenCalled();});
 it('tries both GPT accounts in order, then Claude only behind them',async()=>{m.claude.mockResolvedValueOnce({success:true,data:'Verified source report',raw:[{type:'web_search_result',url:'https://school.edu'}]});expect(await searchGrounded('research')).toMatchObject({success:true,transport:'claude-subscription'});expect(m.codex).toHaveBeenCalledTimes(2);expect(m.codex.mock.calls[0][1].codexHomes[0]).toContain('.codex-plus');expect(m.codex.mock.calls[1][1].allowPersonalAccount).toBe(true);expect(m.claude).toHaveBeenCalledTimes(1);expect(m.claude.mock.invocationCallOrder[0]).toBeGreaterThan(m.codex.mock.invocationCallOrder[1]);});
 it('returns source failure reasons instead of an empty healthy report',async()=>{const r=await searchGrounded('research');expect(r.success).toBe(false);expect(r.error).toContain('personal-gpt: GPT capped');expect(r.error).toContain('claude-subscription: Claude capped');expect(r.data).toBeNull();});
});
