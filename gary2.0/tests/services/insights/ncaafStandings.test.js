import { beforeEach, describe, expect, it, vi } from 'vitest';

// THE COLLEGE STANDINGS LANE — the NFL page's streak / site-split / division
// rows, for college, off BDL's per-conference standings table (NCAAF Picks
// page parity, founder Sep 3-4 2026). NCAAF-owned: it never reads an NFL feed.

vi.mock('../../../src/services/insights/solText.js', () => ({
  generateSolText: vi.fn(async () => JSON.stringify({ reads: [] })),
}));

const { computeNcaafStandings } = await import('../../../src/services/insights/computers/ncaafStandings.js');

const stanford = { id: 13, conference: 1, college: 'Stanford', name: 'Cardinal', full_name: 'Stanford Cardinal', abbreviation: 'STAN' };
const miami = { id: 8, conference: 1, college: 'Miami', name: 'Hurricanes', full_name: 'Miami Hurricanes', abbreviation: 'MIA' };
const iowa = { id: 60, conference: 5, college: 'Iowa', name: 'Hawkeyes', full_name: 'Iowa Hawkeyes', abbreviation: 'IOWA' };

const acc = { id: 1, name: 'ACC', abbreviation: 'ACC' };
const bigTen = { id: 5, name: 'Big Ten', abbreviation: 'B1G' };

function slateGame(overrides = {}) {
  return {
    id: 457163,
    date: '2026-10-10T23:30:00.000Z',
    season: 2026,
    week: 7,
    status: 'pre',
    home_team: stanford,
    visitor_team: miami,
    ...overrides,
  };
}

function standingsRow(team, conference, values) {
  return { team, conference, season: 2026, conference_record: '0-0', home_record: '0-0', away_record: '0-0', ...values };
}

function finalGame(id, date, team, opponent, scored, allowed, { home = true } = {}) {
  const [homeTeam, awayTeam] = home ? [team, opponent] : [opponent, team];
  const [homeScore, awayScore] = home ? [scored, allowed] : [allowed, scored];
  return {
    id, date, season: 2026, status: 'post', status_state: 'final',
    home_team: homeTeam, visitor_team: awayTeam,
    home_score: homeScore, away_score: awayScore,
  };
}

let bdl;
let ctx;

beforeEach(() => {
  bdl = {
    getNcaafStandings: vi.fn(async () => []),
    getGames: vi.fn(async () => []),
    getNflStandings: vi.fn(async () => []),
  };
  ctx = {
    date: '2026-10-10',
    season: 2026,
    league: 'ncaaf',
    games: [slateGame()],
    bdl,
    helpers: { gameLabel: (g) => `${g.visitor_team.abbreviation} @ ${g.home_team.abbreviation}` },
  };
});

describe('computeNcaafStandings', () => {
  it('is a no-op for any league but NCAAF and never reads the NFL standings feed', async () => {
    expect(await computeNcaafStandings({ ...ctx, league: 'nfl' })).toEqual([]);
    expect(bdl.getNcaafStandings).not.toHaveBeenCalled();
    expect(bdl.getNflStandings).not.toHaveBeenCalled();
  });

  it('reads each slate conference once and writes the site split from home vs road records', async () => {
    bdl.getNcaafStandings.mockResolvedValue([
      standingsRow(stanford, acc, { wins: 4, losses: 1, home_record: '3-0', away_record: '1-1', conference_record: '2-0' }),
      standingsRow(miami, acc, { wins: 3, losses: 2, home_record: '2-1', away_record: '1-2', conference_record: '1-1' }),
    ]);

    const rows = await computeNcaafStandings(ctx);

    expect(bdl.getNcaafStandings).toHaveBeenCalledTimes(1);
    expect(bdl.getNcaafStandings).toHaveBeenCalledWith(2026, 1);
    const site = rows.find((r) => r.meta?.metric === 'site_record');
    expect(site.category).toBe('team_record');
    expect(site.headline).toBe('STAN is 3-0 at home; MIA is 1-2 on the road');
    expect(site.value).toBe('3-0');
    expect(site.team_id).toBe(13);
    expect(site.game_id).toBe(457163);
    expect(site.game).toBe('MIA @ STAN');
    expect(site.meta.source).toBe('balldontlie_ncaaf_standings');
    expect(site.meta.league).toBe('NCAAF');
    expect(site.meta.home).toMatchObject({ team_id: 13, abbreviation: 'STAN', home_record: '3-0' });
    expect(site.meta.away).toMatchObject({ team_id: 8, abbreviation: 'MIA', road_record: '1-2' });
    expect(bdl.getNflStandings).not.toHaveBeenCalled();
  });

  it('stays silent on a site split until both sides have three games at that site', async () => {
    bdl.getNcaafStandings.mockResolvedValue([
      standingsRow(stanford, acc, { wins: 2, losses: 0, home_record: '2-0', away_record: '0-0' }),
      standingsRow(miami, acc, { wins: 1, losses: 1, home_record: '1-0', away_record: '0-1' }),
    ]);
    const rows = await computeNcaafStandings(ctx);
    expect(rows.filter((r) => r.meta?.metric === 'site_record')).toEqual([]);
  });

  it('marks a conference game with both conference records, naming no side as the edge', async () => {
    bdl.getNcaafStandings.mockResolvedValue([
      standingsRow(stanford, acc, { wins: 4, losses: 1, conference_record: '2-0' }),
      standingsRow(miami, acc, { wins: 3, losses: 2, conference_record: '1-1' }),
    ]);

    const rows = await computeNcaafStandings(ctx);
    const conf = rows.find((r) => r.meta?.metric === 'conference_record');

    expect(conf.category).toBe('team_record');
    expect(conf.headline).toBe('ACC game: MIA 1-1, STAN 2-0 in conference');
    expect(conf.value).toBe('CONFERENCE');
    expect(conf.team_id).toBeUndefined();
    expect(conf.meta.conference).toBe('ACC');
  });

  it('does not call a cross-conference game a conference game', async () => {
    ctx.games = [slateGame({ visitor_team: iowa })];
    bdl.getNcaafStandings.mockImplementation(async (season, conferenceId) => (
      conferenceId === 1
        ? [standingsRow(stanford, acc, { wins: 4, losses: 1, conference_record: '2-0' })]
        : [standingsRow(iowa, bigTen, { wins: 5, losses: 0, conference_record: '3-0' })]
    ));

    const rows = await computeNcaafStandings(ctx);

    expect(bdl.getNcaafStandings).toHaveBeenCalledTimes(2);
    expect(rows.filter((r) => r.meta?.metric === 'conference_record')).toEqual([]);
  });

  it('never reads the game index — a streak would cost a fetch per team under the shared gate', async () => {
    bdl.getNcaafStandings.mockResolvedValue([
      standingsRow(stanford, acc, { wins: 4, losses: 1, home_record: '3-0', away_record: '1-1', conference_record: '2-0' }),
      standingsRow(miami, acc, { wins: 3, losses: 2, home_record: '2-1', away_record: '1-2', conference_record: '1-1' }),
    ]);
    const rows = await computeNcaafStandings(ctx);
    expect(bdl.getGames).not.toHaveBeenCalled();
    expect(rows.filter((r) => r.category === 'streak')).toEqual([]);
  });

  it('drops a side missing from its conference table instead of guessing a record', async () => {
    bdl.getNcaafStandings.mockResolvedValue([
      standingsRow(stanford, acc, { wins: 4, losses: 1, home_record: '3-0', away_record: '1-1', conference_record: '2-0' }),
    ]);
    const rows = await computeNcaafStandings(ctx);
    expect(rows.filter((r) => r.category === 'team_record')).toEqual([]);
  });

  it('treats a standings fetch failure as no rows, never a table', async () => {
    bdl.getNcaafStandings.mockRejectedValue(new Error('503'));
    expect(await computeNcaafStandings(ctx)).toEqual([]);
  });
});
