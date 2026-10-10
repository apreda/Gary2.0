import { describe, expect, it, vi } from 'vitest';
import { createGamePublication } from '../../scripts/lib/picks/publication.js';
import { extractJuneBilateralPaths } from '../../scripts/lib/picks/mlbJuneLane.js';

const quiet = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() });
const game = { id: 123, home_team: 'Home', away_team: 'Away', commence_time: '2026-09-20T04:30:00Z' };
const pick = { game_id: 123, homeTeam: 'Home', awayTeam: 'Away', pick: 'Away +3.5 -110', rationale: 'Original decision', commence_time: game.commence_time };
function publisher(options = {}) {
  const events = [];
  const deps = {
    storePicks: vi.fn(async () => { events.push('store'); }),
    confirmedPublishedGame: vi.fn(async ({ pick }) => { events.push('confirm'); return pick; }),
    picksService: { pickAlreadyStoredByGameId: vi.fn(), storeDeskSnapshot: vi.fn(async () => { events.push('desk'); }) },
    winnersAdmin: {}, enqueueWinnersCandidate: vi.fn(async () => { events.push('queue'); }),
    console: quiet(), ...options,
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
