import { describe, expect, it, vi } from 'vitest';

import {
  footballProofIdentity,
  replaceFootballProofRows,
} from '../../scripts/lib/footballProofStorage.js';

function row(pickId, value = 'OPEN') {
  return {
    category: 'after_gary',
    game_id: '1393562',
    headline: 'Line',
    detail: 'receipt',
    game: 'PHI @ BAL',
    value,
    tone: 'neutral',
    relevance_score: 90,
    meta: { kind: 'after_gary', pick_id: pickId },
  };
}

describe('football proof storage', () => {
  it('keys AFTER GARY once per pick', () => {
    expect(footballProofIdentity(row('pick-1'))).toBe('after_gary|1393562|pick-1');
    expect(footballProofIdentity({ category: 'after_gary', game_id: 1393562, meta: {} })).toBeNull();
    expect(footballProofIdentity({ category: 'streak', game_id: 1393562, meta: { pick_id: 'pick-1' } })).toBeNull();
  });

  it('inserts first, then deletes only stale copies of refreshed identities', async () => {
    const calls = [];
    const client = Object.assign(vi.fn(async (request) => {
      calls.push(request);
      return { data: [] };
    }), {
      get: vi.fn(async () => ({
        data: [
          { id: 10, ...row('pick-1', 'OLD') },
          { id: 11, ...row('pick-2', 'LAST GOOD') },
        ],
      })),
    });

    const result = await replaceFootballProofRows({
      httpClient: client,
      restUrl: 'https://example.invalid/rest/v1/insight_connections',
      headers: { apikey: 'test' },
      date: '2026-08-15',
      league: 'NFL',
      category: 'after_gary',
      rows: [row('pick-1', 'NEW')],
    });

    expect(calls.map((call) => call.method)).toEqual(['POST', 'DELETE']);
    expect(calls[1].params.id).toBe('in.(10)');
    expect(result).toMatchObject({ inserted: 1, removed: 1 });
    expect(result.identities.has('after_gary|1393562|pick-1')).toBe(true);
  });

  it('does not delete a last-good snapshot when the provider returns no fresh row', async () => {
    const client = Object.assign(vi.fn(), { get: vi.fn() });
    const result = await replaceFootballProofRows({
      httpClient: client,
      restUrl: 'https://example.invalid',
      headers: {},
      date: '2026-08-15',
      league: 'NFL',
      category: 'after_gary',
      rows: [],
    });
    expect(result).toMatchObject({ inserted: 0, removed: 0 });
    expect(client).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });
});
