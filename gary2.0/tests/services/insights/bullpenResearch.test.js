import { beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({ games: vi.fn(), stats: vi.fn(), season: vi.fn() }));
vi.mock('../../../src/services/ballDontLieService.js', () => ({ ballDontLieService: {
  getMlbGamesForETDate: provider.games, getMlbGameStats: provider.stats, getMlbPlayerSeasonStats: provider.season,
} }));
const { computeBullpenFatigue, shouldUpgradeBullpenEvidence, BULLPEN_RESEARCH_VERSION, BULLPEN_SOURCE } = await import('../../../src/services/insights/computers/bullpenFatigue.js');

const team = { id: 99, name: 'Fixture Club', display_name: 'Fixture Club', abbreviation: 'FIX' };
const opponent = { id: 98, name: 'Opponent Club', display_name: 'Opponent Club' };
const game = { id: 700, status: 'STATUS_SCHEDULED', home_team: team, visitor_team: opponent };
const context = { date: '2026-09-08', games: [game], helpers: { gameLabel: () => 'OPP @ FIX' } };
// A BDL per-game pitching line. `pitching_outs` is the observed count; `ip` mirrors it in baseball notation.
const line = (id, name, outs, pitches, er, extra = {}) => ({ player: { id, full_name: name }, team: { id: 99 }, game_id: null,
  games_started: 0, pitching_outs: outs, ip: `${Math.floor(outs / 3)}.${outs % 3}`, pitch_count: pitches, er, p_k: 2, p_bb: 0, ...extra });
const starter = line(1, 'Fixture Starter', 9, 40, 0, { games_started: 1 });
const final = (date, id, firstPitch = `${date}T23:10:00.000Z`, status = 'STATUS_FINAL') =>
  ({ id, status, date: firstPitch, home_team: { id: 99, name: 'Fixture Club' }, away_team: { id: 98, name: 'Opponent Club' } });
let schedules, boxes, seasons;
const box = (gameId, ...lines) => [starter, ...lines].map(l => ({ ...l, game_id: gameId }));

beforeEach(() => {
  vi.resetAllMocks();
  schedules = { '2026-09-04': [final('2026-09-04', 104)], '2026-09-05': [final('2026-09-05', 105)], '2026-09-06': [final('2026-09-06', 106)] };
  boxes = {
    104: box(104, line(2, 'Bulk Arm', 15, 73, 5), line(3, 'Repeated Arm', 4, 16, 0), line(4, 'Other Arm', 2, 11, 1)),
    105: box(105, line(3, 'Repeated Arm', 3, 14, 0), line(5, 'Save Leader', 6, 30, 2)),
    106: box(106, line(3, 'Repeated Arm', 3, 17, 1), line(5, 'Save Leader', 3, 18, 0), line(6, 'Latest Arm', 15, 50, 1)),
  };
  seasons = [{ player: { id: 5 }, pitching_era: 1.8512, pitching_ip: 63.1, pitching_sv: 28, pitching_hld: 3 },
    { player: { id: 3 }, pitching_era: 2.5, pitching_ip: 54.0, pitching_sv: 0, pitching_hld: 10 }];
  provider.games.mockImplementation(async date => schedules[date] || []);
  provider.stats.mockImplementation(async ({ gameIds }) => boxes[gameIds[0]] || []);
  provider.season.mockImplementation(async ({ playerIds }) => seasons.filter(s => playerIds.includes(s.player.id)));
});

describe('stats-first bullpen observations from licensed final box scores', () => {
  it('keeps exact dated workload, season sample, off day and performance; makes no availability claim', async () => {
    const [row] = await computeBullpenFatigue(context);
    expect(row.headline).toContain('17 relief IP');
    expect(row.detail).toContain('Repeated Arm worked all 3 games (47 pitches)');
    expect(row.detail).toContain('Save Leader worked 2 games (48 pitches; 1.85 season ERA over 63.1 IP)');
    expect(row.detail).toContain('10 ER in that 17-IP span (Sep 4–Sep 6)');
    expect(row.detail).toContain('No team game on Sep 7');
    expect(row.detail).not.toMatch(/unavailable|tired|gassed|running out|I want|bet|xERA/i);
    expect(row.tone).toBe('neutral');
    expect(row.meta.source).toBe(BULLPEN_SOURCE);
    expect(BULLPEN_SOURCE).toBe('BallDontLie final box scores');
    expect(row.meta.source_game_ids).toEqual([106, 105, 104]);
    expect(row.meta.no_game_dates).toEqual(['2026-09-07']);
    expect(row.meta.arms.find(a => a.id === 3)).toMatchObject({ g: 3, b2b: false, last_used: '2026-09-06', pitches: 47 });
    expect(row.meta.arms.find(a => a.id === 5)).toMatchObject({ season_era: 1.85, season_ip: 63.1, season_as_of: '2026-09-06', season_saves: 28 });
    expect(row.meta.arms.find(a => a.id === 3).outings).toHaveLength(3);
    expect(row.meta.evidence).toBe(row.detail);
    expect(row.meta.read).toBe(row.detail);
    expect(row.meta.research_version).toBe(BULLPEN_RESEARCH_VERSION);
    expect(provider.season).toHaveBeenCalledWith(expect.objectContaining({ season: 2026, playerIds: expect.arrayContaining([2, 3, 4, 5, 6]) }));
  });

  it('retains every observed arm, including an outing recording zero outs', async () => {
    for (let id = 7; id <= 14; id++) boxes[106].push({ ...line(id, `Extra ${id}`, 0, 4, 0), game_id: 106 });
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.arms).toHaveLength(13);
    expect(row.meta.arms_used).toBe(13);
    expect(row.meta.arms.find(a => a.id === 7)).toMatchObject({ ip: 0, g: 1, pitches: 4 });
    expect(row.meta.relief_ip).toBe(17);
  });

  it('orders a doubleheader by first pitch and does not label two same-day appearances as two days', async () => {
    schedules = { '2026-09-07': [final('2026-09-07', 104, '2026-09-07T17:10:00.000Z'), final('2026-09-07', 105, '2026-09-07T23:10:00.000Z')],
      '2026-09-06': [final('2026-09-06', 106)] };
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.source_game_ids).toEqual([105, 104, 106]);
    expect(row.meta.arms.find(a => a.id === 3)).toMatchObject({ g: 3, b2b: true });
    expect(row.meta.arms.find(a => a.id === 2).b2b).toBe(false);
    expect(row.meta.no_game_dates).toEqual([]);
  });

  it('does not call a date with a postponed or unfinished scheduled game an off day', async () => {
    schedules['2026-09-07'] = [final('2026-09-07', 107, undefined, 'STATUS_POSTPONED')];
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.no_game_dates).toEqual([]);
    expect(row.detail).not.toContain('No team game');
  });

  it('keeps a team unknown when a listed game carries no id or first pitch', async () => {
    schedules['2026-09-07'] = [{ ...final('2026-09-07', 107), id: null }];
    expect(await computeBullpenFatigue(context)).toEqual([]);
  });

  it('labels the dated window without asserting it includes an earlier same-day doubleheader game', async () => {
    const [row] = await computeBullpenFatigue({ ...context, games: [{ ...game, game_number: 2 }] });
    expect(row.headline).toBe('Fixture Club pen: 17 relief IP across 3 games');
    expect(row.detail).toContain('Sep 4–Sep 6');
    expect(row.headline).not.toContain('last');
  });

  it('keeps missing pitches and earned runs unknown while retaining verified innings', async () => {
    delete boxes[105].find(l => l.player.id === 3).pitch_count;
    delete boxes[105].find(l => l.player.id === 5).er;
    seasons = seasons.filter(s => s.player.id !== 5);
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
    seasons.find(s => s.player.id === 5).pitching_era = era;
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.arms.find(a => a.id === 5).season_era).toBeUndefined();
  });

  it('omits season lines once the team has started playing today, so a season total cannot outrun its observation date', async () => {
    const [row] = await computeBullpenFatigue({ ...context, games: [{ ...game, status: 'STATUS_IN_PROGRESS' }] });
    expect(row.meta.arms.find(a => a.id === 5).season_era).toBeUndefined();
    expect(row.detail).not.toContain('season ERA');
    expect(provider.season).not.toHaveBeenCalled();
  });

  it('does not coerce boolean workload counts to reported zero', async () => {
    const arm = boxes[106].find(l => l.player.id === 3);
    arm.pitch_count = false; arm.er = false;
    const [row] = await computeBullpenFatigue(context);
    expect(row.meta.relief_pitches).toBeNull();
    expect(row.meta.relief_er).toBeNull();
  });

  it.each(['missing_outs', 'ip_disagrees', 'wrong_team', 'duplicate_pitcher', 'no_starter', 'two_starters'])('rejects %s box evidence rather than undercounting the workload', async kind => {
    const lines = boxes[105];
    if (kind === 'missing_outs') delete lines.find(l => l.player.id === 3).pitching_outs;
    if (kind === 'ip_disagrees') lines.find(l => l.player.id === 3).ip = '1.2';
    if (kind === 'wrong_team') lines.forEach(l => { l.team = { id: 999 }; });
    if (kind === 'duplicate_pitcher') lines.push({ ...lines.find(l => l.player.id === 3) });
    if (kind === 'no_starter') lines.find(l => l.games_started === 1).games_started = 0;
    if (kind === 'two_starters') lines.find(l => l.player.id === 5).games_started = 1;
    expect(await computeBullpenFatigue(context)).toEqual([]);
  });

  it('fails closed on a missing schedule or final box instead of inventing an off day or zero relief', async () => {
    provider.games.mockRejectedValueOnce(new Error('fixture outage'));
    expect(await computeBullpenFatigue(context)).toEqual([]);
    provider.games.mockImplementation(async date => schedules[date] || []);
    provider.stats.mockRejectedValueOnce(new Error('fixture outage'));
    expect(await computeBullpenFatigue(context)).toEqual([]);
    expect(provider.games).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ throwOnError: true }));
  });

  it('only replaces same-team, same-game legacy prose on the current date', () => {
    const fresh = { category: 'bullpen_fatigue', date: '2026-09-08', result: null, team_id: 99, game_id: 700,
      headline: 'Fixture Club pen: 17 relief IP across 3 games', meta: { research_version: BULLPEN_RESEARCH_VERSION } };
    const stored = { ...fresh, headline: 'Old prose', meta: {} };
    expect(shouldUpgradeBullpenEvidence(stored, fresh, '2026-09-08')).toBe(true);
    expect(shouldUpgradeBullpenEvidence({ ...stored, game_id: 701 }, fresh, '2026-09-08')).toBe(false);
    expect(shouldUpgradeBullpenEvidence({ ...stored, result: 'HIT' }, fresh, '2026-09-08')).toBe(false);
  });
});
