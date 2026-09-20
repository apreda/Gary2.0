import { describe, expect, it, vi } from 'vitest';
import { SPORT_CONFIG } from '../../scripts/lib/pickRunSports.js';
import { selectPickGameWindow } from '../../scripts/lib/picks/window.js';
import { pickGameDate } from '../../scripts/lib/picks/calendar.js';
import { createPickGameDiscovery } from '../../scripts/lib/picks/discovery.js';
import { createSlateRecovery, mergeExactGameWithSlate } from '../../scripts/lib/picks/slate.js';
import { createPickOdds, formatOddsForStorage } from '../../scripts/lib/picks/odds.js';

const quiet = { log() {}, warn() {} };
const game = (id, commence_time) => ({ id, commence_time, home_team: 'Home', away_team: 'Away' });

describe('the shipping pick-runner date window', () => {
  it('uses the same league date for discovery, publication and deduplication', () => {
    expect(pickGameDate('NCAAF', '2026-09-20T04:30:00Z')).toBe('2026-09-19');
    expect(pickGameDate('americanfootball_ncaaf', '2026-09-20T04:30:00Z')).toBe('2026-09-19');
    expect(pickGameDate('MLB', '2026-09-20T04:30:00Z')).toBe('2026-09-20');
    expect(pickGameDate('NCAAF', '2026-09-19')).toBeNull();
    expect(pickGameDate('MLB', 'unknown')).toBeNull();
  });
  it.each([
    ['2026-09-19', '2026-09-20T04:30:00Z', '2026-09-20T03:00:00Z'],
    ['2026-03-07', '2026-03-08T07:30:00Z', '2026-03-08T04:00:00Z'],
    ['2026-10-31', '2026-11-01T06:30:00Z', '2026-11-01T03:00:00Z'],
  ])('keeps after-midnight college kickoffs on slate %s with and without an explicit date', (date, kickoff, now) => {
    const games = [game(1, kickoff)];
    const options = { now: new Date(now), console: quiet };
    expect(selectPickGameWindow(games, SPORT_CONFIG.ncaaf, options).games).toEqual(games);
    expect(selectPickGameWindow(games, SPORT_CONFIG.ncaaf, { ...options, dateFilter: date }).games).toEqual(games);
  });

  it('does not pull the next college slate across the 6 a.m. Eastern cutoff', () => {
    const games = [game(1, '2026-09-20T09:59:00Z'), game(2, '2026-09-20T10:00:00Z')];
    expect(selectPickGameWindow(games, SPORT_CONFIG.ncaaf, { dateFilter: '2026-09-19', console: quiet }).games).toEqual([games[0]]);
  });

  it('keeps MLB midnight separate from the college playing-date cutoff', () => {
    const games = [game(1, '2026-09-20T03:59:00Z'), game(2, '2026-09-20T04:00:00Z')];
    expect(selectPickGameWindow(games, SPORT_CONFIG.mlb, { dateFilter: '2026-09-19', console: quiet }).games).toEqual([games[0]]);
  });

  it('preserves comma-separated explicit dates and excludes malformed kickoff values', () => {
    const games = [game(1, '2026-09-19T20:00:00Z'), game(2, '2026-09-20T20:00:00Z'), game(3, 'unknown')];
    expect(selectPickGameWindow(games, SPORT_CONFIG.mlb, { dateFilter: '2026-09-19, 2026-09-20', console: quiet }).games).toEqual(games.slice(0, 2));
  });

  it('retains the NFL weekly selector and explicit-date override', () => {
    const games = [game(1, '2026-09-13T17:00:00Z'), game(2, '2026-09-15T00:20:00Z'), game(3, '2026-09-20T17:00:00Z')];
    const options = { now: new Date('2026-09-12T12:00:00Z'), console: quiet,
      picksService: { getNFLWeekStart: () => '2026-09-08', getNFLWeekNumber: () => 1 } };
    expect(selectPickGameWindow(games, SPORT_CONFIG.nfl, options).games).toEqual(games.slice(0, 2));
    expect(selectPickGameWindow(games, SPORT_CONFIG.nfl, { ...options, dateFilter: '2026-09-20' }).games).toEqual([games[2]]);
  });
});

describe('exact-slate recovery and market ownership', () => {
  it('retains missing prices and internal college provenance when recovering a saved game', async () => {
    const eq = vi.fn(() => query);
    const query = { select: () => query, eq, limit: async () => ({ data: [{ bdl_game_id: '99',
      home_team: 'Home', away_team: 'Away', commence_time: '2026-09-19T20:00:00Z', spread: null }] }) };
    const { fetchDailySlateGame } = createSlateRecovery({ supabase: { from: () => query } });
    expect(await fetchDailySlateGame('americanfootball_ncaaf', '2026-09-19', 99)).toMatchObject({
      bdl_game_id: '99', spread_home: null, moneyline_home: null, bookmakers: [],
      ncaaf_fbs_verified: true, ncaaf_fbs_verification_source: 'daily_slate',
    });
    expect(eq).toHaveBeenCalledWith('bdl_game_id', '99');
    expect(eq).toHaveBeenCalledWith('date', '2026-09-19');
  });

  it('keeps live provider quotes above opening snapshots without inventing a spread price', () => {
    const opening = { moneyline_home: -110, moneyline_away: 100, spread_home: -2.5, spread_away: 2.5, line_vendor: 'opening' };
    expect(mergeExactGameWithSlate({ moneyline_home: -120, moneyline_away: 110, spread_home: -3.5 }, opening)).toMatchObject({
      moneyline_home: -120, moneyline_away: 110, spread_home: -2.5, spread_home_odds: null,
    });
    expect(mergeExactGameWithSlate({ market_source: 'the_odds_api', moneyline_home: -130 }, opening)).toMatchObject({
      moneyline_home: -130, line_snapshot: 'live',
    });
  });

  it('preserves quote values and excludes prediction-market vendors from stored comparisons', async () => {
    const getOddsV2 = vi.fn(async () => [{ vendor: 'book', spread_home_value: '-3.5',
      spread_home_odds: -110, spread_away_value: '3.5', spread_away_odds: -105,
      moneyline_home_odds: -150, moneyline_away_odds: 130 }]);
    const { fetchSportsbookOdds } = createPickOdds({ ballDontLieService: { getOddsV2 }, console: quiet });
    const rows = await fetchSportsbookOdds('americanfootball_nfl', 99);
    expect(getOddsV2).toHaveBeenCalledWith({ game_ids: [99] }, 'americanfootball_nfl');
    expect(formatOddsForStorage([...rows, { vendor: 'kalshi' }], 'Away +3.5', 'Home', 'Away')).toEqual([
      expect.objectContaining({ book: 'book', spread: 3.5, spread_odds: -105, ml: 130 }),
    ]);
  });
});

it('the assembled discovery honors an exact game ID and never opens unrelated postseason discovery', async () => {
  const first = { ...game(1, '2026-09-13T17:00:00Z'), postseason: false };
  const second = { ...game(2, '2026-09-13T18:00:00Z'), postseason: false };
  const oddsService = { getUpcomingGames: vi.fn(async () => [first, second]) };
  const getGames = vi.fn(() => { throw new Error('unexpected postseason call'); });
  const { discoverPickGames } = createPickGameDiscovery({ oddsService,
    picksService: { getNFLWeekStart: () => '2026-09-08', getNFLWeekNumber: () => 1 },
    ballDontLieService: { getGames }, fetchDailySlateGame: async () => null, console: quiet });
  expect(await discoverPickGames(SPORT_CONFIG.nfl, { gameIdFilter: '2', dateFilter: '2026-09-13' })).toEqual([second]);
  expect(getGames).not.toHaveBeenCalled();
  expect(oddsService.getUpcomingGames).toHaveBeenCalledWith('americanfootball_nfl', expect.objectContaining({ targetDate: '2026-09-13' }));
});
