import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpGet = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: httpGet }),
    get: httpGet,
  },
}));

process.env.BALLDONTLIE_API_KEY ||= 'test-key';

const { ballDontLieService } = await import('../../src/services/ballDontLieService.js');

beforeEach(() => {
  ballDontLieService.clearCache();
  httpGet.mockReset();
});

describe('BDL odds transport health', () => {
  it('rejects a later-page failure and never caches the partial first page', async () => {
    const keyParams = { dates: ['2099-10-01'], per_page: 100 };
    const pageFailure = Object.assign(new Error('page two failed'), {
      response: { status: 500 },
    });
    httpGet
      .mockResolvedValueOnce({
        data: { data: [{ id: 1 }], meta: { next_cursor: 'page-2' } },
      })
      .mockRejectedValueOnce(pageFailure);

    await expect(ballDontLieService.getOddsV2(keyParams, 'mlb'))
      .rejects.toThrow(/page two failed/);

    httpGet.mockResolvedValueOnce({ data: { data: [], meta: { next_cursor: null } } });
    await expect(ballDontLieService.getOddsV2(keyParams, 'mlb')).resolves.toEqual([]);
    expect(httpGet).toHaveBeenCalledTimes(3);
  });

  it('rejects a malformed 2xx response, while caching an explicit empty data array', async () => {
    const keyParams = { dates: ['2099-10-02'], per_page: 100 };
    httpGet.mockResolvedValueOnce({ data: { message: 'not the odds envelope' } });

    await expect(ballDontLieService.getOddsV2(keyParams, 'mlb'))
      .rejects.toThrow(/invalid response shape/);

    httpGet.mockResolvedValueOnce({ data: { data: [], meta: { next_cursor: null } } });
    await expect(ballDontLieService.getOddsV2(keyParams, 'mlb')).resolves.toEqual([]);
    await expect(ballDontLieService.getOddsV2(keyParams, 'mlb')).resolves.toEqual([]);
    expect(httpGet).toHaveBeenCalledTimes(2);
  });
});
