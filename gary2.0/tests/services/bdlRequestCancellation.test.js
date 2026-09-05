import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const hooks = vi.hoisted(() => ({ afterRead: null }));
vi.mock('node:fs/promises', async (original) => {
  const real = await original();
  return { ...real, readFile: async (...args) => {
    const value = await real.readFile(...args);
    hooks.afterRead?.();
    return value;
  } };
});
import { waitForBdlRequestSlot } from '../../src/services/bdlRequestGate.js';
import { ballDontLieService, getCachedOrFetch } from '../../src/services/ballDontLieService.js';

let directory;
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const page = (id, next_cursor = null) => ({ ok: true, json: async () => ({ data: [{ id, date: '2099-09-05T16:00:00Z' }], meta: { next_cursor } }) });
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'gary-bdl-cancel-'));
  // Exercise the actual production gate against an isolated directory, not
  // the normal Vitest bypass or the running application's coordination file.
  vi.stubEnv('VITEST', '');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('GARY_BDL_RATE_GATE_DISABLED', '0');
  vi.stubEnv('GARY_BDL_RATE_GATE_DIR', directory);
  vi.stubEnv('GARY_BDL_SHARED_CACHE_DISABLED', '1');
  ballDontLieService.clearCache();
  vi.spyOn(ballDontLieService, '_getSportClient').mockReturnValue(null);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(async () => {
  hooks.afterRead = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe('bounded BDL transport cancellation with the real gate enabled', () => {
  it('stops a slot wait immediately without reserving a later slot', async () => {
    const state = JSON.stringify({ version: 2, nextAt: Date.now() + 20000 });
    await writeFile(join(directory, 'state.json'), state);
    const controller = new AbortController();
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), 75);
    try { await expect(waitForBdlRequestSlot('cancel-test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { clearTimeout(timer); }
    expect(Date.now() - started).toBeLessThan(1000);
    expect(await readFile(join(directory, 'state.json'), 'utf8')).toBe(state);
    expect(await exists(join(directory, 'lock'))).toBe(false);
  });

  it('does not remove another caller’s lock while cancelling lock contention', async () => {
    await mkdir(join(directory, 'lock'));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75);
    try { await expect(waitForBdlRequestSlot('lock-test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { clearTimeout(timer); }
    expect(await exists(join(directory, 'lock'))).toBe(true);
    expect(await exists(join(directory, 'state.json'))).toBe(false);
  });

  it('releases its own lock if cancelled while reading the shared clock', async () => {
    const state = JSON.stringify({ version: 2, nextAt: 0 });
    await writeFile(join(directory, 'state.json'), state);
    const controller = new AbortController();
    hooks.afterRead = () => controller.abort();
    await expect(waitForBdlRequestSlot('held-lock-test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    hooks.afterRead = null;
    expect(await exists(join(directory, 'lock'))).toBe(false);
    expect(await readFile(join(directory, 'state.json'), 'utf8')).toBe(state);
  });

  it('cancels the first games gate before making any HTTP request', async () => {
    await writeFile(join(directory, 'state.json'), JSON.stringify({ nextAt: Date.now() + 20000 }));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75);
    try { await expect(ballDontLieService.getGames('americanfootball_ncaaf', { dates: ['2099-09-05'] }, 0, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { clearTimeout(timer); }
    expect(fetch).not.toHaveBeenCalled();
    expect(await exists(join(directory, 'lock'))).toBe(false);
  });

  it('stops before page two and never caches page one as a complete snapshot', async () => {
    const controller = new AbortController();
    const params = { dates: ['2099-09-05'], paginationMaxPages: 5 };
    let timer;
    fetch.mockImplementationOnce(async () => {
      timer = setTimeout(() => controller.abort(), 75);
      return page(1, 123);
    });
    try { await expect(ballDontLieService.getGames('americanfootball_ncaaf', params, 10, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { clearTimeout(timer); }
    expect(fetch).toHaveBeenCalledTimes(1);
    await writeFile(join(directory, 'state.json'), '{}');
    fetch.mockResolvedValueOnce(page(99));
    expect((await ballDontLieService.getGames('americanfootball_ncaaf', params, 10)).map(row => row.id)).toEqual([99]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('uses abortable native HTTP instead of the SDK and excludes signal from query parameters', async () => {
    const sdkGetGames = vi.fn();
    ballDontLieService._getSportClient.mockReturnValue({ getGames: sdkGetGames });
    const controller = new AbortController();
    fetch.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      controller.abort();
    }));
    await expect(ballDontLieService.getGames('americanfootball_nfl', { dates: ['2099-09-05'] }, 0, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(sdkGetGames).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).not.toContain('signal');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('stops a transient retry backoff without starting another transport', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const timer = setTimeout(() => controller.abort(), 75);
    try { await expect(getCachedOrFetch('isolated_retry', fetcher, 0, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' }); }
    finally { clearTimeout(timer); }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps signalled team transports independent so one cancellation cannot wait on or cancel another', async () => {
    vi.stubEnv('GARY_BDL_RATE_GATE_DISABLED', '1');
    const firstController = new AbortController();
    const secondController = new AbortController();
    let finishFirst;
    fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
      const requestedTeam = new URL(url).searchParams.get('team_ids[]');
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      if (requestedTeam === '11') finishFirst = () => resolve(page(11));
    }));
    const first = ballDontLieService.getGames('americanfootball_nfl', { team_ids: [11], seasons: [2099], per_page: 100 }, 0, { signal: firstController.signal });
    const second = ballDontLieService.getGames('americanfootball_nfl', { team_ids: [22], seasons: [2099], per_page: 100 }, 0, { signal: secondController.signal });
    const cancelled = expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.getAll('team_ids[]'))).toEqual([['11'], ['22']]);
    secondController.abort();
    await cancelled;
    expect(firstController.signal.aborted).toBe(false);
    finishFirst();
    expect((await first).map(row => row.id)).toEqual([11]);
  });
});
