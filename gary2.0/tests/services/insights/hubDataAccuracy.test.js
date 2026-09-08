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
const { applyGaryVoice } = await import('../../../src/services/insights/garyInsightVoice.js');

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
    expect(mocks.read.mock.calls[0][0]).toContain('Fixture Reliever 12.2 IP');
  });
});

describe('future starter evidence', () => {
  it('keeps the computed tomorrow date through both production prose passes', async () => {
    mocks.xstats.mockResolvedValue([{ name: 'Foster Griffin', era: 3.26, xera: 4.27, pa: 200, ba: 0.235, est_ba: 0.257 }]);
    mocks.schedule.mockResolvedValue([{ teams: {
      away: { team: { name: 'Cleveland Guardians', abbreviation: 'CLE' }, probablePitcher: { fullName: 'Foster Griffin' } },
      home: { team: { name: 'Baltimore Orioles', abbreviation: 'BAL' } },
    } }]);
    const rows = await computeRegressionWatch({
      date: '2026-09-08', season: 2026, games: [], helpers: { gameLabel: () => 'CLE @ BAL' },
      bdl: { getMlbStandings: async () => [], getMlbSeasonGameIndex: async () => new Map() },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].meta.day).toBe('tomorrow');
    expect(rows[0].detail).toContain('Projected to start tomorrow vs BAL');
    await applyGaryVoice(rows, { league: 'MLB' });
    expect(rows[0].detail).toContain('Projected to start tomorrow vs BAL');
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
