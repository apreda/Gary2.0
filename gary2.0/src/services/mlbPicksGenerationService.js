/**
 * MLB Picks Generation Service
 * Uses the MLB Stats API as the primary data source for generating MLB prop picks
 */
import { mlbStatsApiService } from './mlbStatsApiService.js';
import { supabase } from '../supabaseClient.js';

const mlbPicksGenerationService = {
  /**
   * Generate MLB prop picks for the given date
   * @param {string} date - Date in YYYY-MM-DD format, defaults to today
   * @param {number} numPicks - Number of picks to generate, defaults to 3
   * @returns {Promise<Array>} - Array of MLB prop picks
   */
  generatePicks: async (date = new Date().toISOString().slice(0, 10), numPicks = 3) => {
    try {
      console.log(`[MLB Picks] Generating ${numPicks} MLB picks for ${date}`);
      
      // Get comprehensive data from MLB Stats API
      const mlbData = await mlbStatsApiService.getPicksGenerationData(date);
      
      if (!mlbData || !mlbData.games || mlbData.games.length === 0) {
        console.log(`[MLB Picks] No games found for ${date}`);
        return { success: false, message: `No games found for ${date}`, picks: [] };
      }
      
      console.log(`[MLB Picks] Retrieved data for ${mlbData.games.length} games`);
      
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
      
      // Generate different types of props
      const propTypes = ['strikeouts', 'hits', 'total_bases', 'hits_runs_rbis'];
      const generatedPicks = [];
      
      // Track players we've already made picks for to avoid duplicates
      const pickedPlayers = new Set();
      
      // Generate picks based on starting pitcher strikeouts
      const strikeoutPicks = await mlbPicksGenerationService.generateStrikeoutPicks(
        gamesWithPitchers, 
        numPicks, 
        pickedPlayers
      );
      generatedPicks.push(...strikeoutPicks);
      
      // Fill remaining picks with hits and total bases
      if (generatedPicks.length < numPicks) {
        const hittingPicks = await mlbPicksGenerationService.generateHittingPicks(
          gamesWithPitchers,
          numPicks - generatedPicks.length,
          pickedPlayers
        );
        generatedPicks.push(...hittingPicks);
      }
      
      console.log(`[MLB Picks] Generated ${generatedPicks.length} total picks`);
      
      return {
        success: true,
        message: `Generated ${generatedPicks.length} MLB picks for ${date}`,
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
      console.error(`[MLB Picks] Error generating picks: ${error.message}`);
      return { 
        success: false, 
        message: `Error generating picks: ${error.message}`, 
        picks: [] 
      };
    }
  },
  
  /**
   * Generate strikeout prop picks based on pitchers
   * @param {Array} games - Array of games with pitcher data
   * @param {number} numPicks - Maximum number of picks to generate
   * @param {Set} pickedPlayers - Set of already picked player IDs
   * @returns {Promise<Array>} - Array of strikeout prop picks
   */
  generateStrikeoutPicks: async (games, numPicks, pickedPlayers) => {
    const strikeoutPicks = [];
    
    // Sort pitchers by strikeout potential (K/9 and recent performance)
    const sortedPitchers = [];
    
    games.forEach(game => {
      if (game.pitchers?.home?.id && game.pitchers.home.seasonStats) {
        const homeK9 = calculateK9(
          game.pitchers.home.seasonStats.strikeouts,
          game.pitchers.home.seasonStats.inningsPitched
        );
        
        sortedPitchers.push({
          id: game.pitchers.home.id,
          name: game.pitchers.home.name,
          team: game.homeTeam,
          opponent: game.awayTeam,
          matchup: game.matchup,
          gameId: game.gameId,
          strikeouts: game.pitchers.home.seasonStats.strikeouts || 0,
          inningsPitched: game.pitchers.home.seasonStats.inningsPitched || 0,
          k9: homeK9,
          era: game.pitchers.home.seasonStats.era || 0,
          isHome: true
        });
      }
      
      if (game.pitchers?.away?.id && game.pitchers.away.seasonStats) {
        const awayK9 = calculateK9(
          game.pitchers.away.seasonStats.strikeouts,
          game.pitchers.away.seasonStats.inningsPitched
        );
        
        sortedPitchers.push({
          id: game.pitchers.away.id,
          name: game.pitchers.away.name,
          team: game.awayTeam,
          opponent: game.homeTeam,
          matchup: game.matchup,
          gameId: game.gameId,
          strikeouts: game.pitchers.away.seasonStats.strikeouts || 0,
          inningsPitched: game.pitchers.away.seasonStats.inningsPitched || 0,
          k9: awayK9,
          era: game.pitchers.away.seasonStats.era || 0,
          isHome: false
        });
      }
    });
    
    // Sort by K/9 rate (descending)
    sortedPitchers.sort((a, b) => b.k9 - a.k9);
    
    // Get market lines for each pitcher (this would ideally come from a sportsbook API)
    // For now, we'll use a simple formula based on K/9 rate
    const pitchersWithLines = sortedPitchers.map(pitcher => {
      // Simple estimate: K/9 * (average innings pitched, ~5.5) / 9
      const avgInningsPitched = 5.5;
      const expectedStrikeouts = (pitcher.k9 * avgInningsPitched) / 9;
      
      // Round to nearest 0.5
      const marketLine = Math.round(expectedStrikeouts * 2) / 2;
      
      return {
        ...pitcher,
        marketLine
      };
    });
    
    // Generate picks based on historical performance vs. line
    for (const pitcher of pitchersWithLines) {
      // Skip if we've already picked this player
      if (pickedPlayers.has(pitcher.id)) continue;
      
      // Skip pitchers with very low innings pitched (sample size too small)
      if (pitcher.inningsPitched < 20) continue;
      
      // Determine bet direction based on historical performance
      const marketLine = pitcher.marketLine;
      const bet = determineStrikeoutBet(pitcher);
      
      if (bet) {
        strikeoutPicks.push({
          player: pitcher.name,
          team: pitcher.team,
          prop: 'strikeouts',
          line: marketLine,
          bet, // 'over' or 'under'
          analysis: `${pitcher.name} has a K/9 of ${pitcher.k9.toFixed(1)} this season with ${pitcher.strikeouts} strikeouts over ${pitcher.inningsPitched} innings pitched. Facing ${pitcher.opponent} ${pitcher.isHome ? 'at home' : 'on the road'}.`,
          matchup: pitcher.matchup,
          gameId: pitcher.gameId,
          playerId: pitcher.id,
          confidence: 7, // 1-10 scale
          odds: -110 // Placeholder, would come from sportsbook API
        });
        
        // Add to picked players set
        pickedPlayers.add(pitcher.id);
        
        // Break if we have enough picks
        if (strikeoutPicks.length >= numPicks) break;
      }
    }
    
    return strikeoutPicks;
  },
  
  /**
   * Generate hitting prop picks based on batters
   * @param {Array} games - Array of games with pitcher data
   * @param {number} numPicks - Maximum number of picks to generate
   * @param {Set} pickedPlayers - Set of already picked player IDs
   * @returns {Promise<Array>} - Array of hitting prop picks
   */
  generateHittingPicks: async (games, numPicks, pickedPlayers) => {
    // For a full implementation, we'd need to:
    // 1. Get the starting lineups for each team
    // 2. Get the season stats for each batter
    // 3. Analyze matchups against the opposing pitcher
    // 4. Find favorable matchups for different prop types (hits, total bases, etc.)
    
    // For this simplified version, we'll just generate some placeholder picks
    // to demonstrate the framework
    const hittingPicks = [];
    
    // Look for games with high-ERA pitchers to target hitters against
    const targetGames = games.filter(game => {
      const homeStarter = game.pitchers?.home?.seasonStats?.era || 0;
      const awayStarter = game.pitchers?.away?.seasonStats?.era || 0;
      return homeStarter > 4.5 || awayStarter > 4.5;
    });
    
    // Placeholder for actual implementation with real hitter data
    // In a complete implementation, you would fetch each team's lineup and each batter's stats
    
    // For now, generate some placeholder picks
    for (let i = 0; i < Math.min(numPicks, targetGames.length); i++) {
      const game = targetGames[i];
      
      // Target hitters facing high-ERA pitchers
      if (game.pitchers?.home?.seasonStats?.era > 4.5) {
        // Target away team hitter against vulnerable home pitcher
        hittingPicks.push({
          player: `[Top Hitter from ${game.awayTeam}]`, // Would be replaced with actual player
          team: game.awayTeam,
          prop: 'hits',
          line: 1.5,
          bet: 'over',
          analysis: `Facing vulnerable pitcher with ${game.pitchers.home.seasonStats.era.toFixed(2)} ERA at ${game.venue}.`,
          matchup: game.matchup,
          gameId: game.gameId,
          playerId: null, // Would be actual player ID
          confidence: 6,
          odds: -115
        });
      } else if (game.pitchers?.away?.seasonStats?.era > 4.5) {
        // Target home team hitter against vulnerable away pitcher
        hittingPicks.push({
          player: `[Top Hitter from ${game.homeTeam}]`, // Would be replaced with actual player
          team: game.homeTeam,
          prop: 'total_bases',
          line: 1.5,
          bet: 'over',
          analysis: `Facing vulnerable pitcher with ${game.pitchers.away.seasonStats.era.toFixed(2)} ERA at home in ${game.venue}.`,
          matchup: game.matchup,
          gameId: game.gameId,
          playerId: null, // Would be actual player ID
          confidence: 6,
          odds: -120
        });
      }
    }
    
    return hittingPicks;
  },
  
  /**
   * Save generated picks to the database
   * @param {Object} picksData - Object containing picks and metadata
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Result of the save operation
   */
  savePicks: async (picksData, date = new Date().toISOString().slice(0, 10)) => {
    try {
      if (!picksData || !picksData.picks || picksData.picks.length === 0) {
        return { success: false, message: 'No picks to save' };
      }
      
      // Format picks for storage
      const propPicksRecord = {
        date,
        league: 'MLB',
        picks: picksData.picks.map(pick => ({
          player: pick.player,
          team: pick.team,
          prop: `${pick.prop} ${pick.line}`,
          bet: pick.bet,
          odds: pick.odds || -110,
          confidence: pick.confidence || 7,
          analysis: pick.analysis || null
        })),
        matchup: picksData.picks[0].matchup.split(' at ')[0],
        source: 'MLB Stats API',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Insert into prop_picks table
      const { data, error } = await supabase
        .from('prop_picks')
        .insert([propPicksRecord])
        .select();
      
      if (error) {
        console.error(`[MLB Picks] Error saving picks: ${error.message}`);
        return { success: false, message: `Error saving picks: ${error.message}` };
      }
      
      return { 
        success: true, 
        message: `Successfully saved ${picksData.picks.length} picks for ${date}`,
        data
      };
    } catch (error) {
      console.error(`[MLB Picks] Error saving picks: ${error.message}`);
      return { success: false, message: `Error saving picks: ${error.message}` };
    }
  }
};

/**
 * Helper function to calculate K/9 rate
 * @param {number} strikeouts - Total strikeouts
 * @param {number} inningsPitched - Innings pitched
 * @returns {number} - K/9 rate
 */
function calculateK9(strikeouts, inningsPitched) {
  if (!inningsPitched || inningsPitched === 0) return 0;
  return (strikeouts * 9) / inningsPitched;
}

/**
 * Helper function to determine strikeout bet direction
 * @param {Object} pitcher - Pitcher data
 * @returns {string|null} - 'over', 'under', or null if no bet
 */
function determineStrikeoutBet(pitcher) {
  // Simple logic: 
  // If K/9 is much higher than market line implies, bet over
  // If K/9 is much lower than market line implies, bet under
  
  const k9 = pitcher.k9;
  const marketLine = pitcher.marketLine;
  
  // Expected strikeouts for ~5.5 innings
  const avgInningsPitched = 5.5;
  const expectedStrikeouts = (k9 * avgInningsPitched) / 9;
  
  const difference = expectedStrikeouts - marketLine;
  
  if (difference > 1) {
    return 'over';
  } else if (difference < -1) {
    return 'under';
  }
  
  // No clear edge
  return null;
}

export { mlbPicksGenerationService };
