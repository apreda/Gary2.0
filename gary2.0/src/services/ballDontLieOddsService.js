/**
 * Ball Don't Lie Odds (V2) Service
 * Fetches game-level betting odds and joins to NBA games by date.
 */
import axios from 'axios';
import { ballDontLieService } from './ballDontLieService.js';

const BDL_V2_BASE = 'https://api.balldontlie.io/v2';
const BDL_NFL_ODDS_V1 = 'https://api.balldontlie.io/nfl/v1/odds';

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
    // EPL: use sport-specific v1 odds endpoint with moneyline including draw
    if (sportKey === 'soccer_epl') {
      const apiKey = getApiKey();
      const games = await ballDontLieService.getGames('soccer_epl', { dates: [dateStr], per_page: 100 }, 10);
      const ids = (games || []).map(g => g.id).filter(Boolean);
      let oddsRows = [];
      if (ids.length > 0) {
        const params = {};
        params['game_ids[]'] = ids.slice(0, 100);
        const resp = await axios.get('https://api.balldontlie.io/epl/v1/odds', { params, headers: { Authorization: apiKey } });
        oddsRows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }
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
          const h2hOutcomes = [];
          if (typeof v.moneyline_home_odds !== 'undefined') {
            h2hOutcomes.push({ name: mapTeamName(g.home_team), price: v.moneyline_home_odds });
          }
          if (typeof v.moneyline_away_odds !== 'undefined') {
            h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: v.moneyline_away_odds });
          }
          if (typeof v.moneyline_draw_odds !== 'undefined') {
            h2hOutcomes.push({ name: 'Draw', price: v.moneyline_draw_odds });
          }
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });
        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          commence_time: g.kickoff || g.date || g.commence_time || new Date().toISOString(),
          bookmakers
        };
      });
    }
    // Fetch games (v1 multi-sport wrapper) and v2 odds (date-based)
    const games = await ballDontLieService.getGames(sportKey, { dates: [dateStr], per_page: 100 }, 10);
    let odds = await fetchOddsByDates([dateStr]);

    // NFL: if date-based odds are sparse, fall back to querying by game_ids (covers season/week cases)
    if (sportKey === 'americanfootball_nfl') {
      try {
        const uniqueGameIds = (games || []).map(g => g?.id).filter(id => id != null);
        const hasVendors = Array.isArray(odds) && odds.some(r => uniqueGameIds.includes(r?.game_id));
        if (uniqueGameIds.length && !hasVendors) {
          const byIds = await ballDontLieService.getOddsV2({ game_ids: uniqueGameIds, per_page: 100 });
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
      const commenceTime = g.date || g.commence_time || g.game_time || new Date().toISOString();

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
  }
};


