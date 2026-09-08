import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as rules from '../../scripts/lib/resultsGradingReliability.js';
import { findExactNcaafStatRow, ncaafActualFromStatRow } from '../../src/services/ncaafPropStats.js';
import * as nflPlaySettlement from '../../scripts/lib/nflPlaySettlement.js';

// Execute the shipping declarations without importing the credential-loading
// script entrypoint. Every provider/database boundary below is a local fixture.
const source = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };
const extract = (start, end, globals) => vm.runInNewContext(
  `(${source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)))})`,
  { ...rules, console: quiet, ...globals },
);
const getStatValue = extract('function getStatValue(', '\n/**\n * Rationale Fact Check', {
  normalizeName: value => String(value).toLowerCase().trim(),
  findExactNcaafStatRow, ncaafActualFromStatRow,
});
const pick = { sport: 'NFL', game_id: 99, player: 'Josh Allen', player_id: 1,
  prop: 'passing_yards', bet: 'under', line: 249.5, odds: '-110', matchup: 'Bills @ Jets' };
const player = { id: 1, first_name: 'Josh', last_name: 'Allen' };
const stat = (extra = {}) => ({ player, game: { id: 99, status: 'Final' }, team: { id: 1 }, ...extra });
const final = { id: 99, date: '2026-09-06T20:00:00Z', status: 'Final' };
const background = Array.from({ length: 10 }, (_, i) => stat({
  player: { id: 100 + i, first_name: 'Other', last_name: `Player${i}` }, team: { id: i < 5 ? 1 : 2 },
}));

function loader(provider, sport = 'NFL') {
  const cache = { stats: new Map() };
  const load = sport === 'NCAAF'
    ? extract('async function fetchNCAAFStats(', "\n/**\n * Gary's graded props around a date", { cache, bdlFetch: provider })
    : extract('async function fetchNFLStats(', '\nasync function fetchNCAAFStats(', { cache, bdlFetch: provider });
  return { load, cache };
}

function runner({ currentPick = pick, currentPicks = null, pages = () => ({ data: [stat({ passing_yards: 0 })] }),
  games = [final], playSettlement = null, playPages = () => { throw new Error('unexpected play fetch'); }, date = '2026-09-06' } = {}) {
  const provider = vi.fn((path, ...args) => path === 'nfl/v1/plays' ? playPages(path, ...args) : pages(path, ...args));
  const loaded = loader(provider, currentPick.sport);
  const inserts = [];
  const getPropGrounding = vi.fn(() => { throw new Error('No model fallback allowed'); });
  const lookup = vi.fn(async () => null);
  const query = { select: () => query, in: async () => ({ data: [{ id: 'original-row', date, picks: currentPicks ?? [currentPick] }] }) };
  const run = extract('async function processPropBets(', '/**\n * Narrow cloud-safe settlement pass', {
    supabase: { from: table => table === 'prop_picks' ? query : {
      insert(payload) { inserts.push(payload); return Promise.resolve({ error: null }); },
      update() { throw new Error('Unexpected fixture update'); },
    } },
    emptySettlementStats: () => ({ candidates: 0, invalidIdentity: 0, pendingNonFinal: 0, finalEligible: 0,
      unresolvedFinal: 0, persisted: 0, w: 0, l: 0, p: 0, errors: [] }),
    supportsExactPropResultIdentity: async () => true,
    fetchGames: async (_sport, requestedDate) => requestedDate === date ? games : [],
    fetchNCAAFGames: async requestedDate => requestedDate === date ? games : [],
    fetchNFLStats: loaded.load, fetchNCAAFStats: loaded.load, sportAllowed: () => true, getStatValue, getPropGrounding,
    NFL_PLAY_SETTLEMENT_MARKETS: new Set(),
    ...(playSettlement ? { ...playSettlement, fetchNFLPlayEvidence: extract('async function fetchNFLPlayEvidence(',
      '\nasync function fetchNFLStats(', { cache: loaded.cache, bdlFetch: provider, ...playSettlement }) } : {}),
    fetchExistingPropResult: lookup,
  });
  return { provider, ...loaded, inserts, lookup, getPropGrounding, run: () => run(date) };
}

describe('NFL direct measurements through the production helper and caller', () => {
  it.each([null, undefined, '', ' ', 'unknown', false, {}, 12.5, Number.MAX_SAFE_INTEGER + 1])(
    'leaves missing/corrupt yards %j pending without writes or model calls', async value => {
      const row = stat({ passing_attempts: 31, passing_yards: value });
      expect(rules.nflActualFromStatRow(row, 'passing_yards')).toBeNull();
      const h = runner({ pages: () => ({ data: [...background, row] }) });
      expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
      expect(h.inserts).toEqual([]);
      expect(h.lookup).not.toHaveBeenCalled();
      expect(h.getPropGrounding).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['passing_yards', { passing_yards: 0 }, 0],
    ['rushing_yards', { rushing_yards: -3 }, -3],
    ['receiving_yards', { receiving_yards: '-2' }, -2],
    ['passing_rushing_yards', { passing_yards: 250, rushing_yards: -3 }, 247],
    ['receptions', { receptions: '0' }, 0],
    ['anytime_td', { rushing_touchdowns: 0, receiving_touchdowns: 1, fumbles_touchdowns: 0,
      interception_touchdowns: 0, kick_return_touchdowns: 0, punt_return_touchdowns: 0 }, 1],
  ])('preserves measured %s and its exact actual value', async (prop, values, actual) => {
    const h = runner({ currentPick: { ...pick, prop }, pages: () => ({ data: [stat(values)] }) });
    expect(await h.run()).toMatchObject({ persisted: 1, unresolvedFinal: 0 });
    expect(h.inserts).toEqual([expect.objectContaining({ actual_value: actual, result: 'won', game_id: '99', sport: 'NFL' })]);
  });

  it.each([
    ['passing_rushing_yards', { passing_yards: 250, rushing_yards: null }],
    ['rushing_receiving_yards', { rushing_yards: 0, receptions: 0, receiving_yards: null }],
    ['total_yards', { passing_yards: 250, rushing_yards: 0 }],
    ['anytime_td', { rushing_touchdowns: 0, receiving_touchdowns: 1 }],
    ['receptions', { receptions: -1 }],
    ['passing_touchdowns', { passing_touchdowns: -1 }],
    ['passing_rushing_yards', { passing_yards: Number.MAX_SAFE_INTEGER, rushing_yards: 1 }],
  ])('does not invent incomplete %s components or an exact total from a lower bound', async (prop, values) => {
    const h = runner({ currentPick: { ...pick, prop }, pages: () => ({ data: [...background, stat(values)] }) });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
    expect(h.inserts).toEqual([]);
  });

  it('does not derive QB longest pass from either a second passer or a lateral split', async () => {
    const qb = stat({ passing_attempts: 1, passing_completions: 1, passing_yards: 60, _football_box_complete: true });
    const receiver = stat({ player: { id: 2, first_name: 'First', last_name: 'Receiver' },
      passing_attempts: 0, receptions: 1, receiving_yards: 40, long_reception: 40, _football_box_complete: true });
    const lateral = stat({ player: { id: 3, first_name: 'Lateral', last_name: 'Receiver' },
      passing_attempts: 0, receptions: 0, receiving_yards: 20, long_reception: 20, _football_box_complete: true });
    expect(rules.nflActualFromStatRow(qb, 'longest_pass', [qb, receiver, lateral])).toBeNull();
    const h = runner({ currentPick: { ...pick, prop: 'longest_pass', line: 50.5 },
      pages: () => ({ data: [...background, qb, receiver, lateral] }) });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
    expect(rules.nflActualFromStatRow({ ...qb, longest_completion: 60 }, 'longest_pass')).toBe(60);
    expect(rules.nflActualFromStatRow(qb, 'longest_pass', [qb, { ...receiver, passing_attempts: 2 }])).toBeNull();
  });
});

describe('the production prop loop uses exact complete NFL plays for missing measurements', () => {
  const receipt = JSON.parse(readFileSync(new URL('../fixtures/nfl/bdl-game-1393562-settlement.json', import.meta.url), 'utf8'));
  const td = { ...pick, game_id: receipt.gameId, player: 'Adam Randall', player_id: 33934150,
    prop: 'anytime_td', bet: 'over', line: 0.5 };
  const longest = { ...td, player: 'Joe Fagnano', player_id: 33936794, prop: 'longest_pass', line: 18.5 };
  const scoreless = { ...td, player: 'Tanner McKee', player_id: 279805 };
  const noInterception = { ...td, player: 'Andy Dalton', player_id: 77, prop: 'passing_interceptions', bet: 'under' };
  const gameOptions = { date: '2026-08-15', games: [receipt.plays[0].game], currentPick: td,
    pages: () => ({ data: receipt.playerStats }), playSettlement: nflPlaySettlement };
  const playPages = (_path, params) => params.includes('cursor=100')
    ? { data: receipt.plays.slice(100), meta: { next_cursor: null } }
    : { data: receipt.plays.slice(0, 100), meta: { next_cursor: 100 } };

  it('persists exact TD/longest/zero values from the real game, with one shared paginated fetch', async () => {
    const h = runner({ ...gameOptions, currentPicks: [td, longest, scoreless, noInterception], playPages });
    expect(await h.run()).toMatchObject({ persisted: 4, unresolvedFinal: 0 });
    expect(h.inserts).toEqual([
      expect.objectContaining({ player_name: 'Adam Randall', actual_value: 1, result: 'won', game_id: String(receipt.gameId) }),
      expect.objectContaining({ player_name: 'Joe Fagnano', actual_value: 19, result: 'won' }),
      expect.objectContaining({ player_name: 'Tanner McKee', actual_value: 0, result: 'lost' }),
      expect.objectContaining({ player_name: 'Andy Dalton', actual_value: 0, result: 'won' }),
    ]);
    expect(h.provider.mock.calls.filter(([path]) => path === 'nfl/v1/plays')).toHaveLength(2);
    expect(h.getPropGrounding).not.toHaveBeenCalled();
  });

  it('does not fan out a failed play page for every other unresolved prop in the game', async () => {
    const h = runner({ ...gameOptions, currentPicks: [td, longest, scoreless], playPages: () => null });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 3, persisted: 0 });
    expect(h.provider.mock.calls.filter(([path]) => path === 'nfl/v1/plays')).toHaveLength(1);
    expect(h.inserts).toEqual([]);
    await h.run();
    expect(h.provider.mock.calls.filter(([path]) => path === 'nfl/v1/plays')).toHaveLength(2);
  });

  it('does not reuse complete plays from a different game or build from a partial last page', async () => {
    for (const badPages of [
      () => ({ data: receipt.plays.map(p => ({ ...p, game: { ...p.game, id: 12345 } })) }),
      (_path, params) => params.includes('cursor=100') ? null : { data: receipt.plays.slice(0, 100), meta: { next_cursor: 100 } },
    ]) {
      const h = runner({ ...gameOptions, currentPicks: [td, longest], playPages: badPages });
      expect(await h.run()).toMatchObject({ unresolvedFinal: 2, persisted: 0 });
      expect(h.inserts).toEqual([]);
    }
  });

  it('does not call plays for measured stats, unsupported gaps or unresolved players', async () => {
    for (const currentPick of [
      { ...longest, prop: 'passing_yards', line: 220.5 },
      { ...longest, prop: 'receiving_yards', line: 0.5 },
      { ...td, player: 'Fred Johnson', player_id: 77014 },
    ]) {
      const h = runner({ ...gameOptions, currentPick });
      await h.run();
      expect(h.provider.mock.calls.some(([path]) => path === 'nfl/v1/plays')).toBe(false);
      if (currentPick.prop !== 'passing_yards') expect(h.inserts).toEqual([]);
    }
  });

  it('leaves the actually observed participant missing from the stats contributor box pending, never DNP', async () => {
    expect(receipt.playerStats.some(r => r.player.id === 77014)).toBe(false);
    expect(receipt.plays.some(p => p.participants?.some(person => Number(person.player_id) === 77014))).toBe(true);
    const h = runner({ ...gameOptions, currentPick: { ...td, player: 'Fred Johnson', player_id: 77014 } });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
    expect(h.inserts).toEqual([]);
  });
});

describe('NCAAF complete-box and strict measurement boundaries', () => {
  const currentPick = { ...pick, sport: 'NCAAF' };

  it.each([' ', false, true, [], {}, 12.5, Number.MAX_SAFE_INTEGER + 1])('keeps corrupt college yards %j pending through the actual loop', async value => {
    const h = runner({ currentPick, pages: () => ({ data: [stat({ passing_yards: value })] }) });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
    expect(h.inserts).toEqual([]);
    expect(h.lookup).not.toHaveBeenCalled();
    expect(h.getPropGrounding).not.toHaveBeenCalled();
  });

  it.each(['over', 'under'])('does not settle anytime TD %s from offense-only zeroes', async bet => {
    const h = runner({ currentPick: { ...currentPick, prop: 'anytime_touchdown', bet, line: 0.5 },
      pages: () => ({ data: [stat({ rushing_touchdowns: 0, receiving_touchdowns: 0 })] }) });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
    expect(h.inserts).toEqual([]);
    expect(h.getPropGrounding).not.toHaveBeenCalled();
  });

  it.each([['over', 'won'], ['under', 'lost']])('settles an exact offensive TD scorer %s as %s', async (bet, result) => {
    const h = runner({ currentPick: { ...currentPick, prop: 'anytime_touchdown', bet, line: 0.5 },
      pages: () => ({ data: [stat({ rushing_touchdowns: null, receiving_touchdowns: 1 })] }) });
    expect(await h.run()).toMatchObject({ persisted: 1, unresolvedFinal: 0 });
    expect(h.inserts).toEqual([expect.objectContaining({ result, actual_value: 1, game_id: '99', sport: 'NCAAF' })]);
  });

  it('finds the exact stored player on the final page before grading', async () => {
    const h = runner({ currentPick, pages: (_path, params) => params.includes('cursor=2')
      ? { data: [stat({ passing_yards: 300 })] } : { data: background, meta: { next_cursor: 2 } } });
    expect(await h.run()).toMatchObject({ persisted: 1 });
    expect(h.inserts).toEqual([expect.objectContaining({ actual_value: 300, result: 'lost', sport: 'NCAAF' })]);
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.provider.mock.calls.every(([path]) => path === 'ncaaf/v1/player_stats')).toBe(true);
  });

  it.each(['null', 'throw', 'malformed', 'repeated', 'empty-nonterminal', 'wrong-game', 'missing-game', 'live-row', 'duplicate-player', 'limit'])(
    'does not settle or cache an incomplete college box after %s', async mode => {
      let count = 0;
      const h = runner({ currentPick, pages: (_path, params) => {
        count++;
        if (!params.includes('cursor=')) return { data: background, meta: { next_cursor: 2 } };
        if (mode === 'null') return null;
        if (mode === 'throw') throw new Error('fixture failed college page');
        if (mode === 'malformed') return {};
        if (mode === 'repeated') return { data: [stat({})], meta: { next_cursor: 2 } };
        if (mode === 'empty-nonterminal') return { data: [], meta: { next_cursor: 3 } };
        if (mode === 'wrong-game') return { data: [stat({ game: { id: 100 } })] };
        if (mode === 'missing-game') return { data: [stat({ game: null })] };
        if (mode === 'live-row') return { data: [stat({ game: { id: 99, status: 'In Progress' } })] };
        if (mode === 'duplicate-player') return { data: [background[0]] };
        return { data: [stat({ player: { ...player, id: 1000 + count } })], meta: { next_cursor: count + 1 } };
      } });
      expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
      expect(h.inserts).toEqual([]);
      expect(h.lookup).not.toHaveBeenCalled();
      expect(h.cache.stats.size).toBe(0);
      expect(h.getPropGrounding).not.toHaveBeenCalled();
      const before = h.provider.mock.calls.length;
      await h.run();
      expect(h.provider.mock.calls.length).toBeGreaterThan(before);
    },
  );

  it('preserves college real zero and exact-id matching, without treating a missing row as DNP', async () => {
    const h = runner({ currentPick: { ...currentPick, player: 'Wrong Text' }, pages: () => ({ data: [stat({ passing_yards: 0 })] }) });
    expect(await h.run()).toMatchObject({ persisted: 1 });
    expect(h.inserts[0]).toMatchObject({ actual_value: 0, result: 'won' });
    const dnp = runner({ currentPick, pages: () => ({ data: background }) });
    expect(await dnp.run()).toMatchObject({ persisted: 0, unresolvedFinal: 1 });
    expect(dnp.inserts).toEqual([]);
    const oneTeam = runner({ currentPick, pages: () => ({ data: background.map(r => ({ ...r, team: { id: 1 } })) }) });
    expect(await oneTeam.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
  });
});

describe('NFL exact player identity is preserved by the actual orchestration', () => {
  const namesakes = [
    stat({ player: { id: 2, first_name: 'Jonathan', last_name: 'Allen' }, passing_yards: 0 }),
    stat({ passing_yards: 300 }),
  ];
  it.each([
    ['stored id', { ...pick, player: 'Wrong Name' }],
    ['exact full name', { ...pick, player_id: null }],
  ])('uses %s before a preceding namesake', async (_label, currentPick) => {
    const h = runner({ currentPick, pages: () => ({ data: namesakes }) });
    await h.run();
    expect(h.inserts).toEqual([expect.objectContaining({ actual_value: 300, result: 'lost' })]);
  });
  it.each([
    ['ambiguous abbreviation', { ...pick, player: 'J. Allen', player_id: null }],
    ['conflicting stored id', { ...pick, player_id: 12345 }],
  ])('does not declare %s a DNP in a populated box', async (_label, currentPick) => {
    const h = runner({ currentPick, pages: () => ({ data: [...background, ...namesakes] }) });
    expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
    expect(h.inserts).toEqual([]);
  });
});

describe('NFL complete cursor traversal precedes any grade or DNP write', () => {
  it('finds the player on page two and preserves game/season query arguments', async () => {
    const h = runner({ pages: (_path, params) => params.includes('cursor=2')
      ? { data: [stat({ passing_yards: 300 })], meta: { next_cursor: null } }
      : { data: background, meta: { next_cursor: 2 } } });
    expect(await h.run()).toMatchObject({ persisted: 1 });
    expect(h.inserts).toEqual([expect.objectContaining({ actual_value: 300, result: 'lost' })]);
    expect(h.provider).toHaveBeenCalledTimes(2);
    expect(h.provider.mock.calls.every(([path, params]) => path === 'nfl/v1/stats'
      && params.includes('game_ids[]=99') && params.includes('season_type=2'))).toBe(true);
  });

  it.each(['null', 'throw', 'malformed', 'repeated', 'empty-nonterminal', 'wrong-game', 'live-row', 'duplicate-player', 'missing-player', 'limit'])(
    'discards the whole partial game on %s, avoids DNP, and retries instead of caching', async mode => {
      let calls = 0;
      const h = runner({ pages: (_path, params) => {
        calls++;
        if (!params.includes('cursor=')) return { data: background, meta: { next_cursor: 2 } };
        if (mode === 'throw') throw new Error('fixture failed page');
        if (mode === 'null') return null;
        if (mode === 'malformed') return {};
        if (mode === 'repeated') return { data: [stat({})], meta: { next_cursor: 2 } };
        if (mode === 'empty-nonterminal') return { data: [], meta: { next_cursor: 3 } };
        if (mode === 'wrong-game') return { data: [stat({ game: { id: 100 } })] };
        if (mode === 'live-row') return { data: [stat({ game: { id: 99, status: 'In Progress' } })] };
        if (mode === 'duplicate-player') return { data: [background[0]] };
        if (mode === 'missing-player') return { data: [stat({ player: {} })] };
        return { data: [stat({ player: { ...player, id: 1000 + calls } })], meta: { next_cursor: calls + 1 } };
      } });
      expect(await h.run()).toMatchObject({ unresolvedFinal: 1, persisted: 0 });
      expect(h.inserts).toEqual([]);
      expect(h.cache.stats.size).toBe(0);
      const previous = h.provider.mock.calls.length;
      await h.run();
      expect(h.provider.mock.calls.length).toBeGreaterThan(previous);
      expect(h.getPropGrounding).not.toHaveBeenCalled();
    },
  );

  it('does not declare absence from even a complete two-team contributor box a DNP', async () => {
    const h = runner({ pages: () => ({ data: background }) });
    expect(await h.run()).toMatchObject({ persisted: 0, unresolvedFinal: 1 });
    expect(h.inserts).toEqual([]);
    const thin = runner({ pages: () => ({ data: background.slice(0, 1) }) });
    expect(await thin.run()).toMatchObject({ persisted: 0, unresolvedFinal: 1 });
    const oneTeam = runner({ pages: () => ({ data: background.map(r => ({ ...r, team: { id: 1 } })) }) });
    expect(await oneTeam.run()).toMatchObject({ persisted: 0, unresolvedFinal: 1 });
  });

  it('deduplicates requested games and retains complete peers when one game fails', async () => {
    const provider = vi.fn(async (_path, params) => params.includes('game_ids[]=99') ? { data: [stat({ passing_yards: 0 })] } : null);
    const h = loader(provider);
    const rows = await h.load([final, final, { ...final, id: 100 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]._game_id).toBe('99');
    expect(provider).toHaveBeenCalledTimes(2);
    expect(h.cache.stats.size).toBe(0);
  });
});
