import { beforeEach, describe, expect, it, vi } from 'vitest';

const bdl = vi.hoisted(() => ({
  getGames: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: bdl,
}));

const {
  computeNcaafNextSlate,
  NCAAF_NEXT_SLATE_WINDOW_DAYS,
} = await import('../../../src/services/insights/computers/ncaafNextSlate.js');
const { generateInsightConnections } = await import('../../../src/services/insights/generateInsightConnections.js');

function team(id, conference) {
  return { id, conference, abbreviation: `T${id}` };
}

function game(id, date, awayId, homeId) {
  return {
    id,
    date,
    visitor_team: { id: awayId, abbreviation: `T${awayId}` },
    home_team: { id: homeId, abbreviation: `T${homeId}` },
  };
}

const teams = [
  team(1, 1), team(2, 3), team(3, 10), team(4, 4),
  team(5, 20),
];

beforeEach(() => {
  vi.clearAllMocks();
  bdl.getGames.mockResolvedValue([]);
  bdl.getTeams.mockResolvedValue(teams);
});

describe('NCAAF next-slate computer', () => {
  it('uses one batched provider request, verifies FBS identity, and keeps kickoff precision', async () => {
    bdl.getGames.mockResolvedValue([
      game(100, '2026-08-29T16:00:00Z', 1, 2),
      game(101, '2026-08-29', 3, 4),
      game(102, '2026-08-30T01:30:00Z', 1, 4), // Aug 29, 9:30 PM ET
      game(100, '2026-08-29T16:00:00Z', 1, 2), // provider duplicate
      game(103, '2026-08-29T20:00:00Z', 1, 5), // verified FCS opponent
      game(104, '2026-09-05T16:00:00Z', 1, 2), // later verified slate
      game(105, '2026-09-05T20:00:00Z', 1, 99), // unresolved later slate
    ]);

    const rows = await computeNcaafNextSlate({
      date: '2026-08-15',
      league: 'ncaaf',
      games: [],
      bdl,
    });

    expect(bdl.getGames).toHaveBeenCalledTimes(1);
    const [sport, params] = bdl.getGames.mock.calls[0];
    expect(sport).toBe('americanfootball_ncaaf');
    expect(params.per_page).toBe(100);
    expect(params.dates).toHaveLength(NCAAF_NEXT_SLATE_WINDOW_DAYS + 1);
    expect(params.dates[0]).toBe('2026-08-16');
    expect(params.dates.at(-1)).toBe('2026-09-06');
    expect(bdl.getTeams).toHaveBeenCalledWith('americanfootball_ncaaf');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'next_slate',
      game: 'NCAAF',
      value: '3 GAMES',
      meta: {
        kind: 'next_slate',
        source: 'balldontlie_games+teams',
        scheduled_date: '2026-08-29',
        game_count: 3,
        confirmed_count: 2,
        time_tbd_count: 1,
        first_confirmed_kickoff: '2026-08-29T16:00:00.000Z',
        team_policy: 'verified_fbs_vs_fbs',
        grade: 'context',
      },
    });
    expect(rows[0].detail).toContain('1 remains TIME TBD');
  });

  it('skips an earlier verified FCS-only date before choosing the first FBS slate', async () => {
    bdl.getGames.mockResolvedValue([
      game(110, '2026-08-28T20:00:00Z', 1, 5),
      game(111, '2026-08-29T16:00:00Z', 1, 2),
    ]);

    const [row] = await computeNcaafNextSlate({
      date: '2026-08-15', league: 'ncaaf', games: [], bdl,
    });

    expect(row.meta).toMatchObject({ scheduled_date: '2026-08-29', game_count: 1 });
  });

  it('groups a confirmed post-midnight kickoff with the prior college slate', async () => {
    bdl.getGames.mockResolvedValue([
      game(120, '2026-08-30T05:30:00Z', 1, 2),
      game(121, '2026-08-30T10:00:00Z', 3, 4),
    ]);

    const [row] = await computeNcaafNextSlate({
      date: '2026-08-15', league: 'ncaaf', games: [], bdl,
    });
    expect(row.meta).toMatchObject({
      scheduled_date: '2026-08-29',
      game_count: 1,
      first_confirmed_kickoff: '2026-08-30T05:30:00.000Z',
    });
  });

  it('does not invent a kickoff when the entire next slate is date-only', async () => {
    bdl.getGames.mockResolvedValue([
      game(200, '2026-08-29', 1, 2),
      game(201, '2026-08-29', 3, 4),
    ]);

    const [row] = await computeNcaafNextSlate({
      date: '2026-08-15', league: 'NCAAF', games: [], bdl,
    });

    expect(row.meta).toMatchObject({
      scheduled_date: '2026-08-29',
      game_count: 2,
      confirmed_count: 0,
      time_tbd_count: 2,
    });
    expect(row.meta).not.toHaveProperty('first_confirmed_kickoff');
    expect(row.detail).toContain('all times remain TBD');
  });

  it('returns an honest empty result without spending a team-directory request', async () => {
    await expect(computeNcaafNextSlate({
      date: '2026-08-15', league: 'ncaaf', games: [], bdl,
    })).resolves.toEqual([]);
    expect(bdl.getTeams).not.toHaveBeenCalled();
  });

  it('fails closed on incomplete team identity or malformed kickoff truth', async () => {
    bdl.getGames.mockResolvedValue([game(300, '2026-08-29', 1, 99)]);
    await expect(computeNcaafNextSlate({
      date: '2026-08-15', league: 'ncaaf', games: [], bdl,
    })).rejects.toThrow(/provider-grounded FBS identity/);

    bdl.getGames.mockResolvedValue([game(301, 'TBD', 1, 2)]);
    await expect(computeNcaafNextSlate({
      date: '2026-08-15', league: 'ncaaf', games: [], bdl,
    })).rejects.toThrow(/no provider-grounded scheduled date/);
  });
});

describe('NCAAF dark-day insight integration', () => {
  it('returns the next-slate connection after the current slate is honestly empty', async () => {
    bdl.getGames
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([game(400, '2026-08-29', 1, 2)]);

    const result = await generateInsightConnections({ date: '2026-08-15', league: 'NCAAF' });

    expect(result).toMatchObject({
      date: '2026-08-15',
      league: 'ncaaf',
      season: 2026,
      gameCount: 0,
      failures: [],
    });
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).toMatchObject({
      category: 'next_slate',
      meta: { scheduled_date: '2026-08-29', time_tbd_count: 1 },
    });
    expect(bdl.getGames).toHaveBeenCalledTimes(2);
  });

  it('propagates discovery provider failures instead of returning a false-green empty run', async () => {
    bdl.getGames
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('BDL unavailable'));

    await expect(generateInsightConnections({ date: '2026-08-15', league: 'NCAAF' }))
      .rejects.toThrow(/Failed to discover next NCAAF slate: BDL unavailable/);
  });
});
