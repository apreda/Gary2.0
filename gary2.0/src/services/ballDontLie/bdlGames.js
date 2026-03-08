import { getCachedOrFetch, initApi, buildQuery, normalizeName, getCurrentNhlSeason, axios, BALLDONTLIE_API_BASE_URL, API_KEY } from './bdlCore.js';

/**
 * Normalize game objects to standard field names.
 * NBA is the standard shape — all other sports get mapped to match.
 *
 * Standard fields: date, status, home_team_score, visitor_team_score,
 *                  home_team.name, visitor_team
 */
function normalizeGame(sportKey, game) {
  if (!game) return game;

  if (sportKey === 'icehockey_nhl') {
    game.date = game.game_date;
    game.status = game.game_state;
    game.home_team_score = game.home_score;
    game.visitor_team_score = game.away_score;
    if (game.away_team && !game.visitor_team) {
      game.visitor_team = game.away_team;
    }
    // NHL teams only have full_name — derive short name
    for (const team of [game.home_team, game.away_team, game.visitor_team]) {
      if (team?.full_name && !team.name) {
        team.name = team.full_name.split(' ').pop();
      }
    }
  }

  if (sportKey === 'basketball_ncaab') {
    game.home_team_score = game.home_score;
    game.visitor_team_score = game.away_score;
  }

  return game;
}

export const gamesMethods = {
  async getGames(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_games_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let games;
        const sport = this._getSportClient(sportKey);
        if (sport?.getGames) {
          const resp = await sport.getGames(params);
          games = resp?.data || [];
        } else {
          const endpointMap = {
            icehockey_nhl: 'nhl/v1/games',
            americanfootball_nfl: 'nfl/v1/games',
            americanfootball_ncaaf: 'ncaaf/v1/games',
            basketball_ncaab: 'ncaab/v1/games',
            basketball_nba: 'nba/v1/games',
            baseball_mlb: 'mlb/v1/games'
          };
          const path = endpointMap[sportKey];
          if (!path) throw new Error('getGames not supported');
          const qs = buildQuery(params);
          const url = `https://api.balldontlie.io/${path}${qs}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json().catch(() => ({}));
          games = Array.isArray(json?.data) ? json.data : [];
        }
        return games.map(g => normalizeGame(sportKey, g));
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getGames error:`, e.message);
      throw e;
    }
  },

  /**
   * Get NBA box scores for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of box score data with full player stats
   */
  async getNbaBoxScores(date, ttlMinutes = 10) {
    try {
      if (!date) return [];
      
      const cacheKey = `nba_box_scores_${date}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/box_scores?date=${date}`;
        console.log(`[Ball Don't Lie] Fetching NBA box scores for ${date}`);
        
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaBoxScores error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NBA game objects with IDs
   */
  async getNbaGamesForDate(dateStr) {
    try {
      const cacheKey = `nba_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NBA games for ${dateStr}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NBA games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NBA games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NHL games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NHL game objects with IDs
   */
  async getNhlGamesForDate(dateStr) {
    try {
      const cacheKey = `nhl_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NHL games for ${dateStr}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NHL games for ${dateStr}`);
        return games.map(g => normalizeGame('icehockey_nhl', g));
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NHL box scores for recent games (for trend analysis)
   * Endpoint: GET /nhl/v1/box_scores?dates[]=YYYY-MM-DD
   * @param {Array<string>} dates - Array of dates in YYYY-MM-DD format
   * @param {Object} options - Optional filters (team_ids, player_ids)
   * @returns {Promise<Array>} - Array of box score entries
   */
  async getNhlRecentBoxScores(dates, options = {}) {
    try {
      if (!dates || dates.length === 0) return [];

      const cacheKey = `nhl_box_scores_${dates.join(',')}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let allBoxScores = [];
        
        // Fetch box scores for each date (with pagination support)
        for (const date of dates.slice(0, 7)) { // Limit to 7 days
          let cursor = null;
          let pageCount = 0;
          const maxPages = 5;

          do {
            const params = { dates: [date], per_page: 100 };
            if (options.team_ids) params.team_ids = options.team_ids;
            if (options.player_ids) params.player_ids = options.player_ids;
            if (cursor) params.cursor = cursor;

            const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/box_scores${buildQuery(params)}`;
            const response = await axios.get(url, {
              headers: { 'Authorization': API_KEY }
            });

            const data = response.data?.data || [];
            allBoxScores = allBoxScores.concat(data);
            
            cursor = response.data?.meta?.next_cursor;
            pageCount++;

            // Rate limit protection
            if (cursor) await new Promise(resolve => setTimeout(resolve, 50));
          } while (cursor && pageCount < maxPages);
        }

        console.log(`[Ball Don't Lie] Retrieved ${allBoxScores.length} NHL box score entries for ${dates.length} days`);
        return allBoxScores;
      }, 15); // Cache for 15 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL box scores error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NFL games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NFL game objects with IDs
   */
  async getNflGamesForDate(dateStr) {
    try {
      const cacheKey = `nfl_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NFL games for ${dateStr}`);

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NFL games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NFL games error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
