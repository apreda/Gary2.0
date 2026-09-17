import { describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({search:vi.fn()}));
vi.mock('../../src/services/agentic/scoutReport/shared/grounding.js',()=>({groundingSearch:mocks.search}));
import { searchBullpenReporting } from '../../src/services/bullpen/reporting.js';
import { collectBullpenReports } from '../../src/services/bullpen/snapshot.js';

describe('dated bullpen reporting',()=>{
  it('uses existing search transport without discarding older ongoing restrictions',async()=>{
    const source='Pitcher A: restriction announced September 10, reconfirmed September 16; https://example.test/team-report. Daily availability UNKNOWN.';
    mocks.search.mockResolvedValue(source);
    const reports=await collectBullpenReports(['Home'],'2026-09-16T18:00:00Z',searchBullpenReporting);
    expect(mocks.search).toHaveBeenCalledWith(null,expect.stringContaining('search for subsequent changes'),expect.any(String));
    const prompt=mocks.search.mock.calls[0][1];
    expect(prompt).toContain('Use only reporting published by that time');expect(prompt).toContain('An older daily availability statement does not establish');
    expect(reports[0].text).toBe(source);expect(reports[0].status).toBe('reported_text');
  });
});
