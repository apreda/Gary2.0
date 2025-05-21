/**
 * MLB Stats API - Pitcher Data Retrieval Functions
 * Improved error handling to prevent TypeErrors when accessing properties of undefined objects
 */
import axios from 'axios';

// Define the API base URL (same as in mlbStatsApiService.js)
const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

// Enhanced function for retrieving pitcher season stats
const getPitcherSeasonStatsFixed = async (playerId) => {
  if (!playerId) {
    console.log(`[MLB API] Cannot get stats for pitcher: No pitcher ID provided`);
    return {};
  }
  
  try {
    console.log(`[MLB API] Getting season stats for pitcher ${playerId}`);
    
    const response = await axios.get(`${MLB_API_BASE_URL}/people/${playerId}/stats`, {
      params: {
        stats: 'season',
        group: 'pitching',
        season: new Date().getFullYear(),
        sportId: 1
      }
    });
    
    if (response.data && response.data.stats && response.data.stats.length > 0) {
      const stats = response.data.stats[0].splits?.[0]?.stat || {};
      return {
        era: stats.era || 0,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        inningsPitched: stats.inningsPitched || '0.0',
        strikeouts: stats.strikeOuts || 0,
        whip: stats.whip || 0,
        battingAvgAgainst: stats.avg || '.000',
        gamesStarted: stats.gamesStarted || 0,
        saveOpportunities: stats.saveOpportunities || 0,
        saves: stats.saves || 0,
        year: stats.era ? new Date().getFullYear() : new Date().getFullYear() - 1, // Year for which stats were found
        gamesPitched: stats.gamesPitched || 0
      };
    }
    
    return {};
  } catch (error) {
    console.error(`[MLB API] Error getting season stats for pitcher ${playerId}:`, error.message);
    return {};
  }
};

// Comprehensive function to get all data needed for MLB picks generation
const getPicksGenerationDataFixed = async (date = new Date().toISOString().slice(0, 10)) => {
  console.log(`[MLB API] Getting comprehensive data for picks generation on ${date}`);
  
  try {
    // Step 1: Get all games for the day
    const games = await mlbStatsApiService.getTodaysGames(date) || [];
    
    // Step 2: For each game, get the starting pitchers
    const gamesWithPitchers = [];
    
    for (const game of games) {
      if (!game || !game.gameId) {
        console.log(`[MLB API] Skipping game with missing data:`, game);
        continue;
      }
      
      try {
        const pitchers = await mlbStatsApiService.getStartingPitchers(game.gameId) || { homeStarter: null, awayStarter: null };
        
        // Get season stats for pitchers
        let homeStarterSeasonStats = {};
        let awayStarterSeasonStats = {};
        
        if (pitchers.homeStarter?.id) {
          try {
            homeStarterSeasonStats = await getPitcherSeasonStatsFixed(pitchers.homeStarter.id);
          } catch (homeStatsError) {
            console.error(`[MLB API] Error getting home starter stats:`, homeStatsError.message);
          }
        }
        
        if (pitchers.awayStarter?.id) {
          try {
            awayStarterSeasonStats = await getPitcherSeasonStatsFixed(pitchers.awayStarter.id);
          } catch (awayStatsError) {
            console.error(`[MLB API] Error getting away starter stats:`, awayStatsError.message);
          }
        }
        
        // Add full details to our games array
        gamesWithPitchers.push({
          ...game,
          pitchers: {
            home: pitchers.homeStarter ? {
              ...pitchers.homeStarter,
              seasonStats: homeStarterSeasonStats || {}
            } : null,
            away: pitchers.awayStarter ? {
              ...pitchers.awayStarter,
              seasonStats: awayStarterSeasonStats || {}
            } : null
          }
        });
      } catch (gameError) {
        console.error(`[MLB API] Error processing game ${game.gameId}:`, gameError.message);
      }
    }
    
    // Step 3: Get injury list
    let injuries = [];
    try {
      injuries = await mlbStatsApiService.getILTransactions();
    } catch (injuriesError) {
      console.error(`[MLB API] Error getting IL transactions:`, injuriesError.message);
    }
    
    return {
      date,
      games: gamesWithPitchers,
      injuries,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[MLB API] Error in getPicksGenerationData:`, error.message);
    return {
      date,
      games: [],
      injuries: [],
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
};

// Export the fixed functions
export { getPitcherSeasonStatsFixed, getPicksGenerationDataFixed };
