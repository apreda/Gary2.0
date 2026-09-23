import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ claude: vi.fn(), gpt: vi.fn(), deepseek: vi.fn() }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/claudeCliSession.js', () => ({ claudeCliWebSearch: calls.claude }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js', () => ({ codexCliWebSearch: calls.gpt }));
vi.mock('../../../src/services/agentic/orchestrator/providerAdapters/deepseekSession.js', () => ({ deepseekOneShot: calls.deepseek }));
vi.mock('../../../src/services/agentic/orchestrator/subscriptionRoutes.js', async (importOriginal) => ({ ...(await importOriginal()), subscriptionRoutes: () => [
  {id:'claude-subscription',model:'claude-sonnet-5'},
  {id:'business-gpt-0',model:'codex-gpt-5.6-sol'},
  {id:'personal-gpt',model:'codex-gpt-5.6-sol'},
  {id:'deepseek-last',model:'deepseek'},
] }));
import { subscriptionSearch } from '../../../src/services/agentic/orchestrator/subscriptionSearch.js';
beforeEach(() => {
  vi.resetAllMocks();
  calls.claude.mockResolvedValue({success:false,error:'capped'});
  calls.gpt.mockResolvedValue({success:false,error:'capped'});
  calls.deepseek.mockResolvedValue({success:true,data:'[{"kind":"moment"}]',raw:'{"type":"tool_result","content":"generated link"}'});
});
describe('subscription retrieval and supplied-context routing', () => {
  it('uses DeepSeek last for supplied facts, without treating its text as a retrieval receipt', async () => {
    const result=await subscriptionSearch('Supplied verified recap notes.',{requireRetrieval:false});
    expect(result).toMatchObject({success:true,transport:'deepseek-last',raw:null});
    const order=[calls.claude.mock.invocationCallOrder[0],...calls.gpt.mock.invocationCallOrder,calls.deepseek.mock.invocationCallOrder[0]];
    expect(order).toEqual([...order].sort((a,b)=>a-b));
    expect(calls.gpt).toHaveBeenCalledTimes(2);
  });
  it('keeps outside research unavailable when no subscription retrieves it', async () => {
    expect(await subscriptionSearch('Find current outside reporting.')).toMatchObject({success:false,error:expect.stringContaining('DeepSeek has no configured search transport')});
    expect(calls.deepseek).not.toHaveBeenCalled();
  });
  it('does not spend on DeepSeek when the personal subscription completes the supplied-data task', async () => {
    calls.gpt.mockResolvedValueOnce({success:false,error:'capped'}).mockResolvedValueOnce({success:true,data:'[{"kind":"moment"}]',raw:[]});
    expect(await subscriptionSearch('Supplied recap.',{requireRetrieval:false})).toMatchObject({success:true,transport:'personal-gpt'});
    expect(calls.deepseek).not.toHaveBeenCalled();
  });
});
