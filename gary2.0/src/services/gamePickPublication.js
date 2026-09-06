import { isAmericanPrice } from './marketTruth.js';

const text = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const idValueFrom = (pick, keys) => {
  for (const key of keys) {
    const value = pick?.[key];
    if (value == null || value === '') continue;
    if (typeof value === 'string') { if (value.trim()) return value.trim(); continue; }
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return null;
};
const idFrom = (pick, keys) => {
  const value = idValueFrom(pick, keys);
  return value == null ? null : String(value);
};
export const gamePickIdValue = pick => idValueFrom(pick, ['bdl_game_id', 'game_id']);
export const gamePickId = pick => idFrom(pick, ['bdl_game_id', 'game_id']);
const prop = pick => ['type', 'pickType'].some(key => String(pick?.[key] || '').trim().toLowerCase() === 'prop');
const leagueKey = value => {
  const token = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ({ baseballmlb: 'mlb', basketballnba: 'nba', basketballwnba: 'wnba', basketballncaab: 'ncaab',
    icehockeynhl: 'nhl', americanfootballnfl: 'nfl', footballnfl: 'nfl',
    americanfootballncaaf: 'ncaaf', footballncaaf: 'ncaaf', collegefootball: 'ncaaf' })[token] || token;
};

// Legacy readers need a usable ticket, not every newer metadata field.
export function isPublishedGamePick(pick) {
  return object(pick) && !prop(pick) && text(pick.pick)
    && String(pick.type || '').trim().toLowerCase() !== 'pass'
    && !/^(?:pass|pending|no[\s_-]*pick|tbd|unknown)(?:$|\s|:)/i.test(pick.pick.trim());
}

// A write must be reviewable and decodable. Null confidence is intentional;
// a stated numeric value is preserved exactly, without calibration or defaults.
export function assertGamePickPublication(pick, expectedLeague = null) {
  if (!object(pick)) throw new Error('Game publication requires a pick object');
  if (prop(pick) || pick.soccer_match_id != null) {
    if (expectedLeague === 'NFL') throw new Error('Weekly NFL publication accepts game picks only');
    return; // established separate daily payloads
  }
  if (!isPublishedGamePick(pick)) throw new Error('Game publication requires a non-placeholder pick ticket');
  if (!text(pick.league)) throw new Error('Game publication requires a league');
  if (expectedLeague && pick.league.trim().toUpperCase() !== expectedLeague) throw new Error(`Game publication requires league ${expectedLeague}`);
  if (!gamePickId(pick)) throw new Error('Game publication requires bdl_game_id or game_id');
  if (!text(pick.homeTeam) || !text(pick.awayTeam) || pick.homeTeam.trim().toLowerCase() === pick.awayTeam.trim().toLowerCase()) {
    throw new Error('Game publication requires two distinct team names');
  }
  if (!['moneyline', 'spread'].includes(pick.type)) throw new Error('Game publication requires a moneyline or spread market');
  if (typeof pick.odds !== 'number' || !isAmericanPrice(pick.odds)) throw new Error('Game publication requires numeric American odds');
  if (pick.type === 'spread' && (typeof pick.spread !== 'number' || !Number.isFinite(pick.spread))) throw new Error('Spread publication requires a numeric line');
  if (!text(pick.rationale)) throw new Error('Game publication requires a rationale');
  if (!text(pick.commence_time) || !Number.isFinite(Date.parse(pick.commence_time))) throw new Error('Game publication requires a valid commence_time');
  for (const key of ['confidence', 'spread', 'spreadOdds', 'moneylineHome', 'moneylineAway', 'total']) {
    if (pick[key] != null && (typeof pick[key] !== 'number' || !Number.isFinite(pick[key]))) throw new Error(`Game publication requires numeric ${key} or null`);
  }
}

export function assertAtomicPickReceipt(receipt, picks) {
  const invalid = () => { throw new Error('Invalid atomic pick publication receipt; publication is unconfirmed'); };
  if (!object(receipt)) invalid();
  for (const key of ['added', 'skipped', 'total']) {
    if (!Number.isSafeInteger(receipt[key]) || receipt[key] < 0) invalid();
  }
  if (receipt.added + receipt.skipped !== picks.length || receipt.total < receipt.added || receipt.total < 1) invalid();
  if (!['append', 'insert'].includes(receipt.mode) || !Array.isArray(receipt.game_ids)) invalid();
  const ids = new Set(picks.map(gamePickId).filter(Boolean));
  if (receipt.game_ids.some(id => !['string', 'number'].includes(typeof id) || !ids.has(String(id)))) invalid();
  const occurrences = new Map();
  for (const pick of picks) {
    const id = gamePickId(pick);
    if (id) occurrences.set(id, (occurrences.get(id) || 0) + 1);
  }
  for (const rawId of receipt.game_ids) {
    const id = String(rawId);
    if (!occurrences.get(id)) invalid();
    occurrences.set(id, occurrences.get(id) - 1);
  }
  if (receipt.game_ids.length > receipt.added || (picks.every(gamePickId) && receipt.game_ids.length !== receipt.added)) invalid();
  return receipt;
}

export function assertExistingGamePublications(storedPicks, incomingPicks, { ledger = 'daily' } = {}) {
  if (!Array.isArray(storedPicks)) throw new Error('Publication readback is not a pick array');
  for (const pick of incomingPicks) {
    if (prop(pick) || pick.soccer_match_id != null) continue;
    const id = gamePickId(pick);
    const league = pick.league.trim().toUpperCase();
    const weekly = ledger === 'nfl_weekly';
    const teamKey = value => String(value || '').trim().toLowerCase();
    const matches = storedPicks.filter(existing => {
      if (!isPublishedGamePick(existing)) return false;
      const existingLeague = existing?.league || existing?.sport || existing?.sport_key;
      if ((!weekly || existingLeague) && leagueKey(existingLeague) !== leagueKey(league)) return false;
      const existingId = idFrom(existing, weekly ? ['bdl_game_id', 'game_id'] : ['bdl_game_id', 'game_id', 'bdlGameId', 'gameId']);
      if (existingId != null) return existingId === id;
      // Atomic storage protects valid legacy tickets lacking provider IDs by
      // their two exact team names. Readback honors that same immutable guard.
      const home = existing.homeTeam || (!weekly && existing.home_team);
      const away = existing.awayTeam || (!weekly && existing.away_team);
      return teamKey(home) === teamKey(pick.homeTeam) && teamKey(away) === teamKey(pick.awayTeam);
    });
    if (!matches.some(isPublishedGamePick)) throw new Error(`Publication unconfirmed for ${league} game ${id}: existing ticket is missing or malformed; original record preserved`);
  }
}
