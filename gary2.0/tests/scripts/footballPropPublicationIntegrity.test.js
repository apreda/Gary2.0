import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService } from '../../src/services/ballDontLieService.js';
import { buildNflPropsAgenticContext } from '../../src/services/agentic/nflPropsAgenticContext.js';
import { normalizePropBetDirection } from '../../src/services/agentic/propsSharedUtils.js';

const home = 'Buffalo Bills', away = 'New York Jets';
const game = { id: 99, bdl_game_id: 99, home_team: home, away_team: away, commence_time: '2026-09-13T17:00:00Z' };
const prop = { player: 'Fixture Receiver', player_id: 1, team: home, prop_type: 'receiving_yards', line: 49.5, over_odds: -110, under_odds: -110 };
const quiet = { log() {}, warn() {}, error() {} };
const cli = readFileSync(new URL('../../scripts/run-agentic-props-cli.js', import.meta.url), 'utf8');
const start = cli.indexOf('result.picks = result.picks.map(pick => {');
const stop = cli.indexOf('// TD scorer identity', start);
if (start < 0 || stop < 0) throw new Error('Publication fixture extraction markers missing');

function publish(picks, playerProps, leagueLabel = 'NFL') {
  // Run the shipping mapper and hard gates without loading the script's
  // credential-bearing entrypoint or invoking a model/provider/database.
  return vm.runInNewContext(`${cli.slice(start, stop)}\nresult.picks`, {
    result: { picks }, playerProps, leagueLabel, game, matchup: `${away} @ ${home}`,
    sportKey: leagueLabel === 'NFL' ? 'americanfootball_nfl' : 'americanfootball_ncaaf',
    FOOTBALL_PROP_LEAGUES: new Set(['NFL', 'NCAAF']), normalizePropBetDirection,
    reconcilePropTeam: (_model, provider) => provider,
    propOddsService: { isOddsTakeable: () => true }, console: quiet,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(ballDontLieService, 'getTeamByNameGeneric').mockImplementation(async (_sport, team) => ({ id: team === home ? 1 : 2, full_name: team }));
  vi.spyOn(ballDontLieService, 'getInjuriesGeneric').mockResolvedValue([]);
  vi.spyOn(ballDontLieService, 'getNflSeasonStatsByTeam').mockResolvedValue([]);
  vi.spyOn(ballDontLieService, 'getNflPlayerGameLogsBatch').mockResolvedValue({});
});
afterEach(() => vi.restoreAllMocks());

describe('NFL context through the actual publication boundaries', () => {
  it('removes roster-only players from board, candidates, token slices and summary before the desk brain', async () => {
    const context = await buildNflPropsAgenticContext(game, [prop]);
    expect(context.playerProps).toEqual([]);
    expect(context.propCandidates).toEqual([]);
    expect(context.tokenData.propCandidates).toEqual([]);
    expect(context.gameSummary.topCandidates).toEqual([]);
    const source = readFileSync(new URL('../../src/services/pickdesk/footballPropsDesk.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export async function analyzeFootballPropsDesk(')).replace(/^export /, '');
    const brain = vi.fn(() => { throw new Error('unexpected brain'); });
    const desk = vm.runInNewContext(`(${body})`, {
      SPORT_KEY_BY_LEAGUE: { NFL: 'americanfootball_nfl' }, norm: value => String(value).toLowerCase().trim(),
      buildNflPropsAgenticContext: async () => context, runPropsDeskBrain: brain,
    });
    await expect(desk(game, [prop], { league: 'NFL' })).rejects.toThrow('no roster/stat-validated player candidates');
    expect(brain).not.toHaveBeenCalled();
  });

  it('keeps a measured prior-season market while dropping unrelated markets and ungrounded players', async () => {
    ballDontLieService.getNflPlayerGameLogsBatch.mockImplementation(async (_ids, season) => season === 2025
      ? { 1: { games: [{ rec_yds: 83, receptions: null }], averages: {}, gamesAnalyzed: 1 } } : {});
    const context = await buildNflPropsAgenticContext(game, [prop,
      { ...prop, prop_type: 'receptions', line: 4.5 },
      { ...prop, player: 'Ungrounded Receiver', player_id: 2 }]);
    expect(context.playerProps).toEqual([prop]);
    expect(context.propCandidates).toHaveLength(1);
    expect(context.propCandidates[0].props.map(p => p.type)).toEqual(['receiving_yards']);
    expect(context.playerGameLogs).toEqual({});
    expect(context.priorGameLogs[1].games).toEqual([{ rec_yds: 83, receptions: null }]);
    expect(context.dataWindow.priorSeason).toBe(2025);
    const picks = publish([{ player: prop.player, player_id: 999, prop: prop.prop_type, line: prop.line, bet: 'over' }], context.playerProps);
    expect(picks).toEqual([expect.objectContaining({ player_id: 1, game_id: 99, odds: '-110', team: home })]);
  });
});

describe.each(['NFL', 'NCAAF'])('%s provider identity persistence', league => {
  const pick = { player: prop.player, player_id: 999, prop: prop.prop_type, line: prop.line, bet: 'over' };
  it('stores the reconciled exact provider ID instead of the model ID', () => {
    expect(publish([pick], [prop], league)).toEqual([expect.objectContaining({ player_id: 1 })]);
  });
  it('drops a priced row when the exact provider ID is missing', () => {
    expect(publish([pick], [{ ...prop, player_id: null }], league)).toEqual([]);
  });
});
