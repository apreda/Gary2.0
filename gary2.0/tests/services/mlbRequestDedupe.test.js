import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const START = Date.parse('2026-09-04T16:00:00Z');
const TWO_HOURS = 2 * 60 * 60 * 1000;
const TEAMS = [
  { id: 1, name: 'Home Club', active: true },
  { id: 2, name: 'Away Club', active: true },
];
const jsonResponse = data => ({ ok: true, json: async () => structuredClone(data) });
let api;
let fetchStub;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  fetchStub = vi.fn(async () => jsonResponse({ teams: TEAMS }));
  vi.stubGlobal('fetch', fetchStub);
  api = await import('../../src/services/mlbStatsApiService.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('MLB requests already in progress', () => {
  it('fetches the league team list once when the active pen builder resolves both clubs', async () => {
    fetchStub.mockImplementation(async input => {
      const url = new URL(input);
      if (url.pathname === '/api/v1/teams') return jsonResponse({ teams: TEAMS });
      const roster = url.pathname.match(/^\/api\/v1\/teams\/(\d+)\/roster$/);
      if (roster) {
        const id = Number(roster[1]) * 10;
        return jsonResponse({ roster: [{ person: { id, fullName: `Reliever ${id}` }, position: { type: 'Pitcher', abbreviation: 'P' } }] });
      }
      if (/^\/api\/v1\/people\/\d+\/stats$/.test(url.pathname)) {
        return jsonResponse({ stats: [{ splits: [{
          date: '2026-09-03', gameType: 'R', game: { gamePk: 100 },
          stat: { gamesStarted: 0, inningsPitched: '1.0', earnedRuns: 0, hits: 1, baseOnBalls: 0, strikeOuts: 2, numberOfPitches: 15 },
        }] }] });
      }
      if (url.pathname === '/api/v1/people') {
        return jsonResponse({ people: [{ id: Number(url.searchParams.get('personIds')), batSide: { code: 'R' }, pitchHand: { code: 'R' } }] });
      }
      if (url.pathname === '/api/v1/game/100/playByPlay') return jsonResponse({ allPlays: [], scoringPlays: [] });
      throw new Error(`Unexpected mock request: ${input}`);
    });
    const { fetchPenArms } = await import('../../src/services/agentic/tools/statRouters/penArms.js');
    const pen = await fetchPenArms('baseball_mlb', { name: 'Home Club' }, { name: 'Away Club' });

    expect(pen.homeValue).toContain('Home Club pen — 1 arms on the active roster');
    expect(pen.homeValue).toContain('Reliever 10');
    expect(pen.awayValue).toContain('Away Club pen — 1 arms on the active roster');
    expect(pen.awayValue).toContain('Reliever 20');
    expect(pen.source).toBe('MLB Stats API (roster + game logs)');
    const teamRequests = fetchStub.mock.calls.filter(([url]) => new URL(url).pathname === '/api/v1/teams');
    expect(teamRequests).toHaveLength(1);
    expect(fetchStub).toHaveBeenCalledTimes(8);
  });

  it('shares the request through response-body parsing and preserves both team resolutions', async () => {
    let finishJson;
    const body = new Promise(resolve => { finishJson = resolve; });
    const parse = vi.fn(() => body);
    fetchStub.mockResolvedValue({ ok: true, json: parse });
    const home = api.findMlbTeam('Home Club');
    await Promise.resolve();
    expect(parse).toHaveBeenCalledTimes(1);
    const away = api.findMlbTeam('Away Club');
    expect(fetchStub).toHaveBeenCalledTimes(1);
    finishJson({ teams: TEAMS });
    expect(await Promise.all([home, away])).toEqual(TEAMS);
  });

  it('leaves completed caches on their existing two-hour deadline', async () => {
    expect(await Promise.all([api.getMlbTeams(), api.getMlbTeams()])).toEqual([TEAMS, TEAMS]);
    vi.setSystemTime(START + TWO_HOURS - 1);
    await api.getMlbTeams();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    vi.setSystemTime(START + TWO_HOURS);
    fetchStub.mockResolvedValue(jsonResponse({ teams: [TEAMS[0]] }));
    expect(await Promise.all([api.getMlbTeams(), api.getMlbTeams()])).toEqual([[TEAMS[0]], [TEAMS[0]]]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('keeps uncached live linescores fresh after an overlapping read completes', async () => {
    fetchStub.mockResolvedValueOnce(jsonResponse({ currentInning: 1 }))
      .mockResolvedValueOnce(jsonResponse({ currentInning: 2 }));
    expect(await Promise.all([api.getGameLineScore(100), api.getGameLineScore(100)]))
      .toEqual([{ currentInning: 1 }, { currentInning: 1 }]);
    expect(await api.getGameLineScore(100)).toEqual({ currentInning: 2 });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('does not combine requests with different parameters', async () => {
    fetchStub.mockImplementation(async input => jsonResponse({ season: new URL(input).searchParams.get('season') }));
    expect(await Promise.all([api.getMlbStandings(2025), api.getMlbStandings(2026)]))
      .toEqual([{ season: '2025' }, { season: '2026' }]);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it.each(['transport', 'http', 'json'])('releases a failed %s request for immediate retry', async failure => {
    if (failure === 'transport') fetchStub.mockRejectedValueOnce(new Error('offline socket failure'));
    if (failure === 'http') fetchStub.mockResolvedValueOnce({ ok: false, status: 503 });
    if (failure === 'json') fetchStub.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } });
    const failed = await Promise.allSettled([api.getMlbTeams(), api.getMlbTeams()]);
    expect(failed.map(result => result.status)).toEqual(['rejected', 'rejected']);
    expect(failed[0].reason.message).toBe(failed[1].reason.message);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(await api.getMlbTeams()).toEqual(TEAMS);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});
