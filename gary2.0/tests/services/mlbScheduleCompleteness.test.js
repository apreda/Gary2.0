import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let getMlbSchedule;
const fetcher = vi.fn();
beforeEach(async () => {
  vi.resetModules();
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
  ({ getMlbSchedule } = await import('../../src/services/mlbStatsApiService.js'));
});
afterEach(() => vi.unstubAllGlobals());
const reply = body => ({ ok: true, json: async () => body });

describe('mandatory MLB schedule collections', () => {
  it('propagates transport failure and rejects malformed bodies instead of caching an empty schedule', async () => {
    fetcher.mockRejectedValueOnce(new Error('schedule outage'));
    await expect(getMlbSchedule('2026-09-07', { throwOnError: true })).rejects.toThrow('schedule outage');
    fetcher.mockResolvedValueOnce(reply({ status: 'unknown' }));
    await expect(getMlbSchedule('2026-09-07', { throwOnError: true })).rejects.toThrow('invalid collection');
    fetcher.mockResolvedValueOnce(reply({ dates: [] }));
    expect(await getMlbSchedule('2026-09-07', { throwOnError: true })).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not let a permissive legacy cached empty body satisfy a strict collection', async () => {
    fetcher.mockResolvedValueOnce(reply({}));
    expect(await getMlbSchedule('2026-09-07')).toEqual([]);
    fetcher.mockResolvedValueOnce(reply({ dates: [{ games: [{ gamePk: 700 }] }] }));
    expect(await getMlbSchedule('2026-09-07', { throwOnError: true })).toEqual([{ gamePk: 700 }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed date/game row', async () => {
    fetcher.mockResolvedValueOnce(reply({ dates: [{ games: [{ gamePk: 700 }, null] }] }));
    await expect(getMlbSchedule('2026-09-07', { throwOnError: true })).rejects.toThrow('invalid collection');
  });
});
