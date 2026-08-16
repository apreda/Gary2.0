import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deriveFootballTdCategory,
  stampFootballTdCategory,
  storePropPicksAtomic,
  validateAtomicPropBatch,
} from '../../scripts/lib/propPicksStorage.js';

const nflProp = (overrides = {}) => ({
  sport: 'NFL',
  game_id: 1393557,
  matchup: 'Carolina Panthers @ Buffalo Bills',
  player: 'James Cook',
  prop: 'rushing_yards 63.5',
  bet: 'over',
  line: '63.5',
  ...overrides,
});

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
    })).rejects.toThrow('did not return game_ids');
  });
});
