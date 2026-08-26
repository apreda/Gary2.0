import { describe, expect, it } from 'vitest';
import { aggregateRecentWindow } from '../../../src/services/agentic/scoutReport/sports/mlbRecentWindow.js';

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

// (The Aug-26 opposing-starter stamps were retired the same day — founder
// duplication audit: the full game stories in RECENT FORM carry the arm the
// offense faced. The window stays the record book tested above.)
