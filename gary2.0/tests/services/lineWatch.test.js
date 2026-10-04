import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_INTERVAL_MS, NEAR_KICKOFF_INTERVAL_MS, pollDue, weekDates, inQuietHours,
  runLineWatchTick, resetLineWatch, upcomingWeekGames,
} from '../../src/services/lineWatch.js';
import { boardsOfGame } from '../../src/services/oddsSnapshots.js';

// 11:00 AM ET on Sep 9 2026 (15:00Z).
const MIDDAY = new Date('2026-09-09T15:00:00.000Z');
// 3:00 AM ET the same day (07:00Z).
const NIGHT = new Date('2026-09-09T07:00:00.000Z');

describe('THE LINE WATCH cadence (Sep 9 2026)', () => {
  it('is quiet 1-6 AM ET and polls every 30 minutes otherwise', () => {
    expect(inQuietHours(NIGHT)).toBe(true);
    expect(inQuietHours(MIDDAY)).toBe(false);
    expect(pollDue({ now: NIGHT, lastPollAt: null })).toBe(false);
    expect(pollDue({ now: MIDDAY, lastPollAt: null })).toBe(true);
    expect(pollDue({ now: MIDDAY, lastPollAt: new Date(MIDDAY.getTime() - BASE_INTERVAL_MS + 60_000) })).toBe(false);
    expect(pollDue({ now: MIDDAY, lastPollAt: new Date(MIDDAY.getTime() - BASE_INTERVAL_MS) })).toBe(true);
  });

  it('tightens to every 10 minutes inside the last three hours before a kickoff', () => {
    const kickoff = new Date(MIDDAY.getTime() + 2 * 3600_000);
    const tenAgo = new Date(MIDDAY.getTime() - NEAR_KICKOFF_INTERVAL_MS);
    expect(pollDue({ now: MIDDAY, lastPollAt: tenAgo, nextKickoffAt: kickoff })).toBe(true);
    expect(pollDue({ now: MIDDAY, lastPollAt: tenAgo, nextKickoffAt: new Date(MIDDAY.getTime() + 9 * 3600_000) })).toBe(false);
  });

  it('names the next seven ET dates starting today', () => {
    expect(weekDates(MIDDAY)).toEqual([
      '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
    ]);
  });
});

describe('THE LINE WATCH tick', () => {
  const nflGame = (id, iso) => ({ id, date: iso, status: iso, season: 2026, week: 1, season_type: 2, postseason: false,
    home_team: { id: 1, full_name: 'Seattle Seahawks' }, visitor_team: { id: 2, full_name: 'New England Patriots' } });

  beforeEach(() => resetLineWatch());

  it('polls each due league once per interval: one slate fetch, one odds fetch, the boards recorded', async () => {
    const games = [nflGame(5001, '2026-09-10T00:20:00.000Z'), nflGame(5002, '2026-09-14T17:00:00.000Z')];
    const bdl = { getGames: vi.fn(async () => games), getTeams: vi.fn(async () => []) };
    const boards = [{ id: 5001, commence_time: '2026-09-10T00:20:00.000Z', home_team: 'Seattle Seahawks', away_team: 'New England Patriots', bookmakers: [] }];
    const odds = { getGamesWithOddsByIds: vi.fn(async () => boards) };
    const record = vi.fn(async () => 3);
    const log = vi.fn();

    const first = await runLineWatchTick({ now: MIDDAY, log, sports: ['americanfootball_nfl'], bdl, odds, record });
    expect(first).toEqual([{ sport: 'americanfootball_nfl', games: 2, recorded: 3 }]);
    expect(bdl.getGames).toHaveBeenCalledTimes(1);
    expect(bdl.getGames.mock.calls[0][1]).toMatchObject({ dates: weekDates(MIDDAY), season_type: [1, 2, 3] });
    expect(odds.getGamesWithOddsByIds).toHaveBeenCalledWith('americanfootball_nfl', games);
    expect(record).toHaveBeenCalledWith('americanfootball_nfl', boards);
    expect(log.mock.calls[0][0]).toContain('LINE WATCH NFL: 2 game(s) this week, 3 board change(s) recorded');

    // Five minutes later nothing is due; the slate cache is untouched.
    const again = await runLineWatchTick({ now: new Date(MIDDAY.getTime() + 5 * 60_000), log, sports: ['americanfootball_nfl'], bdl, odds, record });
    expect(again).toEqual([]);
    expect(odds.getGamesWithOddsByIds).toHaveBeenCalledTimes(1);

    // Thirty minutes later it polls again from the cached slate (no second game fetch).
    const later = await runLineWatchTick({ now: new Date(MIDDAY.getTime() + BASE_INTERVAL_MS), log, sports: ['americanfootball_nfl'], bdl, odds, record });
    expect(later[0]).toMatchObject({ games: 2, recorded: 3 });
    expect(bdl.getGames).toHaveBeenCalledTimes(1);
    expect(odds.getGamesWithOddsByIds).toHaveBeenCalledTimes(2);
  });

  it('drops games already twenty minutes past kickoff and survives a failed poll', async () => {
    const bdl = { getGames: vi.fn(async () => [nflGame(1, '2026-09-09T14:00:00.000Z'), nflGame(2, '2026-09-13T17:00:00.000Z')]), getTeams: vi.fn() };
    const ahead = await upcomingWeekGames('americanfootball_nfl', MIDDAY, { bdl });
    expect(ahead.map((g) => g.id)).toEqual([2]);

    resetLineWatch();
    const failing = { getGames: vi.fn(async () => { throw new Error('BDL 503'); }), getTeams: vi.fn() };
    const log = vi.fn();
    const out = await runLineWatchTick({ now: MIDDAY, log, sports: ['americanfootball_nfl'], bdl: failing, odds: { getGamesWithOddsByIds: vi.fn() }, record: vi.fn() });
    expect(out).toEqual([{ sport: 'americanfootball_nfl', error: 'BDL 503' }]);
    expect(log.mock.calls[0][0]).toContain('line watch NFL skipped (BDL 503)');
    // The failure counts as a poll: nothing fires again a minute later.
    const next = await runLineWatchTick({ now: new Date(MIDDAY.getTime() + 60_000), log, sports: ['americanfootball_nfl'], bdl: failing, odds: { getGamesWithOddsByIds: vi.fn() }, record: vi.fn() });
    expect(next).toEqual([]);
  });
});

describe('odds snapshots carry the total (Sep 9 2026)', () => {
  it('reads Over/Under from each book into the board', () => {
    const game = {
      home_team: 'Seattle Seahawks', away_team: 'New England Patriots',
      bookmakers: [{
        key: 'draftkings',
        markets: [
          { key: 'h2h', outcomes: [{ name: 'Seattle Seahawks', price: -170 }, { name: 'New England Patriots', price: 142 }] },
          { key: 'spreads', outcomes: [{ name: 'Seattle Seahawks', point: -3, price: -120 }, { name: 'New England Patriots', point: 3, price: 100 }] },
          { key: 'totals', outcomes: [{ name: 'Over', point: 44.5, price: -110 }, { name: 'Under', point: 44.5, price: -110 }] },
        ],
      }],
    };
    expect(boardsOfGame(game)).toEqual([{
      moneyline_home: -170, moneyline_away: 142,
      spread_home: -3, spread_home_odds: -120, spread_away: 3, spread_away_odds: 100,
      total: 44.5, total_over_odds: -110, total_under_odds: -110,
      line_vendor: 'draftkings',
    }]);
  });
});
