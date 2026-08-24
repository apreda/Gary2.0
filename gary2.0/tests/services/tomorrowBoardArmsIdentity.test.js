import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createModelSession: vi.fn(),
  sendToSessionWithRetry: vi.fn(),
}));

vi.mock('../../src/services/dailySlateService.js', () => ({
  buildLeagueRows: vi.fn(),
  SLATE_SPORTS_LIST: [],
  getETDateStr: (date) => date.toISOString().slice(0, 10),
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
  ballDontLieService: {},
}));

vi.mock('../../src/services/agentic/orchestrator/orchestratorConfig.js', () => ({
  DESK_FALLBACK_MODELS: [],
  PROPS_DESK_MODEL: 'test-model',
}));

vi.mock('../../src/services/agentic/orchestrator/sessionManager.js', () => ({
  createModelSession: mocks.createModelSession,
  sendToSessionWithRetry: mocks.sendToSessionWithRetry,
}));

process.env.SUPABASE_URL ||= 'https://example.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-test-key';

const {
  attachArmsTakes,
  buildBigGames,
  marqueeGameKeys,
  toBoardRow,
} = await import('../../src/services/tomorrowService.js');

const gameOneTime = '2026-08-17T17:40:00.000Z';
const gameTwoTime = '2026-08-17T22:40:00.000Z';

function boardRow(id, commenceTime) {
  return {
    league: 'MLB',
    away_team: 'St. Louis Cardinals',
    home_team: 'Cincinnati Reds',
    away_abbr: 'STL',
    home_abbr: 'CIN',
    bdl_game_id: id,
    commence_time: commenceTime,
  };
}

function starter(fullName, team, gameTime, era) {
  return {
    league: 'MLB',
    full_name: fullName,
    name: fullName,
    team,
    abbr: team,
    game: 'STL @ CIN',
    game_time: gameTime,
    era,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createModelSession.mockResolvedValue({});
});

describe('tomorrow board doubleheader identity', () => {
  it('does not leak a Game 2-only probable or partial Arms take into Game 1', async () => {
    const board = [boardRow(101, gameOneTime), boardRow(102, gameTwoTime)];
    const starters = [starter('Rhett Lowder', 'CIN', gameTwoTime, 5.15)];

    await attachArmsTakes(board, starters);

    expect(board[0].arms_take).toBeUndefined();
    expect(board[1].arms_take).toContain('Rhett Lowder');
    expect(board[1].arms_take).toContain('Cardinals have not announced their starter');
    expect(mocks.createModelSession).not.toHaveBeenCalled();
    expect(mocks.sendToSessionWithRetry).not.toHaveBeenCalled();
  });

  it('binds two fully announced games and reversed model results by exact game key', async () => {
    const board = [boardRow(null, gameOneTime), boardRow(102, gameTwoTime)];
    const starters = [
      starter('First Away', 'STL', gameOneTime, 3.11),
      starter('First Home', 'CIN', gameOneTime, 3.22),
      starter('Second Away', 'STL', gameTwoTime, 4.11),
      starter('Second Home', 'CIN', gameTwoTime, 4.22),
    ];
    const gameOneTake = 'First Away and First Home belong only to the opening game. This is the distinct Game 1 read.';
    const gameTwoTake = 'Second Away and Second Home belong only to the nightcap. This is the distinct Game 2 read.';
    const gameOneKey = `matchup:mlb|stl|cin|time:${gameOneTime}`;
    let prompt = '';
    mocks.sendToSessionWithRetry.mockImplementation(async (_session, message) => {
      prompt = message;
      return {
        content: `\`\`\`json\n${JSON.stringify([
          { game_key: 'bdl:102', matchup: 'STL @ CIN', take: gameTwoTake },
          { game_key: gameOneKey, matchup: 'STL @ CIN', take: gameOneTake },
        ])}\n\`\`\``,
      };
    });

    await attachArmsTakes(board, starters);

    expect(prompt).toContain(`## GAME KEY: ${gameOneKey}\nMATCHUP: STL @ CIN\nFirst Away (STL): 3.11 ERA\nFirst Home (CIN): 3.22 ERA`);
    expect(prompt).toContain('## GAME KEY: bdl:102\nMATCHUP: STL @ CIN\nSecond Away (STL): 4.11 ERA\nSecond Home (CIN): 4.22 ERA');
    expect(board[0].arms_take).toBe(gameOneTake);
    expect(board[1].arms_take).toBe(gameTwoTake);
    expect(mocks.sendToSessionWithRetry).toHaveBeenCalledOnce();
  });

  it('preserves singleton starter behavior for a non-doubleheader game', async () => {
    const board = [boardRow(101, gameOneTime)];
    const starters = [starter('Known Home', 'CIN', null, 3.45)];

    await attachArmsTakes(board, starters);

    expect(board[0].arms_take).toContain('Known Home');
    expect(board[0].arms_take).toContain('Cardinals have not announced their starter');
  });

  it('does not leak a lone Game 2 probable into Game 1 big-game metadata', () => {
    const board = [boardRow(101, gameOneTime), boardRow(102, gameTwoTime)];
    const mlb = {
      teamIndex: {
        abbrByName: new Map([
          ['st louis cardinals', 'STL'],
          ['cincinnati reds', 'CIN'],
        ]),
        byId: new Map(),
      },
      idByName: new Map(),
      standings: new Map(),
      acesByGame: new Map([
        ['STL|CIN', [{ t: Date.parse(gameTwoTime), label: 'Lowder', both: false }]],
      ]),
      pitchersByGame: new Map([
        ['STL|CIN', [{ t: Date.parse(gameTwoTime), away: 'Undecided', home: 'Lowder' }]],
      ]),
    };

    const bigGames = buildBigGames(board, { mlb });
    const gameOne = bigGames.find((game) => game.bdl_game_id === 101);
    const gameTwo = bigGames.find((game) => game.bdl_game_id === 102);

    expect(gameOne).toMatchObject({
      awayPitcher: 'Undecided',
      homePitcher: 'Undecided',
      context: null,
    });
    expect(gameTwo).toMatchObject({
      awayPitcher: 'Undecided',
      homePitcher: 'Lowder',
      context: 'Lowder',
    });
  });

  it('marks only the selected doubleheader game as marquee', () => {
    const first = {
      ...boardRow(101, gameOneTime),
      game_status: 'delayed',
      status_detail: 'RAIN DELAY',
    };
    const second = boardRow(102, gameTwoTime);
    const teamIndex = {
      abbrByName: new Map([
        ['st louis cardinals', 'STL'],
        ['cincinnati reds', 'CIN'],
      ]),
    };
    const keys = marqueeGameKeys([{
      league: 'MLB',
      matchup: 'St. Louis Cardinals @ Cincinnati Reds',
      bdl_game_id: 102,
      commence_time: gameTwoTime,
    }]);

    expect(toBoardRow(first, keys, teamIndex)).toMatchObject({
      is_marquee: false,
      game_status: 'delayed',
      status_detail: 'RAIN DELAY',
    });
    expect(toBoardRow(second, keys, teamIndex).is_marquee).toBe(true);
  });
});
