import { describe, expect, it, vi } from 'vitest';
import {
  adjacentDates,
  fetchPickIndex,
  fetchPickIndexForDates,
  findGamePicks,
  gamePagePaths,
  gameSlug,
  matchPickResult,
  matchPropResult,
  normalizePickText,
  pageSummary,
  parseGameSlug,
  publishedGamePathSet,
  propsForGame,
  resultGamePath,
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

describe('result links', () => {
  it('builds a permanent analysis path from a routable graded result', () => {
    expect(resultGamePath({
      game_date: '2026-08-30',
      league: 'MLB',
      matchup: 'Red Sox @ Yankees',
      pick_text: 'Red Sox ML -142',
      result: 'lost',
      final_score: '1-16',
      confidence: 0.6,
    })).toBe('/picks/mlb/2026-08-30/red-sox-at-yankees');
  });

  it('does not invent a page for incomplete or unroutable rows', () => {
    const base = {
      game_date: '2026-08-30', pick_text: 'A ML', result: 'won',
      final_score: '3-1', confidence: 0.6,
    };
    expect(resultGamePath({ ...base, league: 'EPL', matchup: 'A @ B' })).toBeNull();
    expect(resultGamePath({ ...base, league: 'MLB', matchup: 'Unknown' })).toBeNull();
  });

  it('deduplicates the page index into exact public paths', () => {
    const paths = publishedGamePathSet([
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' },
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' },
    ]);
    expect([...paths]).toEqual(['/picks/mlb/2026-08-30/cubs-at-reds']);
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

  it('normalizes moneyline wording while still requiring both clubs', () => {
    const r = matchPickResult(pick({ awayTeam: 'Red Sox', homeTeam: 'Yankees', pick: 'Red Sox moneyline' }), results);
    expect(r?.final_score).toBe('1-16');
    expect(matchPickResult(pick({ awayTeam: 'Red Sox', homeTeam: 'Rays', pick: 'Red Sox moneyline' }), results)).toBeNull();
  });

  it('does not borrow a different market from the same matchup', () => {
    const sameGame: GameResultRow[] = [
      { game_date: '2026-08-30', league: 'MLB', matchup: 'Cubs @ Reds', pick_text: 'Cubs ML -118', result: 'won', final_score: '6-3', confidence: 0.7 },
      { game_date: '2026-08-30', league: 'MLB', matchup: 'Cubs @ Reds', pick_text: 'Cubs -1.5 +135', result: 'lost', final_score: '6-3', confidence: 0.6 },
    ];
    expect(matchPickResult(pick({ pick: 'Cubs -2.5 +190' }), sameGame)).toBeNull();
  });

  it('never borrows an identical total from another matchup', () => {
    const totals: GameResultRow[] = [
      { game_date: '2026-07-06', league: 'WC', matchup: 'Belgium @ USA', pick_text: 'Under 2.5', result: 'lost', final_score: '4-1', confidence: 0.6 },
      { game_date: '2026-07-06', league: 'WC', matchup: 'Spain @ Portugal', pick_text: 'Under 2.5', result: 'won', final_score: '1-0', confidence: 0.6 },
    ];
    const spain = pick({ league: 'WC', awayTeam: 'Spain', homeTeam: 'Portugal', pick: 'Under 2.5' });
    expect(matchPickResult(spain, totals)?.final_score).toBe('1-0');
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

  it('accepts the written “at” matchup separator without matching another game', () => {
    const written = [
      { ...props[0], matchup: 'Cubs at Reds' },
      { ...props[1], matchup: 'Red Sox at Yankees' },
    ];
    expect(propsForGame(written, pick({})).map(p => p.player)).toEqual(['Kyle Tucker']);
  });

  it('does not confuse two markets for the same player and matchup', () => {
    const earnedRuns: PropPick = {
      player: 'Connor Prielipp', prop: 'pitcher_earned_runs 2.5', bet: 'over', line: '2.5', matchup: 'Twins @ Athletics',
    };
    const strikeouts: PropPick = {
      player: 'Connor Prielipp', prop: 'pitcher_strikeouts 5.5', bet: 'over', line: '5.5', matchup: 'Twins @ Athletics',
    };
    const splitResults: PropResultRow[] = [
      { game_date: '2026-08-26', player_name: 'Connor Prielipp', prop_type: 'pitcher_earned_runs', line_value: 2.5, actual_value: 3, result: 'won', odds: '-110', pick_text: 'Connor Prielipp over 2.5 pitcher_earned_runs', matchup: 'Twins @ Athletics', bet: 'over' },
      { game_date: '2026-08-26', player_name: 'Connor Prielipp', prop_type: 'pitcher_strikeouts', line_value: 5.5, actual_value: 5, result: 'lost', odds: '-110', pick_text: 'Connor Prielipp over 5.5 pitcher_strikeouts', matchup: 'Twins @ Athletics', bet: 'over' },
    ];
    expect(matchPropResult(earnedRuns, splitResults)?.result).toBe('won');
    expect(matchPropResult(strikeouts, splitResults)?.result).toBe('lost');
  });

  it('uses the stored market suffix when a legacy prop has no separate line', () => {
    const alternatives = [
      { ...propResults[0], line_value: 1.5, actual_value: 2, result: 'won' },
      { ...propResults[0], line_value: 2.5, actual_value: 2, result: 'lost', pick_text: 'Kyle Tucker Over 2.5 Total Bases' },
    ];
    const legacy = { ...props[0], prop: 'total_bases 2.5', line: undefined };

    expect(matchPropResult(legacy, alternatives)).toBe(alternatives[1]);
    expect(matchPropResult({ ...legacy, line: 1.5 }, alternatives)).toBe(alternatives[0]);
  });

  it.each([undefined, '', '   '])('does not let an unknown line (%s) match a zero line', line => {
    const zero = { ...propResults[0], line_value: 0, pick_text: 'Kyle Tucker Over 0 Total Bases' };
    expect(matchPropResult({ ...props[0], line }, [zero])).toBeNull();
    expect(matchPropResult({ ...props[0], line: 0 }, [zero])).toBe(zero);
  });

  it.each([undefined, '', '   '])('does not treat a missing side (%s) as Over or Under', bet => {
    expect(matchPropResult({ ...props[0], bet }, propResults)).toBeNull();
  });

  it('does not select an arbitrary grade when multiple rows match the same ticket', () => {
    const repeatedTicket = [propResults[0], { ...propResults[0], result: 'lost', actual_value: 0 }];
    expect(matchPropResult(props[0], repeatedTicket)).toBeNull();
    expect(matchPropResult(props[0], [...repeatedTicket].reverse())).toBeNull();
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

  it('uses prose after a historical fixed-width stats table without changing the analysis', () => {
    const rationale = [
      'TALE OF THE TAPE',
      '',
      '                    UTSA Roadrunners     FIU Panthers',
      'Record                6-6       ←           4-8',
      'Passing TDs            31       ←            18',
      'Key Injuries      D. Martin (OUT)      M. Clark (OUT)',
      '',
      "Gary's Take",
      'Both teams bring different passing attacks to this bowl game. The matchup turns on the secondary.',
    ].join('\n');
    const historical = pick({ rationale, rationale_plain: rationale });
    expect(pageSummary(historical)).toBe('Both teams bring different passing attacks to this bowl game.');
    expect(historical.rationale).toBe(rationale);
    expect(historical.rationale_plain).toBe(rationale);
  });

  it('skips Markdown headings and tables and preserves wrapped prose', () => {
    const rationale = [
      '## TALE OF THE TAPE',
      '| Team | Record |',
      '| --- | --- |',
      '| Cubs | 6-4 |',
      '',
      "**Gary’s Take**",
      'The Cubs bring a rested bullpen',
      'into the final game of the series. Both starters have worked deep recently.',
    ].join('\n');
    expect(pageSummary(pick({ rationale }))).toBe('The Cubs bring a rested bullpen into the final game of the series.');
  });

  it('falls back to full analysis when the plain read has no prose', () => {
    expect(pageSummary(pick({ rationale_plain: 'TALE OF THE TAPE\n\n| Record | 6-4 |' })))
      .toBe('Chase Burns gives the Reds a real starting-pitching edge.');
    expect(pageSummary(pick({ rationale_plain: '', rationale: '' }))).toBe('');
  });

  it('keeps a useful plain read ahead of the full analysis', () => {
    expect(pageSummary(pick({ rationale_plain: 'The bullpen is rested. The next sentence is additional context.' })))
      .toBe('The bullpen is rested.');
  });

  it('builds one page path per (sport, date, matchup) from the index view', () => {
    const paths = gamePagePaths([
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' },
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: 'Cubs', home_team: 'Reds' }, // side + total -> one page
      { date: '2026-08-30', league: 'baseball_mlb', sport: null, away_team: 'Rays', home_team: 'Padres' },
      { date: '2026-06-20', league: 'EPL', sport: null, away_team: 'Arsenal', home_team: 'Spurs' },   // no routable sport
      { date: '2026-08-30', league: 'MLB', sport: null, away_team: null, home_team: 'Reds' },
      { date: '2099-08-30', league: 'MLB', sport: null, away_team: 'Future', home_team: 'Game' },
    ]);
    expect(paths).toEqual([
      { sport: 'mlb', date: '2026-08-30', slug: 'cubs-at-reds' },
      { sport: 'mlb', date: '2026-08-30', slug: 'rays-at-padres' },
    ]);
  });
});

describe('pick index pagination', () => {
  it('uses the unique row key to order equal-date rows on every page and date slice', async () => {
    const page = Array.from({ length: 1000 }, (_, index) => ({
      date: '2026-08-30', league: 'MLB', sport: null,
      away_team: `Away ${index}`, home_team: 'Home',
    }));
    const urls: URL[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input));
      urls.push(url);
      return new Response(JSON.stringify(url.searchParams.get('offset') === '0' ? page : [page[0]]));
    });
    try {
      expect(await fetchPickIndex()).toHaveLength(1001);
      expect(await fetchPickIndexForDates(['2026-08-30'])).toHaveLength(1001);
      expect(urls.map(url => url.searchParams.get('offset'))).toEqual(['0', '1000', '0', '1000']);
      expect(urls.every(url => url.searchParams.get('order') === 'date.desc,row_key.asc')).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
