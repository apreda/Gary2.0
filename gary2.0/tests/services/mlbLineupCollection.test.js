import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => http } }));
process.env.BALLDONTLIE_API_KEY ||= 'test-key';
const { ballDontLieService: bdl } = await import('../../src/services/ballDontLieService.js');
const page = (rows, next = null) => ({ data: { data: rows, meta: { next_cursor: next } } });
const entry = (id, order, probable = false) => ({ team: { id: 1, abbreviation: 'BAL' }, player: { id, full_name: `Player ${id}` }, batting_order: order, position: probable ? 'SP' : 'OF', is_probable_pitcher: probable });

beforeEach(() => { bdl.clearCache(); http.get.mockReset(); });

describe('MLB complete lineup and strict optional errors', () => {
  it('reads a second page and caches only a complete lineup with original game filters', async () => {
    http.get.mockResolvedValueOnce(page([entry(10, 1)], 7)).mockResolvedValueOnce(page([entry(11, 2), entry(20, null, true)]));
    const lineup = await bdl.getMlbLineups(100, { throwOnError: true });
    expect(lineup.BAL.batters).toHaveLength(2);
    expect(lineup.BAL.pitcher.playerId).toBe(20);
    const url = new URL(http.get.mock.calls[1][0]);
    expect(url.searchParams.getAll('game_ids[]')).toEqual(['100']);
    expect(url.searchParams.get('cursor')).toBe('7');
    await bdl.getMlbLineups(100, { throwOnError: true });
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('distinguishes successful not-yet-posted sheets from a failed second page, and never caches a partial sheet', async () => {
    http.get.mockResolvedValueOnce(page([]));
    expect(await bdl.getMlbLineups(100, { throwOnError: true })).toBeNull();
    http.get.mockResolvedValueOnce(page([entry(10, 1)], 7)).mockRejectedValueOnce(new Error('page failed'));
    await expect(bdl.getMlbLineups(101, { throwOnError: true })).rejects.toThrow('page failed');
    http.get.mockResolvedValueOnce(page([entry(11, 1)]));
    expect((await bdl.getMlbLineups(101, { throwOnError: true })).BAL.batters[0].playerId).toBe(11);
    expect(new URL(http.get.mock.calls[3][0]).searchParams.has('cursor')).toBe(false);
  });

  it('retains conflict rejection when different probable pitchers arrive on separate pages', async () => {
    http.get.mockResolvedValueOnce(page([entry(20, null, true)], 7)).mockResolvedValueOnce(page([entry(21, null, true)]));
    const lineup = await bdl.getMlbLineups(100, { throwOnError: true });
    expect(lineup.BAL.pitcher).toBeNull();
    expect(lineup.BAL._pitcherConflict).toBe(true);
  });

  it('rejects incomplete and malformed collections while preserving legacy failure return values', async () => {
    http.get.mockResolvedValueOnce(page([entry(10, 1)], 7)).mockResolvedValueOnce(page([], 8));
    await expect(bdl.getMlbLineups(100, { throwOnError: true })).rejects.toThrow('empty nonterminal');
    http.get.mockResolvedValueOnce(page([null]));
    expect(await bdl.getMlbLineups(100)).toBeNull();
    http.get.mockRejectedValueOnce(new Error('season transport failed'));
    await expect(bdl.getMlbPlayerSeasonStats({ season: 2026, throwOnError: true })).rejects.toThrow('season transport');
    http.get.mockResolvedValueOnce(page([null]));
    expect(await bdl.getMlbPlayerSeasonStats({ season: 2026 })).toEqual([]);
  });

  it('strict player identities never cache a failed later page, and leave the caller ID list unchanged', async () => {
    const ids = [20, 10];
    http.get.mockResolvedValueOnce(page([{ id: 10, full_name: 'One Player' }], 7)).mockRejectedValueOnce(new Error('identity page failed'));
    await expect(bdl.getMlbPlayersByIds(ids, { throwOnError: true })).rejects.toThrow('identity page failed');
    expect(ids).toEqual([20, 10]);
    http.get.mockResolvedValueOnce(page([{ id: 10, full_name: 'One Player' }], 7)).mockResolvedValueOnce(page([{ id: 20, full_name: 'Second Player' }]));
    expect(Object.keys(await bdl.getMlbPlayersByIds(ids, { throwOnError: true }))).toEqual(['10', '20']);
    expect(new URL(http.get.mock.calls[2][0]).searchParams.has('cursor')).toBe(false);
  });

  it('rejects repeated identity cursors and preserves the legacy empty-map failure result', async () => {
    http.get.mockResolvedValueOnce(page([{ id: 10, full_name: 'One Player' }], 7)).mockResolvedValueOnce(page([{ id: 20, full_name: 'Second Player' }], 7));
    await expect(bdl.getMlbPlayersByIds([10, 20], { throwOnError: true })).rejects.toThrow('repeated');
    http.get.mockRejectedValueOnce(new Error('identity outage'));
    expect(await bdl.getMlbPlayersByIds([10, 20])).toEqual({});
  });

  it('does not resolve conflicting identity rows by taking the last page', async () => {
    http.get.mockResolvedValueOnce(page([{ id: 10, full_name: 'One Player', team: { id: 1 } }], 7)).mockResolvedValueOnce(page([{ id: 10, full_name: 'One Player', team: { id: 2 } }]));
    await expect(bdl.getMlbPlayersByIds([10], { throwOnError: true })).rejects.toThrow('Conflicting MLB player identity');
  });
});
