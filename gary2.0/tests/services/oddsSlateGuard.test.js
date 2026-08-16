/**
 * SLATE GUARD pins (founder GO, Aug 10 2026): the frozen finished-game row
 * and UTC-bleed duplicates die at the source; West-Coast late games and
 * real doubleheaders always survive.
 */
import { describe, it, expect } from 'vitest';
import { filterSlateGames } from '../../src/services/oddsService.js';

const NOW = new Date('2026-08-10T21:20:00Z').getTime(); // 5:20 PM ET Aug 10
const D = ['2026-08-10'];

const g = (id, away, home, ct) => ({ id, away_team: away, home_team: home, commence_time: ct });

describe('filterSlateGames', () => {
  it('drops the frozen corpse from yesterday and keeps tonight, including the West-Coast late game', () => {
    const rows = [
      g(1, 'Astros', 'Padres', '2026-08-09T23:15:00Z'),   // yesterday's game — ET Aug 9 AND 22h stale
      g(2, 'Royals', 'Dodgers', '2026-08-11T02:10:00Z'),  // 10:10 PM ET Aug 10 — UTC says Aug 11, ET law keeps it
      g(3, 'Mets', 'Braves', '2026-08-10T23:15:00Z'),
    ];
    expect(filterSlateGames(rows, D, NOW).map(r => r.id)).toEqual([2, 3]);
  });

  it('collapses the same matchup at the same start under two feed ids; real doubleheaders both survive', () => {
    const rows = [
      g(10, 'Red Sox', 'Blue Jays', '2026-08-10T17:05:00Z'),
      g(11, 'Red Sox', 'Blue Jays', '2026-08-10T17:05:00Z'), // duplicate feed row
      g(12, 'Red Sox', 'Blue Jays', '2026-08-10T23:05:00Z'), // game 2 of a real DH
    ];
    expect(filterSlateGames(rows, D, NOW).map(r => r.id)).toEqual([10, 12]);
  });

  it('never drops a game on parse doubt: missing or garbage start times stay', () => {
    const rows = [g(20, 'Cubs', 'Nationals', null), g(21, 'Rays', 'Athletics', 'TBD')];
    expect(filterSlateGames(rows, D, NOW).map(r => r.id)).toEqual([20, 21]);
  });

  it('a bare date string is the feed\'s own date claim — compared directly, no timezone shift', () => {
    const rows = [g(30, 'A', 'B', '2026-08-10'), g(31, 'C', 'D', '2026-08-09')];
    expect(filterSlateGames(rows, D, NOW).map(r => r.id)).toEqual([30]);
  });

  it('with no target dates, only staleness and dedupe apply', () => {
    const rows = [g(40, 'A', 'B', '2026-08-09T23:15:00Z'), g(41, 'C', 'D', '2026-08-10T23:15:00Z')];
    expect(filterSlateGames(rows, [], NOW).map(r => r.id)).toEqual([41]);
  });

  it('uses the 6 AM boundary for NCAAF only', () => {
    const rows = [
      g(50, 'Hawaii', 'Stanford', '2026-09-06T05:30:00Z'), // 1:30 AM ET
      g(51, 'Army', 'Navy', '2026-09-06T10:00:00Z'),       // 6:00 AM ET
    ];
    expect(filterSlateGames(rows, ['2026-09-05'], NOW, 'americanfootball_ncaaf').map(r => r.id))
      .toEqual([50]);
    expect(filterSlateGames(rows, ['2026-09-06'], NOW, 'americanfootball_ncaaf').map(r => r.id))
      .toEqual([51]);
    expect(filterSlateGames(rows, ['2026-09-06'], NOW, 'baseball_mlb').map(r => r.id))
      .toEqual([50, 51]);
  });
});
