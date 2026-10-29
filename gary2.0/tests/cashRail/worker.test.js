import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { garyPickMarket, runPass } from '../../src/services/cashRail/worker.js';
import { settleNfl } from '../../src/services/cashRail/settle.js';
import { freezeBoard } from '../../src/services/cashRail/prices.js';

const { game, plays } = JSON.parse(readFileSync(new URL('../fixtures/cashRail/ne-chi-plays.json', import.meta.url), 'utf8'));
const KICK = game.date; // 2026-10-23T00:15:00.000Z
const at = (min) => new Date(new Date(KICK).getTime() + min * 60_000);
const props = [{ game_id: game.id, player_id: 465, vendor: 'fanduel', prop_type: 'first_td', line_value: '0.5', market: { type: 'milestone', odds: 600 } }];

function fakes({ status_state = 'scheduled', snapshots = [], board = null } = {}) {
  const writes = { snapshots: [], boards: [] };
  const db = {
    listNflGameIds: async () => [game.id],
    lastSnapshot: async () => snapshots[snapshots.length - 1] ?? null,
    frozenSnapshot: async (_l, _id, kickoff) => [...snapshots].reverse().find(s => s.captured_at <= kickoff) ?? null,
    insertSnapshot: async (row) => { writes.snapshots.push(row); },
    getBoard: async () => board,
    upsertBoard: async (row) => { writes.boards.push(row); },
    garyPickRow: async () => ({ pick: 'Chicago Bears -3.5 -110', type: 'spread', spread: '-3.5', odds: '-110' }),
  };
  const bdl = {
    game: async () => ({ ...game, status_state }),
    props: async () => props,
    gameOdds: async () => [],
    players: async () => ({ 465: "D'Andre Swift" }),
    plays: async () => plays,
  };
  return { db, bdl, writes };
}

describe('Cash Rail worker pass', () => {
  it('snapshots prices in the hour before kickoff and writes no board', async () => {
    const f = fakes();
    const r = await runPass({ now: at(-30), date: '2026-10-22', db: f.db, bdl: f.bdl });
    expect(r).toEqual({ snapshots: 1, boards: 0 });
    expect(f.writes.snapshots[0]).toMatchObject({ league: 'NFL', game_id: String(game.id), props, players: { 465: "D'Andre Swift" } });
  });

  it('skips a snapshot taken less than five minutes ago, and games more than an hour out', async () => {
    const recent = fakes({ snapshots: [{ captured_at: at(-32).toISOString() }] });
    expect(await runPass({ now: at(-30), date: 'd', db: recent.db, bdl: recent.bdl })).toEqual({ snapshots: 0, boards: 0 });
    const early = fakes();
    expect(await runPass({ now: at(-90), date: 'd', db: early.db, bdl: early.bdl })).toEqual({ snapshots: 0, boards: 0 });
  });

  it('a live game with no pregame snapshot gets a board with no hits, never a price', async () => {
    const f = fakes({ status_state: 'in' });
    await runPass({ now: at(30), date: 'd', db: f.db, bdl: f.bdl });
    expect(f.writes.boards).toHaveLength(1);
    expect(f.writes.boards[0].hits).toEqual([]);
    expect(f.writes.boards[0].prices_frozen_at).toBeNull();
  });

  it('a live game settles against the last pre-kickoff snapshot, with Gary\'s pick marked', async () => {
    const snap = { captured_at: at(-5).toISOString(), props, game_odds: [], players: { 465: "D'Andre Swift" } };
    const late = { captured_at: at(10).toISOString(), props: [{ ...props[0], market: { type: 'milestone', odds: 50 } }], game_odds: [], players: {} };
    const f = fakes({ status_state: 'final', snapshots: [snap, late] });
    await runPass({ now: at(200), date: 'd', db: f.db, bdl: f.bdl });
    const b = f.writes.boards[0];
    const expected = settleNfl({ markets: [...freezeBoard(snap.props, []).markets, garyPickMarket({ pick: 'Chicago Bears -3.5 -110', type: 'spread', spread: '-3.5', odds: '-110' }, game).market],
      plays, game: { ...game, status_state: 'final' }, players: snap.players, garyPick: { type: 'spread', side: 'home', line: -3.5 } });
    expect(b.hits).toEqual(expected.hits);
    expect(b.hits.find(h => h.key === '465|first_td').price).toBe(600);
    expect(b.hits.find(h => h.key === 'game|spread|home|-3.5')).toMatchObject({ gary: true, price: -110, who: 'Bears' });
    expect(b).toMatchObject({ status: 'final', prices_frozen_at: snap.captured_at });
  });

  it('settles a final game once more and then leaves it alone', async () => {
    const f = fakes({ status_state: 'final', board: { status: 'final' } });
    expect(await runPass({ now: at(300), date: 'd', db: f.db, bdl: f.bdl })).toEqual({ snapshots: 0, boards: 0 });
  });

  it('reads Gary\'s picks into board markets: spread, moneyline, an over; never an under', () => {
    expect(garyPickMarket({ pick: 'New England Patriots +3.5 -105', type: 'spread', spread: '3.5', odds: '-105' }, game).garyPick).toEqual({ type: 'spread', side: 'away', line: 3.5 });
    expect(garyPickMarket({ pick: 'Chicago Bears ML -170', type: 'moneyline', odds: '-170' }, game).market.key).toBe('game|ml|home');
    expect(garyPickMarket({ pick: 'Over 46.5 -110', type: 'total', total: '46.5', odds: '-110' }, game).market.key).toBe('game|total|over|46.5');
    expect(garyPickMarket({ pick: 'Under 46.5 -110', type: 'total', total: '46.5', odds: '-110' }, game)).toBeNull();
  });
});
