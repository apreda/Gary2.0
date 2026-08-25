import { describe, expect, it } from 'vitest';
import {
  toTeamResults,
  formSummary,
  homeAwaySplit,
  marginProfile,
  closeGameRecord,
  footballWeekLabel,
  gameStoryLine
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

  it('carries the game id so per-player rows can be joined to an opponent', () => {
    // NCAAF player_stats rows embed a game whose home_team/visitor_team are
    // NULL; without this key the log line rendered "@ Unknown" and invented a
    // road venue for every game.
    const results = toTeamResults([nflGame(4242, 10, 20, 24, 20, '2025-09-07')], 10);
    expect(results[0].gameId).toBe(4242);
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

  it('carries the opponent, venue and score into the form line', () => {
    const form = formSummary(results, 5);
    expect(form.record).toBe('2-2');
    expect(form.games_used).toBe(4);
    // The line now leads with the result and venue, then tells the story.
    expect(form.results.some((l) => l.startsWith('W 27-10 @ Team 40'))).toBe(true);
    expect(form.results.some((l) => l.startsWith('L 14-17 vs Team 30'))).toBe(true);
  });

  it('tells what actually happened, not just the final score', () => {
    // The founder's standard: "were they ahead in the first half and then blew
    // it, or vice versa? What is the story of the game?"
    const blownLead = toTeamResults([{
      id: 9, date: '2025-10-05', status: 'Final',
      home_team: { id: 10, full_name: 'Team 10' },
      visitor_team: { id: 20, full_name: 'Team 20' },
      home_team_score: 24, visitor_team_score: 31,
      home_team_q1: 10, home_team_q2: 14, home_team_q3: null, home_team_q4: null,
      visitor_team_q1: 7, visitor_team_q2: 3, visitor_team_q3: 14, visitor_team_q4: 7
    }], 10);
    const line = gameStoryLine(blownLead[0]);
    expect(line).toContain('led 24-10 at half');
    expect(line).toContain('outscored 0-21 after');
    expect(line).toContain('lost a halftime lead');
  });

  it('reads a scoreless quarter as zero, not as missing data', () => {
    // BDL stores a shutout quarter as null. Only 9 of 97 sampled 2025 finals
    // carried all eight fields, yet all 194 sides reconciled once null read as
    // 0 — so treating null as "missing" discarded 69% of the season.
    const shutoutHalf = toTeamResults([{
      id: 11, date: '2025-10-12', status: 'Final',
      home_team: { id: 10, full_name: 'Team 10' },
      visitor_team: { id: 20, full_name: 'Team 20' },
      home_team_score: 14, visitor_team_score: 0,
      home_team_q1: null, home_team_q2: 7, home_team_q3: null, home_team_q4: 7,
      visitor_team_q1: null, visitor_team_q2: null, visitor_team_q3: null, visitor_team_q4: null
    }], 10);
    expect(shutoutHalf[0].shapeKnown).toBe(true);
    expect(shutoutHalf[0].halftimeFor).toBe(7);
    expect(shutoutHalf[0].halftimeAgainst).toBe(0);
    expect(gameStoryLine(shutoutHalf[0])).toContain('led 7-0 at half');
  });

  it('attaches how good the opponent was, when league context is supplied', () => {
    const leagueContext = { byTeamId: new Map([[30, {}]]) };
    const opponentQuality = (ctx, id) => (id === 30 ? 'opponent allowed 30.1 ppg (32nd of 32)' : null);
    const form = formSummary(results, 5, { leagueContext, opponentQuality });
    expect(form.results.some((l) => l.includes('opponent allowed 30.1 ppg (32nd of 32)'))).toBe(true);
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

describe('week labels', () => {
  it('renders a real week number', () => {
    expect(footballWeekLabel(7)).toBe('Wk 7');
  });

  it('does not print BDL postseason sentinel 999 as a week', () => {
    // Ohio State's 2025 season carries 28 rows stamped week 999 — a Jan 1 bowl.
    expect(footballWeekLabel(999)).toBe('Postseason');
  });

  it('handles a missing week without inventing one', () => {
    expect(footballWeekLabel(null)).toBe('Wk ?');
    expect(footballWeekLabel(undefined)).toBe('Wk ?');
  });
});
