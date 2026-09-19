import {it,expect,vi} from 'vitest';
import {createAnthropicApiSession,sendToAnthropicApiSession} from '../../../src/services/agentic/orchestrator/providerAdapters/anthropicApiSession.js';
import {createOpenAISession,sendToOpenAISession} from '../../../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';
import {anthropicWebSearchRaw} from '../../../src/services/agentic/scoutReport/shared/anthropicWebSearch.js';
it('refuses retired metered transports before any network request, including pre-existing sessions',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 try {for(const fn of [createAnthropicApiSession,sendToAnthropicApiSession,createOpenAISession,sendToOpenAISession]) expect(()=>fn({})).toThrow('BILLING_POLICY');await expect(anthropicWebSearchRaw('query')).rejects.toThrow('BILLING_POLICY');expect(fetch).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
});
