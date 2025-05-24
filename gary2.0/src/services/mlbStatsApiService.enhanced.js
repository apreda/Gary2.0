/**
 * Enhanced MLB Stats API Service
 * Includes improved functions for retrieving accurate starting pitcher information
 * This version uses the schedule API with hydration for reliable starting pitcher data
 */
import { mlbStatsApiService as originalService } from './mlbStatsApiService.js';
import axios from 'axios';

const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

// Create an enhanced version of the MLB Stats API service
const mlbStatsApiService = {
  // Include all methods from the original service
  ...originalService,
  
  /**
   * Enhanced version of getStartingPitchers that uses the more reliable schedule API
   * @param {number} gamePk - The MLB game ID
   * @returns {Promise<Object>} - Object containing home and away starting pitchers with complete details
   */
  getStartingPitchersEnhanced: async (gamePk) => {
    try {
      console.log(`[MLB API] Getting enhanced starting pitchers data for game ${gamePk}`);
      
      // First, try to get the game data directly
      const gameResponse = await axios.get(`${MLB_API_BASE_URL}/game/${gamePk}/feed/live`);
      
      if (gameResponse.data && gameResponse.data.gameData) {
        const gameData = gameResponse.data.gameData;
        
        // Check for probable pitchers in gameData
        let homeProbablePitcher = gameData.probablePitchers?.home;
        let awayProbablePitcher = gameData.probablePitchers?.away;
        
        // If not found there, try the teams structure
        if (!homeProbablePitcher && gameData.teams?.home?.probablePitcher) {
          homeProbablePitcher = gameData.teams.home.probablePitcher;
        }
        if (!awayProbablePitcher && gameData.teams?.away?.probablePitcher) {
          awayProbablePitcher = gameData.teams.away.probablePitcher;
        }
        
        // If we found probable pitchers, use them
        if (homeProbablePitcher || awayProbablePitcher) {
          console.log(`[MLB API] Found probable pitchers from game feed`);
          console.log(`[MLB API] Home: ${homeProbablePitcher?.fullName || 'TBD'}, Away: ${awayProbablePitcher?.fullName || 'TBD'}`);
          
          // Process pitchers (continue with existing logic below)
          let homeStarter = null;
          if (homeProbablePitcher) {
            const stats = await originalService.getPitcherSeasonStats(homeProbablePitcher.id);
            homeStarter = {
              id: homeProbablePitcher.id,
              fullName: homeProbablePitcher.fullName,
              firstName: homeProbablePitcher.firstName || '',
              lastName: homeProbablePitcher.lastName || '',
              number: homeProbablePitcher.jerseyNumber || '',
              team: gameData.teams?.home?.name || '',
              stats: {},
              seasonStats: stats
            };
          }
          
          let awayStarter = null;
          if (awayProbablePitcher) {
            const stats = await originalService.getPitcherSeasonStats(awayProbablePitcher.id);
            awayStarter = {
              id: awayProbablePitcher.id,
              fullName: awayProbablePitcher.fullName,
              firstName: awayProbablePitcher.firstName || '',
              lastName: awayProbablePitcher.lastName || '',
              number: awayProbablePitcher.jerseyNumber || '',
              team: gameData.teams?.away?.name || '',
              stats: {},
              seasonStats: stats
            };
          }
          
          return {
            home: homeStarter,
            away: awayStarter,
            homeStarter,
            awayStarter
          };
        }
      }
      
      // If game feed didn't work, try schedule API as fallback
      console.log(`[MLB API] No probable pitchers in game feed, trying schedule API`);
      const response = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
        params: {
          sportId: 1,
          gamePk: gamePk,
          hydrate: 'probablePitcher,person,stats',
        }
      });
      
      if (!response.data || !response.data.dates || !response.data.dates[0] || !response.data.dates[0].games || !response.data.dates[0].games[0]) {
        console.log(`[MLB API] No game data found for game ${gamePk} in schedule API`);
        // Don't fall back to boxscore for future games
        return { home: null, away: null, homeStarter: null, awayStarter: null };
      }
      
      const game = response.data.dates[0].games[0];
      
      // Check if probable pitchers exist in the data
      if (!game.teams || (!game.teams.home.probablePitcher && !game.teams.away.probablePitcher)) {
        console.log(`[MLB API] No probable pitchers listed for game ${gamePk}`);
        // Don't fall back to boxscore for future games
        return { home: null, away: null, homeStarter: null, awayStarter: null };
      }
      
      // Process home starter
      let homeStarter = null;
      if (game.teams.home.probablePitcher) {
        const pitcher = game.teams.home.probablePitcher;
        console.log(`[MLB API] Found home probable pitcher: ${pitcher.fullName} (${pitcher.id})`);
        
        // Get complete stats for the pitcher
        const stats = await originalService.getPitcherSeasonStats(pitcher.id);
        
        homeStarter = {
          id: pitcher.id,
          fullName: pitcher.fullName,
          firstName: pitcher.firstName || '',
          lastName: pitcher.lastName || '',
          number: pitcher.jerseyNumber || '',
          team: game.teams.home.team.name,
          stats: {},
          seasonStats: stats
        };
      }
      
      // Process away starter
      let awayStarter = null;
      if (game.teams.away.probablePitcher) {
        const pitcher = game.teams.away.probablePitcher;
        console.log(`[MLB API] Found away probable pitcher: ${pitcher.fullName} (${pitcher.id})`);
        
        // Get complete stats for the pitcher
        const stats = await originalService.getPitcherSeasonStats(pitcher.id);
        
        awayStarter = {
          id: pitcher.id,
          fullName: pitcher.fullName,
          firstName: pitcher.firstName || '',
          lastName: pitcher.lastName || '',
          number: pitcher.jerseyNumber || '',
          team: game.teams.away.team.name,
          stats: {},
          seasonStats: stats
        };
      }
      
      return {
        home: homeStarter,
        away: awayStarter,
        homeStarter,  // Include for backward compatibility
        awayStarter   // Include for backward compatibility
      };
    } catch (error) {
      console.error(`[MLB API] Error getting enhanced starting pitchers for game ${gamePk}:`, error.message);
      // Don't fall back to boxscore - return null pitchers for future games
      return { home: null, away: null, homeStarter: null, awayStarter: null };
    }
  },
  
  /**
   * Gets games for a date with enhanced data including starting pitchers
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of game objects with enhanced data
   */
  getGamesWithStartingPitchers: async (date = new Date().toISOString().slice(0, 10)) => {
    try {
      console.log(`[MLB API] Getting games with starting pitchers for ${date}`);
      
      // Use the schedule API with full hydration for comprehensive game data
      const response = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
        params: {
          sportId: 1,
          date: date,
          hydrate: 'team,probablePitcher,person,stats'
        }
      });
      
      if (!response.data || !response.data.dates || !response.data.dates[0] || !response.data.dates[0].games) {
        console.log(`[MLB API] No games found for ${date}`);
        return [];
      }
      
      const games = response.data.dates[0].games;
      console.log(`[MLB API] Found ${games.length} games for ${date} with enhanced data`);
      
      // For each game, add the starting pitcher information directly
      for (const game of games) {
        // Log what we found for debugging
        const homeProbable = game.teams?.home?.probablePitcher?.fullName || 'TBD';
        const awayProbable = game.teams?.away?.probablePitcher?.fullName || 'TBD';
        console.log(`[MLB API] Game ${game.gamePk}: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`);
        console.log(`[MLB API] Probable pitchers: Away: ${awayProbable}, Home: ${homeProbable}`);
        
        game.enhancedData = {
          homeProbablePitcher: game.teams.home.probablePitcher || null,
          awayProbablePitcher: game.teams.away.probablePitcher || null
        };
      }
      
      return games;
    } catch (error) {
      console.error(`[MLB API] Error getting games with starting pitchers for ${date}:`, error.message);
      return [];
    }
  },
  
  /**
   * Override the original service's getStartingPitchers to use enhanced version
   */
  getStartingPitchers: async (gamePk) => {
    return mlbStatsApiService.getStartingPitchersEnhanced(gamePk);
  }
};

export { mlbStatsApiService };
