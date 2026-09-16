import { describe, expect, it, vi } from 'vitest';
import { prepareMlbScoutInput } from '../../scripts/lib/mlbScoutInput.js';

const teams = [
  { id: 138, name: 'St. Louis Cardinals', teamName: 'Cardinals', abbreviation: 'STL' },
  { id: 137, name: 'San Francisco Giants', teamName: 'Giants', abbreviation: 'SF' },
];
const game = { id: 5060044, home_team: 'Cardinals', away_team: 'Giants', commence_time: '2026-09-16T17:15:00Z', bookmakers: [{ key: 'fixture' }] };
const roster = id => [{ id: id * 100, name: id === 138 ? 'Matthew Liberatore' : 'Bryce Eldridge' }];
const dependencies = () => ({ getTeams: vi.fn(async () => teams), getRoster: vi.fn(async id => roster(id)) });

describe('MLB names-only odds game → June scout input', () => {
  it('supplies MLB IDs and named rosters while preserving the original ticket identity and markets', async () => {
    const deps = dependencies();
    const result = await prepareMlbScoutInput(game, deps);
    expect(result).toEqual({ ...game, home_team_data: teams[0], away_team_data: teams[1] });
    expect(deps.getRoster.mock.calls).toEqual([[138], [137]]);
    expect(game).not.toHaveProperty('home_team_data');
  });
  it('replaces IDs from another namespace, preserving unrelated game data', async () => {
    const result = await prepareMlbScoutInput({ ...game, home_team_data: { id: 26, runs: 0 }, away_team_data: { id: 24 } }, dependencies());
    expect(result.home_team_data).toEqual({ ...teams[0], runs: 0 });
    expect(result.away_team_data.id).toBe(137);
  });
  it.each(['St. Louis Cardinals', 'st louis cardinals', 'STL'])('resolves official aliases exactly: %s', async name => {
    const result = await prepareMlbScoutInput({ ...game, home_team: name }, dependencies());
    expect(result.home_team_data.id).toBe(138);
  });
  it.each(['New York', '', 'Sox'])('does not guess an ambiguous or missing club: %s', async name => {
    const deps = dependencies();
    await expect(prepareMlbScoutInput({ ...game, home_team: name }, deps)).rejects.toThrow('MLB_SCOUT_TEAM_ID');
    expect(deps.getRoster).not.toHaveBeenCalled();
  });
  it('rejects a conflicting directory or a matchup with the same club twice', async () => {
    await expect(prepareMlbScoutInput(game, { ...dependencies(), getTeams: async () => [...teams, { ...teams[0], id: 999 }] })).rejects.toThrow('MLB_SCOUT_TEAM_ID');
    await expect(prepareMlbScoutInput({ ...game, away_team: 'STL' }, dependencies())).rejects.toThrow('same club');
  });
  it.each([[], null, [{ id: 3 }], [{ name: 'Unknown ID' }]])('exposes an incomplete roster instead of allowing anonymous player copy', async value => {
    await expect(prepareMlbScoutInput(game, { ...dependencies(), getRoster: async () => value })).rejects.toThrow('MLB_SCOUT_ROSTER');
  });
  it('propagates upstream failures and cancellation without another provider', async () => {
    await expect(prepareMlbScoutInput(game, { ...dependencies(), getRoster: async () => { throw new Error('MLB 503'); } })).rejects.toThrow('MLB 503');
    const controller = new AbortController();
    controller.abort(new Error('stop requested'));
    const deps = dependencies();
    await expect(prepareMlbScoutInput(game, { ...deps, signal: controller.signal })).rejects.toThrow('stop requested');
    expect(deps.getTeams).not.toHaveBeenCalled();
  });
});
