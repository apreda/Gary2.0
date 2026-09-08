import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../scripts/run-agentic-picks.js', import.meta.url), 'utf8');

describe('NFL test pick isolation at the CLI boundaries', () => {
  it.each(['--nocache', '--fresh'])('%s bypasses the shared provider cache and forwards scout freshness', flag => {
    const start = source.indexOf('  // Clear cache if --nocache');
    const end = source.indexOf('\n  const startTime', start);
    const process = { argv: ['node', 'run-agentic-picks.js', flag], env: {} };
    const clearCache = vi.fn();
    vm.runInNewContext(source.slice(start, end), {
      process, ballDontLieService: { clearCache }, console: { log: vi.fn() },
    });
    expect(process.env.GARY_BDL_SHARED_CACHE_DISABLED).toBe('1');
    expect(clearCache).toHaveBeenCalledOnce();
    const options = source.slice(source.indexOf('const runnerOptions ='));
    const expression = options.match(/nocache:\s*([^\n]+),/)?.[1];
    expect(expression).toBeTruthy();
    expect(vm.runInNewContext(expression, { process })).toBe(true);
  });

  it.each([true, false])('public deduplication is bypassed only for test mode=%s', async useTestTable => {
    const start = source.indexOf('        // Skip deduplication checks if --force');
    const end = source.indexOf('        // Mark as being processed BEFORE', start);
    const checkExistingPick = vi.fn().mockResolvedValue('Existing public pick');
    const generated = vi.fn();
    const existingPickGameIds = new Set();
    await vm.runInNewContext(`(async () => { for (const game of games) {
      ${source.slice(start, end)}
      generated();
    } })()`, {
      useTestTable, forceRerun: false, checkExistingPick, generated,
      processedGamesThisSession: new Set(), existingPickGameIds,
      gameKey: '1392216', bdlGameId: 1392216, config: { name: 'NFL' },
      games: [{ home_team: 'Seattle Seahawks', away_team: 'New England Patriots', commence_time: '2026-09-10T00:20:00Z' }],
      console: { log: vi.fn() },
    });
    expect(checkExistingPick).toHaveBeenCalledTimes(useTestTable ? 0 : 1);
    expect(generated).toHaveBeenCalledTimes(useTestTable ? 1 : 0);
    expect([...existingPickGameIds]).toEqual(useTestTable ? [] : ['1392216']);
  });

  it('writes the full NFL test pick only to the test service and passes the requested date', async () => {
    const start = source.indexOf('async function storePicks(picks)');
    const end = source.indexOf('\n}\n', start) + 2;
    const storeTestPicks = vi.fn().mockResolvedValue({ success: true, count: 1, mode: 'insert' });
    const assertPicksStillPregame = vi.fn(() => { throw new Error('production boundary reached'); });
    const store = vm.runInNewContext(`(${source.slice(start, end)})`, {
      useTestTable: true, testName: 'NFL opening preflight', dateFilter: '2026-09-09',
      process: { argv: ['--nfl', '--test'], env: {} },
      picksService: { storeTestPicks }, assertPicksStillPregame,
      console: { log: vi.fn() },
    });
    const pick = { league: 'NFL', pick: 'Seattle Seahawks -3.5 -110', rationale: 'Exact complete rationale.', bdl_game_id: 1392216 };
    await expect(store([pick])).resolves.toMatchObject({ success: true });
    expect(storeTestPicks).toHaveBeenCalledWith(
      [{ ...pick, test_arm: 'NFL opening preflight' }],
      'NFL opening preflight', expect.stringContaining('Test run at'), { date: '2026-09-09' },
    );
    expect(assertPicksStillPregame).not.toHaveBeenCalled();
    storeTestPicks.mockResolvedValueOnce({ success: false, error: 'write failed' });
    await expect(store([pick])).rejects.toThrow('TEST storage failed: write failed');
  });
});
