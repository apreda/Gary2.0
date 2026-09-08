import { describe, expect, it, vi } from 'vitest';
import { fetchNflPracticeDesignations } from '../../../src/services/insights/nflPracticeProvider.js';
import { computeFootballPracticeReport } from '../../../src/services/insights/computers/footballPracticeReport.js';
import { insightRefreshOldIds } from '../../../scripts/lib/insightRefreshScope.js';

const game = (extra = {}) => ({ id: 100, season: 2026, week: 1, season_type: 2,
  date: '2026-09-13T17:00:00Z', home_team: { id: 1, abbreviation: 'NE' }, visitor_team: { id: 26, abbreviation: 'BUF' }, ...extra });
const report = (extra = {}) => ({ id: 900, season: 2026, week: 1, season_type: 'regular', game_id: 100,
  player: { id: 10, first_name: 'Test', last_name: 'Runner', position_abbreviation: 'RB' },
  team: { id: 1 }, injury: 'Ankle', game_status: null, active: null, did_not_play: null,
  practice_reports: [{ date: '2026-09-09', status: 'did_not_participate' }, { date: '2026-09-10', status: 'limited' }],
  updated_at: '2026-09-10T18:00:00Z', ...extra });
const ctx = (reports, extra = {}) => ({ league: 'NFL', date: '2026-09-10', games: [game()],
  helpers: { gameLabel: () => 'BUF @ NE' }, practiceDesignations: vi.fn(async () => reports), ...extra });

describe('licensed NFL practice transport', () => {
  const args = { season: 2026, week: 1, seasonType: 2, teamIds: [1, 26], apiKey: 'fixture', waitForSlot: vi.fn(async () => {}) };
  it('collects every explicit week page through the request gate', async () => {
    const client = { get: vi.fn().mockResolvedValueOnce({ status: 200, data: { data: [report()], meta: { next_cursor: 'next' } } })
      .mockResolvedValueOnce({ status: 200, data: { data: [report({ id: 901 })], meta: { next_cursor: null } } }) };
    expect(await fetchNflPracticeDesignations({ ...args, client })).toHaveLength(2);
    expect(client.get.mock.calls.map(([url, request]) => [url, request.params])).toEqual([
      ['https://api.balldontlie.io/nfl/v1/player_designations', { season: 2026, week: 1, 'season_types[]': [2], 'team_ids[]': ['1', '26'], per_page: 100 }],
      ['https://api.balldontlie.io/nfl/v1/player_designations', { season: 2026, week: 1, 'season_types[]': [2], 'team_ids[]': ['1', '26'], per_page: 100, cursor: 'next' }],
    ]);
  });
  it.each([
    { data: [], meta: { next_cursor: 2 } },
    { data: 'malformed' },
    { data: [null] },
  ])('rejects incomplete/malformed collections without a partial result: %j', async data => {
    const client = { get: vi.fn(async () => ({ data })) };
    await expect(fetchNflPracticeDesignations({ ...args, client })).rejects.toThrow();
  });
  it('rejects looping cursors', async () => {
    const client = { get: vi.fn(async () => ({ data: { data: [report()], meta: { next_cursor: 1 } } })) };
    await expect(fetchNflPracticeDesignations({ ...args, client })).rejects.toThrow(/repeated/);
  });
  it.each([{ week: undefined }, { seasonType: null }, { teamIds: ['1,2'] }])('refuses implicit or invalid scope: %j', async invalid => {
    const client = { get: vi.fn() };
    await expect(fetchNflPracticeDesignations({ ...args, ...invalid, client })).rejects.toThrow(/exact/);
    expect(client.get).not.toHaveBeenCalled();
  });
  it('sanitizes provider errors', async () => {
    const client = { get: vi.fn(async () => { throw { message: 'private fixture key', config: { headers: { Authorization: 'private' } }, response: { status: 403 } }; }) };
    await expect(fetchNflPracticeDesignations({ ...args, client })).rejects.toThrow('NFL practice report request failed (HTTP 403)');
  });
  it('rejects a page that completes after cancellation', async () => {
    const controller = new AbortController();
    const client = { get: vi.fn(async () => { controller.abort(); return { data: { data: [report()] } }; }) };
    await expect(fetchNflPracticeDesignations({ ...args, client, signal: controller.signal })).rejects.toThrow(/cancelled/);
  });
});

describe('NFL practice row evidence', () => {
  it('replaces only games with fresh practice evidence during a partial-week provider failure', () => {
    expect(insightRefreshOldIds({ league: 'NFL', category: 'practice_report',
      existing: [{ id: 'old1', game_id: '100' }, { id: 'old2', game_id: '101' }], fresh: [{ game_id: 100 }],
    })).toEqual(['old1']);
  });
  it('preserves actual dated marks, identities and source without previous HTML snapshots', async () => {
    const rest = { client: { get: vi.fn() } };
    const c = ctx([report()], { rest });
    const rows = await computeFootballPracticeReport(c);
    expect(c.practiceDesignations).toHaveBeenCalledWith(expect.objectContaining({ season: 2026, week: 1, seasonType: 2, teamIds: [26, 1] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ headline: 'Test Runner', value: 'LP', game_id: 100, team_id: 1, player_id: 10,
      meta: { source: 'BallDontLie player designations', side: 'home', practice: { wed: 'DNP', thu: 'LP' },
        practice_dates: { wed: '2026-09-09', thu: '2026-09-10' }, latest_day: 'thu', game_status: null } });
    expect(rows[0].meta.practice).not.toHaveProperty('fri');
    expect(rest.client.get).not.toHaveBeenCalled();
  });
  it('binds season, week, type, exact game, team and player instead of name/mascot joins', async () => {
    const rows = await computeFootballPracticeReport(ctx([
      report({ game_id: 101 }), report({ season: 2025 }), report({ week: 2 }), report({ season_type: 'preseason' }),
      report({ team: { id: 7 } }), report({ player: { first_name: 'Missing ID' } }), report(),
    ]));
    expect(rows).toHaveLength(1);
  });
  it('does not interpret null or completed-game did_not_play as a practice mark', async () => {
    expect(await computeFootballPracticeReport(ctx([report({ injury: null, practice_reports: [], did_not_play: true, active: false })]))).toEqual([]);
    const [row] = await computeFootballPracticeReport(ctx([report({ practice_reports: [] })]));
    expect(row.value).toBe('LISTED');
    expect(row.meta).toMatchObject({ latest: null, game_status: null, practice: {} });
  });
  it('uses nonstandard practice dates without shifting Sunday/Monday into Wednesday', async () => {
    const [row] = await computeFootballPracticeReport(ctx([report({ practice_reports: [
      { date: '2026-09-06', status: 'did_not_participate' }, { date: '2026-09-07', status: 'limited' },
    ] })]));
    expect(row.meta).toMatchObject({ latest: 'LP', latest_day: 'mon', practice: {} });
  });
  it('never imports later snapshots or future practice marks into a past date', async () => {
    expect(await computeFootballPracticeReport(ctx([report()], { date: '2026-09-09' }))).toEqual([]);
    const [row] = await computeFootballPracticeReport(ctx([report({ practice_reports: [
      { date: '2026-09-09', status: 'limited' }, { date: '2026-09-11', status: 'full' },
    ] })]));
    expect(row.meta).toMatchObject({ latest: 'LP', latest_day: 'wed', practice: { wed: 'LP' } });
  });
  it('leaves contradictory same-day marks unknown', async () => {
    const [row] = await computeFootballPracticeReport(ctx([report({ practice_reports: [
      { date: '2026-09-09', status: 'full' }, { date: '2026-09-10', status: 'limited' },
      { date: '2026-09-10', status: 'did_not_participate' }, { date: '2026-09-10', status: 'limited' },
    ] })]));
    expect(row.meta).toMatchObject({ latest: null, latest_day: 'thu', practice: { wed: 'FP', thu: null } });
  });
  it('chooses a newer revision and drops unresolved same-time duplicate revisions', async () => {
    const newer = report({ game_status: 'out', updated_at: '2026-09-10T19:00:00Z' });
    const [row] = await computeFootballPracticeReport(ctx([report(), newer]));
    expect(row.value).toBe('Out');
    expect(await computeFootballPracticeReport(ctx([report(), report({ game_status: 'out' }), report()]))).toEqual([]);
  });
  it('requests separate slate weeks and never substitutes an implicit current week', async () => {
    const c = ctx([report()], { games: [game(), game({ id: 101, week: 2 }), game({ id: 102, week: undefined })] });
    await computeFootballPracticeReport(c);
    expect(c.practiceDesignations.mock.calls.map(([args]) => args.week)).toEqual([1, 2]);
  });
  it('supports actual BDL game responses without season_type using explicit types and exact game ID', async () => {
    const c = ctx([report(), report({ game_id: 101, season_type: 'preseason' })], {
      games: [game({ season_type: undefined, postseason: false })],
    });
    expect(await computeFootballPracticeReport(c)).toHaveLength(1);
    expect(c.practiceDesignations.mock.calls[0][0].seasonTypes).toEqual([1, 2, 3]);
  });
  it('treats an unavailable provider as unavailable', async () => {
    const c = ctx([], { practiceDesignations: async () => { throw new Error('HTTP 503'); } });
    expect(await computeFootballPracticeReport(c)).toEqual([]);
  });
});
