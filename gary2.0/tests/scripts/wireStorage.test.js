import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ http: vi.fn(), insertError: false, cleanupError: false, rows: new Map(), calls: [] }));
vi.mock('../../src/loadEnv.js', () => ({}));
vi.mock('axios', () => ({ default: state.http }));
vi.mock('../../src/services/insights/wireModel.js', () => ({
  callWireModel: async () => ({ provider: 'mock', sourceUrls: [], text: JSON.stringify([{ kind: 'moment', headline: 'Athletics win on Friday night', game: 'Athletics @ Royals', subline: 'Athletics scored seven runs.', relevance_score: 80 }]) }),
  supportedWireSources: () => [], verifiedWireMovement: () => false,
}));
const originalArgv = process.argv;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); state.insertError = false; state.cleanupError = false;
  state.rows = new Map([[11, { id: 11, headline: 'Previous feed' }]]); state.calls = [];
  process.argv = ['node', 'run-wire-items.js', '--date', '2026-09-05', '--league', 'MLB'];
  vi.stubEnv('SUPABASE_URL', 'https://example.test'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.spyOn(process, 'exit').mockImplementation(() => {});
  for (const name of ['log', 'warn', 'error']) vi.spyOn(console, name).mockImplementation(() => {});
  state.http.mockImplementation(async request => {
    const table = request.url.split('/').at(-1); state.calls.push(request);
    if (request.method === 'GET') {
      if (table === 'daily_slate') return { data: [{ away_team: 'Athletics', home_team: 'Royals' }] };
      if (table === 'game_results') return { data: [{ matchup: 'Athletics @ Royals', final_score: '7-6' }] };
      if (table === 'game_recaps') return { data: [{ id: 20, matchup: 'Athletics @ Royals', bullets: ['Athletics scored seven runs.'] }] };
      if (table === 'wire_items' && request.params.select === 'id') return { data: [...state.rows.values()] };
      return { data: [] };
    }
    if (request.method === 'POST') {
      if (state.insertError) throw new Error('insert rejected');
      state.rows.set(12, { ...request.data[0], id: 12 });
      // Another writer publishes after the snapshot: cleanup may not target it.
      state.rows.set(13, { id: 13, headline: 'Concurrent publication' });
      return { data: null };
    }
    if (request.method === 'DELETE') {
      if (state.cleanupError) throw new Error('cleanup rejected');
      expect(request.params.id).toBe('in.(11)');
      state.rows.delete(11); return { data: null };
    }
    throw new Error('unexpected request');
  });
});
afterEach(() => { process.argv = originalArgv; vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function run() {
  await import('../../run-wire-items.js');
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalled());
}
describe('Wire publication storage', () => {
  it('a rejected insert preserves every existing row and never attempts cleanup', async () => {
    state.insertError = true; await run();
    expect([...state.rows.keys()]).toEqual([11]);
    expect(state.calls.filter(call => call.method === 'DELETE')).toHaveLength(0);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  it('a cleanup failure retains both copies and reports failure instead of blanking the feed', async () => {
    state.cleanupError = true; await run();
    expect([...state.rows.keys()]).toEqual([11, 12, 13]);
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  it('deletes only IDs captured before insertion, preserving concurrent publications', async () => {
    await run();
    expect([...state.rows.keys()]).toEqual([12, 13]);
    expect(state.calls.filter(call => call.method !== 'GET').map(call => call.method)).toEqual(['POST', 'DELETE']);
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
