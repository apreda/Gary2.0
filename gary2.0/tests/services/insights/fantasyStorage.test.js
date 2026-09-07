import { describe, expect, it, vi } from 'vitest';
import { canReuseFantasyBriefing, createFantasyStatusReader, createFantasyStorage, fantasyPartition, validateFantasyPublication } from '../../../src/services/insights/fantasyStorage.js';

const hash = 'a'.repeat(64);
const payload = extra => ({
  schema_version: 1, date: '2026-09-07', league: 'MLB',
  generated_at: '2026-09-07T15:01:00.000Z', fetched_as_of: '2026-09-07T15:00:00.000Z',
  expires_at: '2026-09-07T18:01:00.000Z', input_fingerprint: hash,
  coverage: { complete: true }, decisions: [{
    player_id: '1', player_name: 'Player One', action: 'WATCH', headline: 'Wait for the lineup.',
    why_now: 'The lineup is not yet posted.', fit: 'Managers checking a bench spot.',
    risk: 'No confirmed start.', watch_for: 'The posted batting order.', opportunities: [], evidence: [],
  }], ...extra,
});

describe('read-only existing MLB status context', () => {
  const date = '2026-09-07';
  const row = (id, extra = {}) => ({
    id, date, league: 'MLB', category: 'return_watch', player_id: String(id),
    meta: { status: '60-Day-IL', injury: 'The stored source description.' },
    created_at: '2026-09-07T10:05:00Z', updated_at: '2026-09-07T10:05:00Z', ...extra,
  });
  const reader = client => createFantasyStatusReader({ client, supabaseUrl: 'https://fixture.test', readKey: 'fixture-anon' });

  it('paginates exact dated return-watch rows and preserves raw reports and their original timestamps', async () => {
    const client = vi.fn(async request => {
      expect(request.method).toBe('GET');
      expect(request.params).toMatchObject({ date: 'eq.2026-09-07', league: 'eq.MLB', category: 'eq.return_watch', order: 'id.asc' });
      return { data: request.params.offset === 0 ? Array.from({ length: 200 }, (_, i) => row(i + 1)) : [row(201)] };
    });
    const snapshots = await reader(client)({ date });
    expect(snapshots).toHaveLength(201);
    expect(snapshots[0]).toEqual({ player_id: '1', status: '60-Day-IL', injury: 'The stored source description.', source: 'Gary return_watch (stored report)', date, created_at: row(1).created_at, updated_at: row(1).updated_at });
    expect(client).toHaveBeenCalledTimes(2);
    client.mockResolvedValue({ data: [] });
    expect(await reader(client)({ date })).toEqual([]);
  });

  it('never treats a failed, malformed or conflicting status read as an empty ledger', async () => {
    const client = vi.fn();
    for (const data of [null, {}, [row(1, { league: 'NFL' })], [row(1, { category: 'injury' })], [row(1, { created_at: null })], [row(1), row(1)]]) {
      client.mockResolvedValue({ data });
      await expect(reader(client)({ date })).rejects.toThrow();
    }
    client.mockImplementation(async request => {
      if (request.params.offset) throw new Error('second status page unavailable');
      return { data: Array.from({ length: 200 }, (_, i) => row(i + 1)) };
    });
    await expect(reader(client)({ date })).rejects.toThrow('second status page unavailable');
  });
});
const stored = extra => { const p = payload(extra); return { ...p, payload: p }; };

describe('Fantasy atomic storage contract', () => {
  it('reuses only a complete, identical, unexpired snapshot of the requested league and day', () => {
    const options = { date: '2026-09-07', league: 'MLB', inputFingerprint: hash, now: new Date('2026-09-07T16:00:00Z') };
    expect(canReuseFantasyBriefing(stored(), options)).toBe(true);
    for (const change of [{ date: '2026-09-08' }, { league: 'NFL' }, { inputFingerprint: 'b'.repeat(64) }, { now: new Date('2026-09-07T18:01:00Z') }]) {
      expect(canReuseFantasyBriefing(stored(), { ...options, ...change })).toBe(false);
    }
    expect(canReuseFantasyBriefing(stored({ coverage: { complete: false } }), options)).toBe(false);
    expect(canReuseFantasyBriefing({ ...stored(), expires_at: '2026-09-08T12:00:00Z' }, options)).toBe(false);
  });

  it('does not erase a previous board after failed publication and uses only one RPC request', async () => {
    const prior = stored();
    const client = vi.fn(async request => {
      expect(request.method).toBe('POST');
      expect(request.url).toBe('https://fixture.test/rest/v1/rpc/publish_fantasy_briefing');
      expect(request.data).toEqual({ p_payload: prior.payload, p_fetched_as_of: prior.fetched_as_of, p_input_fingerprint: hash });
      throw new Error('storage unavailable');
    });
    const storage = createFantasyStorage({ client, supabaseUrl: 'https://fixture.test/', serviceKey: 'fixture-only' });
    await expect(storage.publish(prior.payload)).rejects.toThrow('storage unavailable');
    expect(client).toHaveBeenCalledTimes(1);
    expect(prior.payload).toEqual(payload());
  });

  it('treats an older-run receipt as preserved, never as a new publication', async () => {
    const client = vi.fn(async () => ({ data: false }));
    const storage = createFantasyStorage({ client, supabaseUrl: 'https://fixture.test', serviceKey: 'fixture-only' });
    expect(await storage.publish(payload())).toBe(false);
    client.mockResolvedValue({ data: null });
    await expect(storage.publish(payload())).rejects.toThrow('publication receipt');
  });

  it('reads one exact partition and does not turn malformed, duplicated or failed reads into an empty board', async () => {
    const client = vi.fn(async request => {
      expect(request.params).toMatchObject({ date: 'eq.2026-09-07', league: 'eq.MLB', limit: 2 });
      return { data: [] };
    });
    const storage = createFantasyStorage({ client, supabaseUrl: 'https://fixture.test', serviceKey: 'fixture-only' });
    expect(await storage.load({ date: '2026-09-07', league: 'mlb' })).toBeNull();
    for (const bad of [null, {}, [stored(), stored()], [{ ...stored(), league: 'NFL' }]]) {
      client.mockResolvedValue({ data: bad });
      await expect(storage.load({ date: '2026-09-07', league: 'MLB' })).rejects.toThrow();
    }
    client.mockRejectedValue(new Error('HTTP 503'));
    await expect(storage.load({ date: '2026-09-07', league: 'MLB' })).rejects.toThrow('HTTP 503');
  });

  it('rejects incomplete, invalid and duplicate-player publications before making a request', async () => {
    const client = vi.fn();
    const storage = createFantasyStorage({ client, supabaseUrl: 'https://fixture.test', serviceKey: 'fixture-only' });
    const invalid = [
      payload({ coverage: { complete: false } }), payload({ schema_version: 2 }),
      payload({ expires_at: '2026-09-07T14:00:00Z' }), payload({ fetched_as_of: '2026-09-07T16:00:00Z' }),
      payload({ decisions: [{ player_id: '1', player_name: 'A' }, { player_id: 1, player_name: 'B' }] }),
      payload({ decisions: [{ player_id: '', player_name: 'A' }] }), payload({ date: '2026-02-30' }),
      payload({ decisions: [{ ...payload().decisions[0], watch_for: '' }] }),
      payload({ decisions: [{ ...payload().decisions[0], action: 'MUST_ADD' }] }),
      payload({ decisions: [{ ...payload().decisions[0], evidence: 'not structured facts' }] }),
    ];
    for (const row of invalid) await expect(storage.publish(row)).rejects.toThrow();
    expect(client).not.toHaveBeenCalled();
    expect(validateFantasyPublication(payload({ decisions: [] }))).toMatchObject({ decisions: [] });
    expect(() => fantasyPartition('2026-09-07', 'NCAAF')).toThrow();
  });
});
