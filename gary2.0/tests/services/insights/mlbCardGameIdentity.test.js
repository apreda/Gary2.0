import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/services/baseballSavantService.js', () => ({ getBatterXStats: vi.fn().mockResolvedValue([]), getPitcherXStats: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../src/services/insights/lineupSource.js', () => ({ loadProjectedFieldLineups: vi.fn().mockResolvedValue(new Map()), usableLineup: value => value != null }));
import { buildPlayerInsightCards } from '../../../src/services/insights/playerInsightCards.js';

const games = [1, 2].map(id => ({ id, visitor_team: { id: 10, abbreviation: 'CHC' }, home_team: { id: 20, abbreviation: 'STL' } }));
const lineups = id => ({
  CHC: { batters: [{ playerId: '700', name: 'Pete Crow-Armstrong', position: 'CF', batsThrows: 'L/L' }] },
  STL: { pitcher: { playerId: id === 1 ? '901' : '902', name: id === 1 ? 'First Starter' : 'Second Starter', batsThrows: id === 1 ? 'R/R' : 'L/L' }, batters: [] },
});
function provider() {
  return {
    getMlbLineups: vi.fn(async id => lineups(id)),
    getMlbPlayersByIds: vi.fn(async () => ({ 700: { name: 'Pete Crow-Armstrong', teamAbbr: 'CHC', position: 'CF' }, 800: { name: 'Season Context', teamAbbr: 'CHC', position: 'OF' } })),
    getMlbPlayerSeasonStats: vi.fn(async () => [{ player: { id: 700 }, batting_avg: 0.27, batting_ops: 0.82 }]),
    getMlbPlayerSplits: vi.fn(async () => null),
    getMlbPitcherPitchTypeStats: vi.fn(async () => []),
    getMlbHitterPitchTypeStats: vi.fn(async () => []),
    getMlbPlayerVsPlayer: vi.fn(async () => []),
    getMlbPlayerGameRowsChrono: vi.fn(async () => []),
    getMlbPlayerProps: vi.fn(async id => [{ player_id: 700, prop_type: 'hits', line_value: id === 1 ? 0.5 : 1.5, market: { type: 'over_under', over_odds: -110, under_odds: -110 } }]),
  };
}
const build = (bdl, extra = {}) => buildPlayerInsightCards({ date: '2026-09-07', league: 'MLB', games,
  connections: [{ player_id: '700', game_id: '2' }], bdl, ...extra });

describe('MLB exact-game card assembly', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
  it('builds both doubleheader cards with the actual opposing starter and lines for each game', async () => {
    const bdl = provider();
    const packs = (await build(bdl)).filter(row => row.player_id === '700');
    expect(packs.map(row => row.game_id)).toEqual(['1', '2']);
    expect(packs.map(row => row.payload.opponent)).toEqual([{ name: 'First Starter', hand: 'R' }, { name: 'Second Starter', hand: 'L' }]);
    expect(packs.map(row => row.payload.props[0].line)).toEqual(['0.5', '1.5']);
    expect(bdl.getMlbLineups).toHaveBeenCalledTimes(2);
    expect(bdl.getMlbPlayerProps).toHaveBeenCalledTimes(2);
    expect(bdl.getMlbPlayerSeasonStats).toHaveBeenCalledTimes(1);
    expect(bdl.getMlbPlayerSplits.mock.calls.filter(([args]) => args.playerId === '700')).toHaveLength(1);
    expect(bdl.getMlbPlayerGameRowsChrono.mock.calls.filter(([id]) => id === '700')).toHaveLength(1);
    expect(bdl.getMlbPlayerVsPlayer.mock.calls.filter(([args]) => args.playerId === '700')).toHaveLength(1);
  });

  it('does not duplicate a repeated slate ID or attach a later-game player to the first game', async () => {
    const bdl = provider();
    bdl.getMlbLineups.mockImplementation(async id => id === 1 ? { CHC: { batters: [] }, STL: { batters: [] } } : lineups(id));
    const packs = (await build(bdl, { games: [games[0], games[1], games[1]] })).filter(row => row.player_id === '700');
    expect(packs.map(row => row.game_id)).toEqual(['2']);
    expect(packs[0].payload.opponent.name).toBe('Second Starter');
    expect(bdl.getMlbLineups).toHaveBeenCalledTimes(2);
  });

  it('keeps absent-lineup subjects unassigned instead of inventing a matchup from a story ID', async () => {
    const packs = await build(provider(), { connections: [{ player_id: '800', game_id: '2' }] });
    const offSlate = packs.filter(row => row.player_id === '800');
    expect(offSlate).toHaveLength(1);
    expect(offSlate[0].game_id).toBeNull();
    expect(offSlate[0].payload).not.toHaveProperty('opponent');
    expect(offSlate[0].payload).not.toHaveProperty('props');
  });

  it('does not choose a team when a provider lists the same player on both sides', async () => {
    const bdl = provider();
    bdl.getMlbLineups.mockImplementation(async () => ({ CHC: { batters: [{ playerId: '700' }] }, STL: { batters: [{ playerId: '700' }] } }));
    const packs = await build(bdl);
    expect(packs.filter(row => row.player_id === '700').map(row => row.game_id)).toEqual([null]);
  });

  it('limits a targeted repair to exact player IDs while retaining both games and their opposing pitchers', async () => {
    const bdl = provider();
    const packs = await build(bdl, { onlyPlayerIds: [700, '700', 'missing'], connections: [{ player_id: '800' }] });
    expect(packs.map(row => [row.player_id, row.game_id])).toEqual([['700', '1'], ['700', '2']]);
    expect(packs.map(row => row.payload.opponent.name)).toEqual(['First Starter', 'Second Starter']);
    expect(bdl.getMlbPlayersByIds).toHaveBeenCalledWith(['700']);
    expect(bdl.getMlbPlayerSeasonStats).toHaveBeenCalledWith({ season: 2026, playerIds: ['700'] });
    expect(bdl.getMlbPlayerGameRowsChrono.mock.calls).toEqual([['700', 2026]]);
    expect(bdl.getMlbPitcherPitchTypeStats.mock.calls.map(([args]) => args.playerIds)).toEqual([['901'], ['902']]);
  });

  it('fails closed for an empty or invalid repair scope before making provider reads', async () => {
    for (const onlyPlayerIds of [[], null, '700', [null, {}, '  ']]) {
      const bdl = provider();
      expect(await build(bdl, { onlyPlayerIds })).toEqual([]);
      expect(bdl.getMlbLineups).not.toHaveBeenCalled();
      expect(bdl.getMlbPlayersByIds).not.toHaveBeenCalled();
    }
    const bdl = provider();
    expect(await build(bdl, { onlyPlayerIds: ['999'] })).toEqual([]);
    expect(bdl.getMlbPlayersByIds).not.toHaveBeenCalled();
  });
});
