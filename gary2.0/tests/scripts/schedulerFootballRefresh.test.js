import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ballDontLieService } from '../../src/services/ballDontLieService.js';
import { classifyNcaafFbsGames, ncaafSlateDateForKickoff, resolveNcaafKickoff } from '../../src/services/ncaafGamePolicy.js';
import { nflSlateDateForKickoff, resolveNflKickoff } from '../../src/services/nflGamePolicy.js';
import { partitionNcaafKickoffReadiness, partitionNflKickoffReadiness } from '../../scripts/lib/schedulerPolicy.js';

// Exercise the actual scheduler lookup without importing its daemon startup.
// Only its dynamic service import is replaced by the real injected service;
// transport, pagination, identity and kickoff policies execute unchanged.
const source = readFileSync(new URL('../../scripts/scheduler.js', import.meta.url), 'utf8');
const start = source.indexOf('async function fetchGamesForETDate(');
const declaration = source.slice(start, source.indexOf('\n}\n', start) + 2)
  .replace("const { ballDontLieService } = await import('../src/services/ballDontLieService.js');", '');
const log = vi.fn();
const lookup = vm.runInNewContext(`(${declaration})`, {
  AbortController, DOMException,
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (...args) => clearTimeout(...args),
  ballDontLieService, log, classifyNcaafFbsGames, ncaafSlateDateForKickoff, resolveNcaafKickoff,
  nflSlateDateForKickoff, resolveNflKickoff, partitionNcaafKickoffReadiness, partitionNflKickoffReadiness,
  addDaysISO: (day, count) => new Date(Date.parse(day + 'T00:00:00Z') + count * 86400000).toISOString().slice(0, 10),
});

const game = (id, date = '2026-09-05T16:00:00Z') => ({
  id, date,
  home_team: { id: 11, conference_id: 1 },
  visitor_team: { id: 22, conference_id: 1 },
});
const page = (data, next_cursor = null) => ({ ok: true, json: async () => ({ data, meta: { next_cursor } }) });

beforeEach(() => {
  ballDontLieService.clearCache();
  vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn());
  log.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded football kickoff refresh', () => {
  it('uses supported dates over every needed page and returns only the requested exact IDs', async () => {
    fetch.mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => game(i + 1)), 100))
      .mockResolvedValueOnce(page([game(101, '2026-09-06T01:00:00Z'), game(102)]));
    const outcome = await lookup('americanfootball_ncaaf', '2026-09-05', { gameIds: ['2', '101', '2'] });
    expect(outcome.games.map(entry => entry.raw.id)).toEqual([2, 101]);
    expect(outcome.retryGameIds).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url] of fetch.mock.calls) {
      const params = new URL(url).searchParams;
      expect(params.getAll('dates[]')).toEqual(['2026-09-05', '2026-09-06']);
      expect(params.has('game_ids[]')).toBe(false);
      expect(params.has('paginationMaxPages')).toBe(false);
    }
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('cursor')).toBe('100');
  });

  it('keeps missing and date-only IDs retryable without admitting a different game', async () => {
    fetch.mockResolvedValue(page([game(1), game(2, '2026-09-05'), game(999)]));
    const outcome = await lookup('americanfootball_ncaaf', '2026-09-05', { gameIds: ['1', '2', '3'] });
    expect(outcome.games.map(entry => entry.raw.id)).toEqual([1]);
    expect(outcome.retryGameIds).toEqual(['2', '3']);
    expect(outcome.retryAll).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed after five pages instead of accepting a partial or unfiltered historical catalog', async () => {
    fetch.mockImplementation(async () => page([game(fetch.mock.calls.length, '2004-08-28T23:40:00Z')], fetch.mock.calls.length));
    const outcome = await lookup('americanfootball_ncaaf', '2026-09-05', { gameIds: ['457178'] });
    expect(outcome).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(log.mock.calls.flat().join(' ')).toContain('pagination exceeded 5 pages');
  });

  it('refreshes the next kickoff response without reusing a previous exact-refresh cache entry', async () => {
    fetch.mockResolvedValueOnce(page([game(1)]))
      .mockResolvedValueOnce(page([game(1, '2026-09-05T18:00:00Z')]));
    const first = await lookup('americanfootball_ncaaf', '2026-09-05', { gameIds: ['1'] });
    const second = await lookup('americanfootball_ncaaf', '2026-09-05', { gameIds: ['1'] });
    expect(first.games[0].startTime.toISOString()).toBe('2026-09-05T16:00:00.000Z');
    expect(second.games[0].startTime.toISOString()).toBe('2026-09-05T18:00:00.000Z');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves NFL preseason discovery while filtering exact IDs locally', async () => {
    fetch.mockResolvedValue(page([game(1), game(2)]));
    const outcome = await lookup('americanfootball_nfl', '2026-09-05', { gameIds: ['2'] });
    expect(outcome.games.map(entry => entry.raw.id)).toEqual([2]);
    const params = new URL(fetch.mock.calls[0][0]).searchParams;
    expect(params.getAll('dates[]')).toEqual(['2026-09-05', '2026-09-06']);
    expect(params.getAll('season_type[]')).toEqual(['1', '2', '3']);
    expect(params.has('game_ids[]')).toBe(false);
  });

  it('retains full date-slate discovery when no exact ID is requested', async () => {
    fetch.mockResolvedValue(page([game(1), game(2)]));
    const outcome = await lookup('americanfootball_ncaaf', '2026-09-05');
    expect(outcome.games.map(entry => entry.raw.id)).toEqual([1, 2]);
    expect(outcome.retryGameIds).toEqual([]);
  });

  it.each([[], ['1']])('bounds discovery and exact refresh HTTP by the total lookup deadline (%j)', async (gameIds) => {
    vi.useFakeTimers();
    let httpSignal;
    fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      httpSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const task = lookup('americanfootball_ncaaf', '2026-09-05', { gameIds });
    await vi.advanceTimersByTimeAsync(120000);
    expect(await task).toBeNull();
    expect(httpSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join(' ')).toContain('120-second deadline');
    expect(vi.getTimerCount()).toBe(0);
  });
});
