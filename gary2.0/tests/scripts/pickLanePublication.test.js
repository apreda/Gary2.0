import { describe, expect, it, vi } from 'vitest';
import { createNcaafPropRecovery } from '../../scripts/lib/picks/ncaafProps.js';
import { createGamePublication } from '../../scripts/lib/picks/publication.js';
import { extractJuneBilateralPaths } from '../../scripts/lib/picks/mlbJuneLane.js';

const quiet = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() });
const game = { id: 123, home_team: 'Home', away_team: 'Away', commence_time: '2026-09-20T04:30:00Z' };
const pick = { game_id: 123, homeTeam: 'Home', awayTeam: 'Away', pick: 'Away +3.5 -110', rationale: 'Original decision', commence_time: game.commence_time };
const prop = { game_id: 123, player: 'Player', prop: 'passing_yards', line: 252.5, bet: 'over', odds: -110, commence_time: game.commence_time };
const fixedClock = at => class extends Date { constructor(value) { super(value ?? at); } static now() { return Date.parse(at); } };
function database(responses = []) {
  const calls = [];
  const client = { from(table) {
    const call = { table, filters: {} }; calls.push(call);
    const chain = {
      select(columns) { call.select = columns; return chain; },
      eq(key, value) { call.filters[key] = value; return chain; },
      async maybeSingle() { return responses.shift() ?? { data: null, error: null }; },
      async upsert(row) { call.write = row; return responses.shift() ?? { error: null }; },
    };
    return chain;
  } };
  return { client, calls };
}
function college(options = {}) {
  const db = database();
  const atomic = vi.fn().mockResolvedValue({ added: 1, skipped: 0 });
  const brain = vi.fn().mockResolvedValue({ picks: [{ ...prop }], winnersEvidence: { original: true } });
  const deps = {
    supabase: db.client, winnersAdmin: db.client,
    fetchDailySlateGame: vi.fn().mockResolvedValue(game),
    loadPiggyback: vi.fn().mockResolvedValue({ runNcaafPiggyback: brain }),
    loadStorage: vi.fn().mockResolvedValue({ storePropPicksAtomic: atomic, stampFootballTdCategory: row => ({ ...row, sport: 'NCAAF' }) }),
    recordMlbDataFailure: vi.fn(), resolveMlbDataFailure: vi.fn(),
    Date: fixedClock('2026-09-19T22:00:00Z'), console: quiet(), ...options,
  };
  return { ...createNcaafPropRecovery(deps), deps, db, atomic, brain };
}

describe('college prop recovery boundary', () => {
  it('uses the original game slate after midnight and never rewrites its ticket', async () => {
    const lane = college();
    const immutable = Object.freeze({ ...pick });
    await lane.completeNcaafProp(immutable, { game, date: '2026-09-20' });
    expect(lane.db.calls[0]).toMatchObject({ table: 'prop_picks', filters: { date: '2026-09-19' } });
    expect(lane.brain).toHaveBeenCalledWith({ game, pickText: immutable.pick, rationale: immutable.rationale });
    expect(lane.atomic).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-19', leagueLabel: 'NCAAF', picks: [prop], forceRun: false }));
    expect(lane.deps.recordMlbDataFailure).not.toHaveBeenCalled();
  });
  it('does not run a prop decision after kickoff', async () => {
    const lane = college({ Date: fixedClock('2026-09-20T04:30:00Z') });
    await lane.completeNcaafProp(pick, { game, date: '2026-09-19' });
    expect(lane.db.calls).toHaveLength(0);
    expect(lane.brain).not.toHaveBeenCalled();
  });
  it('recognizes an existing exact college prop without buying another decision', async () => {
    const db = database([{ data: { picks: [{ bdl_game_id: 123, sport: 'NCAAF' }] }, error: null }]);
    const lane = college({ winnersAdmin: db.client });
    await lane.completeNcaafProp(pick, { game, date: '2026-09-19' });
    expect(lane.brain).not.toHaveBeenCalled();
    expect(lane.deps.resolveMlbDataFailure).toHaveBeenCalledWith({ game_id: 123 }, { league: 'NCAAF', kind: 'props' });
  });
  it('records a missing prop as retryable while retaining the published game', async () => {
    const lane = college();
    lane.brain.mockRejectedValueOnce(new Error('provider outage'));
    await expect(lane.completeNcaafProp(Object.freeze({ ...pick }), { game, date: '2026-09-19' })).resolves.toBeUndefined();
    expect(lane.deps.recordMlbDataFailure).toHaveBeenCalledWith(game, expect.objectContaining({ message: 'provider outage' }), { league: 'NCAAF', kind: 'props' });
    expect(lane.atomic).not.toHaveBeenCalled();
  });
  it('separates dates and keeps test writes out of production', async () => {
    const lane = college();
    await lane.storeNcaafPiggybackProps([prop, { ...prop, game_id: 124, commence_time: '2026-09-20T10:00:00Z' }], { useTestTable: true });
    expect(lane.atomic).not.toHaveBeenCalled();
    expect(lane.db.calls.every(call => call.table === 'test_prop_picks')).toBe(true);
    const writes = lane.db.calls.filter(call => call.write).map(call => call.write);
    expect(writes.map(row => row.date)).toEqual(['2026-09-19', '2026-09-20']);
    expect(writes[0].picks[0]).toMatchObject({ odds: -110, line: 252.5, game_id: 123 });
  });
});

function publisher(options = {}) {
  const events = [];
  const deps = {
    storePicks: vi.fn(async () => { events.push('store'); }),
    confirmedPublishedGame: vi.fn(async ({ pick }) => { events.push('confirm'); return pick; }),
    picksService: { pickAlreadyStoredByGameId: vi.fn(), storeDeskSnapshot: vi.fn(async () => { events.push('desk'); }) },
    winnersAdmin: {}, enqueueWinnersCandidate: vi.fn(async () => { events.push('queue'); }),
    buildShadowPick: vi.fn(), console: quiet(), ...options,
  };
  const input = { config: { name: 'NCAAF', key: 'americanfootball_ncaaf' }, game, cleanPick: Object.freeze({ ...pick }), picksForGame: [pick], result: { _context: { scoutReport: 'Original dated desk' } } };
  return { ...createGamePublication(deps), deps, input, events };
}
describe('confirmed ticket publication', () => {
  it('stores, confirms and records the same exact ticket before queuing its original evidence', async () => {
    const lane = publisher();
    lane.input.result._context.researchBriefing = 'The original research briefing';
    await lane.publishGame(lane.input);
    expect(lane.events).toEqual(['store', 'confirm', 'desk', 'queue']);
    const queue = lane.deps.enqueueWinnersCandidate.mock.calls[0][1];
    expect(queue).toMatchObject({ date: '2026-09-19', league: 'NCAAF', kind: 'game', pick: lane.input.cleanPick });
    expect(queue.evidence.pickSnapshot.pick).toBe(pick.pick);
    expect(queue.evidence.deskText).toBe('Original dated desk');
    expect(lane.deps.picksService.storeDeskSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      research_briefing: 'The original research briefing',
    }));
    expect(lane.deps.buildShadowPick).not.toHaveBeenCalled();
  });
  it('does not attach replacement evidence when the saved ticket is different', async () => {
    const lane = publisher({ confirmedPublishedGame: vi.fn().mockResolvedValue(null) });
    expect(await lane.publishGame(lane.input)).toBeNull();
    expect(lane.deps.picksService.storeDeskSnapshot).not.toHaveBeenCalled();
    expect(lane.deps.enqueueWinnersCandidate).not.toHaveBeenCalled();
  });
  it('retains a stored game if confirmation is temporarily unavailable', async () => {
    const lane = publisher({ confirmedPublishedGame: vi.fn().mockRejectedValue(new Error('readback unavailable')) });
    await expect(lane.publishGame(lane.input)).resolves.toBeNull();
    expect(lane.deps.storePicks).toHaveBeenCalledTimes(1);
    expect(lane.deps.enqueueWinnersCandidate).not.toHaveBeenCalled();
  });
  it('does not queue Winners until the durable publication receipt succeeds', async () => {
    const lane = publisher();
    lane.input.result._mlbJudgmentJournal = { publish: vi.fn().mockRejectedValue(new Error('receipt unavailable')) };
    lane.input.result._mlbJudgment = { receipts: {} };
    await lane.publishGame(lane.input);
    expect(lane.deps.picksService.storeDeskSnapshot).toHaveBeenCalledTimes(1);
    expect(lane.deps.enqueueWinnersCandidate).not.toHaveBeenCalled();
  });
  it('propagates storage failure before any confirmation or evidence write', async () => {
    const lane = publisher({ storePicks: vi.fn().mockRejectedValue(new Error('write unavailable')) });
    await expect(lane.publishGame(lane.input)).rejects.toThrow('write unavailable');
    expect(lane.deps.confirmedPublishedGame).not.toHaveBeenCalled();
    expect(lane.deps.picksService.storeDeskSnapshot).not.toHaveBeenCalled();
  });
});

it('maps the original bilateral headings without mixing opposing cases', () => {
  const home = 'Home has its original attributed game case. '.repeat(3);
  const away = 'Away has its own dated pitching and batting case. '.repeat(3);
  const paths = extractJuneBilateralPaths(`CASE FOR BACKING Home TONIGHT:\n${home}\nCASE FOR BACKING Away TONIGHT:\n${away}\nINVESTIGATION COMPLETE`, 'Home', 'Away');
  expect(paths).toEqual({ path_home: home.trim(), path_away: away.trim() });
  expect(extractJuneBilateralPaths('', 'Home', 'Away')).toEqual({ path_home: null, path_away: null });
});
