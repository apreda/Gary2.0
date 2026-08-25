import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ballDontLieService } from '../../../src/services/ballDontLieService.js';
import { nbaFetchers } from '../../../src/services/agentic/tools/statRouters/nbaFetchers.js';
import { toTeamResults } from '../../../src/services/agentic/tools/statRouters/footballTeamGames.js';

/**
 * SAMPLE COMPLETENESS — the guard for the worst bug this audit found.
 *
 * BDL stores a SCORELESS quarter as null, not 0. FIRST_HALF_TRENDS,
 * SECOND_HALF_TRENDS and QUARTER_SCORING each skipped any game containing a
 * null quarter, on the assumption that null meant "missing". It does not.
 *
 * Measured on real 2025 data: only 9 of 97 finals carried all eight quarter
 * fields, yet all 194 sides reconciled exactly to their final score once null
 * was read as 0. The lanes therefore discarded 69% OF THE SEASON — and the
 * discard was biased, because the games it threw away were the low-scoring
 * ones. The surviving sample reported 14.7 first-half points against a true
 * 11.4: a 29% overstatement, in one direction, live.
 *
 * Nothing failed. No error, no exception, no empty result — just a confident
 * wrong number. That is why this file exists and why it asserts a COUNT: an
 * aggregate must be built from every game available to it, and any lane that
 * quietly drops games fails here rather than in a pick.
 *
 * The rule: if a lane reports games_analyzed, it must equal the number of
 * completed games it was handed.
 */

const TEAM_ID = 10;
const OPP_ID = 20;

/**
 * Ten completed games whose quarter fields look exactly like BDL's: scoreless
 * quarters arrive as null, and only a couple of games carry all eight.
 */
function seasonWithNullQuarters() {
  const games = [];
  for (let i = 0; i < 10; i += 1) {
    const homeGame = i % 2 === 0;
    // Deliberately null out most quarters — this is the real-world shape.
    const q = (v) => (v === 0 ? null : v);
    const teamQ = [q(i % 3 === 0 ? 0 : 7), q(7), q(i % 4 === 0 ? 0 : 3), q(7)];
    const oppQ = [q(0), q(i % 2 === 0 ? 0 : 3), q(7), q(0)];
    const teamPts = teamQ.reduce((a, b) => a + (b || 0), 0);
    const oppPts = oppQ.reduce((a, b) => a + (b || 0), 0);
    games.push({
      id: 500 + i,
      date: `2025-09-${String(i + 1).padStart(2, '0')}`,
      status: 'Final',
      home_team: { id: homeGame ? TEAM_ID : OPP_ID, full_name: homeGame ? 'Team' : 'Opp' },
      visitor_team: { id: homeGame ? OPP_ID : TEAM_ID, full_name: homeGame ? 'Opp' : 'Team' },
      home_team_score: homeGame ? teamPts : oppPts,
      visitor_team_score: homeGame ? oppPts : teamPts,
      home_team_q1: homeGame ? teamQ[0] : oppQ[0],
      home_team_q2: homeGame ? teamQ[1] : oppQ[1],
      home_team_q3: homeGame ? teamQ[2] : oppQ[2],
      home_team_q4: homeGame ? teamQ[3] : oppQ[3],
      visitor_team_q1: homeGame ? oppQ[0] : teamQ[0],
      visitor_team_q2: homeGame ? oppQ[1] : teamQ[1],
      visitor_team_q3: homeGame ? oppQ[2] : teamQ[2],
      visitor_team_q4: homeGame ? oppQ[3] : teamQ[3]
    });
  }
  return games;
}

const GAMES = seasonWithNullQuarters();
const home = { id: TEAM_ID, full_name: 'Team', name: 'Team' };
const away = { id: OPP_ID, full_name: 'Opp', name: 'Opp' };

describe('an aggregating lane uses every completed game it is given', () => {
  let original;

  beforeEach(() => {
    original = ballDontLieService.getGames;
    ballDontLieService.getGames = async () => GAMES;
  });

  afterEach(() => {
    ballDontLieService.getGames = original;
  });

  it('the fixture really does contain the null quarters this guards against', () => {
    const nulls = GAMES.filter((g) => [
      g.home_team_q1, g.home_team_q2, g.home_team_q3, g.home_team_q4,
      g.visitor_team_q1, g.visitor_team_q2, g.visitor_team_q3, g.visitor_team_q4
    ].some((v) => v === null));
    // If this ever hits zero the rest of the file stops testing anything.
    expect(nulls.length).toBeGreaterThan(5);
  });

  it.each([
    ['FIRST_HALF_TRENDS'],
    ['SECOND_HALF_TRENDS'],
    ['QUARTER_SCORING']
  ])('%s counts all 10 games, not just the ones with complete quarters', async (token) => {
    const result = await nbaFetchers[token]('americanfootball_nfl', home, away, 2025);
    expect(result.home.games_analyzed).toBe(GAMES.length);
    expect(result.away.games_analyzed).toBe(GAMES.length);
  });

  it('halves reconcile to the final score for every game', () => {
    // The arithmetic proof that null means zero: if it meant "unknown", these
    // would not add up.
    const results = toTeamResults(GAMES, TEAM_ID);
    expect(results).toHaveLength(GAMES.length);
    for (const r of results) {
      expect(r.halftimeFor + r.secondHalfFor).toBe(r.scored);
      expect(r.halftimeAgainst + r.secondHalfAgainst).toBe(r.allowed);
      expect(r.shapeKnown).toBe(true);
    }
  });

  it('a genuinely unplayed game is still excluded', async () => {
    const withScheduled = [...GAMES, {
      id: 999, date: '2026-09-13', status: '9/13 - 1:00 PM EDT',
      home_team: { id: TEAM_ID, full_name: 'Team' },
      visitor_team: { id: OPP_ID, full_name: 'Opp' },
      home_team_score: null, visitor_team_score: null
    }];
    ballDontLieService.getGames = async () => withScheduled;
    const result = await nbaFetchers.FIRST_HALF_TRENDS('americanfootball_nfl', home, away, 2025);
    // Ten completed, one scheduled: the scheduled one must not be counted.
    expect(result.home.games_analyzed).toBe(GAMES.length);
    expect(toTeamResults(withScheduled, TEAM_ID)).toHaveLength(GAMES.length);
  });

  it('first-half and second-half points sum to the season total', async () => {
    const first = await nbaFetchers.FIRST_HALF_TRENDS('americanfootball_nfl', home, away, 2025);
    const second = await nbaFetchers.SECOND_HALF_TRENDS('americanfootball_nfl', home, away, 2025);
    const results = toTeamResults(GAMES, TEAM_ID);
    const truePpg = results.reduce((a, r) => a + r.scored, 0) / results.length;
    const reported = Number(first.home.avg_1H_scored) + Number(second.home.avg_2H_scored);
    expect(reported).toBeCloseTo(truePpg, 1);
  });
});
