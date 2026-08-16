import { describe, expect, it } from 'vitest';

import { buildFootballMarketRangeRows } from '../../../src/services/insights/computers/footballMarketRange.js';

const game = {
  id: 77,
  date: '2026-08-29T23:30:00.000Z',
  visitor_team: { abbreviation: 'UNC' },
  home_team: { abbreviation: 'TCU' },
};
const helpers = { gameLabel: () => 'UNC @ TCU' };

describe('football market range', () => {
  it('publishes one exact-game sportsbook fault line and excludes prediction markets', () => {
    const rows = buildFootballMarketRangeRows({
      league: 'ncaaf',
      date: '2026-08-29',
      games: [game],
      helpers,
      now: new Date('2026-08-29T20:00:00.000Z'),
      odds: [
        { game_id: 77, vendor: 'FanDuel', total_value: 52.5, spread_home_value: -2.5, updated_at: '2026-08-28T18:00:00Z' },
        { game_id: 77, vendor: 'DraftKings', total_value: 55.5, spread_home_value: -3, updated_at: '2026-08-28T18:01:00Z' },
        { game_id: 77, vendor: 'BetMGM', total_value: 54, spread_home_value: -2.25, updated_at: '2026-08-28T18:02:00Z' },
        { game_id: 77, vendor: 'Kalshi', total_value: 41, spread_home_value: 7, updated_at: '2026-08-28T18:03:00Z' },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'market_range',
      game_id: 77,
      value: '52.5–55.5 O/U',
      meta: {
        metric: 'sportsbook_total_range',
        low: 52.5,
        high: 55.5,
        range: 3,
        book_count: 3,
        grade: 'context',
      },
    });
    expect(rows[0].meta.vendors).not.toContain('Kalshi');
    expect(rows[0].detail).toContain('not a public-bet or sharp-money signal');
  });

  it('never publishes in-game quotes or calls a saved pregame range current after kickoff', () => {
    const odds = [
      { game_id: 77, vendor: 'FanDuel', total_value: 52.5, updated_at: '2026-08-29T22:00:00Z' },
      { game_id: 77, vendor: 'DraftKings', total_value: 55.5, updated_at: '2026-08-29T22:01:00Z' },
      { game_id: 77, vendor: 'BetMGM', total_value: 54, updated_at: '2026-08-29T23:31:00Z' },
      { game_id: 77, vendor: 'Caesars', total_value: 56, updated_at: '2026-08-29T23:32:00Z' },
    ];

    expect(buildFootballMarketRangeRows({
      league: 'ncaaf', date: '2026-08-29', games: [game], odds, helpers,
      now: new Date('2026-08-29T22:30:00.000Z'),
    })).toEqual([]);
    expect(buildFootballMarketRangeRows({
      league: 'ncaaf', date: '2026-08-29', games: [game], odds, helpers,
      now: new Date('2026-08-30T00:00:00.000Z'),
    })).toEqual([]);
  });

  it('stays absent below the materiality threshold or with fewer than three books', () => {
    const odds = [
      { game_id: 77, vendor: 'FanDuel', total_value: 52.5, spread_home_value: -2.5 },
      { game_id: 77, vendor: 'DraftKings', total_value: 53, spread_home_value: -3 },
    ];
    expect(buildFootballMarketRangeRows({ league: 'nfl', date: '2026-09-10', games: [game], helpers, odds }))
      .toEqual([]);
  });

  it('remains a college-native module instead of copying the feature into NFL', () => {
    const odds = [
      { game_id: 77, vendor: 'FanDuel', total_value: 40, spread_home_value: -1 },
      { game_id: 77, vendor: 'DraftKings', total_value: 47, spread_home_value: -4 },
      { game_id: 77, vendor: 'BetMGM', total_value: 44, spread_home_value: -2 },
    ];
    expect(buildFootballMarketRangeRows({ league: 'nfl', date: '2026-09-10', games: [game], helpers, odds }))
      .toEqual([]);
  });
});
