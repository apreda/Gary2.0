import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const search=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/services/agentic/orchestrator/subscriptionSearch.js',()=>({subscriptionSearch:search}));
import {openaiWebSearch} from '../../../src/services/pickdesk/webSearch.js';
import {withPickDataIntegrity} from '../../../src/services/pickDataIntegrity.js';
beforeEach(()=>{vi.stubEnv('GARY_SEARCH_CACHE_OFF','1');search.mockReset();});afterEach(()=>vi.unstubAllEnvs());
it('keeps the date and source instructions and returns exact retrieved evidence',async()=>{search.mockResolvedValue({success:true,data:'Verified source',raw:{source:'receipt'}});expect(await openaiWebSearch('Seattle today')).toMatchObject({data:'Verified source',raw:{source:'receipt'}});expect(search.mock.calls[0][0]).toContain('Seattle today');expect(search.mock.calls[0][0]).toContain('Today is ');});
it('a search that cannot run comes back unavailable, never as no news, and the pick goes ahead with the gap logged (Sep 25 2026)',async()=>{search.mockResolvedValue({success:false,data:null,error:'all subscriptions unavailable'});const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});const result=await withPickDataIntegrity(()=>openaiWebSearch('news'));expect(result.success).toBe(false);expect(warn.mock.calls.flat().join(' ')).toContain('DATA GAP: current_reporting');warn.mockRestore();});
