import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/services/nflverseService.js', () => ({
  getPracticeReport: vi.fn().mockResolvedValue({ unavailable: true, reason: 'Current practice report unavailable' }),
  getSnapShare: vi.fn(),
}));
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { nflFetchers } from '../../../src/services/agentic/tools/statRouters/nflFetchers.js';
import { summarizeStatForContext } from '../../../src/services/agentic/orchestrator/orchestratorHelpers.js';

afterEach(() => vi.restoreAllMocks());

describe('NFL supplemental original injury records', () => {
  it('retains reserve and unknown statuses with exact comments and dates through the real fetcher and formatter', async () => {
    const home = { id: 31, full_name: 'Seattle Seahawks' }, away = { id: 1, full_name: 'New England Patriots' };
    const injury = (id, team, status) => ({ player: { id, first_name: 'Player', last_name: String(id),
      position_abbreviation: 'QB', team }, status, comment: `Original report ${id}`, date: '2026-09-08T11:00:00Z' });
    vi.spyOn(ballDontLieService, 'getNflPlayerInjuries').mockResolvedValue([
      injury(10, home, 'PUP-R'), injury(11, home, null), injury(12, away, 'Questionable'),
    ]);
    const report = await nflFetchers.NFL_INJURIES('americanfootball_nfl', home, away, 2026);
    expect(report.home.total_listed).toBe(2);
    expect(report.home.injuries).toEqual([
      { player: 'Player 10', player_id: 10, position: 'QB', status: 'PUP-R', comment: 'Original report 10', date: '2026-09-08T11:00:00Z' },
      { player: 'Player 11', player_id: 11, position: 'QB', status: null, comment: 'Original report 11', date: '2026-09-08T11:00:00Z' },
    ]);
    expect(report.away.questionable).toEqual(['Player 12 (QB)']);
    const rendered = summarizeStatForContext(report, 'INJURIES', home.full_name, away.full_name, 'NFL');
    expect(rendered).not.toContain('No injuries reported');
    expect(JSON.parse(rendered.slice(rendered.indexOf(':') + 1))).toEqual(report);
  });
});
