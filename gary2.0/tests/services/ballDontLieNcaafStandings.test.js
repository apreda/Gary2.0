import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../src/services/ballDontLieService.js';

// The college standings route answers ONE conference per call
// (/ncaaf/v1/standings?season&conference_id). This is the NCAAF-owned reader
// for it — the generic standings method deliberately refuses NCAAF.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getNcaafStandings', () => {
  it('reads one conference table for the season', async () => {
    const rows = [{ team: { id: 13, abbreviation: 'STAN' }, wins: 4, losses: 1, home_record: '3-0', away_record: '1-1' }];
    const fetchStub = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: rows }),
    });

    const result = await ballDontLieService.getNcaafStandings(2026, 1, 0);

    expect(result).toEqual(rows);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const url = String(fetchStub.mock.calls[0][0]);
    expect(url).toContain('/ncaaf/v1/standings');
    expect(url).toContain('season=2026');
    expect(url).toContain('conference_id=1');
  });

  it('never calls the route without a season and a conference', async () => {
    const fetchStub = vi.spyOn(globalThis, 'fetch');
    expect(await ballDontLieService.getNcaafStandings(2026, null, 0)).toEqual([]);
    expect(await ballDontLieService.getNcaafStandings(null, 1, 0)).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns an empty table on a provider error instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await ballDontLieService.getNcaafStandings(2026, 2, 0)).toEqual([]);
  });
});
