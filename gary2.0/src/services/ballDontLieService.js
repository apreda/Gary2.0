/**
 * Ball Don't Lie API Service
 * Provides access to NBA and MLB player statistics
 */
import axios from 'axios';

export const ballDontLieService = {
  /**
   * The API key (loaded from environment variables)
   */
  API_KEY: import.meta.env?.VITE_BALLEDONTLIE_API_KEY || '',
  
  /**
   * Base URLs for NBA and MLB APIs
   */
  NBA_BASE_URL: 'https://api.balldontlie.io/v1',
  MLB_BASE_URL: 'https://api.balldontlie.io/mlb/v1',
  
  /**
   * Initialize the service and verify API key
   */
  initialize: async function() {
    try {
      console.log('Initializing Ball Don\'t Lie API Service');
      
      if (!this.API_KEY) {
        console.error('❌ Ball Don\'t Lie API key not found in environment variables');
        return false;
      }
      
      console.log(`🔑 Ball Don\'t Lie API Key (masked): ${this.API_KEY.substring(0, 5)}...`);
      
      // Verify API key by making a simple request
      const isValid = await this.verifyApiKey();
      
      if (isValid) {
        console.log('✅ Ball Don\'t Lie API key is valid');
        return true;
      } else {
        console.error('❌ Ball Don\'t Lie API key is invalid');
        return false;
      }
    } catch (error) {
      console.error('Error initializing Ball Don\'t Lie API:', error);
      return false;
    }
  },
  
  /**
   * Verify the API key by making a simple request
   */
  verifyApiKey: async function() {
    try {
      // Try to get teams - this should work with a valid key
      const response = await axios.get(`${this.NBA_BASE_URL}/teams`, {
        headers: {
          'Authorization': this.API_KEY
        }
      });
      
      return response.status === 200 && response.data && response.data.data;
    } catch (error) {
      console.error('Error verifying Ball Don\'t Lie API key:', error);
      return false;
    }
  },
  
  /**
   * Get NBA teams
   */
  getNbaTeams: async function() {
    try {
      const response = await axios.get(`${this.NBA_BASE_URL}/teams`, {
        headers: {
          'Authorization': this.API_KEY
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error('Error getting NBA teams:', error);
      return [];
    }
  },
  
  /**
   * Get MLB teams
   */
  getMlbTeams: async function() {
    try {
      const response = await axios.get(`${this.MLB_BASE_URL}/teams`, {
        headers: {
          'Authorization': this.API_KEY
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error('Error getting MLB teams:', error);
      return [];
    }
  },
  
  /**
   * Look up an NBA team by name
   */
  lookupNbaTeam: async function(teamName) {
    try {
      const teams = await this.getNbaTeams();
      
      // Try to find an exact match first
      let team = teams.find(t => 
        t.full_name.toLowerCase() === teamName.toLowerCase() ||
        t.name.toLowerCase() === teamName.toLowerCase() || 
        t.city.toLowerCase() === teamName.toLowerCase()
      );
      
      // If no exact match, try a partial match
      if (!team) {
        team = teams.find(t => 
          t.full_name.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.name.toLowerCase()) ||
          t.city.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.city.toLowerCase())
        );
      }
      
      return team || null;
    } catch (error) {
      console.error(`Error looking up NBA team "${teamName}":`, error);
      return null;
    }
  },
  
  /**
   * Look up an MLB team by name
   */
  lookupMlbTeam: async function(teamName) {
    try {
      const teams = await this.getMlbTeams();
      
      // Try to find an exact match first
      let team = teams.find(t => 
        t.display_name.toLowerCase() === teamName.toLowerCase() ||
        t.name.toLowerCase() === teamName.toLowerCase() || 
        t.location.toLowerCase() === teamName.toLowerCase()
      );
      
      // If no exact match, try a partial match
      if (!team) {
        team = teams.find(t => 
          t.display_name.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.name.toLowerCase()) ||
          t.location.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.location.toLowerCase())
        );
      }
      
      return team || null;
    } catch (error) {
      console.error(`Error looking up MLB team "${teamName}":`, error);
      return null;
    }
  },
  
  /**
   * Get NBA players for a team
   */
  getNbaTeamPlayers: async function(teamId) {
    try {
      const response = await axios.get(`${this.NBA_BASE_URL}/players`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          team_ids: [teamId],
          per_page: 100
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error getting NBA players for team ${teamId}:`, error);
      return [];
    }
  },
  
  /**
   * Get MLB players for a team
   */
  getMlbTeamPlayers: async function(teamId) {
    try {
      const response = await axios.get(`${this.MLB_BASE_URL}/players`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          team_ids: [teamId],
          per_page: 100
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error getting MLB players for team ${teamId}:`, error);
      return [];
    }
  },
  
  /**
   * Get NBA player's season averages (comprehensive stats)
   */
  getNbaPlayerSeasonStats: async function(playerId) {
    try {
      // Create an array of promises for all the different stat types
      const statTypes = [
        { category: 'general', type: 'base' },
        { category: 'general', type: 'advanced' },
        { category: 'general', type: 'scoring' },
        { category: 'general', type: 'usage' },
        { category: 'clutch', type: 'base' },
        { category: 'defense', type: 'overall' }
      ];
      
      // Create promises for all stat types
      const statPromises = statTypes.map(({ category, type }) => 
        axios.get(`${this.NBA_BASE_URL}/season_averages/${category}`, {
          headers: {
            'Authorization': this.API_KEY
          },
          params: {
            player_ids: [playerId],
            season: new Date().getFullYear(),
            season_type: 'regular',
            type: type
          }
        }).catch(err => {
          console.warn(`Failed to get ${category}/${type} stats for player ${playerId}:`, err.message);
          return { data: { data: [] } };
        })
      );
      
      // Also fetch player injury data if available
      const injuryPromise = axios.get(`${this.NBA_BASE_URL}/player_injuries`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          player_ids: [playerId]
        }
      }).catch(err => {
        console.warn(`Failed to get injury data for player ${playerId}:`, err.message);
        return { data: { data: [] } };
      });
      
      // Wait for all promises to resolve
      const responses = await Promise.all([...statPromises, injuryPromise]);
      
      // Extract the data from each response
      const statsData = responses.slice(0, statTypes.length).map((response, index) => {
        const data = response.data.data[0] || {};
        return {
          category: statTypes[index].category,
          type: statTypes[index].type,
          data: data
        };
      });
      
      // Get injury data
      const injuryData = responses[responses.length - 1].data.data;
      const playerInjury = injuryData.find(injury => 
        injury.player && injury.player.id === playerId
      );
      
      // Merge all the stats data
      let mergedStats = {};
      let playerInfo = null;
      
      statsData.forEach(statObj => {
        if (statObj.data.stats) {
          mergedStats = {
            ...mergedStats,
            ...statObj.data.stats,
            [`${statObj.category}_${statObj.type}`]: statObj.data.stats
          };
        }
        if (statObj.data.player && !playerInfo) {
          playerInfo = statObj.data.player;
        }
      });
      
      return {
        player: playerInfo,
        stats: mergedStats,
        injury: playerInjury || null
      };
    } catch (error) {
      console.error(`Error getting NBA player comprehensive stats for player ${playerId}:`, error);
      return null;
    }
  },
  
  /**
   * Get NBA player's advanced stats for recent games
   */
  getNbaPlayerAdvancedStats: async function(playerId, limit = 5) {
    try {
      const response = await axios.get(`${this.NBA_BASE_URL}/stats/advanced`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          player_ids: [playerId],
          per_page: limit
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error getting NBA player advanced stats for player ${playerId}:`, error);
      return [];
    }
  },
  
  /**
   * Get MLB player's comprehensive season stats including batting, pitching, and fielding data
   */
  getMlbPlayerSeasonStats: async function(playerId) {
    try {
      // Get regular season stats
      const regularSeasonPromise = axios.get(`${this.MLB_BASE_URL}/season_stats`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          player_ids: [playerId],
          season: new Date().getFullYear(),
          postseason: false
        }
      }).catch(err => {
        console.warn(`Failed to get regular season stats for MLB player ${playerId}:`, err.message);
        return { data: { data: [] } };
      });
      
      // Get player injury data
      const injuryPromise = axios.get(`${this.MLB_BASE_URL}/player_injuries`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          player_ids: [playerId]
        }
      }).catch(err => {
        console.warn(`Failed to get injury data for MLB player ${playerId}:`, err.message);
        return { data: { data: [] } };
      });
      
      // Wait for all promises to resolve
      const [regularSeasonResponse, injuryResponse] = await Promise.all([regularSeasonPromise, injuryPromise]);
      
      const seasonStats = regularSeasonResponse.data.data[0] || {};
      
      // Get injury data
      const injuryData = injuryResponse.data.data;
      const playerInjury = injuryData.find(injury => 
        injury.player && injury.player.id === playerId
      );
      
      // Process pitching and batting stats separately
      const isPitcher = seasonStats.position && seasonStats.position.toLowerCase().includes('pitcher');
      
      // Create a structured stats object
      const formattedStats = {
        // Basic info
        player_info: {
          position: seasonStats.position,
          team: seasonStats.team,
          is_pitcher: isPitcher
        },
        
        // Batting stats if available
        batting: {
          games_played: seasonStats.batting_gp,
          at_bats: seasonStats.batting_ab,
          runs: seasonStats.batting_r,
          hits: seasonStats.batting_h,
          doubles: seasonStats.batting_2b,
          triples: seasonStats.batting_3b,
          home_runs: seasonStats.batting_hr,
          rbi: seasonStats.batting_rbi,
          stolen_bases: seasonStats.batting_sb,
          batting_average: seasonStats.batting_avg,
          on_base_percentage: seasonStats.batting_obp,
          slugging: seasonStats.batting_slg,
          ops: seasonStats.batting_ops,
          war: seasonStats.batting_war
        },
        
        // Pitching stats if available
        pitching: {
          games: seasonStats.pitching_gp,
          games_started: seasonStats.pitching_gs,
          wins: seasonStats.pitching_w,
          losses: seasonStats.pitching_l,
          era: seasonStats.pitching_era,
          saves: seasonStats.pitching_sv,
          innings_pitched: seasonStats.pitching_ip,
          hits_allowed: seasonStats.pitching_h,
          earned_runs: seasonStats.pitching_er,
          strikeouts: seasonStats.pitching_k,
          walks: seasonStats.pitching_bb,
          whip: seasonStats.pitching_whip,
          k_per_9: seasonStats.pitching_k_per_9,
          war: seasonStats.pitching_war
        },
        
        // Original full stats for reference
        raw_stats: seasonStats
      };
      
      return {
        player: seasonStats.player,
        stats: formattedStats,
        injury: playerInjury || null
      };
    } catch (error) {
      console.error(`Error getting MLB player comprehensive stats for player ${playerId}:`, error);
      return null;
    }
  },
  
  /**
   * Get NBA player's recent game stats
   */
  getNbaPlayerRecentStats: async function(playerId, limit = 5) {
    try {
      const response = await axios.get(`${this.NBA_BASE_URL}/stats`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          player_ids: [playerId],
          per_page: limit
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error getting NBA player recent stats for player ${playerId}:`, error);
      return [];
    }
  },
  
  /**
   * Get MLB player's recent game stats
   */
  getMlbPlayerRecentStats: async function(playerId, limit = 5) {
    try {
      const response = await axios.get(`${this.MLB_BASE_URL}/stats`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          player_ids: [playerId],
          per_page: limit
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error getting MLB player recent stats for player ${playerId}:`, error);
      return [];
    }
  },
  
  /**
   * Search for an NBA player by name
   */
  searchNbaPlayer: async function(playerName) {
    try {
      const response = await axios.get(`${this.NBA_BASE_URL}/players`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          search: playerName,
          per_page: 10
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error searching for NBA player "${playerName}":`, error);
      return [];
    }
  },
  
  /**
   * Search for an MLB player by name
   */
  searchMlbPlayer: async function(playerName) {
    try {
      const response = await axios.get(`${this.MLB_BASE_URL}/players`, {
        headers: {
          'Authorization': this.API_KEY
        },
        params: {
          search: playerName,
          per_page: 10
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      console.error(`Error searching for MLB player "${playerName}":`, error);
      return [];
    }
  }
};

// Initialize on import
ballDontLieService.initialize();

export default ballDontLieService;
