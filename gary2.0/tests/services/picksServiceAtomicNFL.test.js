import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('../../src/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: {} } })),
      signInAnonymously: vi.fn(),
    },
  },
  supabaseAdmin: { rpc: mocks.rpc },
  storeDailyPicks: vi.fn(),
}));

const { storeWeeklyNFLPicks } = await import('../../src/services/picksService.js');

const nflPick = (overrides = {}) => ({
  league: 'NFL',
  homeTeam: 'Buffalo Bills',
  awayTeam: 'Carolina Panthers',
  pick: 'Buffalo Bills -3',
  bdl_game_id: 1393557,
  commence_time: '2026-08-15T17:00:00.000Z',
  season_type: 1,
  homeTeamAbbreviation: 'BUF',
  awayTeamAbbreviation: 'CAR',
  season: 2026,
  week: 2,
  ...overrides,
});

describe('atomic weekly NFL storage', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it('sends one exact-game append RPC and returns its stored identity', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        added: 1,
        skipped: 0,
        total: 3,
        game_ids: ['1393557'],
        mode: 'append',
      },
      error: null,
    });

    const result = await storeWeeklyNFLPicks([nflPick()]);

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('append_weekly_nfl_picks_atomic', {
      p_week_start: '2026-08-11',
      p_week_number: 2,
      p_season: 2026,
      p_new_picks: [expect.objectContaining({
        bdl_game_id: 1393557,
        season_type: 1,
        homeTeamAbbreviation: 'BUF',
        awayTeamAbbreviation: 'CAR',
      })],
    });
    expect(result).toEqual({
      success: true,
      count: 1,
      total: 3,
      skipped: 0,
      game_ids: ['1393557'],
      mode: 'append',
    });
  });

  it('treats the database first-writer guard as a successful idempotent write', async () => {
    mocks.rpc.mockResolvedValue({
      data: { added: 0, skipped: 1, total: 3, game_ids: [], mode: 'append' },
      error: null,
    });

    await expect(storeWeeklyNFLPicks([nflPick()])).resolves.toMatchObject({
      success: true,
      count: 0,
      total: 3,
      skipped: 1,
    });
  });

  it('refuses a non-identifiable pick before touching the shared ledger', async () => {
    const result = await storeWeeklyNFLPicks([
      nflPick({ bdl_game_id: null, game_id: null }),
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires bdl_game_id or game_id');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the atomic RPC is unavailable', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function append_weekly_nfl_picks_atomic not found' },
    });

    await expect(storeWeeklyNFLPicks([nflPick()])).resolves.toEqual({
      success: false,
      error: 'function append_weekly_nfl_picks_atomic not found',
    });
  });
});
