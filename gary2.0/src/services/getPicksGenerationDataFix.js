/**
 * Fixed getPicksGenerationData function with improved error handling
 */
  getPicksGenerationData: async (date = new Date().toISOString().slice(0, 10)) => {
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
              homeStarterSeasonStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.homeStarter.id);
            } catch (homeStatsError) {
              console.error(`[MLB API] Error getting home starter stats:`, homeStatsError.message);
            }
          }
          
          if (pitchers.awayStarter?.id) {
            try {
              awayStarterSeasonStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.awayStarter.id);
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
  }
