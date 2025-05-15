/**
 * Ball Don't Lie API Service
 * Provides access to detailed MLB and NBA statistics for betting analysis
 * MLB API: https://www.balldontlie.io/docs/mlb/
 * NBA API: https://www.balldontlie.io/docs/
 */
import axios from 'axios';

// API configuration
const MLB_API_BASE_URL = 'https://api.balldontlie.io/mlb/v1';
const NBA_API_BASE_URL = 'https://api.balldontlie.io/v1';
const API_KEY = '3363660a-a082-43b7-a130-6249ff68e5ab'; // GOAT plan

// Levenshtein distance for name similarity
function levenshteinDistance(a, b) {
  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

export const ballDontLieService = {
  /**
   * Initialize the service
   */
  initialize: () => {
    console.log('Initializing Ball Don\'t Lie API Service');
    console.log(`API key ${API_KEY ? 'is set' : 'is NOT set'}`);
    if (API_KEY) {
      console.log(`🔑 Ball Don't Lie API Key (masked): ${API_KEY.substring(0, 3)}...`);
    } else {
      console.error('❌ Ball Don\'t Lie API key is not set!');
    }
    return API_KEY !== '';
  },

  /**
   * Get active MLB players
   * @param {object} options - Optional search parameters
   * @returns {Promise<Array>} - Array of active players
   */
  getActiveMLBPlayers: async (options = {}) => {
    try {
      console.log('Fetching active MLB players from Ball Don\'t Lie API');
      
      // Build URL and params
      const url = `${MLB_API_BASE_URL}/players/active`;
      const params = {
        ...options,
        per_page: options.per_page || 100 // Get more per page
      };
      
      const response = await axios.get(url, {
        params,
        headers: {
          'X-RapidAPI-Key': API_KEY
        }
      });
      
      if (response.data && response.data.data) {
        console.log(`Found ${response.data.data.length} active MLB players`);
        return response.data.data;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching active MLB players:', error.message);
      return [];
    }
  },
  
  /**
   * Get active NBA players
   * @param {object} options - Optional search parameters
   * @returns {Promise<Array>} - Array of active NBA players
   */
  getActiveNBAPlayers: async (options = {}) => {
    try {
      console.log('Fetching active NBA players from Ball Don\'t Lie API');
      
      // Build URL and params
      const url = `${NBA_API_BASE_URL}/players/active`;
      const params = {
        ...options,
        per_page: options.per_page || 100 // Get more per page
      };
      
      const response = await axios.get(url, {
        params,
        headers: {
          'X-RapidAPI-Key': API_KEY
        }
      });
      
      if (response.data && response.data.data) {
        console.log(`Found ${response.data.data.length} active NBA players`);
        return response.data.data;
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching active NBA players:', error.message);
      return [];
    }
  },
  
  /**
   * Wrapper to get active players by sport
   * @param {string} sport - 'MLB' or 'NBA'
   * @param {object} options - Optional search parameters
   * @returns {Promise<Array>} - Array of active players
   */
  getActivePlayers: async (sport = 'MLB', options = {}) => {
    if (sport.toUpperCase() === 'NBA') {
      return ballDontLieService.getActiveNBAPlayers(options);
    } else {
      return ballDontLieService.getActiveMLBPlayers(options);
    }
  },
  
  /**
   * Get season stats for a player
   * @param {number} season - The season year (e.g., 2024)
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {boolean} postseason - Whether to get postseason stats
   * @returns {Promise<Array>} - Array of player season stats
   */
  getPlayerSeasonStats: async (season, playerIds = [], postseason = false) => {
    try {
      if (!season) {
        throw new Error('Season is required for getPlayerSeasonStats');
      }
      
      console.log(`Fetching ${postseason ? 'postseason' : 'regular season'} stats for ${playerIds.length} players in ${season} season`);
      
      // Split player IDs into smaller batches of 10 to avoid API limits
      const BATCH_SIZE = 10;
      const allResults = [];
      
      // If no player IDs provided, make a single request without player_ids parameters
      if (!playerIds || playerIds.length === 0) {
        const url = `${API_BASE_URL}/season_stats`;
        const params = {
          season,
          postseason,
          per_page: 100
        };
        
        const response = await axios.get(url, {
          params,
          headers: {
            'X-RapidAPI-Key': API_KEY
          }
        });
        
        if (response.data && response.data.data) {
          return response.data.data;
        }
        
        return [];
      }
      
      // Process player IDs in batches
      for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
        const batchIds = playerIds.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(playerIds.length/BATCH_SIZE)} (${batchIds.length} players)`);
        
        // Build URL and params
        const url = `${API_BASE_URL}/season_stats`;
        let params = {
          season,
          postseason,
          per_page: 100
        };
        
        // Format player_ids[] param for each ID in this batch
        batchIds.forEach((id, index) => {
          params[`player_ids[${index}]`] = id;
        });
        
        try {
          const response = await axios.get(url, {
            params,
            headers: {
              'X-RapidAPI-Key': API_KEY
            }
          });
          
          if (response.data && response.data.data) {
            console.log(`Found season stats for ${response.data.data.length} players in this batch`);
            allResults.push(...response.data.data);
          }
          
          // Add a small delay between requests to avoid rate limiting
          if (i + BATCH_SIZE < playerIds.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error(`Error fetching batch ${Math.floor(i/BATCH_SIZE) + 1}: ${error.message}`);
          // Continue with next batch instead of failing completely
        }
      }
      
      console.log(`Found season stats for a total of ${allResults.length} players`);
      return allResults;
    } catch (error) {
      console.error(`Error fetching player season stats: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get player game stats from recent games
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - The season year (e.g., 2024)
   * @param {number} gamesLimit - Number of recent games to analyze
   * @returns {Promise<Object>} - Mapped player stats by player ID
   */
  getPlayerRecentGameStats: async (playerIds = [], season = null, gamesLimit = 10) => {
    try {
      if (!playerIds || playerIds.length === 0) {
        throw new Error('Player IDs are required for getPlayerRecentGameStats');
      }
      
      console.log(`Fetching recent game stats for ${playerIds.length} players (last ${gamesLimit} games)`);
      
      // Split player IDs into smaller batches to avoid API limits
      const BATCH_SIZE = 10;
      let allGameData = [];
      
      // Process player IDs in batches
      for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
        const batchIds = playerIds.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(playerIds.length/BATCH_SIZE)} (${batchIds.length} players)`);
        
        // Build URL and params for this batch
        const url = `${API_BASE_URL}/stats`;
        const params = {
          per_page: gamesLimit // Limit to recent games
        };
        
        // Add player IDs for this batch
        batchIds.forEach((id, index) => {
          params[`player_ids[${index}]`] = id;
        });
        
        // Add season if specified
        if (season) {
          params['seasons[0]'] = season;
        }
        
        try {
          const response = await axios.get(url, {
            params,
            headers: {
              'X-RapidAPI-Key': API_KEY
            }
          });
          
          if (response.data && response.data.data) {
            console.log(`Found ${response.data.data.length} recent game stats in this batch`);
            allGameData = [...allGameData, ...response.data.data];
          }
          
          // Add a small delay between requests to avoid rate limiting
          if (i + BATCH_SIZE < playerIds.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error(`Error fetching batch ${Math.floor(i/BATCH_SIZE) + 1}: ${error.message}`);
          // Continue with next batch instead of failing completely
        }
      }
      
      console.log(`Total recent game stats found: ${allGameData.length}`);
      
      // If no data was found across all batches, return empty object
      if (allGameData.length === 0) {
        return {};
      }
      
      // Process stats to get averages by player
      const playerStats = {};
      
      // Group stats by player
      allGameData.forEach(stat => {
        const playerId = stat.player.id;
        
        if (!playerStats[playerId]) {
          playerStats[playerId] = {
            player: stat.player,
            games: [],
            averages: {}
          };
        }
        
        // Add this game to the player's games
        playerStats[playerId].games.push({
          game_id: stat.game.id,
          date: stat.game.date,
          at_bats: stat.at_bats,
          runs: stat.runs,
          hits: stat.hits,
          rbi: stat.rbi,
          hr: stat.hr,
          avg: stat.avg,
          obp: stat.obp,
          slg: stat.slg,
          ip: stat.ip,
          p_hits: stat.p_hits,
          p_runs: stat.p_runs,
          er: stat.er,
          p_bb: stat.p_bb,
          p_k: stat.p_k,
          p_hr: stat.p_hr,
          era: stat.era
        });
      });
      
      // Calculate averages for each player's last 10 games
      Object.keys(playerStats).forEach(playerId => {
        const player = playerStats[playerId];
        const games = player.games;
        
        // Initialize batting averages
        let totalAtBats = 0;
        let totalRuns = 0;
        let totalHits = 0;
        let totalRbi = 0;
        let totalHr = 0;
        
        // Initialize pitching averages
        let totalIp = 0;
        let totalPHits = 0;
        let totalPRuns = 0;
        let totalEr = 0;
        let totalPBb = 0;
        let totalPK = 0;
        let totalPHr = 0;
        
        // Calculate sums for each stat
        games.forEach(game => {
          // Batting stats
          totalAtBats += game.at_bats || 0;
          totalRuns += game.runs || 0;
          totalHits += game.hits || 0;
          totalRbi += game.rbi || 0;
          totalHr += game.hr || 0;
          
          // Pitching stats
          totalIp += game.ip || 0;
          totalPHits += game.p_hits || 0;
          totalPRuns += game.p_runs || 0;
          totalEr += game.er || 0;
          totalPBb += game.p_bb || 0;
          totalPK += game.p_k || 0;
          totalPHr += game.p_hr || 0;
        });
        
        const gameCount = games.length;
        
        // Calculate and store averages
        player.averages = {
          games_played: gameCount,
          batting: {
            at_bats_per_game: totalAtBats / gameCount,
            runs_per_game: totalRuns / gameCount,
            hits_per_game: totalHits / gameCount,
            rbi_per_game: totalRbi / gameCount,
            hr_per_game: totalHr / gameCount,
            batting_avg: totalAtBats > 0 ? totalHits / totalAtBats : 0,
            total_at_bats: totalAtBats,
            total_hits: totalHits,
            total_runs: totalRuns,
            total_rbi: totalRbi,
            total_hr: totalHr
          },
          pitching: {
            ip_per_game: totalIp / gameCount,
            hits_per_game: totalPHits / gameCount,
            runs_per_game: totalPRuns / gameCount,
            er_per_game: totalEr / gameCount,
            bb_per_game: totalPBb / gameCount,
            k_per_game: totalPK / gameCount,
            hr_per_game: totalPHr / gameCount,
            era: totalIp > 0 ? (totalEr * 9) / totalIp : 0,
            total_ip: totalIp,
            total_k: totalPK
          }
        };
      });
      
      return playerStats;
    } catch (error) {
      console.error(`Error fetching player recent game stats: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get player info by name
   * @param {string} playerName - Full or partial player name
   * @returns {Promise<Array>} - Array of matching players
   */
  findPlayersByName: async (playerName) => {
    try {
      if (!playerName) {
        throw new Error('Player name is required for findPlayersByName');
      }
      
      console.log(`Searching for MLB player: "${playerName}"`);
      
      // Generate name variants to try
      const normalizedOriginal = ballDontLieService.normalizePlayerName(playerName);
      const nameVariants = ballDontLieService.generateNameVariants(playerName);
      
      console.log(`Trying ${nameVariants.length} name variants for "${playerName}"`); 
      
      // Try each name variant
      for (const variant of nameVariants) {
        try {
          // Build URL and params
          const url = `${API_BASE_URL}/players/active`;
          const params = {
            search: variant,
            per_page: 10 // Limit to top matches
          };
          
          const response = await axios.get(url, {
            params,
            headers: {
              'X-RapidAPI-Key': API_KEY
            }
          });
          
          if (response.data && response.data.data && response.data.data.length > 0) {
            console.log(`Found ${response.data.data.length} players matching variant "${variant}"`);
            
            // Sort results by name similarity
            const sortedResults = response.data.data.sort((a, b) => {
              const aFullName = `${a.first_name} ${a.last_name}`;
              const bFullName = `${b.first_name} ${b.last_name}`;
              
              const aNormalized = ballDontLieService.normalizePlayerName(aFullName);
              const bNormalized = ballDontLieService.normalizePlayerName(bFullName);
              
              // Calculate similarity - lower is better
              const aSimilarity = levenshteinDistance(normalizedOriginal, aNormalized);
              const bSimilarity = levenshteinDistance(normalizedOriginal, bNormalized);
              
              return aSimilarity - bSimilarity;
            });
            
            return sortedResults;
          }
        } catch (error) {
          console.warn(`Error with variant "${variant}": ${error.message}`);
          // Continue to next variant
        }
      }
      
      console.warn(`No players found for "${playerName}" after trying ${nameVariants.length} variants`);
      return [];
    } catch (error) {
      console.error(`Error searching for player "${playerName}": ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Normalize player name for better matching
   * @param {string} name - Player name to normalize
   * @returns {string} - Normalized name
   */
  normalizePlayerName: (name) => {
    if (!name) return '';
    
    // Convert to lowercase
    let normalized = name.toLowerCase();
    
    // Remove periods (e.g., "J.T. Realmuto" -> "jt realmuto")
    normalized = normalized.replace(/\./g, '');
    
    // Remove common suffixes
    normalized = normalized.replace(/ jr\.?$| sr\.?$| iii$| ii$| iv$/, '');
    
    // Remove apostrophes and hyphens (e.g., "D'Angelo" -> "dangelo", "Smith-Jones" -> "smith jones")
    normalized = normalized.replace(/['-]/g, '');
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  },
  
  /**
   * Generate alternative name formats for searching
   * @param {string} playerName - Original player name
   * @returns {Array<string>} - List of name formats to try
   */
  generateNameVariants: (playerName) => {
    if (!playerName) return [];
    
    const variants = [playerName]; // Original name
    const parts = playerName.split(' ');
    
    if (parts.length >= 2) {
      // Last name only
      variants.push(parts[parts.length - 1]);
      
      // First name + last name (skip middle names)
      if (parts.length > 2) {
        variants.push(`${parts[0]} ${parts[parts.length - 1]}`);
      }
      
      // Last name, first name
      if (parts.length >= 2) {
        variants.push(`${parts[parts.length - 1]}, ${parts[0]}`);
      }
    }
    
    return variants;
  },
  
  /**
   * Get players by team name or abbreviation
   * @param {string} teamIdentifier - Team name or abbreviation
   * @returns {Promise<Array>} - Array of players on the team
   */
  getPlayersByTeam: async (teamIdentifier) => {
    try {
      if (!teamIdentifier) {
        throw new Error('Team identifier is required');
      }
      
      console.log(`Fetching players for team: "${teamIdentifier}"`);
      
      // First, get all active players
      const allPlayers = await ballDontLieService.getActivePlayers({ per_page: 100 });
      
      // Normalize team identifier for matching
      const normalizedTeamId = teamIdentifier.toLowerCase().trim();
      
      // Filter players by team
      const teamPlayers = allPlayers.filter(player => {
        if (!player.team) return false;
        
        // Try to match by team name, abbreviation or city
        return (
          player.team.name?.toLowerCase().includes(normalizedTeamId) ||
          player.team.abbreviation?.toLowerCase() === normalizedTeamId ||
          player.team.city?.toLowerCase().includes(normalizedTeamId) ||
          player.team.full_name?.toLowerCase().includes(normalizedTeamId)
        );
      });
      
      console.log(`Found ${teamPlayers.length} players on team "${teamIdentifier}"`);
      return teamPlayers;
    } catch (error) {
      console.error(`Error fetching players for team "${teamIdentifier}": ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get season averages for multiple players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year
   * @returns {Promise<Object>} - Player season averages by ID
   */
  getPlayerAverages: async (playerIds, season = new Date().getFullYear()) => {
    try {
      // Get the season stats for all these players
      const seasonStats = await ballDontLieService.getPlayerSeasonStats(season, playerIds);
      
      // Create a mapped object of player stats by player ID
      const playerAverages = {};
      
      seasonStats.forEach(stat => {
        const playerId = stat.player.id;
        
        playerAverages[playerId] = {
          player: {
            id: stat.player.id,
            name: stat.player.full_name,
            position: stat.player.position,
            team: stat.player.team?.display_name || stat.team_name
          },
          batting: {
            games_played: stat.batting_gp || 0,
            avg: stat.batting_avg || 0,
            obp: stat.batting_obp || 0,
            slg: stat.batting_slg || 0,
            ops: stat.batting_ops || 0,
            hr: stat.batting_hr || 0,
            rbi: stat.batting_rbi || 0,
            runs: stat.batting_r || 0,
            sb: stat.batting_sb || 0,
            hits: stat.batting_h || 0,
            doubles: stat.batting_2b || 0,
            triples: stat.batting_3b || 0,
            bb: stat.batting_bb || 0,
            so: stat.batting_so || 0
          },
          pitching: {
            games_played: stat.pitching_gp || 0,
            era: stat.pitching_era || 0,
            whip: stat.pitching_whip || 0,
            wins: stat.pitching_w || 0,
            losses: stat.pitching_l || 0,
            saves: stat.pitching_sv || 0,
            innings: stat.pitching_ip || 0,
            strikeouts: stat.pitching_k || 0,
            k_per_9: stat.pitching_k_per_9 || 0,
            walks: stat.pitching_bb || 0
          }
        };
      });
      
      return playerAverages;
    } catch (error) {
      console.error(`Error getting player averages: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Generate a detailed statistics report for specific players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year
   * @returns {Promise<string>} - Formatted statistics text for GPT prompt
   */
  generatePlayerStatsReport: async (playerIds, season = new Date().getFullYear()) => {
    try {
      // Get both season averages and recent game stats
      const [seasonAverages, recentGameStats] = await Promise.all([
        ballDontLieService.getPlayerAverages(playerIds, season),
        ballDontLieService.getPlayerRecentGameStats(playerIds, season)
      ]);
      
      // Merge season and recent stats into a detailed report
      let statsReport = 'VERIFIED PLAYER STATISTICS (FACTUAL DATA):\n\n';
      
      // For each player, generate a detailed stats section
      playerIds.forEach(playerId => {
        const seasonData = seasonAverages[playerId];
        const recentData = recentGameStats[playerId];
        
        if (!seasonData && !recentData) {
          return; // Skip players with no data
        }
        
        const player = (seasonData?.player || recentData?.player);
        if (!player) return;
        
        statsReport += `${player.name} (${player.position}, ${player.team}):\n`;
        
        // Add season stats if available
        if (seasonData) {
          statsReport += '  2024 Season Averages (VERIFIED):\n';
          
          const battingStats = seasonData.batting;
          const pitchingStats = seasonData.pitching;
          
          // Add batting stats
          if (battingStats.games_played > 0) {
            statsReport += `  • Games Played: ${battingStats.games_played}\n`;
            statsReport += `  • Batting Average: ${battingStats.avg.toFixed(3)}\n`;
            statsReport += `  • OBP/SLG/OPS: ${battingStats.obp.toFixed(3)}/${battingStats.slg.toFixed(3)}/${battingStats.ops.toFixed(3)}\n`;
            statsReport += `  • Home Runs: ${battingStats.hr}\n`;
            statsReport += `  • RBI: ${battingStats.rbi}\n`;
            statsReport += `  • Runs: ${battingStats.runs}\n`;
            statsReport += `  • Hits: ${battingStats.hits}\n`;
            statsReport += `  • Doubles/Triples: ${battingStats.doubles}/${battingStats.triples}\n`;
            statsReport += `  • Stolen Bases: ${battingStats.sb}\n`;
          }
          
          // Add pitching stats
          if (pitchingStats.games_played > 0) {
            statsReport += `  • Pitching Record: ${pitchingStats.wins}-${pitchingStats.losses}\n`;
            statsReport += `  • ERA: ${pitchingStats.era.toFixed(2)}\n`;
            statsReport += `  • WHIP: ${pitchingStats.whip.toFixed(2)}\n`;
            statsReport += `  • Innings Pitched: ${pitchingStats.innings}\n`;
            statsReport += `  • Strikeouts: ${pitchingStats.strikeouts}\n`;
            statsReport += `  • K/9: ${pitchingStats.k_per_9.toFixed(1)}\n`;
          }
        }
        
        // Add recent game stats if available
        if (recentData && recentData.games.length > 0) {
          statsReport += '  Last 10 Games (VERIFIED):\n';
          
          const recentStats = recentData.averages;
          
          // Batting stats for last 10 games
          if (recentStats.batting.total_at_bats > 0) {
            statsReport += `  • Recent At-Bats: ${recentStats.batting.total_at_bats}\n`;
            statsReport += `  • Recent Hits: ${recentStats.batting.total_hits}\n`;
            statsReport += `  • Recent Average: ${recentStats.batting.batting_avg.toFixed(3)}\n`;
            statsReport += `  • Recent HR: ${recentStats.batting.total_hr}\n`;
            statsReport += `  • Recent RBI: ${recentStats.batting.total_rbi}\n`;
          }
          
          // Pitching stats for last 10 games
          if (recentStats.pitching.total_ip > 0) {
            statsReport += `  • Recent IP: ${recentStats.pitching.total_ip.toFixed(1)}\n`;
            statsReport += `  • Recent K: ${recentStats.pitching.total_k}\n`;
            statsReport += `  • Recent ERA: ${recentStats.pitching.era.toFixed(2)}\n`;
          }
        }
        
        statsReport += '\n';
      });
      
      return statsReport;
    } catch (error) {
      console.error(`Error generating player stats report: ${error.message}`);
      return 'Error: Unable to retrieve verified player statistics.';
    }
  }
};

// Initialize on import
ballDontLieService.initialize();

export default ballDontLieService;
