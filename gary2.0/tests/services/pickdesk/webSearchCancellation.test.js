import {it,expect,vi} from 'vitest';
const search=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/services/agentic/orchestrator/subscriptionSearch.js',()=>({subscriptionSearch:search}));
import {openaiWebSearch} from '../../../src/services/pickdesk/webSearch.js';
import {withRequestSignal} from '../../../src/services/agentic/orchestrator/requestCancellation.js';
it('cancels before any search and propagates cancellation inside an active retrieval',async()=>{
 vi.stubEnv('GARY_SEARCH_CACHE_OFF','1');const c=new AbortController();c.abort();await expect(openaiWebSearch('query',{signal:c.signal})).rejects.toMatchObject({name:'AbortError'});expect(search).not.toHaveBeenCalled();
 const active=new AbortController();search.mockImplementation(async(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true})));
 const task=withRequestSignal(active.signal,()=>openaiWebSearch('query'));const stopped=expect(task).rejects.toMatchObject({name:'AbortError'});active.abort();await stopped;vi.unstubAllEnvs();
});
