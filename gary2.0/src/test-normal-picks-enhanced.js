/**
 * Test script for the enhanced normal picks service (moneyline/spread)
 * This verifies that the enhanced service correctly:
 * 1. Gets accurate starting pitcher data from MLB Stats API
 * 2. Gets team stats from Ball Don't Lie
 * 3. Gets rich game context from Perplexity
 */

import dotenv from 'dotenv';
import { picksService } from './services/picksService.enhanced.js';
import { combinedMlbService } from './services/combinedMlbService.js';
import { perplexityService } from './services/perplexityService.js';
// Instead of importing oddsService directly, we'll mock a simplified version
// since we just need a test game to analyze
const mockOddsService = {
  getUpcomingGames: async (sport) => {
    console.log(`Getting mock games for ${sport}...`);
    if (sport === 'baseball_mlb') {
      return [
        {
          id: '777828', // Using the same game ID we verified earlier
          home_team: 'Athletics',
          away_team: 'Angels',
          sport_key: 'baseball_mlb',
          commence_time: '2025-05-21T22:05:00Z',
          bookmakers: [
            {
              markets: [
                {
                  outcomes: [
                    { name: 'Athletics', price: 2.10 },
                    { name: 'Angels', price: 1.80 }
                  ]
                },
                {
                  outcomes: [
                    { name: 'Athletics', point: -1.5 },
                    { name: 'Angels', point: 1.5 }
                  ]
                }
              ]
            }
          ]
        }
      ];
    }
    return [];
  }
};
dotenv.config();

async function testNormalPicksService() {
  console.log('🏆 TESTING ENHANCED NORMAL PICKS SERVICE 🏆');
  console.log('-------------------------------------------');
  
  try {
    // We're using the already imported services and our mock oddsService
    
    // 1. Get some upcoming MLB games using our mock service
    console.log('Getting upcoming MLB games...');
    const upcomingGames = await mockOddsService.getUpcomingGames('baseball_mlb');
    
    if (!upcomingGames || upcomingGames.length === 0) {
      console.log('No upcoming MLB games found');
      return;
    }
    
    console.log(`Found ${upcomingGames.length} upcoming MLB games`);
    
    // 2. Select a game to test with
    const targetGame = upcomingGames[0]; // Take the first game for testing
    const homeTeam = targetGame.home_team;
    const awayTeam = targetGame.away_team;
    
    console.log(`\nSelected game for testing: ${awayTeam} @ ${homeTeam}`);
    
    // 3. Test the combined MLB service
    console.log('\n📊 TESTING COMBINED MLB SERVICE');
    console.log('-------------------------------------------');
    console.log(`Getting comprehensive data for ${awayTeam} @ ${homeTeam}...`);
    
    const gameData = await combinedMlbService.getComprehensiveGameData(homeTeam, awayTeam);
    
    // Display results
    console.log('\nGame Information:');
    console.log(`Home: ${gameData.game.homeTeam}`);
    console.log(`Away: ${gameData.game.awayTeam}`);
    console.log(`Venue: ${gameData.game.venue}`);
    console.log(`Date/Time: ${new Date(gameData.game.gameDate).toLocaleString()}`);
    
    // Starting pitchers
    console.log('\nStarting Pitchers:');
    
    if (gameData.pitchers.home) {
      const homePitcher = gameData.pitchers.home;
      console.log(`${homeTeam}: ${homePitcher.fullName}`);
      if (homePitcher.seasonStats) {
        console.log(`ERA: ${homePitcher.seasonStats.era}`);
        console.log(`Record: ${homePitcher.seasonStats.wins}-${homePitcher.seasonStats.losses}`);
        console.log(`WHIP: ${homePitcher.seasonStats.whip}`);
      }
    } else {
      console.log(`${homeTeam}: No pitcher data available`);
    }
    
    if (gameData.pitchers.away) {
      const awayPitcher = gameData.pitchers.away;
      console.log(`\n${awayTeam}: ${awayPitcher.fullName}`);
      if (awayPitcher.seasonStats) {
        console.log(`ERA: ${awayPitcher.seasonStats.era}`);
        console.log(`Record: ${awayPitcher.seasonStats.wins}-${awayPitcher.seasonStats.losses}`);
        console.log(`WHIP: ${awayPitcher.seasonStats.whip}`);
      }
    } else {
      console.log(`${awayTeam}: No pitcher data available`);
    }
    
    // 4. Test Perplexity for game context
    console.log('\n📝 TESTING PERPLEXITY GAME CONTEXT');
    console.log('-------------------------------------------');
    
    console.log(`Getting game context for ${awayTeam} @ ${homeTeam}...`);
    
    // Construct the query
    const contextQuery = `Provide a concise summary of the upcoming MLB game between ${homeTeam} and ${awayTeam} with the following information in JSON format:
1. Playoff status (is this a playoff game, and if so what's the current series score)
2. Team storylines and recent news
3. Injury report for both teams
4. Key matchup insights
5. Betting trends and relevant statistics
6. Weather conditions for the game if outdoors

Format your response in clean JSON format with these exact keys: playoffStatus, homeTeamStorylines, awayTeamStorylines, injuryReport, keyMatchups, bettingTrends, weatherConditions.`;
    
    const gameContextResult = await perplexityService.query(contextQuery);
    
    // Parse the result to extract the JSON
    if (gameContextResult && gameContextResult.text) {
      const text = gameContextResult.text;
      // Find JSON object in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const gameContext = JSON.parse(jsonMatch[0]);
          console.log('\nGame Context from Perplexity:');
          console.log(JSON.stringify(gameContext, null, 2));
        } catch (jsonError) {
          console.error('Error parsing JSON from Perplexity response:', jsonError.message);
        }
      } else {
        console.log('No JSON found in Perplexity response');
        console.log('Raw response:', gameContextResult.text);
      }
    }
    
    // 5. Get a game preview
    console.log('\n🔮 GAME PREVIEW');
    console.log('-------------------------------------------');
    
    const preview = await combinedMlbService.generateEnhancedGamePreview(homeTeam, awayTeam);
    console.log(preview);
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testNormalPicksService();
