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
      // Format today's date as YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      console.log(`Getting ${sport} games for ${today}`);
      
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
  async getPlayerStats(playerId, season = new Date().getFullYear(), sport = 'MLB') {
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
  async getTeams(sport = 'MLB', season = new Date().getFullYear()) {
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
      
      // Step 1: Find team IDs for both teams
      const season = new Date().getFullYear();
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
