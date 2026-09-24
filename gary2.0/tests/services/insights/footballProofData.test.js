import { describe, expect, it } from 'vitest';

import {
  loadStoredFootballPicks,
  loadFootballSettledScores,
} from '../../../src/services/insights/footballProofData.js';

describe('football proof data', () => {
  it('reads January NFL proof from the season that began the prior August', async () => {
    const calls = [];
    await loadStoredFootballPicks({
      league: 'NFL',
      date: '2027-01-10',
      supabaseUrl: 'https://example.invalid',
      key: 'test',
      client: { get: async (_url, options) => { calls.push(options.params); return { data: [] }; } },
    });
    expect(calls[0].season).toBe('eq.2026');
  });

  it('throws on missing storage config instead of reporting no proof', async () => {
    await expect(loadStoredFootballPicks({
      league: 'NFL',
      date: '2026-08-15',
      season: 2026,
      supabaseUrl: '',
      key: '',
      client: { get: async () => ({ data: [] }) },
    })).rejects.toThrow('Supabase configuration missing for football proof');
  });

  it('keeps a valid empty response distinct from malformed stored picks', async () => {
    const request = {
      league: 'NFL',
      date: '2026-08-15',
      season: 2026,
      supabaseUrl: 'https://example.invalid',
      key: 'test',
    };

    await expect(loadStoredFootballPicks({
      ...request,
      client: { get: async () => ({ data: [] }) },
    })).resolves.toEqual([]);

    await expect(loadStoredFootballPicks({
      ...request,
      client: { get: async () => ({ data: [{ picks: '{bad-json' }] }) },
    })).rejects.toThrow('Malformed weekly_nfl_picks.picks JSON');

    await expect(loadStoredFootballPicks({
      ...request,
      client: { get: async () => ({ data: [{ picks: 'null' }] }) },
    })).rejects.toThrow('expected an array');
  });

  it('recovers a final score after the prior-day live row is pruned', async () => {
    const rows = await loadFootballSettledScores({
      league: 'NFL',
      date: '2026-08-15',
      supabaseUrl: 'https://example.invalid',
      key: 'test',
      client: {
        get: async (_url, options) => {
          expect(options.params).toMatchObject({
            game_date: 'eq.2026-08-15',
            select: 'game_id,final_score',
          });
          return { data: [{ game_id: '1393562', final_score: '17-20' }] };
        },
      },
    });
    expect(rows).toEqual([{
      game_id: '1393562', away_score: 17, home_score: 20,
      status: 'final', detail: 'Final',
    }]);
  });
});
