import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTeams,
  getMatches,
  clearFifaCache,
  getRegulationScore,
  getAdvanceResult,
  resolveTeam,
  filterMatchesByDate,
  selectConsensusOdds,
  getOdds,
  getMatchesForDate,
  getTeamMatchStats,
  formatMatchForPipeline,
} from '../../src/services/fifaWorldCupService.js';

function mockFetchOnce(jsonBody) {
  return vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => jsonBody });
}

beforeEach(() => clearFifaCache());
afterEach(() => vi.unstubAllGlobals());

// ─── Task 1: fifaFetch + pagination ───────────────────────────────────
describe('fifaFetch via getTeams (single page)', () => {
  it('calls the FIFA teams endpoint with seasons[] and returns data[]', async () => {
    const fetchMock = mockFetchOnce({ data: [{ id: 1, name: 'Argentina' }] });
    vi.stubGlobal('fetch', fetchMock);

    const teams = await getTeams([2026]);

    expect(teams).toEqual([{ id: 1, name: 'Argentina' }]);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/fifa/worldcup/v1/teams');
    expect(calledUrl).toContain('seasons[]=2026');
    expect(fetchMock.mock.calls[0][1]).toHaveProperty('headers.Authorization');
  });

  it('throws on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) }));
    await expect(getTeams([2026])).rejects.toThrow(/FIFA API 401/);
  });
});

describe('fifaFetch cursor pagination via getMatches', () => {
  it('follows meta.next_cursor and accumulates every page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: 1 }], meta: { next_cursor: 1 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: 2 }], meta: { next_cursor: null } }) });
    vi.stubGlobal('fetch', fetchMock);

    const matches = await getMatches({ seasons: [2026] });

    expect(matches).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('cursor=1');
  });
});

// ─── Task 2: getRegulationScore ───────────────────────────────────────
describe('getRegulationScore (90 minutes, excludes extra time)', () => {
  it('sums first + second half for a group game', () => {
    const m = { first_half_home_score: 2, second_half_home_score: 1, first_half_away_score: 0, second_half_away_score: 1, has_extra_time: false, home_score: 3, away_score: 1 };
    expect(getRegulationScore(m)).toEqual({ home: 3, away: 1 });
  });

  it('ignores extra time in knockouts (Croatia 1-1 Brazil: ET 1-1, reg 0-0)', () => {
    const m = { first_half_home_score: 0, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 0, extra_time_home_score: 1, extra_time_away_score: 1, has_extra_time: true, home_score: 1, away_score: 1 };
    expect(getRegulationScore(m)).toEqual({ home: 0, away: 0 });
  });

  it('falls back to home_score/away_score when halves are missing and no extra time', () => {
    const m = { first_half_home_score: null, second_half_home_score: null, first_half_away_score: null, second_half_away_score: null, has_extra_time: false, home_score: 2, away_score: 0 };
    expect(getRegulationScore(m)).toEqual({ home: 2, away: 0 });
  });

  it('returns nulls for missing match', () => {
    expect(getRegulationScore(null)).toEqual({ home: null, away: null });
  });
});

// ─── Task 3: getAdvanceResult ─────────────────────────────────────────
describe('getAdvanceResult (who advances in a knockout)', () => {
  const teams = { home_team: { id: 10 }, away_team: { id: 20 } };

  it('regulation winner advances', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 1, second_half_home_score: 1, first_half_away_score: 0, second_half_away_score: 0, has_extra_time: false, home_score: 2, away_score: 0 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 10, method: 'regulation' });
  });

  it('extra-time winner advances (reg 0-0, ET 2-1)', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 0, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 0, extra_time_home_score: 2, extra_time_away_score: 1, has_extra_time: true, home_score: 2, away_score: 1 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 10, method: 'extra_time' });
  });

  it('penalty winner advances (Croatia 1-1 Brazil, pens 4-2 → home)', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 0, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 0, extra_time_home_score: 1, extra_time_away_score: 1, has_extra_time: true, home_score: 1, away_score: 1, has_penalty_shootout: true, home_score_penalties: 4, away_score_penalties: 2 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 10, method: 'penalties' });
  });

  it('penalty winner advances (Japan 1-1 Croatia, pens 1-3 → away)', () => {
    const m = { ...teams, status: 'completed', first_half_home_score: 1, second_half_home_score: 0, first_half_away_score: 0, second_half_away_score: 1, extra_time_home_score: 0, extra_time_away_score: 0, has_extra_time: true, home_score: 1, away_score: 1, has_penalty_shootout: true, home_score_penalties: 1, away_score_penalties: 3 };
    expect(getAdvanceResult(m)).toEqual({ teamId: 20, method: 'penalties' });
  });

  it('returns null when not completed', () => {
    const m = { ...teams, status: 'scheduled' };
    expect(getAdvanceResult(m)).toBeNull();
  });

  it('returns null when teams are TBD', () => {
    const m = { status: 'completed', home_team: null, away_team: null, home_score: 1, away_score: 0 };
    expect(getAdvanceResult(m)).toBeNull();
  });
});

// ─── Task 4: resolveTeam + filterMatchesByDate ────────────────────────
describe('resolveTeam', () => {
  const teams = [
    { id: 1, name: 'Argentina', abbreviation: 'ARG', country_code: 'ARG' },
    { id: 8, name: 'Mexico', abbreviation: 'MEX', country_code: 'MEX' },
  ];
  it('matches by full name (case-insensitive)', () => {
    expect(resolveTeam('argentina', teams)).toEqual(teams[0]);
  });
  it('matches by abbreviation', () => {
    expect(resolveTeam('MEX', teams)).toEqual(teams[1]);
  });
  it('matches by partial name', () => {
    expect(resolveTeam('Mex', teams)).toEqual(teams[1]);
  });
  it('returns null for no match or bad input', () => {
    expect(resolveTeam('Brazil', teams)).toBeNull();
    expect(resolveTeam('', teams)).toBeNull();
    expect(resolveTeam('Argentina', null)).toBeNull();
  });
});

describe('filterMatchesByDate', () => {
  const matches = [
    { id: 1, datetime: '2026-06-11T19:00:00.000Z' },
    { id: 2, datetime: '2026-06-12T02:00:00.000Z' },
    { id: 3, datetime: '2026-06-12T19:00:00.000Z' },
  ];
  it('keeps only matches whose UTC date matches', () => {
    expect(filterMatchesByDate(matches, '2026-06-12').map(m => m.id)).toEqual([2, 3]);
  });
  it('returns [] for no matches or bad input', () => {
    expect(filterMatchesByDate(matches, '2026-07-01')).toEqual([]);
    expect(filterMatchesByDate(null, '2026-06-12')).toEqual([]);
  });
});

// ─── Task 5: selectConsensusOdds ──────────────────────────────────────
describe('selectConsensusOdds', () => {
  it('prefers the highest-priority available vendor (draftkings over fanduel)', () => {
    const rows = [
      { vendor: 'fanduel', moneyline_home_odds: 270, moneyline_draw_odds: 180, moneyline_away_odds: 130, spread_home_value: null, total_value: null },
      { vendor: 'draftkings', moneyline_home_odds: 260, moneyline_draw_odds: 175, moneyline_away_odds: 135, spread_home_value: null, total_value: null },
    ];
    const c = selectConsensusOdds(rows);
    expect(c.vendor).toBe('draftkings');
    expect(c.moneyline).toEqual({ home: 260, draw: 175, away: 135 });
    expect(c.spread).toBeNull();
    expect(c.total).toBeNull();
  });

  it('surfaces spread + total when present', () => {
    const rows = [{
      vendor: 'fanduel',
      moneyline_home_odds: -115, moneyline_draw_odds: 250, moneyline_away_odds: 320,
      spread_home_value: '-0.5', spread_home_odds: -110, spread_away_value: '+0.5', spread_away_odds: -110,
      total_value: '2.5', total_over_odds: -120, total_under_odds: 100,
    }];
    const c = selectConsensusOdds(rows);
    expect(c.spread).toEqual({ homeValue: '-0.5', homeOdds: -110, awayValue: '+0.5', awayOdds: -110 });
    expect(c.total).toEqual({ line: '2.5', over: -120, under: 100 });
  });

  it('falls back to the first row when no preferred vendor present', () => {
    const rows = [{ vendor: 'pinnacle', moneyline_home_odds: 100, moneyline_draw_odds: 200, moneyline_away_odds: 300, spread_home_value: null, total_value: null }];
    expect(selectConsensusOdds(rows).vendor).toBe('pinnacle');
  });

  it('returns null for empty input', () => {
    expect(selectConsensusOdds([])).toBeNull();
    expect(selectConsensusOdds(null)).toBeNull();
  });
});

// ─── Task 6: read wrappers + getMatchesForDate ────────────────────────
describe('getOdds (paginated)', () => {
  it('returns odds rows for the requested matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: 1, match_id: 11, vendor: 'fanduel', moneyline_home_odds: 270 }], meta: { next_cursor: null } }),
    }));
    const odds = await getOdds({ seasons: [2026], matchIds: [11] });
    expect(odds).toHaveLength(1);
    expect(odds[0].match_id).toBe(11);
    expect(fetch.mock.calls[0][0]).toContain('match_ids[]=11');
  });
});

describe('getMatchesForDate', () => {
  it('fetches matches then filters to the given UTC date', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ data: [
        { id: 1, datetime: '2026-06-11T19:00:00.000Z' },
        { id: 2, datetime: '2026-06-12T02:00:00.000Z' },
      ], meta: { next_cursor: null } }),
    }));
    const games = await getMatchesForDate('2026-06-11', [2026]);
    expect(games.map(g => g.id)).toEqual([1]);
  });
});

describe('getTeamMatchStats (match-scoped)', () => {
  it('requests team_match_stats with match_ids[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ data: [{ match_id: 1, team_id: 8, possession_pct: 60 }], meta: { next_cursor: null } }),
    }));
    const stats = await getTeamMatchStats([1]);
    expect(stats[0].possession_pct).toBe(60);
    expect(fetch.mock.calls[0][0]).toContain('/fifa/worldcup/v1/team_match_stats');
    expect(fetch.mock.calls[0][0]).toContain('match_ids[]=1');
  });
});

// ─── Task 7: formatMatchForPipeline ───────────────────────────────────
describe('formatMatchForPipeline', () => {
  const match = {
    id: 1, datetime: '2026-06-11T19:00:00.000Z', status: 'scheduled',
    stage: { name: 'Group Stage' }, group: { name: 'Group A' }, round_name: null,
    stadium: { name: 'Estadio Azteca' },
    home_team: { id: 1, name: 'Mexico', abbreviation: 'MEX' },
    away_team: { id: 2, name: 'South Africa', abbreviation: 'RSA' },
  };

  it('maps to the pipeline game shape with soccer fields embedded', () => {
    const consensus = { moneyline: { home: -115, draw: 250, away: 320 }, vendor: 'fanduel' };
    const g = formatMatchForPipeline(match, consensus);
    expect(g.id).toBe(1);
    expect(g.soccer_match_id).toBe(1);
    expect(g.home_team).toBe('Mexico');
    expect(g.away_team).toBe('South Africa');
    expect(g.home_team_data).toEqual({ id: 1, full_name: 'Mexico', abbreviation: 'MEX' });
    expect(g.commence_time).toBe('2026-06-11T19:00:00.000Z');
    expect(g.venue).toBe('Estadio Azteca');
    expect(g.soccer_competition).toBe('FIFA World Cup 2026');
    expect(g.soccer_stage).toBe('Group Stage');
    expect(g.soccer_group).toBe('Group A');
    expect(g.soccer_three_way_ml).toEqual({ home: -115, draw: 250, away: 320 });
  });

  it('handles TBD knockout teams (null home/away) without throwing', () => {
    const tbd = { ...match, home_team: null, away_team: null, group: null, stage: { name: 'Round of 32' }, round_name: 'Round of 32' };
    const g = formatMatchForPipeline(tbd, null);
    expect(g.home_team).toBeNull();
    expect(g.home_team_data).toBeNull();
    expect(g.soccer_three_way_ml).toBeNull();
    expect(g.soccer_round).toBe('Round of 32');
  });
});
