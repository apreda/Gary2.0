import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gradeGame } from '../../supabase/functions/grade-results/grading.ts';
import { gradeGameMarket } from '../../supabase/functions/_shared/gameSettlement.js';
import { pickSide } from '../../src/services/teamMatch.js';
const source = readFileSync(new URL('../../scripts/run-all-results.js', import.meta.url), 'utf8');
const localGrade = vm.runInNewContext(`(${source.slice(source.indexOf('function gradeGame('), source.indexOf('\n/**\n * Prop Value Extraction'))})`, { gradeGameMarket, pickSide });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

const sample = { league: 'MLB', game_id: 99, homeTeam: 'White Sox', awayTeam: 'Red Sox', pick: 'Red Sox +1.5', odds: -110 };
const game = { id: 99, status: 'STATUS_FINAL', date: '2026-09-06T20:00:00Z', home_team: { name: 'White Sox' }, away_team: { name: 'Red Sox' }, home_team_data: { runs: 0 }, away_team_data: { runs: 5 } };
async function cloud({ pick = sample, games = [game], providerFailure = false } = {}) {
  let handler;
  const writes = [];
  vi.stubGlobal('Deno', { env: { get: key => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', BALLDONTLIE_API_KEY: 'fixture-provider' })[key] }, serve: fn => { handler = fn; } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: () => {} });
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.balldontlie.io') {
      if (providerFailure) return new Response('unavailable', { status: 503 });
      if (u.pathname === '/mlb/v1/games') return Response.json({ data: games });
      throw new Error('Unexpected provider call: ' + url);
    }
    if (u.hostname !== 'test.invalid') throw new Error('Unexpected external call: ' + url);
    if (options.method && options.method !== 'GET') { writes.push({ table: u.pathname, row: JSON.parse(options.body) }); return new Response(null, { status: 201 }); }
    if (u.pathname.endsWith('/daily_picks')) return Response.json([{ id: 'fixture-parent-id', date: '2026-09-06', picks: [pick] }]);
    if (/\/(winners_board|game_results|user_bets)$/.test(u.pathname)) return Response.json([]);
    throw new Error('Unexpected fixture read: ' + url);
  }));
  await import('../../supabase/functions/grade-results/index.ts');
  const response = await handler(new Request('https://test.invalid/grade-results?date=2026-09-06', { headers: { Authorization: 'Bearer fixture-service' } }));
  return { result: await response.json(), writes };
}

describe('local and cloud full-game grade parity', () => {
  it.each([
    ['Sox +1.5', 0, 5, null], ['Sox ML', 0, 5, null], ['Red Sox +1.5', 0, 5, 'won'],
    ['Red Sox -1.5', 4, 5, 'lost'], ['Red Sox +1', 5, 4, 'push'],
    ['Red Sox +0.5', 4, 4, 'won'], ['Red Sox -0.5', 4, 4, 'lost'],
    ['Red Sox PK', 4, 4, 'push'], ['Red Sox -0', 4, 4, 'push'], ['Red Sox pick’em', 4, 4, 'push'],
    ['Red Sox ML -110', 4, 4, 'push'], ['Draw', 4, 4, 'won'],
    ['Over 8', 4, 4, 'push'], ['Under 8.5', 4, 4, 'won'], ['Over 8.5', 4, 4, 'lost'],
    ['Red Sox team total Over 4.5', 4, 5, null], ['First 5 Under 4.5', 4, 5, null],
    ['Red Sox +1.2.3', 0, 5, null], ['Over 8.5.5', 0, 5, null],
    ['Red Sox ML', null, 5, null], ['Red Sox ML', false, 5, null], ['Red Sox ML', {}, 5, null],
    ['Red Sox ML', '', 5, null], ['Red Sox ML', -1, 5, null], ['Red Sox ML', 1.5, 5, null],
    ['Red Sox ML', '0', '5', 'won'], [null, 0, 5, null],
  ])('%s with %s–%s returns %s', (pick, home, away, expected) => {
    expect(gradeGame(pick, 'White Sox', 'Red Sox', home, away)).toBe(expected);
    expect(localGrade(pick, 'White Sox', 'Red Sox', home, away)).toBe(expected);
  });
});

describe('actual cloud grading identity and provider boundaries', () => {
  it.each(['POSTPONED', 'SUSPENDED', 'CANCELLED', 'In Progress', 'NOT_FINAL', 'Final/Suspended', 'Scheduled'])('never writes a game with %s status', async status => {
    const out = await cloud({ games: [{ ...game, status }] });
    expect(out.writes).toEqual([]);
    expect(out.result.skipped).toBe(1);
  });
  it.each([
    ['missing stored id', { ...sample, game_id: null }, [game]],
    ['wrong exact id', sample, [{ ...game, id: 100 }]],
    ['adjacent date', sample, [{ ...game, date: '2026-09-05T20:00:00Z' }]],
    ['swapped teams', sample, [{ ...game, home_team: game.away_team, away_team: game.home_team }]],
    ['missing provider name', sample, [{ ...game, home_team: {} }]],
    ['missing pick name', { ...sample, homeTeam: '' }, [game]],
    ['boolean score', sample, [{ ...game, home_team_data: { runs: false } }]],
    ['missing score', sample, [{ ...game, away_team_data: {} }]],
    ['fractional score', sample, [{ ...game, home_team_data: { runs: .5 } }]],
    ['ambiguous spread side', { ...sample, pick: 'Sox +1.5' }, [game]],
  ])('keeps %s pending', async (_label, pick, games) => {
    expect((await cloud({ pick, games })).writes).toEqual([]);
  });
  it('grades only the requested half of a same-date doubleheader', async () => {
    const out = await cloud({ games: [{ ...game, id: 100, away_team_data: { runs: 0 }, home_team_data: { runs: 5 } }, game] });
    expect(out.writes).toEqual([{ table: '/rest/v1/game_results', row: expect.objectContaining({ game_id: '99', result: 'won', final_score: '5-0' }) }]);
  });
  it('aborts a provider failure without writing a grade', async () => {
    await expect(cloud({ providerFailure: true })).rejects.toThrow('BDL /mlb/v1/games 503');
  });
});
