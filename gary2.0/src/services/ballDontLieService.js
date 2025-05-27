import { BalldontlieAPI } from '@balldontlie/sdk';

// Set cache TTL (5 minutes for playoff data)
const TTL_MINUTES = 5;
const cacheMap = new Map();

// Get API key from environment
let API_KEY;
try {
  API_KEY = import.meta.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
} catch (e) {
  API_KEY = '3363660a-a082-43b7-a130-6249ff68e5ab';
}

/**
 * Initialize the Ball Don't Lie API client
 */
function initApi() {
  try {
    const client = new BalldontlieAPI({ apiKey: API_KEY });
    return client;
  } catch (e) {
    console.error('Error initializing Ball Don\'t Lie API client:', e);
    return null;
  }
}

/**
 * Get cached data or fetch new data
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data if cache miss
 * @param {number} ttlMinutes - Cache TTL in minutes
 * @returns {Promise<any>} - Cached or fresh data
 */
async function getCachedOrFetch(key, fetchFn, ttlMinutes = TTL_MINUTES) {
  const now = Date.now();
  
  // Check if data is in cache and not expired
  if (cacheMap.has(key)) {
    const { data, expiry } = cacheMap.get(key);
    if (now < expiry) {
      console.log(`[Ball Don't Lie] Using cached data for ${key}`);
      return data;
    }
  }
  
  // Cache miss or expired
  console.log(`[Ball Don't Lie] Fetching fresh data for ${key}`);
  const data = await fetchFn();
  
  // Store in cache with expiry
  const expiry = now + (ttlMinutes * 60 * 1000);
  cacheMap.set(key, { data, expiry });
  
  return data;
}

/**
 * Service for Ball Don't Lie API interactions
 */
const ballDontLieService = {
  /**
   * Clear all cached data (useful for debugging or forcing fresh data)
   */
  clearCache() {
    console.log('🗑️ Clearing all Ball Don\'t Lie API cache');
    cacheMap.clear();
  },

  /**
   * Initialize the service
   */
  initialize() {
    console.log('Initializing Ball Don\'t Lie API Service');
    
    if (API_KEY) {
      console.log('API key is set');
      // Mask the API key in logs
      const maskedKey = API_KEY.substring(0, 3) + '...';
      console.log(`🔑 Ball Don't Lie API Key (masked): ${maskedKey}`);
    } else {
      console.warn('❌ No API key found for Ball Don\'t Lie API');
    }
    
    // Verify that client can be initialized
    const client = initApi();
    if (client) {
      console.log('✅ Ball Don\'t Lie API client initialized successfully');
      // Check that NBA endpoint exists
      if (client.nba) {
        console.log('✅ API client NBA endpoint verified');
      } else {
        console.warn('❌ API client NBA endpoint not found');
      }
    }
  },
  
  /**
   * Get team by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getTeamByName(nameOrId) {
    try {
      // Validate input - prevent toString() errors
      if (nameOrId == null || nameOrId === '') {
        console.warn('getTeamByName: Invalid input provided (null/undefined/empty)');
        return null;
      }
      
      // Convert input to string for consistency
      const nameOrIdStr = String(nameOrId).toLowerCase();
      const idNum = typeof nameOrId === 'number' ? nameOrId : (!isNaN(Number(nameOrIdStr)) ? Number(nameOrIdStr) : null);
      
      // Use different cache keys based on input type
      const cacheKey = idNum !== null ? `team_by_id_${idNum}` : `team_by_name_${nameOrIdStr}`;
      
      return getCachedOrFetch(cacheKey, async () => {
        // Always get full teams list - the API doesn't have a getTeamById method
        const client = initApi();
        const response = await client.nba.getTeams();
        const teams = response.data || [];
        
        // If we have a numeric ID, search by ID first
        if (idNum !== null) {
          const teamById = teams.find(team => team.id === idNum);
          if (teamById) return teamById;
        }
        
        // If no numeric ID or team not found by ID, try string matching
        if (typeof nameOrId === 'string' || !idNum) {
          // Try to find by exact name or abbreviation
          const team = teams.find(
            team => 
              team.name.toLowerCase() === nameOrIdStr || 
              team.full_name.toLowerCase() === nameOrIdStr ||
              team.abbreviation.toLowerCase() === nameOrIdStr
          );
          
          if (team) return team;
          
          // Try to find by partial name match
          const partialMatch = teams.find(
            team => 
              team.name.toLowerCase().includes(nameOrIdStr) || 
              team.full_name.toLowerCase().includes(nameOrIdStr) ||
              team.abbreviation.toLowerCase().includes(nameOrIdStr)
          );
          
          if (partialMatch) return partialMatch;
        }
        
        // If no match found, return null
        return null;
      });
    } catch (error) {
      console.error(`Error getting team by name/id ${nameOrId}:`, error);
      return null;
    }
  },
  
  /**
   * Get all NBA teams
   * @returns {Promise<Array>} - Array of NBA team objects
   */
  async getNbaTeams() {
    try {
      const cacheKey = 'nba_teams';
      return getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching NBA teams from BallDontLie API');
        const client = initApi();
        const response = await client.nba.getTeams();
        return response.data || [];
      }, 60); // Cache for 60 minutes since teams don't change often
    } catch (error) {
      console.error('Error fetching NBA teams:', error);
      return [];
    }
  },

  /**
   * Get NBA playoff stats for current season
   * @param {number} season - Season year (defaults to current year)
   * @param {boolean} todayOnly - If true, only return today's games
   * @returns {Promise<Array>} - Array of playoff games with stats
   */
  async getNbaPlayoffGames(season = new Date().getFullYear(), todayOnly = false) {
    // NBA seasons span two years (e.g., 2024-25 season)
    // For 2025 playoffs, we need season=2024
    // If we're in early months (Jan-June), we're in the second half of the season
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const currentYear = new Date().getFullYear();
    
    // CRITICAL FIX: For May 2025, we want 2024 season (2024-25 NBA season)
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    console.log(`🏀 [SEASON DEBUG] Current date: ${new Date().toISOString()}, Month: ${currentMonth}, Year: ${currentYear}, Using season: ${actualSeason}`);
    
    try {
      const cacheKey = todayOnly ? `nba_playoff_games_today_${actualSeason}` : `nba_playoff_games_${actualSeason}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA playoff games for ${actualSeason} season (${actualSeason}-${actualSeason + 1}) from Ball Don't Lie API${todayOnly ? ' - TODAY ONLY' : ''}`);
        
        const client = initApi();
        let apiParams = { 
          postseason: true, // Get playoff games only
          seasons: [actualSeason], // This was missing - now we get only 2024 season playoffs for 2025
          per_page: 100 // Max allowed
        };
        
        // If we only want today's games, add date filter
        if (todayOnly) {
          const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
          apiParams.dates = [today];
          console.log(`🏀 Filtering for today's games only: ${today}`);
        }
        
        console.log(`🏀 API Request params:`, apiParams);
        
        // CRITICAL FIX: Pass the seasons parameter to get only the specific season's playoffs
        const response = await client.nba.getGames(apiParams);
        
        console.log(`🏀 API Response: Found ${response.data?.length || 0} games in response`);
        
        const games = response.data || [];
        console.log(`🏀 Found ${games.length} playoff games for ${actualSeason} season${todayOnly ? ' (today only)' : ''}`);
        
        // Log sample games for verification
        if (games.length > 0) {
          console.log(`🏀 Sample playoff games:`);
          games.slice(0, 3).forEach(game => {
            console.log(`   - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
          });
        } else if (todayOnly) {
          console.log(`🏀 No playoff games found for today (${new Date().toISOString().split('T')[0]})`);
        }
        
        return games;
      });
    } catch (error) {
      console.error('Error fetching NBA playoff games:', error);
      return [];
    }
  },

  /**
   * Get today's NBA playoff games only
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of today's playoff games
   */
  async getTodaysNbaPlayoffGames(season = new Date().getFullYear()) {
    return this.getNbaPlayoffGames(season, true);
  },

  /**
   * Get NBA season averages for playoff teams (2025 playoffs = 2024 season)
   * @param {number} season - Season year (defaults to current year)
   * @param {Array} teamIds - Array of team IDs to get averages for
   * @returns {Promise<Object>} - Season averages by team
   */
  async getNbaSeasonAverages(season = new Date().getFullYear(), teamIds = []) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
    try {
      const cacheKey = `nba_season_averages_${actualSeason}_${teamIds.join('_')}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA season averages for ${actualSeason} season`);
        const client = initApi();
        
        // Get general base stats for the season
        const response = await client.nba.getSeasonAverages('general', {
          season: actualSeason,
          season_type: 'playoffs', // Focus on playoff averages
          type: 'base'
        });
        
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA season averages:', error);
      return [];
    }
  },

  /**
   * Get NBA player injuries for current playoff teams
   * @param {Array} teamIds - Array of team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data
   */
  async getNbaPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nba_player_injuries_${teamIds.join('_')}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA player injuries for teams: ${teamIds.join(', ')}`);
        const client = initApi();
        
        const response = await client.nba.getPlayerInjuries({
          team_ids: teamIds,
          per_page: 100
        });
        
        const injuries = response.data || [];
        console.log(`🏀 Found ${injuries.length} player injuries`);
        
        return injuries;
      }, 15); // Cache for 15 minutes since injury status changes frequently
    } catch (error) {
      console.error('Error fetching NBA player injuries:', error);
      return [];
    }
  },

  /**
   * Get advanced stats for playoff games
   * @param {Array} gameIds - Array of game IDs to get advanced stats for
   * @returns {Promise<Array>} - Array of advanced stats
   */
  async getNbaAdvancedStats(gameIds = []) {
    try {
      const cacheKey = `nba_advanced_stats_${gameIds.join('_')}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA advanced stats for ${gameIds.length} games`);
        const client = initApi();
        
        const response = await client.nba.getAdvancedStats({
          game_ids: gameIds,
          per_page: 100
        });
        
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA advanced stats:', error);
      return [];
    }
  },

  /**
   * Get live box scores for current NBA games
   * @returns {Promise<Array>} - Array of live box scores
   */
  async getNbaLiveBoxScores() {
    try {
      console.log(`🏀 Fetching NBA live box scores`);
      const client = initApi();
      
      // Live data shouldn't be cached
      const response = await client.nba.getLiveBoxScores();
      
      const boxScores = response.data || [];
      console.log(`🏀 Found ${boxScores.length} live games`);
      
      return boxScores;
    } catch (error) {
      console.error('Error fetching NBA live box scores:', error);
      return [];
    }
  },

  /**
   * Get NBA team standings for current season
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team standings
   */
  async getNbaStandings(season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
    try {
      const cacheKey = `nba_standings_${actualSeason}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA standings for ${actualSeason} season`);
        const client = initApi();
        
        const response = await client.nba.getStandings({
          season: actualSeason
        });
        
        return response.data || [];
      }, 60); // Cache for 60 minutes
    } catch (error) {
      console.error('Error fetching NBA standings:', error);
      return [];
    }
  },

  /**
   * Get active NBA playoff teams (teams still in the playoffs)
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team objects still in the playoffs
   */
  async getActivePlayoffTeams(season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    console.log(`🏀 [SEASON DEBUG] Input season: ${season}, Current month: ${currentMonth}, Calculated actualSeason: ${actualSeason}`);
    
    try {
      const cacheKey = `active_playoff_teams_${actualSeason}`;
      return getCachedOrFetch(cacheKey, async () => {
        // Get all recent playoff games (last 7 days)
        const now = new Date();
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        
        const startDate = lastWeek.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        
        console.log(`🏀 Finding active playoff teams for ${actualSeason} season since ${startDate}`);
        const client = initApi();
        
        // Get recent playoff games with correct season
        const response = await client.nba.getGames({ 
          postseason: true, // Get playoff games only
          seasons: [actualSeason], // Add season filter
          start_date: startDate,
          per_page: 100
        });
        
        const recentGames = response.data || [];
        console.log(`🏀 Found ${recentGames.length} recent playoff games since ${startDate}`);
        
        // If no recent games, fall back to all playoff games
        if (recentGames.length === 0) {
          console.log(`🏀 No recent playoff games found, falling back to all playoff games for ${actualSeason} season`);
          const allPlayoffGames = await this.getNbaPlayoffGames(actualSeason);
          console.log(`🏀 Fallback found ${allPlayoffGames.length} total playoff games for ${actualSeason} season`);
          // Group by series and find series with incomplete records (not finished)
          const seriesMap = new Map();
          
          allPlayoffGames.forEach(game => {
            const homeId = game.home_team.id;
            const awayId = game.visitor_team.id;
            const matchupKey = homeId < awayId ? `${homeId}-${awayId}` : `${awayId}-${homeId}`;
            
            if (!seriesMap.has(matchupKey)) {
              seriesMap.set(matchupKey, {
                games: [],
                teams: [game.home_team, game.visitor_team]
              });
            }
            
            seriesMap.get(matchupKey).games.push(game);
          });
          
          // Find active series (less than 7 games or last game was recent)
          const activeSeries = [...seriesMap.values()].filter(series => {
            // If series has less than 7 games, it might still be active
            if (series.games.length < 7) return true;
            
            // Check if the last game was within the last 3 days
            const sortedGames = [...series.games].sort((a, b) => 
              new Date(b.date) - new Date(a.date)
            );
            
            const lastGameDate = new Date(sortedGames[0].date);
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
            
            return lastGameDate > threeDaysAgo;
          });
          
          // Extract unique teams from active series
          const activeTeams = new Set();
          activeSeries.forEach(series => {
            series.teams.forEach(team => {
              activeTeams.add(team);
            });
          });
          
          return [...activeTeams];
        }
        
        // Extract unique teams from recent games
        const activeTeams = new Map();
        recentGames.forEach(game => {
          if (!activeTeams.has(game.home_team.id)) {
            activeTeams.set(game.home_team.id, game.home_team);
          }
          if (!activeTeams.has(game.visitor_team.id)) {
            activeTeams.set(game.visitor_team.id, game.visitor_team);
          }
        });
        
        return [...activeTeams.values()];
      });
    } catch (error) {
      console.error('Error getting active playoff teams:', error);
      return [];
    }
  },

  /**
   * Get NBA playoff series data for a specific matchup
   * @param {number} season - Season year (defaults to current year)
   * @param {number|string} teamA - First team ID or team name/abbreviation
   * @param {number|string} teamB - Second team ID or team name/abbreviation
   * @returns {Promise<Object>} - Series data including games and series status
   */
  async getNbaPlayoffSeries(season = new Date().getFullYear(), teamA, teamB) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      const cacheKey = `nba_playoff_series_${actualSeason}_${teamA}_${teamB}`;
      return getCachedOrFetch(cacheKey, async () => {
        // Get all playoff games for the season
        const playoffGames = await this.getNbaPlayoffGames(actualSeason);
        
        // Get team data for both teams
        const teamAData = await this.getTeamByName(teamA);
        const teamBData = await this.getTeamByName(teamB);
        
        if (!teamAData || !teamBData) {
          return {
            seriesFound: false,
            message: 'One or both teams not found'
          };
        }
        
        // Find games between these two teams
        const seriesGames = playoffGames.filter(game => 
          (game.home_team.id === teamAData.id && game.visitor_team.id === teamBData.id) ||
          (game.home_team.id === teamBData.id && game.visitor_team.id === teamAData.id)
        );
        
        if (seriesGames.length === 0) {
          return {
            seriesFound: false,
            message: 'No playoff games found between these teams'
          };
        }
        
        // Count wins for each team
        let teamAWins = 0;
        let teamBWins = 0;
        
        seriesGames.forEach(game => {
          if (game.status !== 'Final') return; // Only count completed games
          
          const teamAIsHome = game.home_team.id === teamAData.id;
          const homeTeamWon = game.home_team_score > game.visitor_team_score;
          
          if ((teamAIsHome && homeTeamWon) || (!teamAIsHome && !homeTeamWon)) {
            teamAWins++;
          } else {
            teamBWins++;
          }
        });
        
        // Determine series status
        let seriesStatus = '';
        if (teamAWins >= 4) {
          seriesStatus = `${teamAData.name} won the series 4-${teamBWins}`;
        } else if (teamBWins >= 4) {
          seriesStatus = `${teamBData.name} won the series 4-${teamAWins}`;
        } else {
          seriesStatus = `${teamAData.name} ${teamAWins} - ${teamBWins} ${teamBData.name}`;
        }
        
        // Sort games by date
        const sortedGames = [...seriesGames].sort((a, b) => 
          new Date(a.date) - new Date(b.date)
        );
        
        return {
          seriesFound: true,
          teamA: teamAData,
          teamB: teamBData,
          teamAWins,
          teamBWins,
          seriesStatus,
          games: sortedGames
        };
      });
    } catch (error) {
      console.error('Error getting NBA playoff series:', error);
      return { seriesFound: false, message: error.message };
    }
  },
  
  /**
   * Get detailed stats for players in a specific playoff game
   * @param {number} gameId - Game ID
   * @returns {Promise<Array>} - Array of player stats for the game
   */
  async getNbaPlayoffGameStats(gameId) {
    try {
      const cacheKey = `nba_playoff_game_stats_${gameId}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NBA playoff game stats for game ID ${gameId}`);
        const client = initApi();
        const response = await client.nba.getStats({
          game_ids: [gameId],
          postseason: true, // CRITICAL: Ensure we get playoff stats only
          per_page: 50 // Get all players from the game
        });
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA playoff game stats:', error);
      return [];
    }
  },

  /**
   * Get detailed playoff stats for key players on both teams (May 2025 = NBA Playoffs Active)
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Object>} - Object with home and away team playoff player stats
   */
  async getNbaPlayoffPlayerStats(homeTeam, awayTeam, season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      console.log(`🏀 [Ball Don't Lie] Getting playoff player stats for ${awayTeam} @ ${homeTeam} (${actualSeason} season)`);
      
      // Get team data
      const homeTeamData = await this.getTeamByName(homeTeam);
      const awayTeamData = await this.getTeamByName(awayTeam);
      
      if (!homeTeamData || !awayTeamData) {
        console.log(`🏀 [Ball Don't Lie] Could not find team data for ${homeTeam} or ${awayTeam}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏀 [Ball Don't Lie] Found teams: ${homeTeamData.full_name} (ID: ${homeTeamData.id}) vs ${awayTeamData.full_name} (ID: ${awayTeamData.id})`);
      
      // CRITICAL FIX: It's May 2025, so we're in NBA playoffs - get current playoff games
      console.log(`🏀 [Ball Don't Lie] Getting current playoff games for ${actualSeason} season (May 2025 - playoffs are active)`);
      
      const client = initApi();
      const response = await client.nba.getGames({
        seasons: [actualSeason],
        postseason: true, // CRITICAL: Get playoff games only
        per_page: 100
      });
      
      const playoffGames = response.data || [];
      console.log(`🏀 [Ball Don't Lie] Found ${playoffGames.length} total playoff games for ${actualSeason} season`);
      
      // Filter games for each team
      const homeTeamGames = playoffGames.filter(game => 
        game.home_team.id === homeTeamData.id || game.visitor_team.id === homeTeamData.id
      ).slice(-5); // Last 5 playoff games
      
      const awayTeamGames = playoffGames.filter(game => 
        game.home_team.id === awayTeamData.id || game.visitor_team.id === awayTeamData.id
      ).slice(-5); // Last 5 playoff games
      
      console.log(`[Ball Don't Lie] ${homeTeam} (ID: ${homeTeamData.id}): Found ${homeTeamGames.length} playoff games`);
      console.log(`[Ball Don't Lie] ${awayTeam} (ID: ${awayTeamData.id}): Found ${awayTeamGames.length} playoff games`);
      
      // Debug: Log sample games for each team
      if (homeTeamGames.length > 0) {
        console.log(`[Ball Don't Lie] Sample ${homeTeam} games:`);
        homeTeamGames.slice(0, 2).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      }
      
      if (awayTeamGames.length > 0) {
        console.log(`[Ball Don't Lie] Sample ${awayTeam} games:`);
        awayTeamGames.slice(0, 2).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      }
      
      // If no games found for a team, try alternative team name matching
      let finalHomeTeamGames = homeTeamGames;
      let finalAwayTeamGames = awayTeamGames;
      
      if (homeTeamGames.length === 0) {
        console.log(`[Ball Don't Lie] No playoff games found for ${homeTeam}, trying alternative matching...`);
        
        // Enhanced matching with multiple strategies
        finalHomeTeamGames = playoffGames.filter(game => {
          const homeGameTeam = game.home_team.name.toLowerCase();
          const awayGameTeam = game.visitor_team.name.toLowerCase();
          const searchTeam = homeTeam.toLowerCase();
          
          // Strategy 1: Direct name matching
          if (homeGameTeam.includes(searchTeam) || awayGameTeam.includes(searchTeam)) return true;
          if (searchTeam.includes(homeGameTeam) || searchTeam.includes(awayGameTeam)) return true;
          
          // Strategy 2: City/team name extraction (e.g., "Indiana Pacers" -> "pacers", "indiana")
          const searchWords = searchTeam.split(' ');
          const homeWords = homeGameTeam.split(' ');
          const awayWords = awayGameTeam.split(' ');
          
          for (const word of searchWords) {
            if (word.length > 3) { // Only check meaningful words
              if (homeWords.some(w => w.includes(word)) || awayWords.some(w => w.includes(word))) return true;
              if (homeWords.some(w => word.includes(w)) || awayWords.some(w => word.includes(w))) return true;
            }
          }
          
          return false;
        }).slice(-5);
        console.log(`[Ball Don't Lie] Alternative matching found ${finalHomeTeamGames.length} games for ${homeTeam}`);
      }
      
      if (awayTeamGames.length === 0) {
        console.log(`[Ball Don't Lie] No playoff games found for ${awayTeam}, trying alternative matching...`);
        
        // Enhanced matching with multiple strategies
        finalAwayTeamGames = playoffGames.filter(game => {
          const homeGameTeam = game.home_team.name.toLowerCase();
          const awayGameTeam = game.visitor_team.name.toLowerCase();
          const searchTeam = awayTeam.toLowerCase();
          
          // Strategy 1: Direct name matching
          if (homeGameTeam.includes(searchTeam) || awayGameTeam.includes(searchTeam)) return true;
          if (searchTeam.includes(homeGameTeam) || searchTeam.includes(awayGameTeam)) return true;
          
          // Strategy 2: City/team name extraction (e.g., "Indiana Pacers" -> "pacers", "indiana")
          const searchWords = searchTeam.split(' ');
          const homeWords = homeGameTeam.split(' ');
          const awayWords = awayGameTeam.split(' ');
          
          for (const word of searchWords) {
            if (word.length > 3) { // Only check meaningful words
              if (homeWords.some(w => w.includes(word)) || awayWords.some(w => w.includes(word))) return true;
              if (homeWords.some(w => word.includes(w)) || awayWords.some(w => word.includes(w))) return true;
            }
          }
          
          return false;
        }).slice(-5);
        console.log(`[Ball Don't Lie] Alternative matching found ${finalAwayTeamGames.length} games for ${awayTeam}`);
      }
      
      // Get player stats from playoff games
      const getTeamPlayerStats = async (games, teamId) => {
        const playerStatsMap = new Map();
        
        for (const game of games) {
          try {
            console.log(`[Ball Don't Lie] Getting stats for game ${game.id}: ${game.visitor_team.name} @ ${game.home_team.name}`);
            const gameStats = await this.getNbaPlayoffGameStats(game.id);
            console.log(`[Ball Don't Lie] Game ${game.id}: Found ${gameStats.length} total player stats`);
            
            const teamStats = gameStats.filter(stat => stat.team.id === teamId);
            console.log(`[Ball Don't Lie] Game ${game.id}: Found ${teamStats.length} stats for team ${teamId}`);
            
            teamStats.forEach(stat => {
              const playerId = stat.player.id;
              if (!playerStatsMap.has(playerId)) {
                playerStatsMap.set(playerId, {
                  player: stat.player,
                  games: 0,
                  // Basic Stats
                  totalPts: 0,
                  totalReb: 0,
                  totalAst: 0,
                  totalStl: 0,
                  totalBlk: 0,
                  totalMin: 0,
                  totalFgm: 0,
                  totalFga: 0,
                  total3pm: 0,
                  total3pa: 0,
                  totalFtm: 0,
                  totalFta: 0,
                  totalTurnover: 0,
                  // Advanced Stats
                  totalPlusMinus: 0,
                  totalOreb: 0,
                  totalDreb: 0,
                  totalPf: 0,
                  // For calculating advanced metrics
                  totalTeamPts: 0,
                  totalOppPts: 0,
                  totalTeamPoss: 0,
                  totalOppPoss: 0
                });
              }
              
              const playerData = playerStatsMap.get(playerId);
              playerData.games += 1;
              
              // Basic Stats
              playerData.totalPts += stat.pts || 0;
              playerData.totalReb += stat.reb || 0;
              playerData.totalAst += stat.ast || 0;
              playerData.totalStl += stat.stl || 0;
              playerData.totalBlk += stat.blk || 0;
              playerData.totalMin += stat.min ? parseInt(stat.min.split(':')[0]) : 0;
              playerData.totalFgm += stat.fgm || 0;
              playerData.totalFga += stat.fga || 0;
              playerData.total3pm += stat.fg3m || 0;
              playerData.total3pa += stat.fg3a || 0;
              playerData.totalFtm += stat.ftm || 0;
              playerData.totalFta += stat.fta || 0;
              playerData.totalTurnover += stat.turnover || 0;
              
              // Advanced Stats (if available)
              playerData.totalPlusMinus += stat.plus_minus || 0;
              playerData.totalOreb += stat.oreb || 0;
              playerData.totalDreb += stat.dreb || 0;
              playerData.totalPf += stat.pf || 0;
            });
          } catch (error) {
            console.error(`[Ball Don't Lie] Error getting stats for game ${game.id}:`, error.message);
          }
        }
        
        // Calculate averages and advanced metrics
        const allPlayers = Array.from(playerStatsMap.values());
        console.log(`[Ball Don't Lie] Team ${teamId}: Found ${allPlayers.length} players before filtering`);
        
        // Log player game counts for debugging
        allPlayers.forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} games`);
        });
        
        // Use more lenient filtering - require at least 1 game instead of 2
        const filteredPlayers = allPlayers.filter(player => player.games >= 1);
        console.log(`[Ball Don't Lie] Team ${teamId}: ${filteredPlayers.length} players after filtering (>=1 game)`);
        
        return filteredPlayers
          .map(player => {
            const games = player.games;
            
            // Basic averages
            const avgPts = (player.totalPts / games).toFixed(1);
            const avgReb = (player.totalReb / games).toFixed(1);
            const avgAst = (player.totalAst / games).toFixed(1);
            const avgStl = (player.totalStl / games).toFixed(1);
            const avgBlk = (player.totalBlk / games).toFixed(1);
            const avgMin = (player.totalMin / games).toFixed(1);
            const avgTurnover = (player.totalTurnover / games).toFixed(1);
            const avgPlusMinus = (player.totalPlusMinus / games).toFixed(1);
            
            // Shooting percentages
            const fgPct = player.totalFga > 0 ? ((player.totalFgm / player.totalFga) * 100).toFixed(1) : '0.0';
            const fg3Pct = player.total3pa > 0 ? ((player.total3pm / player.total3pa) * 100).toFixed(1) : '0.0';
            const ftPct = player.totalFta > 0 ? ((player.totalFtm / player.totalFta) * 100).toFixed(1) : '0.0';
            
            // True Shooting Percentage: TS% = PTS / (2 * (FGA + 0.44 * FTA))
            const trueShooting = player.totalFga > 0 || player.totalFta > 0 ? 
              ((player.totalPts / (2 * (player.totalFga + 0.44 * player.totalFta))) * 100).toFixed(1) : '0.0';
            
            // Effective Field Goal Percentage: eFG% = (FGM + 0.5 * 3PM) / FGA
            const effectiveFgPct = player.totalFga > 0 ? 
              (((player.totalFgm + 0.5 * player.total3pm) / player.totalFga) * 100).toFixed(1) : '0.0';
            
            // Usage Rate approximation: USG% ≈ (FGA + 0.44 * FTA + TOV) / (Team possessions while player on court)
            // Simplified version using player's individual stats
            const usageRate = player.totalMin > 0 ? 
              (((player.totalFga + 0.44 * player.totalFta + player.totalTurnover) / games) * 2.4).toFixed(1) : '0.0';
            
            // Player Efficiency Rating (simplified): PER ≈ (PTS + REB + AST + STL + BLK - TOV - (FGA - FGM) - (FTA - FTM)) / MIN
            const per = player.totalMin > 0 ? 
              ((player.totalPts + player.totalReb + player.totalAst + player.totalStl + player.totalBlk - 
                player.totalTurnover - (player.totalFga - player.totalFgm) - (player.totalFta - player.totalFtm)) / 
                (player.totalMin / games) * 36).toFixed(1) : '0.0';
            
            return {
              player: player.player,
              games: games,
              
              // Basic Stats
              avgPts,
              avgReb,
              avgAst,
              avgStl,
              avgBlk,
              avgMin,
              avgTurnover,
              
              // Shooting Stats
              fgPct,
              fg3Pct,
              ftPct,
              
              // Advanced Stats
              avgPlusMinus, // ⭐ KEY STAT for playoff impact
              trueShooting,
              effectiveFgPct,
              usageRate,
              per,
              
              // Additional context
              avgOreb: (player.totalOreb / games).toFixed(1),
              avgDreb: (player.totalDreb / games).toFixed(1),
              avgPf: (player.totalPf / games).toFixed(1),
              
              // Efficiency ratios
              astToTov: player.totalTurnover > 0 ? (player.totalAst / player.totalTurnover).toFixed(2) : 'N/A',
              stlToTov: player.totalTurnover > 0 ? (player.totalStl / player.totalTurnover).toFixed(2) : 'N/A'
            };
          })
          .sort((a, b) => parseFloat(b.avgPts) - parseFloat(a.avgPts)) // Sort by points
          .slice(0, 8); // Top 8 players
      };
      
      const [homePlayerStats, awayPlayerStats, injuries] = await Promise.all([
        getTeamPlayerStats(finalHomeTeamGames, homeTeamData.id),
        getTeamPlayerStats(finalAwayTeamGames, awayTeamData.id),
        this.getNbaPlayerInjuries([homeTeamData.id, awayTeamData.id])
      ]);
      
      // Add injury status to player stats
      const addInjuryStatus = (playerStats, teamId) => {
        return playerStats.map(player => {
          const injury = injuries.find(inj => 
            inj.player.id === player.player.id && 
            inj.player.team_id === teamId
          );
          
          return {
            ...player,
            injuryStatus: injury ? {
              status: injury.status,
              description: injury.description,
              returnDate: injury.return_date
            } : null
          };
        });
      };
      
      const homeStatsWithInjuries = addInjuryStatus(homePlayerStats, homeTeamData.id);
      const awayStatsWithInjuries = addInjuryStatus(awayPlayerStats, awayTeamData.id);
      
      console.log(`🏀 [Ball Don't Lie] Found playoff stats for ${homePlayerStats.length} ${homeTeam} players and ${awayPlayerStats.length} ${awayTeam} players`);
      console.log(`🏀 [Ball Don't Lie] Found ${injuries.length} injury reports for both teams`);
      
      return {
        home: homeStatsWithInjuries,
        away: awayStatsWithInjuries,
        homeTeam: homeTeamData,
        awayTeam: awayTeamData,
        injuries: injuries
      };
    } catch (error) {
      console.error(`[Ball Don't Lie] Error getting NBA playoff player stats:`, error);
      return { home: [], away: [] };
    }
  },

  /**
   * Generate a comprehensive NBA playoff report for a specific matchup
   * Focuses only on active playoff teams and their players
   * @param {number} season - Season year (defaults to current year)
   * @param {string|number} teamA - First team ID or name
   * @param {string|number} teamB - Second team ID or name
   * @returns {Promise<string>} - Detailed playoff report
   */
  async generateNbaPlayoffReport(season = new Date().getFullYear(), teamA, teamB) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
    try {
      console.log(`🏀 [Ball Don't Lie] Generating NBA playoff report for ${actualSeason} season`);
      
      // Check if we have active playoff teams
      const activeTeams = await this.getActivePlayoffTeams(actualSeason);
      const activeTeamIds = activeTeams.map(team => team.id);
      
      // If no active teams were provided, use the first active matchup
      if ((!teamA || !teamB) && activeTeams.length >= 2) {
        console.log('No specific teams provided, using first active playoff matchup');
        teamA = activeTeams[0].id;
        teamB = activeTeams[1].id;
      }
      
      // Get team objects regardless of input format
      const teamAData = await this.getTeamByName(teamA);
      const teamBData = await this.getTeamByName(teamB);
      
      // If teams aren't found or aren't active, try to find active ones
      if ((!teamAData || !teamBData || 
          (teamAData && teamBData && !activeTeamIds.includes(teamAData.id) && !activeTeamIds.includes(teamBData.id))) && 
          activeTeams.length >= 2) {
        console.log(`Teams ${teamA} and ${teamB} are not active in playoffs. Using active teams.`);
        teamA = activeTeams[0].id;
        teamB = activeTeams[1].id;
      }
      
      // Get series data
      const seriesData = await this.getNbaPlayoffSeries(actualSeason, teamA, teamB);
      
      if (!seriesData.seriesFound) {
        // If no series found between selected teams, try to find any active series
        if (activeTeams.length >= 2) {
          const activeSeriesData = await this.getNbaPlayoffSeries(actualSeason, activeTeams[0].id, activeTeams[1].id);
          if (activeSeriesData.seriesFound) {
            return this.generateNbaPlayoffReport(actualSeason, activeTeams[0].id, activeTeams[1].id);
          }
        }
        return `No playoff series found between the selected teams for the ${actualSeason} season (${actualSeason}-${actualSeason + 1}).`;
      }
      
      // Generate report header
      let report = `# NBA PLAYOFF SERIES REPORT: ${seriesData.teamA.full_name} vs ${seriesData.teamB.full_name}\n\n`;
      
      // Add active status indicator
      const teamAActive = activeTeamIds.includes(seriesData.teamA.id);
      const teamBActive = activeTeamIds.includes(seriesData.teamB.id);
      
      if (teamAActive && teamBActive) {
        report += `## Status: ACTIVE PLAYOFF MATCHUP - Both teams still in playoffs\n\n`;
      } else if (teamAActive) {
        report += `## Status: ${seriesData.teamA.name} still active in playoffs, ${seriesData.teamB.name} eliminated\n\n`;
      } else if (teamBActive) {
        report += `## Status: ${seriesData.teamB.name} still active in playoffs, ${seriesData.teamA.name} eliminated\n\n`;
      } else {
        report += `## Status: Series Complete - Both teams no longer active in playoffs\n\n`;
      }
      
      report += `## Current Series Status: ${seriesData.seriesStatus}\n\n`;
      
      // Get player stats from the most recent games (up to 3)
      const recentGames = seriesData.games.filter(game => game.status === 'Final').slice(-3);
      
      for (const game of recentGames) {
        const gameStats = await this.getNbaPlayoffGameStats(game.id);
        const gameDate = new Date(game.date).toLocaleDateString();
        
        report += `### Game on ${gameDate}: ${game.visitor_team.name} ${game.visitor_team_score} @ ${game.home_team.name} ${game.home_team_score}\n\n`;
        
        // Group stats by team
        const homeTeamStats = gameStats.filter(stat => stat.team.id === game.home_team.id)
          .sort((a, b) => b.pts - a.pts); // Sort by points scored
          
        const awayTeamStats = gameStats.filter(stat => stat.team.id === game.visitor_team.id)
          .sort((a, b) => b.pts - a.pts); // Sort by points scored
        
        // Report away team top performers
        report += `#### ${game.visitor_team.full_name} Top Performers:\n`;
        awayTeamStats.slice(0, 3).forEach(stat => {
          report += `- ${stat.player.first_name} ${stat.player.last_name}: ${stat.pts} PTS, ${stat.reb} REB, ${stat.ast} AST, ${stat.stl} STL, ${stat.blk} BLK\n`;
        });
        
        // Report home team top performers
        report += `\n#### ${game.home_team.full_name} Top Performers:\n`;
        homeTeamStats.slice(0, 3).forEach(stat => {
          report += `- ${stat.player.first_name} ${stat.player.last_name}: ${stat.pts} PTS, ${stat.reb} REB, ${stat.ast} AST, ${stat.stl} STL, ${stat.blk} BLK\n`;
        });
        
        report += '\n'; // Add spacing between games
      }
      
      // Add series trends and analysis
      report += `## Series Trends and Analysis\n\n`;
      
      // Home court advantage analysis
      const homeWins = seriesData.games.filter(game => 
        game.status === 'Final' && 
        ((game.home_team.id === seriesData.teamA.id && game.home_team_score > game.visitor_team_score) ||
         (game.home_team.id === seriesData.teamB.id && game.home_team_score > game.visitor_team_score))
      ).length;
      
      const totalCompletedGames = seriesData.games.filter(game => game.status === 'Final').length;
      const homeWinPercentage = totalCompletedGames > 0 ? (homeWins / totalCompletedGames * 100).toFixed(1) : 0;
      
      report += `- Home Court Advantage: ${homeWins} of ${totalCompletedGames} games won by home team (${homeWinPercentage}%)\n`;
      
      // Calculate average point differential
      let teamAPointDiff = 0;
      let gamesWithScores = 0;
      
      seriesData.games.forEach(game => {
        if (game.status === 'Final') {
          gamesWithScores++;
          if (game.home_team.id === seriesData.teamA.id) {
            teamAPointDiff += (game.home_team_score - game.visitor_team_score);
          } else {
            teamAPointDiff += (game.visitor_team_score - game.home_team_score);
          }
        }
      });
      
      const avgPointDiff = gamesWithScores > 0 ? (teamAPointDiff / gamesWithScores).toFixed(1) : 0;
      const teamWithAdvantage = avgPointDiff > 0 ? seriesData.teamA.name : (avgPointDiff < 0 ? seriesData.teamB.name : 'Neither team');
      
      report += `- Average Point Differential: ${Math.abs(avgPointDiff)} points in favor of ${teamWithAdvantage}\n`;
      
      return report;
    } catch (error) {
      console.error('Error generating NBA playoff report:', error);
      return `Error generating NBA playoff report: ${error.message}`;
    }
  },

  // ==================== NHL PLAYOFF STATS METHODS ====================
  
  /**
   * Get NHL teams
   * @returns {Promise<Array>} - Array of NHL team objects
   */
  async getNhlTeams() {
    try {
      const cacheKey = 'nhl_teams';
      return getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching NHL teams from BallDontLie API');
        const client = initApi();
        const response = await client.nhl.getTeams();
        return response.data || [];
      }, 60); // Cache for 60 minutes since teams don't change often
    } catch (error) {
      console.error('Error fetching NHL teams:', error);
      return [];
    }
  },

  /**
   * Get NHL team details by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getNhlTeamByName(nameOrId) {
    try {
      // Convert input to string for consistency
      const nameOrIdStr = String(nameOrId).toLowerCase();
      const idNum = typeof nameOrId === 'number' ? nameOrId : (!isNaN(Number(nameOrIdStr)) ? Number(nameOrIdStr) : null);
      
      // Use different cache keys based on input type
      const cacheKey = idNum !== null ? `nhl_team_by_id_${idNum}` : `nhl_team_by_name_${nameOrIdStr}`;
      
      return getCachedOrFetch(cacheKey, async () => {
        // Always get full teams list - the API doesn't have a getTeamById method
        const client = initApi();
        const response = await client.nhl.getTeams();
        const teams = response.data || [];
        
        // If we have a numeric ID, search by ID first
        if (idNum !== null) {
          const teamById = teams.find(team => team.id === idNum);
          if (teamById) return teamById;
        }
        
        // If no numeric ID or team not found by ID, try string matching
        if (typeof nameOrId === 'string' || !idNum) {
          // Try to find by exact name or abbreviation
          const team = teams.find(
            team => 
              team.name.toLowerCase() === nameOrIdStr || 
              team.full_name.toLowerCase() === nameOrIdStr ||
              team.abbreviation.toLowerCase() === nameOrIdStr
          );
          
          if (team) return team;
          
          // Try to find by partial name match
          const partialMatch = teams.find(
            team => 
              team.name.toLowerCase().includes(nameOrIdStr) || 
              team.full_name.toLowerCase().includes(nameOrIdStr) ||
              team.abbreviation.toLowerCase().includes(nameOrIdStr)
          );
          
          if (partialMatch) return partialMatch;
        }
        
        // If no match found, return null
        return null;
      });
    } catch (error) {
      console.error(`Error getting NHL team by name/id ${nameOrId}:`, error);
      return null;
    }
  },

  /**
   * Get NHL playoff games for current season (2025 playoffs = 2024 season)
   * @param {number} season - Season year (defaults to current year)
   * @param {boolean} todayOnly - If true, only return today's games
   * @returns {Promise<Array>} - Array of playoff games
   */
  async getNhlPlayoffGames(season = new Date().getFullYear(), todayOnly = false) {
    // NHL seasons span two years (e.g., 2024-25 season)
    // For May 2025, we want the 2024 season (2024-25 NHL season)
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const cacheKey = todayOnly ? `nhl_playoff_games_today_${actualSeason}_${today}` : `nhl_playoff_games_${actualSeason}`;
      
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 [Ball Don't Lie] Fetching NHL playoff games for ${actualSeason} season (May 2025 - playoffs active)`);
        
        const client = initApi();
        const apiParams = {
          seasons: [actualSeason],
          postseason: true, // CRITICAL: Only playoff games for 2025 playoffs
          per_page: 100
        };
        
        // Add date filter if requesting today's games only
        if (todayOnly) {
          apiParams.dates = [today];
          console.log(`🏒 [Ball Don't Lie] Filtering for today's games only: ${today}`);
        }
        
        console.log(`🏒 [Ball Don't Lie] API request params:`, apiParams);
        
        const response = await client.nhl.getGames(apiParams);
        const games = response.data || [];
        
        console.log(`🏒 [Ball Don't Lie] Found ${games.length} ${todayOnly ? 'today\'s' : 'total'} playoff games for ${actualSeason} season`);
        
        // Debug: Log sample games
        if (games.length > 0) {
          console.log(`🏒 [Ball Don't Lie] Sample NHL playoff games:`);
          games.slice(0, 3).forEach(game => {
            console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
          });
        }
        
        return games;
      }, 1); // Short cache for testing
    } catch (error) {
      console.error('Error fetching NHL playoff games:', error);
      return [];
    }
  },

  /**
   * Get today's NHL playoff games only
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of today's playoff games
   */
  async getTodaysNhlPlayoffGames(season = new Date().getFullYear()) {
    return this.getNhlPlayoffGames(season, true);
  },

  /**
   * Get active NHL playoff teams for 2025 playoffs
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Array>} - Array of team IDs that are in the playoffs
   */
  async getActiveNhlPlayoffTeams(season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      const cacheKey = `nhl_active_playoff_teams_${actualSeason}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 [Ball Don't Lie] Getting active NHL playoff teams for ${actualSeason} season`);
        
        const playoffGames = await this.getNhlPlayoffGames(actualSeason);
        const activeTeams = new Set();
        
        playoffGames.forEach(game => {
          activeTeams.add(game.home_team.id);
          activeTeams.add(game.visitor_team.id);
        });
        
        const teamIds = Array.from(activeTeams);
        console.log(`🏒 [Ball Don't Lie] Found ${teamIds.length} active playoff teams`);
        
        return teamIds;
      });
    } catch (error) {
      console.error('Error getting active NHL playoff teams:', error);
      return [];
    }
  },

  /**
   * Get NHL playoff series data for a specific matchup
   * @param {number} season - Season year (defaults to current year)
   * @param {number|string} teamA - First team ID or team name/abbreviation
   * @param {number|string} teamB - Second team ID or team name/abbreviation
   * @returns {Promise<Object>} - Series data including games and series status
   */
  async getNhlPlayoffSeries(season = new Date().getFullYear(), teamA, teamB) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      const cacheKey = `nhl_playoff_series_${actualSeason}_${teamA}_${teamB}`;
      return getCachedOrFetch(cacheKey, async () => {
        // Get all playoff games for the season
        const playoffGames = await this.getNhlPlayoffGames(actualSeason);
        
        // Get team data for both teams
        const teamAData = await this.getNhlTeamByName(teamA);
        const teamBData = await this.getNhlTeamByName(teamB);
        
        if (!teamAData || !teamBData) {
          return {
            seriesFound: false,
            message: 'One or both teams not found'
          };
        }
        
        // Find games between these two teams
        const seriesGames = playoffGames.filter(game => 
          (game.home_team.id === teamAData.id && game.visitor_team.id === teamBData.id) ||
          (game.home_team.id === teamBData.id && game.visitor_team.id === teamAData.id)
        );
        
        if (seriesGames.length === 0) {
          return {
            seriesFound: false,
            message: 'No playoff games found between these teams'
          };
        }
        
        // Count wins for each team
        let teamAWins = 0;
        let teamBWins = 0;
        
        seriesGames.forEach(game => {
          if (game.status !== 'Final') return; // Only count completed games
          
          const teamAIsHome = game.home_team.id === teamAData.id;
          const homeTeamWon = game.home_team_score > game.visitor_team_score;
          
          if ((teamAIsHome && homeTeamWon) || (!teamAIsHome && !homeTeamWon)) {
            teamAWins++;
          } else {
            teamBWins++;
          }
        });
        
        // Determine series status
        let seriesStatus = '';
        if (teamAWins >= 4) {
          seriesStatus = `${teamAData.name} won the series 4-${teamBWins}`;
        } else if (teamBWins >= 4) {
          seriesStatus = `${teamBData.name} won the series 4-${teamAWins}`;
        } else {
          seriesStatus = `${teamAData.name} ${teamAWins} - ${teamBWins} ${teamBData.name}`;
        }
        
        // Sort games by date
        const sortedGames = [...seriesGames].sort((a, b) => 
          new Date(a.date) - new Date(b.date)
        );
        
        return {
          seriesFound: true,
          teamA: teamAData,
          teamB: teamBData,
          teamAWins,
          teamBWins,
          seriesStatus,
          games: sortedGames
        };
      });
    } catch (error) {
      console.error('Error getting NHL playoff series:', error);
      return { seriesFound: false, message: error.message };
    }
  },

  /**
   * Get detailed stats for players in a specific NHL playoff game
   * @param {number} gameId - Game ID
   * @returns {Promise<Array>} - Array of player stats for the game
   */
  async getNhlPlayoffGameStats(gameId) {
    try {
      const cacheKey = `nhl_playoff_game_stats_${gameId}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NHL playoff game stats for game ID ${gameId}`);
        const client = initApi();
        const response = await client.nhl.getStats({
          game_ids: [gameId],
          postseason: true, // CRITICAL: Ensure we get playoff stats only
          per_page: 50 // Get all players from the game
        });
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NHL playoff game stats:', error);
      return [];
    }
  },

  /**
   * Get detailed playoff stats for key players on both teams (May 2025 = NHL Playoffs Active)
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Object>} - Object with home and away team playoff player stats
   */
  async getNhlPlayoffPlayerStats(homeTeam, awayTeam, season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    try {
      console.log(`🏒 [Ball Don't Lie] Getting playoff player stats for ${awayTeam} @ ${homeTeam} (${actualSeason} season)`);
      
      // Get team data
      const homeTeamData = await this.getNhlTeamByName(homeTeam);
      const awayTeamData = await this.getNhlTeamByName(awayTeam);
      
      if (!homeTeamData || !awayTeamData) {
        console.log(`🏒 [Ball Don't Lie] Could not find team data for ${homeTeam} or ${awayTeam}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏒 [Ball Don't Lie] Found teams: ${homeTeamData.full_name} (ID: ${homeTeamData.id}) vs ${awayTeamData.full_name} (ID: ${awayTeamData.id})`);
      
      // CRITICAL FIX: It's May 2025, so we're in NHL playoffs - get current playoff games
      console.log(`🏒 [Ball Don't Lie] Getting current playoff games for ${actualSeason} season (May 2025 - playoffs are active)`);
      
      const client = initApi();
      const response = await client.nhl.getGames({
        seasons: [actualSeason],
        postseason: true, // CRITICAL: Get playoff games only
        per_page: 100
      });
      
      const playoffGames = response.data || [];
      console.log(`🏒 [Ball Don't Lie] Found ${playoffGames.length} total playoff games for ${actualSeason} season`);
      
      // Filter games for each team
      const homeTeamGames = playoffGames.filter(game => 
        game.home_team.id === homeTeamData.id || game.visitor_team.id === homeTeamData.id
      ).slice(-5); // Last 5 playoff games
      
      const awayTeamGames = playoffGames.filter(game => 
        game.home_team.id === awayTeamData.id || game.visitor_team.id === awayTeamData.id
      ).slice(-5); // Last 5 playoff games
      
      console.log(`[Ball Don't Lie] ${homeTeam} (ID: ${homeTeamData.id}): Found ${homeTeamGames.length} playoff games`);
      console.log(`[Ball Don't Lie] ${awayTeam} (ID: ${awayTeamData.id}): Found ${awayTeamGames.length} playoff games`);
      
      // Debug: Log sample games for each team
      if (homeTeamGames.length > 0) {
        console.log(`[Ball Don't Lie] Sample ${homeTeam} games:`);
        homeTeamGames.slice(0, 2).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      }
      
      if (awayTeamGames.length > 0) {
        console.log(`[Ball Don't Lie] Sample ${awayTeam} games:`);
        awayTeamGames.slice(0, 2).forEach(game => {
          console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
        });
      }
      
      // If no games found for a team, try alternative team name matching
      let finalHomeTeamGames = homeTeamGames;
      let finalAwayTeamGames = awayTeamGames;
      
      if (homeTeamGames.length === 0) {
        console.log(`[Ball Don't Lie] No playoff games found for ${homeTeam}, trying alternative matching...`);
        
        // Enhanced matching with multiple strategies
        finalHomeTeamGames = playoffGames.filter(game => {
          const homeGameTeam = game.home_team.name.toLowerCase();
          const awayGameTeam = game.visitor_team.name.toLowerCase();
          const searchTeam = homeTeam.toLowerCase();
          
          // Strategy 1: Direct name matching
          if (homeGameTeam.includes(searchTeam) || awayGameTeam.includes(searchTeam)) return true;
          if (searchTeam.includes(homeGameTeam) || searchTeam.includes(awayGameTeam)) return true;
          
          // Strategy 2: City/team name extraction (e.g., "Edmonton Oilers" -> "oilers", "edmonton")
          const searchWords = searchTeam.split(' ');
          const homeWords = homeGameTeam.split(' ');
          const awayWords = awayGameTeam.split(' ');
          
          for (const word of searchWords) {
            if (word.length > 3) { // Only check meaningful words
              if (homeWords.some(w => w.includes(word)) || awayWords.some(w => w.includes(word))) return true;
              if (homeWords.some(w => word.includes(w)) || awayWords.some(w => word.includes(w))) return true;
            }
          }
          
          return false;
        }).slice(-5);
        console.log(`[Ball Don't Lie] Alternative matching found ${finalHomeTeamGames.length} games for ${homeTeam}`);
      }
      
      if (awayTeamGames.length === 0) {
        console.log(`[Ball Don't Lie] No playoff games found for ${awayTeam}, trying alternative matching...`);
        
        // Enhanced matching with multiple strategies
        finalAwayTeamGames = playoffGames.filter(game => {
          const homeGameTeam = game.home_team.name.toLowerCase();
          const awayGameTeam = game.visitor_team.name.toLowerCase();
          const searchTeam = awayTeam.toLowerCase();
          
          // Strategy 1: Direct name matching
          if (homeGameTeam.includes(searchTeam) || awayGameTeam.includes(searchTeam)) return true;
          if (searchTeam.includes(homeGameTeam) || searchTeam.includes(awayGameTeam)) return true;
          
          // Strategy 2: City/team name extraction (e.g., "Dallas Stars" -> "stars", "dallas")
          const searchWords = searchTeam.split(' ');
          const homeWords = homeGameTeam.split(' ');
          const awayWords = awayGameTeam.split(' ');
          
          for (const word of searchWords) {
            if (word.length > 3) { // Only check meaningful words
              if (homeWords.some(w => w.includes(word)) || awayWords.some(w => w.includes(word))) return true;
              if (homeWords.some(w => word.includes(w)) || awayWords.some(w => word.includes(w))) return true;
            }
          }
          
          return false;
        }).slice(-5);
        console.log(`[Ball Don't Lie] Alternative matching found ${finalAwayTeamGames.length} games for ${awayTeam}`);
      }
      
      // Get player stats from playoff games
      const getTeamPlayerStats = async (games, teamId) => {
        const playerStatsMap = new Map();
        
        for (const game of games) {
          try {
            console.log(`[Ball Don't Lie] Getting stats for game ${game.id}: ${game.visitor_team.name} @ ${game.home_team.name}`);
            const gameStats = await this.getNhlPlayoffGameStats(game.id);
            console.log(`[Ball Don't Lie] Game ${game.id}: Found ${gameStats.length} total player stats`);
            
            const teamStats = gameStats.filter(stat => stat.team.id === teamId);
            console.log(`[Ball Don't Lie] Game ${game.id}: Found ${teamStats.length} stats for team ${teamId}`);
            
            teamStats.forEach(stat => {
              const playerId = stat.player.id;
              if (!playerStatsMap.has(playerId)) {
                playerStatsMap.set(playerId, {
                  player: stat.player,
                  games: 0,
                  // Basic Stats
                  totalGoals: 0,
                  totalAssists: 0,
                  totalPoints: 0,
                  totalPlusMinus: 0,
                  totalPenaltyMinutes: 0,
                  totalShots: 0,
                  totalHits: 0,
                  totalBlocks: 0,
                  totalFaceoffWins: 0,
                  totalFaceoffs: 0,
                  totalTimeOnIce: 0,
                  // Power Play Stats
                  totalPowerPlayGoals: 0,
                  totalPowerPlayAssists: 0,
                  totalPowerPlayPoints: 0,
                  totalPowerPlayTimeOnIce: 0,
                  // Short Handed Stats
                  totalShortHandedGoals: 0,
                  totalShortHandedAssists: 0,
                  totalShortHandedPoints: 0,
                  totalShortHandedTimeOnIce: 0,
                  // Goalie Stats (if applicable)
                  totalSaves: 0,
                  totalShotsAgainst: 0,
                  totalGoalsAgainst: 0,
                  totalWins: 0,
                  totalLosses: 0,
                  totalOvertimeLosses: 0
                });
              }
              
              const playerData = playerStatsMap.get(playerId);
              playerData.games += 1;
              
              // Basic Stats
              playerData.totalGoals += stat.goals || 0;
              playerData.totalAssists += stat.assists || 0;
              playerData.totalPoints += stat.points || 0;
              playerData.totalPlusMinus += stat.plus_minus || 0;
              playerData.totalPenaltyMinutes += stat.penalty_minutes || 0;
              playerData.totalShots += stat.shots || 0;
              playerData.totalHits += stat.hits || 0;
              playerData.totalBlocks += stat.blocks || 0;
              playerData.totalFaceoffWins += stat.faceoff_wins || 0;
              playerData.totalFaceoffs += stat.faceoffs || 0;
              
              // Time on ice (convert from MM:SS to minutes)
              if (stat.time_on_ice) {
                const [minutes, seconds] = stat.time_on_ice.split(':').map(Number);
                playerData.totalTimeOnIce += minutes + (seconds / 60);
              }
              
              // Power Play Stats
              playerData.totalPowerPlayGoals += stat.power_play_goals || 0;
              playerData.totalPowerPlayAssists += stat.power_play_assists || 0;
              playerData.totalPowerPlayPoints += stat.power_play_points || 0;
              
              if (stat.power_play_time_on_ice) {
                const [minutes, seconds] = stat.power_play_time_on_ice.split(':').map(Number);
                playerData.totalPowerPlayTimeOnIce += minutes + (seconds / 60);
              }
              
              // Short Handed Stats
              playerData.totalShortHandedGoals += stat.short_handed_goals || 0;
              playerData.totalShortHandedAssists += stat.short_handed_assists || 0;
              playerData.totalShortHandedPoints += stat.short_handed_points || 0;
              
              if (stat.short_handed_time_on_ice) {
                const [minutes, seconds] = stat.short_handed_time_on_ice.split(':').map(Number);
                playerData.totalShortHandedTimeOnIce += minutes + (seconds / 60);
              }
              
              // Goalie Stats (if applicable)
              playerData.totalSaves += stat.saves || 0;
              playerData.totalShotsAgainst += stat.shots_against || 0;
              playerData.totalGoalsAgainst += stat.goals_against || 0;
              playerData.totalWins += stat.wins || 0;
              playerData.totalLosses += stat.losses || 0;
              playerData.totalOvertimeLosses += stat.overtime_losses || 0;
            });
          } catch (error) {
            console.error(`[Ball Don't Lie] Error getting stats for game ${game.id}:`, error.message);
          }
        }
        
        // Calculate averages and advanced metrics
        const allPlayers = Array.from(playerStatsMap.values());
        console.log(`[Ball Don't Lie] Team ${teamId}: Found ${allPlayers.length} players before filtering`);
        
        // Log player game counts for debugging
        allPlayers.forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} games`);
        });
        
        // Use more lenient filtering - require at least 1 game instead of 2
        const filteredPlayers = allPlayers.filter(player => player.games >= 1);
        console.log(`[Ball Don't Lie] Team ${teamId}: ${filteredPlayers.length} players after filtering (>=1 game)`);
        
        return filteredPlayers
          .map(player => {
            const games = player.games;
            
            // Basic averages
            const avgGoals = (player.totalGoals / games).toFixed(1);
            const avgAssists = (player.totalAssists / games).toFixed(1);
            const avgPoints = (player.totalPoints / games).toFixed(1);
            const avgPlusMinus = (player.totalPlusMinus / games).toFixed(1);
            const avgPenaltyMinutes = (player.totalPenaltyMinutes / games).toFixed(1);
            const avgShots = (player.totalShots / games).toFixed(1);
            const avgHits = (player.totalHits / games).toFixed(1);
            const avgBlocks = (player.totalBlocks / games).toFixed(1);
            const avgTimeOnIce = (player.totalTimeOnIce / games).toFixed(1);
            
            // Shooting percentage
            const shootingPct = player.totalShots > 0 ? 
              ((player.totalGoals / player.totalShots) * 100).toFixed(1) : '0.0';
            
            // Faceoff percentage
            const faceoffPct = player.totalFaceoffs > 0 ? 
              ((player.totalFaceoffWins / player.totalFaceoffs) * 100).toFixed(1) : '0.0';
            
            // Power Play averages
            const avgPowerPlayGoals = (player.totalPowerPlayGoals / games).toFixed(1);
            const avgPowerPlayAssists = (player.totalPowerPlayAssists / games).toFixed(1);
            const avgPowerPlayPoints = (player.totalPowerPlayPoints / games).toFixed(1);
            const avgPowerPlayTimeOnIce = (player.totalPowerPlayTimeOnIce / games).toFixed(1);
            
            // Short Handed averages
            const avgShortHandedGoals = (player.totalShortHandedGoals / games).toFixed(1);
            const avgShortHandedAssists = (player.totalShortHandedAssists / games).toFixed(1);
            const avgShortHandedPoints = (player.totalShortHandedPoints / games).toFixed(1);
            
            // Goalie stats (if applicable)
            const savePercentage = player.totalShotsAgainst > 0 ? 
              ((player.totalSaves / player.totalShotsAgainst) * 100).toFixed(3) : '0.000';
            const goalsAgainstAverage = games > 0 ? 
              (player.totalGoalsAgainst / games).toFixed(2) : '0.00';
            
            return {
              player: player.player,
              games: games,
              
              // Basic Stats
              avgGoals,
              avgAssists,
              avgPoints,
              avgPlusMinus, // ⭐ KEY STAT for playoff impact
              avgPenaltyMinutes,
              avgShots,
              avgHits,
              avgBlocks,
              avgTimeOnIce,
              
              // Shooting Stats
              shootingPct,
              faceoffPct,
              
              // Power Play Stats
              avgPowerPlayGoals,
              avgPowerPlayAssists,
              avgPowerPlayPoints,
              avgPowerPlayTimeOnIce,
              
              // Short Handed Stats
              avgShortHandedGoals,
              avgShortHandedAssists,
              avgShortHandedPoints,
              
              // Goalie Stats (if applicable)
              savePercentage,
              goalsAgainstAverage,
              wins: player.totalWins,
              losses: player.totalLosses,
              overtimeLosses: player.totalOvertimeLosses,
              
              // Additional context
              totalFaceoffWins: player.totalFaceoffWins,
              totalFaceoffs: player.totalFaceoffs
            };
          })
          .sort((a, b) => parseFloat(b.avgPoints) - parseFloat(a.avgPoints)) // Sort by points
          .slice(0, 8); // Top 8 players
      };
      
      const [homePlayerStats, awayPlayerStats] = await Promise.all([
        getTeamPlayerStats(finalHomeTeamGames, homeTeamData.id),
        getTeamPlayerStats(finalAwayTeamGames, awayTeamData.id)
      ]);
      
      console.log(`🏒 [Ball Don't Lie] Found playoff stats for ${homePlayerStats.length} ${homeTeam} players and ${awayPlayerStats.length} ${awayTeam} players`);
      
      return {
        home: homePlayerStats,
        away: awayPlayerStats,
        homeTeam: homeTeamData,
        awayTeam: awayTeamData
      };
    } catch (error) {
      console.error(`[Ball Don't Lie] Error getting NHL playoff player stats:`, error);
      return { home: [], away: [] };
    }
  },

  /**
   * Get comprehensive NHL playoff analysis for today's game
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} - Comprehensive playoff analysis
   */
  async getComprehensiveNhlPlayoffAnalysis(homeTeam, awayTeam) {
    try {
      console.log(`🏒 [Ball Don't Lie] Getting comprehensive NHL playoff analysis for ${awayTeam} @ ${homeTeam}`);
      
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const actualSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
      
      // Get all playoff data in parallel
      const [
        playerStats,
        playoffSeries,
        todaysGames,
        activeTeams
      ] = await Promise.all([
        this.getNhlPlayoffPlayerStats(homeTeam, awayTeam, actualSeason),
        this.getNhlPlayoffSeries(actualSeason, homeTeam, awayTeam),
        this.getTodaysNhlPlayoffGames(actualSeason),
        this.getActiveNhlPlayoffTeams(actualSeason)
      ]);
      
      // Find today's specific game
      const todaysGame = todaysGames.find(game => {
        const gameHomeTeam = game.home_team.full_name.toLowerCase();
        const gameAwayTeam = game.visitor_team.full_name.toLowerCase();
        
        return (gameHomeTeam.includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(gameHomeTeam)) &&
               (gameAwayTeam.includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(gameAwayTeam));
      });
      
      return {
        game: todaysGame,
        homeTeam: {
          stats: playerStats.home,
          teamData: playerStats.homeTeam
        },
        awayTeam: {
          stats: playerStats.away,
          teamData: playerStats.awayTeam
        },
        series: playoffSeries,
        activePlayoffTeams: activeTeams,
        season: actualSeason
      };
    } catch (error) {
      console.error('Error getting comprehensive NHL playoff analysis:', error);
      return null;
    }
  },

  /**
   * Get NBA team stats using Ball Don't Lie API
   * @param {Array} teamIds - Array of team IDs or team names
   * @param {number} season - Season year (defaults to current playoff season)
   * @returns {Promise<Array>} - Array of team stats objects
   */
  async getNBATeamStats(teamIds, season = null) {
    try {
      // Determine the correct season for playoffs
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const playoffSeason = season || (currentMonth <= 6 ? currentYear - 1 : currentYear);
      
      console.log(`🏀 Fetching NBA team stats for season ${playoffSeason}`);
      
      const teamStatsPromises = teamIds.map(async (teamId) => {
        try {
          // Get team info first if we have a name instead of ID
          let actualTeamId = teamId;
          if (typeof teamId === 'string') {
            const team = await this.getTeamByName(teamId);
            if (team) {
              actualTeamId = team.id;
            } else {
              console.warn(`Could not find team ID for: ${teamId}`);
              return null;
            }
          }
          
          // Validate that we have a valid team ID
          if (!actualTeamId || (typeof actualTeamId !== 'number' && typeof actualTeamId !== 'string')) {
            console.warn(`Invalid team ID: ${actualTeamId} for team: ${teamId}`);
            return null;
          }
          
          // Ensure team ID is a number for the API call
          const numericTeamId = typeof actualTeamId === 'string' ? parseInt(actualTeamId, 10) : actualTeamId;
          if (isNaN(numericTeamId)) {
            console.warn(`Could not convert team ID to number: ${actualTeamId} for team: ${teamId}`);
            return null;
          }
          
          // Get season averages for the team
          const cacheKey = `nba_team_stats_${numericTeamId}_${playoffSeason}`;
          return getCachedOrFetch(cacheKey, async () => {
            const client = initApi();
            
            // Get season averages for all players on the team
            const seasonAveragesResponse = await client.nba.getSeasonAverages({
              season: playoffSeason,
              team_ids: [numericTeamId]
            });
            
            const playerStats = seasonAveragesResponse.data || [];
            
            // Calculate team aggregated stats
            if (playerStats.length === 0) {
              console.warn(`No player stats found for team ${numericTeamId} in season ${playoffSeason}`);
              return {
                teamId: numericTeamId,
                season: playoffSeason,
                stats: {
                  wins: 0,
                  losses: 0,
                  pointsPerGame: 0,
                  pointsAllowedPerGame: 0,
                  fieldGoalPct: 0,
                  threePointPct: 0,
                  reboundsPerGame: 0,
                  assistsPerGame: 0,
                  turnoversPerGame: 0,
                  stealsPerGame: 0,
                  blocksPerGame: 0,
                  playerCount: 0
                }
              };
            }
            
            // Aggregate team stats from player data
            const totalGames = Math.max(...playerStats.map(p => p.games_played || 0));
            const activePlayerStats = playerStats.filter(p => (p.games_played || 0) > totalGames * 0.1); // Players who played in at least 10% of games
            
            const teamStats = {
              teamId: numericTeamId,
              season: playoffSeason,
              stats: {
                // Team record (estimated from games played)
                wins: Math.round(totalGames * 0.6), // Placeholder - API doesn't provide team W/L directly
                losses: Math.round(totalGames * 0.4),
                
                // Offensive stats (sum of all players)
                pointsPerGame: this._sumPlayerStat(activePlayerStats, 'pts'),
                fieldGoalPct: this._avgPlayerStat(activePlayerStats, 'fg_pct'),
                threePointPct: this._avgPlayerStat(activePlayerStats, 'fg3_pct'),
                assistsPerGame: this._sumPlayerStat(activePlayerStats, 'ast'),
                turnoversPerGame: this._sumPlayerStat(activePlayerStats, 'turnover'),
                
                // Defensive/Rebounding stats
                reboundsPerGame: this._sumPlayerStat(activePlayerStats, 'reb'),
                stealsPerGame: this._sumPlayerStat(activePlayerStats, 'stl'),
                blocksPerGame: this._sumPlayerStat(activePlayerStats, 'blk'),
                
                // Estimated defensive rating (placeholder)
                pointsAllowedPerGame: 110 - (this._sumPlayerStat(activePlayerStats, 'stl') + this._sumPlayerStat(activePlayerStats, 'blk')) * 2,
                
                // Metadata
                playerCount: activePlayerStats.length,
                totalGames: totalGames
              }
            };
            
            console.log(`✅ Team stats calculated for team ${numericTeamId}: ${teamStats.stats.pointsPerGame.toFixed(1)} PPG, ${teamStats.stats.reboundsPerGame.toFixed(1)} RPG`);
            return teamStats;
          });
        } catch (error) {
          console.error(`Error fetching stats for team ${teamId}:`, error);
          return null;
        }
      });
      
      const results = await Promise.all(teamStatsPromises);
      return results.filter(result => result !== null);
      
    } catch (error) {
      console.error('Error fetching NBA team stats:', error);
      return [];
    }
  },

  /**
   * Helper method to sum a stat across all players
   * @private
   */
  _sumPlayerStat(playerStats, statName) {
    if (!playerStats || !Array.isArray(playerStats)) {
      return 0;
    }
    return playerStats.reduce((sum, player) => {
      if (!player || typeof player !== 'object') {
        return sum;
      }
      const statValue = player[statName];
      return sum + (typeof statValue === 'number' && !isNaN(statValue) ? statValue : 0);
    }, 0);
  },

  /**
   * Helper method to average a stat across all players (weighted by games played)
   * @private
   */
  _avgPlayerStat(playerStats, statName) {
    if (!playerStats || !Array.isArray(playerStats)) {
      return 0;
    }
    
    const validPlayers = playerStats.filter(p => {
      if (!p || typeof p !== 'object') return false;
      const statValue = p[statName];
      const gamesPlayed = p.games_played;
      return statValue != null && 
             typeof statValue === 'number' && 
             !isNaN(statValue) &&
             gamesPlayed != null && 
             typeof gamesPlayed === 'number' && 
             !isNaN(gamesPlayed) && 
             gamesPlayed > 0;
    });
    
    if (validPlayers.length === 0) return 0;
    
    const totalWeightedStat = validPlayers.reduce((sum, player) => {
      const statValue = player[statName];
      const gamesPlayed = player.games_played;
      return sum + (statValue * gamesPlayed);
    }, 0);
    
    const totalGames = validPlayers.reduce((sum, player) => sum + player.games_played, 0);
    
    return totalGames > 0 ? totalWeightedStat / totalGames : 0;
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
