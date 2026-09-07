import { describe, expect, it, vi } from 'vitest';
import { createNflFantasyProvider } from '../../../src/services/insights/nflFantasyProvider.js';

const page = (data = [], next = null) => ({ status: 200, data: { data, meta: { next_cursor: next } } });
const fixture = (client, options = {}) => {
  const waitForSlot = vi.fn(async () => 0);
  return { provider: createNflFantasyProvider({ client, apiKey: 'test-existing-provider-key', waitForSlot, ...options }), waitForSlot };
};

describe('strict NFL Fantasy provider', () => {
  it('follows opaque cursors to completion and gates every page with the correct regular-season filters', async () => {
    const client = vi.fn().mockResolvedValueOnce(page([{ id: 1 }], 'opaque:next')).mockResolvedValueOnce(page([{ id: 2 }]));
    const { provider, waitForSlot } = fixture(client);
    expect(await provider.schedule({ season: 2026 })).toHaveLength(2);
    expect(client.mock.calls.map(([request]) => request.params)).toEqual([
      { 'seasons[]': [2026], 'season_types[]': [2], per_page: 100 },
      { 'seasons[]': [2026], 'season_types[]': [2], per_page: 100, cursor: 'opaque:next' },
    ]);
    expect(waitForSlot).toHaveBeenCalledTimes(2);
    expect(provider.diagnostics()).toMatchObject({ requests_attempted: 2, requests_succeeded: 2, pages_by_source: { schedule: 2 } });
  });

  it('rejects a page cap, repeated cursor, empty middle page and malformed pagination instead of returning partial rows', async () => {
    const cap = fixture(vi.fn().mockResolvedValue(page([{ id: 1 }], 100)), { pageLimits: { ownership: 1 } });
    await expect(cap.provider.ownership({ season: 2026 })).rejects.toThrow(/incomplete collection/);
    const loop = fixture(vi.fn().mockResolvedValue(page([{ id: 1 }], 'repeat')));
    await expect(loop.provider.ownership({ season: 2026 })).rejects.toThrow(/repeated pagination cursor/);
    const empty = fixture(vi.fn().mockResolvedValue(page([], 2)));
    await expect(empty.provider.projections({ season: 2026, week: 1 })).rejects.toThrow(/empty nonterminal/);
    const malformed = fixture(vi.fn().mockResolvedValue({ status: 200, data: { data: [], meta: [] } }));
    await expect(malformed.provider.schedule({ season: 2026 })).rejects.toThrow(/pagination metadata/);
  });

  it.each([null, {}, { data: {} }, { data: [null] }, { data: [7] }])('rejects a malformed response envelope %#', async payload => {
    const { provider } = fixture(vi.fn().mockResolvedValue({ status: 200, data: payload }));
    await expect(provider.ownership({ season: 2026 })).rejects.toThrow(/Malformed NFL Fantasy/);
  });

  it('keeps all three forecast formats and missing stats while removing per-player scoring dictionaries', async () => {
    const client = vi.fn().mockResolvedValue(page([{
      id: 1, season: 2026, week: 1, position: 'RB', player: { id: 9, first_name: 'Test', last_name: 'Player', experience: 'Rookie', bio: 'unused' },
      team: { id: 2, abbreviation: 'BUF', division: 'unused' }, game: { id: 3, season: 2026, week: 1, home_team: { id: 2 }, visitor_team: { id: 4 } },
      stats: { receptions: null, rushing_yards: 45.25, irrelevant_feed_field: 'unused' },
      projections: ['standard', 'half_ppr', 'ppr'].map((key, index) => ({ scoring_format: { key, rules: { repeat: 'x'.repeat(5000) } }, total_points: 10 + index, points_per_game: 10 + index })),
    }]));
    const { provider } = fixture(client);
    const [row] = await provider.projections({ season: 2026, week: 1 });
    expect(row.projections).toEqual(['standard', 'half_ppr', 'ppr'].map((key, index) => ({ key, total_points: 10 + index, points_per_game: 10 + index })));
    expect(row.stats).toEqual({ receptions: null, rushing_yards: 45.25 });
    expect(JSON.stringify(row)).not.toContain('repeat');
    expect(JSON.stringify(row)).not.toContain('unused');
    expect(client.mock.calls[0][0].params).toMatchObject({ season: 2026, week: 1, 'positions[]': ['QB', 'RB', 'WR', 'TE'], scoring_format: 'ppr' });
    expect(provider.diagnostics().normalized_bytes).toBeLessThan(provider.diagnostics().response_bytes / 10);
  });

  it('requires bounded exact player IDs and uses array filters for dated game stats', async () => {
    const client = vi.fn().mockResolvedValue(page());
    const { provider } = fixture(client);
    await provider.playerStats({ season: 2025, playerIds: [38, '38', 57] });
    expect(client.mock.calls[0][0].params).toEqual({ 'seasons[]': [2025], 'season_types[]': [2], 'player_ids[]': ['38', '57'], per_page: 100 });
    await expect(provider.players({ playerIds: [] })).rejects.toThrow(/exact player IDs/);
    await expect(provider.players({ playerIds: Array.from({ length: 33 }, (_, i) => i + 1) })).rejects.toThrow(/exact player IDs/);
    await expect(provider.projections({ season: 2026, week: 19 })).rejects.toThrow(/week/);
    expect(client).toHaveBeenCalledTimes(1);
  });

  it('never propagates an Axios error containing credentials or response content', async () => {
    const client = vi.fn().mockRejectedValue(Object.assign(new Error('SECRET must never be logged'), {
      response: { status: 429, data: 'PRIVATE_RESPONSE' }, config: { headers: { Authorization: 'SECRET' } },
    }));
    const { provider } = fixture(client);
    let caught;
    try { await provider.schedule({ season: 2026 }); } catch (error) { caught = error; }
    expect(caught.message).toBe('NFL Fantasy schedule request failed (HTTP 429)');
    expect(JSON.stringify(caught)).not.toMatch(/SECRET|PRIVATE/);
    expect(caught).not.toHaveProperty('config');
    expect(caught).not.toHaveProperty('cause');
  });

  it('caps parallel transports at three and enforces a shared request budget across readers', async () => {
    let active = 0, peak = 0;
    const client = vi.fn(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--; return page();
    });
    const { provider, waitForSlot } = fixture(client, { concurrency: 30, maxRequests: 5 });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => provider.schedule({ season: 2026 })));
    expect(peak).toBe(3);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter(result => result.status === 'rejected').every(result => /request budget/.test(result.reason.message))).toBe(true);
    expect(client).toHaveBeenCalledTimes(5);
    expect(waitForSlot.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('cancels queued requests and pagination without starting transports after abort', async () => {
    const controller = new AbortController();
    const client = vi.fn(({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const { provider } = fixture(client, { signal: controller.signal, concurrency: 1 });
    const results = Promise.allSettled(Array.from({ length: 4 }, () => provider.schedule({ season: 2026 })));
    await vi.waitFor(() => expect(client).toHaveBeenCalledTimes(1));
    controller.abort(new Error('test collection cancelled'));
    expect((await results).every(result => result.status === 'rejected' && /collection cancelled/.test(result.reason.message))).toBe(true);
    expect(client).toHaveBeenCalledTimes(1);
    await expect(provider.schedule({ season: 2026 })).rejects.toThrow(/collection cancelled/);
    expect(client).toHaveBeenCalledTimes(1);
  });
});
