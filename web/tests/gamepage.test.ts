import { describe, expect, it } from 'vitest';
import {
  adjacentDates,
  findGamePicks,
  gamePagePaths,
  gameSlug,
  matchPickResult,
  matchPropResult,
  normalizePickText,
  pageSummary,
  parseGameSlug,
  propsForGame,
  teamSlug,
} from '@/lib/gary/gamepage';
import type { GameResultRow, GaryPick, PropPick, PropResultRow } from '@/lib/gary/types';

const pick = (o: Partial<GaryPick>): GaryPick => ({
  league: 'MLB', awayTeam: 'Cubs', homeTeam: 'Reds', pick: 'Cubs ML -118',
  rationale: 'MATCHUP: Chase Burns gives the Reds a real starting-pitching edge. But the nine-inning profile puts me on the Cubs.',
  commence_time: '2026-08-30T17:40:00.000Z', ...o,
});

describe('slugs', () => {
  it('slugs clubs and round-trips the game slug', () => {
    expect(teamSlug('Blue Jays')).toBe('blue-jays');
    expect(teamSlug('St. Louis Cardinals')).toBe('st-louis-cardinals');
    expect(gameSlug('Red Sox', 'Yankees')).toBe('red-sox-at-yankees');
    expect(parseGameSlug('red-sox-at-yankees')).toEqual({ away: 'red-sox', home: 'yankees' });
    expect(parseGameSlug('athletics-at-orioles')).toEqual({ away: 'athletics', home: 'orioles' });
  });

  it('rejects garbage slugs', () => {
    expect(parseGameSlug('cubs')).toBeNull();
    expect(parseGameSlug('-at-reds')).toBeNull();
    expect(parseGameSlug('cubs-at-')).toBeNull();
    expect(parseGameSlug('Cubs-at-Reds')).toBeNull();
  });
});

describe('findGamePicks', () => {
  const board = [
    pick({}),
    pick({ awayTeam: 'White Sox', homeTeam: 'Twins', pick: 'White Sox ML +104' }),
    pick({ awayTeam: 'Red Sox', homeTeam: 'Yankees', pick: 'Red Sox ML -142' }),
    pick({ league: 'NFL', awayTeam: 'Patriots', homeTeam: 'Seahawks', pick: 'Seahawks -3.5 -110' }),
  ];

  it('matches the exact slug inside the league', () => {
    expect(findGamePicks(board, 'MLB', 'cubs-at-reds').map(p => p.pick)).toEqual(['Cubs ML -118']);
    expect(findGamePicks(board, 'MLB', 'patriots-at-seahawks')).toEqual([]);
    expect(findGamePicks(board, 'NFL', 'patriots-at-seahawks')).toHaveLength(1);
  });

  it('Red Sox never answers for White Sox', () => {
    expect(findGamePicks(board, 'MLB', 'red-sox-at-yankees').map(p => p.pick)).toEqual(['Red Sox ML -142']);
    expect(findGamePicks(board, 'MLB', 'white-sox-at-twins').map(p => p.pick)).toEqual(['White Sox ML +104']);
  });

  it('tolerates a full club name in the data against a nickname in the URL', () => {
    const full = [pick({ awayTeam: 'Toronto Blue Jays', homeTeam: 'Seattle Mariners', pick: 'Mariners ML -132' })];
    expect(findGamePicks(full, 'MLB', 'blue-jays-at-mariners')).toHaveLength(1);
  });
});

describe('matchPickResult', () => {
  const results: GameResultRow[] = [
    { game_date: '2026-08-30', league: 'MLB', matchup: 'Cubs @ Reds', pick_text: 'Cubs ML -118', result: 'won', final_score: '6-3', confidence: 0.7 },
    { game_date: '2026-08-30', league: 'MLB', matchup: 'Red Sox @ Yankees', pick_text: 'Red Sox ML -142', result: 'Lost', final_score: '1-16', confidence: 0.6 },
    { game_date: '2026-08-30', league: 'MLB', matchup: 'White Sox @ Twins', pick_text: 'White Sox ML +104', result: 'lost', final_score: '1-5', confidence: 0.5 },
  ];

  it('matches on pick text with the odds ignored', () => {
    expect(normalizePickText('Cubs ML (-118)')).toBe('cubs ml');
    expect(matchPickResult(pick({ pick: 'Cubs ML -125' }), results)?.final_score).toBe('6-3');
  });

  it('falls back to the matchup when the text differs, still requiring both clubs', () => {
    const r = matchPickResult(pick({ awayTeam: 'Red Sox', homeTeam: 'Yankees', pick: 'Red Sox moneyline' }), results);
    expect(r?.final_score).toBe('1-16');
    expect(matchPickResult(pick({ awayTeam: 'Red Sox', homeTeam: 'Rays', pick: 'Red Sox moneyline' }), results)).toBeNull();
  });
});

describe('props', () => {
  const props: PropPick[] = [
    { player: 'Kyle Tucker', prop: 'total_bases', bet: 'Over', line: 1.5, matchup: 'Cubs @ Reds', league: 'MLB' },
    { player: 'Aaron Judge', prop: 'home_runs', bet: 'Over', line: 0.5, matchup: 'Red Sox @ Yankees', league: 'MLB' },
  ];
  const propResults: PropResultRow[] = [
    { game_date: '2026-08-30', player_name: 'Kyle Tucker', prop_type: 'total_bases', line_value: 1.5, actual_value: 3, result: 'won', odds: '-115', pick_text: 'Kyle Tucker Over 1.5 Total Bases', matchup: 'Cubs @ Reds', bet: 'Over' },
  ];

  it('keeps only the props written for this game and grades the ones it can', () => {
    const mine = propsForGame(props, pick({}));
    expect(mine.map(p => p.player)).toEqual(['Kyle Tucker']);
    expect(matchPropResult(mine[0], propResults)?.result).toBe('won');
    expect(matchPropResult(props[1], propResults)).toBeNull();
  });
});

describe('page helpers', () => {
  it('walks adjacent board dates from a newest-first list', () => {
    const dates = ['2026-09-01', '2026-08-31', '2026-08-29', '2026-08-28'];
    expect(adjacentDates(dates, '2026-08-29')).toEqual({ prev: '2026-08-28', next: '2026-08-31' });
    expect(adjacentDates(dates, '2026-09-01')).toEqual({ prev: '2026-08-31', next: null });
    expect(adjacentDates(dates, '2026-08-28')).toEqual({ prev: null, next: '2026-08-29' });
  });

  it('summarizes the read from its first sentence without the section label and never mid-word', () => {
    expect(pageSummary(pick({}))).toBe('Chase Burns gives the Reds a real starting-pitching edge.');
    const long = pick({ rationale: 'A '.repeat(200).trim() + ' end.' });
    const s = pageSummary(long, 40);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith(' ')).toBe(false);
  });

  it('builds one page path per (sport, date, matchup) from the index view', () => {
    const paths = gamePagePaths([
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' },
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' }, // side + total -> one page
      { date: '2026-08-30', league: 'baseball_mlb', sport: null, away_team: 'Rays', home_team: 'Padres' },
      { date: '2026-06-20', league: 'EPL', sport: null, away_team: 'Arsenal', home_team: 'Spurs' },   // no routable sport
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: null, home_team: 'Reds' },
    ]);
    expect(paths).toEqual([
      { sport: 'mlb', date: '2026-08-30', slug: 'cubs-at-reds' },
      { sport: 'mlb', date: '2026-08-30', slug: 'rays-at-padres' },
    ]);
  });
});
