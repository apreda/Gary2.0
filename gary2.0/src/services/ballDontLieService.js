import { BalldontlieAPI } from '@balldontlie/sdk';

// Set cache TTL (5 minutes default)
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
      console.log(`Using cached data for ${key} (TTL: ${ttlMinutes} minutes)`);
      return data;
    }
  }
  
  // Cache miss or expired
  console.log(`Cache miss or expired for ${key}, fetching fresh data...`);
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
   * Get team details by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getTeamByName(nameOrId) {
    try {
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
   * @returns {Promise<Array>} - Array of playoff games with stats
   */
  async getNbaPlayoffGames(season = new Date().getFullYear()) {
    // NBA seasons span two years (e.g., 2024-25 season)
    // For 2025 playoffs, we need season=2024
    // If we're in early months (Jan-June), we're in the second half of the season
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const actualSeason = currentMonth <= 6 ? season - 1 : season; // If Jan-June, use previous year
    
    try {
      const cacheKey = `nba_playoff_games_${actualSeason}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA playoff games for ${actualSeason} season (${actualSeason}-${actualSeason + 1}) from Ball Don't Lie API`);
        const client = initApi();
        
        // CRITICAL FIX: Pass the seasons parameter to get only the specific season's playoffs
        const response = await client.nba.getGames({ 
          postseason: true,
          seasons: [actualSeason], // This was missing - now we get only 2024 season playoffs for 2025
          per_page: 100 // Max allowed
        });
        
        const games = response.data || [];
        console.log(`🏀 Found ${games.length} playoff games for ${actualSeason} season`);
        
        // Log sample games for verification
        if (games.length > 0) {
          console.log(`🏀 Sample playoff games:`);
          games.slice(0, 3).forEach(game => {
            console.log(`   - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
          });
        }
        
        return games;
      });
    } catch (error) {
      console.error('Error fetching NBA playoff games:', error);
      return [];
    }
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
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
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
          postseason: true,
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
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
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
   * Get detailed playoff stats for key players on both teams
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {number} season - Season year (defaults to current year)
   * @returns {Promise<Object>} - Object with home and away team player stats
   */
  async getNbaPlayoffPlayerStats(homeTeam, awayTeam, season = new Date().getFullYear()) {
    const currentMonth = new Date().getMonth() + 1;
    const actualSeason = currentMonth <= 6 ? season - 1 : season;
    
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
      
      // Get recent playoff games for both teams
      const playoffGames = await this.getNbaPlayoffGames(actualSeason);
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
      
      // Get player stats from recent games
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
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
