import {beforeEach,describe,it,expect,vi} from 'vitest';
import {readFile, access} from 'node:fs/promises';
const m=vi.hoisted(()=>({text:vi.fn(),search:vi.fn(),vision:vi.fn()}));
vi.mock('../../src/services/agentic/orchestrator/modelCascade.js',()=>({cascadeRead:m.text}));
vi.mock('../../src/services/agentic/orchestrator/subscriptionSearch.js',()=>({subscriptionSearch:m.search}));
vi.mock('../../src/services/agentic/orchestrator/providerAdapters/codexCliSession.js',()=>({codexCliOneShot:m.vision}));
import {executeCloudModelJob} from '../../src/services/cloudModelJob.js';
const job=request=>({id:'fixture',request,expires_at:new Date(Date.now()+120000).toISOString()});
beforeEach(()=>vi.resetAllMocks());
describe('cloud subscription job contract',()=>{
 it('retains forced output-tool shape for the existing social writer',async()=>{
  m.text.mockResolvedValue({success:true,data:'{"opening":"first","closing":"second"}',model:'codex-gpt-5.6-terra',accountRoute:'business-gpt-0'});
  const result=await executeCloudModelJob(job({messages:[{role:'user',content:'Full original rationale'}],tools:[{name:'write_hook',input_schema:{type:'object'}}],tool_choice:{name:'write_hook'}}));
  expect(result.response).toMatchObject({stop_reason:'tool_use',content:[{type:'tool_use',name:'write_hook',input:{opening:'first',closing:'second'}}]});
  expect(result.route).toBe('business-gpt-0');expect(m.text.mock.calls[0][0]).toContain('Full original rationale');
 });
 it('rejects invalid output JSON instead of inventing a default hook',async()=>{
  m.text.mockResolvedValue({success:true,data:'I cannot answer'});
  await expect(executeCloudModelJob(job({tools:[{name:'write_hook',input_schema:{}}],tool_choice:{name:'write_hook'}}))).rejects.toThrow();
 });
 it('requires actual retrieval when a cloud caller requests search',async()=>{
  m.search.mockResolvedValue({success:false,error:'No available search transport'});
  await expect(executeCloudModelJob(job({tools:[{type:'web_search_20250305'}]}))).rejects.toThrow('No available search transport');expect(m.text).not.toHaveBeenCalled();
 });
 it('passes actual private image bytes to business then personal GPT and erases files',async()=>{
  let path;
  m.vision.mockImplementation(async(_prompt,options)=>{path=options.imagePaths[0];expect((await readFile(path)).toString()).toBe('source-image');return m.vision.mock.calls.length===1?{success:false,error:'Plus capped'}:{success:true,data:'{"bets":[]}'};});
  const result=await executeCloudModelJob(job({messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:Buffer.from('source-image').toString('base64')}}]}]}));
  expect(m.vision.mock.calls[0][1].codexHomes[0]).toContain('.codex-plus');expect(m.vision.mock.calls[1][1].allowPersonalAccount).toBe(true);expect(result.route).toBe('personal-gpt');await expect(access(path)).rejects.toThrow();expect(m.text).not.toHaveBeenCalled();
 });
 it('does no model work for an expired request',async()=>{
  await expect(executeCloudModelJob({request:{},expires_at:'2000-01-01'})).rejects.toThrow('expired');expect(m.text).not.toHaveBeenCalled();
 });
});
