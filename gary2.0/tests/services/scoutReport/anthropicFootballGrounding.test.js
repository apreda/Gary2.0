import {it,expect,vi,beforeEach} from 'vitest';
const search=vi.hoisted(()=>vi.fn());vi.mock('../../../src/services/agentic/orchestrator/subscriptionSearch.js',()=>({subscriptionSearch:search}));
import {fetchAnthropicFootballCurrentState} from '../../../src/services/agentic/scoutReport/shared/anthropicFootballGrounding.js';
beforeEach(()=>search.mockReset());
const input={homeTeam:'Detroit Lions',awayTeam:'Chicago Bears',sport:'NFL'};
it('keeps symmetric football-only instructions and accepts the real subscription source',async()=>{search.mockResolvedValue({success:true,data:'The Lions and Bears have documented current reporting. '.repeat(20),transport:'personal-gpt'});const r=await fetchAnthropicFootballCurrentState(input);expect(r.provider).toBe('personal-gpt');expect(search.mock.calls[0][0]).toContain('Detroit Lions');expect(search.mock.calls[0][0]).toContain('Chicago Bears');});
it('rejects an unrelated or single-team answer rather than publishing it',async()=>{search.mockResolvedValue({success:true,data:'The Lions have current reporting. '.repeat(20)});expect(await fetchAnthropicFootballCurrentState(input)).toBeNull();});
