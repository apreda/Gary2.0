import { beforeEach, describe, expect, it, vi } from 'vitest';

// The college lanes' pass ledger (NCAAF Picks page parity, Sep 4 2026). BDL's
// shared gate allows about three requests a minute, so a 28-game Saturday
// cannot be covered in one insights pass. Each lane reads which games already
// carry its rows today, works the rest in kickoff order, and stops starting
// games when its time budget is spent — the next pass continues.

const axios = vi.hoisted(() => ({ default: vi.fn() }));
vi.mock('axios', () => axios);

const { gamesWithRowsToday, runWithinBudget } = await import('../../../src/services/insights/ncaafLaneLedger.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('gamesWithRowsToday', () => {
  it('reads the game ids that already carry the category today, as strings', async () => {
    axios.default.mockResolvedValue({ data: [{ game_id: '457163' }, { game_id: 457170 }, { game_id: null }] });
    const done = await gamesWithRowsToday({ date: '2026-09-05', category: 'quarterback', supabaseUrl: 'https://x.test', key: 'k' });
    expect(done).toEqual(new Set(['457163', '457170']));
    const call = axios.default.mock.calls[0][0];
    expect(call.url).toBe('https://x.test/rest/v1/insight_connections');
    expect(call.params).toMatchObject({ date: 'eq.2026-09-05', league: 'eq.ncaaf', category: 'eq.quarterback', select: 'game_id' });
  });

  it('treats a failed read as nothing done, so the lane still works the slate', async () => {
    axios.default.mockRejectedValue(new Error('503'));
    expect(await gamesWithRowsToday({ date: '2026-09-05', category: 'injury', supabaseUrl: 'https://x.test', key: 'k' })).toEqual(new Set());
  });
});

describe('runWithinBudget', () => {
  it('works games in kickoff order, skips the ones already done, and stops starting games once the budget is spent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
    const games = [
      { id: 3, date: '2026-09-05T23:30:00.000Z' },
      { id: 1, date: '2026-09-05T16:00:00.000Z' },
      { id: 2, date: '2026-09-05T19:30:00.000Z' },
      { id: 4, date: '2026-09-06T00:00:00.000Z' },
    ];
    const worked = [];
    const rows = await runWithinBudget({
      games,
      done: new Set(['2']),
      budgetMs: 60_000,
      work: async (g) => {
        worked.push(g.id);
        // The first game costs more than the whole budget.
        vi.setSystemTime(new Date(Date.now() + 61_000));
        return [{ game_id: g.id }];
      },
    });
    expect(worked).toEqual([1]);
    expect(rows).toEqual([{ game_id: 1 }]);
  });

  it('runs every game when the budget holds and contains a game that throws', async () => {
    const games = [{ id: 1, date: '2026-09-05T16:00:00.000Z' }, { id: 2, date: '2026-09-05T19:30:00.000Z' }];
    const rows = await runWithinBudget({
      games, done: new Set(), budgetMs: 60_000,
      work: async (g) => { if (g.id === 1) throw new Error('boom'); return [{ game_id: g.id }]; },
    });
    expect(rows).toEqual([{ game_id: 2 }]);
  });
});
