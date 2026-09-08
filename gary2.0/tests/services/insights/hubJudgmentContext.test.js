import { describe, expect, it, vi } from 'vitest';
import { collectHubJudgmentContext } from '../../../src/services/insights/hubJudgmentContext.js';

const asOf = '2026-09-08T16:00:00Z';
const game = { id: 10, date: '2026-09-08T23:00:00Z',
  home_team: { id: 2, name: 'Home Club', abbreviation: 'HOM' },
  visitor_team: { id: 1, name: 'Away Club', abbreviation: 'AWY' } };
const batter = (id, order) => ({ playerId: id, name: `Batter ${id}`, battingOrder: order, batsThrows: 'L/R', position: 'OF' });
function provider() {
  const lineup = {
    HOM: { pitcher: { playerId: 100, name: 'Home Starter', batsThrows: 'R/R' }, batters: Array.from({ length: 9 }, (_, i) => batter(i + 1, i + 1)) },
    AWY: { pitcher: { playerId: 200, name: 'Away Starter', batsThrows: 'L/L' }, batters: [batter(11, 1)] },
  };
  return { getMlbLineups: vi.fn(async () => lineup),
    getMlbPlayerSeasonStats: vi.fn(async ({ playerIds }) => playerIds.map(id => ({ player: { id }, season: 2026,
      ...(Number(id) >= 100 ? { pitching_era: 3.25, pitching_ip: 100.2, pitching_gs: 20 } : { batting_ops: 0.810, batting_ab: 100 }) }))) };
}

describe('Hub current whole-game context', () => {
  it('collects both sides, exact probable starters, full/partial orders and independent season baselines', async () => {
    const bdl = provider();
    const result = await collectHubJudgmentContext({ date: '2026-09-08', league: 'MLB', games: [game], bdl, asOf });
    const context = result.get('10'), evidence = context.evidence[0], [away, home] = evidence.facts.sides;
    expect(context.complete).toBe(true);
    expect(bdl.getMlbLineups).toHaveBeenCalledWith(10, { throwOnError: true });
    expect(home.lineup_status).toBe('confirmed'); expect(away.lineup_status).toBe('partial');
    expect(home.probable_pitcher).toMatchObject({ player_id: '100', status: 'probable', season_baseline: { pitching_era: 3.25 } });
    expect(away.probable_pitcher).toMatchObject({ player_id: '200', status: 'probable' });
    expect(home.batters).toHaveLength(9);
    expect(evidence.game_id).toBe('10'); expect(evidence.source_updated_at).toBeNull();
    expect(evidence.summary).toContain('3.25 ERA'); expect(evidence.summary).toContain('0.810 OPS, 100 AB');
    expect(context.limitations.join(' ')).toContain('collection time');
  });
  it('prepares conventional display precision without changing raw values or baseball innings notation', async () => {
    const bdl = provider();
    bdl.getMlbPlayerSeasonStats.mockResolvedValue([{ player_id: 100, season: 2026,
      pitching_era: 3.2004, pitching_whip: 1.1443, pitching_ip: 154.2, pitching_gp: 28, pitching_gs: 24,
      pitching_k_per_9: 9.717672, batting_ops: 0.81012 }]);
    const context = (await collectHubJudgmentContext({ date: '2026-09-08', league: 'mlb', games: [game], bdl, asOf })).get('10');
    const baseline = context.evidence[0].facts.sides[1].probable_pitcher.season_baseline;
    expect(baseline.pitching_era).toBe(3.2004);
    expect(baseline.display_measurements).toMatchObject({ pitching_era: '3.20', pitching_whip: '1.144',
      pitching_ip: '154.2', pitching_gp: '28', pitching_gs: '24', pitching_k_per_9: '9.72', batting_ops: '0.810' });
    expect(context.evidence[0].summary).toContain('3.20 ERA, 1.144 WHIP, 154.2 IP, 28 appearances, 24 starts');
  });
  it('keeps unposted orders and absent baselines unknown instead of projecting a lineup or synthesizing zeros', async () => {
    const bdl = provider(); bdl.getMlbLineups.mockResolvedValue({ HOM: { batters: [], pitcher: null }, AWY: { batters: [] } });
    const context = (await collectHubJudgmentContext({ date: '2026-09-08', league: 'mlb', games: [game], bdl, asOf })).get('10');
    expect(context.complete).toBe(true);
    expect(context.evidence[0].facts.sides.every(side => side.lineup_status === 'not_posted' && side.probable_pitcher === null)).toBe(true);
    expect(bdl.getMlbPlayerSeasonStats).not.toHaveBeenCalled();
  });
  it('accepts the actual provider healthy-null shape as not posted, while thrown reads remain failures', async () => {
    const bdl = provider(); bdl.getMlbLineups.mockResolvedValue(null);
    const args = { date: '2026-09-08', league: 'mlb', games: [game], bdl, asOf };
    const context = (await collectHubJudgmentContext(args)).get('10');
    expect(context.complete).toBe(true);
    expect(context.evidence[0].facts.sides.every(side => side.lineup_status === 'not_posted')).toBe(true);
    bdl.getMlbLineups.mockRejectedValue(new Error('transport failed'));
    expect((await collectHubJudgmentContext(args)).get('10').complete).toBe(false);
  });
  it('rejects conflicting season snapshots and ignores prior-season data for current baseline labels', async () => {
    const bdl = provider();
    bdl.getMlbPlayerSeasonStats.mockResolvedValue([
      { player: { id: 100 }, season: 2025, pitching_era: 1.10 },
      { player: { id: 100 }, season: 2026, pitching_era: 2.10 },
      { player: { id: 100 }, season: 2026, pitching_era: 4.10 },
    ]);
    const context = (await collectHubJudgmentContext({ date: '2026-09-08', league: 'mlb', games: [game], bdl, asOf })).get('10');
    expect(context.evidence[0].facts.sides[1].probable_pitcher.season_baseline).toBeNull();
  });
  it('distinguishes transport failure from honest missing data and bounds a hung provider', async () => {
    const bdl = provider(); bdl.getMlbPlayerSeasonStats.mockRejectedValue(new Error('provider unavailable'));
    const args = { date: '2026-09-08', league: 'mlb', games: [game], bdl, asOf };
    expect((await collectHubJudgmentContext(args)).get('10').complete).toBe(false);
    bdl.getMlbLineups.mockImplementation(async () => new Promise(() => {}));
    const result = await collectHubJudgmentContext({ ...args, budgetMs: 10 });
    expect(result.get('10').complete).toBe(false);
    expect(result.get('10').limitations[0]).toContain('deadline');
  });
});
