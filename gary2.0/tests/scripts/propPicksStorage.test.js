import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertPropPublicationPregame,
  assertAtomicPropReceipt,
  assertExistingPropPublications,
  deriveFootballTdCategory,
  stampFootballTdCategory,
  storePropPicksAtomic,
  validateAtomicPropBatch,
} from '../../scripts/lib/propPicksStorage.js';

const nflProp = (overrides = {}) => ({
  sport: 'NFL',
  game_id: 1393557,
  commence_time: '2026-08-15T23:00:00Z',
  matchup: 'Carolina Panthers @ Buffalo Bills',
  player: 'James Cook',
  prop: 'rushing_yards 63.5',
  bet: 'over',
  line: '63.5',
  ...overrides,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-15T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('atomic prop-picks client', () => {
  let rpc;
  let client;

  beforeEach(() => {
    rpc = vi.fn();
    client = { rpc };
  });

  it('appends a normal football batch through one date-keyed RPC', async () => {
    rpc.mockResolvedValue({
      data: {
        added: 2,
        skipped: 0,
        replaced: 0,
        total: 14,
        game_ids: ['1393557'],
        added_game_ids: ['1393557'],
        skipped_game_ids: [],
        replaced_game_ids: [],
        mode: 'append',
      },
      error: null,
    });

    const picks = [
      nflProp(),
      nflProp({ player: 'Josh Allen', prop: 'passing_yards 241.5', line: '241.5' }),
    ];
    const result = await storePropPicksAtomic({
      client,
      date: '2026-08-15',
      leagueLabel: 'NFL',
      picks,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('upsert_prop_picks_atomic', {
      p_date: '2026-08-15',
      p_sport: 'NFL',
      p_new_picks: picks,
      p_replace_game_ids: [],
    });
    expect(result).toEqual({
      added: 2,
      skipped: 0,
      replaced: 0,
      total: 14,
      game_ids: ['1393557'],
      added_game_ids: ['1393557'],
      skipped_game_ids: [],
      replaced_game_ids: [],
      mode: 'append',
    });
  });

  it.each(['NFL', 'NCAAF'])('deterministically stamps %s anytime-TD categories from verified odds', async (sport) => {
    rpc.mockResolvedValue({
      data: {
        added: 2, skipped: 0, replaced: 0, total: 2,
        game_ids: ['1393557'], added_game_ids: ['1393557'],
        skipped_game_ids: [], replaced_game_ids: [], mode: 'append',
      },
      error: null,
    });
    const regular = nflProp({
      sport,
      player: 'James Cook',
      prop: 'anytime_touchdown 0.5',
      line: '0.5',
      odds: '+175',
      td_category: 'underdog', // model text is intentionally ignored
    });
    const value = nflProp({
      sport,
      player: 'Josh Allen',
      prop_type: 'player_anytime_td',
      prop: 'anytime_td 0.5',
      line: '0.5',
      odds: '200',
    });

    await storePropPicksAtomic({
      client,
      date: '2026-08-15',
      leagueLabel: sport,
      picks: [regular, value],
    });

    expect(rpc).toHaveBeenCalledWith('upsert_prop_picks_atomic', expect.objectContaining({
      p_new_picks: [
        expect.objectContaining({ td_category: 'standard' }),
        expect.objectContaining({ td_category: 'underdog' }),
      ],
    }));
  });

  it('keeps regular-only props out of the TD lane and rejects an unpriced scorer', () => {
    expect(deriveFootballTdCategory(
      nflProp({ prop: 'anytime_touchdown 0.5', line: '0.5', odds: '+199' }),
      'NFL',
    )).toBe('standard');
    expect(deriveFootballTdCategory(
      nflProp({ prop: 'anytime_touchdown 0.5', line: '0.5', odds: '+200' }),
      'NCAAF',
    )).toBe('underdog');
    expect(stampFootballTdCategory(
      nflProp({ prop: 'passing_touchdowns 1.5', td_category: 'standard' }),
      'NFL',
    )).not.toHaveProperty('td_category');
    expect(() => stampFootballTdCategory(
      nflProp({ prop: 'anytime_touchdown 0.5', line: '0.5', odds: null }),
      'NFL',
    )).toThrow('TD scorer storage requires verified American odds');
  });

  it('sends only incoming exact game ids as the force-replacement scope', async () => {
    rpc.mockResolvedValue({
      data: {
        added: 2,
        skipped: 0,
        replaced: 2,
        total: 14,
        game_ids: ['1393557'],
        added_game_ids: ['1393557'],
        skipped_game_ids: [],
        replaced_game_ids: ['1393557'],
        mode: 'replace',
      },
      error: null,
    });

    await storePropPicksAtomic({
      client,
      date: '2026-08-15',
      leagueLabel: 'NFL',
      picks: [nflProp(), nflProp({ player: 'Josh Allen' })],
      forceRun: true,
    });

    expect(rpc).toHaveBeenCalledWith('upsert_prop_picks_atomic', expect.objectContaining({
      p_replace_game_ids: ['1393557'],
    }));
  });

  it.each(['NFL', 'NCAAF'])('requires provider game identity for %s before the RPC', async (sport) => {
    expect(() => validateAtomicPropBatch({
      date: '2026-08-15',
      leagueLabel: sport,
      picks: [nflProp({ sport, game_id: null, bdl_game_id: null })],
    })).toThrow(`${sport} atomic prop storage requires game_id or bdl_game_id`);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('allows a legacy non-football append but never a matchup-only forced replacement', () => {
    const legacyMlb = nflProp({
      sport: 'MLB',
      game_id: null,
      bdl_game_id: null,
      matchup: 'Yankees @ Red Sox',
    });
    expect(validateAtomicPropBatch({
      date: '2026-08-15',
      leagueLabel: 'MLB',
      picks: [legacyMlb],
    })).toMatchObject({ sport: 'MLB', gameIds: [] });
    expect(() => validateAtomicPropBatch({
      date: '2026-08-15',
      leagueLabel: 'MLB',
      picks: [legacyMlb],
      forceRun: true,
    })).toThrow('Forced atomic prop replacement requires a provider game id');
  });

  it('fails closed when the RPC is unavailable and has no table fallback', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'function upsert_prop_picks_atomic not found' },
    });

    await expect(storePropPicksAtomic({
      client,
      date: '2026-08-15',
      leagueLabel: 'NFL',
      picks: [nflProp()],
    })).rejects.toThrow('function upsert_prop_picks_atomic not found');
    expect(Object.hasOwn(client, 'from')).toBe(false);
  });

  it('requires the structured game-id result used by the scheduler outcome marker', async () => {
    rpc.mockResolvedValue({
      data: { added: 1, skipped: 0, replaced: 0, total: 1 },
      error: null,
    });

    await expect(storePropPicksAtomic({
      client,
      date: '2026-08-15',
      leagueLabel: 'NFL',
      picks: [nflProp()],
    })).rejects.toThrow('Invalid atomic prop publication receipt');
  });
});

describe('Winners receives the persisted prop decision after atomic publication', () => {
  const storedProp = (over = {}) => nflProp({ odds: '-115', rationale: 'Original card', model: 'Sol', prompt_sha: 'unchanged-era', commence_time: '2026-09-04T23:00:00Z', ...over });
  const setup = ({ incoming, published, readError = null } = {}) => {
    const events = [];
    const query = { select: () => query, eq: () => query, maybeSingle: async () => { events.push('read-published'); return { data: { picks: published }, error: readError }; } };
    const client = { rpc: vi.fn(async () => { events.push('published'); return { data: { added: 1, skipped: incoming.length - 1, replaced: 0, total: incoming.length, mode: 'append', game_ids: ['1393557'], added_game_ids: ['1393557'], skipped_game_ids: incoming.length > 1 ? ['1393557'] : [], replaced_game_ids: [] }, error: null }; }), from: vi.fn(() => query) };
    const evidence = { '1393557': { deskText: 'Original desk before the Sol call', observedAt: '2026-09-04T16:00:00Z' } };
    return { events, client, evidence, incoming };
  };
  it('passes the same service client and only the exact final published price/card', async () => {
    const first = storedProp({ player: 'James Cook' });
    const skippedIncoming = storedProp({ player: 'Josh Allen', odds: '-125', rationale: 'New unposted argument' });
    const existingPublished = storedProp({ player: 'Josh Allen', odds: '-110', rationale: 'Original prior card' });
    const run = setup({ incoming: [first, skippedIncoming], published: [first, existingPublished] });
    const enqueue = vi.fn(async () => { run.events.push('queue'); });
    const result = await storePropPicksAtomic({ client: run.client, date: '2026-09-04', leagueLabel: 'NFL', picks: run.incoming, winnersEvidenceByGame: run.evidence, enqueueWinners: enqueue });
    expect(result.added).toBe(1);
    expect(run.events).toEqual(['published', 'read-published', 'queue']);
    expect(enqueue).toHaveBeenCalledWith(run.client, { date: '2026-09-04', league: 'NFL', picks: [first], evidenceByGame: run.evidence });
    expect(enqueue.mock.calls[0][1].picks[0]).toMatchObject({ odds: '-115', model: 'Sol', prompt_sha: 'unchanged-era' });
  });
  it('leaves the public write successful when queueing or confirmation fails', async () => {
    const pick = storedProp();
    const run = setup({ incoming: [pick], published: [pick] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await storePropPicksAtomic({ client: run.client, date: '2026-09-04', leagueLabel: 'NFL', picks: run.incoming, winnersEvidenceByGame: run.evidence, enqueueWinners: async () => { throw new Error('queue offline'); } });
    expect(result.added).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('publication remains intact'));
    const failure = setup({ incoming: [pick], published: [pick], readError: new Error('read unavailable') });
    const queue = vi.fn();
    expect((await storePropPicksAtomic({ client: failure.client, date: '2026-09-04', leagueLabel: 'NFL', picks: failure.incoming, winnersEvidenceByGame: failure.evidence, enqueueWinners: queue })).added).toBe(1);
    expect(queue).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it('does not touch Winners when no production evidence handoff is supplied', async () => {
    const pick = storedProp();
    const run = setup({ incoming: [pick], published: [pick] });
    const queue = vi.fn();
    await storePropPicksAtomic({ client: run.client, date: '2026-09-04', leagueLabel: 'NFL', picks: run.incoming, enqueueWinners: queue });
    expect(run.client.from).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });
});


describe('prop publication pregame boundary', () => {
  const receipt = { added: 1, skipped: 0, replaced: 0, total: 1, mode: 'append', game_ids: ['1393557'], added_game_ids: ['1393557'], skipped_game_ids: [], replaced_game_ids: [] };
  const store = (client, pick) => storePropPicksAtomic({ client, date: '2026-08-15', leagueLabel: 'NFL', picks: [pick] });
  it.each([null, undefined, '', 'not-a-date', '2026-08-15T23:00:00'])('rejects invalid or timezone-less start %s before the RPC', async commence_time => {
    const rpc = vi.fn();
    await expect(store({ rpc }, nflProp({ commence_time }))).rejects.toThrow('timezone-qualified commence_time');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects a started batch before RPC while preserving the input ticket', async () => {
    const rpc = vi.fn();
    const pick = Object.freeze(nflProp({ commence_time: new Date(Date.now()).toISOString(), rationale: 'Original take' }));
    await expect(store({ rpc }, pick)).rejects.toThrow('has started');
    expect(rpc).not.toHaveBeenCalled();
    expect(pick.rationale).toBe('Original take');
  });
  it('checks the batch after generation and on every transient retry', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'upstream request timeout' } }).mockResolvedValue({ data: receipt, error: null });
    const pick = nflProp({ commence_time: new Date(Date.now() + 10_000).toISOString() });
    const rejected = expect(store({ rpc }, pick)).rejects.toThrow('has started');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('still retries a transient failure while every game remains pregame', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'upstream request timeout' } }).mockResolvedValue({ data: receipt, error: null });
    const pending = store({ rpc }, nflProp());
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).added).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('accepts a durable server receipt arriving after the pregame request', async () => {
    const rpc = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 15_000)); return { data: receipt, error: null }; });
    const pending = store({ rpc }, nflProp({ commence_time: new Date(Date.now() + 10_000).toISOString() }));
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).added).toBe(1);
  });
  it('refuses the whole batch if only one game has already started', () => {
    expect(() => assertPropPublicationPregame([nflProp(), nflProp({ commence_time: '2026-08-15T11:00:00Z' })])).toThrow('has started');
  });
});


describe('prop publication receipts and immutable confirmation', () => {
  const original = () => nflProp({ odds: '-115', rationale: 'Original published card' });
  const receipt = changes => ({ added: 1, skipped: 0, replaced: 0, total: 1, mode: 'insert', game_ids: ['1393557'], added_game_ids: ['1393557'], skipped_game_ids: [], replaced_game_ids: [], ...changes });
  it.each([
    null, {}, { game_ids: [] }, receipt({ added: 0 }), receipt({ skipped: 1 }),
    receipt({ total: 0 }), receipt({ added: '1' }), receipt({ total: -1 }),
    receipt({ game_ids: [] }), receipt({ game_ids: ['other'] }), receipt({ game_ids: ['1393557', '1393557'] }),
    receipt({ added_game_ids: [] }), receipt({ skipped_game_ids: ['1393557'] }),
    receipt({ mode: 'replace' }), receipt({ replaced: 1 }), receipt({ replaced_game_ids: ['1393557'] }),
  ])('rejects an incomplete or inconsistent receipt', value => {
    expect(() => assertAtomicPropReceipt(value, [original()])).toThrow('publication is unconfirmed');
  });
  it('allows mixed add/skip identity groups when two props share a game', () => {
    expect(() => assertAtomicPropReceipt(receipt({ added: 1, skipped: 1, total: 2, skipped_game_ids: ['1393557'] }), [original(), original()])).not.toThrow();
  });
  it('confirms the original natural ticket despite a changed retry price or rationale', () => {
    expect(() => assertExistingPropPublications([original()], [{ ...original(), odds: '-120', rationale: 'Unpublished retry' }])).not.toThrow();
  });
  it.each([
    { game_id: 'other' }, { sport: 'MLB' }, { player: 'Other Player' }, { prop: 'receiving_yards 63.5' },
    { bet: 'under' }, { line: '64.5' }, { td_category: 'standard' }, { odds: null }, { rationale: '' },
  ])('refuses missing/malformed or different original ticket %j', change => {
    expect(() => assertExistingPropPublications([{ ...original(), ...change }], [original()])).toThrow('original ticket is missing or malformed');
  });
  it('does not acknowledge a skipped write when the subsequent ledger read fails', async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: { message: 'read offline' } }) };
    const client = { rpc: async () => ({ data: receipt({ added: 0, skipped: 1, mode: 'append', added_game_ids: [], skipped_game_ids: ['1393557'] }), error: null }), from: () => query };
    await expect(storePropPicksAtomic({ client, date: '2026-08-15', leagueLabel: 'NFL', picks: [original()] })).rejects.toThrow('publication confirmation failed');
  });
});
