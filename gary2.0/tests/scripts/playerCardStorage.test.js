import { describe, expect, it, vi } from 'vitest';
import { completedPlayerCardGameIds, upsertPlayerCards } from '../../scripts/lib/playerCardStorage.js';

const makeCard = (player, team, complete = true, builtAt = '2026-09-05T12:00:00.000Z') => ({
  date: '2026-09-05', league: 'NCAAF', player_id: String(player), game_id: '10',
  payload: { season: { line1: '250 pass yds' }, card_build: {
    version: 1, team_id: String(team), game_complete: complete, built_at: builtAt,
  } },
});

describe('player card publication', () => {
  it('upserts by the natural key, dedupes a transfer id, and retains other grounded cards', async () => {
    const existing = new Map([['1', makeCard(1, 1)], ['2', makeCard(2, 2)]]);
    const client = vi.fn(async ({ method, params, data }) => {
      expect(method).toBe('POST');
      expect(params.on_conflict).toBe('date,league,player_id');
      for (const row of data) existing.set(row.player_id, row);
    });
    const fresh = { ...makeCard(1, 1), player_name: 'Updated player' };
    const count = await upsertPlayerCards({ rows: [fresh, fresh], client, url: 'fixture', headers: {}, now: () => new Date('2026-09-05T13:00:00Z') });
    expect(count).toBe(1);
    expect(existing.size).toBe(2);
    expect(existing.get('1').player_name).toBe('Updated player');
    expect(existing.get('1').created_at).toBe('2026-09-05T13:00:00.000Z');
    expect(existing.get('2')).toEqual(makeCard(2, 2));
    expect(client).toHaveBeenCalledTimes(1);
  });

  it('preserves published cards when the replacement write fails', async () => {
    const existing = [makeCard(1, 1)];
    const client = vi.fn(async ({ method }) => {
      if (method === 'DELETE') existing.length = 0;
      throw new Error('write unavailable');
    });
    await expect(upsertPlayerCards({ rows: [makeCard(2, 2)], client, url: 'fixture', headers: {} })).rejects.toThrow('write unavailable');
    expect(existing).toEqual([makeCard(1, 1)]);
    expect(client.mock.calls.map(([call]) => call.method)).toEqual(['POST']);
  });

  it('rejects invalid card identity before any write and performs no empty write', async () => {
    const client = vi.fn();
    await expect(upsertPlayerCards({ rows: [{ payload: {} }], client })).rejects.toThrow('identity');
    expect(await upsertPlayerCards({ rows: [], client })).toBe(0);
    expect(client).not.toHaveBeenCalled();
  });
});

describe('college game completion ledger', () => {
  it('completes only a marked two-sided game, never a legacy or partial game', () => {
    expect([...completedPlayerCardGameIds([makeCard(1, 1), makeCard(2, 2)])]).toEqual(['10']);
    expect(completedPlayerCardGameIds([makeCard(1, 1)]).size).toBe(0);
    expect(completedPlayerCardGameIds([makeCard(1, 1, false), makeCard(2, 2, false)]).size).toBe(0);
    expect(completedPlayerCardGameIds([{ game_id: '10', payload: { season: {} } }]).size).toBe(0);
  });

  it('a newer partial checkpoint cannot borrow the old successful side to finish', () => {
    const old = [makeCard(1, 1), makeCard(2, 2)];
    const partial = makeCard(3, 1, false, '2026-09-05T13:00:00.000Z');
    expect(completedPlayerCardGameIds([...old, partial]).size).toBe(0);
    const recovered = [makeCard(3, 1, true, '2026-09-05T14:00:00.000Z'), makeCard(4, 2, true, '2026-09-05T14:00:00.000Z')];
    expect([...completedPlayerCardGameIds([...old, partial, ...recovered])]).toEqual(['10']);
  });

  it('reopens only a completed game missing a later named player at that exact game', () => {
    const cards = [makeCard(1, 1), makeCard(2, 2),
      { ...makeCard(3, 3), game_id: '20' }, { ...makeCard(4, 4), game_id: '20' }];
    const subjects = [{ game_id: '10', player_id: '3' }, { game_id: '20', player_id: '4' }];
    expect([...completedPlayerCardGameIds(cards, { requiredPlayers: subjects })]).toEqual(['20']);
    // A player card attached to the other game never satisfies this game's subject.
    expect([...completedPlayerCardGameIds([...cards, makeCard(3, 1)], { requiredPlayers: subjects })]).toEqual(['10', '20']);
  });
});
