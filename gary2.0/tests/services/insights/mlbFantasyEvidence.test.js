import { describe, expect, it, vi } from 'vitest';
import { buildMlbFantasyEvidence, buildMlbFantasyRecent, normalizeMlbFantasyLineup, normalizeMlbFantasyStatusSnapshots } from '../../../src/services/insights/mlbFantasyEvidence.js';

const date = '2026-09-07';
const now = new Date('2026-09-07T12:00:00.123Z');
const home = { id: 1, abbreviation: 'BAL', display_name: 'Baltimore Orioles' };
const away = { id: 2, abbreviation: 'BOS', display_name: 'Boston Red Sox' };
const game = (id = 100, at = '2026-09-07T23:00:00Z', extras = {}) => ({ id, date: at, status: 'STATUS_SCHEDULED', season_type: 'regular', home_team: home, away_team: away, ...extras });
const sheet = (base, order = [1, 2, 3, 4, 5, 6, 7, 8, 9]) => ({
  batters: order.map((slot, i) => ({ playerId: base + i, name: `Player ${base + i}`, battingOrder: slot, position: 'OF', batsThrows: 'Left/Right' })),
  pitcher: { playerId: base + 10, name: `Pitcher ${base + 10}`, position: 'SP', batsThrows: 'R/R' },
});
const sheets = () => ({ BAL: sheet(10), BOS: sheet(30) });
const indexed = (at, extras = {}) => ({ date: at, status: 'STATUS_FINAL', seasonType: 'regular', homeId: 1, awayId: 2, ...extras });
const stat = (pid, gid, extra = {}) => ({ player: { id: pid }, team: { id: 1 }, game_id: gid, at_bats: 4, plate_appearances: 4, runs: 1, hits: 1, hr: 0, rbi: 0, bb: 0, k: 1, stolen_bases: null, ...extra });

function fixture(games = [game()]) {
  const previous = sheets();
  previous.BAL.batters[0].battingOrder = 8;
  previous.BAL.batters[7].battingOrder = 1;
  const gameIndex = new Map([[50, indexed('2026-09-06T23:00:00Z')], [49, indexed('2026-09-05T23:00:00Z')]]);
  const bdl = {
    getMlbSeasonGameIndex: vi.fn(async () => gameIndex),
    getMlbLineups: vi.fn(async gid => String(gid) === '50' ? previous : sheets()),
    getMlbGameStats: vi.fn(async () => [stat(10, 50), stat(10, 49)]),
    getMlbPlayerSeasonStats: vi.fn(async ({ playerIds }) => playerIds.map(pid => ({ player: { id: Number(pid) }, season: 2026, season_type: 'regular', batting_gp: 120, batting_ab: 400, batting_hr: 9, batting_ops: 0.75 }))),
    getMlbPlayersByIds: vi.fn(async ids => Object.fromEntries(ids.map(pid => [pid, { name: Number(pid) === 20 || Number(pid) === 40 ? `Pitcher ${pid}` : `Player ${pid}`, teamId: Number(pid) >= 30 ? 2 : 1 }]))),
    getMlbPlayerSplits: vi.fn(async () => null),
  };
  const official = (gid, day, extras = {}) => ({ gamePk: gid, officialDate: day, gameDate: `${day}T23:00:00Z`, status: { abstractGameState: 'Preview' }, gameType: 'R', teams: { home: { team: { id: 110, name: 'Baltimore Orioles' }, probablePitcher: { id: 777, fullName: 'Pitcher 20' } }, away: { team: { id: 111, name: 'Boston Red Sox' } } }, ...extras });
  const sources = {
    getMlbSchedule: vi.fn(async day => day === date ? [official(900, day)] : day === '2026-09-12' ? [official(901, day)] : []),
    getBatterXStats: vi.fn(async () => [{ player_id: 888, first_name: 'Player', last_name: '10', pa: 420, ba: 0.25, est_ba: 0.27 }]),
    getPitcherXStats: vi.fn(async () => []),
  };
  return { ctx: { date, season: 2026, games, bdl }, options: { now, sources }, bdl, sources, gameIndex };
}

describe('MLB fantasy lineup facts', () => {
  it('reads the actual BDL battingOrder field and keeps a probable pitcher distinct from a confirmed order', () => {
    const result = normalizeMlbFantasyLineup(sheet(10));
    expect(result.status).toBe('confirmed');
    expect(result.batters[0]).toMatchObject({ player_id: '10', order: 1, bats: 'L' });
    expect(result.pitcher).toMatchObject({ player_id: '20', status: 'probable' });
  });

  it('does not confirm a sheet with duplicate slots, invalid orders or conflicting probable pitchers', () => {
    const raw = sheet(10);
    raw.batters[1].battingOrder = 1;
    raw.batters[2].battingOrder = 0;
    raw._pitcherConflict = true;
    const result = normalizeMlbFantasyLineup(raw);
    expect(result.status).toBe('partial');
    expect(result.batters.some(b => ['10', '11', '12'].includes(b.player_id))).toBe(false);
    expect(result.pitcher).toBeNull();
  });
});

describe('MLB fantasy dated game evidence', () => {
  it('excludes live/future/spring/wrong-player/wrong-game-side evidence, and does not turn missing stats into zero', () => {
    const gameIndex = new Map([
      [1, indexed('2026-09-06T23:00:00Z')], [2, indexed('2026-09-05T23:00:00Z')],
      [3, indexed('2026-09-08T23:00:00Z')], [4, indexed('2026-09-04T23:00:00Z', { status: 'STATUS_IN_PROGRESS' })],
      [5, indexed('2026-09-03T23:00:00Z', { seasonType: 'spring_training' })], [6, indexed('2026-09-02T23:00:00Z')],
    ]);
    const rows = [stat(10, 2), stat(10, 1), stat(10, 1), stat(10, 3), stat(10, 4), stat(10, 5), stat(11, 1), stat(10, 6, { team: { id: 99 } })];
    const result = buildMlbFantasyRecent({ rows, gameIndex, player_id: '10', date, role: 'hitter' });
    expect(result.rows.map(r => r.game_id)).toEqual(['1', '2']);
    expect(result.totals.hits).toBe(2);
    expect(result.totals.stolen_bases).toBeUndefined();
    expect(result.measured_games_by_stat.stolen_bases).toBe(0);
    expect(result.days_since_latest_game).toBe(1);
  });

  it('rejects conflicting duplicate game results and preserves zero-out measured pitching appearances', () => {
    const gameIndex = new Map([[1, indexed('2026-09-06T23:00:00Z')], [2, indexed('2026-09-05T23:00:00Z')]]);
    const rows = [stat(20, 1, { ip: '0.0', games_started: 1, pitch_count: 12, er: 3, p_k: 0 }), stat(20, 2, { ip: '5.2', p_k: 5 }), stat(20, 2, { ip: '5.2', p_k: 6 })];
    const result = buildMlbFantasyRecent({ rows, gameIndex, player_id: '20', date, role: 'pitcher' });
    expect(result.sample_games).toBe(1);
    expect(result.rows[0]).toMatchObject({ pitching_outs: 0, er: 3, pitch_count: 12 });
    expect(result.totals.innings_pitched).toBe('0.0');
    expect(result.totals.era).toBeUndefined();
    expect(result.totals.k_per_9).toBeUndefined();
    expect(result.excluded_conflicting_games).toBe(1);
  });

  it('retains a measured pitching appearance with unavailable innings without recording zero outs', () => {
    const gameIndex = new Map([[1, indexed('2026-09-06T23:00:00Z')]]);
    const result = buildMlbFantasyRecent({ rows: [stat(20, 1, { ip: null, pitching_outs: null, pitch_count: 15, p_k: 1 })], gameIndex, player_id: '20', date, role: 'pitcher' });
    expect(result.sample_games).toBe(1);
    expect(result.totals.pitch_count).toBe(15);
    expect(result.totals.pitching_outs).toBeUndefined();
    expect(result.totals.innings_pitched).toBeUndefined();
    expect(result.totals.whip).toBeUndefined();
  });

  it('derives innings and pitching rates from complete measured outs, never decimal-IP arithmetic', () => {
    const gameIndex = new Map([[1, indexed('2026-09-06T23:00:00Z')], [2, indexed('2026-09-05T23:00:00Z')]]);
    const rows = [stat(20, 1, { ip: '5.2', er: 3, p_hits: 5, p_bb: 2, p_k: 6 }), stat(20, 2, { ip: '6.2', er: 1, p_hits: 4, p_bb: 1, p_k: 7 })];
    const result = buildMlbFantasyRecent({ rows, gameIndex, player_id: '20', date, role: 'pitcher' });
    expect(result.totals).toMatchObject({ pitching_outs: 37, innings_pitched: '12.1', era: 2.92, whip: 0.97, k_per_9: 9.49 });
    delete rows[0].p_hits;
    expect(buildMlbFantasyRecent({ rows, gameIndex, player_id: '20', date, role: 'pitcher' }).totals.whip).toBeUndefined();
  });
});

describe('MLB fantasy published status snapshots', () => {
  const report = (extras = {}) => ({ player_id: '20', player_name: 'Pitcher 20', status: '60-Day-IL', injury: 'forearm', source: 'Gary return_watch (stored report)', date, created_at: '2026-09-07T10:00:00.000Z', updated_at: '2026-09-07T10:05:24.283444+00:00', ...extras });

  it('preserves source text and timestamps verbatim without mutating input or discarding conflicting reports', () => {
    const first = Object.freeze(report()), second = Object.freeze(report({ status: 'Day-To-Day', injury: null }));
    const normalized = normalizeMlbFantasyStatusSnapshots(Object.freeze([first, first, second]), { date });
    expect(normalized.rows).toEqual([first, second]);
    expect(normalized.excluded_rows).toBe(1);
    expect(normalized.rows[0]).not.toBe(first);
  });

  it('rejects missing status, undated reports and future source dates; never joins by a name', () => {
    const rows = [report({ status: ' ' }), report({ player_id: null }), report({ date: '2026-02-30' }), report({ date: '2026-09-08' }), report({ updated_at: '2026-09-08T12:00:00Z' }), report({ source: '' })];
    expect(normalizeMlbFantasyStatusSnapshots(rows, { date })).toEqual({ rows: [], excluded_rows: rows.length });
    expect(normalizeMlbFantasyStatusSnapshots(undefined, { date })).toEqual({ rows: [], excluded_rows: 0 });
  });

  it('attaches only exact-ID status facts beside the probable listing and preserves their source time', async () => {
    const f = fixture();
    const raw = report();
    f.ctx.statusSnapshots = [raw, report({ player_id: '999', player_name: 'Player 10' })];
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    const pitcher = result.candidates.find(c => c.id === 'bdl:20');
    const status = pitcher.evidence.find(e => e.id === 'published_status_1');
    expect(status.facts).toEqual(raw);
    expect(status.observed_at).toBe('2026-09-07T10:05:24.283Z');
    expect(status.observed_at).not.toBe(result.as_of);
    expect(status.summary).toContain('60-Day-IL; reported issue: forearm');
    expect(pitcher.limitations).toContain('Published status and current probable listing may disagree; availability is unconfirmed.');
    expect(pitcher.context.opportunities[0].starting_pitcher_status).toBe('probable');
    expect(result.candidates.find(c => c.id === 'bdl:10').evidence.some(e => e.id.startsWith('published_status_'))).toBe(false);
    expect(result.coverage).toMatchObject({ complete: true, status_rows_usable: 2, status_rows_attached: 1 });
    expect(result.coverage.status_coverage).toContain('Missing reports do not establish clearance');
  });

  it('uses a creation timestamp only as creation time and leaves undated update time unknown', async () => {
    const f = fixture();
    f.ctx.statusSnapshots = [report({ updated_at: null }), report({ created_at: null, updated_at: null, status: 'Listed unavailable' })];
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    const evidence = result.candidates.find(c => c.id === 'bdl:20').evidence.filter(e => e.id.startsWith('published_status_'));
    expect(evidence[0].observed_at).toBe('2026-09-07T10:00:00.000Z');
    expect(evidence[0].summary).toContain('Report created');
    expect(evidence[1].observed_at).toBeNull();
    expect(evidence[1].summary).toContain('Report update time unavailable');
  });
});

describe('MLB fantasy evidence collection', () => {
  it('connects a measured lineup change, dated sample, category stats and two official probable dates without assigning a verdict', async () => {
    const f = fixture();
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    const hitter = result.candidates.find(c => c.id === 'bdl:10');
    expect(result.as_of).toBe(now.toISOString());
    expect(result.coverage.complete).toBe(true);
    expect(hitter.context.opportunities[0]).toMatchObject({ batting_order: 1, prior_lineup: { batting_order: 8, date: '2026-09-06' } });
    expect(hitter.context.lineup_changed).toBe(true);
    expect(hitter.evidence.find(e => e.id === 'recent_hitter').facts).toMatchObject({ sample_games: 2, days_since_latest_game: 1 });
    expect(hitter.evidence.find(e => e.id === 'expected_hitter').facts).toMatchObject({ mlbam_player_id: '888', sample_pa: 420 });
    expect(hitter.context.league_available).toBeNull();
    expect(hitter).not.toHaveProperty('tier');
    expect(hitter).not.toHaveProperty('action');
    expect(hitter.evidence.every(e => e.summary && e.observed_at === now.toISOString())).toBe(true);
    const pitcher = result.candidates.find(c => c.id === 'bdl:20');
    const scheduled = pitcher.evidence.find(e => e.id === 'upcoming_schedule').facts;
    expect(scheduled.games.filter(g => g.player_listed_probable)).toHaveLength(2);
    expect(scheduled.rotation_projection_used).toBe(false);
    expect(scheduled.games.every(g => g.probable_pitcher.status === 'probable')).toBe(true);
    expect(f.bdl.getMlbLineups).toHaveBeenCalledWith('100', { throwOnError: true });
    expect(f.bdl.getMlbGameStats.mock.calls[0][0]).toMatchObject({ throwOnError: true, gameIds: ['50', '49'] });
  });

  it('keeps both doubleheader opportunities, while excluding already started or postponed games', async () => {
    const f = fixture([game(100, '2026-09-07T17:00:00Z'), game(101), game(102, '2026-09-07T11:00:00Z'), game(103, undefined, { status: 'STATUS_POSTPONED' })]);
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    const hitter = result.candidates.find(c => c.id === 'bdl:10');
    expect(hitter.context.opportunities.map(o => o.game_id)).toEqual(['100', '101']);
    expect(result.candidates.filter(c => c.id === 'bdl:10')).toHaveLength(1);
    expect(result.coverage.excluded_games).toBe(2);
  });

  it('labels last-game fallback as unconfirmed today and refuses conflicting current team identity', async () => {
    const f = fixture();
    f.bdl.getMlbLineups.mockImplementation(async gid => String(gid) === '50' ? sheets() : null);
    f.bdl.getMlbPlayersByIds.mockImplementation(async ids => Object.fromEntries(ids.map(pid => [pid, { teamId: pid === '10' ? 99 : Number(pid) >= 30 ? 2 : 1 }])));
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.candidates.find(c => c.id === 'bdl:10')).toBeUndefined();
    const hitter = result.candidates.find(c => c.id === 'bdl:11');
    expect(hitter.context.opportunities[0]).toMatchObject({ lineup_status: 'not_posted', batting_order: null, prior_lineup: { batting_order: 2 } });
    expect(hitter.limitations.join(' ')).toContain('does not confirm');
    expect(result.coverage.complete).toBe(true);
  });

  it('never attaches surname-only Savant or another player season data, and rejects ambiguous exact-name Savant rows', async () => {
    const f = fixture();
    f.bdl.getMlbPlayerSeasonStats.mockResolvedValue([{ player: { id: 999 }, season: 2026, batting_ops: 1.5 }]);
    f.sources.getBatterXStats.mockResolvedValue([{ player_id: 888, first_name: 'Other', last_name: '10', pa: 500 }]);
    let result = await buildMlbFantasyEvidence(f.ctx, f.options);
    let hitter = result.candidates.find(c => c.id === 'bdl:10');
    expect(hitter.evidence.some(e => e.id === 'season' || e.id === 'expected_hitter')).toBe(false);
    f.sources.getBatterXStats.mockResolvedValue([{ player_id: 888, first_name: 'Player', last_name: '10', pa: 400 }, { player_id: 889, first_name: 'Player', last_name: '10', pa: 500 }]);
    result = await buildMlbFantasyEvidence(f.ctx, f.options);
    hitter = result.candidates.find(c => c.id === 'bdl:10');
    expect(hitter.evidence.some(e => e.id === 'expected_hitter')).toBe(false);
  });

  it('does not call postponed official schedule entries upcoming starts even when abstract state is Preview', async () => {
    const f = fixture();
    f.sources.getMlbSchedule.mockResolvedValue([{
      gamePk: 990, officialDate: '2026-09-12', gameDate: '2026-09-12T23:00:00Z', gameType: 'R',
      status: { abstractGameState: 'Preview', detailedState: 'Postponed' },
      teams: { home: { team: { name: 'Baltimore Orioles' }, probablePitcher: { id: 777, fullName: 'Pitcher 20' } }, away: { team: { name: 'Boston Red Sox' } } },
    }]);
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.candidates.find(c => c.id === 'bdl:20').evidence.some(e => e.id === 'upcoming_schedule')).toBe(false);
  });

  it('rounds presentation rates while preserving raw facts and an unconfirmed opener/bulk workload', async () => {
    const f = fixture();
    f.bdl.getMlbPlayerSeasonStats.mockImplementation(async ({ playerIds }) => playerIds.map(pid => ({
      player: { id: Number(pid) }, season: 2026,
      ...(pid === '40' ? { pitching_gs: 0, pitching_ip: 4.2, pitching_era: 1.9285714, pitching_k_per_9: 5.7857146, pitching_whip: 1.1428571 } : { batting_gp: 10, batting_ops: 0.7654321 }),
    })));
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    const hitter = result.candidates.find(c => c.id === 'bdl:10');
    const opponent = hitter.evidence.find(e => e.id === 'opponent_pitchers');
    expect(opponent.facts.pitchers[0]).toMatchObject({ season_stats: { pitching_era: 1.9285714, pitching_gs: 0 }, planned_innings: null, opener_or_bulk_role: 'unconfirmed' });
    expect(opponent.summary).toContain('1.93 ERA');
    expect(opponent.summary).toContain('5.79 K/9');
    expect(opponent.summary).toContain('0 starts');
    expect(hitter.evidence.find(e => e.id === 'season').summary).toContain('0.765 OPS');
  });

  it('connects a pitcher to the exact posted opposing nine with complete-only season samples in one batch', async () => {
    const f = fixture();
    f.bdl.getMlbPlayerSeasonStats.mockImplementation(async ({ playerIds }) => playerIds.map(pid => ({
      player: { id: Number(pid) }, season: 2026, batting_gp: 100, batting_ab: 300, batting_so: 75, batting_hr: 10, batting_ops: 0.74,
    })));
    const result = await buildMlbFantasyEvidence(f.ctx, { ...f.options, maxCandidates: 2 });
    const pitcher = result.candidates.find(c => c.id === 'bdl:20');
    const evidence = pitcher.evidence.find(e => e.id === 'opponent_order_100');
    expect(evidence.facts).toMatchObject({ opponent_team_id: '2', lineup_date: date, lineup_source: 'today', confirmed_for_today: true, totals: { at_bats: 2700, strikeouts: 675, plate_appearances: null }, plate_appearances_derived_from_at_bats: false });
    expect(evidence.facts.rows.map(r => r.player_id)).toEqual(['30', '31', '32', '33', '34', '35', '36', '37', '38']);
    expect(evidence.facts.rows[0]).toMatchObject({ batting_order: 1, bats: 'L', season_games: 100, current_team_status: 'same_team' });
    expect(f.bdl.getMlbPlayerSeasonStats).toHaveBeenCalledTimes(1);
    expect(f.bdl.getMlbPlayerSeasonStats.mock.calls[0][0].playerIds).toEqual(expect.arrayContaining(['38']));
    expect(evidence.summary).toContain('PA unavailable');
  });

  it('never turns yesterday\'s order into today\'s confirmed lineup, or sums incomplete/transacted samples', async () => {
    const f = fixture();
    f.bdl.getMlbLineups.mockImplementation(async gid => String(gid) === '50' ? sheets() : { BAL: sheet(10) });
    f.bdl.getMlbPlayerSeasonStats.mockImplementation(async ({ playerIds }) => playerIds.map(pid => ({ player: { id: Number(pid) }, season: 2026, batting_ab: 300, batting_so: pid === '38' ? null : 75 })));
    let result = await buildMlbFantasyEvidence(f.ctx, { ...f.options, maxCandidates: 2 });
    let facts = result.candidates.find(c => c.id === 'bdl:20').evidence.find(e => e.id === 'opponent_order_100').facts;
    expect(facts).toMatchObject({ lineup_source: 'prior_completed_game', lineup_date: '2026-09-06', lineup_game_id: '50', confirmed_for_today: false, totals: { at_bats: 2700, strikeouts: null } });
    f.bdl.getMlbPlayersByIds.mockImplementation(async ids => Object.fromEntries(ids.map(pid => [pid, { teamId: pid === '38' ? 99 : Number(pid) >= 30 ? 2 : 1 }])));
    result = await buildMlbFantasyEvidence(f.ctx, { ...f.options, maxCandidates: 2 });
    facts = result.candidates.find(c => c.id === 'bdl:20').evidence.find(e => e.id === 'opponent_order_100').facts;
    expect(facts.totals.at_bats).toBeNull();
    expect(facts.rows.find(r => r.player_id === '38')).toMatchObject({ current_team_status: 'team_changed_or_conflicting', at_bats: null });
  });

  it('matches only the explicit OAK-to-Athletics franchise identity', async () => {
    const athletics = { id: 1, abbreviation: 'OAK', display_name: 'Oakland Athletics' };
    const f = fixture([game(100, undefined, { home_team: athletics })]);
    f.bdl.getMlbLineups.mockResolvedValue({ OAK: sheet(10), BOS: sheet(30) });
    f.sources.getMlbSchedule.mockImplementation(async day => day === date ? [{ gamePk: 900, officialDate: date, gameDate: '2026-09-07T23:00:00Z', gameType: 'R', status: { abstractGameState: 'Preview' }, teams: { home: { team: { id: 133, name: 'Athletics' } }, away: { team: { id: 111, name: 'Boston Red Sox' } } } }] : []);
    let result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.candidates.find(c => c.team === 'OAK').evidence.some(e => e.id === 'upcoming_schedule')).toBe(true);
    f.sources.getMlbSchedule.mockImplementation(async () => [{ gamePk: 900, officialDate: date, gameDate: '2026-09-07T23:00:00Z', gameType: 'R', status: { abstractGameState: 'Preview' }, teams: { home: { team: { id: 999, name: 'Athletics' } }, away: { team: { id: 111, name: 'Boston Red Sox' } } } }]);
    result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.candidates.find(c => c.team === 'OAK').evidence.some(e => e.id === 'upcoming_schedule')).toBe(false);
  });

  it('marks mandatory collection failure incomplete but tolerates unavailable optional measurements', async () => {
    const f = fixture();
    f.sources.getBatterXStats.mockRejectedValue(new Error('unavailable'));
    f.bdl.getMlbPlayerSplits.mockRejectedValue(new Error('unavailable'));
    let result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.sources_failed.length).toBeGreaterThan(0);
    f.bdl.getMlbGameStats.mockRejectedValue(new Error('second page failed'));
    result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.mandatory_requests_failed).toBe(1);
    expect(result.candidates.every(c => c.evidence.filter(e => e.id.startsWith('recent_')).every(e => e.facts.sample_games === 0))).toBe(true);
  });

  it('bounds the pool and concurrent provider requests while retaining both role families', async () => {
    const f = fixture();
    let active = 0, high = 0;
    f.bdl.getMlbPlayerSplits.mockImplementation(async () => { active++; high = Math.max(high, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return null; });
    const result = await buildMlbFantasyEvidence(f.ctx, { ...f.options, maxCandidates: 6 });
    expect(result.candidates).toHaveLength(6);
    expect(result.candidates[0].id).toBe('bdl:10');
    expect(new Set(result.candidates.map(c => c.role))).toEqual(new Set(['hitter', 'pitcher']));
    expect(high).toBe(3);
    expect(result.coverage.candidates_available).toBe(20);
  });

  it('accepts a successful empty slate without making any provider requests', async () => {
    const f = fixture([]);
    const result = await buildMlbFantasyEvidence(f.ctx, f.options);
    expect(result.candidates).toEqual([]);
    expect(result.coverage).toMatchObject({ complete: true, requests_attempted: 0 });
    await expect(buildMlbFantasyEvidence({ ...f.ctx, date: '2026-02-30' }, f.options)).rejects.toThrow('valid');
  });
});
