import { describe, expect, it, vi } from 'vitest';
import {
  NCAAF_PROP_MARKETS,
  NcaafPropMarketError,
  findExactNcaafEvent,
  ncaafPropOddsService,
  requireNcaafOddsApiKey,
  transformNcaafEventOdds,
} from '../../src/services/ncaafPropOddsService.js';

const event = {
  id: 'odds-event-1',
  sport_key: 'americanfootball_ncaaf',
  commence_time: '2026-09-06T01:00:00Z', // Sep 5 ET
  home_team: 'Ohio State Buckeyes',
  away_team: 'Texas Longhorns',
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe('NCAAF The Odds API credentials', () => {
  it('requires a server-side key and does not fall back to a VITE credential', () => {
    expect(() => requireNcaafOddsApiKey({ VITE_ODDS_API_KEY: 'public-key' }))
      .toThrowError(expect.objectContaining({ code: 'ODDS_API_KEY_MISSING' }));
    expect(requireNcaafOddsApiKey({ THE_ODDS_API_KEY: 'server-key' })).toBe('server-key');
  });

  it('turns a deactivated key response into a technical error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error_code: 'DEACTIVATED_KEY' }, 401));
    await expect(ncaafPropOddsService.getPlayerPropMarkets({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      bdlGameId: 987,
      apiKey: 'inactive-test-key',
      fetchImpl,
    })).rejects.toMatchObject({ code: 'ODDS_API_KEY_INACTIVE', status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid target before making or charging an upstream request', async () => {
    const fetchImpl = vi.fn();
    await expect(ncaafPropOddsService.getPlayerPropMarkets({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: 'not-a-kickoff',
      bdlGameId: 987,
      apiKey: 'active-test-key',
      fetchImpl,
    })).rejects.toMatchObject({ code: 'INVALID_TARGET_GAME' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('exact NCAAF event identity', () => {
  it('requires sport, home team, away team, and ET calendar date', () => {
    const wrongDate = { ...event, id: 'wrong-date', commence_time: '2026-09-07T01:00:00Z' };
    const reversed = { ...event, id: 'reversed', home_team: event.away_team, away_team: event.home_team };
    const wrongSport = { ...event, id: 'wrong-sport', sport_key: 'americanfootball_nfl' };

    expect(findExactNcaafEvent([wrongDate, reversed, wrongSport, event], {
      homeTeam: 'Ohio State Buckeyes',
      awayTeam: 'Texas Longhorns',
      commenceTime: '2026-09-05T23:30:00Z',
    })).toEqual(event);
  });

  it('fails closed when the exact event is missing or ambiguous', () => {
    const target = {
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
    };
    expect(() => findExactNcaafEvent([], target)).toThrowError(
      expect.objectContaining({ code: 'EVENT_NOT_FOUND' }),
    );
    expect(() => findExactNcaafEvent([event, { ...event, id: 'duplicate' }], target)).toThrowError(
      expect.objectContaining({ code: 'EVENT_AMBIGUOUS' }),
    );
  });
});

describe('NCAAF event-odds transformation', () => {
  it('keeps best book prices by player/type/line and supports anytime TD yes/no', () => {
    const payload = {
      ...event,
      bookmakers: [
        {
          key: 'book-a',
          markets: [
            {
              key: 'player_pass_yds',
              outcomes: [
                { name: 'Over', description: 'Arch Manning', price: -115, point: 255.5 },
                { name: 'Under', description: 'Arch Manning', price: -105, point: 255.5 },
              ],
            },
            {
              key: 'player_anytime_td',
              outcomes: [
                { name: 'Yes', description: 'Quintrevion Wisner', price: 135 },
                { name: 'No', description: 'Quintrevion Wisner', price: -170 },
              ],
            },
          ],
        },
        {
          key: 'book-b',
          markets: [{
            key: 'player_pass_yds',
            outcomes: [
              { name: 'Over', description: 'Arch Manning', price: -108, point: 255.5 },
              { name: 'Under', description: 'Arch Manning', price: -110, point: 255.5 },
            ],
          }],
        },
      ],
    };

    expect(transformNcaafEventOdds(payload, { bdlGameId: 987 })).toEqual([
      expect.objectContaining({
        player: 'Arch Manning', prop_type: 'passing_yards', line: 255.5,
        over_odds: -108, under_odds: -105, over_vendor: 'book-b', under_vendor: 'book-a',
        odds_event_id: event.id, bdl_game_id: '987',
      }),
      expect.objectContaining({
        player: 'Quintrevion Wisner', prop_type: 'anytime_touchdown', line: 0.5,
        over_odds: 135, under_odds: -170, market_type: 'yes_no',
      }),
    ]);
  });

  it('fetches the free event list first, then the exact event market endpoint', async () => {
    const eventOdds = {
      ...event,
      bookmakers: [{
        key: 'book-a',
        markets: [{
          key: 'player_rush_yds',
          outcomes: [
            { name: 'Over', description: 'Quintrevion Wisner', price: -110, point: 76.5 },
            { name: 'Under', description: 'Quintrevion Wisner', price: -110, point: 76.5 },
          ],
        }],
      }],
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([event]))
      .mockResolvedValueOnce(jsonResponse(eventOdds));

    const rows = await ncaafPropOddsService.getPlayerPropMarkets({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      bdlGameId: 987,
      apiKey: 'active-test-key',
      fetchImpl,
    });

    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const eventsUrl = new URL(fetchImpl.mock.calls[0][0]);
    const oddsUrl = new URL(fetchImpl.mock.calls[1][0]);
    expect(eventsUrl.pathname).toBe('/v4/sports/americanfootball_ncaaf/events');
    expect(oddsUrl.pathname).toBe(`/v4/sports/americanfootball_ncaaf/events/${event.id}/odds`);
    expect(oddsUrl.searchParams.get('markets')?.split(',')).toEqual([...NCAAF_PROP_MARKETS]);
    expect(oddsUrl.searchParams.get('oddsFormat')).toBe('american');
  });

  it('treats an empty current board as a technical failure, not an organic pass', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([event]))
      .mockResolvedValueOnce(jsonResponse({ ...event, bookmakers: [] }));

    await expect(ncaafPropOddsService.getPlayerPropMarkets({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      bdlGameId: 987,
      apiKey: 'active-test-key',
      fetchImpl,
    })).rejects.toMatchObject({ code: 'NO_LIVE_PROP_MARKETS' });
  });

  it('rejects an event-odds payload that changes the selected game identity', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse([event]))
      .mockResolvedValueOnce(jsonResponse({ ...event, home_team: 'Michigan Wolverines', bookmakers: [] }));
    await expect(ncaafPropOddsService.getPlayerPropMarkets({
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
      bdlGameId: 987,
      apiKey: 'active-test-key',
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'EVENT_ODDS_MISMATCH',
      name: NcaafPropMarketError.name,
    });
  });
});
