import { afterEach, expect, it, vi } from 'vitest';
import { ballDontLieService, getCachedOrFetch } from '../../src/services/ballDontLieService.js';
import { ballDontLieService as compatibilityService } from '../../src/services/ballDontLie/index.js';
import { getCachedOrFetch as providerCache } from '../../src/services/bdl/transport.js';

afterEach(() => { ballDontLieService.clearCache(); vi.restoreAllMocks(); });

it('shares single-flight and cache invalidation across public and internal entry points', async () => {
  let finish;
  const fetchRows = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const first = getCachedOrFetch('ownership-contract', fetchRows);
  const second = providerCache('ownership-contract', fetchRows);
  finish([{ id: 4 }]);
  expect(await first).toEqual([{ id: 4 }]);
  expect(await second).toEqual([{ id: 4 }]);
  expect(fetchRows).toHaveBeenCalledTimes(1);
  expect(await providerCache('ownership-contract', fetchRows)).toEqual([{ id: 4 }]);
  compatibilityService.clearCache();
  const refreshed = vi.fn(async () => [{ id: 5 }]);
  expect(await providerCache('ownership-contract', refreshed)).toEqual([{ id: 5 }]);
  expect(refreshed).toHaveBeenCalledTimes(1);
});

it('preserves cross-family delegation on the public service object', async () => {
  const games = [{ id: 99, status: 'Final', week: 1, postseason: false }];
  const getGames = vi.spyOn(ballDontLieService, 'getGames').mockResolvedValue(games);
  await compatibilityService.nflStandingsCountable(2099);
  expect(getGames).toHaveBeenCalledWith('americanfootball_nfl', { seasons: [2099], weeks: [1], per_page: 100 });
});

it('loads the public provider under Node ESM without the test module transformer', async () => {
  const { execFileSync } = await import('node:child_process');
  const entry = new URL('../../src/services/ballDontLieService.js', import.meta.url).href;
  // Vitest can tolerate a missing named export as undefined; production Node cannot.
  const output = execFileSync(process.execPath, ['--input-type=module', '-e',
    `const { ballDontLieService } = await import(${JSON.stringify(entry)}); console.log(Object.keys(ballDontLieService).length);`],
    { env: { NODE_ENV: 'test' }, encoding: 'utf8', timeout: 10_000 });
  expect(Number(output.trim())).toBe(109);
});
