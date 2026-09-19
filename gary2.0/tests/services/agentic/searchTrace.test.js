import { describe, it, expect } from 'vitest';
import { retrievedSearchRecords } from '../../../src/services/agentic/searchTrace.js';
import { searchSourceTrace } from '../../../src/services/ncaafGameContext.js';
const result = {type:'tool_result',tool_use_id:'search1',content:'Retrieved https://school.edu/depth-chart'};
describe('actual search receipts', () => {
 it('retains Claude tool output but excludes generated citations and pending calls', () => {
  const raw = [{type:'assistant',message:{content:[{type:'tool_use',name:'WebFetch',input:{url:'https://invented.test'}}]}},{type:'user',message:{content:[result]}},{type:'result',result:'https://invented.test'}];
  expect(retrievedSearchRecords(raw)).toEqual([result]);
  expect(searchSourceTrace(raw)).toContain('school.edu');
  expect(searchSourceTrace(raw)).not.toContain('invented');
 });
 it('does not turn a final JSON answer into its own supporting source', () => {
  expect(searchSourceTrace({type:'result',result:{sources:[{url:'https://invented.test'}]}})).toBe('[]');
 });
 it('excludes incomplete Codex opens and retains completed ones', () => {
  const item = {type:'web_search',query:'https://school.edu',action:{type:'other'}};
  expect(retrievedSearchRecords([{type:'item.started',item},{type:'item.completed',item}].map(JSON.stringify).join('\n'))).toEqual([{type:'item.completed',item}]);
 });
 it('keeps completed browser retrieval content without tool arguments or screenshots', () => {
  const raw = { type: 'item.completed', item: { type: 'mcp_tool_call', arguments: { url: 'https://unopened.test' }, result: { content: [{type:'text',text:'Official current quarterback report'}], _meta: {browser_use:{url:'https://school.edu/current'},screenshot:'large image'} } } };
  expect(retrievedSearchRecords(raw)).toEqual([{type:'web_fetch_tool_result',url:'https://school.edu/current',content:'Official current quarterback report'}]);
 });

});
