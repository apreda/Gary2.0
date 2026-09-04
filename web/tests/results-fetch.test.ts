import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRecord, fetchGameResultsForDate } from '@/lib/gary/results';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGameResultsForDate', () => {
  it('uses authoritative NFL results and the public record policy within the requested date', async () => {
    const date = '2026-09-03';
    const mlb = { game_date: date, league: 'MLB', matchup: 'Cubs @ Reds', pick_text: 'Cubs ML -110', result: 'won' };
    const nfl = { game_date: date, matchup: 'Chiefs @ Bills', pick_text: 'Chiefs ML -120', result: 'lost', season_type: 2 };
    const tables = {
      game_results: [
        mlb,
        { ...mlb }, // A re-grade duplicate must not add another win.
        { ...nfl, league: 'NFL', result: 'won' }, // Legacy strays are not authoritative.
        { ...mlb, game_date: '2026-09-02' },
        { ...mlb, game_date: '2026-09-04' },
      ],
      nfl_results: [
        nfl,
        { ...nfl, matchup: 'Raiders @ Rams', season_type: 1, result: 'won' },
        { ...nfl, game_date: '2026-09-02' },
        { ...nfl, game_date: '2026-09-04' },
      ],
    };
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      const table = url.pathname.split('/').at(-1) ?? '';
      if (table !== 'game_results' && table !== 'nfl_results') throw new Error(`Unexpected table: ${table}`);
      const dateFilter = url.searchParams.get('game_date');
      return Response.json(tables[table].filter(row => !dateFilter || dateFilter === `eq.${row.game_date}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const rows = await fetchGameResultsForDate(date, 120);

    expect(rows).toEqual([{ ...nfl, league: 'NFL' }, mlb]);
    expect(computeRecord(rows)).toMatchObject({ wins: 1, losses: 1, graded: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [input] of fetchMock.mock.calls) {
      expect(new URL(input).searchParams.get('game_date')).toBe(`eq.${date}`);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/nfl_results?select=game_date,matchup,pick_text,result,final_score,confidence,week_number,season,season_type'),
      expect.objectContaining({ next: { revalidate: 120 } }),
    );
  });

  it('rejects an unavailable NFL source instead of returning a partial receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) =>
      new URL(input).pathname.endsWith('/nfl_results')
        ? new Response(null, { status: 503 })
        : Response.json([]),
    ));

    await expect(fetchGameResultsForDate('2026-09-03')).rejects.toThrow('PostgREST 503: nfl_results');
  });
});
