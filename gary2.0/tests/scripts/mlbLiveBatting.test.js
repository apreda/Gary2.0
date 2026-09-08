import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeMlbLiveBatting } from '../../supabase/functions/_shared/mlbLiveBatting.js';

const game = { id: 99, date: '2026-09-08T17:00:00Z', status: 'STATUS_FINAL', home_team: { id: 1 }, away_team: { id: 2 },
  home_team_data: { hits: 2, runs: 1 }, away_team_data: { hits: 0, runs: 0 } };
const stat = (teamId = 1, extra = {}) => ({ game_id: 99, team: { id: teamId }, player: { id: teamId + 10, full_name: `Fixture ${teamId}` },
  at_bats: 4, hits: teamId === 1 ? 2 : 0, runs: teamId === 1 ? 1 : 0, rbi: 0, bb: 0, hr: 0, doubles: 1, triples: 0, ...extra });
const valid = () => [stat(), stat(2, { doubles: 0 })];
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.useRealTimers(); });

describe('licensed batting normalization', () => {
  it('reconciles each team and preserves observed zero and derived total bases', () => {
    const result = normalizeMlbLiveBatting(game, valid());
    expect(result.complete).toBe(true);
    expect(result.lines[0]).toMatchObject({ player_id: 11, hits: 2, runs: 1, total_bases: 3 });
    expect(result.lines[1]).toMatchObject({ hits: 0, runs: 0, total_bases: 0 });
  });
  it('does not declare a partial or lagging final box complete', () => {
    expect(normalizeMlbLiveBatting(game, [stat()]).complete).toBe(false);
    expect(normalizeMlbLiveBatting(game, [stat(1, { hits: 1 }), stat(2)]).complete).toBe(false);
    expect(normalizeMlbLiveBatting(game, [stat(1, { runs: null }), stat(2)]).complete).toBe(false);
  });
  it('includes a legitimate pinch runner with a run and zero plate appearances', () => {
    const runner = stat(1, { player: { id: 33, full_name: 'Pinch Runner' }, at_bats: 0, plate_appearances: 0,
      hits: 0, runs: 1, doubles: 0, triples: 0, bb: 0, hr: 0 });
    const result = normalizeMlbLiveBatting(game, [stat(1, { runs: 0 }), stat(2, { doubles: 0 }), runner]);
    expect(result.lines.find(r => r.player_id === 33)).toMatchObject({ runs: 1, hits: 0, total_bases: 0 });
    expect(result.complete).toBe(true);
  });
  it('keeps final boxes refreshable while a supported market field is unknown', () => {
    const result = normalizeMlbLiveBatting(game, [stat(1, { rbi: null, bb: null, hr: null, doubles: null, total_bases: null }), stat(2)]);
    expect(result.complete).toBe(false);
    expect(result.lines[0]).toMatchObject({ hits: 2, runs: 1, rbi: null, walks: null, home_runs: null, total_bases: null });
  });
  it('keeps unavailable fields null and excludes roster-only zero lines', () => {
    const result = normalizeMlbLiveBatting(game, [stat(1, { rbi: null, bb: null, doubles: null }), stat(2, { at_bats: 0 })]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ rbi: null, walks: null, total_bases: null });
    expect(result.complete).toBe(false);
  });
  it.each([{ game_id: 100 }, { team: { id: 3 } }, { player: { id: true, full_name: 'Wrong identity' } }])('rejects wrong player/game/team identities: %j', extra => {
    expect(() => normalizeMlbLiveBatting(game, [stat(1, extra)])).toThrow(/identity/);
  });
  it('rejects duplicate player rows rather than overwriting or double counting', () => {
    expect(() => normalizeMlbLiveBatting(game, [...valid(), stat()])).toThrow(/Duplicate/);
  });
});

async function fixture({ candidate = { date: '2026-09-08', game_id: '99', status: 'final' }, cache = [],
  providerGame = game, pages = [{ data: valid(), meta: { next_cursor: null } }], failure, service = 'fixture-service' } = {}) {
  let handler, page = 0;
  const calls = [], writes = [];
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T22:00:00Z'));
  vi.stubGlobal('Deno', { env: { get: key => ({ SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: service, BALLDONTLIE_API_KEY: 'fixture-bdl' })[key] }, serve: fn => { handler = fn; } });
  vi.stubGlobal('fetch', async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.hostname === 'fixture.invalid') {
      if (url.pathname === '/rest/v1/live_scores') return Response.json(candidate ? [candidate] : []);
      if (url.pathname === '/rest/v1/mlb_live_batting' && options.method !== 'POST') return Response.json(cache);
      if (url.pathname === '/rest/v1/rpc/publish_mlb_live_batting' && options.method === 'POST') {
        writes.push(JSON.parse(options.body)); return Response.json(true);
      }
    }
    if (url.hostname === 'api.balldontlie.io') {
      if (url.pathname === '/mlb/v1/games/99') return Response.json({ data: providerGame });
      if (url.pathname === '/mlb/v1/stats') {
        if (failure) return Response.json({ message: 'provider error' }, { status: failure });
        return Response.json(pages[Math.min(page++, pages.length - 1)]);
      }
    }
    throw new Error(`Unexpected dependency: ${url}`);
  });
  await import('../../supabase/functions/mlb-live-batting/index.ts');
  return { calls, writes, run: (credential = 'fixture-service') => handler(new Request('https://fixture.invalid/function', { method: 'POST', headers: { Authorization: `Bearer ${credential}` } })) };
}

describe('actual batting cache writer', () => {
  it('rejects public/user requests before any dependency', async () => {
    const f = await fixture();
    expect((await f.run('fixture-anon')).status).toBe(403);
    expect((await f.run('fixture-user')).status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
  it('fetches exact game state before a fully paginated box, then publishes final', async () => {
    const f = await fixture({ pages: [{ data: [stat()], meta: { next_cursor: 'next' } }, { data: [stat(2, { doubles: 0 })] }] });
    expect((await f.run()).status).toBe(200);
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({ p_date: '2026-09-08', p_game_id: '99', p_is_final: true });
    const provider = f.calls.filter(c => c.url.hostname === 'api.balldontlie.io');
    expect(provider.map(c => c.url.pathname)).toEqual(['/mlb/v1/games/99', '/mlb/v1/stats', '/mlb/v1/stats']);
    expect(provider[1].url.searchParams.get('game_ids[]')).toBe('99');
    expect(provider[2].url.searchParams.get('cursor')).toBe('next');
  });
  it('never promotes live provider stats merely because cached scoreboard says final', async () => {
    const f = await fixture({ providerGame: { ...game, status: 'STATUS_IN_PROGRESS' } });
    await f.run(); expect(f.writes[0].p_is_final).toBe(false);
  });
  it('leaves a lagging final box provisional for the next refresh', async () => {
    const f = await fixture({ pages: [{ data: [stat(1, { hits: 1 }), stat(2)] }] });
    await f.run(); expect(f.writes[0].p_is_final).toBe(false);
  });
  it('does not freeze a final game before its optional market details arrive', async () => {
    const f = await fixture({ pages: [{ data: [stat(1, { rbi: null }), stat(2)] }] });
    await f.run(); expect(f.writes[0].p_is_final).toBe(false);
    expect(f.writes[0].p_lines[0].rbi).toBe(null);
  });
  it.each([
    { failure: 503 }, { pages: [{ data: [], meta: { next_cursor: 1 } }] },
    { pages: [{ data: [stat()], meta: { next_cursor: 1 } }] },
    { providerGame: { ...game, id: 100 } }, { providerGame: { ...game, date: '2026-09-07T17:00:00Z' } },
  ])('preserves existing data on failures or incomplete/foreign evidence: %j', async options => {
    const f = await fixture(options);
    expect((await f.run()).status).toBe(502);
    expect(f.writes).toHaveLength(0);
  });
  it('skips already reconciled finals and empty slates without provider requests', async () => {
    const f = await fixture({ cache: [{ date: '2026-09-08', game_id: '99', is_final: true }] });
    expect((await f.run()).status).toBe(200);
    expect(f.calls.every(c => c.url.hostname === 'fixture.invalid')).toBe(true);
    expect(f.writes).toHaveLength(0);
  });
});
