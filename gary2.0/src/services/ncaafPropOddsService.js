/**
 * Current NCAAF player-prop markets from The Odds API.
 *
 * Ball Don't Lie exposes NCAAF rosters and player statistics, but its NCAAF
 * player-prop endpoint is historical/opening data rather than a live board.
 * The Odds API's event-odds endpoint is therefore the market source for this
 * lane. BDL remains the game-id, roster, stats, live-score, and grading source.
 *
 * This module deliberately fails closed. A missing/deactivated key, an event
 * that cannot be matched on BOTH teams + ET game date, or an empty live board
 * is a technical failure. It never manufactures a line from player stats.
 */

const API_BASE = 'https://api.the-odds-api.com/v4';
const SPORT_KEY = 'americanfootball_ncaaf';
const ET_TIME_ZONE = 'America/New_York';

// Only full-game markets that the BDL NCAAF player-stat feed can validate and
// later grade. First/last-TD and quarter/half props are intentionally absent.
export const NCAAF_PROP_MARKETS = Object.freeze([
  'player_pass_yds',
  'player_pass_tds',
  'player_pass_attempts',
  'player_pass_completions',
  'player_pass_interceptions',
  'player_rush_yds',
  'player_rush_attempts',
  'player_reception_yds',
  'player_receptions',
  'player_rush_reception_yds',
  'player_rush_tds',
  'player_reception_tds',
  'player_anytime_td',
]);

// Exported so the grading contract test can pin that every published NCAAF
// prop type carries BDL stat evidence (src/services/ncaafPropStats.js).
export const MARKET_TYPE_MAP = Object.freeze({
  player_pass_yds: 'passing_yards',
  player_pass_tds: 'passing_touchdowns',
  player_pass_attempts: 'passing_attempts',
  player_pass_completions: 'passing_completions',
  player_pass_interceptions: 'passing_interceptions',
  player_rush_yds: 'rushing_yards',
  player_rush_attempts: 'rushing_attempts',
  player_reception_yds: 'receiving_yards',
  player_receptions: 'receptions',
  player_rush_reception_yds: 'rushing_receiving_yards',
  player_rush_tds: 'rushing_touchdowns',
  player_reception_tds: 'receiving_touchdowns',
  player_anytime_td: 'anytime_touchdown',
});

export class NcaafPropMarketError extends Error {
  constructor(code, message, { status = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'NcaafPropMarketError';
    this.code = code;
    this.status = status;
  }
}

export function requireNcaafOddsApiKey(env = process.env) {
  // Server-side names only. Do not revive VITE_ODDS_API_KEY: VITE variables are
  // client-visible and a sportsbook API credential does not belong in the app.
  const key = env.NCAAF_THE_ODDS_API_KEY || env.THE_ODDS_API_KEY || env.ODDS_API_KEY;
  if (!key || !String(key).trim()) {
    throw new NcaafPropMarketError(
      'ODDS_API_KEY_MISSING',
      'NCAAF live props require an active server-side THE_ODDS_API_KEY (or NCAAF_THE_ODDS_API_KEY)',
    );
  }
  return String(key).trim();
}

export function normalizeNcaafTeamName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\b/g, 'state')
    .replace(/\buniv(?:ersity)?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function easternDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-CA', { timeZone: ET_TIME_ZONE });
}

function exactTeams(event, target) {
  return normalizeNcaafTeamName(event?.home_team) === normalizeNcaafTeamName(target.homeTeam)
    && normalizeNcaafTeamName(event?.away_team) === normalizeNcaafTeamName(target.awayTeam);
}

export function findExactNcaafEvent(events, target) {
  const targetDate = easternDate(target?.commenceTime);
  if (!targetDate || !target?.homeTeam || !target?.awayTeam) {
    throw new NcaafPropMarketError('INVALID_TARGET_GAME', 'NCAAF prop lookup requires two teams and a valid kickoff');
  }

  const matches = (Array.isArray(events) ? events : []).filter((event) =>
    event?.sport_key === SPORT_KEY
    && exactTeams(event, target)
    && easternDate(event.commence_time) === targetDate
  );

  if (matches.length === 0) {
    throw new NcaafPropMarketError(
      'EVENT_NOT_FOUND',
      `No exact The Odds API NCAAF event matched ${target.awayTeam} @ ${target.homeTeam} on ${targetDate} ET`,
    );
  }
  if (matches.length > 1) {
    throw new NcaafPropMarketError(
      'EVENT_AMBIGUOUS',
      `Multiple The Odds API NCAAF events matched ${target.awayTeam} @ ${target.homeTeam} on ${targetDate} ET`,
    );
  }
  return matches[0];
}

function apiErrorCode(payload, status) {
  const upstream = String(payload?.error_code || payload?.code || '').toUpperCase();
  if (upstream === 'DEACTIVATED_KEY' || upstream === 'INVALID_KEY' || status === 401) {
    return 'ODDS_API_KEY_INACTIVE';
  }
  if (status === 429) return 'ODDS_API_RATE_LIMITED';
  return 'ODDS_API_REQUEST_FAILED';
}

async function fetchJson(url, { fetchImpl, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new NcaafPropMarketError('ODDS_API_NETWORK_ERROR', `The Odds API request failed: ${error.message}`, { cause: error });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // The status below is still sufficient to surface a technical failure.
  }

  if (!response.ok) {
    const upstreamMessage = payload?.message || payload?.error || payload?.error_code || `HTTP ${response.status}`;
    throw new NcaafPropMarketError(
      apiErrorCode(payload, response.status),
      `The Odds API rejected the NCAAF props request (${upstreamMessage})`,
      { status: response.status },
    );
  }
  return payload;
}

function sideForOutcome(outcomeName) {
  const name = String(outcomeName || '').trim().toLowerCase();
  if (name === 'over' || name === 'yes') return 'over';
  if (name === 'under' || name === 'no') return 'under';
  return null;
}

function bestPrice(current, candidate) {
  if (!Number.isFinite(candidate)) return current;
  if (!Number.isFinite(current)) return candidate;
  return candidate > current ? candidate : current;
}

/**
 * Convert one event-odds response into the shared Gary market-row contract.
 * Every output row represents one player + canonical type + exact line; each
 * side independently keeps the best American price across returned books.
 */
export function transformNcaafEventOdds(payload, { bdlGameId = null } = {}) {
  if (!payload || payload.sport_key !== SPORT_KEY) {
    throw new NcaafPropMarketError('EVENT_ODDS_MISMATCH', 'The Odds API returned a non-NCAAF event payload');
  }

  const rows = new Map();
  for (const book of Array.isArray(payload.bookmakers) ? payload.bookmakers : []) {
    for (const market of Array.isArray(book?.markets) ? book.markets : []) {
      const propType = MARKET_TYPE_MAP[market?.key];
      if (!propType) continue;
      const binaryTd = market.key === 'player_anytime_td';

      for (const outcome of Array.isArray(market?.outcomes) ? market.outcomes : []) {
        const side = sideForOutcome(outcome?.name);
        const player = String(outcome?.description || '').trim();
        const price = Number(outcome?.price);
        const point = binaryTd && outcome?.point == null ? 0.5 : Number(outcome?.point);
        if (!side || !player || !Number.isFinite(price) || !Number.isFinite(point)) continue;

        const key = `${player.toLowerCase()}|${propType}|${point}`;
        if (!rows.has(key)) {
          rows.set(key, {
            player,
            player_id: null,
            team: null,
            prop_type: propType,
            source_market: market.key,
            line: point,
            over_odds: null,
            under_odds: null,
            market_type: binaryTd ? 'yes_no' : 'over_under',
            vendor: 'the_odds_api',
            over_vendor: null,
            under_vendor: null,
            odds_event_id: String(payload.id),
            bdl_game_id: bdlGameId == null ? null : String(bdlGameId),
          });
        }

        const row = rows.get(key);
        const oddsKey = side === 'over' ? 'over_odds' : 'under_odds';
        const vendorKey = side === 'over' ? 'over_vendor' : 'under_vendor';
        const updated = bestPrice(row[oddsKey], price);
        if (updated !== row[oddsKey]) {
          row[oddsKey] = updated;
          row[vendorKey] = book.key || book.title || null;
        }
      }
    }
  }

  return [...rows.values()]
    .filter((row) => row.over_odds != null || row.under_odds != null)
    .sort((a, b) => a.player.localeCompare(b.player)
      || a.prop_type.localeCompare(b.prop_type)
      || a.line - b.line);
}

function windowAround(iso, hours) {
  const epoch = new Date(iso).getTime();
  if (!Number.isFinite(epoch)) return null;
  return new Date(epoch + hours * 60 * 60 * 1000).toISOString();
}

export const ncaafPropOddsService = {
  async getPlayerPropMarkets({
    homeTeam,
    awayTeam,
    commenceTime,
    bdlGameId,
    apiKey = null,
    env = process.env,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
  } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new NcaafPropMarketError('FETCH_UNAVAILABLE', 'No fetch implementation is available for NCAAF props');
    }
    if (!homeTeam || !awayTeam || !easternDate(commenceTime)) {
      throw new NcaafPropMarketError('INVALID_TARGET_GAME', 'NCAAF prop lookup requires two teams and a valid kickoff');
    }
    if (bdlGameId == null || String(bdlGameId).trim() === '') {
      throw new NcaafPropMarketError('BDL_GAME_ID_MISSING', 'NCAAF props require the exact BDL game id');
    }

    const key = apiKey || requireNcaafOddsApiKey(env);
    const target = { homeTeam, awayTeam, commenceTime };
    // A ±18h API filter safely spans UTC/ET while exact matching below still
    // requires the two teams and the ET calendar date.
    const eventsUrl = new URL(`${API_BASE}/sports/${SPORT_KEY}/events`);
    eventsUrl.searchParams.set('apiKey', key);
    eventsUrl.searchParams.set('dateFormat', 'iso');
    eventsUrl.searchParams.set('commenceTimeFrom', windowAround(commenceTime, -18));
    eventsUrl.searchParams.set('commenceTimeTo', windowAround(commenceTime, 18));

    const events = await fetchJson(eventsUrl, { fetchImpl, timeoutMs });
    const event = findExactNcaafEvent(events, target);

    const oddsUrl = new URL(`${API_BASE}/sports/${SPORT_KEY}/events/${encodeURIComponent(event.id)}/odds`);
    oddsUrl.searchParams.set('apiKey', key);
    oddsUrl.searchParams.set('regions', 'us');
    oddsUrl.searchParams.set('markets', NCAAF_PROP_MARKETS.join(','));
    oddsUrl.searchParams.set('dateFormat', 'iso');
    oddsUrl.searchParams.set('oddsFormat', 'american');

    const eventOdds = await fetchJson(oddsUrl, { fetchImpl, timeoutMs });
    if (String(eventOdds?.id || '') !== String(event.id)
      || !exactTeams(eventOdds, target)
      || easternDate(eventOdds?.commence_time) !== easternDate(commenceTime)) {
      throw new NcaafPropMarketError('EVENT_ODDS_MISMATCH', 'The Odds API event-odds payload did not match the selected NCAAF game');
    }

    const markets = transformNcaafEventOdds(eventOdds, { bdlGameId });
    if (markets.length === 0) {
      throw new NcaafPropMarketError(
        'NO_LIVE_PROP_MARKETS',
        `No current full-game NCAAF player props are posted for ${awayTeam} @ ${homeTeam}`,
      );
    }
    return markets;
  },
};

export default ncaafPropOddsService;
