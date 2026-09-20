import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createResultsEngine } from '../../scripts/lib/results/index.js';
import { createResultsRunner } from '../../scripts/lib/results/runner.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Real Supabase request construction and the complete shipping composition;
// only HTTP is replaced. Unknown requests cannot reach a live service.
function fixture({ missingReadback = false } = {}) {
  const date = '2026-09-08';
  const nfl = { id: 99, date: `${date}T20:00:00Z`, status: 'Final',
    home_team: { name: 'Buffalo Bills' }, visitor_team: { name: 'New York Jets' },
    home_team_score: 27, visitor_team_score: 24 };
  const college = { id: 100, date: `${date}T20:00:00Z`, status: 'Final',
    home_team: { name: 'Ohio State Buckeyes' }, visitor_team: { name: 'Michigan Wolverines' },
    home_team_score: 27, visitor_team_score: 20 };
  const gamePick = (game, league, pick) => ({ game_id: game.id, league, pick,
    homeTeam: game.home_team.name, awayTeam: game.visitor_team.name, odds: -110 });
  const tables = {
    daily_picks: [{ id: 'daily-parent', date, picks: [gamePick(college, 'NCAAF', 'Ohio State -2.5')] }],
    weekly_nfl_picks: [{ id: 'weekly-parent', week_start: date, picks: [gamePick(nfl, 'NFL', 'Bills ML')] }],
    prop_picks: [{ id: 'prop-parent', date, picks: [{ sport: 'NFL', game_id: 99,
      player: 'Josh Allen', player_id: 1, prop: 'passing_yards', bet: 'under',
      line: 249.5, odds: -110, matchup: 'New York Jets @ Buffalo Bills' }] }],
    winners_board: [], game_results: [], nfl_results: [], prop_results: [],
  };
  const requests = [];
  const fetch = vi.fn(async (url, options = {}) => {
    const u = new URL(url);
    requests.push({ path: u.pathname, method: options.method || 'GET' });
    if (u.hostname === 'api.balldontlie.io') {
      expect(options.headers.Authorization).toBe('fixture-provider');
      if (u.pathname.endsWith('/games')) {
        const game = u.pathname === '/nfl/v1/games' ? nfl : u.pathname === '/ncaaf/v1/games' ? college : null;
        if (!game) throw new Error(`Unrelated provider opened: ${u.pathname}`);
        return Response.json({ data: u.searchParams.get('dates[]') === date ? [game] : [] });
      }
      if (u.pathname === '/nfl/v1/stats') return Response.json({ data: [{
        player: { id: 1, first_name: 'Josh', last_name: 'Allen' }, game: nfl, passing_yards: 0,
      }] });
      throw new Error(`Unexpected provider request: ${u.pathname}`);
    }
    if (u.hostname !== 'fixture.invalid') throw new Error(`Unexpected network request: ${u.hostname}`);
    const table = u.pathname.split('/').at(-1);
    if (!Object.hasOwn(tables, table)) throw new Error(`Unexpected table: ${table}`);
    const matches = row => [...u.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('ilike.')) return String(row[key]).toLowerCase() === value.slice(6).toLowerCase();
      if (value === 'is.null') return row[key] == null;
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      if (value.startsWith('gte.')) return String(row[key]) >= value.slice(4);
      throw new Error(`Unexpected fixture filter: ${key}=${value}`);
    });
    if (options.method === 'POST') {
      const row = { ...JSON.parse(options.body), id: `${table}-${tables[table].length + 1}` };
      tables[table].push(row);
      return Response.json(row, { status: 201 });
    }
    if (options.method === 'PATCH') {
      for (const row of tables[table].filter(matches)) Object.assign(row, JSON.parse(options.body));
      return new Response(null, { status: 204 });
    }
    if (options.method && options.method !== 'GET') throw new Error(`Unexpected method: ${options.method}`);
    if (missingReadback && u.searchParams.get('id')?.startsWith('in.(')) return Response.json([]);
    return Response.json(tables[table].filter(matches));
  });
  vi.stubGlobal('fetch', fetch);
  for (const method of ['log', 'warn', 'error']) vi.spyOn(console, method).mockImplementation(() => {});
  const supabase = createClient('https://fixture.invalid', 'fixture-service', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const engine = createResultsEngine({ supabase, apiKey: 'fixture-provider',
    runOptions: { footballSettlements: true, explicitDate: date } });
  return { engine, tables, requests };
}

describe('the assembled results engine', () => {
  it('settles exact games and a measured zero, reads back writes, and reuses identities on rerun', async () => {
    const h = fixture();
    await h.engine.run();
    expect(h.tables.game_results).toEqual([expect.objectContaining({ game_id: '100', league: 'NCAAF',
      game_date: '2026-09-08', result: 'won', final_score: '20-27', is_winners_pick: false })]);
    expect(h.tables.nfl_results).toEqual([expect.objectContaining({ game_id: '99', result: 'won', final_score: '24-27' })]);
    expect(h.tables.prop_results).toEqual([expect.objectContaining({ game_id: '99', sport: 'NFL',
      actual_value: 0, result: 'won', odds: '-110', prop_pick_id: 'prop-parent' })]);
    const providers = h.requests.filter(r => r.path.includes('/v1/') && !r.path.startsWith('/rest/')).length;
    await h.engine.run();
    expect(h.requests.filter(r => r.path.includes('/v1/') && !r.path.startsWith('/rest/'))).toHaveLength(providers);
    expect(h.tables.game_results).toHaveLength(1);
    expect(h.tables.nfl_results).toHaveLength(1);
    expect(h.tables.prop_results).toHaveLength(1);
    expect(h.requests.filter(r => r.method === 'PATCH')).toHaveLength(3);
  });

  it('fails a settlement pass when persisted rows cannot be read back', async () => {
    const h = fixture({ missingReadback: true });
    await expect(h.engine.run()).rejects.toThrow('Football settlement failed for 2026-09-08');
    expect(h.tables.prop_results).toHaveLength(1);
    expect(h.tables.game_results).toHaveLength(0);
  });

  it.each([
    ['2026-03-09T04:30:00Z', ['2026-03-09', '2026-03-08']],
    ['2026-11-02T04:30:00Z', ['2026-11-01', '2026-10-31']],
  ])('uses distinct Eastern calendar dates across DST at %s', (instant, expected) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(instant));
      expect(createResultsRunner({}).getTargetDates()).toEqual(expected);
      expect(createResultsRunner({ runOptions: { explicitDate: '2026-09-08' } }).getTargetDates()).toEqual(['2026-09-08']);
    } finally { vi.useRealTimers(); }
  });
});
