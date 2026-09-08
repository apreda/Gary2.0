import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requiredPropSourceSports, propGameId, propResultIdentity, isFinalGameStatus } from '../../scripts/lib/resultsGradingReliability.js';
import { mlbPropActual, findMlbSettlementPlayer, validateMlbSettlementBox, fetchMlbSettlementBox } from '../../supabase/functions/_shared/mlbPropSettlement.js';

const player = { id: 42, first_name: 'Paul', last_name: 'Skenes', full_name: 'Paul Skenes' };
const stat = extra => ({ player, game: { id: 99, status: 'STATUS_FINAL' }, team: { id: 1 }, ...extra });
const pick = { sport: 'MLB', game_id: 99, player: 'Paul Skenes', player_id: 42, prop: 'pitcher_walks 1.5', bet: 'over', line: '1.5', odds: '-110' };
const runnerSource = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const localExtractor = vm.runInNewContext(`(${runnerSource.slice(runnerSource.indexOf('function getStatValue('), runnerSource.indexOf('\n/**\n * Rationale Fact Check'))})`, {
  normalizeName: value => String(value).toLowerCase(), findMlbSettlementPlayer, mlbPropActual,
});

function localLoader(fetchPage) {
  const cache = { stats: new Map() };
  const declaration = runnerSource.slice(runnerSource.indexOf('async function fetchMLBStats('), runnerSource.indexOf('\n/**\n * Matching & Grading'));
  return { cache, load: vm.runInNewContext(`(${declaration})`, {
    cache, fetchMlbSettlementBox, bdlFetch: fetchPage, console: { log() {}, warn() {} },
  }) };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

async function edge({ currentPick = pick, box = { data: [stat({ bb: 0, p_bb: 4 })] }, games, requestQuery = 'dry=1&force=1&date=2026-09-06' } = {}) {
  let handler;
  vi.stubGlobal('Deno', { env: { get: key => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture', BALLDONTLIE_API_KEY: 'fixture' })[key] }, serve: fn => { handler = fn; } });
  const fetch = vi.fn(async (url, options = {}) => {
    if (options.method && options.method !== 'GET') throw new Error('Unexpected fixture write');
    const u = new URL(url);
    if (u.hostname === 'test.invalid') {
      if (u.pathname.endsWith('/prop_picks')) return Response.json([{ id: 1, date: '2026-09-06', picks: [currentPick] }]);
      if (u.pathname.endsWith('/prop_results')) return Response.json([]);
    }
    if (u.hostname === 'api.balldontlie.io') {
      if (u.pathname === '/mlb/v1/games') return Response.json({ data: typeof games === 'function' ? games(u.searchParams.get('dates[]')) : games ?? [{ id: 99, status: 'STATUS_FINAL', date: '2026-09-06T20:00:00Z' }] });
      if (u.pathname === '/mlb/v1/stats') return Response.json(typeof box === 'function' ? box(u.searchParams.get('cursor')) : box);
    }
    throw new Error('Unexpected fixture URL: ' + url);
  });
  vi.stubGlobal('fetch', fetch);
  await import('../../supabase/functions/grade-props/index.ts');
  const response = await handler(new Request(`https://test.invalid/grade-props?${requestQuery}`, { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(200);
  expect(fetch.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
  return response.json();
}

describe('MLB settlement uses the same authoritative fields in both running graders', () => {
  it('the default cloud window settles tonight’s late final before ET midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T03:55:00Z')); // September 6, 11:55 PM ET
    const requestedDates = [];
    const out = await edge({ requestQuery: 'dry=1&force=1', games: date => {
      requestedDates.push(date);
      return date === '2026-09-07' ? [{ id: 99, status: 'STATUS_FINAL', date: '2026-09-07T00:10:00Z' }] : [];
    } });
    expect(new Set(requestedDates)).toEqual(new Set(['2026-09-05', '2026-09-06', '2026-09-07']));
    expect(requestedDates).toHaveLength(3);
    expect(out.sample).toEqual([expect.objectContaining({ player: 'Paul Skenes', actual: 4, result: 'won' })]);
  });
  it.each([
    ['pitcher_walks', { bb: 0, p_bb: 4 }, 4], ['walks_allowed', { bb: 0, p_bb: 4 }, 4],
    ['pitcher_hits', { hits: 0, p_hits: 7 }, 7], ['hits_allowed', { hits: 0, p_hits: 7 }, 7],
    ['pitcher_home_runs', { hr: 0, p_hr: 2 }, 2], ['home_runs_allowed', { hr: 0, p_hr: 2 }, 2],
    ['walks', { bb: 2, p_bb: 4 }, 2], ['home_runs', { hr: 1, p_hr: 2 }, 1],
    ['pitcher_strikeouts', { k: 2, p_k: 8 }, 8], ['strikeouts', { k: 2, p_k: 8 }, 2],
    ['pitcher_outs', { ip: '5.2' }, 17], ['hits', { hits: 0 }, 0],
    ['hits_runs_rbis', { hits: '1', runs: '2', rbi: '3' }, 6],
    ['singles', { hits: 3, doubles: 1, triples: 0, home_runs: 1 }, 1],
  ])('%s preserves the correct field and real zero', async (type, measurements, actual) => {
    const row = stat(measurements);
    expect(localExtractor('MLB', [row], 'Paul Skenes', type, 42)).toBe(actual);
    const out = await edge({ currentPick: { ...pick, prop: `${type} 0.5`, line: '0.5' }, box: { data: [row] } });
    expect(out.sample).toEqual([expect.objectContaining({ actual, result: actual > .5 ? 'won' : 'lost' })]);
  });

  it.each([
    ['hits', { hits: null }], ['hits', { hits: '' }], ['hits', { hits: false }],
    ['hits', { hits: {} }], ['hits', { hits: -1 }], ['hits', { hits: 'unknown' }],
    ['hits', { hits: 1.5 }], ['pitcher_walks', { p_bb: '2.1' }],
    ['hits', { hits: Number.MAX_SAFE_INTEGER + 1 }],
    ['hits_runs_rbis', { hits: Number.MAX_SAFE_INTEGER, runs: 1, rbi: 0 }],
    ['pitcher_outs', { ip: String(Number.MAX_SAFE_INTEGER) }],
    ['hits_runs_rbis', { hits: 1, runs: null, rbi: 0 }],
    ['pitcher_walks', { bb: 4 }], ['strikeouts', { p_k: 8 }],
    ['pitcher_outs', { ip: '5.3' }], ['pitcher_outs', { ip: '5.2innings' }],
    ['singles', { hits: 1, doubles: 2, triples: 0, hr: 0 }],
  ])('%s with incomplete/invalid measurements stays pending in both graders', async (type, measurements) => {
    const row = stat(measurements);
    expect(localExtractor('MLB', [row], 'Paul Skenes', type, 42)).toBe(null);
    const out = await edge({ currentPick: { ...pick, prop: `${type} 0.5`, bet: 'under', line: '0.5' }, box: { data: [row] } });
    expect(out.sample).toEqual([]);
    expect(out.skippedNoStat).toBe(1);
  });

  it('does not let a namesake precede the exact full name in either grader', async () => {
    const data = [stat({ player: { id: 1, first_name: 'Maikel', last_name: 'Garcia' }, hits: 0 }), stat({ player: { id: 2, first_name: 'Michael', last_name: 'Garcia' }, hits: 2 })];
    expect(localExtractor('MLB', data, 'Michael Garcia', 'hits')).toBe(2);
    const out = await edge({ currentPick: { ...pick, player: 'Michael Garcia', player_id: null, prop: 'hits 0.5', line: '.5' }, box: { data } });
    expect(out.sample[0]).toMatchObject({ actual: 2, result: 'won' });
  });

  it('uses exact player id over text, handles accents, and refuses ambiguous abbreviations', () => {
    const data = [stat({ player: { id: 1, first_name: 'Luis', last_name: 'García' } }), stat({ player: { id: 2, first_name: 'Lucas', last_name: 'Garcia' } })];
    expect(findMlbSettlementPlayer(data, { playerId: 2, name: 'Wrong Name' }).row.player.id).toBe(2);
    expect(findMlbSettlementPlayer(data, { name: 'Luis Garcia' }).row.player.id).toBe(1);
    expect(findMlbSettlementPlayer(data, { name: 'L. Garcia' }).status).toBe('ambiguous');
    expect(findMlbSettlementPlayer(data, { playerId: 3, name: 'Luis Garcia' }).status).toBe('missing');
  });
});

describe('the actual Edge grader rejects partial boxes before DNP settlement', () => {
  it.each([
    ['wrong game', { data: [stat({ game: { id: 100 } })] }],
    ['live game row', { data: [stat({ game: { id: 99, status: 'In Progress' } })] }],
    ['missing player identity', { data: [stat({ player: {} })] }],
    ['malformed response', {}], ['empty response', { data: [] }],
    ['duplicate player', { data: [stat({}), stat({})] }],
    ['repeated cursor', { data: [stat({})], meta: { next_cursor: 'repeat' } }],
    ['empty page before end', { data: [], meta: { next_cursor: 'more' } }],
  ])('keeps %s unavailable', async (_name, box) => {
    const out = await edge({ box });
    expect(out.sample).toEqual([]);
    expect(out.unavailableBox).toBe(1);
    expect(out.dnpPush).toBe(0);
  });

  it('follows all pages before deciding that a player is absent', async () => {
    const out = await edge({ box: cursor => cursor == null
      ? { data: [stat({ player: { id: 1, first_name: 'Other', last_name: 'Player' } })], meta: { next_cursor: 2 } }
      : { data: [stat({ p_bb: 4 })], meta: { next_cursor: null } } });
    expect(out.sample[0]).toMatchObject({ actual: 4, result: 'won' });
    expect(out.dnpPush).toBe(0);
  });

  it('requires a complete two-team box before confirming an absent player', async () => {
    const box = { data: Array.from({ length: 18 }, (_, i) => stat({ player: { id: 100 + i, first_name: 'Other', last_name: `Player${i}` }, team: { id: i < 9 ? 1 : 2 } })) };
    expect((await edge({ box })).sample[0]).toMatchObject({ actual: null, result: 'push' });
    vi.resetModules();
    const out = await edge({ box: { data: box.data.slice(0, 1) } });
    expect(out.sample).toEqual([]);
    expect(out.unavailableBox).toBe(1);
  });

  it('uses stored player_name and line_value aliases consistently', async () => {
    const out = await edge({ currentPick: { ...pick, player: undefined, player_name: 'Paul Skenes', line: undefined, line_value: 1.5 } });
    expect(out.sample[0]).toMatchObject({ player: 'Paul Skenes', line: 1.5, actual: 4, result: 'won' });
  });
});

describe('the real local loader does not retain a partial cache', () => {
  it('collects the second page and validates exact row identity', async () => {
    const provider = vi.fn(async (_path, params) => params.includes('cursor=2') ? { data: [stat({})] } : { data: [stat({ player: { ...player, id: 41 } })], meta: { next_cursor: 2 } });
    const h = localLoader(provider);
    const rows = await h.load([99]);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row._game_id === '99')).toBe(true);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(h.cache.stats.size).toBe(1);
  });
  it.each(['failure', 'wrong-game', 'repeated'])('does not cache %s', async mode => {
    const provider = vi.fn(async () => mode === 'failure' ? null : mode === 'wrong-game'
      ? { data: [stat({ game: { id: 100 } })] }
      : { data: [stat({})], meta: { next_cursor: 'repeat' } });
    const h = localLoader(provider);
    expect(await h.load([99])).toEqual([]);
    expect(h.cache.stats.size).toBe(0);
    await h.load([99]);
    expect(provider.mock.calls.length).toBeGreaterThan(1);
  });
  it('validates a provider row without requiring optional embedded status', () => {
    expect(validateMlbSettlementBox([stat({ game: { id: 99 } })], 99)).toHaveLength(1);
    expect(validateMlbSettlementBox([stat({ game: undefined, game_id: 99 })], 99)).toHaveLength(1);
    expect(() => validateMlbSettlementBox([stat({ game_id: 100 })], 99)).toThrow('invalid game/player identity');
  });
});


describe('the local orchestration keeps unresolved MLB evidence pending', () => {
  it.each([
    ['missing stat', { ...pick, prop: 'hits 0.5', line: '.5' }, [stat({ hits: null, _game_id: '99' })]],
    ['missing exact game id', { ...pick, game_id: null }, [stat({ p_bb: 4, _game_id: '99' })]],
    ['namesake', { ...pick, player: 'Patrick Skenes', player_id: null }, [stat({ p_bb: 4, _game_id: '99' })]],
    ['missing box', pick, []],
  ])('does not invoke model grounding or persistence for %s', async (_label, currentPick, rows) => {
    const query = { select: () => query, in: async () => ({ data: [{ id: 1, date: '2026-09-06', picks: [currentPick] }] }) };
    const getPropGrounding = vi.fn();
    const write = vi.fn(() => { throw new Error('Unexpected fixture write'); });
    const declaration = runnerSource.slice(runnerSource.indexOf('async function processPropBets('), runnerSource.indexOf('/**\n * Narrow cloud-safe settlement pass'));
    const run = vm.runInNewContext(`(${declaration})`, {
      supabase: { from: () => query }, console: { log() {}, warn() {}, error() {} },
      emptySettlementStats: () => ({ candidates: 0, invalidIdentity: 0, pendingNonFinal: 0, finalEligible: 0, unresolvedFinal: 0, errors: [] }),
      requiredPropSourceSports, propGameId, propResultIdentity, isFinalGameStatus,
      supportsExactPropResultIdentity: async () => true,
      fetchGames: async () => [{ id: 99, status: 'STATUS_FINAL' }], fetchMLBStats: async () => rows,
      sportAllowed: () => true, getStatValue: localExtractor, getPropGrounding,
      fetchExistingPropResult: write,
    });
    const result = await run('2026-09-06');
    expect(result.invalidIdentity + result.unresolvedFinal).toBe(1);
    expect(getPropGrounding).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
