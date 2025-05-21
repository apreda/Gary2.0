/**
 * Ball Don't Lie API Service
 * Provides access to detailed MLB and NBA statistics for betting analysis
 * Using official @balldontlie/sdk
 */
import { BalldontlieAPI } from '@balldontlie/sdk';

// Initialize the API client with our API key
let API_KEY;
try {
  API_KEY = import.meta.env?.VITE_BALLDONTLIE_API_KEY || process.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  API_KEY = process.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
}
// Default to GOAT plan key if not in env
let api;

// Cache for API responses
const cache = new Map();
// MLB data needs fresher cache for current 2025 season data (1 minute for MLB, 5 minutes for others)
const MLB_CACHE_TTL = 60 * 1000; // 1 minute cache TTL for MLB data
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL for other data

// Helper function to get data from cache or fetch it
const getCachedOrFetch = async (cacheKey, fetchFn, isMLB = false) => {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  const ttl = isMLB ? MLB_CACHE_TTL : CACHE_TTL;
  
  if (cached && (now - cached.timestamp < ttl)) {
    console.log(`Using cached data for ${cacheKey} (TTL: ${isMLB ? '1 minute' : '5 minutes'})`);
    return cached.data;
  }
  
  console.log(`Cache miss or expired for ${cacheKey}, fetching fresh data...`);
  const data = await fetchFn();
  cache.set(cacheKey, { data, timestamp: now });
  return data;
}

// Initialize api
const initApi = () => {
  if (!api) {
    api = new BalldontlieAPI({ apiKey: API_KEY });
  }
  return api;
};

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
      const client = initApi();
      const response = await client.nba.getGames({ 
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
      console.log(`Fetching MLB games for ${date} from BallDontLie (2025 season)`);
      
      // Make sure API is initialized
      if (!api) {
        console.log('API client not initialized, initializing now...');
        api = new BalldontlieAPI({ apiKey: API_KEY });
      }
      
      // Check if MLB endpoint is available
      if (!api.mlb) {
        console.error('ERROR: api.mlb endpoint is not available in the Ball Don\'t Lie SDK');
        console.log('Available endpoints:', Object.keys(api).join(', '));
        return [];
      }
      
      const response = await api.mlb.getGames({ 
        dates: [date],
        season: 2025, // Explicitly request 2025 season data
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
      
      // Actually initialize the API client here
      try {
        api = new BalldontlieAPI({ apiKey: API_KEY });
        console.log('✅ Ball Don\'t Lie API client initialized successfully');
        
        // Test if the client has the NBA property
        if (!api.nba) {
          console.error('❌ API client initialized but missing .nba property - check SDK version');
        } else {
          console.log('✅ API client NBA endpoint verified');
        }
      } catch (error) {
        console.error('❌ Error initializing Ball Don\'t Lie API client:', error);
      }
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

  /**
   * Get current 2025 MLB starting pitcher stats by team name
   * @param {string} teamName - Team name to get pitcher stats for 
   * @returns {Promise<Array>} Array of pitcher stats
   */
  async getMlbPitcherStatsByTeam(teamName) {
    try {
      console.log(`Getting 2025 season pitchers for ${teamName}...`);
      
      // First get the team ID
      const cacheKey = `mlb_teams_${teamName}`;
      const teams = await getCachedOrFetch(cacheKey, async () => {
        return this.getClient().mlb.getTeams();
      }, true); // Use MLB-specific shorter cache TTL
      if (!teams || !teams.data || !teams.data.length) {
        console.error('No MLB teams found');
        return null;
      }
      
      // Find team by name (with fuzzy matching)
      const normalizedTeamName = teamName.toLowerCase().replace(/\s+/g, '');
      const team = teams.data.find(t => 
        t.display_name.toLowerCase().replace(/\s+/g, '').includes(normalizedTeamName) ||
        normalizedTeamName.includes(t.display_name.toLowerCase().replace(/\s+/g, '')) ||
        t.name.toLowerCase().replace(/\s+/g, '').includes(normalizedTeamName) ||
        normalizedTeamName.includes(t.name.toLowerCase().replace(/\s+/g, '')) ||
        t.location.toLowerCase().replace(/\s+/g, '').includes(normalizedTeamName) ||
        normalizedTeamName.includes(t.location.toLowerCase().replace(/\s+/g, ''))
      );
      
      if (!team) {
        console.error(`Team not found: ${teamName}`);
        return null;
      }
      
      console.log(`Found team: ${team.display_name} (ID: ${team.id})`);
      
      // Get active players for the team - specifically starting pitchers
      const playerCacheKey = `mlb_active_players_${team.id}_2025`;
      const activePlayers = await getCachedOrFetch(playerCacheKey, async () => {
        return this.getClient().mlb.getActivePlayers({
          team_ids: [team.id],
          season: 2025, // Explicitly request 2025 season data
          per_page: 100
        });
      }, true); // Use MLB-specific shorter cache TTL
      
      if (!activePlayers || !activePlayers.data || !activePlayers.data.length) {
        console.error(`No active players found for ${teamName}`);
        return null;
      }
      
      // Filter for pitchers only (Starting Pitcher and Relief Pitcher)
      const pitchers = activePlayers.data.filter(player => 
        player.position && (player.position.includes('Pitcher'))
      );
      
      if (!pitchers.length) {
        console.error(`No pitchers found for ${teamName}`);
        return null;
      }
      
      console.log(`Found ${pitchers.length} pitchers for ${teamName}`);
      
      // Get 2025 season stats for each pitcher
      const currentYear = 2025; // Hard-code to 2025 as specified
      const pitcherStats = [];
      
      for (const pitcher of pitchers.slice(0, 5)) { // Limit to 5 pitchers to avoid rate limits
        try {
          const stats = await this.getMlbPlayerSeasonStats(pitcher.id, currentYear);
          if (stats) {
            // Combine player data with their stats
            pitcherStats.push({
              ...pitcher,
              seasonStats: stats
            });
          }
        } catch (error) {
          console.error(`Error getting stats for pitcher ${pitcher.full_name}:`, error);
        }
      }
      
      return pitcherStats;
    } catch (error) {
      console.error(`Error getting MLB pitcher stats for ${teamName}:`, error);
      return null;
    }
  },
  
  /**
   * Get starting pitcher matchup for a game
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} Pitcher matchup data
   */
  async getMlbPitcherMatchup(homeTeam, awayTeam) {
    try {
      console.log(`Getting pitcher matchup for ${awayTeam} @ ${homeTeam}...`);
      
      // Get pitcher stats for both teams in parallel
      const [homePitchers, awayPitchers] = await Promise.all([
        this.getMlbPitcherStatsByTeam(homeTeam),
        this.getMlbPitcherStatsByTeam(awayTeam)
      ]);
      
      // Find likely starting pitchers for today's specific game
      const findStartingPitcher = async (pitchers, teamName) => {
        if (!pitchers || !pitchers.length) return null;
        
        // Try to get verified starting pitchers from ESPN or MLB API
        try {
          // First try to get the scheduled starter from other sources
          // Import services that might have today's scheduled starters
          const { apiSportsService } = await import('./apiSportsService.js');
          const { sportsDataService } = await import('./sportsDataService.js');
          
          // Get current date in YYYY-MM-DD format
          const today = new Date().toISOString().split('T')[0];
          
          // Try to get confirmed starters from API Sports first
          try {
            console.log(`Checking for confirmed starters for ${teamName} on ${today} from API Sports...`);
            const scheduledStarters = await apiSportsService.getConfirmedStartingPitcher(teamName, today);
            if (scheduledStarters && scheduledStarters.name) {
              console.log(`Found confirmed starter from API Sports: ${scheduledStarters.name}`);
              
              // Try to find this pitcher in our dataset by name matching
              const matchedPitcher = pitchers.find(p => 
                p.full_name.toLowerCase().includes(scheduledStarters.name.toLowerCase()) || 
                scheduledStarters.name.toLowerCase().includes(p.full_name.toLowerCase())
              );
              
              if (matchedPitcher) {
                console.log(`✅ Found matching pitcher in our dataset: ${matchedPitcher.full_name}`);
                return matchedPitcher;
              }
            }
          } catch (e) {
            console.log(`No confirmed starter from API Sports: ${e.message}`);
          }
          
          // Try to get from SportsData service as fallback
          try {
            console.log(`Checking for probable starters for ${teamName} from SportsDB...`);
            const probableStarter = await sportsDataService.getProbableStarter(teamName, today);
            if (probableStarter && probableStarter.name) {
              console.log(`Found probable starter from SportsDB: ${probableStarter.name}`);
              
              // Try to find this pitcher in our dataset by name matching
              const matchedPitcher = pitchers.find(p => 
                p.full_name.toLowerCase().includes(probableStarter.name.toLowerCase()) || 
                probableStarter.name.toLowerCase().includes(p.full_name.toLowerCase())
              );
              
              if (matchedPitcher) {
                console.log(`✅ Found matching pitcher in our dataset: ${matchedPitcher.full_name}`);
                return matchedPitcher;
              }
            }
          } catch (e) {
            console.log(`No confirmed starter from SportsDB: ${e.message}`);
          }
        } catch (error) {
          console.log(`Error getting verified starters: ${error.message}. Falling back to algorithm.`);
        }
        
        // If we couldn't find a verified starter, fall back to our algorithm
        console.log(`Using algorithmic approach to find starter for ${teamName}...`);
        
        // First look for pitchers with position exactly "Starting Pitcher"
        const startingPitchers = pitchers.filter(p => p.position === 'Starting Pitcher');
        
        if (startingPitchers.length > 0) {
          // Sort by most recent appearances and then by ERA
          return startingPitchers.sort((a, b) => {
            // Sort by ERA as fallback
            const aERA = a.seasonStats?.pitching_era || 999;
            const bERA = b.seasonStats?.pitching_era || 999;
            return aERA - bERA;
          })[0];
        }
        
        // If no starting pitchers found, just take the pitcher with the best ERA
        return pitchers.sort((a, b) => {
          const aERA = a.seasonStats?.pitching_era || 999;
          const bERA = b.seasonStats?.pitching_era || 999;
          return aERA - bERA;
        })[0];
      };
      
      // Use await since we made findStartingPitcher asynchronous
      const homePitcher = await findStartingPitcher(homePitchers, homeTeam);
      const awayPitcher = await findStartingPitcher(awayPitchers, awayTeam);
      
      // Format pitcher data for OpenAI analysis
      const formatPitcherData = (pitcher) => {
        if (!pitcher) return null;
        
        const stats = pitcher.seasonStats || {};
        return {
          name: pitcher.full_name,
          position: pitcher.position,
          stats: {
            ERA: stats.pitching_era?.toFixed(2) || 'N/A',
            WHIP: stats.pitching_whip?.toFixed(2) || 'N/A', 
            record: `${stats.pitching_w || 0}-${stats.pitching_l || 0}`,
            inningsPitched: stats.pitching_ip?.toFixed(1) || 'N/A',
            strikeouts: stats.pitching_k || 'N/A',
            opponentAvg: stats.pitching_oba?.toFixed(3) || 'N/A',
            description: `${pitcher.full_name} has a ${stats.pitching_era?.toFixed(2) || 'N/A'} ERA over ${stats.pitching_ip?.toFixed(1) || 0} innings in 2025.`
          }
        };
      };
      
      return {
        homePitcher: formatPitcherData(homePitcher),
        awayPitcher: formatPitcherData(awayPitcher),
        game: {
          venue: 'TBD', // These will be populated from other sources if available
          date: 'TBD',
          time: 'TBD'
        },
        note: 'Pitcher data from Ball Don\'t Lie API (2025 season stats only)'
      };
    } catch (error) {
      console.error(`Error getting pitcher matchup for ${awayTeam} @ ${homeTeam}:`, error);
      return null;
    }
  },
  
  // MLB game stats function moved down - see comprehensive implementation at line ~620
  
  
  /**
   * Generate a detailed statistics report for specific players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} [season] - Season year (defaults to current NBA season)
   * @returns {Promise<string>} - Formatted statistics text for GPT prompt
   */
  // Game data functions with time extraction
  async getNbaGamesByDate(date) {
    try {
      const cacheKey = `nba_games_${date}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NBA games for ${date} from BallDontLie`);
        
        // Make sure API is initialized
        if (!api) {
          console.log('API client not initialized, initializing now...');
          api = new BalldontlieAPI({ apiKey: API_KEY });
        }
        
        // Check if NBA endpoint is available
        if (!api.nba) {
          console.error('ERROR: api.nba endpoint is not available in the Ball Don\'t Lie SDK');
          console.log('Available endpoints:', Object.keys(api).join(', '));
          return [];
        }
        
        // Format date as YYYY-MM-DD for API
        const formattedDate = typeof date === 'string' && date.includes('-') 
          ? date 
          : (date instanceof Date 
              ? date.toISOString().split('T')[0] 
              : new Date(date).toISOString().split('T')[0]);
        
        console.log(`Using formatted date for NBA API: ${formattedDate}`);
        
        const response = await api.nba.getGames({ 
          dates: [formattedDate],
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
        // Format date as YYYY-MM-DD for API
        const formattedDate = typeof date === 'string' && date.includes('-') 
          ? date 
          : (date instanceof Date 
              ? date.toISOString().split('T')[0] 
              : new Date(date).toISOString().split('T')[0]);
        
        console.log(`Using formatted date for MLB API: ${formattedDate}`);
        
        const response = await api.mlb.getGames({ 
          dates: [formattedDate],
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

  /**
   * Get comprehensive MLB game statistics for analysis
   * Includes pitcher matchup and detailed team statistics
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @returns {Promise<Object>} - Comprehensive game statistics for analysis
   */
  async getComprehensiveMlbGameStats(homeTeamName, awayTeamName) {
    try {
      console.log(`Getting comprehensive MLB game stats for ${awayTeamName} @ ${homeTeamName}...`);
      
      // Get data in parallel for efficiency
      const [pitcherMatchup, teamComparison] = await Promise.all([
        this.getMlbPitcherMatchup(homeTeamName, awayTeamName),
        this.getMlbTeamComparisonStats(homeTeamName, awayTeamName)
      ]);
      
      if (!pitcherMatchup || !teamComparison) {
        console.error('Failed to get complete MLB game data');
        return null;
      }
      
      // Format the response to include both pitcher data and team stats
      return {
        pitchers: pitcherMatchup,
        teams: teamComparison,
        homeTeam: {
          name: teamComparison.homeTeam.info.display_name,
          record: teamComparison.homeTeam.record,
          divisionRank: teamComparison.homeTeam.divisionRank,
          lastTenGames: teamComparison.homeTeam.lastTenGames,
          homeRecord: teamComparison.homeTeam.homeRecord,
          battingAvg: teamComparison.summary.homeBattingAVG,
          // Team ERA removed to avoid confusion with starting pitcher ERA
          // Runs scored and allowed removed to avoid confusing OpenAI
          pitcher: pitcherMatchup.homePitcher,
        },
        awayTeam: {
          name: teamComparison.awayTeam.info.display_name,
          record: teamComparison.awayTeam.record,
          divisionRank: teamComparison.awayTeam.divisionRank,
          lastTenGames: teamComparison.awayTeam.lastTenGames,
          awayRecord: teamComparison.awayTeam.roadRecord,
          battingAvg: teamComparison.summary.awayBattingAVG,
          // Team ERA removed to avoid confusion with starting pitcher ERA
          // Runs scored and allowed removed to avoid confusing OpenAI
          pitcher: pitcherMatchup.awayPitcher,
        },
        statsAvailable: true,
        pitcherMatchupText: pitcherMatchup.pitcherMatchupText,
        teamComparisonText: teamComparison.teamComparisonText
      };
    } catch (error) {
      console.error(`Error generating comprehensive MLB game stats for ${homeTeamName} vs ${awayTeamName}:`, error);
      return null;
    }
  },
  
  /**
   * Get MLB player season statistics for 2025 season
   * @param {number} playerId - Player ID
   * @param {number} season - Season year (explicitly defaults to 2025 for current season)
   * @returns {Promise<Object>} - Player's 2025 season statistics
   */
  async getMlbPlayerSeasonStats(playerId, season = 2025) {
    try {
      const cacheKey = `mlb-player-season-${playerId}-${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB 2025 season stats for player ${playerId}`);
        const client = initApi();
        const response = await client.mlb.getSeasonStats({
          season: 2025, // Always force 2025 season data regardless of parameter
          player_ids: [playerId]
        });
        return response.data?.[0] || null;
      }, true); // Use MLB-specific shorter cache TTL for fresher data
    } catch (error) {
      console.error(`Error fetching MLB 2025 season stats for player ${playerId}:`, error);
      return null;
    }
  },
  
  /**
   * Get MLB team season statistics for 2025 season
   * @param {number} teamId - Team ID
   * @param {number} season - Season year (explicitly defaults to 2025 for current season)
   * @returns {Promise<Object>} - Team's 2025 season statistics
   */
  async getMlbTeamSeasonStats(teamId, season = 2025) {
    try {
      const cacheKey = `mlb-team-season-${teamId}-${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB 2025 season team stats for team ${teamId}`);
        const client = initApi();
        const response = await client.mlb.getTeamSeasonStats({
          season: 2025, // Always force 2025 season data
          team_ids: [teamId]
        });
        return response.data?.[0] || null;
      }, true); // Use MLB-specific shorter cache TTL for fresher data
    } catch (error) {
      console.error(`Error fetching MLB 2025 season team stats for team ${teamId}:`, error);
      return null;
    }
  },

  /**
   * Get MLB team standings for 2025 season
   * @param {number} teamId - Optional team ID to filter standings to just one team
   * @param {number} season - Season year (explicitly defaults to 2025 for current season)
   * @returns {Promise<Object|Array>} - Team's standing or all standings if no teamId provided
   */
  async getMlbTeamStandings(teamId = null, season = 2025) {
    try {
      const cacheKey = teamId ? 
        `mlb-team-standing-${teamId}-${season}` : 
        `mlb-standings-${season}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB 2025 standings${teamId ? ` for team ${teamId}` : ''}`);
        const client = initApi();
        const response = await client.mlb.getStandings({ season: 2025 }); // Always use 2025
        
        if (teamId) {
          // Return only the specified team's standing
          return response.data?.find(standing => standing.team.id === teamId) || null;
        }
        
        // Return all standings
        return response.data || [];
      }, true); // Use MLB-specific shorter cache TTL for fresher data
    } catch (error) {
      console.error(`Error fetching MLB 2025 standings${teamId ? ` for team ${teamId}` : ''}:`, error);
      return teamId ? null : [];
    }
  },
  
  /**
   * Get team information by team name
   * @param {string} teamName - The name of the team to look up
   * @returns {Promise<Object>} - Team object or null if not found
   */
  async getTeamByName(teamName) {
    try {
      console.log(`Looking up team: ${teamName}`);
      // Normalize team name for comparison
      const normalizedName = teamName.toLowerCase().trim();
      
      // Use the getMlbGamesByDate to get a list of teams
      const todayDate = new Date().toISOString().split('T')[0];
      const games = await this.getMlbGamesByDate(todayDate);
      
      // Extract all teams from today's games
      const teams = [];
      games.forEach(game => {
        if (game.home_team && !teams.some(t => t.id === game.home_team.id)) {
          teams.push(game.home_team);
        }
        if (game.away_team && !teams.some(t => t.id === game.away_team.id)) {
          teams.push(game.away_team);
        }
      });
      
      // If no teams found in today's games, return null
      if (teams.length === 0) {
        console.log('No teams found in today\'s games, cannot find team by name');
        return null;
      }
      
      // Find the team by comparing names
      const team = teams.find(t => {
        const teamDisplayName = t.display_name?.toLowerCase() || '';
        const teamShortName = t.short_display_name?.toLowerCase() || '';
        const teamLocation = t.location?.toLowerCase() || '';
        const teamFullName = `${teamLocation} ${t.name?.toLowerCase() || ''}`;
        
        return (
          teamDisplayName.includes(normalizedName) ||
          normalizedName.includes(teamDisplayName) ||
          teamShortName.includes(normalizedName) ||
          normalizedName.includes(teamShortName) ||
          teamFullName.includes(normalizedName) ||
          normalizedName.includes(teamFullName)
        );
      });
      
      if (team) {
        console.log(`Found team: ${team.display_name} (ID: ${team.id})`);
        return team;
      }
      
      console.log(`Could not find team matching: ${teamName}`);
      return null;
    } catch (error) {
      console.error(`Error finding team by name (${teamName}):`, error);
      return null;
    }
  },

  /**
   * Get comprehensive MLB team stats with standings for a matchup
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @returns {Promise<Object>} - Comprehensive stats for both teams
   */
  async getMlbTeamComparisonStats(homeTeamName, awayTeamName) {
    try {
      console.log(`Generating comprehensive team stats comparison for ${awayTeamName} @ ${homeTeamName}`);
      
      // Step 1: Get team IDs for both teams
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByName(homeTeamName),
        this.getTeamByName(awayTeamName)
      ]);
      
      if (!homeTeam || !awayTeam) {
        console.error(`Could not find teams: ${homeTeamName} or ${awayTeamName}`);
        return null;
      }
      
      console.log(`Found teams: Home=${homeTeam.display_name} (${homeTeam.id}), Away=${awayTeam.display_name} (${awayTeam.id})`);
      
      // Step 2: Get season stats and standings for both teams
      const [
        homeTeamSeasonStats,
        awayTeamSeasonStats,
        homeTeamStanding,
        awayTeamStanding,
        allStandings
      ] = await Promise.all([
        this.getMlbTeamSeasonStats(homeTeam.id),
        this.getMlbTeamSeasonStats(awayTeam.id),
        this.getMlbTeamStandings(homeTeam.id),
        this.getMlbTeamStandings(awayTeam.id),
        this.getMlbTeamStandings() // Get all standings to show divisional context
      ]);
      
      // Step 3: Compile division standings to show team context
      const getDivisionStandings = (team) => {
        if (!allStandings || !allStandings.length) return [];
        
        return allStandings
          .filter(s => 
            s.division_name === (team.league + ' League ' + team.division) ||
            s.division_short_name === (team.league === 'American' ? 'AL ' : 'NL ') + team.division
          )
          .sort((a, b) => a.division_games_behind - b.division_games_behind);
      };
      
      const homeTeamDivision = getDivisionStandings(homeTeam);
      const awayTeamDivision = getDivisionStandings(awayTeam);
      
      // Step 4: Format the comprehensive team comparison
      return {
        homeTeam: {
          info: homeTeam,
          seasonStats: homeTeamSeasonStats,
          standing: homeTeamStanding,
          divisionStandings: homeTeamDivision,
          record: homeTeamStanding ? `${homeTeamStanding.wins}-${homeTeamStanding.losses}` : 'N/A',
          divisionRank: homeTeamStanding ? homeTeamStanding.playoff_seed : 'N/A',
          lastTenGames: homeTeamStanding ? homeTeamStanding.last_ten_games : 'N/A',
          homeRecord: homeTeamStanding ? homeTeamStanding.home : 'N/A',
          awayRecord: homeTeamStanding ? homeTeamStanding.road : 'N/A',
        },
        awayTeam: {
          info: awayTeam,
          seasonStats: awayTeamSeasonStats,
          standing: awayTeamStanding,
          divisionStandings: awayTeamDivision,
          record: awayTeamStanding ? `${awayTeamStanding.wins}-${awayTeamStanding.losses}` : 'N/A',
          divisionRank: awayTeamStanding ? awayTeamStanding.playoff_seed : 'N/A',
          lastTenGames: awayTeamStanding ? awayTeamStanding.last_ten_games : 'N/A',
          homeRecord: awayTeamStanding ? awayTeamStanding.home : 'N/A',
          awayRecord: awayTeamStanding ? awayTeamStanding.road : 'N/A',
        },
        summary: {
          homeTeamName: homeTeam.display_name,
          awayTeamName: awayTeam.display_name,
          homeTeamRecord: homeTeamStanding ? `${homeTeamStanding.wins}-${homeTeamStanding.losses}` : 'N/A',
          awayTeamRecord: awayTeamStanding ? `${awayTeamStanding.wins}-${awayTeamStanding.losses}` : 'N/A',
          // Team ERA stats removed to avoid confusing OpenAI when using starting pitcher stats
          homeBattingAVG: homeTeamSeasonStats?.batting_avg?.toFixed(3) || 'N/A',
          awayBattingAVG: awayTeamSeasonStats?.batting_avg?.toFixed(3) || 'N/A',
          // Runs scored and allowed removed to avoid confusing OpenAI when making picks
        }
      };
    } catch (error) {
      console.error(`Error generating team comparison stats for ${awayTeamName} @ ${homeTeamName}:`, error);
      return null;
    }
  },

  /**
   * Get MLB player season statistics
   * @param {number} playerId - Player ID
   * @param {number} season - Season year (default to 2025 for current season)
        });
        return response.data?.[0] || null;
      });
    } catch (error) {
      console.error(`Error fetching MLB season stats for player ${playerId}:`, error);
      return null;
    }
  },

  /**
   * Get MLB player season statistics for 2025 season
   * @param {number} playerId - Player ID
      console.error(`Error fetching MLB 2025 season stats for player ${playerId}:`, error);
      return null;
    }
  },

  /**
   * Get MLB player game statistics
   * @param {number} playerId - Player ID
   * @param {number} limit - Number of games to fetch
   * @returns {Promise<Array>} - Array of player's recent game statistics
   */
  async getMlbPlayerGameStats(playerId, limit = 5) {
    try {
      const cacheKey = `mlb-player-games-${playerId}-${limit}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB game stats for player ${playerId}`);
        const client = initApi();
        const response = await client.mlb.getStats({
          player_ids: [playerId],
          per_page: limit
        });
        return response.data || [];
      });
    } catch (error) {
      console.error(`Error fetching MLB game stats for player ${playerId}:`, error);
      return [];
    }
  },

  /**
   * Get MLB team season statistics
   * @param {number} teamId - Team ID
   * @param {number} season - Season year (explicitly defaults to 2025 for current season)
          season: 2025, // Always force 2025 season data regardless of parameter
          team_id: teamId
        });
        
        return response.data?.[0] || null;
      });
    } catch (error) {
      console.error(`Error fetching MLB season stats for team ${teamId}:`, error);
      return null;
    }
  },

  /**
   * Get MLB player injuries
   * @param {number} teamId - Team ID (optional)
   * @returns {Promise<Array>} - Array of injuries
   */
  async getMlbPlayerInjuries(teamId = null) {
    try {
      const cacheKey = `mlb-injuries-${teamId || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = teamId ? { team_ids: [teamId] } : {};
        console.log(`Fetching MLB injuries ${teamId ? 'for team ' + teamId : 'for all teams'}`);
        const client = initApi();
        const response = await client.mlb.getPlayerInjuries(params);
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching MLB injuries:', error);
      return [];
    }
  },

  /**
   * Generate detailed MLB stats report for OpenAI
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year
   * @returns {Promise<string>} - Formatted statistics report
   */
  async generateMlbStatsReport(playerIds, season = new Date().getFullYear()) {
    if (!playerIds?.length) return '';
    
    try {
      let report = '## MLB Player Statistics Report ##\n\n';
      
      for (const playerId of playerIds) {
        // Get player details, season stats, and recent games
        const [playerDetails, seasonStats, recentGames, injuries] = await Promise.all([
          (async () => {
            try {
              const client = initApi();
              return await client.mlb.getPlayer(playerId);
            } catch (error) {
              console.error(`Error fetching player details for ${playerId}:`, error);
              return { data: null };
            }
          })(),
          this.getMlbPlayerSeasonStats(playerId, season),
          this.getMlbPlayerGameStats(playerId, 7),
          this.getMlbPlayerInjuries(null) // Get all injuries and filter below
        ]);
        
        const player = playerDetails?.data;
        if (!player) continue;
        
        // Add player basic info
        report += `PLAYER: ${player.full_name} | ${player.position} | ${player.team?.display_name || 'N/A'}\n`;
        report += `Age: ${player.age} | Height: ${player.height} | Weight: ${player.weight} | Bats/Throws: ${player.bats_throws}\n\n`;
        
        // Add injury information if applicable
        const playerInjury = injuries.find(injury => injury.player?.id === playerId);
        if (playerInjury) {
          report += `INJURY STATUS: ${playerInjury.status} - ${playerInjury.type} (${playerInjury.side} ${playerInjury.detail})\n`;
          report += `Expected Return: ${new Date(playerInjury.return_date).toLocaleDateString()}\n\n`;
        }
        
        // Add season statistics
        if (seasonStats) {
          const batting = seasonStats.batting_avg ? `AVG: ${seasonStats.batting_avg.toFixed(3)} | OBP: ${seasonStats.batting_obp.toFixed(3)} | SLG: ${seasonStats.batting_slg.toFixed(3)} | OPS: ${seasonStats.batting_ops.toFixed(3)}` : 'No batting stats';
          
          report += `SEASON STATS (${season}):\n`;
          report += `Games: ${seasonStats.batting_gp || 0} | HR: ${seasonStats.batting_hr || 0} | RBI: ${seasonStats.batting_rbi || 0} | Hits: ${seasonStats.batting_h || 0}\n`;
          report += `${batting}\n`;
          
          // Add pitching stats if available
          if (seasonStats.pitching_era) {
            report += `ERA: ${seasonStats.pitching_era.toFixed(2)} | W-L: ${seasonStats.pitching_w}-${seasonStats.pitching_l} | WHIP: ${seasonStats.pitching_whip.toFixed(2)} | K: ${seasonStats.pitching_k}\n`;
          }
        }
        
        // Add recent game performance
        if (recentGames.length > 0) {
          report += `\nRECENT GAMES:\n`;
          recentGames.forEach(game => {
            const gameDate = new Date(game.game.date).toLocaleDateString();
            const opponent = game.team_name === game.game.home_team_name ? game.game.away_team_name : game.game.home_team_name;
            
            report += `vs ${opponent} (${gameDate}): `;
            
            // For batters
            if (game.hits !== null) {
              report += `${game.hits}-${game.at_bats} | R: ${game.runs} | RBI: ${game.rbi} | HR: ${game.hr}\n`;
            }
            // For pitchers
            else if (game.ip !== null) {
              report += `IP: ${game.ip} | ER: ${game.er} | K: ${game.p_k} | ERA: ${game.era !== null ? game.era.toFixed(2) : 'N/A'}\n`;
            }
          });
        }
        
        report += '\n' + '-'.repeat(50) + '\n\n';
      }
      
      return report;
      
    } catch (error) {
      console.error('Error generating MLB player stats report:', error);
      return 'Error generating MLB statistics report.';
    }
  },

  /**
   * Generate comprehensive MLB game preview for betting analysis
   * @param {number} gameId - Game ID
   * @returns {Promise<string>} - Formatted game preview
   */
  async generateMlbGamePreview(gameId) {
    try {
      const cacheKey = `mlb-game-preview-${gameId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const game = await this.getClient().mlb.getGame(gameId);
        if (!game?.data) return 'Game information not available.';
        
        const homeTeamId = game.data.home_team.id;
        const awayTeamId = game.data.away_team.id;
        
        const [homeTeamStats, awayTeamStats, homeTeamInjuries, awayTeamInjuries] = await Promise.all([
          this.getMlbTeamSeasonStats(homeTeamId),
          this.getMlbTeamSeasonStats(awayTeamId),
          this.getMlbPlayerInjuries(homeTeamId),
          this.getMlbPlayerInjuries(awayTeamId)
        ]);
        
        let preview = `## MLB Game Preview: ${game.data.away_team.display_name} @ ${game.data.home_team.display_name} ##\n\n`;
        preview += `Date: ${new Date(game.data.date).toLocaleDateString()} ${new Date(game.data.date).toLocaleTimeString()}\n`;
        preview += `Venue: ${game.data.venue}\n\n`;
        
        // Team comparison
        preview += '### TEAM COMPARISON ###\n\n';
        
        if (homeTeamStats && awayTeamStats) {
          preview += '| Stat | ' + game.data.away_team.short_display_name.padEnd(15) + ' | ' + game.data.home_team.short_display_name.padEnd(15) + ' |\n';
          preview += '|------|' + '-'.repeat(15) + '|' + '-'.repeat(15) + '|\n';
          preview += `| Record | ${awayTeamStats.wins}-${awayTeamStats.losses} | ${homeTeamStats.wins}-${homeTeamStats.losses} |\n`;
          preview += `| Batting Avg | ${awayTeamStats.batting_avg?.toFixed(3) || 'N/A'} | ${homeTeamStats.batting_avg?.toFixed(3) || 'N/A'} |\n`;
          // Team ERA line removed to avoid confusing OpenAI
          preview += `| Home/Road | ${awayTeamStats.road_wins}-${awayTeamStats.road_losses} (Road) | ${homeTeamStats.home_wins}-${homeTeamStats.home_losses} (Home) |\n`;
        }
        
        // Injuries
        if (homeTeamInjuries.length || awayTeamInjuries.length) {
          preview += '\n### KEY INJURIES ###\n\n';
          
          if (awayTeamInjuries.length) {
            preview += `${game.data.away_team.display_name}:\n`;
            awayTeamInjuries.slice(0, 5).forEach(injury => {
              preview += `- ${injury.player.full_name}: ${injury.status} - ${injury.type}\n`;
            });
            preview += '\n';
          }
          
          if (homeTeamInjuries.length) {
            preview += `${game.data.home_team.display_name}:\n`;
            homeTeamInjuries.slice(0, 5).forEach(injury => {
              preview += `- ${injury.player.full_name}: ${injury.status} - ${injury.type}\n`;
            });
          }
        }
        
        return preview;
      });
    } catch (error) {
      console.error('Error generating MLB game preview:', error);
      return 'Error generating MLB game preview.';
    }
  },

  /**
   * Generate a comprehensive player stats report for OpenAI
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {string} sport - Sport type (NBA or MLB)
   * @param {number} season - Season year
   * @returns {Promise<string>} - Formatted statistics report
   */
  async generatePlayerStatsReport(playerIds, sport = 'NBA', season = new Date().getFullYear()) {
    if (!playerIds?.length) return '';
    
    if (sport === 'MLB') {
      return this.generateMlbStatsReport(playerIds, season);
    } else {
      // Existing NBA stats implementation
      try {
        // Get both season averages and recent game stats for NBA
        const [seasonAverages, recentGameStats] = await Promise.all([
          this.getPlayerAverages(playerIds, season),
          this.getPlayerRecentGameStats(playerIds, season)
        ]);
        
        // Generate the report
        let report = 'NBA Player Statistics Report\n\n';
        
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
            report += `PPG: ${seasonData.pts.toFixed(1)} | RPG: ${seasonData.reb.toFixed(1)} | APG: ${seasonData.ast.toFixed(1)}\n`;
            report += `FG%: ${(seasonData.fg_pct * 100).toFixed(1)} | 3P%: ${(seasonData.fg3_pct * 100).toFixed(1)} | FT%: ${(seasonData.ft_pct * 100).toFixed(1)}\n`;
          }
          
          if (recentData?.length) {
            report += '\nRecent Games:\n';
            recentData.slice(0, 3).forEach(game => {
              const date = new Date(game.game.date).toLocaleDateString();
              const opponent = game.game.home_team.id === player.team.id ? 
                game.game.visitor_team.abbreviation : game.game.home_team.abbreviation;
              report += `vs ${opponent} (${date}): ${game.pts}pts, ${game.reb}reb, ${game.ast}ast, ${game.stl}stl, ${game.blk}blk\n`;
            });
          }
          
          report += '\n' + '-'.repeat(50) + '\n\n';
        }
        
        return report;
        
      } catch (error) {
        console.error('Error generating player stats report:', error);
        return 'Error generating player statistics report.';
      }
    }
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
