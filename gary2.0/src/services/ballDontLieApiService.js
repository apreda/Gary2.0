/**
 * Ball Don't Lie API Service
 * Provides access to the Ball Don't Lie API for MLB player statistics
 * Used as a backup/alternative source for player prop statistics
 */
import axios from 'axios';

// Ball Don't Lie API configuration
const API_URL = 'https://api.balldontlie.io/mlb/v1';
// Get API key from environment variables with fallback
let ballDontLieApiKey = '';
try {
  ballDontLieApiKey = import.meta.env?.VITE_BALL_DONT_LIE_API_KEY || process.env.VITE_BALL_DONT_LIE_API_KEY || '';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  ballDontLieApiKey = process.env.VITE_BALL_DONT_LIE_API_KEY || '';
}

const ballDontLieApiService = {
  // Use the API key from environment variables
  API_KEY: ballDontLieApiKey,
  
  /**
   * Make a request to the Ball Don't Lie API
   * @param {string} endpoint - API endpoint to call
   * @param {object} params - Query parameters
   * @returns {Promise<Object>} - API response
   */
  async apiRequest(endpoint, params = {}) {
    try {
      const url = `${API_URL}${endpoint}`;
      console.log(`Ball Don't Lie API Request: ${url} with params:`, params);
      
      const headers = {
        'Authorization': this.API_KEY
      };
      
      const response = await axios.get(url, {
        params,
        headers
      });
      
      return response.data;
    } catch (error) {
      console.error(`Ball Don't Lie API Error [${endpoint}]:`, error.message);
      if (error.response) {
        console.error('Ball Don't Lie Status:', error.response.status);
        console.error('Ball Don't Lie Details:', error.response.data);
      }
      throw error;
    }
  },
  
  /**
   * Get MLB teams
   * @returns {Promise<Array>} - List of teams
   */
  async getTeams() {
    try {
      const response = await this.apiRequest('/teams');
      
      if (response?.data) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('Error getting MLB teams:', error.message);
      return [];
    }
  },
  
  /**
   * Find team by name
   * @param {string} teamName - Team name to search for
   * @returns {Promise<Object>} - Team information
   */
  async findTeamByName(teamName) {
    try {
      const teams = await this.getTeams();
      
      if (!teams || teams.length === 0) {
        console.log('No MLB teams found');
        return null;
      }
      
      // Find team by name (handle partial matches)
      const team = teams.find(t => 
        t.display_name?.toLowerCase().includes(teamName.toLowerCase()) || 
        teamName.toLowerCase().includes(t.display_name?.toLowerCase()) ||
        t.location?.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(t.location?.toLowerCase()) ||
        t.name?.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(t.name?.toLowerCase())
      );
      
      return team || null;
    } catch (error) {
      console.error(`Error finding team by name (${teamName}):`, error.message);
      return null;
    }
  },
  
  /**
   * Search for players by name
   * @param {string} playerName - Player name to search for
   * @returns {Promise<Array>} - List of matching players
   */
  async searchPlayerByName(playerName) {
    try {
      const params = { search: playerName };
      const response = await this.apiRequest('/players', params);
      
      if (response?.data && response.data.length > 0) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error(`Error searching for player (${playerName}):`, error.message);
      return [];
    }
  },
  
  /**
   * Get games for a date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - List of games on that date
   */
  async getGamesByDate(date) {
    try {
      // Format the date if needed
      const formattedDate = date; // already in YYYY-MM-DD format
      
      const params = { 
        dates: [formattedDate]
      };
      
      const response = await this.apiRequest('/games', params);
      
      if (response?.data && response.data.length > 0) {
        return response.data;
      }
      
      console.log(`No games found for date ${date}`);
      return [];
    } catch (error) {
      console.error(`Error getting games for date ${date}:`, error.message);
      return [];
    }
  },
  
  /**
   * Get player statistics for a specific date
   * @param {number} playerId - Player ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Player statistics
   */
  async getPlayerStatsForDate(playerId, date) {
    try {
      // First, find games for this date
      const games = await this.getGamesByDate(date);
      
      if (!games || games.length === 0) {
        console.log(`No games found for date ${date}`);
        return null;
      }
      
      // Get game IDs for this date
      const gameIds = games.map(game => game.id);
      
      // Get player stats for these games
      const params = { 
        player_ids: [playerId],
        game_ids: gameIds
      };
      
      const response = await this.apiRequest('/stats', params);
      
      if (response?.data && response.data.length > 0) {
        // Found player stats for this date
        return response.data[0]; // Return the first match
      }
      
      console.log(`No stats found for player ${playerId} on date ${date}`);
      return null;
    } catch (error) {
      console.error(`Error getting player stats (${playerId}, ${date}):`, error.message);
      return null;
    }
  },
  
  /**
   * Get player statistics for props
   * @param {string} playerName - Player name
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Player statistics formatted for prop checking
   */
  async getPlayerStatsForProps(playerName, date) {
    try {
      console.log(`Getting MLB player stats for ${playerName} on ${date} from Ball Don't Lie API`);
      
      // Step 1: Search for the player
      const players = await this.searchPlayerByName(playerName);
      
      if (!players || players.length === 0) {
        console.log(`No player found with name ${playerName}`);
        return null;
      }
      
      // Find the most relevant player match
      let bestMatch = players[0];
      for (const player of players) {
        const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
        if (fullName === playerName.toLowerCase()) {
          bestMatch = player;
          break;
        }
      }
      
      console.log(`Found player ${bestMatch.full_name} (ID: ${bestMatch.id})`);
      
      // Step 2: Get stats for the player on this date
      const playerStats = await this.getPlayerStatsForDate(bestMatch.id, date);
      
      if (!playerStats) {
        console.log(`No stats found for ${bestMatch.full_name} on ${date}`);
        return null;
      }
      
      // Step 3: Format the stats for prop checking
      const formattedStats = {
        hits: playerStats.hits || 0,
        runs: playerStats.runs || 0,
        rbi: playerStats.rbi || 0,
        hr: playerStats.hr || 0,
        total_bases: null, // Need to calculate from hits, 2B, 3B, HR
        strikeouts: playerStats.k || 0,
        outs: playerStats.ip ? Math.floor(parseFloat(playerStats.ip) * 3) : 0,
        hits_runs_rbis: (playerStats.hits || 0) + (playerStats.runs || 0) + (playerStats.rbi || 0)
      };
      
      console.log(`Stats for ${bestMatch.full_name} on ${date}:`, formattedStats);
      
      return {
        player: bestMatch,
        statistics: formattedStats
      };
    } catch (error) {
      console.error(`Error getting player stats for props (${playerName}, ${date}):`, error.message);
      return null;
    }
  },
  
  /**
   * Get statistics for all players on a team for a specific date
   * @param {string} teamName - Team name
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - List of player statistics
   */
  async getTeamPlayersStatsForDate(teamName, date) {
    try {
      console.log(`Getting MLB team stats for ${teamName} on ${date} from Ball Don't Lie API`);
      
      // Step 1: Find the team
      const team = await this.findTeamByName(teamName);
      
      if (!team) {
        console.log(`No team found with name ${teamName}`);
        return null;
      }
      
      console.log(`Found team ${team.display_name} (ID: ${team.id})`);
      
      // Step 2: Find games for this date
      const games = await this.getGamesByDate(date);
      
      if (!games || games.length === 0) {
        console.log(`No games found for date ${date}`);
        return null;
      }
      
      // Step 3: Find the game for this team
      const teamGame = games.find(game => 
        game.home_team?.id === team.id || 
        game.away_team?.id === team.id
      );
      
      if (!teamGame) {
        console.log(`No game found for team ${team.display_name} on ${date}`);
        return null;
      }
      
      console.log(`Found game ${teamGame.id} for team ${team.display_name} on ${date}`);
      
      // Step 4: Get all player stats for this game
      const params = { 
        game_ids: [teamGame.id]
      };
      
      const response = await this.apiRequest('/stats', params);
      
      if (!response?.data || response.data.length === 0) {
        console.log(`No player stats found for game ${teamGame.id}`);
        return null;
      }
      
      // Step 5: Filter for only players on this team
      const teamPlayers = response.data.filter(stat => 
        stat.team_name?.toLowerCase().includes(team.display_name.toLowerCase()) || 
        team.display_name.toLowerCase().includes(stat.team_name?.toLowerCase()) ||
        stat.team_name?.toLowerCase().includes(team.name.toLowerCase()) || 
        team.name.toLowerCase().includes(stat.team_name?.toLowerCase())
      );
      
      if (!teamPlayers || teamPlayers.length === 0) {
        console.log(`No player stats found for team ${team.display_name} in game ${teamGame.id}`);
        return null;
      }
      
      console.log(`Found stats for ${teamPlayers.length} players on team ${team.display_name}`);
      
      // Step 6: Format the stats for prop checking
      const formattedPlayers = teamPlayers.map(stat => {
        const player = stat.player;
        
        const formattedStats = {
          hits: stat.hits || 0,
          runs: stat.runs || 0,
          rbi: stat.rbi || 0,
          hr: stat.hr || 0,
          total_bases: null, // Need to calculate from hits, 2B, 3B, HR
          strikeouts: stat.k || 0,
          outs: stat.ip ? Math.floor(parseFloat(stat.ip) * 3) : 0,
          hits_runs_rbis: (stat.hits || 0) + (stat.runs || 0) + (stat.rbi || 0)
        };
        
        return {
          name: player.full_name,
          statistics: formattedStats
        };
      });
      
      return {
        team: team.display_name,
        players: formattedPlayers
      };
    } catch (error) {
      console.error(`Error getting team players stats (${teamName}, ${date}):`, error.message);
      return null;
    }
  }
};

export { ballDontLieApiService };
