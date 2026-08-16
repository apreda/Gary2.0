import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUpcomingGames: vi.fn(),
  axios: vi.fn(),
}));

vi.mock('../../src/services/oddsService.js', () => ({
  oddsService: { getUpcomingGames: mocks.getUpcomingGames },
}));

vi.mock('axios', () => ({ default: mocks.axios }));

process.env.SUPABASE_URL ||= 'https://example.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-test-key';

const { DailySlateSourceError, writeDailySlate } = await import(
  '../../src/services/dailySlateService.js'
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.axios.mockImplementation(async (config) => (
    config.method === 'GET' ? { data: [] } : { data: null }
  ));
});

describe('daily slate source health', () => {
  it('persists healthy leagues, then reports a failed league instead of a dark day', async () => {
    mocks.getUpcomingGames.mockImplementation(async (sportKey) => {
      if (sportKey === 'baseball_mlb') {
        return [{
          id: 900,
          home_team: 'New York Yankees',
          away_team: 'Boston Red Sox',
          commence_time: '2099-10-03T23:05:00.000Z',
          moneyline_home: -120,
          moneyline_away: 105,
        }];
      }
      if (sportKey === 'americanfootball_nfl') throw new Error('NFL provider failed');
      return [];
    });

    let failure;
    try {
      await writeDailySlate('2099-10-03');
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(DailySlateSourceError);
    expect(failure.result).toMatchObject({
      date: '2099-10-03',
      total: 1,
      byLeague: { MLB: 1, NCAAF: 0, NBA: 0 },
      failures: [{
        league: 'NFL',
        error: 'NFL provider failed',
        kind: 'internal',
        transient_external: false,
      }],
    });
    expect(mocks.axios).toHaveBeenCalledTimes(2);
    expect(mocks.axios.mock.calls[1][0].data).toEqual([
      expect.objectContaining({ league: 'MLB', bdl_game_id: 900 }),
    ]);
  });

  it('treats four decoded empty league boards as a verified dark day', async () => {
    mocks.getUpcomingGames.mockResolvedValue([]);

    await expect(writeDailySlate('2099-10-04')).resolves.toMatchObject({
      total: 0,
      failures: [],
      byLeague: { MLB: 0, NFL: 0, NCAAF: 0, NBA: 0 },
    });
    expect(mocks.axios).toHaveBeenCalledOnce();
    expect(mocks.axios.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      params: { date: 'eq.2099-10-04' },
    });
  });

  it('removes same-date games that disappear from a healthy authoritative league', async () => {
    mocks.getUpcomingGames.mockImplementation(async (sportKey) => (
      sportKey === 'baseball_mlb'
        ? [{
            id: 901,
            home_team: 'New York Yankees',
            away_team: 'Boston Red Sox',
            commence_time: '2099-10-06T23:05:00.000Z',
          }]
        : []
    ));
    mocks.axios.mockImplementation(async (config) => {
      if (config.method === 'GET') {
        return { data: [
          {
            id: 1,
            date: '2099-10-06',
            league: 'MLB',
            bdl_game_id: 901,
            away_team: 'Boston Red Sox',
            home_team: 'New York Yankees',
            commence_time: '2099-10-06T23:05:00.000Z',
          },
          {
            id: 2,
            date: '2099-10-06',
            league: 'MLB',
            bdl_game_id: 902,
            away_team: 'Toronto Blue Jays',
            home_team: 'Baltimore Orioles',
            commence_time: '2099-10-06T23:10:00.000Z',
          },
        ] };
      }
      return { data: null };
    });

    await expect(writeDailySlate('2099-10-06')).resolves.toMatchObject({ total: 1 });
    expect(mocks.axios.mock.calls.map(([config]) => config.method)).toEqual(['GET', 'POST', 'DELETE']);
    expect(mocks.axios.mock.calls[2][0].params).toEqual({ id: 'in.(2)' });
  });

  it('deletes a prior same-date board after every league verifies an empty slate', async () => {
    mocks.getUpcomingGames.mockResolvedValue([]);
    mocks.axios.mockImplementation(async (config) => (
      config.method === 'GET'
        ? { data: [
            { id: 11, date: '2099-10-07', league: 'MLB', bdl_game_id: 700 },
            { id: 12, date: '2099-10-07', league: 'NFL', bdl_game_id: 701 },
          ] }
        : { data: null }
    ));

    await expect(writeDailySlate('2099-10-07')).resolves.toMatchObject({ total: 0 });
    expect(mocks.axios.mock.calls.map(([config]) => config.method)).toEqual(['GET', 'DELETE']);
    expect(mocks.axios.mock.calls[1][0].params).toEqual({ id: 'in.(11,12)' });
  });

  it('never deletes rows belonging to a failed league during healthy-league reconciliation', async () => {
    mocks.getUpcomingGames.mockImplementation(async (sportKey) => {
      if (sportKey === 'americanfootball_nfl') {
        throw Object.assign(new Error('NFL 503'), { response: { status: 503 } });
      }
      return [];
    });
    mocks.axios.mockImplementation(async (config) => (
      config.method === 'GET'
        ? { data: [
            { id: 21, date: '2099-10-08', league: 'NFL', bdl_game_id: 801 },
            { id: 22, date: '2099-10-08', league: 'MLB', bdl_game_id: 802 },
          ] }
        : { data: null }
    ));

    let failure;
    try { await writeDailySlate('2099-10-08'); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(DailySlateSourceError);
    expect(failure.result.failures[0]).toMatchObject({
      league: 'NFL', kind: 'transient_external', transient_external: true,
    });
    expect(mocks.axios.mock.calls.map(([config]) => config.method)).toEqual(['GET', 'DELETE']);
    expect(mocks.axios.mock.calls[1][0].params).toEqual({ id: 'in.(22)' });
  });

  it('does not call a malformed decoded row an authoritative empty league', async () => {
    mocks.getUpcomingGames.mockImplementation(async (sportKey) => (
      sportKey === 'baseball_mlb'
        ? [{
            id: 999,
            home_team: 'New York Yankees',
            away_team: 'Boston Red Sox',
            commence_time: 'not-a-clock',
          }]
        : []
    ));
    mocks.axios.mockImplementation(async (config) => (
      config.method === 'GET'
        ? { data: [{ id: 31, date: '2099-10-09', league: 'MLB', bdl_game_id: 999 }] }
        : { data: null }
    ));

    let failure;
    try { await writeDailySlate('2099-10-09'); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(DailySlateSourceError);
    expect(failure.result.failures[0]).toMatchObject({
      league: 'MLB', kind: 'internal', transient_external: false,
    });
    expect(mocks.axios.mock.calls.map(([config]) => config.method)).toEqual(['GET']);
  });
});
