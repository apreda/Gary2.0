import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTodayGamePicks } from '@/lib/gary/picks';

vi.mock('@/lib/gary/dates', () => ({ todayEST: () => '2026-09-04' }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTodayGamePicks', () => {
  it('starts both reads together and keeps daily picks before the current weekly picks', async () => {
    const dailyPick = { pick: 'Cubs ML -110', league: 'MLB' };
    const weeklyPick = { pick: 'Chiefs ML -120', league: 'NFL' };
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
});
