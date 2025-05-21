/**
 * Enhanced MLB Picks Generation Service
 * Uses the combined MLB service to get accurate data for generating picks
 */

import { combinedMlbService } from './combinedMlbService.js';
import { mlbStatsApiService } from './mlbStatsApiService.js';
import { supabase } from '../supabaseClient.js';

// Get original service functions
import { mlbPicksGenerationService as originalService } from './mlbPicksGenerationService.js';

/**
 * Helper function to calculate K/9 rate
 * @param {number} strikeouts - Total strikeouts
 * @param {number} inningsPitched - Innings pitched
 * @returns {number} - K/9 rate
 */
function calculateK9(strikeouts, inningsPitched) {
  if (!inningsPitched || inningsPitched === 0) return 0;
  const innings = parseFloat(inningsPitched);
  if (isNaN(innings)) return 0;
  return (strikeouts * 9) / innings;
}

const mlbPicksGenerationService = {
  // Include all methods from the original service
  ...originalService,
  
  /**
   * Enhanced version of generatePicks that uses the combined service
   * for more accurate starting pitcher information
   * @param {string} date - Date in YYYY-MM-DD format, defaults to today
   * @param {number} numPicks - Number of picks to generate, defaults to 3
   * @returns {Promise<Object>} - Object containing generated picks
   */
  /**
   * Format ERA value safely for display
   * @param {string|number} era - ERA value that may be a number or string like "-.--"
   * @returns {string} - Formatted ERA string
   */
  formatEra: (era) => {
    // Check if era is a valid number
    if (era === undefined || era === null) return 'N/A';
    if (era === '-.--') return 'N/A';
    
    const eraNum = parseFloat(era);
    if (isNaN(eraNum)) return 'N/A';
    
    return eraNum.toFixed(2);
  },
  
  /**
   * Enhanced version of generatePicks that uses the combined service
   * for more accurate starting pitcher information
   * @param {string} date - Date in YYYY-MM-DD format, defaults to today
   * @param {number} numPicks - Number of picks to generate, defaults to 3
   * @returns {Promise<Object>} - Object containing generated picks
   */
  generateEnhancedPicks: async (date = new Date().toISOString().slice(0, 10), numPicks = 3) => {
    try {
      console.log(`[MLB Picks] Generating ${numPicks} enhanced MLB picks for ${date}`);
      
      // Get MLB games for the specified date using the MLB Stats API
      const games = await mlbStatsApiService.getGamesByDate(date);
      
      if (!games || games.length === 0) {
        console.log(`[MLB Picks] No games found for ${date}`);
        return { success: false, message: `No games found for ${date}`, picks: [] };
      }
      
      console.log(`[MLB Picks] Found ${games.length} games for ${date}`);
      
      // Process each game with our combined service
      const processedGames = [];
      const injuries = []; // We'll collect any injuries here if available
      
      for (const game of games) {
        const homeTeamName = game.teams.home.team.name;
        const awayTeamName = game.teams.away.team.name;
        
        try {
          // Get comprehensive data using our combined service
          const gameData = await combinedMlbService.getComprehensiveGameData(homeTeamName, awayTeamName, date);
          
          // Structure the game data to match expected format
          const processedGame = {
            gameId: game.gamePk,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            venue: game.venue.name,
            gameTime: new Date(game.gameDate).toLocaleTimeString(),
            matchup: `${awayTeamName} at ${homeTeamName}`,
            status: game.status.detailedState,
            preview: await combinedMlbService.generateEnhancedGamePreview(homeTeamName, awayTeamName, date),
            pitchers: {
              home: gameData.pitchers.home,
              away: gameData.pitchers.away
            }
          };
          
          processedGames.push(processedGame);
          console.log(`[MLB Picks] Successfully processed game: ${awayTeamName} @ ${homeTeamName}`);
          
        } catch (error) {
          console.error(`[MLB Picks] Error processing game ${awayTeamName} @ ${homeTeamName}:`, error.message);
          // Still add the game with minimal info to avoid breaking the analysis
          processedGames.push({
            gameId: game.gamePk,
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            venue: game.venue.name,
            gameTime: new Date(game.gameDate).toLocaleTimeString(),
            matchup: `${awayTeamName} at ${homeTeamName}`,
            status: game.status.detailedState
          });
        }
      }
      
      // Format the data for picks generation
      const mlbData = {
        games: processedGames,
        injuries: injuries,
        date: date
      };
      
      // Filter games to only those with available pitchers
      const gamesWithPitchers = mlbData.games.filter(
        game => game.pitchers?.home && game.pitchers?.away
      );
      
      if (gamesWithPitchers.length === 0) {
        console.log(`[MLB Picks] No games with starting pitchers found for ${date}`);
        return { 
          success: false, 
          message: `No games with confirmed starting pitchers found for ${date}`, 
          picks: [] 
        };
      }
      
      console.log(`[MLB Picks] Found ${gamesWithPitchers.length} games with starting pitchers`);
      
      // Make sure all ERA values are properly formatted
      gamesWithPitchers.forEach(game => {
        if (game.pitchers?.home?.seasonStats?.era) {
          game.pitchers.home.seasonStats.eraFormatted = mlbPicksGenerationService.formatEra(game.pitchers.home.seasonStats.era);
        }
        if (game.pitchers?.away?.seasonStats?.era) {
          game.pitchers.away.seasonStats.eraFormatted = mlbPicksGenerationService.formatEra(game.pitchers.away.seasonStats.era);
        }
      });
      
      // Generate different types of props using original service methods
      const generatedPicks = [];
      
      // Track players we've already made picks for to avoid duplicates
      const pickedPlayers = new Set();
      
      // Create a customized version of generateStrikeoutPicks to handle potential string ERAs
      const generateSafeStrikeoutPicks = async (games, numPicks, pickedPlayers) => {
        // Use same logic as original but with safety checks
        const strikeoutPicks = [];
        
        games.forEach(game => {
          try {
            if (game.pitchers?.home?.id && game.pitchers.home.seasonStats) {
              const homeK9 = calculateK9(game.pitchers.home.seasonStats.strikeouts, game.pitchers.home.seasonStats.inningsPitched);
              
              if (homeK9 > 8.5) {
                strikeoutPicks.push({
                  player: game.pitchers.home.fullName,
                  team: game.homeTeam,
                  prop: 'strikeouts',
                  line: 5.5, // Default line
                  bet: 'over',
                  analysis: `High K/9 rate of ${homeK9.toFixed(1)} and faces ${game.awayTeam}.`,
                  matchup: game.matchup,
                  gameId: game.gameId,
                  playerId: game.pitchers.home.id,
                  confidence: 7,
                  odds: -110
                });
              }
            }
            
            if (game.pitchers?.away?.id && game.pitchers.away.seasonStats) {
              const awayK9 = calculateK9(game.pitchers.away.seasonStats.strikeouts, game.pitchers.away.seasonStats.inningsPitched);
              
              if (awayK9 > 8.5) {
                strikeoutPicks.push({
                  player: game.pitchers.away.fullName,
                  team: game.awayTeam,
                  prop: 'strikeouts',
                  line: 5.5, // Default line
                  bet: 'over',
                  analysis: `High K/9 rate of ${awayK9.toFixed(1)} and faces ${game.homeTeam}.`,
                  matchup: game.matchup,
                  gameId: game.gameId,
                  playerId: game.pitchers.away.id,
                  confidence: 7,
                  odds: -110
                });
              }
            }
          } catch (error) {
            console.error(`Error processing strikeout picks for game ${game.matchup}:`, error.message);
          }
        });
        
        // Sort by K/9 and take top picks
        strikeoutPicks.sort((a, b) => b.confidence - a.confidence);
        return strikeoutPicks.slice(0, numPicks);
      };
      
      // Create a customized version of generateHittingPicks to handle potential string ERAs
      const generateSafeHittingPicks = async (games, numPicks, pickedPlayers) => {
        const hittingPicks = [];
        
        games.forEach(game => {
          try {
            // Use eraFormatted instead of calling toFixed() directly
            if (game.pitchers?.home?.seasonStats?.eraFormatted && 
                game.pitchers.home.seasonStats.eraFormatted !== 'N/A' && 
                parseFloat(game.pitchers.home.seasonStats.eraFormatted) > 4.5) {
              // Target away team hitter against vulnerable home pitcher
              hittingPicks.push({
                player: `[Top Hitter from ${game.awayTeam}]`, // Would be replaced with actual player
                team: game.awayTeam,
                prop: 'hits',
                line: 1.5,
                bet: 'over',
                analysis: `Facing vulnerable pitcher with ${game.pitchers.home.seasonStats.eraFormatted} ERA at ${game.venue}.`,
                matchup: game.matchup,
                gameId: game.gameId,
                playerId: null, // Would be actual player ID
                confidence: 6,
                odds: -115
              });
            } else if (game.pitchers?.away?.seasonStats?.eraFormatted && 
                       game.pitchers.away.seasonStats.eraFormatted !== 'N/A' && 
                       parseFloat(game.pitchers.away.seasonStats.eraFormatted) > 4.5) {
              // Target home team hitter against vulnerable away pitcher
              hittingPicks.push({
                player: `[Top Hitter from ${game.homeTeam}]`, // Would be replaced with actual player
                team: game.homeTeam,
                prop: 'total_bases',
                line: 1.5,
                bet: 'over',
                analysis: `Facing vulnerable pitcher with ${game.pitchers.away.seasonStats.eraFormatted} ERA at home in ${game.venue}.`,
                matchup: game.matchup,
                gameId: game.gameId,
                playerId: null, // Would be actual player ID
                confidence: 6,
                odds: -120
              });
            }
          } catch (error) {
            console.error(`Error processing hitting picks for game ${game.matchup}:`, error.message);
          }
        });
        
        return hittingPicks;
      };
      
      // Use our safe versions instead of the originals
      const strikeoutPicks = await generateSafeStrikeoutPicks(
        gamesWithPitchers, 
        numPicks, 
        pickedPlayers
      );
      generatedPicks.push(...strikeoutPicks);
      
      // Fill remaining picks with hits and total bases
      if (generatedPicks.length < numPicks) {
        const hittingPicks = await generateSafeHittingPicks(
          gamesWithPitchers,
          numPicks - generatedPicks.length,
          pickedPlayers
        );
        generatedPicks.push(...hittingPicks);
      }
      
      console.log(`[MLB Picks] Generated ${generatedPicks.length} total picks`);
      
      return {
        success: true,
        message: `Generated ${generatedPicks.length} enhanced MLB picks for ${date}`,
        picks: generatedPicks,
        metadata: {
          date,
          numGames: mlbData.games.length,
          numGamesWithPitchers: gamesWithPitchers.length,
          numInjuries: mlbData.injuries.length,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error(`[MLB Picks] Error generating enhanced picks: ${error.message}`);
      console.log(`[MLB Picks] Falling back to original picks generation method`);
      
      // Fall back to original method
      return originalService.generatePicks(date, numPicks);
    }
  }
};

export { mlbPicksGenerationService };
