import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({claude:vi.fn(),codex:vi.fn()}));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js',()=>({claudeCliWebSearch:m.claude}));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js',()=>({codexCliWebSearch:m.codex}));
import {searchGrounded} from '../../../src/services/insights/ncaafSearch.js';
beforeEach(()=>{vi.clearAllMocks();m.claude.mockResolvedValue({success:false,error:'Claude capped'});m.codex.mockResolvedValue({success:false,error:'GPT capped'});});
describe('college subscription search',()=>{
 it('uses Claude subscription first and retains actual transport evidence',async()=>{m.claude.mockResolvedValue({success:true,data:'Verified source report',raw:[{type:'web_search_result',url:'https://school.edu'}]});const r=await searchGrounded('research');expect(r.transport).toBe('claude-subscription');expect(r.raw).toHaveLength(1);expect(m.codex).not.toHaveBeenCalled();});
 it('tries both GPT accounts in order after Claude fails',async()=>{m.codex.mockResolvedValueOnce({success:false,error:'Plus capped'}).mockResolvedValueOnce({success:true,data:'Verified report'});expect(await searchGrounded('research')).toMatchObject({success:true,transport:'personal-gpt'});expect(m.codex.mock.calls[0][1].codexHomes[0]).toContain('.codex-plus');expect(m.codex.mock.calls[1][1].allowPersonalAccount).toBe(true);});
 it('returns source failure reasons instead of an empty healthy report',async()=>{const r=await searchGrounded('research');expect(r.success).toBe(false);expect(r.error).toContain('Claude capped');expect(r.error).toContain('personal-gpt: GPT capped');expect(r.data).toBeNull();});
});
