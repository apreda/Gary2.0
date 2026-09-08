import { afterEach, describe, it, expect, vi } from 'vitest';
import { boardLeagues, buildBoard, fetchDailySlate, type SlateRow } from '@/lib/gary/board';
import type { GaryPick } from '@/lib/gary/types';

const slateRow = (over: Partial<SlateRow> = {}): SlateRow => ({
  league: 'MLB',
  away_team: 'Mariners',
  home_team: 'Rangers',
  commence_time: '2026-07-27 18:35:00+00',
  venue: null,
  spread: '1.5',
  ml_home: '112',
  ml_away: '-132',
  total: '8',
  ...over,
});

describe('buildBoard', () => {
  const early = '2026-09-08T17:05:00Z';
  const late = '2026-09-08T23:05:00Z';
  const doubleheader = () => [
    slateRow({ commence_time: early, bdl_game_id: 111 }),
    slateRow({ commence_time: late, bdl_game_id: 222 }),
  ];
  const ticket = (overrides: Partial<GaryPick> = {}): GaryPick => ({
    awayTeam: 'Mariners', homeTeam: 'Rangers', league: 'MLB', pick: 'Rangers ML -110',
    ...overrides,
  });

  it('attaches the only nightcap pick to game 2 by its clock when no provider ID exists', () => {
    const pick = ticket({ commence_time: late });
    const board = buildBoard(doubleheader(), [pick]);
    expect(board).toHaveLength(2);
    expect(board[0].pick).toBeNull();
    expect(board[1].pick).toBe(pick);
    expect(board[1].commence).toBe(late);
  });

  it('resolves reverse-published doubleheader tickets using exact provider IDs', () => {
    const first = ticket({ bdl_game_id: '111', commence_time: early });
    const second = ticket({ bdl_game_id: 222, commence_time: late });
    expect(buildBoard(doubleheader(), [second, first]).map(row => row.pick)).toEqual([first, second]);
  });

  it('uses an authoritative BDL match after a schedule-time change', () => {
    const pick = ticket({ bdl_game_id: 222, commence_time: early });
    const board = buildBoard(doubleheader(), [pick]);
    expect(board[0].pick).toBeNull();
    expect(board[1].pick).toBe(pick);
    expect(board[1].commence).toBe(late);
  });

  it('normalizes PostgreSQL and ISO clocks without equating unrelated vendor IDs', () => {
    const pick = ticket({ game_id: 'odds-vendor-111', commence_time: late });
    const board = buildBoard([
      slateRow({ bdl_game_id: 111, commence_time: '2026-09-08 23:05:00+00' }),
    ], [pick]);
    expect(board).toHaveLength(1);
    expect(board[0].pick).toBe(pick);
  });

  it('does not let a matching clock override a conflicting BDL game ID', () => {
    const pick = ticket({ bdl_game_id: 333, commence_time: late });
    const board = buildBoard(doubleheader(), [pick]);
    expect(board).toHaveLength(3);
    expect(board.slice(0, 2).filter(row => row.pick)).toHaveLength(0);
    expect(board[2].pick).toBe(pick);
  });

  it('preserves an ambiguous legacy ticket separately instead of inventing its lock time', () => {
    const pick = ticket();
    const board = buildBoard(doubleheader(), [pick]);
    expect(board).toHaveLength(3);
    expect(board.slice(0, 2).every(row => row.pick === null)).toBe(true);
    expect(board[2]).toMatchObject({ commence: null, pick });
  });

  it('does not merge same-team rows with contradictory confirmed clocks', () => {
    const pick = ticket({ commence_time: late });
    const board = buildBoard([slateRow({ commence_time: early })], [pick]);
    expect(board).toHaveLength(2);
    expect(board[0].pick).toBeNull();
    expect(board[1].pick).toBe(pick);
  });

  it('reserves exact matches before a legacy name-only ticket can claim the row', () => {
    const legacy = ticket();
    const exact = ticket({ bdl_game_id: 111, commence_time: early });
    const board = buildBoard([doubleheader()[0]], [legacy, exact]);
    expect(board[0].pick).toBe(exact);
    expect(board[1].pick).toBe(legacy);
  });

  it('keeps unique disclosure keys for unmatched same-team tickets without pick IDs', () => {
    const board = buildBoard([], [ticket({ commence_time: early }), ticket({ commence_time: late })]);
    expect(new Set(board.map(row => row.key)).size).toBe(2);
  });

  it('renders every slate game, posted or not', () => {
    const board = buildBoard([slateRow(), slateRow({ away_team: 'Phillies', home_team: 'Marlins' })], []);
    expect(board).toHaveLength(2);
    expect(board.every(g => g.pick === null)).toBe(true);
  });

  it('attaches a pick to its game', () => {
    const pick: GaryPick = { awayTeam: 'Mariners', homeTeam: 'Rangers', pick: 'Seattle Mariners ML -131' };
    const board = buildBoard([slateRow()], [pick]);
    expect(board[0].pick?.pick).toBe('Seattle Mariners ML -131');
  });

  it('matches a full club name against the slate mascot', () => {
    const pick: GaryPick = { awayTeam: 'Seattle Mariners', homeTeam: 'Texas Rangers', pick: 'Mariners ML' };
    expect(buildBoard([slateRow()], [pick])[0].pick).not.toBeNull();
  });

  it('never lets one Sox answer for the other', () => {
    const slate = [
      slateRow({ away_team: 'Red Sox', home_team: 'Yankees' }),
      slateRow({ away_team: 'White Sox', home_team: 'Guardians' }),
    ];
    const pick: GaryPick = { awayTeam: 'White Sox', homeTeam: 'Guardians', pick: 'White Sox ML' };
    const board = buildBoard(slate, [pick]);
    expect(board.find(g => g.away === 'Red Sox')?.pick).toBeNull();
    expect(board.find(g => g.away === 'White Sox')?.pick?.pick).toBe('White Sox ML');
  });

  it('spends each pick once', () => {
    const slate = [slateRow(), slateRow()];
    const pick: GaryPick = { awayTeam: 'Mariners', homeTeam: 'Rangers', pick: 'Mariners ML' };
    const board = buildBoard(slate, [pick]);
    expect(board.filter(g => g.pick).length).toBe(1);
  });

  it('keeps matching club nicknames in different leagues on their own games', () => {
    const mlb: GaryPick = {
      league: 'baseball_mlb', awayTeam: 'Cardinals', homeTeam: 'Giants', pick: 'Cardinals ML -110',
    };
    const nfl: GaryPick = {
      sport: 'americanfootball_nfl', awayTeam: 'Cardinals', homeTeam: 'Giants', pick: 'Cardinals +3.5 -110',
    };
    const board = buildBoard([
      slateRow({ league: 'MLB', away_team: 'Cardinals', home_team: 'Giants' }),
      slateRow({ league: 'NFL', away_team: 'Cardinals', home_team: 'Giants' }),
    ], [nfl, mlb]);

    expect(board).toHaveLength(2);
    expect(board.find(game => game.league === 'MLB')?.pick).toBe(mlb);
    expect(board.find(game => game.league === 'NFL')?.pick).toBe(nfl);
  });

  it('retains a pick separately when only another league has the same matchup on the slate', () => {
    const nfl: GaryPick = {
      league: 'NFL', awayTeam: 'Cardinals', homeTeam: 'Giants', pick: 'Cardinals +3.5 -110',
    };
    const board = buildBoard([
      slateRow({ league: 'MLB', away_team: 'Cardinals', home_team: 'Giants' }),
    ], [nfl]);

    expect(board).toHaveLength(2);
    expect(board.find(game => game.league === 'MLB')?.pick).toBeNull();
    expect(board.find(game => game.league === 'NFL')?.pick).toBe(nfl);
  });

  it('keeps a posted pick that has no slate row', () => {
    const pick: GaryPick = {
      awayTeam: 'Bills',
      homeTeam: 'Jets',
      league: 'NFL',
      pick: 'Bills -3',
      commence_time: '2026-09-13T17:00:00.000Z',
    };
    const board = buildBoard([slateRow()], [pick]);
    expect(board).toHaveLength(2);
    expect(board.find(g => g.away === 'Bills')?.pick).not.toBeNull();
  });

  it('ignores prop rows', () => {
    const prop: GaryPick = { awayTeam: 'Mariners', homeTeam: 'Rangers', type: 'prop', pick: 'Canzone over' };
    expect(buildBoard([slateRow()], [prop])[0].pick).toBeNull();
  });

  it('orders by first pitch', () => {
    const board = buildBoard(
      [
        slateRow({ away_team: 'Late', commence_time: '2026-07-27 23:10:00+00' }),
        slateRow({ away_team: 'Early', commence_time: '2026-07-27 18:35:00+00' }),
      ],
      [],
    );
    expect(board.map(g => g.away)).toEqual(['Early', 'Late']);
  });
});

describe('fetchDailySlate identity', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('requests the existing provider identity column for the board join', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      expect(input).toContain('daily_slate?');
      return Response.json([]);
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchDailySlate('2026-09-08');
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('select')?.split(',')).toContain('bdl_game_id');
  });
});

describe('boardLeagues', () => {
  it('lists each league once, in board order', () => {
    const board = buildBoard(
      [
        slateRow({ league: 'MLB' }),
        slateRow({ league: 'WNBA', away_team: 'Aces', home_team: 'Liberty', commence_time: '2026-07-27 23:00:00+00' }),
        slateRow({ league: 'MLB', away_team: 'Cubs', home_team: 'Cards', commence_time: '2026-07-27 23:30:00+00' }),
      ],
      [],
    );
    expect(boardLeagues(board)).toEqual(['MLB', 'WNBA']);
  });
});
