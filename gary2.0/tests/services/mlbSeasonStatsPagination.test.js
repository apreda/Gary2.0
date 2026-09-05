import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => http } }));
process.env.BALLDONTLIE_API_KEY ||= 'test-key';
const { ballDontLieService: bdl, getCachedOrFetch } = await import('../../src/services/ballDontLieService.js');
const page = (rows, next = null) => ({ data: { data: rows, meta: { next_cursor: next } } });
const args = { season: 2026, playerIds: [11, 22], teamId: 8, postseason: true, perPage: 100 };

beforeEach(() => {
  bdl.clearCache();
  http.get.mockReset();
});

describe('MLB season stats complete pagination', () => {
  it('follows every cursor with original filters, then caches the complete result', async () => {
    const first = Array.from({ length: 100 }, (_, id) => ({ id }));
    const second = [{ id: 101 }];
    http.get.mockResolvedValueOnce(page(first, 900)).mockResolvedValueOnce(page(second));
    expect(await bdl.getMlbPlayerSeasonStats(args)).toEqual([...first, ...second]);
    const urls = http.get.mock.calls.map(([url]) => new URL(url));
    for (const url of urls) {
      expect(url.searchParams.get('season')).toBe('2026');
      expect(url.searchParams.getAll('player_ids[]')).toEqual(['11', '22']);
      expect(url.searchParams.get('team_id')).toBe('8');
      expect(url.searchParams.get('postseason')).toBe('true');
      expect(url.searchParams.get('per_page')).toBe('100');
    }
    expect(urls[0].searchParams.has('cursor')).toBe(false);
    expect(urls[1].searchParams.get('cursor')).toBe('900');
    expect(await bdl.getMlbPlayerSeasonStats(args)).toHaveLength(101);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('does not cache page one when page two fails; a later attempt starts from page one', async () => {
    const failed = Object.assign(new Error('HTTP 500'), { response: { status: 500 } });
    http.get.mockResolvedValueOnce(page([{ id: 1 }], 7)).mockRejectedValueOnce(failed)
      .mockResolvedValueOnce(page([{ id: 1 }], 7)).mockResolvedValueOnce(page([{ id: 2 }]));
    expect(await bdl.getMlbPlayerSeasonStats(args)).toEqual([]);
    expect(await bdl.getMlbPlayerSeasonStats(args)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(new URL(http.get.mock.calls[2][0]).searchParams.has('cursor')).toBe(false);
    expect(http.get).toHaveBeenCalledTimes(4);
  });

  it('rejects repeated cursors and malformed pages instead of publishing partial rows', async () => {
    http.get.mockResolvedValueOnce(page([{ id: 1 }], 7)).mockResolvedValueOnce(page([{ id: 2 }], '7'));
    expect(await bdl.getMlbPlayerSeasonStats(args)).toEqual([]);
    http.get.mockResolvedValueOnce(page([{ id: 1 }], 7)).mockResolvedValueOnce({ data: { meta: {} } });
    expect(await bdl.getMlbPlayerSeasonStats(args)).toEqual([]);
    expect(http.get).toHaveBeenCalledTimes(4);
  });

  it('ignores old truncated cache entries without clearing unrelated cached data', async () => {
    const oldKey = 'mlb_season_stats_2026_11,22_8_true_100';
    await getCachedOrFetch(oldKey, async () => [{ id: 'old-first-page' }], 30);
    await getCachedOrFetch('unrelated_cache', async () => 'keep-me', 30);
    http.get.mockResolvedValueOnce(page([{ id: 1 }], 7)).mockResolvedValueOnce(page([{ id: 2 }]));
    expect(await bdl.getMlbPlayerSeasonStats(args)).toEqual([{ id: 1 }, { id: 2 }]);
    expect(await getCachedOrFetch('unrelated_cache', async () => 'overwritten', 30)).toBe('keep-me');
    expect(http.get).toHaveBeenCalledTimes(2);
  });
});
