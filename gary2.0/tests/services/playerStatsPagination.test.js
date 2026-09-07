import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const get = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { create: () => ({ get }), get } }));
import { ballDontLieService as bdl } from '../../src/services/ballDontLieService.js';
import { fetchBdlPages } from '../../src/services/bdlPagination.js';

const response = (data, next_cursor = null) => ({ data: { data, meta: { next_cursor } } });
const nfl = (id, date, yards, extra = {}) => ({
  player: { id: 7 }, team: { id: 9 }, game: { id, date, season: 2025, status: 'Final' },
  passing_yards: yards, ...extra,
});
const options = { asOf: new Date('2026-02-01'), throwOnError: true };

beforeEach(() => { bdl.clearCache(); get.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe('complete player-stat transport and request-specific samples', () => {
  it('does not hide a matching player beyond the first identity page', async () => {
    get.mockResolvedValueOnce(response([{ id: 1, first_name: 'Carlos', last_name: 'Wilson' }], 100))
      .mockResolvedValueOnce(response([{ id: 2, first_name: 'Carlos', last_name: 'Del Rio-Wilson' }]));
    const players = await bdl.getPlayersGeneric('americanfootball_ncaaf',
      { first_name: 'Carlos', last_name: 'Wilson' }, 10, { complete: true, throwOnError: true });
    expect(players.map(p => p.id)).toEqual([1, 2]);
    expect(new URL(get.mock.calls[1][0]).searchParams.get('cursor')).toBe('100');
  });

  it('paginates the single-player fallback before choosing the latest NFL games', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('Batch filter unsupported'), { response: { status: 400 } }));
    get.mockImplementation(async url => {
      const q = new URL(url).searchParams;
      if (q.get('player_ids[]') === '8') return response([]);
      return q.has('cursor') ? response([nfl(2, '2025-12-20', 321)])
        : response([nfl(1, '2025-09-01', 100)], 42);
    });
    const logs = await bdl.getNflPlayerGameLogsBatch([7, 8], 2025, 1, 15, options);
    expect(logs[7].games.map(g => g.pass_yds)).toEqual([321]);
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('reuses raw NFL rows across historical cutoffs and sample sizes', async () => {
    get.mockResolvedValue(response([nfl(1, '2025-09-01', 100), nfl(2, '2025-10-01', 200), nfl(3, '2025-12-01', 300)]));
    const later = await bdl.getNflPlayerGameLogsBatch([7], 2025, 1, 15, options);
    const earlier = await bdl.getNflPlayerGameLogsBatch([7], 2025, 2, 15, { ...options, asOf: new Date('2025-11-01') });
    expect(later[7].games.map(g => g.pass_yds)).toEqual([300]);
    expect(earlier[7].games.map(g => g.pass_yds)).toEqual([200, 100]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('retains late-July preseason games in their stated football season', async () => {
    get.mockResolvedValue(response([nfl(1, '2025-07-31', 100)]));
    const logs = await bdl.getNflPlayerGameLogsBatch([7], 2025, 1, 15, { ...options, seasonType: 1 });
    expect(logs[7].games[0].pass_yds).toBe(100);
  });

  it('excludes wrong-season/player, future, live and conflicting NFL game rows before slicing', async () => {
    const valid = nfl(1, '2025-09-01', 123);
    get.mockResolvedValue(response([
      valid, { ...valid, id: 999 }, nfl(2, '2025-10-01', 250), nfl(2, '2025-10-01', 251),
      nfl(3, '2026-02-02', 500), nfl(4, '2024-11-01', 700),
      nfl(5, '2025-12-01', 800, { player: { id: 8 } }),
      nfl(6, '2025-12-20', 900, { game: { id: 6, date: '2025-12-20', season: 2024, status: 'Final' } }),
      nfl(7, '2025-12-21', 900, { game: { id: 7, date: '2025-12-21', season: 2025, status: 'In Progress' } }),
    ]));
    const logs = await bdl.getNflPlayerGameLogsBatch([7], 2025, 5, 15, options);
    expect(logs[7].games.map(g => g.pass_yds)).toEqual([123]);
  });

  it('does not turn repeated NFL pages into cached stats or fan out during an outage', async () => {
    get.mockResolvedValue(response([nfl(1, '2025-09-01', 123)], 42));
    await expect(bdl.getNflPlayerGameLogsBatch([7, 8], 2025, 5, 15, options)).rejects.toThrow('repeated');
    expect(get).toHaveBeenCalledTimes(2);
    get.mockResolvedValue(response([nfl(2, '2025-12-01', 234)]));
    expect((await bdl.getNflPlayerGameLogsBatch([7, 8], 2025, 5, 15, options))[7].games[0].pass_yds).toBe(234);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['NCAAF', 9, () => bdl.getNcaafPlayerGameStats({ teamId: 9, season: 2025, throwOnError: true })],
    ['MLB', 11, () => bdl.getMlbGameStats({ playerIds: [7], seasons: [2025], throwOnError: true })],
  ])('reads beyond the old %s page cap without silently truncating the collection', async (_, pages, read) => {
    get.mockImplementation(async url => {
      const page = Number(new URL(url).searchParams.get('cursor') || 1);
      return response([{ id: page, season: 2025 }], page < pages ? page + 1 : null);
    });
    const rows = await read();
    expect(rows).toHaveLength(pages);
    expect(rows.at(-1).id).toBe(pages);
    expect(get).toHaveBeenCalledTimes(pages);
  });

  it.each([
    ['NCAAF', () => bdl.getNcaafPlayerGameStats({ playerId: 7, season: 2025, throwOnError: true })],
    ['MLB stats', () => bdl.getMlbGameStats({ playerIds: [7], seasons: [2025], throwOnError: true })],
    ['MLB calendar', () => bdl.getMlbSeasonGameIndex(2025, 60, { throwOnError: true })],
  ])('rejects malformed %s responses without caching empty success', async (_, read) => {
    get.mockResolvedValueOnce({ data: { error: 'unavailable' } }).mockResolvedValue(response([]));
    await expect(read()).rejects.toThrow('invalid response shape');
    await expect(read()).resolves.toBeDefined();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('rejects a runaway collection at the cap, and malformed/repeated/nonterminal-empty cursors', async () => {
    let page = 0;
    await expect(fetchBdlPages(async () => response([{}], ++page).data, { maxPages: 2 })).rejects.toThrow('incomplete');
    for (const data of [response([], 2).data, response([{}], true).data, response([{}], '').data,
      response([null]).data, response([1]).data, response([[]]).data]) {
      await expect(fetchBdlPages(async () => data)).rejects.toThrow();
    }
  });
});
