import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { garyPickMarket, runPass } from '../../src/services/cashRail/worker.js';
import { settleNfl } from '../../src/services/cashRail/settle.js';
import { freezeBoard } from '../../src/services/cashRail/prices.js';
import { settleNba } from '../../src/services/cashRail/settleNba.js';

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

  it('keeps each player\'s jersey number and team with the snapshot, for the celebrations', async () => {
    const f = fakes();
    f.bdl.players = async () => ({ 465: { name: "D'Andre Swift", number: '4', team: 'CHI' } });
    await runPass({ now: at(-30), date: 'd', db: f.db, bdl: f.bdl });
    expect(f.writes.snapshots[0].players).toEqual({ 465: "D'Andre Swift" });
    expect(f.writes.snapshots[0].roster).toEqual({ 465: { number: '4', team: 'CHI' } });
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

  it('writes the frozen spread (favorite and line) onto the board', async () => {
    const odds = [{ vendor: 'a', spread_home_value: '-3.5', spread_home_odds: -110, spread_away_value: '3.5', spread_away_odds: -110 }];
    const snap = { captured_at: at(-5).toISOString(), props, game_odds: odds, players: {} };
    const f = fakes({ status_state: 'in', snapshots: [snap] });
    await runPass({ now: at(30), date: 'd', db: f.db, bdl: f.bdl });
    expect(f.writes.boards[0].spread).toBe('CHI -3.5');
  });

  it('writes Gary\'s own bets on the game for the strip under the scoreboard', async () => {
    const snap = { captured_at: at(-5).toISOString(), props, game_odds: [], players: {} };
    const f = fakes({ status_state: 'in', snapshots: [snap] });
    f.db.garyBets = async () => ({ props: [], darts: [{ player: "D'Andre Swift", player_id: '465', prop: 'anytime_td 0.5', bet: 'over' }] });
    await runPass({ now: at(30), date: 'd', db: f.db, bdl: f.bdl });
    expect(f.writes.boards[0].gary_bets.map(b => b.kind)).toEqual(['pick', 'darts']);
    expect(f.writes.boards[0].gary_bets[0].label).toBe('BEARS −3.5');
  });

  it('re-settles one finished game on request (after a fix)', async () => {
    const snap = { captured_at: at(-5).toISOString(), props, game_odds: [], players: {} };
    const f = fakes({ status_state: 'final', snapshots: [snap], board: { status: 'final' } });
    expect(await runPass({ now: at(300), date: 'd', db: f.db, bdl: f.bdl, only: game.id, resettle: true })).toEqual({ snapshots: 0, boards: 1 });
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

describe('Cash Rail worker pass, NBA', () => {
  const nba = JSON.parse(readFileSync(new URL('../fixtures/cashRail/cle-atl-nba-plays.json', import.meta.url), 'utf8'));
  const TIP = nba.game.datetime; // BDL's NBA `date` is the day only; the tip is `datetime`
  const tipAt = (min) => new Date(new Date(TIP).getTime() + min * 60_000);
  const nbaProps = [{ game_id: nba.game.id, player_id: 3547244, vendor: 'fanduel', prop_type: 'points', line_value: '25',
    market: { type: 'milestone', odds: 150 }, deeplinks: { event: { url_template: 'https://example.test' } } }];
  function nbaFakes(status_state) {
    const writes = { snapshots: [], boards: [], listed: [] };
    const snapshots = [{ captured_at: tipAt(-10).toISOString(), props: nbaProps, game_odds: [], players: { 3547244: 'Onyeka Okongwu' } }];
    const db = {
      listGameIds: async (league, date) => { writes.listed.push([league, date]); return [nba.game.id]; },
      lastSnapshot: async () => null,
      frozenSnapshot: async (_l, _id, kickoff) => snapshots.find(s => s.captured_at <= kickoff) ?? null,
      insertSnapshot: async (row) => { writes.snapshots.push(row); },
      getBoard: async () => null,
      upsertBoard: async (row) => { writes.boards.push(row); },
      garyPickRow: async () => ({ pick: 'Atlanta Hawks -1.5 -105', type: 'spread', spread: '-1.5', odds: '-105' }),
      garyBets: async () => { throw new Error('the Gary strip is NFL only'); },
    };
    const bdl = {
      game: async () => ({ ...nba.game, status_state }),
      props: async () => nbaProps,
      gameOdds: async () => [],
      players: async () => ({ 3547244: { name: 'Onyeka Okongwu', number: '17', team: 'ATL' } }),
      plays: async () => nba.plays,
    };
    return { db, bdl, writes };
  }

  it('snapshots in the hour before the tip, read from `datetime`', async () => {
    const f = nbaFakes('scheduled');
    expect(await runPass({ league: 'NBA', now: tipAt(-30), date: '2026-10-29', db: f.db, bdl: f.bdl })).toEqual({ snapshots: 1, boards: 0 });
    expect(f.writes.listed).toEqual([['NBA', '2026-10-29']]);
    expect(f.writes.snapshots[0]).toMatchObject({ league: 'NBA', game_id: String(nba.game.id), kickoff: TIP });
    expect(f.writes.snapshots[0].props[0]).not.toHaveProperty('deeplinks');
  });

  it('settles the game with the NBA engine and writes an NBA board with Gary\'s pick marked', async () => {
    const f = nbaFakes('final');
    await runPass({ league: 'NBA', now: tipAt(200), date: '2026-10-29', db: f.db, bdl: f.bdl });
    const board = f.writes.boards[0];
    const markets = freezeBoard(nbaProps, [], { settleable: (t) => t === 'points' }).markets;
    const expected = settleNba({ markets, plays: nba.plays, game: { ...nba.game, status_state: 'final' }, players: { 3547244: 'Onyeka Okongwu' } });
    expect(board).toMatchObject({ league: 'NBA', game_id: String(nba.game.id), status: 'final', clock: 'FINAL', spread: 'ATL -1.5' });
    expect(board.hits.find(h => h.key === '3547244|points')).toEqual(expected.hits.find(h => h.key === '3547244|points'));
    // The column is NOT NULL (an empty strip off the NFL): a null failed every NBA write live on Oct 30.
    expect(board.gary_bets).toEqual([]);
  });
});

describe('Cash Rail worker pass, college', () => {
  const cf = JSON.parse(readFileSync(new URL('../fixtures/cashRail/sdsu-csu-ncaaf.json', import.meta.url), 'utf8'));
  const KICK = cf.game.date;
  const props = [{ game_id: cf.game.id, player_id: 54448, vendor: 'betmgm', prop_type: 'anytime_td', line_value: '0.5', market: { type: 'milestone', odds: 120 } }];
  it('settles off the box score and keeps each bet\'s first-seen time from the board before', async () => {
    const writes = [];
    const priorHit = { key: '54448|anytime_td|1', when: 'Q1 3:19', elapsed: 701 };
    const db = {
      listGameIds: async () => [cf.game.id],
      lastSnapshot: async () => null,
      frozenSnapshot: async () => ({ captured_at: KICK, props, game_odds: [], players: { 54448: 'Durell Robinson' } }),
      insertSnapshot: async () => {},
      getBoard: async () => ({ status: 'live', hits: [priorHit] }),
      upsertBoard: async (row) => { writes.push(row); },
      garyPickRow: async () => null,
    };
    const bdl = {
      game: async () => ({ ...cf.game, status_state: 'in', period: 3, time: '4:00' }),
      plays: async () => cf.plays,
      stats: async () => cf.stats,
    };
    await runPass({ league: 'NCAAF', now: new Date(new Date(KICK).getTime() + 120 * 60_000), date: 'd', db, bdl });
    expect(writes[0]).toMatchObject({ league: 'NCAAF', status: 'live', clock: 'Q3 4:00' });
    expect(writes[0].hits.find(h => h.key === '54448|anytime_td|1')).toMatchObject({ who: 'Durell Robinson', when: 'Q1 3:19' });
  });
});
