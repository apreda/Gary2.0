import { afterEach, describe, expect, it, vi } from 'vitest';

const serviceKey = 'fixture-service-key';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); vi.useRealTimers(); });

async function fixture(endpoint, { transport, env = {} } = {}) {
  let handler;
  const calls = [];
  const background = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T20:00:00Z'));
  vi.stubGlobal('Deno', { env: { get: name => ({
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    BALLDONTLIE_API_KEY: 'fixture-provider-key', ...env,
  })[name] }, serve: fn => { handler = fn; } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: work => background.push(work) });
  vi.stubGlobal('fetch', async (input, options = {}) => {
    const call = { url: new URL(input), method: options.method ?? 'GET', headers: new Headers(options.headers), body: options.body };
    calls.push(call);
    if (!transport) throw new Error('Unauthorized caller reached a dependency');
    return transport(call);
  });
  if (endpoint === 'live-scores') await import('../../supabase/functions/live-scores/index.ts');
  else await import('../../supabase/functions/mlb-field-lineups/index.ts');
  return { handler, calls, background };
}

describe('actual cache writer entrypoints require internal service authorization', () => {
  it.each(['live-scores', 'mlb-field-lineups'])('%s rejects public/user and malformed credentials before any dependency', async endpoint => {
    const f = await fixture(endpoint);
    for (const authorization of [null, 'Bearer fixture-anon', 'Bearer fixture-user', `Basic ${serviceKey}`, `Bearer ${serviceKey}-suffix`]) {
      for (const method of ['GET', 'POST']) {
        for (const suffix of ['', '?date=2026-09-06', '?dry=1&force=1&preview=1&date=invalid']) {
          const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}${suffix}`, { method, headers: authorization ? { Authorization: authorization } : {} }));
          expect(response.status).toBe(403);
          expect(await response.json()).toEqual({ ok: false, error: 'Service authorization required' });
        }
      }
    }
    const apikeyOnly = await f.handler(new Request(`https://fixture.invalid/${endpoint}`, { headers: { apikey: serviceKey } }));
    expect(apikeyOnly.status).toBe(403);
    expect(f.calls).toEqual([]);
    expect(f.background).toEqual([]);
  });

  it.each([
    ['live-scores', undefined], ['live-scores', ''],
    ['mlb-field-lineups', undefined], ['mlb-field-lineups', ''],
  ])('%s fails closed with missing/empty configured service key %s', async (endpoint, key) => {
    const f = await fixture(endpoint, { env: { SUPABASE_SERVICE_ROLE_KEY: key, BALLDONTLIE_API_KEY: undefined } });
    const response = await f.handler(new Request(`https://fixture.invalid/${endpoint}`, { headers: { Authorization: `Bearer ${serviceKey}` } }));
    expect(response.status).toBe(403);
    expect(f.calls).toEqual([]);
    expect(f.background).toEqual([]);
  });
});

const serviceRequest = endpoint => new Request(`https://fixture.invalid/${endpoint}?date=2026-09-06`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}` } });
const game = { id: 99, date: '2026-09-06T19:00:00Z', status: 'In Progress', period: 7,
  home_team: { abbreviation: 'CWS', name: 'White Sox' }, away_team: { abbreviation: 'BOS', name: 'Red Sox' },
  home_team_data: { runs: 3 }, away_team_data: { runs: 5 } };

describe('authorized cache refreshes preserve public cache row contracts', () => {
  it('live-score cron reads the MLB source and writes the same frame without touching local enrichment', async () => {
    const f = await fixture('live-scores', { transport: call => {
      if (call.url.hostname === 'fixture.invalid') {
        expect(call.headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
        if (call.url.pathname === '/rest/v1/live_scores') return call.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([]);
        if (call.url.pathname === '/rest/v1/daily_slate') return Response.json([{ league: 'MLB', bdl_game_id: '99', commence_time: game.date, game_status: 'live' }]);
      }
      if (call.url.hostname === 'api.balldontlie.io' && call.url.pathname === '/mlb/v1/games') return Response.json({ data: [game] });
      throw new Error(`Unexpected live-score request ${call.url}`);
    } });
    const response = await f.handler(serviceRequest('live-scores'));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    const writes = f.calls.filter(c => c.method !== 'GET');
    expect(writes).toHaveLength(1);
    expect(writes[0].url.pathname).toBe('/rest/v1/live_scores');
    expect(writes[0].url.searchParams.get('on_conflict')).toBe('date,league,game_id');
    const [row] = JSON.parse(writes[0].body);
    expect(row).toMatchObject({ date: '2026-09-06', league: 'MLB', game_id: '99', home_abbr: 'CWS', away_abbr: 'BOS', home_score: 3, away_score: 5, status: 'live' });
    expect(row).not.toHaveProperty('outs');
    expect(row).not.toHaveProperty('bases');
    expect(row).not.toHaveProperty('events');
  });

  it('lineup cron writes the existing confirmed lineup payload and exact date/game upsert identity', async () => {
    const entries = ['CWS', 'BOS'].flatMap((abbr, side) => Array.from({ length: 9 }, (_, i) => ({
      team: { abbreviation: abbr, name: abbr }, batting_order: i + 1, position: 'OF',
      player: { id: 100 * (side + 1) + i, full_name: `Fixture ${abbr} ${i}`, bats_throws: 'R/R' },
    })));
    const f = await fixture('mlb-field-lineups', { transport: call => {
      if (call.url.hostname === 'api.balldontlie.io') {
        if (call.url.pathname === '/mlb/v1/games') return Response.json({ data: [game] });
        if (call.url.pathname === '/mlb/v1/lineups') return Response.json({ data: entries });
        if (call.url.pathname === '/mlb/v1/season_stats') return Response.json({ data: [] });
      }
      if (call.url.hostname === 'fixture.invalid') {
        expect(call.headers.get('Authorization')).toBe(`Bearer ${serviceKey}`);
        if (call.url.pathname === '/rest/v1/insight_connections') return Response.json([]);
        if (call.url.pathname === '/rest/v1/mlb_field_lineups') return call.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([]);
      }
      throw new Error(`Unexpected lineup request ${call.url}`);
    } });
    const response = await f.handler(serviceRequest('mlb-field-lineups'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, games: 1, written: 1, confirmed: 1, projected: 0 });
    const writes = f.calls.filter(c => c.method !== 'GET');
    expect(writes).toHaveLength(1);
    expect(writes[0].url.pathname).toBe('/rest/v1/mlb_field_lineups');
    expect(writes[0].url.searchParams.get('on_conflict')).toBe('date,game_id');
    const [row] = JSON.parse(writes[0].body);
    expect(row).toMatchObject({ date: '2026-09-06', game_id: '99', home_team: 'CWS', away_team: 'BOS', status: 'confirmed' });
    expect(row.payload.home.fielders).toHaveLength(9);
    expect(row.payload.away.fielders).toHaveLength(9);
    expect(f.calls.every(c => ['fixture.invalid', 'api.balldontlie.io'].includes(c.url.hostname))).toBe(true);
  });

  it('projects exact-game BDL pitchers across doubleheaders and leaves conflicting probables unknown', async () => {
    const games = [game, { ...game, id: 100, date: '2026-09-06T23:00:00Z' }];
    const probable = (abbr, id) => ({
      team: { abbreviation: abbr, name: abbr }, is_probable_pitcher: true, position: 'SP',
      player: { id, full_name: `Pitcher ${id}`, bats_throws: 'R/L' },
    });
    const prior = { home_team: 'CWS', away_team: 'BOS', payload: Object.fromEntries(['home', 'away'].map(side => [side, {
      team: side, pitcher: { name: 'Old starter', playerId: '99999' },
      fielders: [{ name: `Regular ${side}`, playerId: side === 'home' ? '1' : '2' }],
    }])) };
    const f = await fixture('mlb-field-lineups', { transport: call => {
      if (call.url.hostname === 'api.balldontlie.io') {
        if (call.url.pathname === '/mlb/v1/games') return Response.json({ data: games });
        if (call.url.pathname === '/mlb/v1/lineups') {
          const id = call.url.searchParams.get('game_ids[]');
          expect(['99', '100']).toContain(id);
          return Response.json({ data: id === '99'
            ? [probable('CWS', 10), probable('CWS', 11), probable('BOS', 12)]
            : [probable('CWS', 20), probable('BOS', 21)] });
        }
      }
      if (call.url.hostname === 'fixture.invalid') {
        if (call.url.pathname === '/rest/v1/insight_connections') return Response.json([]);
        if (call.url.pathname === '/rest/v1/mlb_field_lineups') {
          return call.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([prior]);
        }
      }
      throw new Error(`Unexpected lineup request ${call.url}`);
    } });
    const response = await f.handler(serviceRequest('mlb-field-lineups'));
    expect(await response.json()).toMatchObject({ ok: true, projected: 2, scheduleSource: 'balldontlie' });
    const rows = JSON.parse(f.calls.find(c => c.method === 'POST').body);
    expect(rows[0].payload.home.pitcher).toMatchObject({ unknown: true, playerId: '' });
    expect(rows[0].payload.away.pitcher).toMatchObject({ name: 'Pitcher 12', playerId: '12', hand: 'L' });
    expect(rows[1].payload.home.pitcher).toMatchObject({ name: 'Pitcher 20', playerId: '20', hand: 'L' });
    expect(rows[1].payload.away.pitcher.playerId).toBe('21');
    expect(f.calls.every(c => ['fixture.invalid', 'api.balldontlie.io'].includes(c.url.hostname))).toBe(true);
  });
});
