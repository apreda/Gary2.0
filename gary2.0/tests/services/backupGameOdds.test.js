import { describe, expect, it, vi } from 'vitest';
import { matchingOddsEvent, namedBookmakers, resolveBackupGameOdds, sportsbookRowsFromGame } from '../../src/services/backupGameOdds.js';

const sport = 'americanfootball_ncaaf';
const now = Date.parse('2026-09-19T15:00:00Z');
const game = { id: 457248, home_team: 'Kansas Jayhawks', away_team: 'Arizona State Sun Devils', commence_time: '2026-09-19T16:00:00Z', bookmakers: [] };
function eventFor(target = game, reversed = false) {
  return { id: 'named-event', sport_key: sport, commence_time: target.commence_time,
    home_team: reversed ? target.away_team : target.home_team,
    away_team: reversed ? target.home_team : target.away_team,
    bookmakers: [{ key: 'fanduel', last_update: '2026-09-19T14:59:00Z', markets: [
      { key: 'spreads', outcomes: [{ name: target.away_team, point: -5.5, price: -110 }, { name: target.home_team, point: 5.5, price: -110 }] },
      { key: 'h2h', outcomes: [{ name: target.away_team, price: -220 }, { name: target.home_team, price: 180 }] },
    ] }] };
}
const options = event => ({ enabled: true, now, load: vi.fn(async () => [event]) });

describe('named backup game markets', () => {
  it('fills a missing board while retaining the canonical game and complete sportsbook quote', async () => {
    const event = eventFor();
    const [result] = await resolveBackupGameOdds(sport, [game], options(event));
    expect(result).toMatchObject({ id: 457248, home_team: game.home_team, market_source: 'the_odds_api', market_source_reason: 'bdl_market_missing' });
    expect(sportsbookRowsFromGame(result)[0]).toMatchObject({ vendor: 'fanduel', spread_away: -5.5, spread_away_odds: -110,
      spread_home: 5.5, ml_home: 180, ml_away: -220, source: 'the_odds_api', source_event_id: event.id, source_updated_at: '2026-09-19T14:59:00Z' });
  });
  it('binds neutral-site quotes by named teams despite opposite home/away order', async () => {
    const reversed = eventFor(game, true);
    const incorrect = { ...game, bookmakers: eventFor().bookmakers, spread_away: 5.5, moneyline_away: 180, line_vendor: 'old' };
    const [result] = await resolveBackupGameOdds(sport, [incorrect], options(reversed));
    expect(result).not.toHaveProperty('spread_away');
    expect(result).not.toHaveProperty('line_vendor');
    expect(sportsbookRowsFromGame(result)[0].spread_away).toBe(-5.5);
    expect(result.market_source_reason).toBe('provider_team_order_disagreement');
  });
  it('keeps BDL when it has a complete market and both providers agree on sides, with no paid odds call', async () => {
    const event = eventFor();
    const original = { ...game, bookmakers: event.bookmakers };
    const opts = options(event);
    expect(await resolveBackupGameOdds(sport, [original], opts)).toEqual([original]);
    expect(opts.load).toHaveBeenCalledTimes(1);
    expect(opts.load).toHaveBeenCalledWith(sport, 'events');
  });
  it('handles accents and State abbreviations without using mascots as identities', () => {
    const target = { ...game, home_team: 'San José State Spartans', away_team: 'Fresno State Bulldogs' };
    const event = eventFor(target);
    event.home_team = 'San Jose St Spartans';
    event.bookmakers[0].markets[0].outcomes[1].name = event.home_team;
    expect(matchingOddsEvent([event], target, sport)).toBe(event);
    expect(namedBookmakers(event, target, now)[0].markets[0].outcomes[1].name).toBe(target.home_team);
    event.home_team = 'Michigan State Spartans';
    expect(matchingOddsEvent([event], target, sport)).toBeNull();
  });
  it('rejects ambiguous games and same-team games at a different kickoff', () => {
    const event = eventFor();
    expect(matchingOddsEvent([event, { ...event, id: 'duplicate' }], game, sport)).toBeNull();
    expect(matchingOddsEvent([{ ...event, commence_time: '2026-09-20T16:00:00Z' }], game, sport)).toBeNull();
  });
  it('does not substitute stale quotes, mixed total lines, missing prices, or duplicate named sides', () => {
    const event = eventFor();
    event.bookmakers[0].last_update = '2026-09-19T14:00:00Z';
    expect(namedBookmakers(event, game, now)).toEqual([]);
    event.bookmakers[0].last_update = '2026-09-19T14:59:00Z';
    event.bookmakers[0].markets = [{ key: 'totals', outcomes: [{ name: 'Over', point: 50, price: -110 }, { name: 'Under', point: 51, price: -110 }] }];
    expect(namedBookmakers(event, game, now)).toEqual([]);
    event.bookmakers[0].markets = [{ key: 'spreads', outcomes: [{ name: game.home_team, point: 5.5, price: -110 }, { name: game.home_team, point: -5.5, price: -110 }] }];
    expect(namedBookmakers(event, game, now)).toEqual([]);
  });
  it('never falls back to a known reversed BDL board if the named quote request fails', async () => {
    const event = eventFor(game, true);
    const opts = { enabled: true, now, load: vi.fn(async (_sport, kind) => { if (kind === 'odds') throw new Error('HTTP 401'); return [event]; }) };
    const [result] = await resolveBackupGameOdds(sport, [{ ...game, bookmakers: event.bookmakers, spread_home: -5.5 }], opts);
    expect(result.bookmakers).toEqual([]);
    expect(result).not.toHaveProperty('spread_home');
    expect(sportsbookRowsFromGame(result)).toEqual([]);
  });
  it('leaves a missing market unavailable when neither source has it', async () => {
    const opts = { enabled: true, now, load: vi.fn(async () => []) };
    expect(await resolveBackupGameOdds(sport, [game], opts)).toEqual([game]);
  });
  it('does not invoke the backup for the preserved NBA lane or without a configured key', async () => {
    const opts = options(eventFor());
    expect(await resolveBackupGameOdds('basketball_nba', [game], opts)).toEqual([game]);
    expect(await resolveBackupGameOdds(sport, [game], { ...opts, enabled: false })).toEqual([game]);
    expect(opts.load).not.toHaveBeenCalled();
  });
});
