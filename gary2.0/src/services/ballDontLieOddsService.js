/**
 * Ball Don't Lie Odds (V2) Service
 * Fetches game-level betting odds and joins to NBA games by date.
 */
import axios from 'axios';
import { ballDontLieService } from './ballDontLieService.js';

const BDL_V2_BASE = 'https://api.balldontlie.io/v2';

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

/**
 * Fetch V2 odds by dates (array of YYYY-MM-DD)
 */
async function fetchOddsByDates(dates = []) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Missing Ball Don\'t Lie API key for odds');
  }
  const params = {};
  if (Array.isArray(dates) && dates.length > 0) {
    params['dates[]'] = dates;
  }
  const resp = await axios.get(`${BDL_V2_BASE}/odds`, {
    params,
    headers: { Authorization: apiKey }
  });
  return Array.isArray(resp?.data?.data) ? resp.data.data : [];
}

/**
 * Get NBA games with odds for a specific date (YYYY-MM-DD)
 * Returns a list of games in a structure similar to oddsService.getUpcomingGames
 */
async function getNbaGamesWithOdds(dateStr) {
  // Fetch games for date via v1 client
  const games = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr], per_page: 100 }, 10);
  // Fetch odds via v2 endpoint
  const odds = await fetchOddsByDates([dateStr]);

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
      if (v.total_value != null) {
        if (typeof v.total_value !== 'undefined') {
          totalsOutcomes.push({ name: 'Over', point: Number(v.total_value), price: v.total_over_odds });
          totalsOutcomes.push({ name: 'Under', point: Number(v.total_value), price: v.total_under_odds });
        }
      }
      const spreadsOutcomes = [];
      if (v.spread_home_value != null) {
        spreadsOutcomes.push({ name: g.home_team?.full_name || g.home_team?.name, point: Number(v.spread_home_value), price: v.spread_home_odds });
      }
      if (v.spread_away_value != null) {
        spreadsOutcomes.push({ name: g.visitor_team?.full_name || g.visitor_team?.name, point: Number(v.spread_away_value), price: v.spread_away_odds });
      }
      const h2hOutcomes = [];
      if (typeof v.moneyline_home_odds !== 'undefined') {
        h2hOutcomes.push({ name: g.home_team?.full_name || g.home_team?.name, price: v.moneyline_home_odds });
      }
      if (typeof v.moneyline_away_odds !== 'undefined') {
        h2hOutcomes.push({ name: g.visitor_team?.full_name || g.visitor_team?.name, price: v.moneyline_away_odds });
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
      commence_time: g.date,
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
    // Fetch games (v1 multi-sport wrapper) and v2 odds (date-based)
    const games = await ballDontLieService.getGames(sportKey, { dates: [dateStr], per_page: 100 }, 10);
    const odds = await fetchOddsByDates([dateStr]);

    // Index odds by game_id
    const gameIdToVendors = new Map();
    odds.forEach(row => {
      const list = gameIdToVendors.get(row.game_id) || [];
      list.push(row);
      gameIdToVendors.set(row.game_id, list);
    });

    const mapTeamName = (teamObjOrName) => {
      if (!teamObjOrName) return '';
      if (typeof teamObjOrName === 'string') return teamObjOrName;
      return teamObjOrName.full_name || teamObjOrName.name || teamObjOrName.city || '';
    };

    return (games || []).map(g => {
      const vendors = gameIdToVendors.get(g.id) || [];
      const bookmakers = vendors.map(v => {
        const totalsOutcomes = [];
        if (v.total_value != null) {
          totalsOutcomes.push({ name: 'Over', point: Number(v.total_value), price: v.total_over_odds });
          totalsOutcomes.push({ name: 'Under', point: Number(v.total_value), price: v.total_under_odds });
        }
        const spreadsOutcomes = [];
        if (v.spread_home_value != null) {
          spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: Number(v.spread_home_value), price: v.spread_home_odds });
        }
        if (v.spread_away_value != null) {
          spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: Number(v.spread_away_value), price: v.spread_away_odds });
        }
        const h2hOutcomes = [];
        if (typeof v.moneyline_home_odds !== 'undefined') {
          h2hOutcomes.push({ name: mapTeamName(g.home_team), price: v.moneyline_home_odds });
        }
        if (typeof v.moneyline_away_odds !== 'undefined') {
          h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: v.moneyline_away_odds });
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
      const commenceTime = g.date || g.commence_time || g.game_time || new Date().toISOString();

      return {
        id: g.id,
        sport_key: sportKey,
        home_team: homeTeamName,
        away_team: awayTeamName,
        commence_time: commenceTime,
        bookmakers
      };
    });
  }
};


