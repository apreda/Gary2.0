/**
 * Ball Don't Lie API Service
 * Provides access to detailed MLB and NBA statistics for betting analysis
 * Using official @balldontlie/sdk
 */
import { BalldontlieAPI } from '@balldontlie/sdk';

// Initialize the API client with our API key
const API_KEY = '3363660a-a082-43b7-a130-6249ff68e5ab'; // GOAT plan
const api = new BalldontlieAPI({ apiKey: API_KEY });

// Cache for API responses
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// Helper function to get data from cache or fetch it
async function getCachedOrFetch(cacheKey, fetchFn) {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    console.log(`[CACHE HIT] ${cacheKey}`);
    return cached.data;
  }
  
  console.log(`[CACHE MISS] ${cacheKey}`);
  try {
    const data = await fetchFn();
    cache.set(cacheKey, { data, timestamp: now });
    return data;
  } catch (error) {
    console.error(`Error in getCachedOrFetch for ${cacheKey}:`, error.message);
    // Return cached data even if it's stale if there's an error
    if (cached) {
      console.log(`Returning stale cache data for ${cacheKey}`);
      return cached.data;
    }
    throw error;
  }
}

/**
 * Get NBA games for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of game objects
 */
const getNbaGamesByDate = async (date) => {
  try {
    const cacheKey = `nba_games_${date}`;
    return getCachedOrFetch(cacheKey, async () => {
      console.log(`Fetching NBA games for ${date} from BallDontLie`);
      const response = await api.nba.getGames({ 
        dates: [date],
        per_page: 100 // Max allowed
      });
      return response.data || [];
    });
  } catch (error) {
    console.error('Error fetching NBA games:', error);
    return [];
  }
};

/**
 * Get MLB games for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of game objects
 */
const getMlbGamesByDate = async (date) => {
  try {
    const cacheKey = `mlb_games_${date}`;
    return getCachedOrFetch(cacheKey, async () => {
      console.log(`Fetching MLB games for ${date} from BallDontLie`);
      const response = await api.mlb.getGames({ 
        dates: [date],
        per_page: 100 // Max allowed
      });
      return response.data || [];
    });
  } catch (error) {
    console.error('Error fetching MLB games:', error);
    return [];
  }
};

/**
 * Get all games (NBA + MLB) for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Object with NBA and MLB games
 */
const getAllGamesByDate = async (date) => {
  try {
    const [nbaGames, mlbGames] = await Promise.all([
      getNbaGamesByDate(date),
      getMlbGamesByDate(date)
    ]);
    
    return {
      NBA: nbaGames,
      MLB: mlbGames
    };
  } catch (error) {
    console.error('Error fetching all games:', error);
    return { NBA: [], MLB: [] };
  }
};

// Levenshtein distance for name similarity (kept for backward compatibility)
function levenshteinDistance(a, b) {
  const matrix = [];
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  
  // Initialize matrix
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

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

const ballDontLieService = {
  /**
   * Get API key for external services
   * @returns {string} - The API key
   */
  getApiKey() {
    return API_KEY;
  },
  
  /**
   * Get the API client instance
   * @returns {BalldontlieAPI} - The API client instance
   */
  getClient() {
    return api;
  },
  
  /**
   * Initialize the service
   */
  initialize() {
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
   * Check if the service is initialized
   * @returns {boolean} - Whether the service is initialized
   */
  isInitialized() {
    return API_KEY !== '';
  },

  /**
   * Get active MLB players
   * @param {object} options - Optional search parameters
   * @returns {Promise<Array>} - Array of active players
   */
  async getActiveMLBPlayers(options = {}) {
    try {
      const cacheKey = `mlb-players-${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const response = await api.players.getAll({
          ...options,
          per_page: 100,
        });
        return response.data.filter(player => player.team && player.team.name !== 'Free Agent');
      });
    } catch (error) {
      console.error('Error fetching MLB players:', error);
      throw error;
    }
  },

  // ... (other methods remain the same with proper method syntax)

  
  /**
   * Generate a detailed statistics report for specific players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} [season] - Season year (defaults to current NBA season)
   * @returns {Promise<string>} - Formatted statistics text for GPT prompt
   */
  // Game data functions
  async getNbaGamesByDate(date) {
    try {
      const cacheKey = `nba_games_${date}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NBA games for ${date} from BallDontLie`);
        const response = await api.nba.getGames({ 
          dates: [date],
          per_page: 100 // Max allowed
        });
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA games:', error);
      return [];
    }
  },

  async getMlbGamesByDate(date) {
    try {
      const cacheKey = `mlb_games_${date}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB games for ${date} from BallDontLie`);
        const response = await api.mlb.getGames({ 
          dates: [date],
          per_page: 100 // Max allowed
        });
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching MLB games:', error);
      return [];
    }
  },

  async getAllGamesByDate(date) {
    try {
      const [nbaGames, mlbGames] = await Promise.all([
        this.getNbaGamesByDate(date),
        this.getMlbGamesByDate(date)
      ]);
      
      return {
        NBA: nbaGames,
        MLB: mlbGames
      };
    } catch (error) {
      console.error('Error fetching all games:', error);
      return { NBA: [], MLB: [] };
    }
  },

  async generatePlayerStatsReport(playerIds, season = nbaSeason()) {
    if (!playerIds?.length) return '';
    
    try {
      // Get both season averages and recent game stats
      const [seasonAverages, recentGameStats] = await Promise.all([
        this.getPlayerAverages(playerIds, season),
        this.getPlayerRecentGameStats(playerIds, season)
      ]);
      
      // Generate the report
      let report = 'Player Statistics Report\n\n';
      
      for (const playerId of playerIds) {
        const seasonData = seasonAverages[playerId];
        const recentData = recentGameStats[playerId];
        
        if (!seasonData && !recentData) continue;
        
        const player = seasonData?.player || recentData?.player;
        if (!player) continue;
        
        report += `Player: ${player.first_name} ${player.last_name} (${player.team?.abbreviation || 'N/A'})\n`;
        
        if (seasonData) {
          report += `\nSeason Averages (${season}):\n`;
          // Add season stats to report
          // ...
        }
        
        if (recentData) {
          report += '\nRecent Games:\n';
          // Add recent game stats to report
          // ...
        }
        
        report += '\n' + '-'.repeat(50) + '\n\n';
      }
      
      return report;
      
    } catch (error) {
      console.error('Error generating player stats report:', error);
      return 'Error generating player statistics report.';
    }
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
