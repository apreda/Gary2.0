import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), teams: vi.fn(), market: vi.fn(), model: vi.fn() }));
vi.mock('../../../src/services/mlbStatsApiService.js', () => ({
  default: { getMlbSchedule: mocks.schedule, getMlbTeams: mocks.teams },
}));
vi.mock('../../../src/services/ballDontLieService.js', () => ({
  ballDontLieService: { getMlbFirstInningRunsMarket: mocks.market },
}));
vi.mock('../../../src/services/insights/solText.js', () => ({ generateSolText: mocks.model }));
const { computeFirstInning } = await import('../../../src/services/insights/computers/firstInning.js');

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ dates: [] }) }));
  mocks.teams.mockResolvedValue([{ id: 101, name: 'Fixture Club' }, { id: 102, name: 'Other Club' }]);
  mocks.market.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllGlobals());
const ctx = { date: '2026-09-08', games: [{ id: 900, status: 'STATUS_SCHEDULED',
  home_team: { id: 1, name: 'Fixture Club', abbreviation: 'FIX' },
  visitor_team: { id: 2, name: 'Other Club', abbreviation: 'OTH' } }], helpers: { gameLabel: () => 'OTH @ FIX' } };
const schedule = missing => mocks.schedule.mockImplementation(async date => {
  const day = Number(date.slice(-2));
  if (date.slice(0, 7) !== '2026-09' || day > 7) return [];
  return Array.from({ length: day <= 3 ? 2 : 1 }, (_, i) => ({ gamePk: 1000 + day * 2 + i, officialDate: date,
    status: { detailedState: 'Final' }, teams: { home: { team: { id: 101 } }, away: { team: { id: 102 } } },
    linescore: { innings: [{ home: { runs: missing ? null : 0 }, away: { runs: (day + i) % 2 } }] } }));
});
const probableGame = (gamePk, homeId = 201, awayId = 202) => ({ gamePk, officialDate: ctx.date,
  teams: { home: { team: { id: 101 }, ...(homeId == null ? {} : { probablePitcher: { id: homeId, fullName: `Pitcher ${homeId}` } }) },
    away: { team: { id: 102 }, ...(awayId == null ? {} : { probablePitcher: { id: awayId, fullName: `Pitcher ${awayId}` } }) } } });
const probables = games => {
  const request = vi.fn(async url => ({ ok: true, json: async () => String(url).includes('/schedule?')
    ? { dates: [{ games }] } : { stats: [{ splits: [{ stat: { inningsPitched: '16.0', era: '0.00', avg: '.167', homeRuns: 0 } }] }] } }));
  vi.stubGlobal('fetch', request);
  return request;
};

describe('first-inning source copy', () => {
  it('emits deterministic observed counts without a model opinion', async () => {
    schedule(false);
    const rows = await computeFirstInning(ctx);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.meta.side).toBe('TEAM_QUIET');
    expect(row.meta.team_n).toBe(10);
    expect(row.meta.team_seq.reduce((sum, value) => sum + value, 0)).toBe(row.meta.team_scored);
    expect(row.detail).toBe('FIX scored in the first inning in 0 of the 10 sampled games.');
    expect(row.meta).toMatchObject({ research_facts_version: 'observed-stats-v1', computed_detail: row.detail,
      evidence: row.detail, read: row.detail });
    expect(mocks.model).not.toHaveBeenCalled();
  });
  it('does not turn null first-inning scores into a quiet-inning streak', async () => {
    schedule(true);
    expect(await computeFirstInning(ctx)).toEqual([]);
    expect(mocks.market).not.toHaveBeenCalled();
  });
  it('attaches named historical samples only to the unique exact-date opposing-team match', async () => {
    schedule(false);
    const request = probables([probableGame(700)]);
    const [row] = await computeFirstInning(ctx);
    expect(row.meta.sp_first_inning).toMatchObject([
      { name: 'Pitcher 201', mlbam_player_id: 201, side: 'home', mlbam_game_id: 700, game_date: ctx.date },
      { name: 'Pitcher 202', mlbam_player_id: 202, side: 'away', mlbam_game_id: 700, game_date: ctx.date },
    ]);
    expect(request.mock.calls.filter(([url]) => url.includes('/people/'))).toHaveLength(2);
  });
  it.each([
    { reverse: false, missing: false }, { reverse: true, missing: false },
    { reverse: false, missing: true }, { reverse: true, missing: true },
  ])('does not borrow either doubleheader game’s probable: %j', async ({ reverse, missing }) => {
    schedule(false);
    const games = [probableGame(700, missing ? null : 201, missing ? null : 202), probableGame(701, 301, 302)];
    const request = probables(reverse ? games.reverse() : games);
    const [row] = await computeFirstInning(ctx);
    expect(row.meta.sp_first_inning).toBeUndefined();
    expect(row.detail).toBe('FIX scored in the first inning in 0 of the 10 sampled games.');
    expect(request.mock.calls.filter(([url]) => url.includes('/people/'))).toHaveLength(0);
  });
  it.each(['date', 'opponent', 'sides'])('does not attach a probable from mismatched %s context', async mismatch => {
    schedule(false);
    const g = probableGame(700);
    if (mismatch === 'date') g.officialDate = '2026-09-07';
    if (mismatch === 'opponent') g.teams.away.team.id = 999;
    if (mismatch === 'sides') [g.teams.home, g.teams.away] = [g.teams.away, g.teams.home];
    const request = probables([g]);
    const [row] = await computeFirstInning(ctx);
    expect(row.meta.sp_first_inning).toBeUndefined();
    expect(request.mock.calls.filter(([url]) => url.includes('/people/'))).toHaveLength(0);
  });
  it('does not let a repeated schedule listing turn seven unique games into an eligible sample', async () => {
    schedule(false);
    const read = mocks.schedule.getMockImplementation();
    const repeated = (await read('2026-09-01'))[0];
    mocks.schedule.mockImplementation(async date => {
      const games = (await read(date)).slice(0, 1);
      return date === '2026-09-07' ? [...games, repeated] : games;
    });
    expect(await computeFirstInning(ctx)).toEqual([]);
  });
  it('counts an identical repeated game once and preserves the exact ten source identities', async () => {
    schedule(false);
    const read = mocks.schedule.getMockImplementation();
    const repeated = (await read('2026-09-01'))[0];
    mocks.schedule.mockImplementation(async date => {
      const games = await read(date);
      return date === '2026-09-07' ? [...games, repeated] : games;
    });
    const [row] = await computeFirstInning(ctx);
    expect(row.meta.team_n).toBe(10);
    expect(new Set(row.meta.team_sample_games.map(g => g.gamePk)).size).toBe(10);
    expect(row.meta.team_sample_games.filter(g => g.gamePk === repeated.gamePk)).toHaveLength(1);
  });
  it.each(['score', 'teams', 'date'])('suppresses samples for conflicting duplicate %s facts', async conflict => {
    schedule(false);
    const read = mocks.schedule.getMockImplementation();
    const repeated = structuredClone((await read('2026-09-01'))[0]);
    if (conflict === 'score') repeated.linescore.innings[0].home.runs = 1;
    if (conflict === 'teams') repeated.teams.home.team.id = 999;
    if (conflict === 'date') repeated.officialDate = '2026-09-02';
    mocks.schedule.mockImplementation(async date => {
      const games = await read(date);
      return date === '2026-09-07' ? [...games, repeated] : games;
    });
    expect(await computeFirstInning(ctx)).toEqual([]);
  });
  it('sorts equal-date samples consistently regardless of provider listing order', async () => {
    schedule(false);
    const read = mocks.schedule.getMockImplementation();
    const [first] = await computeFirstInning(ctx);
    mocks.schedule.mockImplementation(async date => (await read(date)).reverse());
    const [reversed] = await computeFirstInning(ctx);
    expect(reversed.meta.team_sample_games).toEqual(first.meta.team_sample_games);
    expect(reversed.meta.team_seq).toEqual(first.meta.team_seq);
  });
});
