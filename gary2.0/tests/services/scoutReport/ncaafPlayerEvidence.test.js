import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggregateNcaafPlayerRows, cleanNcaafPlayerRows, formatNcaafPlayerEvidence } from '../../../src/services/agentic/scoutReport/sports/ncaafPlayerEvidence.js';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { fetchNcaafKeyPlayers, formatNcaafKeyPlayers } from '../../../src/services/agentic/scoutReport/sports/ncaaf.js';

afterEach(() => vi.restoreAllMocks());

const options = { season: 2026, playerIds: [1], teamId: 8, asOf: '2026-09-05T00:00:00Z' };
const row = (overrides = {}) => ({
  player: { id: 1 }, team: { id: 8, name: 'Miami' }, season: 2026,
  game: { id: 10, season: 2026, date: '2026-08-29T19:00:00Z' },
  passing_yards: 250, passing_attempts: 30, passing_touchdowns: 2,
  ...overrides,
});

describe('dated NCAAF player evidence', () => {
  it('rejects stale totals with a new season label, future games, wrong players and wrong teams', () => {
    const result = cleanNcaafPlayerRows([
      row(),
      row({ game: { id: 20, season: 2026, date: '2025-09-01T00:00:00Z' } }),
      row({ game: { id: 30, season: 2026, date: '2026-09-05T00:00:00Z' } }),
      row({ season: 2025 }), row({ player: { id: 2 } }), row({ team: { id: 9 } }),
    ], options);
    expect(result.rows).toHaveLength(1);
    expect(result.diagnostics).toMatchObject({ invalidDate: 2, wrongSeason: 1, wrongPlayerOrTeam: 2 });
  });

  it('counts duplicate game rows once and excludes conflicting versions in either order', () => {
    const duplicate = cleanNcaafPlayerRows([row(), row()], options);
    expect(duplicate.rows).toHaveLength(1);
    expect(duplicate.diagnostics.duplicates).toBe(1);
    for (const rows of [[row(), row({ passing_yards: 260 })], [row({ passing_yards: 260 }), row()]]) {
      const result = cleanNcaafPlayerRows(rows, options);
      expect(result.rows).toEqual([]);
      expect(result.diagnostics.conflicts).toBe(1);
    }
  });

  it('sums dated samples, never turning missing fields into zero', () => {
    const rows = cleanNcaafPlayerRows([
      row(), row({ passing_yards: 100, passing_touchdowns: null, game: { id: 11, season: 2026, date: '2026-09-02T19:00:00Z' } }),
    ], options).rows;
    const line = aggregateNcaafPlayerRows(rows, 2026).get('1');
    expect(line.passing_yards).toBe(350);
    expect(line.passing_touchdowns).toBeNull();
    expect(line.interceptions).toBeNull();
    expect(line.evidence).toEqual({ season: 2026, games: 2, from: '2026-08-29', through: '2026-09-02', teams: ['Miami'] });
  });

  it('keeps transfer history with the actual prior school, season and January date', () => {
    const prior = row({ season: 2025, team: { id: 9, name: 'Duke' }, game: { id: 90, season: 2025, date: '2026-01-02T19:00:00Z' } });
    const clean = cleanNcaafPlayerRows([prior], { ...options, season: 2025, teamId: null });
    const line = aggregateNcaafPlayerRows(clean.rows, 2025).get('1');
    expect(formatNcaafPlayerEvidence(line.evidence, 2026)).toBe(' [2025 prior season; 1 dated game row; 2026-01-02–2026-01-02; played for Duke]');
    expect(formatNcaafPlayerEvidence(null, 2026)).toContain('no dated player-game stats');
  });

  it('labels an evening game by its Eastern date, even after midnight UTC', () => {
    const clean = cleanNcaafPlayerRows([row({ game: { id: 90, season: 2026, date: '2026-09-03T02:00:00Z' } })], options);
    expect(aggregateNcaafPlayerRows(clean.rows, 2026).get('1').evidence.from).toBe('2026-09-02');
  });

  it('feeds the game scout only active-roster game evidence and labels a transfer\'s prior season', async () => {
    const home = { id: 8, full_name: 'Miami Hurricanes' };
    const away = { id: 9, full_name: 'Duke Blue Devils' };
    vi.spyOn(ballDontLieService, 'getTeams').mockResolvedValue([home, away]);
    vi.spyOn(ballDontLieService, 'getNcaafTeamPlayers').mockImplementation(async id => id === 8
      ? [{ id: 1, first_name: 'Current', last_name: 'Passer', position_abbreviation: 'QB' }] : []);
    const seasonTotals = vi.spyOn(ballDontLieService, 'getNcaafPlayerSeasonStats').mockRejectedValue(new Error('must not read stale totals'));
    const games = vi.spyOn(ballDontLieService, 'getNcaafPlayerGameStats').mockImplementation(async args => args.season === 2026
      ? [row({ player: { id: 99 } })]
      : [row({ season: 2025, team: away, game: { id: 90, season: 2025, date: '2025-11-02T19:00:00Z' } })]);
    const result = await fetchNcaafKeyPlayers(home.full_name, away.full_name, 'NCAAF', 2026, options.asOf);
    expect(seasonTotals).not.toHaveBeenCalled();
    expect(games).toHaveBeenCalledWith({ playerIds: [1], season: 2025 }, 360);
    const text = formatNcaafKeyPlayers(home.full_name, away.full_name, result);
    expect(text).toContain('Current Passer - 250 yds, 2 TD, N/A INT');
    expect(text).toContain('2025 prior season; 1 dated game row');
    expect(text).toContain('played for Duke Blue Devils');
    expect(text).toContain('wrongPlayerOrTeam: 1');
  });
});
