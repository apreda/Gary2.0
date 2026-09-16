import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { assertMlbScoutReadiness, assertMlbPublicationReadiness, mlbDataFailureResult } from '../../src/services/mlbDataReadiness.js';
import { shouldRetryPickWithModel } from '../../src/services/marketTruth.js';
import { mlbScoutFixture, withMlbReadiness } from '../fixtures/mlbReadiness.js';

const game = { id: 5060044, home_team: 'Cardinals', away_team: 'Giants', commence_time: '2026-09-16T17:15:00Z' };
const report = mlbScoutFixture(game);
const damaged = [
  ['missing roster', report.replace(/Cardinals \(10 players\)[\s\S]*?\n\n/, 'Cardinals: Roster unavailable\n\n')],
  ['eight hitters', report.replace('  9. Cardinals Hitter 9 (CF) [Bats: R]\n', '')],
  ['duplicate hitter', report.replace('9. Cardinals Hitter 9', '9. Cardinals Hitter 8')],
  ['duplicate batting slot', report.replace('9. Cardinals Hitter 9', '8. Cardinals Hitter 9')],
  ['unknown hitter', report.replace('9. Cardinals Hitter 9', '9. TBD')],
  ['hitter outside roster', report.replace('9. Cardinals Hitter 9', '9. Another Player')],
  ['missing starter', report.replace('  SP: Cardinals Starter (Throws: R)', '')],
  ['starter outside roster', report.replace('SP: Cardinals Starter', 'SP: Another Pitcher')],
  ['wrong team', report.replace('MATCHUP: Giants @ Cardinals', 'MATCHUP: Giants @ Cubs')],
  ['roster count mismatch', report.replace('Cardinals (10 players)', 'Cardinals (28 players)')],
  ['missing report', null],
];

describe('required MLB data before analysis and publication', () => {
  it('rejects the actual Giants incident and accepts the same lineups with verified named rosters restored', () => {
    const incident = JSON.parse(readFileSync(new URL('../fixtures/mlb-missing-rosters-2026-09-16.json', import.meta.url), 'utf8'));
    expect(() => assertMlbScoutReadiness(incident.original, incident.game)).toThrow('Cardinals: roster section unavailable');
    const receipt = assertMlbScoutReadiness(incident.withRestoredRosters, incident.game);
    expect(receipt.home.starter).toBe('Matthew Liberatore');
    expect(receipt.away.starter).toBe('Anthony Molina');
    expect(receipt.away.lineup[1].name).toBe('Bryce Eldridge');
  });
  it('accepts complete reports and binds the receipt to the exact game and report', () => {
    const receipt = assertMlbScoutReadiness(report, game);
    expect(receipt.home.lineup).toHaveLength(9);
    expect(receipt.away.starter).toBe('Giants Starter');
    expect(receipt.scout_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertMlbPublicationReadiness({ ...game, league: 'MLB', input_readiness: receipt })).not.toThrow();
  });
  it.each(damaged)('blocks %s and forbids model retries', (_label, report) => {
    let failure;
    try { assertMlbScoutReadiness(report, game); } catch (error) { failure = mlbDataFailureResult(error); }
    expect(failure).toMatchObject({ code: 'required_data_unavailable', retryModel: false });
    expect(shouldRetryPickWithModel(failure)).toBe(false);
  });
  it('classifies the existing fresh-lineup hard failure without changing the model', () => {
    const failure = mlbDataFailureResult(new Error('[Scout Report] HARD FAIL — MLB requires lineups + starting pitchers for Giants @ Cardinals'));
    expect(failure.retryModel).toBe(false);
    expect(shouldRetryPickWithModel(failure)).toBe(false);
    expect(shouldRetryPickWithModel({ error: 'Provider offline' })).toBe(true);
  });
  it.each(['missing', 'different game', 'different time', 'malformed roster', 'malformed lineup', 'no source'])('blocks publication with %s receipt', scenario => {
    const pick = withMlbReadiness({ ...game, league: 'MLB' });
    if (scenario === 'missing') delete pick.input_readiness;
    if (scenario === 'different game') pick.id++;
    if (scenario === 'different time') pick.commence_time = '2026-09-16T21:15:00Z';
    if (scenario === 'malformed roster') pick.input_readiness.home.roster = [];
    if (scenario === 'malformed lineup') pick.input_readiness.away.lineup.pop();
    if (scenario === 'no source') delete pick.input_readiness.scout_sha256;
    expect(() => assertMlbPublicationReadiness(pick)).toThrow('MLB_REQUIRED_DATA');
  });
  it.each([{ league: 'baseball_mlb' }, { league: 'Baseball MLB' }, { sport: 'MLB' }, { sport_key: 'baseball_mlb' }])('requires evidence across MLB identifiers: %j', identifier => {
    expect(() => assertMlbPublicationReadiness({ ...game, ...identifier })).toThrow('MLB_REQUIRED_DATA');
  });
});

describe('real June orchestration boundary', () => {
  const source = readFileSync(new URL('../../src/services/agentic/mlbJuneEra/orchestratorMain.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function analyzeGameWithData(');
  const end = source.indexOf('\n}\n', start) + 2;
  const load = (report, cached) => {
    const getConstitution = vi.fn(() => { throw new Error('TEST: reached model setup'); });
    const buildScoutReport = vi.fn(async () => ({ garyText: report }));
    const saveCachedScoutReport = vi.fn();
    const analyze = vm.runInNewContext(`(${source.slice(start, end).replace('export ', '')})`, {
      assertMlbScoutReadiness, mlbDataFailureResult, getConstitution, buildScoutReport, saveCachedScoutReport,
      loadCachedScoutReport: () => cached ? { garyText: report } : null,
      clearStatRouterCache: vi.fn(),
      console: { log: vi.fn(), error: vi.fn() },
    });
    return { analyze, getConstitution, buildScoutReport, saveCachedScoutReport };
  };
  it.each([true, false])('rejects incomplete %s cached report before research or model setup', async cached => {
    const f = load(damaged[0][1], cached);
    const result = await f.analyze({ ...game }, 'baseball_mlb', {});
    expect(result).toMatchObject({ code: 'required_data_unavailable', retryModel: false });
    expect(f.getConstitution).not.toHaveBeenCalled();
    expect(f.saveCachedScoutReport).not.toHaveBeenCalled();
    expect(f.buildScoutReport).toHaveBeenCalledTimes(cached ? 0 : 1);
  });
  it.each([true, false])('allows complete %s cached report to reach model setup', async cached => {
    const f = load(report, cached);
    const result = await f.analyze({ ...game }, 'baseball_mlb', {});
    expect(result.error).toBe('TEST: reached model setup');
    expect(f.getConstitution).toHaveBeenCalledTimes(1);
  });
});
