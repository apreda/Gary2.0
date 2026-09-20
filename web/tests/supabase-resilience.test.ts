import { afterEach, describe, expect, it, vi } from 'vitest';
import { rest } from '@/lib/gary/supabase';

afterEach(() => vi.unstubAllGlobals());

describe('PostgREST read resilience', () => {
  it('retries a transient upstream response with a bounded request signal', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json([{ id: 7 }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(rest<{ id: number }[]>('daily_picks?select=id', { revalidate: 120 }))
      .resolves.toEqual([{ id: 7 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ next: { revalidate: 120 } });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('does not retry permanent client errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Bad query', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(rest('daily_picks?select=missing')).rejects.toThrow('PostgREST 400: daily_picks');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries transport failures without exposing the query string', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(rest('daily_picks?select=private_detail')).rejects.toThrow('PostgREST request failed: daily_picks');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
