import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const search=vi.hoisted(()=>vi.fn());
vi.mock('../../../src/services/agentic/orchestrator/subscriptionSearch.js',()=>({subscriptionSearch:search}));
import {openaiWebSearch} from '../../../src/services/pickdesk/webSearch.js';
import {withPickDataIntegrity} from '../../../src/services/pickDataIntegrity.js';
beforeEach(()=>{vi.stubEnv('GARY_SEARCH_CACHE_OFF','1');search.mockReset();});afterEach(()=>vi.unstubAllEnvs());
it('keeps the date and source instructions and returns exact retrieved evidence',async()=>{search.mockResolvedValue({success:true,data:'Verified source',raw:{source:'receipt'}});expect(await openaiWebSearch('Seattle today')).toMatchObject({data:'Verified source',raw:{source:'receipt'}});expect(search.mock.calls[0][0]).toContain('Seattle today');expect(search.mock.calls[0][0]).toContain('<date_anchor>');});
it('records source failure so a pick cannot pass it off as no news',async()=>{search.mockResolvedValue({success:false,data:null,error:'all subscriptions unavailable'});await expect(withPickDataIntegrity(()=>openaiWebSearch('news'))).rejects.toMatchObject({code:'required_data_unavailable'});});
