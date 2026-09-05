import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ballDontLieService as bdl } from '../../../src/services/ballDontLieService.js';
import { ncaafFetchers } from '../../../src/services/agentic/tools/statRouters/ncaafFetchers.js';

const home = { id: 11, full_name: 'Home State' }, away = { id: 22, full_name: 'Away Tech' };
const row = (id, fields = {}) => ({
  player: { id: 7, full_name: 'Named Quarterback' }, team: home, season: 2026,
  game: { id, season: 2026, date: '2026-08-29', week: 1, status: 'Final' },
  passing_attempts: 10, passing_completions: 5, passing_yards: 80, passing_touchdowns: 0, passing_interceptions: 0,
  ...fields,
});
const fetch = token => ncaafFetchers[token]('americanfootball_ncaaf', home, away, 2026);
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T16:00:00Z'));
  vi.spyOn(bdl, 'getGames').mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('team-level college player evidence', () => {
  it('does not inflate QB totals with duplicate, wrong-team, wrong-season, live or conflicting rows', async () => {
    const valid = row(1);
    const contaminated = [valid, { ...valid }, row(2, { team: away }), row(3, { season: 2025 }),
      row(4, { game: { ...valid.game, id: 4, status: 'In Progress' } }),
      row(5), row(5, { passing_yards: 999 }),
      row(6, { game: { ...valid.game, id: 6, date: '2025-08-29' } }),
    ];
    vi.spyOn(bdl, 'getNcaafPlayerGameStats').mockImplementation(async ({ teamId }) => teamId === 11 ? contaminated : []);
    const result = await fetch('NCAAF_QB_STATS');
    expect(result.home).toMatchObject({ quarterback: 'Named Quarterback', games: 1, attempts: 10, passing_yards: 80, touchdowns: 0, interceptions: 0,
      evidence: { season: 2026, games: 1, from: '2026-08-29', through: '2026-08-29' },
      diagnostics: { duplicates: 1, wrongPlayerOrTeam: 1, wrongSeason: 1, invalidDate: 1, unfinished: 1, conflicts: 1 },
    });
    expect(result.away.note).toContain('No eligible');
  });

  it('keeps incomplete season fields unknown instead of dropping an incomplete game or inventing zero TDs', async () => {
    vi.spyOn(bdl, 'getNcaafPlayerGameStats').mockResolvedValue([
      row(1), row(2, { passing_attempts: null, passing_completions: '', passing_yards: null, passing_touchdowns: null }),
    ]);
    const result = await fetch('NCAAF_QB_STATS');
    expect(result.home).toMatchObject({ games: 2, attempts: null, completions: null, completion_pct: 'N/A', passing_yards: null,
      yards_per_attempt: 'N/A', touchdowns: null, interceptions: 0 });
  });

  it('retains an active zero-yard QB and names, dates and known zeros in the player log', async () => {
    const valid = row(1, { passing_completions: 0, passing_yards: 0, passing_touchdowns: null });
    vi.spyOn(bdl, 'getNcaafPlayerGameStats').mockResolvedValue([valid, { ...valid }]);
    const result = await fetch('NCAAF_PLAYER_GAME_LOGS');
    expect(result.season).toBe(2026);
    expect(result.home.players).toHaveLength(1);
    expect(result.home.players[0]).toMatchObject({ player: 'Named Quarterback', role: 'passer' });
    expect(result.home.players[0].last_5).toEqual(['2026-08-29 · Wk 1 (opponent not carried by BDL for this game): 0/10, 0 pass yds, N/A TD, 0 INT']);
    expect(result.home.diagnostics.duplicates).toBe(1);
    expect(result.away.players).toEqual([]);
  });

  it('keeps a negative-yard rushing appearance and does not print missing carries as zero', async () => {
    vi.spyOn(bdl, 'getNcaafPlayerGameStats').mockResolvedValue([
      row(1, { player: { id: 8, full_name: 'Named Runner' }, passing_attempts: null, passing_yards: null,
        rushing_attempts: 1, rushing_yards: -2, rushing_touchdowns: 0 }),
    ]);
    const result = await fetch('NCAAF_PLAYER_GAME_LOGS');
    expect(result.home.players[0]).toMatchObject({ player: 'Named Runner', role: 'rusher' });
    expect(result.home.players[0].last_5[0]).toContain('1 car, -2 rush yds, 0 TD');
  });

  it('uses only complete two-sided turnover boxes in totals and their denominator', async () => {
    bdl.getGames.mockResolvedValue([1, 2].map(id => ({ id, date: '2026-08-29', status: 'Final', home_team: home, visitor_team: away, home_score: 14, away_score: 7 })));
    vi.spyOn(bdl, 'getNcaafTeamStatsByGameIds').mockResolvedValue([
      { game: { id: 1 }, team: home, turnovers: '0' }, { game: { id: 1 }, team: away, turnovers: 2 },
      { game: { id: 2 }, team: home, turnovers: null }, { game: { id: 2 }, team: away, turnovers: 3 },
    ]);
    const result = await fetch('NCAAF_TURNOVER_LUCK');
    expect(result.home).toMatchObject({ games_used: 1, turnovers_committed: 0, turnovers_forced: 2, committed_per_game: 0, forced_per_game: 2 });
    expect(result.away).toMatchObject({ games_used: 1, turnovers_committed: 2, turnovers_forced: 0 });
  });

  it('does not turn a missing defensive field into a team or player total of zero', async () => {
    vi.spyOn(bdl, 'getNcaafPlayerGameStats').mockResolvedValue([
      row(1, { sacks: 1, tackles_for_loss: null, interceptions: 0, passes_defended: ' ' }),
    ]);
    const result = await fetch('NCAAF_HAVOC');
    expect(result.home).toMatchObject({ sacks: 1, tackles_for_loss: null, interceptions: 0, passes_defended: null });
    expect(result.home.top_disruptors).toEqual(['Named Quarterback (1 recorded sacks, N/A recorded TFL)']);
  });

  it('retains returned defensive counts when offensive rows omit those fields, with explicit coverage', async () => {
    vi.spyOn(bdl, 'getNcaafPlayerGameStats').mockResolvedValue([
      row(1), row(1, { player: { id: 8, full_name: 'Named Defender' }, sacks: 1, tackles_for_loss: 2, passes_defended: 0 }),
    ]);
    const result = await fetch('NCAAF_HAVOC');
    expect(result.home).toMatchObject({ sacks: 1, tackles_for_loss: 2, passes_defended: 0, interceptions: null, sacks_per_game: null,
      stat_coverage: { sacks: { rows_with_value: 1, rows_used: 2 } } });
    expect(result.home.count_scope).toContain('counts may be incomplete');
    expect(result.home.top_disruptors[0]).toContain('Named Defender');
  });
});
