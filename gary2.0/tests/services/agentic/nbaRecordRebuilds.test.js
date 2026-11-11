// A stored game is built again four days after its date (Nov 10 2026 data round: 6 numbers in 3 games of Nov 4 and
// Nov 6 were corrected by the league after the day-2 rebuild and sat wrong on the Nov 9 desks).
import { afterEach, describe, expect, it, vi } from 'vitest';

const saved = [];
vi.mock('../../../src/services/providers/ballDontLieService.js', () => ({
  ballDontLieService: { getGames: async () => [{ id: 1, status: 'Final' }] },
}));
vi.mock('../../../src/services/gamebygame/gameRecordStore.js', async (orig) => ({
  ...(await orig()),
  storedGameIds: async () => new Map([['1', { version: 22, date: '2026-11-04', builtAt: '2026-11-06T13:00:00Z', failed: [] }]]),
  saveGameRecord: async (row) => { saved.push(row); },
}));
vi.mock('../../../src/services/sports/nba/nbaGameRecord.js', async (orig) => ({
  ...(await orig()),
  buildNbaGameRecord: async () => ({ row: { checks: [] } }),
}));

const { ensureNbaRecords } = await import('../../../src/services/gary/agentic/orchestrator/nbaGameByGameRead.js');

afterEach(() => { vi.useRealTimers(); saved.length = 0; });

describe('ensureNbaRecords', () => {
  it('builds a game of Nov 4 built on Nov 6 again at 8 AM ET Nov 8, not before', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T11:00:00Z'), toFake: ['Date'] });
    expect((await ensureNbaRecords(2026)).built).toBe(0);
    vi.setSystemTime(new Date('2026-11-08T12:30:00Z'));
    expect((await ensureNbaRecords(2026)).built).toBe(1);
    expect(saved).toHaveLength(1);
  });
});
