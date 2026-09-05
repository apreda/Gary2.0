import { describe, expect, it, vi } from 'vitest';
import { buildFootballPlayerInsightCards } from '../../../src/services/insights/footballPlayerInsightCards.js';

const home = { id: 1, full_name: 'Home Club', abbreviation: 'HOM' };
const away = { id: 2, full_name: 'Away Club', abbreviation: 'AWY' };
const game = { id: 10, date: '2026-09-09T23:00:00Z', home_team: home, away_team: away };
const qb = { id: 101, name: 'Veteran Quarterback', position: 'QB' };
const receiver = { id: 102, name: 'Veteran Receiver', position: 'WR' };
const log = (yards) => ({
  games: [{ isHome: true, opponent: 'Opponent', pass_comp: 20, pass_att: 30, pass_yds: yards, pass_tds: 2, ints: 1 }],
  averages: { pass_yds: yards },
});
function provider({ players = [qb], currentStats = [], currentLogs = {}, priorStats = [], priorLogs = {} } = {}) {
  return {
    getNflAdvancedPassingStats: vi.fn(async ({ season }) => season === 2026 ? currentStats : priorStats),
    getNflAdvancedRushingStats: vi.fn(async () => []),
    getNflAdvancedReceivingStats: vi.fn(async () => []),
    getNflPlayerInjuries: vi.fn(async () => []),
    getNflRosterDepth: vi.fn(async () => ({ home: players, away: [] })),
    getNflPlayerGameLogsBatch: vi.fn(async (_ids, season) => season === 2026 ? currentLogs : priorLogs),
    getNflPlayerProps: vi.fn(async () => []),
  };
}
const build = (bdl, date = '2026-09-09', games = [game]) => buildFootballPlayerInsightCards({ date, league: 'NFL', games, bdl });

describe('NFL card season windows', () => {
  it('keeps a healthy Week 1 veteran card using clearly labeled prior regular-season history', async () => {
    const bdl = provider({ priorStats: [{ player: { id: 101 }, passing_yards: 4200, passing_attempts: 550 }], priorLogs: { 101: log(275) } });
    const [pack] = await build(bdl);
    expect(pack.player_name).toBe(qb.name);
    expect(pack.payload.season.line1).toContain('4200 pass yds');
    expect(pack.payload.season.line2).toBe('2025 season — prior season');
    expect(pack.payload.formRows[0].label).toBe('LAST 1 — 2025 SEASON');
    expect(bdl.getNflPlayerGameLogsBatch).toHaveBeenCalledWith([101], 2025, 5, 15, { seasonType: 2 });
  });

  it('chooses the season per player and does not mix a current game with prior totals', async () => {
    const bdl = provider({ players: [qb, receiver], currentLogs: { 101: log(240) }, priorLogs: { 102: {
      games: [{ opponent: 'Previous Opponent', isHome: false, targets: 9, receptions: 6, rec_yds: 80 }], averages: { rec_yds: 80 },
    } } });
    const packs = await build(bdl, '2026-09-13');
    const current = packs.find((p) => p.player_id === '101');
    const prior = packs.find((p) => p.player_id === '102');
    expect(current.payload.formRows[0]).toMatchObject({ label: 'LAST 1', value: '240 pass yds/g' });
    expect(current.payload.season).toBeNull();
    expect(prior.payload.formRows[0].label).toBe('LAST 1 — 2025 SEASON');
    expect(bdl.getNflPlayerGameLogsBatch).toHaveBeenCalledWith([102], 2025, 5, 15, { seasonType: 2 });
  });

  it('uses current advanced production when its log is unavailable and avoids a prior fetch', async () => {
    const bdl = provider({ currentStats: [{ player_id: 101, passing_yards: 255, passing_attempts: 30 }] });
    const [pack] = await build(bdl);
    expect(pack.payload.season.line2).toBe('2026 season');
    expect(pack.payload.formRows).toBeNull();
    expect(bdl.getNflAdvancedPassingStats.mock.calls).toEqual([[{ season: 2026 }]]);
    expect(bdl.getNflPlayerGameLogsBatch.mock.calls.map((call) => call[1])).toEqual([2026]);
  });

  it('does not mistake empty zero placeholders for a current-season sample', async () => {
    const bdl = provider({ currentStats: [{ player_id: 101, passing_yards: 0, passing_attempts: 0 }], priorLogs: { 101: log(275) } });
    const [pack] = await build(bdl);
    expect(pack.payload.season).toBeNull();
    expect(pack.payload.formRows[0].label).toContain('2025 SEASON');
  });

  it('does not invent history for a rookie with no current or prior source rows', async () => {
    const bdl = provider({ players: [{ id: 999, name: 'Rookie Player', position: 'WR' }] });
    expect(await build(bdl)).toEqual([]);
  });

  it('keeps August on prior regular-season data and shares prior advanced reads across games', async () => {
    const bdl = provider({ priorLogs: { 101: log(275) } });
    const packs = await build(bdl, '2026-08-29', [game, { ...game, id: 11 }]);
    expect(packs).toHaveLength(2);
    expect(bdl.getNflAdvancedPassingStats.mock.calls).toEqual([[{ season: 2025 }]]);
    expect(bdl.getNflPlayerGameLogsBatch.mock.calls.every((call) => call[1] === 2025 && call[4].seasonType === 2)).toBe(true);
  });

  it('checkpoints each NFL game before fetching the next game roster', async () => {
    const bdl = provider({ currentLogs: { 101: log(240) } });
    const stored = [];
    bdl.getNflRosterDepth.mockImplementation(async () => {
      if (bdl.getNflRosterDepth.mock.calls.length === 2) expect(stored.map((rows) => rows[0].game_id)).toEqual(['10']);
      return { home: [qb], away: [] };
    });
    const packs = await buildFootballPlayerInsightCards({
      date: '2026-09-09', league: 'NFL', games: [game, { ...game, id: 11 }], bdl,
      onGameBuilt: async rows => { stored.push(rows); },
    });
    expect(packs).toHaveLength(2);
    expect(stored.map((rows) => rows[0].game_id)).toEqual(['10', '11']);
  });
});
