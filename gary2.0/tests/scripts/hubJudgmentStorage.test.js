import { describe, expect, it, vi } from 'vitest';
import { hubJudgmentPublication, hubJudgmentRevisionFilter, publishHubJudgments, readHubJudgmentRows } from '../../scripts/lib/hubJudgmentStorage.js';

const date = '2026-09-08', league = 'MLB', now = () => '2026-09-08T15:10:00.000Z';
const base = () => ({ id: 1, date, league, category: 'heat_check', game_id: '11', player_id: '22', team_id: '33',
  headline: 'Original headline', detail: 'Original read', meta: { read: 'Full original evidence', other: true } });
const judgment = (change = {}) => ({ schema_version: 1, status: 'ready', date, league: 'mlb', game_id: '11',
  primary_source_key: 'heat_check|11|22|33', input_fingerprint: 'a'.repeat(64),
  as_of: '2026-09-08T15:00:00.000Z', valid_until: '2026-09-08T16:00:00.000Z', take: 'A supported view', ...change });
const url = 'https://fixture.example/rest/v1/insight_connections';

describe('Hub judgment storage', () => {
  it('protects content repairs with a bounded revision filter and supports absent or explicitly null judgments', () => {
    const old = judgment({ full_case: 'Evidence '.repeat(20_000) });
    const filter = hubJudgmentRevisionFilter({ judgment: old, sibling: 'Preserved' });
    expect(filter).toEqual({ 'meta->judgment->>as_of': `eq.${old.as_of}`,
      'meta->judgment->>input_fingerprint': `eq.${old.input_fingerprint}` });
    expect(new URLSearchParams(filter).toString().length).toBeLessThan(300);
    expect(hubJudgmentRevisionFilter({ judgment: { ...old, as_of: now() } })).not.toEqual(filter);
    expect(hubJudgmentRevisionFilter({ judgment: { ...old, input_fingerprint: 'b'.repeat(64) } })).not.toEqual(filter);
    for (const meta of [null, {}, { sibling: true }, { judgment: null }]) {
      expect(hubJudgmentRevisionFilter(meta)).toEqual({ 'meta->>judgment': 'is.null' });
    }
    for (const judgment of [{}, 'malformed', { as_of: now(), input_fingerprint: 'invalid' }]) {
      expect(() => hubJudgmentRevisionFilter({ judgment })).toThrow('malformed');
    }
  });

  it('reads past an API page cap and rejects partial or incorrectly partitioned snapshots', async () => {
    const client = vi.fn().mockResolvedValueOnce({ data: [base()] })
      .mockResolvedValueOnce({ data: [{ ...base(), id: 2 }] }).mockResolvedValueOnce({ data: [] });
    const rows = await readHubJudgmentRows({ client, url, date, league, pageSize: 500 });
    expect(rows.map(row => row.id)).toEqual([1, 2]);
    expect(client.mock.calls.map(([request]) => request.params.id)).toEqual(['gt.0', 'gt.1', 'gt.2']);
    await expect(readHubJudgmentRows({ client: vi.fn().mockResolvedValue({ data: [{ ...base(), league: 'NFL' }] }), url, date, league }))
      .rejects.toThrow('identity');
    await expect(readHubJudgmentRows({ client: vi.fn().mockResolvedValue({ data: [base()] }), url, date, league }))
      .rejects.toThrow('ordering');
    await expect(readHubJudgmentRows({ client: vi.fn().mockRejectedValue(new Error('provider down')), url, date, league }))
      .rejects.toThrow('provider down');
  });

  it('publishes only the new envelope through the atomic merge RPC', async () => {
    const stored = base(), fresh = { ...base(), meta: { ...base().meta, judgment: judgment() } };
    const client = vi.fn().mockResolvedValue({ data: true });
    const result = await publishHubJudgments({ rows: [fresh], storedRows: [stored], client, url, date, league, now });
    expect(result).toMatchObject({ published: 1, rejected: 0 });
    const request = client.mock.calls[0][0];
    expect(request.url).toBe('https://fixture.example/rest/v1/rpc/publish_hub_judgment');
    expect(request.data).toEqual({ p_row_id: 1, p_date: date, p_league: league, p_category: 'heat_check',
      p_game_id: '11', p_player_id: '22', p_team_id: '33', p_judgment: judgment() });
    expect(stored).toEqual(base());
  });

  it.each([
    { date: '2026-09-09' }, { league: 'nfl' }, { game_id: '12' }, { schema_version: 2 },
    { primary_source_key: 'heat_check|12|22|33' }, { valid_until: '2026-09-08T15:05:00.000Z' },
    { as_of: '2026-09-08T15:20:00.000Z' }, { status: 'invented' },
    { input_fingerprint: 'facts-a' }, { input_fingerprint: 'a'.repeat(63) },
    { input_fingerprint: 'G'.repeat(64) },
  ])('rejects invalid, stale or cross-game publication: %j', change => {
    expect(hubJudgmentPublication(base(), judgment(change), { date, league, now: now() })).toBeNull();
  });

  it('rejects older and conflicting same-time writers, and avoids rewriting an identical envelope', async () => {
    const previous = judgment(), row = { ...base(), meta: { ...base().meta, judgment: previous } };
    expect(hubJudgmentPublication(row, judgment({ as_of: '2026-09-08T14:59:00.000Z' }), { date, league, now: now() })).toBeNull();
    expect(hubJudgmentPublication(row, judgment({ take: 'Conflicting take' }), { date, league, now: now() })).toBeNull();
    const client = vi.fn();
    const reordered = { ...row, meta: { judgment: Object.fromEntries(Object.entries(previous).reverse()) } };
    const result = await publishHubJudgments({ rows: [reordered], storedRows: [row], client, url, date, league, now });
    expect(result.unchanged).toBe(1); expect(client).not.toHaveBeenCalled();
  });

  it('can invalidate a missing source independently of display caps without erasing its original case', async () => {
    const old = judgment(), row = { ...base(), meta: { ...base().meta, judgment: old } };
    const invalidation = { ...old, status: 'context_changed', as_of: now(), valid_until: now(), input_fingerprint: 'b'.repeat(64) };
    const client = vi.fn().mockResolvedValue({ data: true });
    // A replay can carry the old metadata in its factual source rows. It must
    // never override the explicit newer invalidation from this collection.
    const result = await publishHubJudgments({ rows: [row], invalidations: [invalidation], storedRows: [row], client, url, date, league, now });
    expect(result.published).toBe(1);
    expect(client.mock.calls[0][0].data.p_judgment.take).toBe(old.take);
    expect(hubJudgmentPublication(base(), invalidation, { date, league, now: now() })).toBeNull();
  });

  it('re-reads IDs after volatile snapshot replacement and reports refused writes', async () => {
    const client = vi.fn().mockResolvedValueOnce({ data: [{ ...base(), id: 77 }] })
      .mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: false });
    const result = await publishHubJudgments({ rows: [{ ...base(), meta: { judgment: judgment() } }], client, url, date, league, now });
    expect(client.mock.calls[2][0].data.p_row_id).toBe(77);
    expect(result.rejected).toBe(1); expect(result.published).toBe(0);
  });

  it.each(['computed_as_of', 'source_collected_at'])('rejects a newer primary %s before rebinding to its replacement ID or returning unchanged', async field => {
    const old = judgment(), analyzed = { ...base(), meta: { judgment: old } };
    const changed = { ...base(), id: 77, meta: { [field]: now(), value: 'New measured facts' } };
    expect(hubJudgmentPublication(changed, old, { date, league, now: now() })).toBeNull();
    const client = vi.fn();
    for (const row of [changed, { ...changed, meta: { ...changed.meta, judgment: old } }]) {
      const result = await publishHubJudgments({ rows: [analyzed], storedRows: [row], client, url, date, league, now });
      expect(result).toMatchObject({ rejected: 1, published: 0, unchanged: 0 });
    }
    expect(client).not.toHaveBeenCalled();
  });

  it('does not confuse a same-pass insert or model rewrite with a later observation', async () => {
    const old = judgment();
    for (const meta of [{}, { source_collected_at: old.as_of },
      { computed_as_of: '2026-09-08T14:59:00Z', source_collected_at: old.as_of }]) {
      const stored = { ...base(), created_at: now(), updated_at: now(), meta: { ...meta, generated_at: now() } };
      const client = vi.fn().mockResolvedValue({ data: true });
      const result = await publishHubJudgments({ rows: [{ ...base(), meta: { judgment: old } }],
        storedRows: [stored], client, url, date, league, now });
      expect(result).toMatchObject({ published: 1, rejected: 0 });
    }
    expect(hubJudgmentPublication({ ...base(), meta: { computed_as_of: old.as_of, source_collected_at: now() } },
      old, { date, league, now: now() })).toBeNull();
  });

  it('checks cited secondary observations in the exact partition and allows missing capped sources', async () => {
    const secondaryKey = 'bullpen_fatigue|11||33';
    const old = judgment({ supporting_evidence_ids: ['primary', 'secondary'], counter_evidence_ids: [],
      evidence: [{ id: 'primary', source_key: judgment().primary_source_key }, { id: 'secondary', source_key: secondaryKey }] });
    const secondary = { ...base(), id: 2, category: 'bullpen_fatigue', player_id: null, meta: { source_collected_at: now() } };
    const analyzed = { ...base(), meta: { judgment: old } };
    const run = storedRows => publishHubJudgments({ rows: [analyzed], storedRows, date, league, now,
      client: vi.fn().mockResolvedValue({ data: true }), url });
    expect(await run([base(), secondary])).toMatchObject({ rejected: 1, published: 0 });
    // Every duplicate observation counts even if the oldest source comes first.
    expect(await run([base(), { ...secondary, id: 3, meta: {} }, secondary])).toMatchObject({ rejected: 1 });
    for (const unrelated of [{ ...secondary, date: '2026-09-09' }, { ...secondary, league: 'NFL' },
      { ...secondary, game_id: '12' }, { ...secondary, team_id: '34' },
      { ...secondary, category: 'uncited' }]) {
      expect(await run([base(), unrelated])).toMatchObject({ published: 1, rejected: 0 });
    }
    expect(await run([base()])).toMatchObject({ published: 1, rejected: 0 });
  });

  it('still withdraws an older judgment after its source was refreshed and refuses malformed declared clocks', async () => {
    const old = judgment(), changed = { ...base(), meta: { judgment: old, source_collected_at: now() } };
    const withdrawal = { ...old, status: 'context_changed', as_of: now(), valid_until: now() };
    expect(hubJudgmentPublication(changed, withdrawal, { date, league, now: now() })).not.toBeNull();
    for (const clock of ['unknown', '2026-09-08', 15, {}, true]) {
      expect(hubJudgmentPublication({ ...base(), meta: { source_collected_at: clock } },
        old, { date, league, now: now() })).toBeNull();
    }
  });

  it('accepts withdrawal of a source deleted by its writer but fails a missing ready anchor', async () => {
    const client = vi.fn();
    const old = judgment();
    const invalidation = { ...old, status: 'context_unavailable', as_of: now(), valid_until: now() };
    const withdrawn = await publishHubJudgments({ invalidations: [invalidation], storedRows: [], client, url, date, league, now });
    expect(withdrawn).toMatchObject({ requested: 1, absent: 1, missing: 0, rejected: 0 });
    const ready = await publishHubJudgments({ rows: [{ ...base(), meta: { judgment: old } }], storedRows: [], client, url, date, league, now });
    expect(ready).toMatchObject({ absent: 0, missing: 1, published: 0 });
    expect(client).not.toHaveBeenCalled();
  });

  it('propagates publication failure without falling back to broad metadata replacement', async () => {
    const client = vi.fn().mockRejectedValue(new Error('write failed'));
    await expect(publishHubJudgments({ rows: [{ ...base(), meta: { judgment: judgment() } }], storedRows: [base()], client, url, date, league, now }))
      .rejects.toThrow('write failed');
    expect(client.mock.calls.map(([request]) => request.method)).toEqual(['POST']);
  });
});
