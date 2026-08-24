import { describe, expect, it } from 'vitest';
import {
  toTeamResults,
  formSummary,
  homeAwaySplit,
  marginProfile,
  closeGameRecord
} from '../../../src/services/agentic/tools/statRouters/footballTeamGames.js';

// NFL spelling: home_team_score / visitor_team_score, status 'Final'.
const nflGame = (id, homeId, awayId, hs, as, date) => ({
  id,
  date,
  status: 'Final',
  home_team: { id: homeId, full_name: `Team ${homeId}` },
  visitor_team: { id: awayId, full_name: `Team ${awayId}` },
  home_team_score: hs,
  visitor_team_score: as
});

// NCAAF spelling: home_score / away_score, status 'post'.
const ncaafGame = (id, homeId, awayId, hs, as, date) => ({
  id,
  date,
  status: 'post',
  home_team: { id: homeId, name: `Team ${homeId}` },
  visitor_team: { id: awayId, name: `Team ${awayId}` },
  home_score: hs,
  away_score: as
});

describe('football game ledger — score key normalization', () => {
  it('reads NFL score keys', () => {
    const results = toTeamResults([nflGame(1, 10, 20, 24, 20, '2025-09-07')], 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ scored: 24, allowed: 20, margin: 4, won: true, home: true });
  });

  it('reads NCAAF score keys', () => {
    const results = toTeamResults([ncaafGame(1, 10, 20, 17, 31, '2025-09-06')], 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ scored: 17, allowed: 31, margin: -14, won: false });
  });

  it('reads the away side correctly in both leagues', () => {
    expect(toTeamResults([nflGame(1, 10, 20, 24, 20, '2025-09-07')], 20)[0])
      .toMatchObject({ scored: 20, allowed: 24, home: false, opponent: 'Team 10' });
    expect(toTeamResults([ncaafGame(1, 10, 20, 17, 31, '2025-09-06')], 20)[0])
      .toMatchObject({ scored: 31, allowed: 17, home: false, won: true });
  });

  it('drops games the team did not play and games with no score', () => {
    const games = [
      nflGame(1, 10, 20, 24, 20, '2025-09-07'),
      nflGame(2, 30, 40, 14, 10, '2025-09-14'),
      { ...nflGame(3, 10, 50, null, null, '2025-09-21'), home_team_score: null, visitor_team_score: null }
    ];
    expect(toTeamResults(games, 10)).toHaveLength(1);
  });

  it('excludes games that have not finished', () => {
    const scheduled = { ...nflGame(1, 10, 20, null, null, '2026-09-13'), status: '9/13 - 1:00 PM EDT' };
    expect(toTeamResults([scheduled], 10)).toHaveLength(0);
  });

  it('orders newest first', () => {
    const results = toTeamResults([
      nflGame(1, 10, 20, 24, 20, '2025-09-07'),
      nflGame(2, 10, 30, 14, 17, '2025-09-21'),
      nflGame(3, 40, 10, 10, 27, '2025-09-14')
    ], 10);
    expect(results.map((r) => r.date)).toEqual(['2025-09-21', '2025-09-14', '2025-09-07']);
  });
});

describe('football game ledger — summaries', () => {
  const results = toTeamResults([
    nflGame(1, 10, 20, 24, 20, '2025-09-07'),  // W by 4, home
    nflGame(2, 10, 30, 14, 17, '2025-09-21'),  // L by 3, home
    nflGame(3, 40, 10, 10, 27, '2025-09-14'),  // W by 17, away
    nflGame(4, 50, 10, 35, 7, '2025-09-28')    // L by 28, away
  ], 10);

  it('carries the opponent and the score into the form line', () => {
    const form = formSummary(results, 5);
    expect(form.record).toBe('2-2');
    expect(form.games_used).toBe(4);
    expect(form.results).toContain('W 27-10 @ Team 40');
    expect(form.results).toContain('L 14-17 vs Team 30');
  });

  it('splits home from away', () => {
    const split = homeAwaySplit(results);
    expect(split.home.record).toBe('1-1');
    expect(split.away.record).toBe('1-1');
    expect(split.home.points_per_game).toBe(19);
  });

  it('separates one-score games from blowouts', () => {
    const profile = marginProfile(results);
    expect(profile.one_score_games).toBe(2);
    expect(profile.one_score_record).toBe('1-1');
    expect(profile.blowouts_for).toBe(1);
    expect(profile.blowouts_against).toBe(1);
    expect(profile.largest_win).toBe(17);
    expect(profile.largest_loss).toBe(-28);
  });

  it('reports the close-game record inside a tighter margin', () => {
    const close = closeGameRecord(results, 7);
    expect(close.record).toBe('1-1');
    expect(close.games_used).toBe(2);
  });

  it('returns null rather than a fabricated zero when there are no games', () => {
    expect(formSummary([], 5)).toBeNull();
    expect(marginProfile([])).toBeNull();
    expect(closeGameRecord([], 7)).toBeNull();
  });
});
