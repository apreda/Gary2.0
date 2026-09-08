import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(), teams: vi.fn(), box: vi.fn(), xstats: vi.fn(), profiles: vi.fn(),
  read: vi.fn(), create: vi.fn(), send: vi.fn(),
}));
vi.mock('../../../src/services/mlbStatsApiService.js', () => ({
  getMlbSchedule: mocks.schedule,
  default: { getMlbSchedule: mocks.schedule, getMlbTeams: mocks.teams, getGameBoxScore: mocks.box },
}));
vi.mock('../../../src/services/baseballSavantService.js', () => ({
  getPitcherXStats: mocks.xstats, getPitcherStatcastProfiles: mocks.profiles,
}));
vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: mocks.read, contentModel: () => 'test', contentModelCascade: () => ['test'],
}));
vi.mock('../../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: mocks.create, sendToSessionWithRetry: mocks.send,
}));

const { formatIpThirds, parseIpThirds } = await import('../../../src/services/insights/shared.js');
const { computeBullpenFatigue } = await import('../../../src/services/insights/computers/bullpenFatigue.js');
const { computeRegressionWatch } = await import('../../../src/services/insights/computers/regressionWatch.js');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue('{"reads":[]}');
  mocks.profiles.mockResolvedValue([]);
});

describe('Hub baseball innings evidence', () => {
  it.each([[13 + 1 / 3, 13.1], [12 + 2 / 3, 12.2], [0, 0], [18, 18]])('formats %s innings as %s IP', (n, display) => {
    expect(formatIpThirds(n)).toBe(display);
    expect(parseIpThirds(display)).toBeCloseTo(n, 10);
  });
  it('keeps summed bullpen IP and individual arms in the same baseball notation', async () => {
    mocks.teams.mockResolvedValue([{ id: 1, name: 'Colorado Rockies' }]);
    mocks.schedule.mockImplementation(async (date) => ['2026-09-07', '2026-09-06', '2026-09-05'].includes(date)
      ? [{ gamePk: date, officialDate: date, status: { detailedState: 'Final' }, teams: { home: { team: { id: 1 } } } }]
      : []);
    mocks.box.mockImplementation(async (date) => ({ teams: { home: {
      pitchers: [10, 20], players: { ID20: { person: { fullName: 'Fixture Reliever' }, stats: { pitching: {
        inningsPitched: date === '2026-09-05' ? '4.0' : '4.1', numberOfPitches: 40,
      } } } },
    } } }));
    const rows = await computeBullpenFatigue({
      date: '2026-09-08', games: [{ id: 100, home_team: { id: 9, name: 'Colorado Rockies' } }],
      helpers: { gameLabel: () => 'COL @ NYY' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toContain('12.2 relief IP');
    expect(rows[0].meta.relief_ip).toBe(12.2);
    expect(rows[0].meta.arms[0].ip).toBe(12.2);
    expect(rows[0].detail).toContain('Fixture Reliever worked all 3 games (120 pitches)');
    expect(rows[0].detail).toContain('Sep 5–Sep 7');
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe('regression metric policy', () => {
  it('preserves observed one-run records without loading excluded pitcher regression sources', async () => {
    mocks.xstats.mockResolvedValue([{ name: 'Fixture Starter', era: 3.26, xera: 4.27, pa: 200 }]);
    const seasonIndex = new Map(Array.from({ length: 12 }, (_, i) => [i, {
      status: 'STATUS_FINAL', seasonType: 'regular', homeId: 1, awayId: 2, homeRuns: 4, awayRuns: 3,
      date: '2026-09-01T20:00:00Z',
    }]));
    const rows = await computeRegressionWatch({ season: 2026, date: '2026-09-08',
      games: [{ id: 100, home_team: { id: 1, name: 'Fixture Club', abbreviation: 'FIX' }, visitor_team: { id: 3, abbreviation: 'OPP' } }],
      bdl: { getMlbSeasonGameIndex: async () => seasonIndex },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].headline).toContain('12-0 in one-run games');
    expect(JSON.stringify(rows)).not.toMatch(/xera|expected era/i);
    expect(mocks.xstats).not.toHaveBeenCalled();
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
