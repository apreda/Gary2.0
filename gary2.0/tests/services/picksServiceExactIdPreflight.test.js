import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  response: { data: [], error: null },
}));

vi.mock('../../src/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: {} } })),
      signInAnonymously: vi.fn(),
    },
    from: mocks.from,
  },
  supabaseAdmin: { rpc: vi.fn(), from: mocks.from },
}));

const { pickAlreadyStoredByGameId } = await import('../../src/services/picksService.js');

function makeQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(async () => mocks.response),
  };
  return query;
}

describe('exact provider-id pick preflight', () => {
  let query;

  beforeEach(() => {
    mocks.from.mockReset();
    mocks.response = { data: [], error: null };
    query = makeQuery();
    mocks.from.mockReturnValue(query);
  });

  it('finds a daily game pick by exact id and ignores a prop sharing that id', async () => {
    mocks.response = {
      data: [{
        picks: [
          { league: 'NCAAF', type: 'prop', game_id: '820001', pick: 'QB over 250.5' },
          { league: 'NCAAF', type: 'spread', game_id: 820001, pick: 'Miami -2.5' },
        ],
      }],
      error: null,
    };

    await expect(pickAlreadyStoredByGameId(
      'NCAAF',
      '2026-08-29',
      '820001',
    )).resolves.toMatchObject({
      exists: true,
      existingPick: 'Miami -2.5',
      source: 'daily_picks',
    });
    expect(mocks.from).toHaveBeenCalledWith('daily_picks');
    expect(query.eq).toHaveBeenCalledWith('date', '2026-08-29');
  });

  it('does not use matchup fallback for an id-less legacy row', async () => {
    mocks.response = {
      data: [{ picks: [{ league: 'NCAAF', homeTeam: 'Miami', awayTeam: 'Notre Dame', pick: 'Miami -2.5' }] }],
      error: null,
    };

    await expect(pickAlreadyStoredByGameId(
      'NCAAF',
      '2026-08-29',
      '820001',
    )).resolves.toEqual({
      exists: false,
      existingPick: null,
      source: 'daily_picks',
    });
  });

  it('derives the NFL weekly key from the supplied ET date', async () => {
    mocks.response = {
      data: [{ picks: [{ league: 'NFL', bdl_game_id: 1393557, pick: 'Bills -3' }] }],
      error: null,
    };

    await expect(pickAlreadyStoredByGameId(
      'NFL',
      '2026-08-15',
      1393557,
    )).resolves.toMatchObject({
      exists: true,
      existingPick: 'Bills -3',
      source: 'weekly_nfl_picks',
    });
    expect(mocks.from).toHaveBeenCalledWith('weekly_nfl_picks');
    expect(query.eq).toHaveBeenCalledWith('week_start', '2026-08-11');
    expect(query.eq).toHaveBeenCalledWith('season', 2026);
  });

  it('fails open on a read error so retries are never suppressed', async () => {
    mocks.response = { data: null, error: { message: 'temporary read failure' } };

    await expect(pickAlreadyStoredByGameId(
      'MLB',
      '2026-08-29',
      700101,
    )).resolves.toMatchObject({
      exists: false,
      existingPick: null,
      error: 'temporary read failure',
    });
  });

  it('does not query with an invalid preflight identity', async () => {
    await expect(pickAlreadyStoredByGameId('NCAAF', 'not-a-date', null)).resolves.toMatchObject({
      exists: false,
      error: expect.stringContaining('required'),
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
