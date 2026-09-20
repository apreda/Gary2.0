import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { fetchBdlPages } from '../bdlPagination.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nflTeamsMethods = {

  /**
   * NFL Team Roster with Depth Chart
   * GET /nfl/v1/teams/<ID>/roster
   * Returns players organized by position with depth (1=starter, 2=backup, etc.)
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @returns {Array} - Roster entries with player info, position, depth, injury_status
   */
  async getNflTeamRoster(teamId, season = null, ttlMinutes = 30) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `nfl_team_roster_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        return fetchBdlPages(async cursor => {
          const query = { season, per_page: 100, ...(cursor != null ? { cursor } : {}) };
          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/teams/${encodeURIComponent(teamId)}/roster${buildQuery(query)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'NFL team roster' });
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflTeamRoster', e);
      console.error('[Ball Don\'t Lie] nfl getNflTeamRoster error:', e.message);
      return [];
    }
  },

  /**
   * NFL Season Stats filtered by team
   * GET /nfl/v1/season_stats
   * Returns player season stats for a specific team
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {boolean} postseason - Include postseason stats
   * @returns {Array} - Player season stats
   */
  async getNflSeasonStatsByTeam(teamId, season = null, postseason = false, ttlMinutes = 15) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `nfl_season_stats_team_${teamId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        return fetchBdlPages(async cursor => {
          const query = { team_id: teamId, season, postseason, per_page: 100, ...(cursor != null ? { cursor } : {}) };
          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats${buildQuery(query)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'NFL team player season stats' });
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflSeasonStatsByTeam', e);
      console.error('[Ball Don\'t Lie] nfl getNflSeasonStatsByTeam error:', e.message);
      return [];
    }
  },

  /**
   * Get NFL standings for a season
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Array>} - Array of team standings with record, division, conference
   */
  /**
   * PRESEASON NEVER COUNTS (founder law, Aug 21 2026). BDL's /nfl/v1/standings
   * carries the August exhibition results until the regular season is
   * underway (probed Sep 2 2026, a week before Week 1: every club showed a
   * 2-1 / 3-0 line with a win streak and a playoff seed; completed seasons
   * show exactly 17 games per club, so the exhibitions drop out once real
   * games exist). Until at least one regular-season game of that season is
   * final, the feed is exhibition standings and no consumer gets it.
   */
  async nflStandingsCountable(season) {
    if (!season) return false;
    const week1 = await this.getGames('americanfootball_nfl', { seasons: [Number(season)], weeks: [1], per_page: 100 });
    return (week1 || []).some((g) => g?.postseason === false
      && (String(g?.status_state || '').toLowerCase() === 'final' || /^final/i.test(String(g?.status || ''))));
  },

  async getNflStandings(season, ttlMinutes = 60) {
    try {
      if (!season) return [];
      if (!(await this.nflStandingsCountable(season))) {
        console.log(`🏈 [Ball Don't Lie] NFL ${season} standings withheld — the regular season is not underway, the feed is preseason results`);
        return [];
      }
      const cacheKey = `nfl_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/standings?season=${season}`;
        console.log(`🏈 [Ball Don't Lie] Fetching NFL standings for ${season} season`);
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflStandings', e);
      console.error('[Ball Don\'t Lie] getNflStandings error:', e.message);
      return [];
    }
  },

  /**
   * Get NFL playoff game history for teams this season
   * Returns previous playoff games with box scores for scout report context
   * @param {Array<number>} teamIds - Array of BDL team IDs (home and away)
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Object>} - { games: [...], teamStats: {...} }
   */
  async getNflPlayoffHistory(teamIds, season, ttlMinutes = 30) {
    try {
      if (!teamIds || teamIds.length === 0 || !season) {
        return { games: [], teamStats: {} };
      }
      
      const cacheKey = `nfl_playoff_history_${teamIds.join('_')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL playoff history for team IDs: ${teamIds.join(', ')} (${season} season)`);
        
        // Fetch playoff games for these teams
        // BDL uses "postseason=true" to filter playoff games
        const params = new URLSearchParams();
        teamIds.forEach(id => params.append('team_ids[]', id));
        params.append('seasons[]', season);
        params.append('postseason', 'true');
        params.append('per_page', '20');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/games?${params.toString()}`;
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const games = resp.data?.data || [];
        
        // Filter to completed games only (status === 'Final')
        const completedGames = games.filter(g => g.status === 'Final');
        console.log(`🏈 [Ball Don't Lie] Found ${completedGames.length} completed NFL playoff games`);
        
        if (completedGames.length === 0) {
          return { games: [], teamStats: {} };
        }
        
        // Fetch team stats (box scores) and player stats for each game
        const gameIds = completedGames.map(g => g.id);
        const [teamStats, playerStats] = await Promise.all([
          this.getNflTeamStatsByGameIds(gameIds),
          this.getNflPlayerStatsByGameIds(gameIds)
        ]);
        
        // Determine playoff round for each game
        const gamesWithRound = completedGames.map(game => ({
          ...game,
          playoffRound: this._getPlayoffRound(game)
        }));
        
        // Sort by date (most recent first)
        gamesWithRound.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log(`🏈 [Ball Don't Lie] NFL playoff history ready: ${gamesWithRound.length} games with box scores and player stats`);
        
        return {
          games: gamesWithRound,
          teamStats: teamStats,
          playerStats: playerStats
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflPlayoffHistory', e);
      console.error('[Ball Don\'t Lie] getNflPlayoffHistory error:', e.message);
      return { games: [], teamStats: {} };
    }
  },

  /**
   * Get NFL team stats (box scores) for specific game IDs
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Map of gameId -> { homeStats, awayStats }
   */
  async getNflTeamStatsByGameIds(gameIds, ttlMinutes = 30) {
    try {
      if (!gameIds || gameIds.length === 0) return {};
      
      const cacheKey = `nfl_team_stats_games_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL team stats for ${gameIds.length} games`);
        
        // Build query with game_ids array
        const params = new URLSearchParams();
        gameIds.forEach(id => params.append('game_ids[]', id));
        params.append('per_page', '100');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/team_stats?${params.toString()}`;
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const stats = resp.data?.data || [];
        
        // Group by game_id -> { home, away }
        const statsByGame = {};
        for (const stat of stats) {
          const gameId = stat.game?.id;
          if (!gameId) continue;
          
          if (!statsByGame[gameId]) {
            statsByGame[gameId] = {};
          }
          
          // Determine if home or away based on home_away field
          if (stat.home_away === 'home') {
            statsByGame[gameId].home = stat;
          } else if (stat.home_away === 'away') {
            statsByGame[gameId].away = stat;
          }
        }
        
        console.log(`🏈 [Ball Don't Lie] Retrieved team stats for ${Object.keys(statsByGame).length} games`);
        return statsByGame;
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflTeamStatsByGameIds', e);
      console.error('[Ball Don\'t Lie] getNflTeamStatsByGameIds error:', e.message);
      return {};
    }
  },

  /**
   * Helper to determine NFL playoff round from game data
   * @param {Object} game - Game object from BDL
   * @returns {string} - Playoff round name
   */
  _getPlayoffRound(game) {
    if (!game || !game.postseason) return 'Regular Season';
    
    const date = new Date(game.date);
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    const week = game.week;
    
    // Super Bowl is typically early February
    if (month === 2 && day >= 1 && day <= 15) return 'Super Bowl';
    
    // Conference Championship is late January (around Jan 25-30)
    if (month === 1 && day >= 24) return 'Conference Championship';
    
    // Divisional Round is mid January (around Jan 16-22)
    if (month === 1 && day >= 16 && day <= 23) return 'Divisional Round';
    
    // Wild Card is early January (around Jan 10-15)
    if (month === 1 && day >= 1 && day <= 15) return 'Wild Card';
    
    // Fallback: use week number if available
    if (week >= 22) return 'Super Bowl';
    if (week >= 21) return 'Conference Championship';
    if (week >= 20) return 'Divisional Round';
    if (week >= 19) return 'Wild Card';
    
    return 'Playoff Game';
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

        const response = await bdlHttp.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NFL games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNflGamesForDate', error);
      console.error(`[Ball Don't Lie] NFL games error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
