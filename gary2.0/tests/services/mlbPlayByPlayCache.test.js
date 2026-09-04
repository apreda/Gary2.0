import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TWO_HOURS = 2 * 60 * 60 * 1000;
const START = Date.parse('2026-09-04T16:00:00Z');
const FEED = {
  scoringPlays: [0, 1],
  allPlays: [
    {
      about: { halfInning: 'top', inning: 1 },
      result: { event: 'Home Run', description: 'Alex Batter homers.', awayScore: 1, homeScore: 0, rbi: 1 },
      matchup: { batter: { id: 1 }, pitcher: { id: 10, fullName: 'Old Pitcher' } },
      runners: [],
    },
    {
      about: { halfInning: 'bottom', inning: 2 },
      result: { event: 'Single', description: 'Beta Batter singles.', awayScore: 1, homeScore: 1, rbi: 1 },
      matchup: { batter: { id: 2 }, pitcher: { id: 11, fullName: 'New Arm' }, postOnFirst: { id: 2 }, postOnSecond: { id: 3 } },
      runners: [{ details: { runner: { id: 3 }, eventType: 'stolen_base_2b' } }],
    },
    {
      about: { halfInning: 'bottom', inning: 2 },
      result: { event: 'Strikeout', awayScore: 1, homeScore: 1 },
      matchup: { batter: { id: 4 }, pitcher: { id: 11, fullName: 'New Arm' } },
      runners: [],
    },
  ],
};
const EXPECTED = [
  [
    '[T1] Alex Batter homers. — off Pitcher (1-0)',
    '[B2] Beta Batter singles. — off Arm (1-1)',
  ],
  {
    1: ['HR off Pitcher (1st, made it 1-0)'],
    2: ['1B off Arm (2nd, 1 RBI)'],
    3: ['SB (2nd)'],
    4: ['K vs Arm (2nd)'],
  },
  new Map([
    [10, { inning: 1, half: 'T', awayScore: 0, homeScore: 0, maxOn: 0 }],
    [11, { inning: 2, half: 'B', awayScore: 1, homeScore: 0, maxOn: 2 }],
  ]),
];

let api;
let fetchStub;
const response = () => ({ ok: true, json: async () => structuredClone(FEED) });
const views = gamePk => [
  api.getScoringFlowAttributed(gamePk),
  api.getBatterGameTrips(gamePk),
  api.getPitcherEntryContext(gamePk),
];

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  fetchStub = vi.fn(async () => response());
  vi.stubGlobal('fetch', fetchStub);
  api = await import('../../src/services/mlbStatsApiService.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shared MLB play-by-play reads', () => {
  it('keeps all three projections unchanged with one sequential request', async () => {
    const actual = [
      await api.getScoringFlowAttributed(100),
      await api.getBatterGameTrips(100),
      await api.getPitcherEntryContext(100),
    ];
    expect(actual).toEqual(EXPECTED);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub).toHaveBeenCalledWith('https://statsapi.mlb.com/api/v1/game/100/playByPlay');
  });

  it('shares an unfinished request between concurrent projections', async () => {
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    fetchStub.mockImplementation(async () => { await ready; return response(); });
    const pending = Promise.all(views(101));
    expect(fetchStub).toHaveBeenCalledTimes(1);
    release();
    expect(await pending).toEqual(EXPECTED);
    expect(await Promise.all(views(101))).toEqual(EXPECTED);
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('keeps responses for different games separate', async () => {
    await Promise.all([api.getScoringFlowAttributed(102), api.getBatterGameTrips(103)]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual([
      'https://statsapi.mlb.com/api/v1/game/102/playByPlay',
      'https://statsapi.mlb.com/api/v1/game/103/playByPlay',
    ]);
  });

  it('expires every derived view with its source instead of extending freshness', async () => {
    await api.getScoringFlowAttributed(104);
    vi.setSystemTime(START + TWO_HOURS / 2);
    await api.getBatterGameTrips(104);
    vi.setSystemTime(START + TWO_HOURS - 1);
    await api.getPitcherEntryContext(104);
    expect(fetchStub).toHaveBeenCalledTimes(1);

    vi.setSystemTime(START + TWO_HOURS);
    fetchStub.mockResolvedValue({ ok: true, json: async () => ({ allPlays: [], scoringPlays: [] }) });
    expect(await Promise.all(views(104))).toEqual([[], {}, new Map()]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it.each(['transport', 'http', 'json'])('allows caller fallbacks and retries after a %s failure', async failure => {
    if (failure === 'transport') fetchStub.mockRejectedValueOnce(new Error('offline socket failure'));
    if (failure === 'http') fetchStub.mockResolvedValueOnce({ ok: false, status: 503 });
    if (failure === 'json') fetchStub.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } });
    const fallback = Symbol('caller fallback');
    const failed = await Promise.all(views(105).map(pending => pending.catch(() => fallback)));
    expect(failed).toEqual([fallback, fallback, fallback]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(await Promise.all(views(105))).toEqual(EXPECTED);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('evicts older raw feeds while preserving their already cached projections', async () => {
    for (let gamePk = 0; gamePk < 33; gamePk += 1) {
      await api.getScoringFlowAttributed(gamePk);
    }
    expect(fetchStub).toHaveBeenCalledTimes(33);
    expect(await api.getScoringFlowAttributed(0)).toEqual(EXPECTED[0]);
    expect(await api.getBatterGameTrips(32)).toEqual(EXPECTED[1]);
    expect(fetchStub).toHaveBeenCalledTimes(33);
    expect(await api.getBatterGameTrips(0)).toEqual(EXPECTED[1]);
    expect(fetchStub).toHaveBeenCalledTimes(34);
  });
});
