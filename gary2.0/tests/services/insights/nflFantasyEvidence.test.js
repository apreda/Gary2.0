import { describe, expect, it, vi } from 'vitest';
import { buildNflFantasyEvidence, buildNflFantasyRecent, resolveNflFantasyWeek, selectNflFantasyCandidates } from '../../../src/services/insights/nflFantasyEvidence.js';
import { NFL_FANTASY_STAT_FIELDS } from '../../../src/services/insights/nflFantasyProvider.js';
import { buildFantasyPrompt, validateFantasyDecisions } from '../../../src/services/insights/fantasyDecision.js';

const date = '2026-09-07', asOf = '2026-09-07T18:00:00.000Z';
const team = id => ({ id, abbreviation: `T${id}` });
const game = (id = 101, at = '2026-09-10T00:20:00Z', extra = {}) => ({ id, date: at, season: 2026, week: 1,
  status: '9/9 - 8:20 PM', season_type: 2, postseason: false, home_team: team(1), visitor_team: team(2), ...extra });
const person = (id, pos, tid, experience = '4th Season') => ({ id, first_name: 'Fixture', last_name: `Player ${id}`, position_abbreviation: pos, experience, team: team(tid) });
const stats = (pid, gid, at, extra = {}) => ({ player: { id: pid }, team: team(1), season: 2025,
  game: game(gid, at, { season: 2025, week: 18, status: 'Final' }),
  ...Object.fromEntries(NFL_FANTASY_STAT_FIELDS.map(field => [field, field.endsWith('yards') ? 25 : 2])), ...extra });
const scoring = () => ['standard', 'half_ppr', 'ppr'].map((key, i) => ({ key, season: 2026, name: key, rules: { items: [
  { stat: 'passing_yards', points: 0.04, is_reverse: false, position_points: {} },
  { stat: 'passing_touchdowns', points: 4, is_reverse: false, position_points: {} },
  ...(i ? [{ stat: 'receptions', points: i / 2, is_reverse: false, position_points: {} }] : []),
] } }));

function fixture() {
  const games = [game(), game(102, '2026-09-13T17:00:00Z', { home_team: team(3), visitor_team: team(4) }),
    game(103, '2026-09-14T23:15:00Z', { home_team: team(5), visitor_team: team(6) }),
    game(201, '2026-09-20T17:00:00Z', { week: 2 }), game(301, '2026-09-27T17:00:00Z', { week: 3 })];
  const players = [person(10, 'QB', 1), person(20, 'RB', 2, 'Rookie'), person(30, 'WR', 3), person(40, 'TE', 4)];
  const projections = players.map((player, i) => ({ id: 1000 + i, season: 2026, week: 1, date: null,
    player, team: player.team, position: player.position_abbreviation, game: games[Math.floor(i / 2)],
    collected_at: '2026-09-07T17:30:00Z', projected_games: 1,
    stats: { passing_yards: i ? null : 248.8632, passing_attempts: i ? null : 32.157, receptions: i ? 4.2719 : 0, receiving_yards: i ? 48.261 : null, rushing_attempts: 3.154, rushing_touchdowns: 0.2131 },
    projections: ['standard', 'half_ppr', 'ppr'].map((key, index) => ({ key, total_points: 12.25949 + (i ? 2 * index : 0) })),
  }));
  const ownership = players.map(player => ({ season: 2026, week: null, date: null, player, team: player.team,
    collected_at: '2026-09-07T17:15:00Z', market_updated_at: '2026-09-07T16:30:00Z', percent_rostered: 27.268, percent_started: 15.123, percent_rostered_change: 1.253 }));
  const prior = players.filter(p => p.experience !== 'Rookie').flatMap(p => [
    stats(p.id, 501, '2026-01-04T18:00:00Z', { team: p.team, game: game(501, '2026-01-04T18:00:00Z', { season: 2025, week: 18, status: 'Final', home_team: p.team, visitor_team: team(99) }) }),
    stats(p.id, 502, '2025-12-28T18:00:00Z', { team: p.team, game: game(502, '2025-12-28T18:00:00Z', { season: 2025, week: 17, status: 'Final', home_team: p.team, visitor_team: team(99) }) }),
  ]);
  const provider = {
    schedule: vi.fn(async () => games), ownership: vi.fn(async () => ownership), projections: vi.fn(async () => projections),
    scoringFormats: vi.fn(async () => scoring()), players: vi.fn(async () => players),
    playerStats: vi.fn(async ({ season }) => season === 2025 ? prior : []),
  };
  return { ctx: { date, league: 'nfl', as_of: asOf, provider }, options: { now: new Date(asOf) }, provider, games, players, projections, ownership, prior };
}

describe('NFL Fantasy real scoring week', () => {
  it('resolves a quiet Monday to the real Wednesday opener and complete week, not a Thursday assumption', () => {
    const { games } = fixture();
    const result = resolveNflFantasyWeek(games, { season: 2026, asOf });
    expect(result).toMatchObject({ season: 2026, week: 1, window_start: '2026-09-09', window_end: '2026-09-14' });
    expect(result.games).toHaveLength(3);
  });

  it('retains a live Monday game week and advances only after completion', () => {
    const { games } = fixture();
    games[0].status = 'Final'; games[1].status = 'Final'; games[2].status = '2nd Quarter';
    expect(resolveNflFantasyWeek(games, { season: 2026, asOf: '2026-09-15T01:00:00Z' }).week).toBe(1);
    games[2].status = 'Final';
    expect(resolveNflFantasyWeek(games, { season: 2026, asOf: '2026-09-15T03:30:00Z' }).week).toBe(2);
  });

  it('rejects wrong-season or conflicting schedule identities and never treats unknown kickoff as confirmed', () => {
    expect(() => resolveNflFantasyWeek([game(1, undefined, { season: 2025 })], { season: 2026, asOf })).toThrow(/invalid or wrong-season/);
    expect(() => resolveNflFantasyWeek([game(), game(101, '2026-09-11T00:20:00Z')], { season: 2026, asOf })).toThrow(/conflicts/);
    expect(() => resolveNflFantasyWeek([game(1, null)], { season: 2026, asOf })).toThrow(/invalid/);
    expect(resolveNflFantasyWeek([game(1, undefined, { status: 'Postponed' })], { season: 2026, asOf }).week).toBeNull();
  });

  it('does not let an old stuck live status pin the wrong scoring week and publish an empty board', () => {
    const games = [game(1, '2026-09-01T17:00:00Z', { status: '2nd Quarter' }), game(2, undefined, { week: 2 })];
    expect(() => resolveNflFantasyWeek(games, { season: 2026, asOf })).toThrow(/stale in-progress game/);
  });

  it('uses the previous season for January dates', async () => {
    const f = fixture();
    f.ctx.date = '2027-01-05'; f.ctx.as_of = '2027-01-05T18:00:00Z';
    f.provider.schedule.mockResolvedValue([]);
    await buildNflFantasyEvidence(f.ctx);
    expect(f.provider.schedule).toHaveBeenCalledWith({ season: 2026, signal: undefined });
    expect(f.provider.projections).not.toHaveBeenCalled();
  });
});

describe('NFL Fantasy measured game samples', () => {
  it('filters as-of and competition scope before the last-five limit, retaining old real dates', () => {
    const valid = Array.from({ length: 6 }, (_, i) => stats(10, 500 + i, `2025-12-${String(28 - i).padStart(2, '0')}T18:00:00Z`));
    const invalid = [stats(10, 600, '2026-09-10T18:00:00Z'), stats(10, 601, '2025-12-31T18:00:00Z', { game: game(601, '2025-12-31T18:00:00Z', { season: 2025, status: '4th Quarter' }) }),
      stats(10, 602, '2025-12-30T18:00:00Z', { postseason: true }), stats(10, 603, '2025-12-29T18:00:00Z', { season_type: 1 }), stats(11, 500, valid[0].game.date)];
    const result = buildNflFantasyRecent({ rows: [...invalid, ...valid], playerId: '10', season: 2025, asOf, currentTeamId: '1' });
    expect(result.rows.map(row => row.game_id)).toEqual(['500', '501', '502', '503', '504']);
    expect(result.latest_game_date).toBe('2025-12-28');
    expect(result.days_since_latest_game).toBe(253);
    expect(result.excluded_rows).toBe(4);
    expect(result.sample_games).toBe(5);
  });

  it('keeps missing, malformed and partial measurements unknown; explicit zero remains zero', () => {
    const row = stats(10, 1, '2026-01-04T18:00:00Z', { receiving_targets: null, receptions: '', rushing_attempts: 0, passing_completions: false, rushing_yards: -3, fumbles_lost: 1.2 });
    const result = buildNflFantasyRecent({ rows: [row], playerId: '10', season: 2025, asOf, currentTeamId: '1' });
    expect(result.rows[0]).toMatchObject({ receiving_targets: null, receptions: null, rushing_attempts: 0, passing_completions: null, rushing_yards: -3, fumbles_lost: null });
    expect(result.averages.receiving_targets).toBeNull();
    expect(result.totals.rushing_attempts).toBe(0);
    expect(result.measured_games_by_stat.receiving_targets).toBe(0);
    const missing = stats(10, 2, '2025-12-28T18:00:00Z', Object.fromEntries(NFL_FANTASY_STAT_FIELDS.map(field => [field, null])));
    expect(buildNflFantasyRecent({ rows: [missing], playerId: '10', season: 2025, asOf, currentTeamId: '1' }).sample_games).toBe(0);
  });

  it('excludes conflicting duplicates and wrong game sides, and does not relabel a former team', () => {
    const first = stats(10, 1, '2026-01-04T18:00:00Z');
    const result = buildNflFantasyRecent({ rows: [first, first, { ...first, receptions: 5 },
      stats(10, 2, '2025-12-28T18:00:00Z', { team: team(99) }), stats(10, 3, '2025-12-21T18:00:00Z')],
    playerId: '10', season: 2025, asOf, currentTeamId: '2' });
    expect(result.rows.map(row => row.game_id)).toEqual(['3']);
    expect(result.rows[0].team_id).toBe('1');
    expect(result.same_team_entire_sample).toBe(false);
    expect(result.excluded_conflicting_games).toBe(1);
  });

  it('compares recent usage only with a dated complete same-team sample', () => {
    const rows = [6, 8, 2, 4, 3].map((targets, i) => stats(10, 10 + i, `2025-12-${28 - i}T18:00:00Z`, { receiving_targets: targets }));
    const result = buildNflFantasyRecent({ rows, playerId: '10', season: 2025, asOf, currentTeamId: '1' });
    expect(result.latest_two_vs_preceding_games.find(row => row.stat === 'receiving_targets')).toMatchObject({ latest_games: 2, previous_games: 3, latest_average: 7, previous_average: 3, change: 4 });
    expect(buildNflFantasyRecent({ rows, playerId: '10', season: 2025, asOf, currentTeamId: '2' }).latest_two_vs_preceding_games).toEqual([]);
  });
});

describe('NFL Fantasy evidence collection', () => {
  it('connects dated future games, actual prior-season samples, formats and ownership without assigning a verdict', async () => {
    const f = fixture(), result = await buildNflFantasyEvidence(f.ctx, f.options);
    expect(result).toMatchObject({ date, as_of: asOf, season: 2026, week: 1, valid_until: '2026-09-07T23:30:00.000Z', coverage: { complete: true, candidates_selected: 4, first_season_listings: 1, prior_baseline_players: 3 } });
    const c = result.candidates.find(c => c.player_id === '30');
    expect(c.context.opportunities[0]).toMatchObject({ date: '2026-09-13', week: 1, game_id: '102' });
    expect(c.availability).toEqual({ rostered_percent: 27.3, league_available: null });
    const projection = c.evidence.find(e => e.id === 'weekly_projection');
    expect(projection.facts).toMatchObject({ format_points: { standard: 12.3, half_ppr: 14.3, ppr: 16.3 }, stats: { receptions: 4.3, receiving_yards: 48.3, rushing_touchdowns: 0.21 } });
    expect(projection.facts.formats).toContainEqual({ format: 'half_ppr', projected_points: 14.3, reception_points_per_catch: 0.5, reception_rule_present: true });
    const baseline = c.evidence.find(e => e.id === 'prior_regular_baseline');
    expect(baseline.facts).toMatchObject({ evidence_scope: 'prior_season_baseline', season: 2025, sample_games: 2, latest_game_date: '2026-01-04' });
    expect(baseline.summary).toContain('not current role or current form');
    expect(c.evidence.find(e => e.id === 'current_regular_games').facts).toMatchObject({ season: 2026, sample_games: 0, measurements: [] });
    expect(result.candidates.every(c => c.evidence.every(e => e.summary && e.observed_at === asOf))).toBe(true);
    expect(c).not.toHaveProperty('action'); expect(c).not.toHaveProperty('tier');
    expect(f.provider.playerStats.mock.calls[1][0].playerIds).not.toContain('20');
    expect(result.candidates.find(c => c.player_id === '20').evidence.some(e => e.id === 'prior_regular_baseline')).toBe(false);
  });

  it('honors the current directory rookie listing before requesting a historical baseline', async () => {
    const f = fixture();
    f.projections[1].player = { ...f.players[1], experience: '2nd Season' };
    await buildNflFantasyEvidence(f.ctx);
    expect(f.provider.playerStats.mock.calls[1][0].playerIds).not.toContain('20');
  });

  it.each(['week', 'season', 'team', 'game', 'kickoff', 'formats'])('rejects a %s projection mismatch without exposing it as a candidate', async kind => {
    const f = fixture(), row = f.projections[0];
    if (kind === 'week') row.week = 2;
    if (kind === 'season') row.season = 2025;
    if (kind === 'team') row.team = team(99);
    if (kind === 'game') row.game = { ...row.game, id: 999 };
    if (kind === 'kickoff') row.game = { ...row.game, date: '2026-09-11T00:20:00Z' };
    if (kind === 'formats') row.projections.pop();
    const result = await buildNflFantasyEvidence(f.ctx);
    expect(result.candidates.some(c => c.player_id === '10')).toBe(false);
    expect(result.coverage.excluded_projection_conflicts).toBe(1);
  });

  it('keeps stale ownership unknown rather than zero or personally available', async () => {
    const f = fixture();
    f.ownership[0].market_updated_at = '2026-09-05T18:00:00Z';
    const result = await buildNflFantasyEvidence(f.ctx), c = result.candidates.find(c => c.player_id === '10');
    expect(c.availability).toEqual({ rostered_percent: null, league_available: null });
    expect(c.evidence.find(e => e.id === 'provider_ownership').facts).toMatchObject({ freshness: 'unavailable_or_stale', rostered_percent: null, started_percent: null });
    expect(result.coverage.stale_or_missing_ownership).toBe(1);
  });

  it('bounds the serving deadline by original forecast age and included ownership freshness', async () => {
    const f = fixture();
    f.projections[0].collected_at = '2026-09-07T12:15:00Z';
    expect((await buildNflFantasyEvidence(f.ctx)).valid_until).toBe('2026-09-07T18:15:00.000Z');
    f.ownership[1].market_updated_at = '2026-09-06T18:05:00Z';
    expect((await buildNflFantasyEvidence(f.ctx)).valid_until).toBe('2026-09-07T18:05:00.000Z');
    f.ctx.as_of = '2026-09-07T18:16:00Z';
    const later = await buildNflFantasyEvidence(f.ctx);
    expect(later.candidates.some(c => c.player_id === '10')).toBe(false);
    expect(later.coverage.excluded_stale_projections).toBe(1);
  });

  it('excludes a current identity conflict, while never silently replacing a wholly invalid identity collection', async () => {
    const f = fixture();
    f.provider.players.mockResolvedValue(f.players.map(p => p.id === 10 ? { ...p, team: team(99) } : p));
    const result = await buildNflFantasyEvidence(f.ctx);
    expect(result.candidates.some(c => c.player_id === '10')).toBe(false);
    f.provider.players.mockResolvedValue([]);
    await expect(buildNflFantasyEvidence(f.ctx)).rejects.toThrow(/identities could not be verified/);
  });

  it('preserves the prior briefing on empty forecasts, all stale forecasts, missing scoring rules and mandatory reader failure', async () => {
    let f = fixture(); f.provider.projections.mockResolvedValue([]);
    await expect(buildNflFantasyEvidence(f.ctx)).rejects.toThrow(/previous briefing must be preserved/);
    f = fixture(); f.projections.forEach(row => { row.collected_at = '2026-09-06T18:00:00Z'; });
    await expect(buildNflFantasyEvidence(f.ctx)).rejects.toThrow(/previous briefing must be preserved/);
    f = fixture(); f.provider.scoringFormats.mockResolvedValue(scoring().slice(0, 2));
    await expect(buildNflFantasyEvidence(f.ctx)).rejects.toThrow(/complete standard, half-PPR and PPR/);
    f = fixture(); f.provider.playerStats.mockRejectedValue(new Error('private provider details'));
    await expect(buildNflFantasyEvidence(f.ctx)).rejects.toThrow(/previous briefing must be preserved/);
  });

  it('permits a complete no-upcoming-week schedule without inventing a fantasy slate', async () => {
    const f = fixture(); f.provider.schedule.mockResolvedValue([game(1, '2026-09-06T17:00:00Z', { status: 'Final' })]);
    const result = await buildNflFantasyEvidence(f.ctx);
    expect(result).toMatchObject({ week: null, candidates: [], coverage: { complete: true, state: 'no_upcoming_regular_season_week' } });
    expect(f.provider.projections).not.toHaveBeenCalled();
  });

  it('threads cancellation into every reader and stops before any later phase', async () => {
    const f = fixture(), controller = new AbortController();
    f.provider.schedule.mockImplementation(async ({ signal }) => { expect(signal).toBe(controller.signal); controller.abort(new Error('cancel collection')); return f.games; });
    await expect(buildNflFantasyEvidence(f.ctx, { signal: controller.signal })).rejects.toThrow(/cancel collection/);
    expect(f.provider.projections).not.toHaveBeenCalled();
  });

  it.each([0, 1, 5])('keeps a complete 32-player pool within the writer budget with %i current-season observed games', async currentGames => {
    const f = fixture();
    f.ctx.date = '2026-10-07'; f.ctx.as_of = '2026-10-07T18:00:00Z';
    const players = Array.from({ length: 32 }, (_, i) => person(100 + i, ['QB', 'RB', 'WR', 'TE'][i % 4], i + 1));
    const games = [5, 6, 7].flatMap((week, w) => Array.from({ length: 16 }, (_, i) =>
      game(week * 1000 + i, `2026-10-${11 + w * 7}T17:00:00Z`, { week, home_team: team(i * 2 + 1), visitor_team: team(i * 2 + 2) })));
    const projections = players.map((player, i) => ({ ...structuredClone(f.projections[i % 4]), player, team: player.team,
      position: player.position_abbreviation, game: games[Math.floor(i / 2)], week: 5, collected_at: '2026-10-07T17:30:00Z' }));
    const ownership = players.map(player => ({ ...f.ownership[0], player, team: player.team, collected_at: '2026-10-07T17:30:00Z', market_updated_at: '2026-10-07T17:00:00Z' }));
    f.provider.schedule.mockResolvedValue(games); f.provider.players.mockResolvedValue(players);
    f.provider.projections.mockResolvedValue(projections); f.provider.ownership.mockResolvedValue(ownership);
    f.provider.playerStats.mockImplementation(async ({ season }) => players.flatMap(p => Array.from({ length: season === 2026 ? currentGames : 5 }, (_, i) => {
      const at = season === 2026 ? `2026-09-${28 - i}T18:00:00Z` : `2025-12-${28 - i}T18:00:00Z`;
      return stats(p.id, season * 1000 + i, at, { season, team: p.team,
        game: game(season * 1000 + i, at, { season, status: 'Final', home_team: p.team, visitor_team: team(99) }) });
    })));
    const evidence = await buildNflFantasyEvidence(f.ctx);
    expect(evidence.candidates).toHaveLength(32);
    expect(evidence.coverage.candidates_by_position).toEqual({ QB: 8, RB: 8, WR: 8, TE: 8 });
    expect(Buffer.byteLength(buildFantasyPrompt(evidence))).toBeLessThan(220_000);
    expect(evidence.coverage.prior_baseline_players).toBe(currentGames ? 0 : 32);
    expect(f.provider.playerStats.mock.calls.some(([args]) => args.season === 2025)).toBe(!currentGames);
    for (const c of evidence.candidates) {
      const sample = c.evidence.find(e => e.id === (currentGames ? 'current_regular_games' : 'prior_regular_baseline')).facts;
      expect(sample.rows).toHaveLength(currentGames || 5);
      expect(sample.measurements).toHaveLength(NFL_FANTASY_STAT_FIELDS.length);
    }
  });

  it('accepts rounded NFL measurements through the shared writer validator and expires a lineup call at its kickoff', async () => {
    const f = fixture(), evidence = await buildNflFantasyEvidence(f.ctx);
    const decision = { candidate_id: 'bdl:30', action: 'WATCH', horizon: 'next_game', headline: 'Check the reception role before kickoff',
      why_now: 'The provider projects 4.3 receptions and 16.3 PPR points for the upcoming game.',
      fit: 'Reception scoring managers can compare this role with their other lineup options.',
      risk: 'The old baseline does not establish the current role.', watch_for: 'Check whether the upcoming game shows the projected target role.',
      evidence_ids: ['scheduled_matchup', 'weekly_projection'], formats: ['ppr'], categories: ['receptions'] };
    const [result] = validateFantasyDecisions(JSON.stringify({ decisions: [decision] }), evidence);
    expect(result.valid_until).toBe('2026-09-13T17:00:00.000Z');
    expect(() => validateFantasyDecisions(JSON.stringify({ decisions: [{ ...decision, why_now: 'The provider projects 19.9 receptions.' }] }), evidence)).toThrow(/outside the cited evidence/);
    expect(Buffer.byteLength(buildFantasyPrompt(evidence))).toBeLessThan(220_000);
  });
});

describe('NFL Fantasy candidate discovery coverage', () => {
  it('reserves each football position, rookie and ownership contexts without turning discovery into recommendations', () => {
    const pool = ['QB', 'RB', 'WR', 'TE'].flatMap((position, p) => Array.from({ length: 20 }, (_, i) => ({
      id: `bdl:${p * 100 + i}`, player_id: String(p * 100 + i), team_id: String(p * 100 + i), position,
      experience: i % 4 === 1 ? 'Rookie' : '4th Season', availability: { rostered_percent: i % 4 === 0 ? 20 : 90 },
      _ownership: { started_percent: i % 4 === 2 ? 30 : 90 }, _projection: { format_points: { ppr: 100 - i } },
      context: { opportunities: [{ start_at: '2026-09-13T17:00:00Z' }] },
    })));
    const result = selectNflFantasyCandidates(pool, 32);
    expect(result).toHaveLength(32);
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const group = result.filter(c => c.position === pos);
      expect(group).toHaveLength(8);
      expect(group.some(c => c.experience === 'Rookie')).toBe(true);
      expect(group.some(c => c.availability.rostered_percent < 50)).toBe(true);
    }
    expect(result.every(c => !c.action && !c.tier)).toBe(true);
  });
});
