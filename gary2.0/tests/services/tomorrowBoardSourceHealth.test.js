import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildLeagueRows: vi.fn(),
  axios: vi.fn(),
  axiosGet: vi.fn(),
}));

vi.mock('../../src/services/dailySlateService.js', () => ({
  buildLeagueRows: mocks.buildLeagueRows,
  SLATE_SPORTS_LIST: [
    { key: 'basketball_nba', league: 'NBA' },
    { key: 'americanfootball_nfl', league: 'NFL' },
  ],
  getETDateStr: (date) => date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
}));

vi.mock('../../src/services/mlbStatsApiService.js', () => ({
  getMlbSchedule: vi.fn().mockResolvedValue([]),
  getMlbStandings: vi.fn().mockResolvedValue({ records: [] }),
  getMlbTeams: vi.fn().mockResolvedValue([]),
  getPitcherLastStarts: vi.fn().mockResolvedValue([]),
  getTeamVsHandSplits: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/services/baseballSavantService.js', () => ({
  getPitcherXStats: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/services/agentic/tools/statRouters/mlbFetchers.js', () => ({
  findParkData: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: {
    getMlbSeasonGameIndex: vi.fn().mockResolvedValue(new Map()),
    getTeams: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../src/services/agentic/orchestrator/orchestratorConfig.js', () => ({
  DESK_FALLBACK_MODELS: [],
  GEMINI_PROPS_MODEL: 'test-model',
}));

vi.mock('../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createGeminiSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

vi.mock('axios', () => ({
  default: Object.assign(mocks.axios, { get: mocks.axiosGet }),
}));

process.env.SUPABASE_URL ||= 'https://example.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-test-key';

const {
  TomorrowBoardSourceError,
  mergeFailedTomorrowLeagues,
  writeTomorrowBoard,
} = await import('../../src/services/tomorrowService.js');

const freshNba = {
  league: 'NBA',
  bdl_game_id: 10,
  away_team: 'Boston Celtics',
  home_team: 'New York Knicks',
  commence_time: '2099-10-05T23:00:00.000Z',
  spread: -2.5,
};

const priorNfl = {
  league: 'NFL',
  bdl_game_id: 20,
  away_team: 'Buffalo Bills',
  home_team: 'Miami Dolphins',
  commence_time: '2099-10-05T20:00:00.000Z',
  ml_home: -115,
  ml_book: 'fanduel',
  custom_last_good_field: 'keep me',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.axios.mockResolvedValue({ data: null });
  mocks.axiosGet.mockImplementation(async (url) => {
    if (url.includes('/tomorrow_board')) return { data: [{ board: [priorNfl] }] };
    return { data: [] };
  });
  mocks.buildLeagueRows.mockImplementation(async (sport) => {
    if (sport.league === 'NBA') return [freshNba];
    throw Object.assign(new Error('NFL primary unavailable'), {
      response: { status: 503 },
    });
  });
});

describe('tomorrow board source health', () => {
  it('merges only failed leagues from last-good data', () => {
    const merged = mergeFailedTomorrowLeagues(
      [freshNba],
      [{ league: 'NFL', error: 'down', transient_external: true }],
      [priorNfl, { ...priorNfl, league: 'MLB', bdl_game_id: 30 }],
    );
    expect(merged.map((row) => row.league)).toEqual(['NBA', 'NFL']);
    expect(merged[1]).toMatchObject({
      custom_last_good_field: 'keep me',
      line_vendor: 'fanduel',
    });
  });

  it('refreshes the healthy league, preserves failed NFL rows, and reports partial failure', async () => {
    let failure;
    try {
      await writeTomorrowBoard('2099-10-05');
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(TomorrowBoardSourceError);
    expect(failure.result.failures).toEqual([
      {
        league: 'NFL',
        error: 'NFL primary unavailable',
        kind: 'transient_external',
        transient_external: true,
      },
    ]);
    expect(failure.result).toMatchObject({
      source_health: 'degraded',
      preserved_leagues: ['NFL'],
    });
    expect(mocks.axios).toHaveBeenCalledOnce();
    const posted = mocks.axios.mock.calls[0][0].data;
    expect(posted.board).toEqual(expect.arrayContaining([
      expect.objectContaining({ league: 'NBA', bdl_game_id: 10 }),
      expect.objectContaining({
        league: 'NFL',
        bdl_game_id: 20,
        custom_last_good_field: 'keep me',
      }),
    ]));
    expect(posted.board.filter((row) => row.league === 'NFL')).toHaveLength(1);
  });

  it('refuses a destructive whole-date overwrite when last-good preservation cannot be read', async () => {
    mocks.axiosGet.mockRejectedValueOnce(new Error('Supabase read failed'));

    await expect(writeTomorrowBoard('2099-10-05'))
      .rejects.toThrow(/refusing overwrite/i);
    expect(mocks.axios).not.toHaveBeenCalled();
  });

  it('does not preserve or publish a failed league for an internal/schema failure', async () => {
    mocks.buildLeagueRows.mockImplementation(async (sport) => {
      if (sport.league === 'NBA') return [freshNba];
      throw new Error('NFL source returned malformed JSON');
    });

    let failure;
    try { await writeTomorrowBoard('2099-10-05'); } catch (error) { failure = error; }

    expect(failure).toBeInstanceOf(TomorrowBoardSourceError);
    expect(failure.result).toMatchObject({
      source_health: 'failed',
      preserved_leagues: [],
      failures: [{
        league: 'NFL',
        kind: 'internal',
        transient_external: false,
      }],
    });
    expect(mocks.axiosGet).not.toHaveBeenCalled();
    expect(mocks.axios).not.toHaveBeenCalled();
  });
});
