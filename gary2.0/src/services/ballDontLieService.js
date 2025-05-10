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
  
  // MLB Stats API base URL for current rosters
  MLB_STATS_API: 'https://statsapi.mlb.com/api/v1',
  
  // MLB team ID mapping (statsapi.mlb.com team IDs)
  MLB_TEAM_MAPPING: {
    'Arizona Diamondbacks': 109,
    'Atlanta Braves': 144,
    'Baltimore Orioles': 110,
    'Boston Red Sox': 111,
    'Chicago Cubs': 112,
    'Chicago White Sox': 145,
    'Cincinnati Reds': 113,
    'Cleveland Guardians': 114,
    'Colorado Rockies': 115,
    'Detroit Tigers': 116,
    'Houston Astros': 117,
    'Kansas City Royals': 118,
    'Los Angeles Angels': 108,
    'Los Angeles Dodgers': 119,
    'Miami Marlins': 146,
    'Milwaukee Brewers': 158,
    'Minnesota Twins': 142,
    'New York Mets': 121,
    'New York Yankees': 147,
    'Oakland Athletics': 133,
    'Philadelphia Phillies': 143,
    'Pittsburgh Pirates': 134,
    'San Diego Padres': 135,
    'San Francisco Giants': 137,
    'Seattle Mariners': 136,
    'St. Louis Cardinals': 138,
    'Tampa Bay Rays': 139,
    'Texas Rangers': 140,
    'Toronto Blue Jays': 141,
    'Washington Nationals': 120
  },
  
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
   * Look up MLB team by name
   */
  lookupMlbTeam: async function(teamName) {
    try {
      teamName = teamName.trim();
      
      // First try to get a direct match from our MLB_TEAM_MAPPING
      const statsApiTeamId = this.lookupMlbTeamFromStatsApi(teamName);
      
      if (statsApiTeamId) {
        // We found a valid MLB Stats API team ID, create a stub team object
        const matchedTeamName = Object.keys(this.MLB_TEAM_MAPPING).find(name => 
          this.MLB_TEAM_MAPPING[name] === statsApiTeamId
        ) || teamName;
        
        console.log(`✅ Found MLB team match: ${matchedTeamName} (ID: ${statsApiTeamId})`);
        
        return {
          id: statsApiTeamId,  // Use the MLB Stats API team ID
          name: matchedTeamName,
          full_name: matchedTeamName,
          display_name: matchedTeamName,
          location: matchedTeamName.split(' ')[0],
          stats_api_id: statsApiTeamId // Include the MLB Stats API ID for reference
        };
      }
      
      // If we couldn't find a match with Stats API mapping, fall back to BDL API
      try {
        const response = await axios.get(`${this.MLB_BASE_URL}/teams`, {
          headers: {
            'Authorization': this.API_KEY
          }
        });
        
        const teams = response.data.data || [];
        
        // First try exact match
        let team = teams.find(t => 
          t.name.toLowerCase() === teamName.toLowerCase() || 
          t.full_name.toLowerCase() === teamName.toLowerCase() ||
          t.display_name.toLowerCase() === teamName.toLowerCase()
        );
        
        // If no exact match, try partial match
        if (!team) {
          team = teams.find(t => 
            t.display_name.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(t.name.toLowerCase()) ||
            t.location.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(t.location.toLowerCase())
          );
        }
        
        // If we found a BDL team, try to augment it with Stats API ID
        if (team) {
          // Look up the Stats API ID using the team name
          const foundStatsApiId = this.lookupMlbTeamFromStatsApi(team.full_name || team.name);
          if (foundStatsApiId) {
            team.stats_api_id = foundStatsApiId;
          }
        }
        
        return team || null;
      } catch (bdlError) {
        console.warn(`Ball Don't Lie MLB team lookup failed: ${bdlError.message}`);
        return null;
      }
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
   * Look up MLB team from the MLB Stats API by team name
   */
  lookupMlbTeamFromStatsApi: function(teamName) {
    // Clean up team name for matching
    const cleanName = teamName.replace(/^\s+|\s+$/g, '');
    
    // Try direct match first
    if (this.MLB_TEAM_MAPPING[cleanName]) {
      return this.MLB_TEAM_MAPPING[cleanName];
    }
    
    // Try partial matches
    for (const [key, value] of Object.entries(this.MLB_TEAM_MAPPING)) {
      // Match team name parts (e.g., 'Yankees' will match 'New York Yankees')
      if (key.toLowerCase().includes(cleanName.toLowerCase()) || 
          cleanName.toLowerCase().includes(key.toLowerCase().split(' ').pop())) {
        return value;
      }
    }
    
    console.warn(`Could not find MLB team ID for: ${teamName}`);
    return null;
  },
  
  /**
   * Get MLB players for a team using the MLB Stats API to ensure current roster data
   */
  getMlbTeamPlayers: async function(teamId) {
    try {
      // First, try to get players from the Ball Don't Lie API
      let players = [];
      try {
        const bdlResponse = await axios.get(`${this.MLB_BASE_URL}/players`, {
          headers: {
            'Authorization': this.API_KEY
          },
          params: {
            team_ids: [teamId],
            per_page: 100
          }
        });
        players = bdlResponse.data.data || [];
      } catch (bdlError) {
        console.warn(`Ball Don't Lie MLB player data unavailable: ${bdlError.message}`);
      }
      
      // Then augment with current MLB Stats API data for accuracy
      // First get the MLB Stats API team ID
      let statsApiTeamId = null;
      
      // If we have Ball Don't Lie data, try to use the team name to look up MLB Stats team ID
      if (players.length > 0 && players[0].team) {
        statsApiTeamId = this.lookupMlbTeamFromStatsApi(players[0].team.name);
      }
      
      // If we couldn't get it from BDL data, try direct lookup
      if (!statsApiTeamId) {
        // Look for team in our mappings
        for (const [teamName, id] of Object.entries(this.MLB_TEAM_MAPPING)) {
          if (teamName.toLowerCase().includes(String(teamId).toLowerCase())) {
            statsApiTeamId = id;
            break;
          }
        }
      }
      
      // If we found a valid Stats API team ID, get the current roster
      if (statsApiTeamId) {
        try {
          console.log(`Fetching current roster for MLB team ID ${statsApiTeamId} from MLB Stats API...`);
          const rosterResponse = await axios.get(`${this.MLB_STATS_API}/teams/${statsApiTeamId}/roster`, {
            params: {
              rosterType: 'active',  // Only get active players
              date: new Date().toISOString().split('T')[0]  // Today's date in YYYY-MM-DD format
            }
          });
          
          const activeRoster = rosterResponse.data.roster || [];
          console.log(`Found ${activeRoster.length} active MLB players on current roster`);
          
          // If we got valid roster data, use it to filter or augment our player list
          if (activeRoster.length > 0) {
            // Get detailed info for each roster player
            const rosterPlayerIds = activeRoster.map(player => player.person.id);
            
            // Batch fetching of player details (up to 25 per request per API limits)
            const detailedPlayers = [];
            for (let i = 0; i < rosterPlayerIds.length; i += 25) {
              const batch = rosterPlayerIds.slice(i, i + 25);
              try {
                const playerResponse = await axios.get(`${this.MLB_STATS_API}/people`, {
                  params: {
                    personIds: batch.join(','),
                    fields: 'people,id,fullName,primaryNumber,primaryPosition,batSide,pitchHand,active,currentTeam'
                  }
                });
                
                if (playerResponse.data.people) {
                  detailedPlayers.push(...playerResponse.data.people);
                }
              } catch (batchError) {
                console.warn(`Error fetching batch of player details: ${batchError.message}`);
              }
            }
            
            // Replace our player list with the active roster data
            if (detailedPlayers.length > 0) {
              // Format MLB Stats API data into the same format as Ball Don't Lie API
              players = detailedPlayers.map(player => ({
                id: player.id,
                first_name: player.fullName.split(' ')[0],
                last_name: player.fullName.split(' ').slice(1).join(' '),
                full_name: player.fullName,
                position: player.primaryPosition ? player.primaryPosition.abbreviation : '',
                number: player.primaryNumber,
                active: true,  // These are all active roster players
                team: { id: statsApiTeamId, name: teamName },
                mlbStatsData: player  // Keep original data for reference
              }));
              
              console.log(`Validated ${players.length} current active MLB players`);
              return players;
            }
          }
        } catch (statsApiError) {
          console.error(`Error fetching MLB roster from Stats API: ${statsApiError.message}`);
        }
      }
      
      // Return the original player list if we couldn't enhance it
      return players;
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
