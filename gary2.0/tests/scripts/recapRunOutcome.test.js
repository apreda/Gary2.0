import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ recap: vi.fn(), inserts: [], queryError: null }));
vi.mock('../../src/loadEnv.js', () => ({}));
vi.mock('../../src/services/factCheck.js', () => ({ buildGameEvidence: () => 'Verified final: Away 101, Home 99.' }));
vi.mock('../../src/services/gameRecap.js', () => ({
  generateRecap: state.recap, filterPropsForGame: () => [], buildBoxLine: () => null,
  buildFootballBoxLine: () => null, buildFootballBoxLineFromPlays: () => null,
  gameOnlyHeadline: text => text, headlineNeedsRepair: () => false,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: table => {
  const builder = {
    select: () => builder, eq: () => builder, in: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async row => { state.inserts.push(row); return { error: state.queryError }; },
    then: resolve => resolve({ data: table === 'daily_picks' ? [{ picks: [{ league: 'NBA', game_id: 1, awayTeam: 'Away', homeTeam: 'Home', pick: 'Away -1' }] }]
      : table === 'game_results' ? [{ game_date: '2026-09-04', league: 'NBA', matchup: 'Away @ Home', pick_text: 'Away -1', result: 'won', final_score: '101-99' }] : [], error: null }),
  }; return builder;
} }) }));
const savedArgv = process.argv;
const savedExit = process.exitCode;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); state.inserts = []; state.queryError = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.argv = ['node', 'run-game-recaps.js', '--date', '2026-09-04'];
  process.exitCode = undefined;
  vi.stubEnv('SUPABASE_URL', 'https://example.test'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
  for (const key of ['BALLDONTLIE_API_KEY', 'VITE_BALL_DONT_LIE_API_KEY', 'BALL_DONT_LIE_API_KEY']) vi.stubEnv(key, '');
});
afterEach(() => { process.argv = savedArgv; process.exitCode = savedExit; vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function run() {
  await import('../../scripts/run-game-recaps.js');
  await vi.waitFor(() => expect(console.log.mock.calls.flat().some(line => String(line).includes('BETTING RECAPS FOR'))).toBe(true));
  await Promise.resolve();
}
describe('recap job outcome', () => {
  it('reports provider failure to launchd instead of exiting successfully with no recap', async () => {
    state.recap.mockResolvedValue(null);
    await run();
    expect(process.exitCode).toBe(1);
    expect(state.inserts).toHaveLength(0);
  });
  it('keeps a successful written recap successful', async () => {
    state.recap.mockResolvedValue({ headline: 'Away wins 101-99', recap: 'Away won by two points.', bullets: [] });
    await run();
    expect(state.inserts).toHaveLength(1);
    expect(process.exitCode).toBeUndefined();
  });
  it('reports storage failure even after the narrative was generated', async () => {
    state.recap.mockResolvedValue({ headline: 'Away wins', recap: 'Final was 101-99.', bullets: [] });
    state.queryError = { message: 'write failed' };
    await run();
    expect(process.exitCode).toBe(1);
  });
});
