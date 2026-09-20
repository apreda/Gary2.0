import { describe, expect, it, vi } from 'vitest';
import { nflGameEvidence } from '../../src/services/nflGameEvidence.js';
import { formatFootballEvidence } from '../../src/services/footballEvidenceBundle.js';

const home = { id: 6, full_name: 'Chicago Bears' };
const away = { id: 20, full_name: 'Minnesota Vikings' };
const unavailable = { unavailable: true, reason: 'No current charting published.' };
function unit(epa) {
  return { overall: { plays: 60, epa_per_play: epa, success_rate: 0.5, yards_per_play: 5, explosive_rate: 0 },
    splits: { early_down: { plays: 40, epa_per_play: epa, success_rate: 0.55 },
      red_zone: { plays: 4, epa_per_play: null, success_rate: 0 } },
    dropbacks: 30, sacks: 0, sack_rate: 0, qb_hits: 3, qb_hit_rate: 0.1,
    pass_rate_over_expected: -2, shotgun_rate: 0.5, no_huddle_rate: 0.1, turnovers: 0 };
}
function ledger(season, { games = 1, postseason = 0, epa = 0.2, codes = ['CHI', 'MIN'] } = {}) {
  const entry = { offense: unit(epa), defense: unit(-epa) };
  return { season, generated_at: `${season}-09-19T12:00:00Z`,
    teams: Object.fromEntries(codes.map(code => [code, structuredClone(entry)])),
    games: Array.from({ length: games + postseason }, (_, i) => ({
      game_id: `${season}_${i + 1}_CHI_MIN`, week: i + 1, season_type: i < games ? 'REG' : 'POST',
      lines: Object.fromEntries(codes.map(code => [code, {}])),
    })) };
}
function sources(current = ledger(2026), prior = ledger(2025, { games: 17, postseason: 3, epa: -0.4 })) {
  return {
    getPlayLedger: vi.fn(async season => season === 2026 ? current : prior),
    fetchNflTeamBaseline: vi.fn(async () => ({ season: 2026, scope: 'current_regular_season',
      label: '2026 current regular season', currentRegularGamesPlayed: 1,
      stats: { games_played: 1, total_points_per_game: 24, opp_total_points_per_game: 17,
        misc_total_takeaways: 0, opp_passing_qb_rating: null } })),
    getQbPressureProfile: vi.fn(async () => unavailable),
    getPassRushAndCoverage: vi.fn(async () => unavailable),
    getSnapShare: vi.fn(async team => ({ team, week: 1, opponent: team === home.full_name ? 'MIN' : 'CHI',
      offense: [`${team} receiver WR 75%`], defense: [`${team} defender CB 90%`] })),
  };
}
const run = loaders => nflGameEvidence({ home, away, season: 2026, loaders });

describe('guaranteed measured NFL game evidence', () => {
  it('renders offense and defense for both teams with separate current and prior samples', async () => {
    const loaders = sources();
    const evidence = await run(loaders);
    for (const [side, team] of [['home', home], ['away', away]]) {
      const data = evidence[side];
      expect(data.team).toBe(team.full_name);
      expect(data.team_id).toBe(team.id);
      const current = data.current_season.play_by_play;
      const prior = data.prior_season_background.play_by_play;
      expect(current).toMatchObject({ season: 2026, sample: { games: 1, phases: { regular_season: 1, postseason: 0 } },
        offense: { overall: { epa_per_play: 0.2 } }, defense: { overall: { epa_per_play: -0.2 } } });
      expect(prior).toMatchObject({ season: 2025, sample: { games: 20, phases: { regular_season: 17, postseason: 3 } },
        offense: { overall: { epa_per_play: -0.4 } }, defense: { overall: { epa_per_play: 0.4 } } });
      expect(current.offense.early_down.plays).toBe(40);
      expect(current.defense.red_zone.reliability).toContain('Only 4 snaps');
      expect(current.sample_note).toContain('Only 1 game');
      expect(current.sample.game_ids).toEqual(['2026_1_CHI_MIN']);
      expect(prior.sample.game_ids).toHaveLength(20);
    }
    expect(loaders.getPlayLedger).toHaveBeenCalledTimes(2);
    const text = formatFootballEvidence({ NFL_GAME_EVIDENCE: evidence });
    for (const textPart of ['OFFENSE AND DEFENSE', 'current_season', 'prior_season_background', '2025', 'Chicago Bears', 'Minnesota Vikings']) {
      expect(text).toContain(textPart);
    }
  });
  it('retains measured zero, null charting and distinct denominators without inventing pressure rates', async () => {
    const loaders = sources();
    loaders.getQbPressureProfile.mockResolvedValue({ season: 2026,
      quarterbacks: [{ player: 'Named QB', pass_attempts: 24, pressure_pct: null, times_hit: 0 }] });
    loaders.getPassRushAndCoverage.mockResolvedValue({ season: 2026,
      pass_rush: [{ player: 'Named defender', games: 1, pressures: 3, sacks: 0, hurries: null }],
      coverage: [{ player: 'Named corner', targets: 20, passer_rating_allowed: 65 }] });
    const evidence = await run(loaders);
    const current = evidence.home.current_season;
    expect(current.play_by_play.offense.pass_protection_or_rush).toMatchObject({ dropbacks: 30, sacks: 0, sack_rate: 0, qb_hit_rate: 0.1 });
    expect(current.play_by_play.offense.red_zone).toMatchObject({ epa_per_play: null, success_rate: 0 });
    expect(current.team_aggregates.defense).toMatchObject({ misc_total_takeaways: 0, opp_passing_qb_rating: null });
    expect(current.quarterback_charting.quarterbacks[0]).toMatchObject({ pass_attempts: 24, pressure_pct: null, times_hit: 0 });
    expect(current.defender_charting.pass_rush[0]).toMatchObject({ player: 'Named defender', games: 1, sacks: 0, hurries: null });
    expect(evidence.reading_note).toContain('distinct from charted pressure');
    expect(current.quarterback_charting.season_phase).toContain('Not supplied');
  });
  it('delivers current snap participation with season, week, opponent and selection limits', async () => {
    const evidence = await run(sources());
    expect(evidence.home.current_season.snap_participation).toMatchObject({ season: 2026, week: 1, opponent: 'MIN',
      offense: ['Chicago Bears receiver WR 75%'], defense: ['Chicago Bears defender CB 90%'] });
    expect(evidence.away.current_season.snap_participation.opponent).toBe('CHI');
    expect(evidence.home.current_season.snap_participation.sample).toContain('at least 25%');
    expect(evidence.home.current_season.snap_participation.note).toContain('not a game-day availability');
    expect(evidence.home.current_season.quarterback_charting).toMatchObject({ unavailable: true, season: 2026 });
    expect(evidence.home.current_season.defender_charting).not.toHaveProperty('pass_rush');
  });
  it('does not erase one team’s current evidence when the other has no ledger entry', async () => {
    const evidence = await run(sources(ledger(2026, { codes: ['CHI'] })));
    expect(evidence.home.current_season.play_by_play.offense.overall.epa_per_play).toBe(0.2);
    expect(evidence.away.current_season.play_by_play).toMatchObject({ season: 2026, unavailable: true });
    expect(evidence.away.current_season.play_by_play.reason).toContain('does not establish that no games were played');
    expect(evidence.away.prior_season_background.play_by_play.season).toBe(2025);
  });
  it('keeps prior aggregates and ledger outside a missing current sample', async () => {
    const loaders = sources({ unavailable: true, reason: '2026 download unavailable' });
    loaders.fetchNflTeamBaseline.mockResolvedValue({ season: 2025, scope: 'prior_completed_regular_season',
      label: '2025 prior baseline', stats: { games_played: 17, total_points_per_game: 26 }, currentRegularGamesPlayed: 1 });
    const evidence = await run(loaders);
    for (const side of [evidence.home, evidence.away]) {
      expect(side.current_season.play_by_play).toMatchObject({ season: 2026, unavailable: true, reason: '2026 download unavailable' });
      expect(side.current_season.team_aggregates.unavailable).toBe(true);
      expect(side.prior_season_background.team_aggregates).toMatchObject({ season: 2025, games_played: 17 });
      expect(side.prior_season_background.play_by_play).toMatchObject({ season: 2025, sample: { games: 20 } });
    }
  });
  it.each([3, 4])('loads prior background only while current sample is thin (%i games)', async games => {
    const loaders = sources(ledger(2026, { games }));
    const evidence = await run(loaders);
    expect(loaders.getPlayLedger).toHaveBeenCalledTimes(games <= 3 ? 2 : 1);
    expect(Object.hasOwn(evidence.home, 'prior_season_background')).toBe(games <= 3);
  });
  it('preserves other sources and the other team if an individual lookup rejects', async () => {
    const loaders = sources();
    loaders.fetchNflTeamBaseline.mockRejectedValueOnce(Error('BDL timeout'));
    loaders.getSnapShare.mockRejectedValueOnce(Error('snap download failed'));
    loaders.getPlayLedger.mockImplementation(async season => {
      if (season === 2025) throw Error('prior download failed');
      return ledger(2026);
    });
    const evidence = await run(loaders);
    expect(evidence.home.current_season.team_aggregates).toEqual({ unavailable: true, reason: 'BDL timeout' });
    expect(evidence.home.current_season.snap_participation.reason).toBe('snap download failed');
    expect(evidence.home.current_season.play_by_play.offense.overall.plays).toBe(60);
    expect(evidence.away.current_season.team_aggregates.games_played).toBe(1);
    expect(evidence.home.prior_season_background.play_by_play.reason).toBe('prior download failed');
  });
  it('keeps stale provenance and refuses to call incomplete phases a complete game count', async () => {
    const current = ledger(2026);
    current.stale = true;
    current.stale_reason = 'Serving cached ledger after download failed.';
    current.games.push({ ...current.games[0], season_type: 'POST' });
    const evidence = await run(sources(current));
    const plays = evidence.home.current_season.play_by_play;
    expect(plays).toMatchObject({ stale: true, stale_reason: current.stale_reason,
      sample: { games: null, phases: { unknown: 1 } } });
    expect(plays.generated_at).toBe(current.generated_at);
    expect(plays.sample.game_ids).toHaveLength(1);
  });
  it('rejects a wrong-season ledger or charting instead of relabeling it as current', async () => {
    const loaders = sources(ledger(2025));
    loaders.getQbPressureProfile.mockResolvedValue({ season: 2025, quarterbacks: [{ player: 'Old QB' }] });
    const evidence = await run(loaders);
    expect(evidence.home.current_season.play_by_play.unavailable).toBe(true);
    expect(evidence.home.current_season.quarterback_charting.unavailable).toBe(true);
    expect(evidence.home.current_season.quarterback_charting).not.toHaveProperty('quarterbacks');
  });
});
