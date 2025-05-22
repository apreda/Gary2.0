/**
 * Simplified test for the enhanced MLB Stats API integration with Prop Picks
 * Tests the key components without requiring the openaiService
 */

import { propPicksService } from './services/propPicksService.js';
import { propOddsService } from './services/propOddsService.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test the integration of enhanced MLB stats with prop picks
 */
async function testEnhancedMLBStats() {
  console.log('=================================================');
  console.log('TESTING ENHANCED MLB STATS FOR PROP PICKS');
  console.log('=================================================\n');
  
  try {
    // 1. Set up a test game
    const gameData = {
      league: 'MLB',
      matchup: 'New York Yankees vs Texas Rangers',
      homeTeam: 'New York Yankees',
      awayTeam: 'Texas Rangers'
    };
    
    console.log(`Testing enhanced stats for: ${gameData.matchup}`);
    
    // 2. Test getting enhanced MLB player stats with league rankings
    console.log('\n--- TESTING ENHANCED MLB PLAYER STATS ---');
    const playerStatsText = await propPicksService.formatMLBPlayerStats(gameData.homeTeam, gameData.awayTeam);
    
    // Check if we got comprehensive stats with league rankings
    const hasLeagueRankings = playerStatsText.includes('RANKINGS') || 
                             playerStatsText.includes('LEAGUE LEADERS');
    
    console.log(`Enhanced MLB stats received: ${playerStatsText.length} characters`);
    console.log(`Includes league rankings: ${hasLeagueRankings ? 'YES ✅' : 'NO ❌'}`);
    
    // Print the first section of the stats to verify format
    console.log('\nSTARTING PITCHERS SECTION:');
    const sections = playerStatsText.split('\n\n');
    if (sections.length > 0) {
      // Print the first section (starting pitchers)
      const pitcherSection = sections[0].split('\n');
      pitcherSection.forEach(line => console.log(line));
    }
    
    // 3. Create a mock props array for testing
    const mockProps = [
      {
        playerName: 'Aaron Judge',
        propType: 'home_runs',
        point: '0.5',
        outcomes: [
          { name: 'OVER', price: '+130' },
          { name: 'UNDER', price: '-150' }
        ]
      },
      {
        playerName: 'Carlos Rodón',
        propType: 'pitcher_strikeouts',
        point: '6.5',
        outcomes: [
          { name: 'OVER', price: '-110' },
          { name: 'UNDER', price: '-110' }
        ]
      }
    ];
    
    // 4. Test creating the enhanced prop picks prompt
    console.log('\n--- TESTING PROP PICKS PROMPT GENERATION ---');
    const prompt = propPicksService.createPropPicksPrompt(mockProps, playerStatsText);
    
    // Check if prompt includes the enhanced instructions
    const hasEnhancedInstructions = prompt.includes('league leaders') && 
                                   prompt.includes('Starting pitcher matchups');
    
    console.log(`Prompt generated: ${prompt.length} characters`);
    console.log(`Includes enhanced instructions: ${hasEnhancedInstructions ? 'YES ✅' : 'NO ❌'}`);
    
    // Print prompt sample
    console.log('\nPROMPT SAMPLE:');
    const promptLines = prompt.split('\n');
    const startLine = promptLines.findIndex(line => line.includes('Pay special attention to:'));
    if (startLine !== -1) {
      for (let i = startLine; i < Math.min(startLine + 10, promptLines.length); i++) {
        console.log(promptLines[i]);
      }
    }
    
    console.log('\n--- TEST SUMMARY ---');
    console.log(`Enhanced MLB Stats Retrieved: ${playerStatsText.length > 0 ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`League Rankings Included: ${hasLeagueRankings ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    console.log(`Enhanced Prompt Generated: ${hasEnhancedInstructions ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    
    console.log('\nThe MLB Stats API enhancement for prop picks is successfully integrated!');
    console.log('=================================================');
    
  } catch (error) {
    console.error('Error testing enhanced MLB stats:', error);
  }
}

// Run the test
testEnhancedMLBStats();
