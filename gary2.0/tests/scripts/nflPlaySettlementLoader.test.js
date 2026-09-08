import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { isFinalGameStatus } from '../../scripts/lib/resultsGradingReliability.js';

const source = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const declaration = source.slice(source.indexOf('async function fetchNFLPlayEvidence('), source.indexOf('\nasync function fetchNFLStats('));
const rows = [{ player: { id: 1 }, _game_id: '99', _football_box_complete: true }];
const play = id => ({ id: String(id), game: { id: 99, status: 'Final' } });

function loader(provider, date = Date) {
  const cache = { stats: new Map() };
  const evidence = { gameId: '99', anytimeTouchdowns: { 1: 1 } };
  const buildNflPlaySettlement = vi.fn(() => evidence);
  const fetch = vi.fn(provider);
  const load = vm.runInNewContext(`(${declaration})`, {
    cache, bdlFetch: fetch, Date: date, console: { warn() {} }, isFinalGameStatus, buildNflPlaySettlement,
  });
  return { cache, buildNflPlaySettlement, fetch, load, evidence };
}

describe('the actual NFL play loader requires complete exact-game final evidence', () => {
  it('fetches all pages through the existing limiter/deadline and caches only final evidence', async () => {
    const h = loader((_path, params) => params.includes('cursor=2')
      ? { data: [play(2)], meta: { next_cursor: null } }
      : { data: [play(1)], meta: { next_cursor: 2 } });
    expect(await h.load('99', rows)).toBe(h.evidence);
    expect(h.buildNflPlaySettlement).toHaveBeenCalledWith({ gameId: '99', plays: [play(1), play(2)],
      playerStats: rows, playsComplete: true, boxComplete: true });
    expect(h.fetch).toHaveBeenCalledTimes(2);
    for (const [path, params, options] of h.fetch.mock.calls) {
      expect(path).toBe('nfl/v1/plays');
      expect(params).toContain('game_id=99&per_page=100');
      expect(options).toMatchObject({ rateLimit: true, timeoutMs: 20000 });
      expect(options.deadlineAt).toBeGreaterThan(Date.now());
    }
    await h.load('99', rows);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['empty', 'malformed', 'throw', 'partial', 'wrong-game', 'missing-game', 'not-final', 'duplicate', 'repeated-cursor', 'empty-nonterminal', 'cursor-limit'])(
    'does not build or retain %s evidence', async mode => {
      let count = 0;
      const h = loader((_path, params) => {
        count++;
        if (mode === 'empty') return { data: [] };
        if (mode === 'malformed') return {};
        if (mode === 'throw') throw new Error('fixture timeout');
        if (mode === 'wrong-game') return { data: [{ ...play(1), game: { id: 100, status: 'Final' } }] };
        if (mode === 'missing-game') return { data: [{ id: '1' }] };
        if (mode === 'not-final') return { data: [{ ...play(1), game: { id: 99, status: 'In Progress' } }] };
        if (!params.includes('cursor=')) return { data: [play(1)], meta: { next_cursor: 2 } };
        if (mode === 'partial') return null;
        if (mode === 'duplicate') return { data: [play(1)] };
        if (mode === 'repeated-cursor') return { data: [play(2)], meta: { next_cursor: 2 } };
        if (mode === 'empty-nonterminal') return { data: [], meta: { next_cursor: 3 } };
        return { data: [play(count)], meta: { next_cursor: count + 1 } };
      });
      expect(await h.load('99', rows)).toBeNull();
      expect(h.buildNflPlaySettlement).not.toHaveBeenCalled();
      expect(h.cache.stats.size).toBe(0);
      const before = h.fetch.mock.calls.length;
      await h.load('99', rows);
      expect(h.fetch.mock.calls.length).toBeGreaterThan(before);
    },
  );

  it('does not open a provider lane with an incomplete or wrong-game box', async () => {
    const h = loader(() => { throw new Error('unexpected fetch'); });
    expect(await h.load('99', [])).toBeNull();
    expect(await h.load('99', [{ ...rows[0], _football_box_complete: false }])).toBeNull();
    expect(await h.load('99', [{ ...rows[0], _game_id: '100' }])).toBeNull();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('stops following cursors after the shared overall deadline', async () => {
    let now = 0;
    const h = loader(() => { now = 120001; return { data: [play(1)], meta: { next_cursor: 2 } }; }, { now: () => now });
    expect(await h.load('99', rows)).toBeNull();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.cache.stats.size).toBe(0);
  });
});

describe('the real provider adapter enforces optional settlement evidence limits', () => {
  const adapterSource = source.slice(source.indexOf('async function bdlFetch('), source.indexOf('\nasync function fetchGames('));
  it('applies the existing request gate before setting the remaining request timeout', async () => {
    const calls = [];
    const fetch = vi.fn(async (_url, options) => { calls.push('fetch'); expect(options.signal).toBe('fixture-signal');
      return { ok: true, json: async () => ({ data: [] }) }; });
    const deadlineSignal = { throwIfAborted() {} };
    const timeout = vi.fn().mockReturnValueOnce(deadlineSignal).mockReturnValue('fixture-signal');
    const run = vm.runInNewContext(`(${adapterSource})`, { RUN_OPTIONS: {}, BDL_API_KEY: 'fixture',
      waitForBdlRequestSlot: async (_label, options) => { calls.push('gate'); expect(options.signal).toBe(deadlineSignal); }, fetch, Date: { now: () => 115000 },
      AbortSignal: { timeout }, console: { warn() {} } });
    expect(await run('nfl/v1/plays', 'game_id=99', { rateLimit: true, timeoutMs: 20000, deadlineAt: 120000 })).toEqual({ data: [] });
    expect(calls).toEqual(['gate', 'fetch']);
    expect(timeout).toHaveBeenNthCalledWith(1, 5000);
    expect(timeout).toHaveBeenNthCalledWith(2, 5000);
  });
  it('does not start a request if the deadline passed while waiting for its slot', async () => {
    const fetch = vi.fn();
    const run = vm.runInNewContext(`(${adapterSource})`, { RUN_OPTIONS: {}, BDL_API_KEY: 'fixture', AbortSignal,
      waitForBdlRequestSlot: async () => {}, fetch, Date: { now: () => 120001 }, console: { warn() {} } });
    expect(await run('nfl/v1/plays', 'game_id=99', { rateLimit: true, timeoutMs: 20000, deadlineAt: 120000 })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts a gate that is still waiting at the deadline and does not start a retry', async () => {
    const fetch = vi.fn();
    const gate = vi.fn(async (_label, { signal }) => new Promise((resolve, reject) => {
      if (!signal) throw new Error('missing overall deadline signal');
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const run = vm.runInNewContext(`(${adapterSource})`, { RUN_OPTIONS: { footballSettlements: true }, BDL_API_KEY: 'fixture',
      waitForBdlRequestSlot: gate, fetch, Date, AbortSignal, console: { warn() {} } });
    await expect(run('nfl/v1/plays', 'game_id=99', { rateLimit: true, timeoutMs: 20000, deadlineAt: Date.now() + 25 })).rejects.toThrow('failed after 1 attempt');
    expect(gate).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
