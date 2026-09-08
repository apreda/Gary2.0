import { beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({ schedule: vi.fn(), teams: vi.fn(), box: vi.fn() }));
vi.mock('../../../src/services/mlbStatsApiService.js', () => ({ default: {
  getMlbSchedule: provider.schedule, getMlbTeams: provider.teams, getGameBoxScore: provider.box,
} }));
const { computeBullpenFatigue, shouldUpgradeBullpenEvidence, BULLPEN_RESEARCH_VERSION } = await import('../../../src/services/insights/computers/bullpenFatigue.js');

const team = { id: 99, name: 'Fixture Club', abbreviation: 'FIX' };
const game = { id: 700, status: 'STATUS_SCHEDULED', home_team: team, visitor_team: { id: 98, name: 'Opponent Club' } };
const context = { date: '2026-09-08', games: [game], helpers: { gameLabel: () => 'OPP @ FIX' } };
const pitcher = (name, ip, pitches, er, extra = {}) => ({ person: { fullName: name },
  stats: { pitching: { inningsPitched: ip, numberOfPitches: pitches, earnedRuns: er, strikeOuts: 2, baseOnBalls: 0 } },
  seasonStats: { pitching: { era: '2.50', inningsPitched: '54.0', saves: 0 } }, ...extra });
let boxes;
let schedules;
function schedule(date, gamePk, gameNumber = 1) {
  return { gamePk, officialDate: date, gameNumber, status: { detailedState: 'Final' }, teams: { home: { team: { id: 140 } } } };
}
function box(players) { return { teams: { home: { team: { id: 140 }, pitchers: [1, ...Object.keys(players).map(Number)], players: {
  ID1: pitcher('Fixture Starter', '3.0', 40, 0), ...Object.fromEntries(Object.entries(players).map(([id, player]) => [`ID${id}`, player])),
} } } }; }

beforeEach(() => {
  vi.resetAllMocks();
  schedules = {
    '2026-09-04': [schedule('2026-09-04', 104)],
    '2026-09-05': [schedule('2026-09-05', 105)],
    '2026-09-06': [schedule('2026-09-06', 106)],
  };
  boxes = {
    104: box({ 2: pitcher('Bulk Arm', '5.0', 73, 5), 3: pitcher('Repeated Arm', '1.1', 16, 0), 4: pitcher('Other Arm', '0.2', 11, 1) }),
    105: box({ 3: pitcher('Repeated Arm', '1.0', 14, 0), 5: pitcher('Save Leader', '2.0', 30, 2) }),
    106: box({ 3: pitcher('Repeated Arm', '1.0', 17, 1), 5: pitcher('Save Leader', '1.0', 18, 0, {
      seasonStats: { pitching: { era: '1.85', inningsPitched: '63.1', saves: 28 } },
    }), 6: pitcher('Latest Arm', '5.0', 50, 1) }),
  };
  provider.schedule.mockImplementation(async date => schedules[date] || []);
  provider.teams.mockResolvedValue([{ id: 140, name: team.name }]);
  provider.box.mockImplementation(async id => boxes[id]);
});

describe('stats-first bullpen observations', () => {
  it('keeps exact dated workload, season sample, off day and performance; makes no availability claim', async () => {
    const [row] = await computeBullpenFatigue(context);
    expect(row.headline).toContain('17 relief IP');
    expect(row.detail).toContain('Repeated Arm worked all 3 games (47 pitches)');
    expect(row.detail).toContain('Save Leader worked 2 games (48 pitches; 1.85 season ERA over 63.1 IP)');
    expect(row.detail).toContain('10 ER in that 17-IP span (Sep 4–Sep 6)');
    expect(row.detail).toContain('No team game on Sep 7');
    expect(row.detail).not.toMatch(/unavailable|tired|gassed|running out|I want|bet|xERA/i);
    expect(row.tone).toBe('neutral');
    expect(row.meta.source_game_ids).toEqual([106, 105, 104]);
    expect(row.meta.no_game_dates).toEqual(['2026-09-07']);
    expect(row.meta.arms.find(a => a.id === 3)).toMatchObject({ g: 3, b2b: false, last_used: '2026-09-06', pitches: 47 });
    expect(row.meta.arms.find(a => a.id === 5)).toMatchObject({ season_era: 1.85, season_ip: 63.1, season_as_of: '2026-09-06' });
    expect(row.meta.arms.find(a => a.id === 3).outings).toHaveLength(3);
    expect(row.meta.evidence).toBe(row.detail);
    expect(row.meta.read).toBe(row.detail);
  });

  it('retains every observed arm, including an outing recording zero outs', async () => {
    for (let id = 7; id <= 14; id++) boxes[106].teams.home.players[`ID${id}`] = pitcher(`Extra ${id}`, '0.0', 4, 0);
    boxes[106].teams.home.pitchers.push(...Array.from({ length: 8 }, (_, i) => i + 7));
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.arms).toHaveLength(13);
    expect(row.meta.arms_used).toBe(13);
    expect(row.meta.arms.find(a => a.id === 7)).toMatchObject({ ip: 0, g: 1, pitches: 4 });
    expect(row.meta.relief_ip).toBe(17);
  });

  it('does not label two doubleheader appearances as two days or miss the later game', async () => {
    schedules = { '2026-09-07': [schedule('2026-09-07', 104, 1), schedule('2026-09-07', 105, 2), schedule('2026-09-07', 105, 2)],
      '2026-09-06': [schedule('2026-09-06', 106)] };
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.source_game_ids).toEqual([105, 104, 106]);
    expect(row.meta.arms.find(a => a.id === 3)).toMatchObject({ g: 3, b2b: true });
    expect(row.meta.arms.find(a => a.id === 2).b2b).toBe(false);
    expect(row.meta.no_game_dates).toEqual([]);
  });

  it('does not call a date with a postponed or unfinished scheduled game an off day', async () => {
    schedules['2026-09-07'] = [{ ...schedule('2026-09-07', 107), status: { detailedState: 'Postponed' } }];
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.no_game_dates).toEqual([]);
    expect(row.detail).not.toContain('No team game');
  });

  it('does not turn a resumed game with an older official date into a rest day', async () => {
    schedules['2026-09-07'] = [schedule('2026-09-01', 107)];
    expect(await computeBullpenFatigue(context)).toEqual([]);
  });

  it('labels the dated window without asserting it includes an earlier same-day doubleheader game', async () => {
    const [row] = await computeBullpenFatigue({ ...context, games: [{ ...game, game_number: 2 }] });
    expect(row.headline).toBe('Fixture Club pen: 17 relief IP across 3 games');
    expect(row.detail).toContain('Sep 4–Sep 6');
    expect(row.headline).not.toContain('last');
  });

  it('keeps missing pitches and earned runs unknown while retaining verified innings', async () => {
    delete boxes[105].teams.home.players.ID3.stats.pitching.numberOfPitches;
    delete boxes[105].teams.home.players.ID5.stats.pitching.earnedRuns;
    delete boxes[106].teams.home.players.ID5.seasonStats;
    delete boxes[105].teams.home.players.ID5.seasonStats;
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.relief_pitches).toBeNull();
    expect(row.meta.relief_er).toBeNull();
    expect(row.meta.arms.find(a => a.id === 3).pitches).toBeNull();
    expect(row.detail).toContain('Repeated Arm worked all 3 games (3.1 IP)');
    expect(row.detail).not.toContain('ER in that');
    expect(row.meta.arms.find(a => a.id === 5).season_era).toBeUndefined();
    expect(row.detail).not.toContain('1.85 season ERA');
  });

  it.each([null, undefined, '', ' ', false, {}])('does not turn a missing/malformed season ERA into zero or an earlier total (%j)', async era => {
    boxes[106].teams.home.players.ID5.seasonStats.pitching.era = era;
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.arms.find(a => a.id === 5).season_era).toBeUndefined();
  });

  it('does not coerce boolean workload counts to reported zero', async () => {
    boxes[106].teams.home.players.ID3.stats.pitching.numberOfPitches = false;
    boxes[106].teams.home.players.ID3.stats.pitching.earnedRuns = false;
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.relief_pitches).toBeNull();
    expect(row.meta.relief_er).toBeNull();
  });

  it.each(['missing', 'invalid', 'wrong_outs', 'wrong_team', 'duplicate_pitcher'])('rejects %s box evidence rather than undercounting the workload', async kind => {
    if (kind === 'missing') delete boxes[105].teams.home.players.ID3.stats.pitching.inningsPitched;
    if (kind === 'invalid') boxes[105].teams.home.players.ID3.stats.pitching.inningsPitched = '1.7';
    if (kind === 'wrong_outs') boxes[105].teams.home.players.ID3.stats.pitching.outs = 4;
    if (kind === 'wrong_team') boxes[105].teams.home.team.id = 999;
    if (kind === 'duplicate_pitcher') boxes[105].teams.home.pitchers.push(3);
    expect(await computeBullpenFatigue(context)).toEqual([]);
  });

  it('fails closed on a missing schedule or final box instead of inventing an off day or zero relief', async () => {
    provider.schedule.mockRejectedValueOnce(new Error('fixture outage'));
    expect(await computeBullpenFatigue(context)).toEqual([]);
    provider.schedule.mockImplementation(async date => schedules[date] || []);
    provider.box.mockResolvedValueOnce({});
    expect(await computeBullpenFatigue(context)).toEqual([]);
  });

  it('excludes a complete-game starter from the relief total', async () => {
    boxes[105].teams.home.pitchers = [1];
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.relief_ip).toBe(14);
    expect(row.meta.arms.some(a => a.name === 'Fixture Starter')).toBe(false);
  });
});

describe('current bullpen prose upgrade guard', () => {
  const stored = { date: '2026-09-08', category: 'bullpen_fatigue', headline: 'Fixture Club pen: 17 relief IP across 3 games', team_id: '99', game_id: '700', result: null, meta: { evidence: 'Old opinion' } };
  const fresh = { ...stored, team_id: 99, game_id: 700, meta: { research_version: BULLPEN_RESEARCH_VERSION } };
  it('upgrades only same-game/team old ungraded bullpen evidence and is idempotent', () => {
    const upgrade = (s, r, today = '2026-09-08') => shouldUpgradeBullpenEvidence(s, r, today);
    expect(upgrade(stored, fresh)).toBe(true);
    expect(upgrade({ ...stored, headline: 'Fixture Club pen: 17 relief IP over their last 3 games', meta: { research_version: BULLPEN_RESEARCH_VERSION } }, fresh)).toBe(true);
    expect(upgrade(fresh, fresh)).toBe(false);
    expect(upgrade(stored, { ...fresh, headline: '' })).toBe(false);
    expect(upgrade({ ...stored, meta: { research_version: 'future-version' } }, fresh)).toBe(false);
    expect(upgrade({ ...stored, result: 'win' }, fresh)).toBe(false);
    expect(upgrade({ ...stored, team_id: 98 }, fresh)).toBe(false);
    expect(upgrade({ ...stored, game_id: 701 }, fresh)).toBe(false);
    expect(upgrade({ ...stored, category: 'heat_check' }, fresh)).toBe(false);
    expect(upgrade({ ...stored, date: '2026-09-07' }, fresh)).toBe(false);
    expect(upgrade(stored, { ...fresh, date: '2026-09-07' })).toBe(false);
    expect(upgrade(stored, fresh, '2026-09-09')).toBe(false);
    expect(upgrade({ ...stored, result: undefined }, fresh)).toBe(false);
    expect(shouldUpgradeBullpenEvidence(stored, fresh)).toBe(false);
  });
});
