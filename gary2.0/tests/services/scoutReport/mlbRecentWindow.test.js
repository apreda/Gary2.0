import { describe, expect, it } from 'vitest';
import { aggregateRecentWindow, oppStarterLineFromBox } from '../../../src/services/agentic/scoutReport/sports/mlbRecentWindow.js';

/**
 * LABEL-VS-MATH CONTRACT (founder audit, Aug 25 2026).
 *
 * His standard for any data point on the desk: nobody should be able to poke a
 * hole in it — not "when was that game", not "who was it against". A recent
 * window that reports a record must therefore state how many games it actually
 * used, when they were, and who they were against, and the arithmetic must
 * agree with the games it claims to summarize.
 *
 * The old line was "6-4 (4.2 R/G, 3.8 RA/G)" under a hardcoded [L10] label —
 * no dates, no opponents, and the label implied ten games even when only six
 * had been played.
 */

const game = (home, away, homeScore, awayScore, date) => ({
  officialDate: date,
  teams: {
    home: { team: { name: home }, score: homeScore },
    away: { team: { name: away }, score: awayScore }
  }
});

// Oldest-first, the order getMlbRecentGames returns.
const tigersFive = [
  game('Boston Red Sox', 'Detroit Tigers', 3, 5, '2026-08-14'),   // road W
  game('Boston Red Sox', 'Detroit Tigers', 6, 2, '2026-08-15'),   // road L
  game('Detroit Tigers', 'New York Yankees', 4, 1, '2026-08-17'), // home W
  game('Detroit Tigers', 'New York Yankees', 2, 7, '2026-08-18'), // home L
  game('Detroit Tigers', 'Toronto Blue Jays', 8, 3, '2026-08-20') // home W
];

describe('MLB recent window — the record matches the games', () => {
  it('counts wins and losses correctly across home and road', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    expect(line).toContain('3-2 over 5 games');
    expect(line).toContain('home 2-1, road 1-1');
  });

  it('the home and road splits sum to the overall record', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    const [, w, l] = line.match(/(\d+)-(\d+) over/);
    const [, hw, hl, rw, rl] = line.match(/home (\d+)-(\d+), road (\d+)-(\d+)/);
    expect(Number(hw) + Number(rw)).toBe(Number(w));
    expect(Number(hl) + Number(rl)).toBe(Number(l));
  });

  it('the record accounts for every game in the window', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    const [, w, l] = line.match(/(\d+)-(\d+) over/);
    const [, gp] = line.match(/over (\d+) games?/);
    expect(Number(w) + Number(l)).toBe(Number(gp));
  });

  it('run averages divide by the games actually used', () => {
    // Tigers scored 5+2+4+2+8 = 21, allowed 3+6+1+7+3 = 20, over 5 games.
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    expect(line).toContain('4.2 R/G');
    expect(line).toContain('4.0 RA/G');
  });
});

describe('MLB recent window — the questions a bettor would ask', () => {
  it('says WHEN the window covers', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    expect(line).toContain('(2026-08-14 → 2026-08-20)');
  });

  it('says WHO the games were against, with venue', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    expect(line).toContain('@ Boston Red Sox x2');
    expect(line).toContain('vs New York Yankees x2');
    expect(line).toContain('vs Toronto Blue Jays');
  });

  it('collapses a repeated series instead of listing it game by game', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 5);
    expect(line.match(/Boston Red Sox/g)).toHaveLength(1);
  });
});

describe('MLB recent window — never implies more games than it has', () => {
  it('asking for 10 with 5 played reports 5, not 10', () => {
    const line = aggregateRecentWindow(tigersFive, 'Detroit Tigers', 10);
    expect(line).toContain('over 5 games');
    expect(line).not.toContain('over 10 games');
  });

  it('handles a single game without pluralizing', () => {
    const line = aggregateRecentWindow(tigersFive.slice(-1), 'Detroit Tigers', 5);
    expect(line).toContain('1-0 over 1 game');
    expect(line).not.toContain('1 games');
  });

  it('returns null on an empty window rather than a 0-0 record', () => {
    expect(aggregateRecentWindow([], 'Detroit Tigers', 5)).toBeNull();
    expect(aggregateRecentWindow(null, 'Detroit Tigers', 5)).toBeNull();
  });
});

describe('opposing-starter context (Aug 26 — "2.6 against Gausman is not 2.6 against nobodies")', () => {
  const game = (pk, day, oppName, us, them, home) => ({
    gamePk: pk,
    officialDate: `2026-08-${day}`,
    teams: home
      ? { home: { team: { name: 'Tampa Bay Rays' }, score: us }, away: { team: { name: oppName }, score: them } }
      : { home: { team: { name: oppName }, score: them }, away: { team: { name: 'Tampa Bay Rays' }, score: us } },
  });

  it('replaces the collapsed opponents with per-game results and opposing starters', () => {
    const games = [
      game(1, '22', 'Baltimore Orioles', 2, 3, false),
      game(2, '23', 'Baltimore Orioles', 3, 1, false),
      game(3, '24', 'Detroit Tigers', 4, 1, false),
    ];
    const starters = new Map([[1, 'Bradish 7.0IP 2ER 8K'], [3, 'Olson 5.0IP 4ER']]);
    const line = aggregateRecentWindow(games, 'Tampa Bay Rays', 5, starters);
    expect(line).toContain('| games: 08-22 L 2-3 @ Baltimore Orioles (opp SP Bradish 7.0IP 2ER 8K)');
    expect(line).toContain('08-23 W 3-1 @ Baltimore Orioles');
    expect(line).toContain('08-24 W 4-1 @ Detroit Tigers (opp SP Olson 5.0IP 4ER)');
    expect(line).not.toContain('| opponents:');
    // The arithmetic contract survives annotation
    expect(line).toContain('2-1 over 3 games');
    expect(line).toContain('3.0 R/G');
  });

  it('keeps the collapsed-opponents form exactly when no starter map is given', () => {
    const games = [
      game(1, '22', 'Baltimore Orioles', 2, 3, false),
      game(2, '23', 'Baltimore Orioles', 3, 1, false),
    ];
    const line = aggregateRecentWindow(games, 'Tampa Bay Rays', 5);
    expect(line).toContain('| opponents: @ Baltimore Orioles x2');
    expect(line).not.toContain('| games:');
  });

  it('extracts the OPPOSING starter line from a boxscore, never the own side', () => {
    const box = {
      teams: {
        home: {
          team: { id: 116 },
          pitchers: [601, 602],
          players: { ID601: { person: { fullName: 'Jackson Jobe' }, stats: { pitching: { inningsPitched: '5.1', earnedRuns: 1, strikeOuts: 6 } } } },
        },
        away: {
          team: { id: 139 },
          pitchers: [701],
          players: { ID701: { person: { fullName: 'Ian Seymour' }, stats: { pitching: { inningsPitched: '5.2', earnedRuns: 4 } } } },
        },
      },
    };
    // From the Rays' (139) point of view the opposing starter is Jobe
    expect(oppStarterLineFromBox(box, 139)).toBe('Jobe 5.1IP 1ER 6K');
    // From the Tigers' (116) point of view it's Seymour
    expect(oppStarterLineFromBox(box, 116)).toBe('Seymour 5.2IP 4ER');
    // A team not in this box gets nothing, never a guess
    expect(oppStarterLineFromBox(box, 999)).toBe(null);
  });
});
