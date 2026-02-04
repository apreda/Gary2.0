/**
 * Ball Don't Lie Odds (V2) Service
 * Fetches game-level betting odds and joins to NBA games by date.
 */
import axios from 'axios';
import { ballDontLieService } from './ballDontLieService.js';

const BDL_V2_BASE = 'https://api.balldontlie.io/v2';
const BDL_NBA_ODDS_V1 = 'https://api.balldontlie.io/nba/v1/odds';
const BDL_NFL_ODDS_V1 = 'https://api.balldontlie.io/nfl/v1/odds';
const BDL_NHL_ODDS_V1 = 'https://api.balldontlie.io/nhl/v1/odds';
const BDL_NCAAF_ODDS_V1 = 'https://api.balldontlie.io/ncaaf/v1/odds';
const BDL_NCAAB_ODDS_V1 = 'https://api.balldontlie.io/ncaab/v1/odds';

// Player Props endpoints (LIVE data, updated in real-time)
const BDL_NBA_PROPS_V1 = 'https://api.balldontlie.io/nba/v1/odds/player_props';
const BDL_NFL_PROPS_V1 = 'https://api.balldontlie.io/nfl/v1/odds/player_props';
const BDL_NHL_PROPS_V1 = 'https://api.balldontlie.io/nhl/v1/odds/player_props';

function getApiKey() {
  try {
    const serverKey =
      (typeof process !== 'undefined' && process?.env?.BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.VITE_BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_BALLDONTLIE_API_KEY);
    const clientKey =
      (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_BALLDONTLIE_API_KEY) || undefined;
    return serverKey || clientKey || '';
  } catch {
    return '';
  }
}

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Legacy helper (kept for reference). Prefer ballDontLieService.getOddsV2 which
 * routes NBA to /v2/odds and other sports to /{sport}/v1/odds with fallbacks.
 */
async function fetchOddsByDates(dates = []) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Missing Ball Don\'t Lie API key for odds');
    const params = {};
    if (Array.isArray(dates) && dates.length > 0) params.dates = dates; // axios adds [] for arrays
    const resp = await axios.get(`${BDL_V2_BASE}/odds`, {
      params,
      headers: { Authorization: apiKey },
      paramsSerializer: { indexes: null }
    });
    return Array.isArray(resp?.data?.data) ? resp.data.data : [];
  } catch (e) {
    // Let callers decide their own fallback; return empty on failure
    return [];
  }
}

async function fetchNflOddsBySeasonWeek(season, week) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Missing Ball Don\'t Lie API key for odds');
  if (!season || week == null) return [];
  try {
    const resp = await axios.get(BDL_NFL_ODDS_V1, {
      params: { season, week, per_page: 100 },
      headers: { Authorization: apiKey }
    });
    return Array.isArray(resp?.data?.data) ? resp.data.data : [];
  } catch (e) {
    console.warn('[BallDonLieOdds] NFL season/week odds fetch failed:', e?.response?.data || e?.message || e);
    return [];
  }
}

/**
 * Get NBA games with odds for a specific date (YYYY-MM-DD)
 * Returns a list of games in a structure similar to oddsService.getUpcomingGames
 */
async function getNbaGamesWithOdds(dateStr) {
  // Fetch games for date via v1 client
  const games = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr], per_page: 100 }, 10);
  // Fetch odds via unified helper (routes NBA -> /v2/odds, otherwise sport v1)
  let odds = await ballDontLieService.getOddsV2({ dates: [dateStr], per_page: 100 }, 'basketball_nba');

  // Index odds by game_id and vendor
  const gameIdToVendors = new Map();
  odds.forEach(row => {
    const list = gameIdToVendors.get(row.game_id) || [];
    list.push(row);
    gameIdToVendors.set(row.game_id, list);
  });

  // Map games to consistent structure
  const mapped = (games || []).map(g => {
    const vendors = gameIdToVendors.get(g.id) || [];
    const bookmakers = vendors.map(v => {
      // Build a bookmaker-like structure with minimal markets
      const totalsOutcomes = [];
      const totalPoint = toNumber(v.total_value);
      const totalOver = toNumber(v.total_over_odds);
      const totalUnder = toNumber(v.total_under_odds);
      if (totalPoint !== null && totalOver !== null) {
        totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
      }
      if (totalPoint !== null && totalUnder !== null) {
        totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
      }
      const spreadsOutcomes = [];
      const homeSpreadPoint = toNumber(v.spread_home_value);
      const homeSpreadPrice = toNumber(v.spread_home_odds);
      if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
        spreadsOutcomes.push({ name: g.home_team?.full_name || g.home_team?.name, point: homeSpreadPoint, price: homeSpreadPrice });
      }
      const awaySpreadPoint = toNumber(v.spread_away_value);
      const awaySpreadPrice = toNumber(v.spread_away_odds);
      if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
        spreadsOutcomes.push({ name: g.visitor_team?.full_name || g.visitor_team?.name, point: awaySpreadPoint, price: awaySpreadPrice });
      }
      const h2hOutcomes = [];
      const homeMl = toNumber(v.moneyline_home_odds);
      if (homeMl !== null) {
        h2hOutcomes.push({ name: g.home_team?.full_name || g.home_team?.name, price: homeMl });
      }
      const awayMl = toNumber(v.moneyline_away_odds);
      if (awayMl !== null) {
        h2hOutcomes.push({ name: g.visitor_team?.full_name || g.visitor_team?.name, price: awayMl });
      }

      const markets = [];
      if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
      if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
      if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });

      return {
        key: v.vendor,
        title: v.vendor,
        markets
      };
    });

    return {
      id: g.id,
      sport_key: 'basketball_nba',
      home_team: g.home_team?.full_name || g.home_team?.name || '',
      away_team: g.visitor_team?.full_name || g.visitor_team?.name || '',
      // Use datetime (actual game time in UTC) over date string to avoid timezone bugs
      // g.date is just "YYYY-MM-DD" which when parsed becomes midnight UTC, causing EST filter issues
      commence_time: g.datetime || g.date,
      bookmakers
    };
  });

  return mapped;
}

export const ballDontLieOddsService = {
  fetchOddsByDates,
  getNbaGamesWithOdds,
  /**
   * Generic: get games with odds for any supported sport key using BDL V1 games + V2 odds
   * @param {string} sportKey - e.g., 'basketball_nba', 'americanfootball_nfl', 'icehockey_nhl', 'baseball_mlb'
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {Promise<Array>} games with bookmakers/markets in a unified shape
   */
  async getGamesWithOddsForSport(sportKey, dateStr) {
    // NCAAF: v1 odds start from 2025 Week 9; use game_ids (preferred) and fallback to season/week
    if (sportKey === 'americanfootball_ncaaf') {
      const apiKey = getApiKey();
      const games = await ballDontLieService.getGames('americanfootball_ncaaf', { dates: [dateStr], per_page: 100 }, 10);
      const ids = (games || []).map(g => g.id).filter(Boolean);
      let oddsRows = [];
      // Try by game_ids first to align games to odds precisely
      if (ids.length > 0) {
        try {
          const respByIds = await axios.get(BDL_NCAAF_ODDS_V1, {
            params: { 'game_ids[]': ids.slice(0, 100), per_page: 100 },
            headers: { Authorization: apiKey }
          });
          oddsRows = Array.isArray(respByIds?.data?.data) ? respByIds.data.data : [];
        } catch (e) {
          console.warn('[BallDonLieOdds][NCAAF] game_ids v1 odds fetch failed:', e?.response?.data || e?.message || e);
        }
      }
      // Fallback: fetch by unique (season, week) pairs present in games
      if ((!Array.isArray(oddsRows) || oddsRows.length === 0) && Array.isArray(games)) {
        const seenPairs = new Set();
        for (const g of games) {
          const season = g?.season;
          const week = g?.week;
          if (!season || week == null) continue;
          const key = `${season}-${week}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          try {
            const respByWeek = await axios.get(BDL_NCAAF_ODDS_V1, {
              params: { season, week, per_page: 100 },
              headers: { Authorization: apiKey }
            });
            const rows = Array.isArray(respByWeek?.data?.data) ? respByWeek.data.data : [];
            if (rows.length) {
              oddsRows = (oddsRows || []).concat(rows);
            }
          } catch (e) {
            console.warn('[BallDonLieOdds][NCAAF] season/week v1 odds fetch failed:', e?.response?.data || e?.message || e);
          }
        }
      }
      // Index odds by game
      const byGame = oddsRows.reduce((acc, r) => {
        const list = acc.get(r.game_id) || [];
        list.push(r);
        acc.set(r.game_id, list);
        return acc;
      }, new Map());
      const mapTeamName = (t) => (typeof t === 'string' ? t : (t?.full_name || t?.name || t?.short_name || ''));
      return (games || []).map(g => {
        const vendors = byGame.get(g.id) || [];
        const bookmakers = vendors.map(v => {
          const totalsOutcomes = [];
          const totalPoint = toNumber(v.total_value);
          const totalOver = toNumber(v.total_over_odds);
          const totalUnder = toNumber(v.total_under_odds);
          if (totalPoint !== null && totalOver !== null) totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
          if (totalPoint !== null && totalUnder !== null) totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
          const spreadsOutcomes = [];
          const homeSpreadPoint = toNumber(v.spread_home_value);
          const homeSpreadPrice = toNumber(v.spread_home_odds);
          if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
          }
          const awaySpreadPoint = toNumber(v.spread_away_value);
          const awaySpreadPrice = toNumber(v.spread_away_odds);
          if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
          }
          const h2hOutcomes = [];
          const homeMl = toNumber(v.moneyline_home_odds);
          if (homeMl !== null) h2hOutcomes.push({ name: mapTeamName(g.home_team), price: homeMl });
          const awayMl = toNumber(v.moneyline_away_odds);
          if (awayMl !== null) h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: awayMl });
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
          if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });
        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          commence_time: g.datetime || g.date || g.commence_time || new Date().toISOString(),
          bookmakers
        };
      });
    }
    // NCAAB: use sport-specific v1 odds endpoint; odds start 2025-26 and not guaranteed per docs
    // NCAAB FIX: BDL stores games by UTC date, but we want EST date
    // Games at 7pm+ EST are stored under the NEXT UTC date (e.g., 7pm EST Jan 27 = midnight UTC Jan 28)
    // So we must query BOTH today AND tomorrow's UTC dates to get all EST games for today
    if (sportKey === 'basketball_ncaab') {
      const apiKey = getApiKey();

      // Calculate tomorrow's date in UTC
      const todayDate = new Date(dateStr);
      const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrowDate.toISOString().split('T')[0]; // YYYY-MM-DD

      console.log(`[NCAAB] Fetching games for BOTH ${dateStr} AND ${tomorrowStr} (UTC) to capture all EST games`);

      // Fetch games for both dates
      const [gamesToday, gamesTomorrow] = await Promise.all([
        ballDontLieService.getGames('basketball_ncaab', { dates: [dateStr], per_page: 100 }, 10),
        ballDontLieService.getGames('basketball_ncaab', { dates: [tomorrowStr], per_page: 100 }, 10)
      ]);

      // Combine and deduplicate by game ID
      const allGamesMap = new Map();
      for (const g of [...(gamesToday || []), ...(gamesTomorrow || [])]) {
        if (g?.id && !allGamesMap.has(g.id)) {
          allGamesMap.set(g.id, g);
        }
      }
      const games = Array.from(allGamesMap.values());
      console.log(`[NCAAB] Combined: ${gamesToday?.length || 0} from ${dateStr} + ${gamesTomorrow?.length || 0} from ${tomorrowStr} = ${games.length} unique games`);

      const ids = (games || []).map(g => g.id).filter(Boolean);
      let oddsRows = [];
      try {
        // Try by date first - fetch odds for both dates
        const [respToday, respTomorrow] = await Promise.all([
          axios.get(BDL_NCAAB_ODDS_V1, {
            params: { 'dates[]': [dateStr], per_page: 100 },
            headers: { Authorization: apiKey }
          }),
          axios.get(BDL_NCAAB_ODDS_V1, {
            params: { 'dates[]': [tomorrowStr], per_page: 100 },
            headers: { Authorization: apiKey }
          })
        ]);
        const rowsToday = Array.isArray(respToday?.data?.data) ? respToday.data.data : [];
        const rowsTomorrow = Array.isArray(respTomorrow?.data?.data) ? respTomorrow.data.data : [];
        oddsRows = [...rowsToday, ...rowsTomorrow];
        console.log(`[NCAAB] Odds: ${rowsToday.length} from ${dateStr} + ${rowsTomorrow.length} from ${tomorrowStr}`);
      } catch (e) {
        console.warn('[BallDonLieOdds][NCAAB] date-based v1 odds fetch failed:', e?.response?.data || e?.message || e);
      }
      // If none by date, try by game_ids
      if ((!Array.isArray(oddsRows) || oddsRows.length === 0) && ids.length > 0) {
        try {
          const respByIds = await axios.get(BDL_NCAAB_ODDS_V1, {
            params: { 'game_ids[]': ids.slice(0, 100), per_page: 100 },
            headers: { Authorization: apiKey }
          });
          const rowsByIds = Array.isArray(respByIds?.data?.data) ? respByIds.data.data : [];
          oddsRows = rowsByIds;
        } catch (e) {
          console.warn('[BallDonLieOdds][NCAAB] game_ids v1 odds fetch failed:', e?.response?.data || e?.message || e);
        }
      }
      // Index odds by game
      const byGame = oddsRows.reduce((acc, r) => {
        const list = acc.get(r.game_id) || [];
        list.push(r);
        acc.set(r.game_id, list);
        return acc;
      }, new Map());
      const mapTeamName = (t) => (typeof t === 'string' ? t : (t?.full_name || t?.name || t?.short_name || ''));
      return (games || []).map(g => {
        const vendors = byGame.get(g.id) || [];
        const bookmakers = vendors.map(v => {
          const totalsOutcomes = [];
          const totalPoint = toNumber(v.total_value);
          const totalOver = toNumber(v.total_over_odds);
          const totalUnder = toNumber(v.total_under_odds);
          if (totalPoint !== null && totalOver !== null) totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
          if (totalPoint !== null && totalUnder !== null) totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
          const spreadsOutcomes = [];
          const homeSpreadPoint = toNumber(v.spread_home_value);
          const homeSpreadPrice = toNumber(v.spread_home_odds);
          if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
          }
          const awaySpreadPoint = toNumber(v.spread_away_value);
          const awaySpreadPrice = toNumber(v.spread_away_odds);
          if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
          }
          const h2hOutcomes = [];
          const homeMl = toNumber(v.moneyline_home_odds);
          if (homeMl !== null) h2hOutcomes.push({ name: mapTeamName(g.home_team), price: homeMl });
          const awayMl = toNumber(v.moneyline_away_odds);
          if (awayMl !== null) h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: awayMl });
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
          if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });

        // NCAAB dates: BDL stores times in UTC
        // We pass through the time as-is and let the date filter in run-agentic-picks.js
        // convert to EST and filter correctly
        let commenceTime = g.datetime || g.commence_time || g.date || new Date().toISOString();

        // Only fix date-only strings (no time component) - these genuinely need a time
        if (typeof commenceTime === 'string' && commenceTime.length === 10 && !commenceTime.includes('T')) {
          // Use 22:00 UTC = 5 PM EST - typical game time
          commenceTime = `${commenceTime}T22:00:00.000Z`;
          console.log(`[BDL NCAAB] Fixed date-only time for game ${g.id}: ${commenceTime}`);
        }

        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          commence_time: commenceTime,
          bookmakers
        };
      });
    }
    // NHL: Use dual-date fetching like NCAAB to capture all EST games
    // Games at 7pm+ EST are stored under the NEXT UTC date
    if (sportKey === 'icehockey_nhl') {
      const apiKey = getApiKey();

      // Calculate tomorrow's date in UTC
      const todayDate = new Date(dateStr);
      const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

      console.log(`[NHL] Fetching games for BOTH ${dateStr} AND ${tomorrowStr} (UTC) to capture all EST games`);

      // Fetch games for both dates
      let gamesToday = [];
      let gamesTomorrow = [];
      try {
        [gamesToday, gamesTomorrow] = await Promise.all([
          ballDontLieService.getGames('icehockey_nhl', { dates: [dateStr], per_page: 100 }, 10),
          ballDontLieService.getGames('icehockey_nhl', { dates: [tomorrowStr], per_page: 100 }, 10)
        ]);
      } catch (e) {
        console.warn(`[NHL] Games fetch failed, trying individual dates:`, e?.message || e);
        // Fallback: try individually
        try { gamesToday = await ballDontLieService.getGames('icehockey_nhl', { dates: [dateStr], per_page: 100 }, 10) || []; } catch { gamesToday = []; }
        try { gamesTomorrow = await ballDontLieService.getGames('icehockey_nhl', { dates: [tomorrowStr], per_page: 100 }, 10) || []; } catch { gamesTomorrow = []; }
      }

      // Combine and deduplicate by game ID
      const allGamesMap = new Map();
      for (const g of [...(gamesToday || []), ...(gamesTomorrow || [])]) {
        if (g?.id && !allGamesMap.has(g.id)) {
          allGamesMap.set(g.id, g);
        }
      }
      const games = Array.from(allGamesMap.values());
      console.log(`[NHL] Combined: ${gamesToday?.length || 0} from ${dateStr} + ${gamesTomorrow?.length || 0} from ${tomorrowStr} = ${games.length} unique games`);

      const ids = (games || []).map(g => g.id).filter(Boolean);
      let oddsRows = [];
      try {
        // Fetch odds for both dates
        const [respToday, respTomorrow] = await Promise.all([
          axios.get(BDL_NHL_ODDS_V1, {
            params: { 'dates[]': [dateStr], per_page: 100 },
            headers: { Authorization: apiKey }
          }),
          axios.get(BDL_NHL_ODDS_V1, {
            params: { 'dates[]': [tomorrowStr], per_page: 100 },
            headers: { Authorization: apiKey }
          })
        ]);
        const rowsToday = Array.isArray(respToday?.data?.data) ? respToday.data.data : [];
        const rowsTomorrow = Array.isArray(respTomorrow?.data?.data) ? respTomorrow.data.data : [];
        oddsRows = [...rowsToday, ...rowsTomorrow];
        console.log(`[NHL] Odds: ${rowsToday.length} from ${dateStr} + ${rowsTomorrow.length} from ${tomorrowStr}`);
      } catch (e) {
        console.warn('[BallDonLieOdds][NHL] date-based v1 odds fetch failed:', e?.response?.data || e?.message || e);
      }

      // Index odds by game
      const byGame = oddsRows.reduce((acc, r) => {
        const list = acc.get(r.game_id) || [];
        list.push(r);
        acc.set(r.game_id, list);
        return acc;
      }, new Map());
      const mapTeamName = (t) => (typeof t === 'string' ? t : (t?.full_name || t?.name || t?.short_name || ''));
      return (games || []).map(g => {
        const vendors = byGame.get(g.id) || [];
        const bookmakers = vendors.map(v => {
          const totalsOutcomes = [];
          const totalPoint = toNumber(v.total_value);
          const totalOver = toNumber(v.total_over_odds);
          const totalUnder = toNumber(v.total_under_odds);
          if (totalPoint !== null && totalOver !== null) totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
          if (totalPoint !== null && totalUnder !== null) totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
          const spreadsOutcomes = [];
          const homeSpreadPoint = toNumber(v.spread_home_value);
          const homeSpreadPrice = toNumber(v.spread_home_odds);
          if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
          }
          const awaySpreadPoint = toNumber(v.spread_away_value);
          const awaySpreadPrice = toNumber(v.spread_away_odds);
          if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
          }
          const h2hOutcomes = [];
          const homeMl = toNumber(v.moneyline_home_odds);
          if (homeMl !== null) h2hOutcomes.push({ name: mapTeamName(g.home_team), price: homeMl });
          const awayMl = toNumber(v.moneyline_away_odds);
          if (awayMl !== null) h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: awayMl });
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
          if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });

        let commenceTime = g.datetime || g.commence_time || g.date || new Date().toISOString();
        if (typeof commenceTime === 'string' && commenceTime.length === 10 && !commenceTime.includes('T')) {
          commenceTime = `${commenceTime}T00:00:00.000Z`;
        }

        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          commence_time: commenceTime,
          bookmakers
        };
      });
    }
    // Fetch games (v1 multi-sport wrapper) and v2 odds (date-based)
    const games = await ballDontLieService.getGames(sportKey, { dates: [dateStr], per_page: 100 }, 10);

    // Use unified helper to get odds appropriate for sport
    // NOTE: NFL v1 odds endpoint does NOT support 'dates', so we skip this initial fetch for NFL.
    let odds = [];
    if (sportKey !== 'americanfootball_nfl') {
      odds = await ballDontLieService.getOddsV2({ dates: [dateStr], per_page: 100 }, sportKey);
    }

    // NBA: If date-based v2 odds are sparse or missing ML/Spreads, fetch v2 odds by game_ids for precision
    if (sportKey === 'basketball_nba') {
      try {
        const apiKey = getApiKey();
        const uniqueGameIds = (games || []).map(g => g?.id).filter(id => id != null);
        const hasAnyRowsForGames = Array.isArray(odds) && odds.some(r => uniqueGameIds.includes(r?.game_id));

        // Check specifically for missing ML/Spreads in the odds we got back
        const rowsByGame = new Map();
        for (const r of Array.isArray(odds) ? odds : []) {
          if (r?.game_id == null) continue;
          const list = rowsByGame.get(r.game_id) || [];
          list.push(r);
          rowsByGame.set(r.game_id, list);
        }

        const missingMlOrSpreadIds = uniqueGameIds.filter(gid => {
          const rows = rowsByGame.get(gid) || [];
          if (rows.length === 0) return true; // No odds at all

          // Check if any row has ML OR Spread
          const hasMl = rows.some(x => toNumber(x?.moneyline_home_odds) !== null || toNumber(x?.moneyline_away_odds) !== null);
          const hasSpread = rows.some(x => toNumber(x?.spread_home_value) !== null || toNumber(x?.spread_away_value) !== null);
          return !(hasMl || hasSpread);
        });

        // If we have missing odds, try fetching by game_ids
        if (uniqueGameIds.length && missingMlOrSpreadIds.length > 0) {
          console.log(`[NBA] Found ${missingMlOrSpreadIds.length} games missing odds. Fetching by game_ids...`);
          const targetIds = missingMlOrSpreadIds; // fetch for all missing
          const byIds = await ballDontLieService.getOddsV2({ game_ids: targetIds.slice(0, 100), per_page: 100 }, 'nba');

          if (byIds.length) {
            console.log(`[NBA] Recovered odds for ${byIds.length} games via game_ids fallback.`);
            // Merge: prefer new rows for the targeted game_ids
            const targeted = new Set(targetIds);
            const retained = (Array.isArray(odds) ? odds : []).filter(x => !targeted.has(x?.game_id));
            odds = retained.concat(byIds);
          } else {
            console.log(`[NBA] game_ids fallback returned 0 rows for ${targetIds.length} games.`);
          }
        }
      } catch (e) {
        console.warn('[BallDonLieOdds][NBA] v2 odds by game_ids fallback failed:', e?.response?.data || e?.message || e);
      }
    }

    // NFL: if date-based odds are sparse, fall back to querying by game_ids (covers season/week cases)
    if (sportKey === 'americanfootball_nfl') {
      try {
        const uniqueGameIds = (games || []).map(g => g?.id).filter(id => id != null);
        const hasVendors = Array.isArray(odds) && odds.some(r => uniqueGameIds.includes(r?.game_id));
        if (uniqueGameIds.length && !hasVendors) {
          const byIds = await ballDontLieService.getOddsV2({ game_ids: uniqueGameIds, per_page: 100 }, 'nfl');
          if (Array.isArray(byIds) && byIds.length) {
            odds = byIds;
          }
        }
        if (!Array.isArray(odds) || odds.length === 0) {
          const seasonWeekPairs = [];
          for (const g of games || []) {
            const season = g?.season;
            const week = g?.week;
            if (season && week != null) {
              const key = `${season}-${week}`;
              if (!seasonWeekPairs.find(p => p.key === key)) {
                seasonWeekPairs.push({ key, season, week });
              }
            }
          }
          for (const pair of seasonWeekPairs) {
            const seasonWeekOdds = await fetchNflOddsBySeasonWeek(pair.season, pair.week);
            if (Array.isArray(seasonWeekOdds) && seasonWeekOdds.length) {
              odds = (odds || []).concat(seasonWeekOdds);
            }
          }
        }
      } catch (e) {
        console.warn('[OddsService][NFL] Fallback by game_ids failed:', e?.message || e);
      }
    }

    // Index odds by game_id
    const gameIdToVendors = new Map();
    odds.forEach(row => {
      const list = gameIdToVendors.get(row.game_id) || [];
      list.push(row);
      gameIdToVendors.set(row.game_id, list);
    });

    // NFL per-game fallback: if specific game rows exist but lack ML/spread, pull season/week odds and merge
    if (sportKey === 'americanfootball_nfl' && Array.isArray(games)) {
      for (const g of games) {
        const rows = gameIdToVendors.get(g.id) || [];
        const hasMlInRows = rows.some(r => {
          const h = toNumber(r?.moneyline_home_odds);
          const a = toNumber(r?.moneyline_away_odds);
          return h !== null || a !== null;
        });
        const hasSpreadInRows = rows.some(r => {
          const sh = toNumber(r?.spread_home_value);
          const sa = toNumber(r?.spread_away_value);
          return sh !== null || sa !== null;
        });
        if (!hasMlInRows && !hasSpreadInRows) {
          try {
            const season = g?.season;
            const week = g?.week;
            if (season && week != null) {
              const v1Rows = await fetchNflOddsBySeasonWeek(season, week);
              const forGame = (v1Rows || []).filter(r => r?.game_id === g.id);
              if (forGame.length) {
                const existing = gameIdToVendors.get(g.id) || [];
                gameIdToVendors.set(g.id, existing.concat(forGame));
                console.log(`[BallDonLieOdds][NFL] v1 fallback merged for game ${g.id} (${(g.visitor_team?.name || g.away_team?.name || '')} @ ${(g.home_team?.name || '')})`);
              } else {
                console.warn(`[BallDonLieOdds][NFL] v1 fallback returned no rows for game ${g.id} (season ${season}, week ${week})`);
              }
            }
          } catch (e) {
            console.warn('[BallDonLieOdds][NFL] per-game v1 fallback failed:', e?.message || e);
          }
        }
      }
    }

    const mapTeamName = (teamObjOrName) => {
      if (!teamObjOrName) return '';
      if (typeof teamObjOrName === 'string') return teamObjOrName;
      return teamObjOrName.full_name || teamObjOrName.name || teamObjOrName.city || '';
    };

    return (games || []).map(g => {
      const vendors = gameIdToVendors.get(g.id) || [];
      const bookmakers = vendors.map(v => {
        const totalsOutcomes = [];
        const totalPoint = toNumber(v.total_value);
        const totalOver = toNumber(v.total_over_odds);
        const totalUnder = toNumber(v.total_under_odds);
        if (totalPoint !== null && totalOver !== null) {
          totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
        }
        if (totalPoint !== null && totalUnder !== null) {
          totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
        }
        const spreadsOutcomes = [];
        const homeSpreadPoint = toNumber(v.spread_home_value);
        const homeSpreadPrice = toNumber(v.spread_home_odds);
        if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
          spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
        }
        const awaySpreadPoint = toNumber(v.spread_away_value);
        const awaySpreadPrice = toNumber(v.spread_away_odds);
        if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
          spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
        }
        const h2hOutcomes = [];
        const mlHome = toNumber(v.moneyline_home_odds);
        if (mlHome !== null) {
          h2hOutcomes.push({ name: mapTeamName(g.home_team), price: mlHome });
        }
        const mlAway = toNumber(v.moneyline_away_odds);
        if (mlAway !== null) {
          h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: mlAway });
        }
        if (typeof v.moneyline_draw_odds !== 'undefined') {
          h2hOutcomes.push({ name: 'Draw', price: v.moneyline_draw_odds });
        }

        const markets = [];
        if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
        if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
        if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });

        return {
          key: v.vendor,
          title: v.vendor,
          markets
        };
      });

      // Normalize away/visitor for non-NBA sports
      const awayTeamName = mapTeamName(g.visitor_team || g.away_team);
      const homeTeamName = mapTeamName(g.home_team);

      // Use proper datetime fields for accurate timezone handling
      // BDL returns for NFL: date="2026-01-25T20:00:00.000Z" (ISO with actual game time!)
      // But datetime/start_time_utc are often undefined, and status is human-readable
      // Priority: date (if ISO) > datetime > start_time_utc > fallback

      // DEBUG: Log what BDL returns for NFL games
      if (sportKey === 'americanfootball_nfl') {
        console.log(`[BDL Odds] NFL Game ${g.id}: date=${g.date}, datetime=${g.datetime}, status=${g.status}, start_time_utc=${g.start_time_utc}`);
      }

      let commenceTime = g.datetime || g.start_time_utc;

      // NFL FIX: BDL returns the actual game time in g.date as an ISO string (e.g., "2026-01-25T20:00:00.000Z")
      // Check if g.date contains 'T' indicating it's an ISO datetime, not just a date
      if (!commenceTime && g.date && g.date.includes('T')) {
        commenceTime = g.date;
        console.log(`[BDL Odds] Using g.date as ISO datetime: ${commenceTime}`);
      }

      // Fallback: If date is just YYYY-MM-DD format, add reasonable game time
      if (!commenceTime && g.date) {
        // Check if it's a simple date string (no T)
        if (!g.date.includes('T')) {
          const dateParts = g.date.split('-');
          const gameDate = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 20, 0, 0));
          commenceTime = gameDate.toISOString();
          console.log(`[BDL Odds] WARNING: No datetime, using date+offset: ${g.date} -> ${commenceTime}`);
        }
      }

      commenceTime = commenceTime || new Date().toISOString();

      // DEBUG: Log final commence_time
      if (sportKey === 'americanfootball_nfl') {
        console.log(`[BDL Odds] NFL Game ${g.id}: FINAL commence_time = ${commenceTime}`);
      }

      const result = {
        id: g.id,
        sport_key: sportKey,
        home_team: homeTeamName,
        away_team: awayTeamName,
        commence_time: commenceTime,
        bookmakers
      };
      if (sportKey === 'americanfootball_nfl') {
        const hasMl = bookmakers.some(b => (b.markets || []).some(m => m.key === 'h2h' && m.outcomes?.some(o => typeof o.price === 'number')));
        const hasSpread = bookmakers.some(b => (b.markets || []).some(m => m.key === 'spreads' && m.outcomes?.some(o => typeof o.price === 'number' && typeof o.point === 'number')));
        if (!hasMl || !hasSpread) {
          console.warn(`[OddsService][NFL] Missing odds data for ${awayTeamName} @ ${homeTeamName} (ML=${hasMl}, spread=${hasSpread})`);
        }
      }
      return result;
    });
  },

  /**
   * Fetch NFL player props from BDL
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors[])
   * @returns {Promise<Array>} Player props in normalized format
   */
  async getNflPlayerProps(gameId, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Missing Ball Don\'t Lie API key');
    if (!gameId) throw new Error('game_id is required for player props');

    try {
      const params = { game_id: gameId };
      if (options.player_id) params.player_id = options.player_id;
      if (options.prop_type) params.prop_type = options.prop_type;
      if (options.vendors) params['vendors[]'] = options.vendors;

      const resp = await axios.get(BDL_NFL_PROPS_V1, {
        params,
        headers: { Authorization: apiKey }
      });

      const props = Array.isArray(resp?.data?.data) ? resp.data.data : [];
      return normalizePlayerProps(props, 'nfl');
    } catch (e) {
      console.warn('[BDL] NFL player props fetch failed:', e?.response?.data || e?.message);
      return [];
    }
  },

  /**
   * Fetch NHL player props from BDL
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors[])
   * @returns {Promise<Array>} Player props in normalized format
   */
  async getNhlPlayerProps(gameId, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Missing Ball Don\'t Lie API key');
    if (!gameId) throw new Error('game_id is required for player props');

    try {
      const params = { game_id: gameId };
      if (options.player_id) params.player_id = options.player_id;
      if (options.prop_type) params.prop_type = options.prop_type;
      if (options.vendors) params['vendors[]'] = options.vendors;

      const resp = await axios.get(BDL_NHL_PROPS_V1, {
        params,
        headers: { Authorization: apiKey }
      });

      const props = Array.isArray(resp?.data?.data) ? resp.data.data : [];
      return normalizePlayerProps(props, 'nhl');
    } catch (e) {
      console.warn('[BDL] NHL player props fetch failed:', e?.response?.data || e?.message);
      return [];
    }
  },

  /**
   * Fetch NBA player props from BDL (if available)
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors[])
   * @returns {Promise<Array>} Player props in normalized format
   */
  async getNbaPlayerProps(gameId, options = {}) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Missing Ball Don\'t Lie API key');
    if (!gameId) throw new Error('game_id is required for player props');

    try {
      const params = { game_id: gameId };
      if (options.player_id) params.player_id = options.player_id;
      if (options.prop_type) params.prop_type = options.prop_type;
      if (options.vendors) params['vendors[]'] = options.vendors;

      const resp = await axios.get(BDL_NBA_PROPS_V1, {
        params,
        headers: { Authorization: apiKey }
      });

      const props = Array.isArray(resp?.data?.data) ? resp.data.data : [];
      return normalizePlayerProps(props, 'nba');
    } catch (e) {
      console.warn('[BDL] NBA player props fetch failed:', e?.response?.data || e?.message);
      return [];
    }
  }
};

/**
 * Normalize BDL player props to a consistent format
 * BDL format: { player_id, vendor, prop_type, line_value, market: { type, over_odds, under_odds } OR { type, odds } }
 * Output format: { player_id, player, team, prop_type, line, over_odds, under_odds, bookmaker }
 */
function normalizePlayerProps(props, sport) {
  return props.map(p => {
    const market = p.market || {};
    const isOverUnder = market.type === 'over_under';

    return {
      id: p.id,
      game_id: p.game_id,
      player_id: p.player_id,
      player: p.player_name || `Player ${p.player_id}`, // BDL may not include player name - we'll need to join
      prop_type: p.prop_type,
      line: toNumber(p.line_value),
      over_odds: isOverUnder ? toNumber(market.over_odds) : null,
      under_odds: isOverUnder ? toNumber(market.under_odds) : null,
      milestone_odds: !isOverUnder ? toNumber(market.odds) : null,
      market_type: market.type,
      bookmaker: p.vendor,
      updated_at: p.updated_at
    };
  });
}

