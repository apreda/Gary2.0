import { describe, expect, it, vi } from 'vitest';

// The darts' snap counts and weekly player rows come through the game reads' loader (and its copy on disk), not a
// download of their own (Nov 10 2026: on Nov 8 the darts read "snaps 0").
const files = {
  snap_counts: { rows: [
    { game_type: 'REG', week: '9', player: 'Ja\'Marr Chase', pfr_player_id: 'ChasJa00', position: 'WR', team: 'CIN', opponent: 'ATL', offense_snaps: '60', offense_pct: '0.95', defense_snaps: '0', st_snaps: '0' },
    { game_type: 'REG', week: '9', player: 'Tee Higgins', pfr_player_id: 'HiggTe00', position: 'WR', team: 'CIN', opponent: 'ATL', offense_snaps: '63', offense_pct: '1.0', defense_snaps: '0', st_snaps: '0' }
  ], fromDisk: true },
  stats_player_week: { unavailable: true, reason: 'Could not reach nflverse for stats_player_week_2026.csv: timeout' }
};
const asked = [];
vi.mock('../../src/services/providers/nflverseService.js', async (real) => ({
  ...(await real()),
  loadNflverseFile: async (asset, season) => { asked.push(`${asset}_${season}`); return files[asset]; }
}));
vi.mock('../../src/services/sports/nfl/nflStreaksService.js', async (real) => ({
  ...(await real()),
  fetchCsv: async (url) => { throw new Error(`nflverse timeout for ${url}`); }
}));
vi.mock('../../src/services/sports/nfl/nflSchedule.js', async (real) => ({
  ...(await real()),
  getNflSchedule: async () => ({ rows: [{ season: '2026', week: '9', game_type: 'REG', home_team: 'ATL', away_team: 'CIN', gameday: '2026-11-08', location: 'Neutral', home_score: '20', away_score: '17', overtime: '0' }], stale: 7 })
}));
const { snapCounts, weeklyRows, gameDays } = await import('../../src/services/sports/nfl/nflPlayerContext.js');

describe('the darts read snaps and weekly rows through the loader', () => {
  it('builds the snap lists from the loader\'s rows, a copy on disk included', async () => {
    const snaps = await snapCounts(2026);
    expect(asked).toContain('snap_counts_2026');
    expect(snaps.get('jamarr chase')).toEqual([{ week: 9, team: 'CIN', opp: 'ATL', snaps: 60, teamSnaps: 63 }]);
    expect(snaps.teamTop.get('CIN|9')).toEqual({ snaps: 63, total: 63 });
  });

  it('a load that failed reads as not loaded (null), as the plain download did', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await weeklyRows(2026)).toBeNull();
    expect(warn.mock.calls[0][0]).toMatch(/week\|2026 did not load: Could not reach nflverse for stats_player_week_2026\.csv/);
    warn.mockRestore();
  });

  it('the schedule, when its download fails, comes from the schedule loader\'s copy', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const days = await gameDays();
    expect(days.get('2026|9|CIN')).toBe('2026-11-08');
    expect(days.site.get('2026|9|ATL')).toBe('neutral');
    expect(days.result.get('2026|9|CIN')).toBe('L 17-20');
    warn.mockRestore();
  });
});
