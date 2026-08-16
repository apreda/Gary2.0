import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  waitForBdlRequestSlot: vi.fn(async () => 0),
}));

vi.mock('../../src/services/bdlRequestGate.js', () => ({
  waitForBdlRequestSlot: mocks.waitForBdlRequestSlot,
}));

const { getCachedOrFetch } = await import('../../src/services/ballDontLieService.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('shared BDL request-gate scope', () => {
  it('preserves the established ungated MLB fetch path', async () => {
    const key = `baseball_mlb_games_gate_scope_${Date.now()}`;
    const fetchFn = vi.fn(async () => [{ id: 5059620 }]);

    await expect(getCachedOrFetch(key, fetchFn, 1)).resolves.toEqual([{ id: 5059620 }]);

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(mocks.waitForBdlRequestSlot).not.toHaveBeenCalled();
  });

  it.each([
    'americanfootball_nfl_games_gate_scope',
    'americanfootball_ncaaf_games_gate_scope',
  ])('keeps football requests behind the shared gate: %s', async (prefix) => {
    const key = `${prefix}_${Date.now()}`;
    const fetchFn = vi.fn(async () => [{ id: 1 }]);

    await expect(getCachedOrFetch(key, fetchFn, 1)).resolves.toEqual([{ id: 1 }]);

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(mocks.waitForBdlRequestSlot).toHaveBeenCalledOnce();
    expect(mocks.waitForBdlRequestSlot).toHaveBeenCalledWith(key);
  });
});
