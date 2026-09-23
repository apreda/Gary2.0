import {it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({create:vi.fn(),send:vi.fn(),reset:vi.fn()}));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js',()=>({createModelSession:m.create,sendToSessionWithRetry:m.send,resetSessionChat:m.reset}));
import {createJuneResearchSession,sendToJuneResearchSession,JUNE_RESEARCH_MODELS} from '../../../src/services/agentic/orchestrator/juneResearchSession.js';
it('delegates unchanged June conversation and tools to the subscription/account cascade',async()=>{
 expect(JUNE_RESEARCH_MODELS).toEqual(['claude-opus-5-5']);m.create.mockResolvedValue({});m.send.mockResolvedValue({content:'Verified report'});
 const s=await createJuneResearchSession({systemPrompt:'June system',tools:[{name:'source'}]});expect(await sendToJuneResearchSession(s,'Original question')).toMatchObject({content:'Verified report'});expect(m.create.mock.calls[0][0]).toMatchObject({modelName:'claude-sonnet-5',systemPrompt:'June system',tools:[{name:'source'}]});expect(m.send.mock.calls[0][1]).toBe('Original question');
});
