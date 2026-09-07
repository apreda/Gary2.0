import { describe, expect, it, vi } from 'vitest';
import { createMlbFantasyDayReader, parseFantasyArgs, resolveMlbFantasyGames, runFantasyBriefing } from '../../scripts/run-fantasy-briefing.js';
import { buildMlbFantasyEvidence } from '../../src/services/insights/mlbFantasyEvidence.js';
import { createFantasyBriefing, fantasyInputFingerprint } from '../../src/services/insights/fantasyDecision.js';

const day = '2026-09-07';
const now = new Date('2026-09-07T15:00:00Z');
const hash = 'a'.repeat(64);
const game = (id, date) => ({ id, date, status: 'STATUS_SCHEDULED', home_team: { id: 1 }, away_team: { id: 2 } });
const evidence = { date: day, league: 'mlb', as_of: now.toISOString(), coverage: { complete: true }, candidates: [] };
const payload = {
  schema_version: 1, date: day, league: 'MLB', fetched_as_of: now.toISOString(), generated_at: now.toISOString(),
  expires_at: '2026-09-07T18:00:00.000Z', input_fingerprint: hash, coverage: { complete: true }, decisions: [],
};
function setup(extra = {}) {
  return {
    date: day, now: () => now, bdl: {}, readDay: vi.fn(async () => []), readStatusSnapshots: vi.fn(async () => []),
    buildEvidence: vi.fn(async () => structuredClone(evidence)), createBriefing: vi.fn(async () => structuredClone(payload)),
    inputFingerprint: vi.fn(() => hash), storage: { load: vi.fn(async () => null), publish: vi.fn(async () => true) },
    ...extra,
  };
}

describe('independent Fantasy publication runner', () => {
  it('covers both UTC days, keeps the full ET slate and distinct doubleheader games', async () => {
    const early = game(1, '2026-09-07T17:00:00Z');
    const late = game(2, '2026-09-08T02:00:00Z');
    const readDay = vi.fn(async date => date === day
      ? [game(0, '2026-09-07T02:00:00Z'), early]
      : [early, late, game(3, '2026-09-08T17:00:00Z')]);
    expect((await resolveMlbFantasyGames({ date: day, readDay })).map(g => g.id)).toEqual([1, 2]);
    expect(readDay.mock.calls.map(([date]) => date)).toEqual([day, '2026-09-08']);
  });

  it('rejects source failures and conflicting game identities before any model or storage mutation', async () => {
    const options = setup({ readDay: vi.fn(async () => { throw new Error('schedule unavailable'); }) });
    await expect(runFantasyBriefing(options)).rejects.toThrow('schedule unavailable');
    expect(options.createBriefing).not.toHaveBeenCalled();
    expect(options.storage.publish).not.toHaveBeenCalled();
    const conflict = vi.fn(async date => [game(1, date === day ? '2026-09-07T17:00:00Z' : '2026-09-07T18:00:00Z')]);
    await expect(resolveMlbFantasyGames({ date: day, readDay: conflict })).rejects.toThrow('conflicts');
  });

  it('runs the evidence builder on a healthy no-game day and atomically publishes its honest empty board', async () => {
    const options = setup();
    expect(await runFantasyBriefing(options)).toMatchObject({ status: 'published', decisionCount: 0 });
    expect(options.buildEvidence.mock.calls[0][0]).toMatchObject({ date: day, league: 'mlb', season: 2026, games: [] });
    expect(options.storage.publish).toHaveBeenCalledWith(payload, { signal: undefined });
  });

  it('lets NFL discover its planning week on a quiet Tuesday without using any MLB source', async () => {
    const date = '2026-09-08';
    const clock = new Date('2026-09-08T15:00:00Z');
    const provider = { source: 'independent NFL fixture' };
    const facts = { ...evidence, date, league: 'nfl', as_of: clock.toISOString(), window_start: '2026-09-10', window_end: '2026-09-14', week: 1 };
    const briefing = { ...payload, date, league: 'NFL', fetched_as_of: clock.toISOString(), generated_at: clock.toISOString(), expires_at: '2026-09-08T21:00:00Z' };
    const options = setup({ date, league: 'NFL', provider, now: () => clock, buildEvidence: vi.fn(async () => facts), createBriefing: vi.fn(async () => briefing) });
    expect(await runFantasyBriefing(options)).toMatchObject({ status: 'published', league: 'NFL', date });
    expect(options.buildEvidence).toHaveBeenCalledWith({ date, league: 'nfl', as_of: clock.toISOString(), provider }, expect.objectContaining({ now: clock }));
    expect(options.createBriefing).toHaveBeenCalledWith(facts, expect.any(Object));
    expect(options.readDay).not.toHaveBeenCalled();
    expect(options.readStatusSnapshots).not.toHaveBeenCalled();
    expect(options.storage.publish).toHaveBeenCalledWith(briefing, { signal: undefined });
  });

  it('connects the real empty-slate builder and decision writer through the storage envelope without model calls', async () => {
    const generateText = vi.fn(async () => { throw new Error('A quiet day must not need a model'); });
    const options = setup({
      buildEvidence: buildMlbFantasyEvidence,
      createBriefing: (facts, opts) => createFantasyBriefing(facts, { ...opts, generateText }),
      inputFingerprint: fantasyInputFingerprint,
    });
    const result = await runFantasyBriefing(options);
    expect(result.status).toBe('published');
    expect(result.payload).toMatchObject({ date: day, league: 'MLB', fetched_as_of: now.toISOString(), decisions: [], coverage: { complete: true } });
    expect(result.payload.input_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(generateText).not.toHaveBeenCalled();
  });

  it('carries existing app status reports unchanged in dry review and stops if that context cannot be read', async () => {
    const rows = [{ player_id: '1', status: '60-Day-IL', injury: 'Stored provider note', source: 'stored fixture', date: day, created_at: now.toISOString(), updated_at: now.toISOString() }];
    const options = setup({ dryRun: true, storage: null, readStatusSnapshots: vi.fn(async () => rows) });
    await runFantasyBriefing(options);
    expect(options.buildEvidence.mock.calls[0][0].statusSnapshots).toEqual(rows);
    const failed = setup({ readStatusSnapshots: vi.fn(async () => { throw new Error('stored status unavailable'); }) });
    await expect(runFantasyBriefing(failed)).rejects.toThrow('stored status unavailable');
    expect(failed.readDay).not.toHaveBeenCalled();
    expect(failed.createBriefing).not.toHaveBeenCalled();
    expect(failed.storage.publish).not.toHaveBeenCalled();
  });

  it('skips unchanged complete evidence without extending the stored expiry or calling the model', async () => {
    const options = setup();
    options.storage.load.mockResolvedValue({ ...payload, payload });
    expect(await runFantasyBriefing(options)).toMatchObject({ status: 'unchanged', expires_at: payload.expires_at });
    expect(options.createBriefing).not.toHaveBeenCalled();
    expect(options.storage.publish).not.toHaveBeenCalled();
  });

  it('refreshes unchanged evidence before the next hourly run could cross the prior expiry', async () => {
    const options = setup();
    const nearExpiry = { ...payload, expires_at: '2026-09-07T16:10:00.000Z' };
    options.storage.load.mockResolvedValue({ ...nearExpiry, payload: nearExpiry });
    expect(await runFantasyBriefing(options)).toMatchObject({ status: 'published' });
    expect(options.createBriefing).toHaveBeenCalledTimes(1);
    expect(nearExpiry.expires_at).toBe('2026-09-07T16:10:00.000Z');
  });

  it('preserves the old board on incomplete evidence, rejected model output and model failure', async () => {
    for (const failure of ['evidence', 'model', 'partition', 'fingerprint', 'expiry']) {
      const options = setup();
      if (failure === 'evidence') options.buildEvidence.mockResolvedValue({ ...evidence, coverage: { complete: false } });
      if (failure === 'model') options.createBriefing.mockRejectedValue(new Error('truncated JSON'));
      if (failure === 'partition') options.createBriefing.mockResolvedValue({ ...payload, league: 'NFL' });
      if (failure === 'fingerprint') options.createBriefing.mockResolvedValue({ ...payload, input_fingerprint: 'b'.repeat(64) });
      if (failure === 'expiry') options.createBriefing.mockResolvedValue({ ...payload, expires_at: '2026-09-07T14:00:00Z' });
      await expect(runFantasyBriefing(options)).rejects.toThrow();
      expect(options.storage.publish).not.toHaveBeenCalled();
    }
  });

  it('does not start provider work when storage is unavailable and blocks late writes after cancellation', async () => {
    const options = setup();
    options.storage.load.mockRejectedValue(new Error('database offline'));
    await expect(runFantasyBriefing(options)).rejects.toThrow('database offline');
    expect(options.readDay).not.toHaveBeenCalled();
    const controller = new AbortController();
    const cancelled = setup({ signal: controller.signal });
    cancelled.createBriefing.mockImplementation(async () => { controller.abort(new Error('budget exhausted')); return payload; });
    await expect(runFantasyBriefing(cancelled)).rejects.toThrow('budget exhausted');
    expect(cancelled.storage.publish).not.toHaveBeenCalled();
  });

  it('writes no production rows for dry-run or facts-only review and needs no write connection', async () => {
    const dry = setup({ storage: null, dryRun: true });
    expect(await runFantasyBriefing(dry)).toMatchObject({ status: 'dry-run', payload });
    const facts = setup({ storage: null, factsOnly: true });
    expect(await runFantasyBriefing(facts)).toMatchObject({ status: 'facts-only', evidence });
    expect(facts.createBriefing).not.toHaveBeenCalled();
  });

  it('allows deliberate unchanged regeneration and reports when a newer run wins publication', async () => {
    const options = setup({ force: true });
    options.storage.load.mockResolvedValue({ ...payload, payload });
    options.storage.publish.mockResolvedValue(false);
    expect(await runFantasyBriefing(options)).toMatchObject({ status: 'newer-snapshot-preserved' });
    expect(options.createBriefing).toHaveBeenCalledTimes(1);
  });
});

describe('Fantasy executable boundaries', () => {
  it('accepts explicit league and local review output while rejecting invalid dates, leagues and unbounded runtimes', () => {
    expect(parseFantasyArgs(['--date=2026-09-07', '--league', 'mlb', '--dry-run', '--output', '/tmp/review.json'], day))
      .toMatchObject({ date: day, league: 'MLB', dryRun: true, output: '/tmp/review.json' });
    expect(parseFantasyArgs(['--league', 'NFL'], day).league).toBe('NFL');
    for (const flags of [['--league', 'NCAAF'], ['--date', '2026-02-30'], ['--timeout-ms', '999999'], ['--output'], ['--reset']]) {
      expect(() => parseFantasyArgs(flags, day)).toThrow();
    }
  });

  it('paginates the strict day source and never converts a failed page into a successful partial slate', async () => {
    const client = vi.fn(async ({ params }) => ({ data: params.cursor == null
      ? { data: [game(1, '2026-09-07T17:00:00Z')], meta: { next_cursor: 2 } }
      : { data: [game(2, '2026-09-07T21:00:00Z')], meta: { next_cursor: null } } }));
    const waitForSlot = vi.fn(async () => {});
    const read = createMlbFantasyDayReader({ client, apiKey: 'fixture-only', waitForSlot });
    expect((await read(day)).map(g => g.id)).toEqual([1, 2]);
    expect(waitForSlot).toHaveBeenCalledTimes(2);
    client.mockImplementation(async ({ params }) => {
      if (params.cursor != null) throw new Error('page two failed');
      return { data: { data: [game(1, '2026-09-07T17:00:00Z')], meta: { next_cursor: 2 } } };
    });
    await expect(read(day)).rejects.toThrow('page two failed');
  });
});
