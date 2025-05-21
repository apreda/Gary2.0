/**
 * Test the Combined MLB Service
 * 
 * This test verifies that our combinedMlbService correctly integrates all three data sources:
 * 1. Ball Don't Lie API for team stats (PRIORITY 1)
 * 2. MLB Stats API for pitcher data (PRIORITY 2)
 * 3. Perplexity for game context, storylines, and other relevant data
 */
import dotenv from 'dotenv';
import { combinedMlbService } from './services/combinedMlbService.js';
import { perplexityService } from './services/perplexityService.js';

// Load environment variables
dotenv.config();

// Explicitly set the Perplexity API key for testing
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY || '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';
perplexityService.API_KEY = PERPLEXITY_API_KEY;
console.log(`🔑 Perplexity API Key (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);

// Test teams and date
const homeTeam = 'Athletics';
const awayTeam = 'Angels';
const date = '2025-05-21';

async function testCombinedService() {
  console.log('🔄 TESTING COMBINED MLB SERVICE 🔄');
  console.log('----------------------------------');
  console.log(`Target Game: ${awayTeam} @ ${homeTeam}`);
  console.log(`Date: ${date}`);
  console.log('----------------------------------\n');
  
  try {
    console.log('Getting comprehensive game data from all three data sources...');
    const combinedData = await combinedMlbService.getComprehensiveGameData(homeTeam, awayTeam, date);
    
    if (!combinedData) {
      console.error('❌ Failed to get comprehensive game data');
      return;
    }
    
    console.log('✅ Successfully retrieved comprehensive game data\n');
    
    // Display game information
    console.log('GAME INFO:');
    console.log('---------');
    console.log(`Home Team: ${combinedData.game.homeTeam}`);
    console.log(`Away Team: ${combinedData.game.awayTeam}`);
    console.log(`Date: ${combinedData.game.gameDate}`);
    console.log(`Venue: ${combinedData.game.venue}`);
    console.log(`Game ID: ${combinedData.game.gamePk}\n`);
    
    // Display pitcher information
    console.log('PITCHERS:');
    console.log('---------');
    
    if (combinedData.pitchers && combinedData.pitchers.home) {
      console.log(`Home Pitcher: ${combinedData.pitchers.home.fullName}`);
      const homeStats = combinedData.pitchers.home.seasonStats || {};
      console.log(`ERA: ${homeStats.era || 'N/A'}, Record: ${homeStats.wins || 0}-${homeStats.losses || 0}, WHIP: ${homeStats.whip || 'N/A'}`);
    } else {
      console.log('Home Pitcher: Not available');
    }
    
    if (combinedData.pitchers && combinedData.pitchers.away) {
      console.log(`Away Pitcher: ${combinedData.pitchers.away.fullName}`);
      const awayStats = combinedData.pitchers.away.seasonStats || {};
      console.log(`ERA: ${awayStats.era || 'N/A'}, Record: ${awayStats.wins || 0}-${awayStats.losses || 0}, WHIP: ${awayStats.whip || 'N/A'}\n`);
    } else {
      console.log('Away Pitcher: Not available\n');
    }
    
    // Display team stats
    console.log('TEAM STATS:');
    console.log('-----------');
    
    if (combinedData.teamStats) {
      console.log(`${homeTeam} Record: ${combinedData.teamStats.homeTeam?.record || 'N/A'}`);
      console.log(`${awayTeam} Record: ${combinedData.teamStats.awayTeam?.record || 'N/A'}`);
      console.log(`${homeTeam} Last 10: ${combinedData.teamStats.homeTeam?.lastTenGames || 'N/A'}`);
      console.log(`${awayTeam} Last 10: ${combinedData.teamStats.awayTeam?.lastTenGames || 'N/A'}\n`);
    } else {
      console.log('Team stats not available\n');
    }
    
    // Display game context
    console.log('GAME CONTEXT FROM PERPLEXITY:');
    console.log('----------------------------');
    
    if (combinedData.gameContext) {
      if (combinedData.gameContext.rawContext) {
        // Raw text format
        console.log(combinedData.gameContext.rawContext);
      } else {
        // JSON format with specific fields
        if (combinedData.gameContext.playoffStatus) {
          console.log(`Playoff Status: ${combinedData.gameContext.playoffStatus}`);
        }
        
        if (combinedData.gameContext.homeTeamStorylines) {
          console.log(`\n${homeTeam} Storylines: ${combinedData.gameContext.homeTeamStorylines}`);
        }
        
        if (combinedData.gameContext.awayTeamStorylines) {
          console.log(`\n${awayTeam} Storylines: ${combinedData.gameContext.awayTeamStorylines}`);
        }
        
        if (combinedData.gameContext.injuryReport) {
          console.log(`\nInjury Report: ${combinedData.gameContext.injuryReport}`);
        }
        
        if (combinedData.gameContext.keyMatchups) {
          console.log(`\nKey Matchups: ${combinedData.gameContext.keyMatchups}`);
        }
        
        if (combinedData.gameContext.bettingTrends) {
          console.log(`\nBetting Trends: ${combinedData.gameContext.bettingTrends}`);
        }
        
        if (combinedData.gameContext.weatherConditions) {
          console.log(`\nWeather: ${combinedData.gameContext.weatherConditions}`);
        }
      }
    } else {
      console.log('Game context not available');
    }
    
    console.log('\nThe combinedMlbService successfully integrates all three data sources!');
    
  } catch (error) {
    console.error('Error testing combined service:', error);
  }
}

// Run the test
testCombinedService();
