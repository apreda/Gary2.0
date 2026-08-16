import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    from: mocks.from,
  },
  supabaseAdmin: { rpc: mocks.rpc },
}));

const { picksService } = await import('../../src/services/picksService.js');

const ncaafPick = (overrides = {}) => ({
  league: 'NCAAF',
  sport: 'NCAAF',
  awayTeam: 'Notre Dame Fighting Irish',
  homeTeam: 'Miami Hurricanes',
  pick: 'Miami Hurricanes -2.5',
  type: 'spread',
  odds: -110,
  bdl_game_id: 820001,
  spread: -2.5,
  moneylineHome: -135,
  moneylineAway: 115,
  total: 51.5,
  commence_time: '2026-08-29T23:30:00.000Z',
  rationale: 'Current-season matchup rationale.',
  ...overrides,
});

describe('atomic daily-picks storage', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
  });

  it('sends the mapped NCAAF pick to one date-keyed atomic RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        added: 1,
        skipped: 0,
        total: 4,
        game_ids: ['820001'],
        mode: 'append',
      },
      error: null,
    });

    const result = await picksService.storeDailyPicksInDatabase(
      [ncaafPick()],
      '2026-08-29',
    );

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('append_daily_picks_atomic', {
      p_date: '2026-08-29',
      p_new_picks: [expect.objectContaining({
        league: 'NCAAF',
        sport: 'NCAAF',
        game_id: 820001,
        pick: 'Miami Hurricanes -2.5',
        spread: -2.5,
        moneylineHome: -135,
        moneylineAway: 115,
        total: 51.5,
      })],
    });
    expect(result).toEqual({
      success: true,
      count: 1,
      added: 1,
      skipped: 0,
      total: 4,
      game_ids: ['820001'],
      mode: 'append',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('preserves the football-only immutable publication receipt', async () => {
    mocks.rpc.mockResolvedValue({
      data: { added: 1, skipped: 0, total: 1, game_ids: ['820001'], mode: 'insert' },
      error: null,
    });
    const publishedMarket = {
      market_type: 'spread',
      vendor: 'BetMGM',
      line: -2.5,
      odds: -110,
    };
    await picksService.storeDailyPicksInDatabase([ncaafPick({
      published_at: '2026-08-29T21:59:00.000Z',
      published_market: publishedMarket,
    })], '2026-08-29');

    expect(mocks.rpc.mock.calls[0][1].p_new_picks[0]).toMatchObject({
      published_at: '2026-08-29T21:59:00.000Z',
      published_market: publishedMarket,
    });
  });

  it('requires exact provider identity for new NCAAF game picks', async () => {
    const result = await picksService.storeDailyPicksInDatabase(
      [ncaafPick({ bdl_game_id: null, game_id: null })],
      '2026-08-29',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires bdl_game_id or game_id');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC is unavailable and never read-merges the row', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function append_daily_picks_atomic not found' },
    });

    await expect(picksService.storeDailyPicksInDatabase(
      [ncaafPick()],
      '2026-08-29',
    )).resolves.toEqual({
      success: false,
      error: 'function append_daily_picks_atomic not found',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'MLB',
      pick: ncaafPick({
        league: 'MLB',
        sport: 'MLB',
        awayTeam: 'New York Yankees',
        homeTeam: 'Boston Red Sox',
        pick: 'Boston Red Sox ML',
        type: 'moneyline',
        odds: -125,
        bdl_game_id: 700101,
      }),
    },
    {
      label: 'NBA',
      pick: ncaafPick({
        league: 'NBA',
        sport: 'NBA',
        awayTeam: 'New York Knicks',
        homeTeam: 'Boston Celtics',
        pick: 'Boston Celtics -4.5',
        type: 'spread',
        odds: -110,
        bdl_game_id: 600201,
      }),
    },
  ])('preserves the observable $label daily write payload while using the atomic path', async ({ pick }) => {
    mocks.rpc.mockResolvedValue({
      data: {
        added: 1,
        skipped: 0,
        total: 1,
        game_ids: [String(pick.bdl_game_id)],
        mode: 'insert',
      },
      error: null,
    });

    const result = await picksService.storeDailyPicksInDatabase([pick], '2026-08-29');
    const payload = mocks.rpc.mock.calls[0][1].p_new_picks[0];

    expect(payload).toMatchObject({
      league: pick.league,
      sport: pick.sport,
      homeTeam: pick.homeTeam,
      awayTeam: pick.awayTeam,
      pick: pick.pick,
      type: pick.type,
      odds: pick.odds,
      game_id: pick.bdl_game_id,
    });
    expect(payload).not.toHaveProperty('published_at');
    expect(payload).not.toHaveProperty('published_market');
    expect(result).toMatchObject({ success: true, added: 1, mode: 'insert' });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
