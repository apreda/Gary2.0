/**
 * API-Sports Service
 * Provides access to the API-Sports endpoints for various sports data
 * Primary source for MLB data, includes lineup and player statistics
 */
import axios from 'axios';

// Base URLs by sport
const MLB_API_URL = 'https://v1.baseball.api-sports.io';
const NBA_API_URL = 'https://v1.basketball.api-sports.io';
const NHL_API_URL = 'https://v1.hockey.api-sports.io';

// API hosts by sport - MUST match exact host value in headers
const MLB_API_HOST = 'v1.baseball.api-sports.io';
const NBA_API_HOST = 'v1.basketball.api-sports.io';
const NHL_API_HOST = 'v1.hockey.api-sports.io';

// Handle environment variables in both Vite and standalone Node.js
let apiSportsKey = '';
try {
  apiSportsKey = import.meta.env?.VITE_API_SPORTS_KEY || process.env.VITE_API_SPORTS_KEY || 'd3318d31b32a103de8357d1f7924e76a';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  apiSportsKey = process.env.VITE_API_SPORTS_KEY || 'd3318d31b32a103de8357d1f7924e76a';
}

const apiSportsService = {
  // Use the API key from environment variables with fallback
  API_KEY: apiSportsKey,
  
  /**
   * Make a request to the API-Sports endpoint
   * @param {string} endpoint - API endpoint to call
   * @param {object} params - Query parameters
   * @param {string} sport - Sport type (MLB, NBA, NHL)
   * @returns {Promise<Object>} - API response
   */
  async apiRequest(endpoint, params = {}, sport = 'MLB') {
    try {
      // Select the correct base URL based on sport
      const baseUrl = sport === 'MLB' ? MLB_API_URL :
                     sport === 'NBA' ? NBA_API_URL :
                     sport === 'NHL' ? NHL_API_URL :
                     MLB_API_URL;
      
      // Get the correct API host based on sport
      const apiHost = sport === 'MLB' ? MLB_API_HOST :
                     sport === 'NBA' ? NBA_API_HOST :
                     sport === 'NHL' ? NHL_API_HOST :
                     MLB_API_HOST;
      
      const url = `${baseUrl}${endpoint}`;
      console.log(`API-Sports Request [${sport}]: ${url} with params:`, params);
      
      // Create headers exactly as shown in the API documentation
      const headers = {
        'x-rapidapi-key': this.API_KEY,
        'x-rapidapi-host': apiHost
      };
      
      console.log('Using headers:', headers);
      
      const response = await axios.get(url, {
        params,
        headers: headers
      });
      
      return response.data;
    } catch (error) {
      console.error(`API-Sports Error [${endpoint}]:`, error.message);
      // Check for rate limiting or other API-specific errors
      if (error.response) {
        console.error('API-Sports Status:', error.response.status);
        console.error('API-Sports Details:', error.response.data);
      }
      throw error;
    }
  },
  
  /**
   * Get today's games for a specific sport
   * @param {string} sport - Sport type (MLB, NBA, NHL)
   * @returns {Promise<Array>} - List of today's games
   */
  async getTodaysGames(sport = 'MLB') {
    try {
      // Format today's date as YYYY-MM-DD using EST timezone
      const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
      const estDate = new Intl.DateTimeFormat('en-US', options).format(new Date());
      const [month, day, year] = estDate.split('/');
      const today = `${year}-${month}-${day}`;
      console.log(`Getting ${sport} games for ${today} (EST date)`);
      
      // According to the documentation, we need to use the games endpoint with date parameter
      const response = await this.apiRequest('/games', { date: today }, sport);
      
      console.log(`API-Sports ${sport} games response:`, response);
      
      if (response?.response && Array.isArray(response.response)) {
        return response.response;
      }
      return [];
    } catch (error) {
      console.error(`Error getting today's ${sport} games:`, error.message);
      return [];
    }
  },
  
  /**
   * Get lineup for a specific game
   * @param {number} gameId - Game ID
   * @param {string} sport - Sport type (MLB, NBA, NHL)
   * @returns {Promise<Object>} - Lineup information
   */
  async getGameLineup(gameId, sport = 'MLB') {
    try {
      console.log(`Getting ${sport} lineup for game ID ${gameId}`);
      
      // For baseball lineups, we need to use the lineups endpoint with game parameter
      const response = await this.apiRequest('/lineups', { game: gameId }, sport);
      console.log(`API-Sports lineup response for game ${gameId}:`, response);
      
      if (response?.response && response.response.length > 0) {
        return response.response[0];
      }
      return null;
    } catch (error) {
      console.error(`Error getting ${sport} lineup for game ${gameId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get player statistics
   * @param {number} playerId - Player ID
   * @param {number} season - Season year
   * @param {string} sport - Sport type (MLB, NBA, NHL)
   * @returns {Promise<Object>} - Player statistics
   */
  async getPlayerStats(playerId, season = null, sport = 'MLB') {
    // Use EST timezone to determine the current year if season not provided
    if (!season) {
      const options = { timeZone: 'America/New_York' };
      season = new Date().toLocaleString('en-US', options).split('/')[2].split(',')[0];
    }
    try {
      console.log(`Getting ${sport} player stats for player ID ${playerId} in season ${season}`);
      
      // For player statistics, we need to use specific endpoints with required parameters
      // Based on API-Sports documentation, we need to specify player, league, and season
      // For MLB, we use league ID 1 (Major League Baseball)
      const params = {
        player: playerId,
        season: season
      };
      
      // Add league parameter for MLB
      if (sport === 'MLB') {
        params.league = 1; // MLB league ID
      }
      
      const response = await this.apiRequest('/players/statistics', params, sport);
      console.log(`API-Sports player stats response for player ${playerId}:`, response);
      
      if (response?.response) {
        return response.response;
      }
      return null;
    } catch (error) {
      console.error(`Error getting ${sport} player stats for player ${playerId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get teams in a league
   * @param {string} sport - Sport type (MLB, NBA, NHL)
   * @param {number} season - Season year
   * @returns {Promise<Array>} - List of teams
   */
  async getTeams(sport = 'MLB', season = null) {
    // Use EST timezone to determine the current year if season not provided
    if (!season) {
      const options = { timeZone: 'America/New_York' };
      season = new Date().toLocaleString('en-US', options).split('/')[2].split(',')[0];
    }
    try {
      console.log(`Getting ${sport} teams for season ${season}`);
      
      // For MLB, we use league ID 1 (Major League Baseball)
      const leagueId = sport === 'MLB' ? 1 : null;
      
      const params = { season };
      if (leagueId) params.league = leagueId;
      
      const response = await this.apiRequest('/teams', params, sport);
      console.log(`API-Sports teams response:`, response);
      
      if (response?.response && Array.isArray(response.response)) {
        return response.response;
      }
      return [];
    } catch (error) {
      console.error(`Error getting ${sport} teams:`, error.message);
      return [];
    }
  },
  
  /**
   * Get MLB starting pitchers for a game between two teams
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} - Starting pitchers with stats
   */
  async getMlbStartingPitchers(homeTeam, awayTeam) {
    try {
      console.log(`API-Sports: Getting MLB starting pitchers for ${homeTeam} vs ${awayTeam}`);
      
      // Get today's games
      const games = await this.getTodaysGames('MLB');
      
      if (!games || games.length === 0) {
        console.log('API-Sports: No MLB games found for today');
        return null;
      }
      
      console.log(`API-Sports: Found ${games.length} games, searching for ${homeTeam} vs ${awayTeam}`);
      
      // Find the specific game based on the team names - improved matching logic
      const targetGame = games.find(game => {
        // Handle potential undefined values with optional chaining and defaults
        const homeTeamName = game.teams?.home?.name || '';
        const awayTeamName = game.teams?.away?.name || '';
        
        // Prepare cleaned versions of team names for better matching
        const cleanHomeTeam = homeTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanAwayTeam = awayTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanInputHome = homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanInputAway = awayTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Multiple matching strategies for more robust detection
        const homeMatches = 
          homeTeamName.toLowerCase().includes(homeTeam.toLowerCase()) || 
          homeTeam.toLowerCase().includes(homeTeamName.toLowerCase()) ||
          cleanHomeTeam.includes(cleanInputHome) ||
          cleanInputHome.includes(cleanHomeTeam);
          
        const awayMatches = 
          awayTeamName.toLowerCase().includes(awayTeam.toLowerCase()) || 
          awayTeam.toLowerCase().includes(awayTeamName.toLowerCase()) ||
          cleanAwayTeam.includes(cleanInputAway) ||
          cleanInputAway.includes(cleanAwayTeam);
        
        // Log match attempts for debugging
        if (homeMatches || awayMatches) {
          console.log(`API-Sports: Potential match - API:${homeTeamName} vs ${awayTeamName}, Input:${homeTeam} vs ${awayTeam}`);
          console.log(`API-Sports: Home match: ${homeMatches}, Away match: ${awayMatches}`);
        }
        
        return homeMatches && awayMatches;
      });
      
      if (!targetGame) {
        console.log(`API-Sports: No game found matching ${homeTeam} vs ${awayTeam}`);
        
        // Fallback: Try looking only for home team match if we couldn't find a full match
        const homeTeamGame = games.find(game => {
          const homeTeamName = game.teams?.home?.name || '';
          const cleanHomeTeam = homeTeamName.toLowerCase().replace(/[^a-z0-9]/g, '');
          const cleanInputHome = homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '');
          
          return cleanHomeTeam.includes(cleanInputHome) || cleanInputHome.includes(cleanHomeTeam);
        });
        
        if (homeTeamGame) {
          console.log(`API-Sports: Found fallback game with home team: ${homeTeamGame.teams?.home?.name} vs ${homeTeamGame.teams?.away?.name}`);
          return this._getStartingPitchersForGame(homeTeamGame, homeTeam, awayTeam);
        }
        
        return null;
      }
      
      console.log(`API-Sports: Found game ID: ${targetGame.id} - ${targetGame.teams?.home?.name} vs ${targetGame.teams?.away?.name}`);
      
      return this._getStartingPitchersForGame(targetGame, homeTeam, awayTeam);
      
    } catch (error) {
      console.error('API-Sports Error getting MLB starting pitchers:', error.message);
      // Return an empty object instead of null to indicate we tried
      return { 
        home: null, 
        away: null, 
        gameId: null, 
        source: 'API-Sports',
        error: error.message 
      };
    }
  },
  
  /**
   * Helper method to get starting pitchers for a specific game
   * @param {Object} game - Game object from API-Sports
   * @param {string} homeTeam - Home team name for output
   * @param {string} awayTeam - Away team name for output
   * @returns {Promise<Object>} - Starting pitchers with stats
   * @private
   */
  async _getStartingPitchersForGame(game, homeTeam, awayTeam) {
    try {
      if (!game || !game.id) {
        console.log('API-Sports: Invalid game object');
        return null;
      }
      
      // Get the lineup for this game
      console.log(`API-Sports: Getting lineup for game ID ${game.id}`);
      const lineup = await this.getGameLineup(game.id, 'MLB');
      
      if (!lineup || !lineup.response || !Array.isArray(lineup.response)) {
        console.log(`API-Sports: No valid lineup available for game ID ${game.id}`);
        return this._getFallbackPitcherData(game, homeTeam, awayTeam);
      }
      
      console.log(`API-Sports: Found lineup with ${lineup.response.length} players`);
      
      // Extract starting pitchers from the lineup
      let homePitcher = lineup.response.find(player => 
        player.team.id === game.teams.home.id && 
        player.position === 'P' && 
        (player.game.lineups?.starter === true || player.game.position?.name === 'Starting Pitcher')
      );
      
      let awayPitcher = lineup.response.find(player => 
        player.team.id === game.teams.away.id && 
        player.position === 'P' && 
        (player.game.lineups?.starter === true || player.game.position?.name === 'Starting Pitcher')
      );
      
      // If we don't find pitchers marked as starters, look for any pitchers
      if (!homePitcher) {
        homePitcher = lineup.response.find(player => 
          player.team.id === game.teams.home.id && 
          player.position === 'P'
        );
        console.log(`API-Sports: Using fallback home pitcher selection`);
      }
      
      if (!awayPitcher) {
        awayPitcher = lineup.response.find(player => 
          player.team.id === game.teams.away.id && 
          player.position === 'P'
        );
        console.log(`API-Sports: Using fallback away pitcher selection`);
      }
      
      if (!homePitcher && !awayPitcher) {
        console.log('API-Sports: No pitchers found in lineup, trying fallback data');
        return this._getFallbackPitcherData(game, homeTeam, awayTeam);
      }
      
      console.log(`API-Sports: Found pitchers - Home: ${homePitcher?.player?.name || 'None'}, Away: ${awayPitcher?.player?.name || 'None'}`);
      
      // Get pitcher stats for each pitcher found
      let homePitcherStats = null;
      let awayPitcherStats = null;
      
      if (homePitcher?.player?.id) {
        console.log(`API-Sports: Getting stats for home pitcher ID ${homePitcher.player.id}`);
        homePitcherStats = await this.getPlayerStats(homePitcher.player.id, null, 'MLB');
      }
      
      if (awayPitcher?.player?.id) {
        console.log(`API-Sports: Getting stats for away pitcher ID ${awayPitcher.player.id}`);
        awayPitcherStats = await this.getPlayerStats(awayPitcher.player.id, null, 'MLB');
      }
      
      // Format the pitcher stats
      const formattedHomePitcher = homePitcher ? {
        name: homePitcher.player.name,
        id: homePitcher.player.id,
        team: game.teams.home.name,
        teamDisplayName: homeTeam,
        handedness: homePitcher.player.handedness || 'Unknown',
        stats: this._formatMlbPitcherStats(homePitcherStats?.response?.[0])
      } : null;
      
      const formattedAwayPitcher = awayPitcher ? {
        name: awayPitcher.player.name,
        id: awayPitcher.player.id,
        team: game.teams.away.name,
        teamDisplayName: awayTeam,
        handedness: awayPitcher.player.handedness || 'Unknown',
        stats: this._formatMlbPitcherStats(awayPitcherStats?.response?.[0])
      } : null;
      
      const result = {
        home: formattedHomePitcher,
        away: formattedAwayPitcher,
        gameId: game.id,
        source: 'API-Sports'
      };
      
      console.log(`API-Sports: Successfully retrieved pitcher data for ${homeTeam} vs ${awayTeam}`);
      return result;
    } catch (error) {
      console.error('API-Sports Error in _getStartingPitchersForGame:', error.message);
      return null;
    }
  },
  
  /**
   * Get fallback pitcher data when lineup isn't available
   * @param {Object} game - Game object from API-Sports
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} - Basic pitcher info
   * @private
   */
  async _getFallbackPitcherData(game, homeTeam, awayTeam) {
    try {
      console.log(`API-Sports: Using fallback method to get pitcher data for ${homeTeam} vs ${awayTeam}`);
      
      // Get teams to find their IDs
      const teamsResponse = await this.getTeams('MLB');
      
      if (!teamsResponse?.response) {
        console.log('API-Sports: No teams data available for fallback');
        return null;
      }
      
      const homeTeamData = teamsResponse.response.find(t => 
        t.name.toLowerCase().includes(homeTeam.toLowerCase()) || 
        homeTeam.toLowerCase().includes(t.name.toLowerCase())
      );
      
      const awayTeamData = teamsResponse.response.find(t => 
        t.name.toLowerCase().includes(awayTeam.toLowerCase()) || 
        awayTeam.toLowerCase().includes(t.name.toLowerCase())
      );
      
      if (!homeTeamData && !awayTeamData) {
        console.log('API-Sports: Could not find team data for fallback');
        return null;
      }
      
      return {
        home: homeTeamData ? {
          name: 'TBD',
          team: homeTeamData.name,
          teamDisplayName: homeTeam,
          stats: {
            ERA: 'TBD',
            WHIP: 'TBD',
            record: 'TBD',
            strikeouts: 'TBD',
            description: 'Starting pitcher information not yet available'
          }
        } : null,
        away: awayTeamData ? {
          name: 'TBD',
          team: awayTeamData.name,
          teamDisplayName: awayTeam,
          stats: {
            ERA: 'TBD',
            WHIP: 'TBD',
            record: 'TBD',
            strikeouts: 'TBD',
            description: 'Starting pitcher information not yet available'
          }
        } : null,
        gameId: game?.id,
        source: 'API-Sports (Fallback)'
      };
    } catch (error) {
      console.error('API-Sports Error getting fallback pitcher data:', error.message);
      return null;
    }
  },
  
  /**
   * Format MLB pitcher statistics
   * @param {Object} pitcherData - Raw pitcher data from API-Sports
   * @returns {Object} - Formatted pitcher statistics
   * @private
   */
  _formatMlbPitcherStats(pitcherData) {
    if (!pitcherData || !pitcherData.games) {
      return {
        ERA: 'N/A',
        WHIP: 'N/A',
        record: 'N/A',
        strikeouts: 'N/A',
        description: 'No statistics available'
      };
    }
    
    // Extract the key stats
    const stats = pitcherData.games;
    
    return {
      ERA: stats.era?.toString() || 'N/A',
      WHIP: stats.whip?.toString() || 'N/A',
      record: `${stats.wins || 0}-${stats.loses || 0}`,
      strikeouts: stats.strikeouts?.total?.toString() || 'N/A',
      inningsPitched: stats.innings?.innings?.toString() || 'N/A',
      opponentAvg: stats.batting_average?.toString() || 'N/A',
      description: `${pitcherData.player?.name || 'Pitcher'} has pitched ${stats.innings?.innings || 0} innings with ${stats.strikeouts?.total || 0} strikeouts this season.`
    };
  },
  
  /**
   * Get confirmed starting pitcher for a specific team on a given date
   * @param {string} teamName - Team name
   * @param {string} dateStr - Date in YYYY-MM-DD format (or null for today)
   * @returns {Promise<Object>} - Pitcher data with name and stats
   */
  async getConfirmedStartingPitcher(teamName, dateStr = null) {
    try {
      // Format today's date if not provided
      const date = dateStr || new Date().toISOString().split('T')[0];
      console.log(`Looking for confirmed starting pitcher for ${teamName} on ${date}`);
      
      // First get all games for the date
      const games = await this.apiRequest('/games', { date, league: 1 }, 'MLB');
      
      if (!games?.response || games.response.length === 0) {
        console.log(`No games found for ${date}`);
        return null;
      }
      
      // Find game involving the requested team
      const game = games.response.find(g => 
        g.teams?.home?.name?.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(g.teams?.home?.name?.toLowerCase()) ||
        g.teams?.away?.name?.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(g.teams?.away?.name?.toLowerCase())
      );
      
      if (!game) {
        console.log(`No game found for ${teamName} on ${date}`);
        return null;
      }
      
      console.log(`Found game ID: ${game.id}`);
      
      // Get lineup data which should include the starting pitchers
      const lineup = await this.apiRequest('/lineups', { game: game.id }, 'MLB');
      
      if (!lineup?.response || lineup.response.length === 0) {
        console.log('No lineup data available');
        return null;
      }
      
      // Determine if the team is home or away
      const isHome = game.teams.home.name.toLowerCase().includes(teamName.toLowerCase()) ||
                    teamName.toLowerCase().includes(game.teams.home.name.toLowerCase());
      
      // Get the appropriate lineup based on whether the team is home or away
      const teamLineup = isHome ? lineup.response[0] : lineup.response[1];
      
      if (!teamLineup?.startingPitcher) {
        console.log(`No starting pitcher found for ${teamName}`);
        return null;
      }
      
      return {
        name: teamLineup.startingPitcher.player?.name || 'Unknown',
        id: teamLineup.startingPitcher.player?.id,
        position: 'Starting Pitcher',
        stats: this._formatMlbPitcherStats(teamLineup.startingPitcher)
      };
    } catch (error) {
      console.error(`Error getting confirmed starting pitcher for ${teamName}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get team statistics for MLB
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name 
   * @returns {Promise<Object>} - Team statistics
   */
  async getMlbTeamStats(homeTeam, awayTeam) {
    try {
      console.log(`Getting MLB team stats for ${homeTeam} vs ${awayTeam}`);
      
      // Step 1: Find team IDs for both teams
      // Get current year in EST timezone
      const options = { timeZone: 'America/New_York' };
      const season = new Date().toLocaleString('en-US', options).split('/')[2].split(',')[0];
      const teamsResponse = await this.apiRequest('/teams', { league: 1, season }, 'MLB');
      
      if (!teamsResponse?.response || teamsResponse.response.length === 0) {
        console.log('No MLB teams found for the current season');
        return null;
      }
      
      // Find team IDs by matching names (handle partial matches)
      const findTeamId = (teamName) => {
        const team = teamsResponse.response.find(t => 
          t.name?.toLowerCase().includes(teamName.toLowerCase()) || 
          teamName.toLowerCase().includes(t.name?.toLowerCase())
        );
        return team?.id || null;
      };
      
      const homeTeamId = findTeamId(homeTeam);
      const awayTeamId = findTeamId(awayTeam);
      
      if (!homeTeamId || !awayTeamId) {
        console.log(`Couldn't find team IDs for ${homeTeam} and/or ${awayTeam}`);
        return null;
      }
      
      // Step 2: Get team statistics using the team IDs
      const [homeTeamStats, awayTeamStats] = await Promise.all([
        this.apiRequest('/teams/statistics', { league: 1, season, team: homeTeamId }, 'MLB'),
        this.apiRequest('/teams/statistics', { league: 1, season, team: awayTeamId }, 'MLB')
      ]);
      
      // Step 3: Format the statistics
      const formatTeamStats = (teamData) => {
        if (!teamData?.response) return null;
        
        const stats = teamData.response;
        return {
          teamId: stats.team?.id,
          teamName: stats.team?.name,
          gamesPlayed: stats.games?.played || 0,
          wins: stats.games?.wins?.total || 0,
          losses: stats.games?.loses?.total || 0,
          homeRecord: `${stats.games?.wins?.home || 0}-${stats.games?.loses?.home || 0}`,
          awayRecord: `${stats.games?.wins?.away || 0}-${stats.games?.loses?.away || 0}`,
          batting: {
            average: stats.batting_average || 'N/A',
            runs: stats.runs?.total || 0,
            hits: stats.hits?.total || 0,
            homeRuns: stats.home_runs || 0,
            strikeouts: stats.strikeouts?.taken?.total || 0
          },
          pitching: {
            era: stats.era || 'N/A',
            strikeouts: stats.strikeouts?.pitched?.total || 0,
            saves: stats.saves || 0,
            runs: stats.runs?.allowed || 0
          }
        };
      };
      
      return {
        homeTeam: formatTeamStats(homeTeamStats),
        awayTeam: formatTeamStats(awayTeamStats)
      };
      
    } catch (error) {
      console.error('Error getting MLB team stats:', error.message);
      return null;
    }
  }
};

export { apiSportsService };
