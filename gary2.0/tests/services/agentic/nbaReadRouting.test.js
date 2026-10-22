// The NBA game pick is the NBA read (Oct 21 2026); GARY_NBA_SYSTEM=april runs the April 2026 prompts through the loop
// (founder: "we can always go back to the old NBA if needed").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ scout: vi.fn(), loop: vi.fn(), read: vi.fn() }));
vi.mock('../../../src/services/gary/agentic/scoutReport/scoutReportBuilder.js', () => ({ buildScoutReport: mocks.scout }));
vi.mock('../../../src/services/gary/agentic/orchestrator/agentLoop.js', () => ({ runAgentLoop: mocks.loop }));
vi.mock('../../../src/services/gary/agentic/orchestrator/nbaRead.js', () => ({ runNbaRead: mocks.read }));
vi.mock('../../../src/services/gary/agentic/tools/statRouters/index.js', () => ({ fetchStats: vi.fn(), clearStatRouterCache: vi.fn() }));
vi.mock('../../../src/services/gary/agentic/statsSubstance.js', () => ({ shouldReuseScoutReport: () => false }));

import { analyzeGame } from '../../../src/services/gary/agentic/orchestrator/orchestratorMain.js';

const game = { id: 21717860, home_team: 'Philadelphia 76ers', away_team: 'Cleveland Cavaliers', commence_time: '2026-10-22T23:00:00Z',
  spread_home: 2.5, spread_away: -2.5, spread_home_odds: -110, spread_away_odds: -110 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scout.mockResolvedValue({ garyText: 'desk', flashText: 'desk' });
  mocks.loop.mockResolvedValue({ pick: 'Philadelphia 76ers +2.5 -110', rawAnalysis: 'loop' });
  mocks.read.mockResolvedValue({ pick: 'Philadelphia 76ers +2.5 -110', rawAnalysis: 'read' });
});
afterEach(() => vi.unstubAllEnvs());

describe('NBA game picks', () => {
  it('run the NBA read by default', async () => {
    await analyzeGame({ ...game }, 'basketball_nba', { nocache: true });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.loop).not.toHaveBeenCalled();
  });

  it('run the April prompts through the loop when GARY_NBA_SYSTEM=april', async () => {
    vi.stubEnv('GARY_NBA_SYSTEM', 'april');
    await analyzeGame({ ...game }, 'basketball_nba', { nocache: true });
    expect(mocks.loop).toHaveBeenCalledTimes(1);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
