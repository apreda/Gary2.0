import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../src/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: {} } })),
      signInAnonymously: vi.fn(),
    },
  },
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
  storeDailyPicks: vi.fn(),
}));

const { storeWeeklyNFLPicks } = await import('../../src/services/picksService.js');

const nflPick = (overrides = {}) => ({
  league: 'NFL',
  homeTeam: 'Buffalo Bills',
  awayTeam: 'Carolina Panthers',
  pick: 'Buffalo Bills -3',
  type: 'spread', odds: -110, spread: -3, rationale: 'The supplied matchup supports this ticket.',
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
    mocks.from.mockReset();
  });
  afterEach(() => vi.useRealTimers());

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
    const query = { select: () => query, eq: () => query, maybeSingle: () => query,
      abortSignal: async () => ({ data: { picks: [nflPick({ pick: 'Carolina Panthers +3 -105', odds: -105 })] }, error: null }) };
    mocks.from.mockReturnValue(query);

    await expect(storeWeeklyNFLPicks([nflPick()])).resolves.toMatchObject({
      success: true,
      count: 0,
      total: 3,
      skipped: 1,
    });
  });

  it.each(['', '   '])('publishes the validated fallback NFL game ID when the primary ID is %j', async bdl_game_id => {
    mocks.rpc.mockResolvedValue({ data: { added: 1, skipped: 0, total: 1, game_ids: ['42'], mode: 'insert' }, error: null });
    const result = await storeWeeklyNFLPicks([nflPick({ bdl_game_id, game_id: 42 })]);
    expect(result.success).toBe(true);
    expect(mocks.rpc.mock.calls[0][1].p_new_picks[0]).toMatchObject({ bdl_game_id: 42, game_id: 42 });
  });

  it.each([null, {}, { added: 0, skipped: 0, total: 1, game_ids: [], mode: 'append' }])('refuses malformed weekly publication receipts %j', async receipt => {
    mocks.rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await storeWeeklyNFLPicks([nflPick()])).toMatchObject({ success: false, error: expect.stringContaining('Invalid atomic pick publication receipt') });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge a malformed original guarded by first-writer storage', async () => {
    mocks.rpc.mockResolvedValue({ data: { added: 0, skipped: 1, total: 1, game_ids: [], mode: 'append' }, error: null });
    const query = { select: () => query, eq: vi.fn(() => query), maybeSingle: () => query,
      abortSignal: async () => ({ data: { picks: [nflPick({ pick: 'PENDING' })] }, error: null }) };
    mocks.from.mockReturnValue(query);
    expect(await storeWeeklyNFLPicks([nflPick()])).toMatchObject({ success: false, error: expect.stringContaining('original record preserved') });
    expect(query.eq).toHaveBeenCalledWith('week_start', '2026-08-11');
    expect(query.eq).toHaveBeenCalledWith('season', 2026);
  });

  it('rechecks the pregame boundary after a transient failure before retrying NFL storage', async () => {
    vi.useFakeTimers();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'statement timeout' } });
    const guard = vi.fn(() => { throw new Error('Pregame storage blocked: game has already started'); });
    const result = storeWeeklyNFLPicks([nflPick()], { beforeRetry: guard });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ success: false, error: expect.stringContaining('already started') });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
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
