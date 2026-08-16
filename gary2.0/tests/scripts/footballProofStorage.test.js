import { describe, expect, it, vi } from 'vitest';

import {
  footballProofIdentity,
  loadFootballProofIdentities,
  replaceFootballProofRows,
} from '../../scripts/lib/footballProofStorage.js';

function row(factor, value = 'WATCH') {
  return {
    category: 'the_sweat',
    game_id: '1393562',
    headline: factor,
    detail: 'proof',
    game: 'PHI @ BAL',
    value,
    tone: 'neutral',
    relevance_score: 90,
    meta: { kind: 'the_sweat', pick_id: 'pick-1', factor_code: factor },
  };
}

describe('football proof storage', () => {
  it('keys sweat factors separately and AFTER GARY once per pick', () => {
    expect(footballProofIdentity(row('THE_NUMBER'))).toBe('the_sweat|1393562|pick-1|THE_NUMBER');
    expect(footballProofIdentity(row('RUSH_EDGE'))).toBe('the_sweat|1393562|pick-1|RUSH_EDGE');
    expect(footballProofIdentity({
      category: 'after_gary', game_id: 1393562, meta: { pick_id: 'pick-1' },
    })).toBe('after_gary|1393562|pick-1');
    expect(footballProofIdentity({ category: 'after_gary', game_id: 1393562, meta: {} })).toBeNull();
  });

  it('inserts first, then deletes only stale copies of refreshed identities', async () => {
    const calls = [];
    const client = Object.assign(vi.fn(async (request) => {
      calls.push(request);
      return { data: [] };
    }), {
      get: vi.fn(async () => ({
        data: [
          { id: 10, ...row('THE_NUMBER', 'OLD') },
          { id: 11, ...row('RUSH_EDGE', 'LAST GOOD') },
        ],
      })),
    });

    const result = await replaceFootballProofRows({
      httpClient: client,
      restUrl: 'https://example.invalid/rest/v1/insight_connections',
      headers: { apikey: 'test' },
      date: '2026-08-15',
      league: 'NFL',
      category: 'the_sweat',
      rows: [row('THE_NUMBER', 'NEW')],
    });

    expect(calls.map((call) => call.method)).toEqual(['POST', 'DELETE']);
    expect(calls[1].params.id).toBe('in.(10)');
    expect(result).toMatchObject({ inserted: 1, removed: 1 });
    expect(result.identities.has('the_sweat|1393562|pick-1|THE_NUMBER')).toBe(true);
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

  it('loads exact stored identities for partial-coverage verification', async () => {
    const client = {
      get: vi.fn(async () => ({ data: [row('THE_NUMBER'), row('RUSH_EDGE')] })),
    };
    const identities = await loadFootballProofIdentities({
      httpClient: client,
      restUrl: 'https://example.invalid',
      headers: {},
      date: '2026-08-15',
      league: 'NFL',
      category: 'the_sweat',
    });
    expect(identities).toEqual(new Set([
      'the_sweat|1393562|pick-1|THE_NUMBER',
      'the_sweat|1393562|pick-1|RUSH_EDGE',
    ]));
  });
});
