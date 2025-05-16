/**
 * API-Sports Service
 * Provides access to the API-Sports endpoints for various sports data
 * Primary source for MLB data, includes lineup and player statistics
 */
import axios from 'axios';

const MLB_API_URL = 'https://v1.baseball.api-sports.io';
const NBA_API_URL = 'https://v1.basketball.api-sports.io';
const NHL_API_URL = 'https://v1.hockey.api-sports.io';

const apiSportsService = {
  API_KEY: import.meta.env.VITE_API_SPORTS_KEY,
  
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
      
      const url = `${baseUrl}${endpoint}`;
      console.log(`API-Sports Request [${sport}]: ${endpoint}`);
      
      const response = await axios.get(url, {
        params,
        headers: {
          'x-apisports-key': this.API_KEY
        }
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
      // Format today's date as YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      console.log(`Getting ${sport} games for ${today}`);
      
      const response = await this.apiRequest('/games', { date: today }, sport);
      
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
      
      const response = await this.apiRequest('/lineups', { game: gameId }, sport);
      
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
  async getPlayerStats(playerId, season = new Date().getFullYear(), sport = 'MLB') {
    try {
      console.log(`Getting ${sport} stats for player ID ${playerId} (${season} season)`);
      
      const response = await this.apiRequest('/players/statistics', { 
        player: playerId,
        season: season
      }, sport);
      
      if (response?.response && response.response.length > 0) {
        return response.response[0];
      }
      return null;
    } catch (error) {
      console.error(`Error getting ${sport} stats for player ${playerId}:`, error.message);
      return null;
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
      console.log(`Getting MLB starting pitchers for ${homeTeam} vs ${awayTeam}`);
      
      // Step 1: Get today's MLB games
      const games = await this.getTodaysGames('MLB');
      if (!games.length) {
        console.log('No MLB games found for today');
        return null;
      }
      
      // Step 2: Find the game with these teams
      const game = games.find(g => {
        const homeMatch = g.teams?.home?.name?.includes(homeTeam) || homeTeam.includes(g.teams?.home?.name);
        const awayMatch = g.teams?.away?.name?.includes(awayTeam) || awayTeam.includes(g.teams?.away?.name);
        return homeMatch && awayMatch;
      });
      
      if (!game) {
        console.log(`No game found for ${homeTeam} vs ${awayTeam}`);
        return null;
      }
      
      console.log(`Found game ID: ${game.id}`);
      
      // Step 3: Get the lineup for this game
      const lineup = await this.getGameLineup(game.id);
      if (!lineup || !lineup.teams) {
        console.log('No lineup data available');
        return null;
      }
      
      // Step 4: Find starting pitchers (position "P")
      const homePitcher = lineup.teams.home?.start?.find(p => p.position === "P");
      const awayPitcher = lineup.teams.away?.start?.find(p => p.position === "P");
      
      if (!homePitcher && !awayPitcher) {
        console.log('No pitchers found in lineup');
        return null;
      }
      
      // Step 5: Get detailed stats for both pitchers
      const season = new Date().getFullYear();
      let homePitcherStats = null;
      let awayPitcherStats = null;
      
      if (homePitcher) {
        homePitcherStats = await this.getPlayerStats(homePitcher.id, season);
      }
      
      if (awayPitcher) {
        awayPitcherStats = await this.getPlayerStats(awayPitcher.id, season);
      }
      
      // Return the formatted pitcher data
      return {
        game: {
          id: game.id,
          homeTeam: game.teams.home.name,
          awayTeam: game.teams.away.name,
          date: game.date,
          time: game.time,
          venue: game.venue?.name
        },
        homePitcher: homePitcher ? {
          id: homePitcher.id,
          name: homePitcher.name,
          position: homePitcher.position,
          stats: this._formatMlbPitcherStats(homePitcherStats)
        } : null,
        awayPitcher: awayPitcher ? {
          id: awayPitcher.id,
          name: awayPitcher.name,
          position: awayPitcher.position,
          stats: this._formatMlbPitcherStats(awayPitcherStats)
        } : null
      };
    } catch (error) {
      console.error('Error getting MLB starting pitchers:', error.message);
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
   * Get team statistics for MLB
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name 
   * @returns {Promise<Object>} - Team statistics
   */
  async getMlbTeamStats(homeTeam, awayTeam) {
    try {
      console.log(`Getting MLB team stats for ${homeTeam} vs ${awayTeam}`);
      // Implementation will be added in future updates
      return null;
    } catch (error) {
      console.error('Error getting MLB team stats:', error.message);
      return null;
    }
  }
};

export { apiSportsService };
