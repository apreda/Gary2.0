import { describe, expect, it, vi } from 'vitest';
import { ballDontLieService as bdl } from '../../src/services/ballDontLieService.js';

describe('MLB games by Eastern date, strict mode', () => {
  it('propagates a provider failure instead of answering with an empty slate', async () => {
    const spy = vi.spyOn(bdl, 'getMlbGamesForDate').mockImplementation(async (date, options) => {
      if (options?.throwOnError) throw new Error('fixture outage');
      return [];
    });
    try {
      await expect(bdl.getMlbGamesForETDate('2026-09-06', { throwOnError: true })).rejects.toThrow('fixture outage');
      expect(await bdl.getMlbGamesForETDate('2026-09-06')).toEqual([]);
    } finally { spy.mockRestore(); }
  });
});
