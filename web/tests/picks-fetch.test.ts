import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { todayEST } from '@/lib/gary/dates';

vi.mock('@/lib/gary/dates', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gary/dates')>(),
  todayEST: vi.fn(() => '2026-09-04'),
}));

beforeEach(() => { vi.mocked(todayEST).mockReturnValue('2026-09-04'); });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTodayGamePicks', () => {
  it('starts both reads together and keeps daily picks before the current weekly picks', async () => {
    const dailyPick = { pick: 'Cubs ML -110', league: 'MLB' };
    const weeklyPick = { pick: 'Chiefs ML -120', league: 'NFL', commence_time: '2026-09-04T20:00:00Z' };
    let resolveDaily!: (response: Response) => void;
    let resolveWeekly!: (response: Response) => void;
    const dailyResponse = new Promise<Response>(resolve => { resolveDaily = resolve; });
    const weeklyResponse = new Promise<Response>(resolve => { resolveWeekly = resolve; });
    const fetchMock = vi.fn((input: string) => {
      const table = new URL(input).pathname.split('/').at(-1);
      if (table === 'daily_picks') return dailyResponse;
      if (table === 'weekly_nfl_picks') return weeklyResponse;
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = fetchTodayGamePicks(0);
    try {
      // Neither request has resolved: serial reads cannot pass this assertion.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map(([input]) => new URL(input).pathname)).toEqual([
        '/rest/v1/daily_picks',
        '/rest/v1/weekly_nfl_picks',
      ]);
      expect(fetchMock).toHaveBeenNthCalledWith(1,
        expect.stringContaining('date=eq.2026-09-04'),
        expect.objectContaining({ next: { revalidate: 0 } }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(2,
        expect.stringContaining('order=week_start.desc&limit=1'),
        expect.objectContaining({ next: { revalidate: 0 } }),
      );
    } finally {
      resolveWeekly(Response.json([{ week_start: '2026-09-01', picks: JSON.stringify([weeklyPick]) }]));
      resolveDaily(Response.json([{ date: '2026-09-04', picks: [dailyPick] }]));
      await pending;
    }
    expect(await pending).toEqual([dailyPick, weeklyPick]);
  });

  it.each(['2026-08-28', '2026-09-05'])('excludes weekly picks outside the active week (%s)', async weekStart => {
    const dailyPick = { pick: 'Cubs ML -110' };
    vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(
      new URL(input).pathname.endsWith('/daily_picks')
        ? [{ date: '2026-09-04', picks: [dailyPick] }]
        : [{ week_start: weekStart, picks: [{ pick: 'Chiefs ML -120' }] }],
    )));

    expect(await fetchTodayGamePicks()).toEqual([dailyPick]);
  });

  it('keeps the current NFL board when a future week has already been stored', async () => {
    const currentPick = { pick: 'Chiefs ML -120', league: 'NFL', commence_time: '2026-09-04T20:00:00Z' };
    const weeklyRows = [
      { week_start: '2026-09-08', picks: [{ pick: 'Bills ML -130', league: 'NFL' }] },
      { week_start: '2026-09-01', picks: [currentPick] },
      { week_start: '2026-08-25', picks: [{ pick: 'Jets ML -110', league: 'NFL' }] },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/daily_picks')) return Response.json([]);
      const upperBound = url.searchParams.get('week_start')?.replace(/^lte\./, '');
      const eligible = weeklyRows.filter(row => !upperBound || row.week_start <= upperBound);
      return Response.json(eligible.slice(0, Number(url.searchParams.get('limit'))));
    }));

    expect(await fetchTodayGamePicks()).toEqual([currentPick]);
  });

  it('shows only the exact Eastern game date, including late games on the next UTC date', async () => {
    const today = { pick: 'Chiefs -3.5 -110', league: 'NFL', commence_time: '2026-09-04T20:00:00Z' };
    const lateToday = { pick: 'Bills -2.5 -110', league: 'NFL', commence_time: '2026-09-05T02:00:00Z' };
    const weekly = [
      { pick: 'Yesterday', commence_time: '2026-09-04T02:00:00Z' }, today, lateToday,
      { pick: 'Tomorrow', commence_time: '2026-09-05T17:00:00Z' },
      { pick: 'No confirmed clock' }, { pick: 'Invalid clock', commence_time: 'not-a-date' },
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(
      new URL(input).pathname.endsWith('/daily_picks') ? [] : [{ week_start: '2026-09-01', picks: weekly }],
    )));
    expect(await fetchTodayGamePicks()).toEqual([today, lateToday]);
  });

  it('does not duplicate or resurrect NFL picks from legacy daily storage', async () => {
    const game = { pick: 'Cubs ML -110', league: 'MLB' };
    const nfl = { pick: 'Chiefs -3.5 -110', league: 'NFL', commence_time: '2026-09-04T20:00:00Z' };
    vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(
      new URL(input).pathname.endsWith('/daily_picks')
        ? [{ date: '2026-09-04', picks: [game, nfl, { pick: 'Stale NFL', sport: 'americanfootball_nfl' }] }]
        : [{ week_start: '2026-09-01', picks: [nfl] }],
    )));
    expect(await fetchTodayGamePicks()).toEqual([game, nfl]);
  });

  it('reproduces the August 25 stored week: Saturday shows its two games rather than all sixteen', async () => {
    vi.mocked(todayEST).mockReturnValue('2026-08-29');
    const weekly = [
      ...Array.from({ length: 4 }, (_, i) => ({ pick: `Thursday ${i}`, commence_time: '2026-08-27T23:00:00Z' })),
      ...Array.from({ length: 10 }, (_, i) => ({ pick: `Friday ${i}`, commence_time: '2026-08-28T23:00:00Z' })),
      ...Array.from({ length: 2 }, (_, i) => ({ pick: `Saturday ${i}`, commence_time: '2026-08-29T23:00:00Z' })),
    ];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => Response.json(
      new URL(input).pathname.endsWith('/daily_picks') ? [] : [{ week_start: '2026-08-25', picks: weekly }],
    )));
    expect((await fetchTodayGamePicks()).map(p => p.pick)).toEqual(['Saturday 0', 'Saturday 1']);
  });
});
