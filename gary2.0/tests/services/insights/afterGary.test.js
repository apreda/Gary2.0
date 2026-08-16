import { describe, expect, it, vi } from 'vitest';
import {
  americanImpliedProbability,
  buildAfterGaryRows,
  computeAfterGary,
  loadPublishedFootballPicks,
  normalizeVendor,
  resolvePublishedPickMarket,
} from '../../../src/services/insights/computers/afterGary.js';

const away = { id: 1, abbreviation: 'BAL', name: 'Ravens', full_name: 'Baltimore Ravens' };
const home = { id: 2, abbreviation: 'IND', name: 'Colts', full_name: 'Indianapolis Colts' };
const game = {
  id: 1393562,
  date: '2026-08-15T23:00:00.000Z',
  season_type: 1,
  visitor_team: away,
  away_team: away,
  home_team: home,
};

function pick(overrides = {}) {
  return {
    pick_id: 'agentic-americanfootball_nfl-1393562',
    bdl_game_id: 1393562,
    league: 'NFL',
    sport: 'americanfootball_nfl',
    pick: 'Baltimore Ravens +4 -110',
    type: 'spread',
    awayTeam: 'Baltimore Ravens',
    homeTeam: 'Indianapolis Colts',
    spread: 4,
    spreadOdds: -110,
    odds: -110,
    bestLineBook: 'betmgm',
    published_at: '2026-08-15T21:30:00.000Z',
    commence_time: '2026-08-15T23:00:00.000Z',
    ...overrides,
  };
}

function odds(overrides = {}) {
  return {
    id: 88,
    game_id: 1393562,
    vendor: 'BetMGM',
    spread_away_value: 2.5,
    spread_away_odds: -112,
    spread_home_value: -2.5,
    spread_home_odds: -108,
    moneyline_away_odds: -125,
    moneyline_home_odds: 105,
    total_value: 46,
    total_over_odds: -110,
    total_under_odds: -110,
    updated_at: '2026-08-15T22:45:00.000Z',
    ...overrides,
  };
}

const record = (value = pick(), container = {}) => ({
  pick: value,
  container: {
    created_at: '2026-08-15T21:00:00.000Z',
    updated_at: '2026-08-15T21:35:00.000Z',
    ...container,
  },
});

describe('AFTER GARY market normalization', () => {
  it('normalizes vendor identity and American implied probability', () => {
    expect(normalizeVendor('Bet MGM')).toBe('betmgm');
    expect(americanImpliedProbability(-110)).toBeCloseTo(0.52381, 5);
    expect(americanImpliedProbability(150)).toBeCloseTo(0.4, 5);
  });

  it('requires exact pick and game identity and preserves the sealed snapshot', () => {
    const resolved = resolvePublishedPickMarket(record(), game);
    expect(resolved).toMatchObject({
      gameId: '1393562',
      pickId: 'agentic-americanfootball_nfl-1393562',
      marketType: 'spread',
      pickSide: 'away',
      vendorKey: 'betmgm',
      line: 4,
      odds: -110,
      publishedAtSource: 'pick',
      kickoff: '2026-08-15T23:00:00.000Z',
    });
    expect(resolvePublishedPickMarket(record(pick({ pick_id: null })), game)).toBeNull();
    expect(resolvePublishedPickMarket(record(pick({ bdl_game_id: 999 })), game)).toBeNull();
    expect(() => resolvePublishedPickMarket(record(pick({ published_at: null })), game))
      .toThrow('requires an immutable pick.published_at timestamp');
  });
});

describe('AFTER GARY rows', () => {
  it('builds a neutral same-book spread receipt with pick-relative movement', () => {
    const rows = buildAfterGaryRows({
      league: 'NFL',
      date: '2026-08-15',
      games: [game],
      publishedPicks: [record()],
      currentOdds: [odds()],
      now: new Date('2026-08-15T22:50:00.000Z'),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      category: 'after_gary',
      headline: 'BAL +4 → +2.5',
      detail: 'BETMGM · SAME BOOK · PRE-KICK',
      game: 'BAL @ IND',
      value: 'GARY +1.5',
      tone: 'neutral',
      game_id: 1393562,
      meta: {
        kind: 'after_gary',
        grade: 'context',
        pick_id: 'agentic-americanfootball_nfl-1393562',
        game_id: '1393562',
        season_type: 1,
        market_type: 'spread',
        pick_side: 'away',
        pick_label: 'BAL',
        market_state: 'pregame',
        vendor: 'BetMGM',
        published: { line: 4, odds: -110 },
        current: { line: 2.5, odds: -112 },
        movement: {
          primary_unit: 'points',
          primary_value: 1.5,
          advantage: 'gary',
          line_delta_for_pick: -1.5,
        },
        as_of: '2026-08-15T22:45:00.000Z',
        as_of_source: 'provider_updated_at',
      },
    });
    expect(rows[0]).not.toHaveProperty('team_id');
  });

  it('omits the row when only another sportsbook has the selected market', () => {
    const rows = buildAfterGaryRows({
      league: 'nfl',
      games: [game],
      publishedPicks: [record()],
      currentOdds: [
        odds({ vendor: 'FanDuel' }),
        odds({ vendor: 'BetMGM', spread_away_value: null, spread_away_odds: null }),
      ],
      now: '2026-08-15T22:50:00.000Z',
    });
    expect(rows).toEqual([]);
  });

  it('never compares Gary\'s pregame number with an in-game or postgame price', () => {
    expect(buildAfterGaryRows({
      league: 'nfl',
      games: [game],
      publishedPicks: [record()],
      currentOdds: [odds({ updated_at: '2026-08-15T23:01:00.000Z', spread_away_value: -16.5 })],
      now: '2026-08-15T23:05:00.000Z',
    })).toEqual([]);

    const noProviderClock = odds({ updated_at: null });
    expect(buildAfterGaryRows({
      league: 'nfl',
      games: [game],
      publishedPicks: [record()],
      currentOdds: [noProviderClock],
      now: '2026-08-15T23:05:00.000Z',
    })).toEqual([]);
  });

  it('normalizes total movement for the selected over/under direction', () => {
    const over = pick({
      pick: 'Over 44.5 -110',
      type: 'total',
      spread: null,
      spreadOdds: null,
      total: 44.5,
    });
    const under = { ...over, pick_id: 'under-pick', pick: 'Under 44.5 -110' };
    const rows = buildAfterGaryRows({
      league: 'nfl',
      games: [game],
      publishedPicks: [record(over), record(under)],
      currentOdds: [odds()],
      now: '2026-08-15T23:05:00.000Z',
    });

    expect(rows.map((row) => ({ headline: row.headline, value: row.value, state: row.meta.market_state })))
      .toEqual([
        { headline: 'OVER 44.5 → 46', value: 'GARY +1.5', state: 'closed' },
        { headline: 'UNDER 44.5 → 46', value: 'NOW +1.5', state: 'closed' },
      ]);
  });

  it('uses implied-probability points for a moneyline move', () => {
    const moneyline = pick({
      pick: 'Baltimore Ravens ML -110',
      type: 'moneyline',
      spread: null,
      spreadOdds: null,
    });
    const [row] = buildAfterGaryRows({
      league: 'nfl',
      games: [game],
      publishedPicks: [record(moneyline)],
      currentOdds: [odds()],
      now: '2026-08-15T22:50:00.000Z',
    });

    expect(row.headline).toBe('BAL -110 → -125');
    expect(row.value).toBe('GARY +3.18PP');
    expect(row.meta.movement).toMatchObject({
      primary_unit: 'probability_points',
      primary_value: 3.175,
      advantage: 'gary',
      line_delta_for_pick: null,
      price_delta_pp_for_pick: -3.175,
    });
  });

  it('fetches current odds only for exact stored-pick game ids', async () => {
    const bdl = { getOddsV2: vi.fn().mockResolvedValue([odds()]) };
    const rows = await computeAfterGary({
      league: 'nfl',
      date: '2026-08-15',
      season: 2026,
      games: [game],
      bdl,
      afterGaryPicks: [record()],
      now: '2026-08-15T22:50:00.000Z',
    });

    expect(bdl.getOddsV2).toHaveBeenCalledWith(
      { game_ids: [1393562], per_page: 100 },
      'americanfootball_nfl',
      1,
    );
    expect(rows).toHaveLength(1);
  });

  it('throws when injected proof payloads are not strict arrays', async () => {
    await expect(computeAfterGary({
      league: 'nfl', date: '2026-08-15', games: [game], afterGaryPicks: {},
    })).rejects.toThrow('AFTER GARY publishedPicks must be an array');

    await expect(computeAfterGary({
      league: 'nfl', date: '2026-08-15', games: [game],
      afterGaryPicks: [record()], afterGaryOdds: null,
    })).rejects.toThrow('AFTER GARY currentOdds must be an array');
  });

  it('throws on missing proof storage config instead of reporting no receipts', async () => {
    await expect(loadPublishedFootballPicks({
      league: 'nfl',
      date: '2026-08-15',
      season: 2026,
      slateGameIds: [game.id],
      supabaseUrl: '',
      key: '',
      httpClient: { get: vi.fn() },
    })).rejects.toThrow('Supabase configuration missing for AFTER GARY proof');
  });

  it('keeps a valid empty result distinct from malformed stored picks', async () => {
    const request = {
      league: 'nfl',
      date: '2026-08-15',
      season: 2026,
      slateGameIds: [game.id],
      supabaseUrl: 'https://example.invalid',
      key: 'test',
    };

    await expect(loadPublishedFootballPicks({
      ...request,
      httpClient: { get: vi.fn().mockResolvedValue({ data: [] }) },
    })).resolves.toEqual([]);

    await expect(loadPublishedFootballPicks({
      ...request,
      httpClient: { get: vi.fn().mockResolvedValue({ data: [{ picks: '{bad-json' }] }) },
    })).rejects.toThrow('Malformed weekly_nfl_picks.picks JSON');

    await expect(loadPublishedFootballPicks({
      ...request,
      httpClient: { get: vi.fn().mockResolvedValue({ data: [{ picks: '{}' }] }) },
    })).rejects.toThrow('expected an array');

    await expect(loadPublishedFootballPicks({
      ...request,
      httpClient: {
        get: vi.fn().mockResolvedValue({ data: [{ picks: [pick({ published_at: null })] }] }),
      },
    })).rejects.toThrow('requires an immutable pick.published_at timestamp');
  });
});
