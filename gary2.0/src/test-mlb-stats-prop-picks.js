/**
 * Test MLB Stats API integration with Prop Picks
 * This script focuses solely on testing the MLB Stats API for player statistics in prop picks
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { propPicksService } from './services/propPicksService.js';

async function testMLBStatsForPropPicks() {
  try {
    console.log('===== TESTING MLB STATS API FOR PROP PICKS =====');
    
    // 1. Test getting MLB games for today
    const today = new Date().toISOString().slice(0, 10);
    console.log(`\n1. Getting MLB games for ${today}:`);
    
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('No MLB games found for today. Try running this test on a game day.');
      return;
    }
    
    console.log(`Found ${games.length} MLB games for today`);
    
    // Choose the first game for testing
    const game = games[0];
    const homeTeam = game.teams?.home?.team?.name;
    const awayTeam = game.teams?.away?.team?.name;
    
    if (!homeTeam || !awayTeam) {
      console.log('Unable to extract team names from game data');
      return;
    }
    
    console.log(`Selected game for testing: ${homeTeam} vs ${awayTeam}`);
    
    // 2. Test the formatMLBPlayerStats function directly
    console.log('\n2. Testing formatMLBPlayerStats function:');
    const playerStats = await propPicksService.formatMLBPlayerStats(homeTeam, awayTeam);
    
    if (!playerStats) {
      console.log('Failed to get formatted player stats');
      return;
    }
    
    console.log('Successfully retrieved formatted player stats:');
    console.log(playerStats);
    
    // 3. Test getting starting pitchers
    console.log('\n3. Getting starting pitchers for the game:');
    try {
      const startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(game.gamePk);
      
      if (startingPitchers?.homeStarter) {
        const hp = startingPitchers.homeStarter;
        console.log(`Home starter: ${hp.fullName}`);
        console.log(`Stats: ERA ${hp.seasonStats?.era || 'N/A'}, ${hp.seasonStats?.wins || 0}W-${hp.seasonStats?.losses || 0}L`);
      } else {
        console.log('No home starting pitcher found');
      }
      
      if (startingPitchers?.awayStarter) {
        const ap = startingPitchers.awayStarter;
        console.log(`Away starter: ${ap.fullName}`);
        console.log(`Stats: ERA ${ap.seasonStats?.era || 'N/A'}, ${ap.seasonStats?.wins || 0}W-${ap.seasonStats?.losses || 0}L`);
      } else {
        console.log('No away starting pitcher found');
      }
    } catch (error) {
      console.error('Error getting starting pitchers:', error.message);
    }
    
    // 4. Test getting hitter stats
    console.log('\n4. Getting hitter stats for the game:');
    try {
      const hitterStats = await mlbStatsApiService.getHitterStats(game.gamePk);
      
      console.log(`Retrieved ${hitterStats.home.length} home team hitters and ${hitterStats.away.length} away team hitters`);
      
      // Show a few sample hitters
      if (hitterStats.home.length > 0) {
        const sampleHitter = hitterStats.home[0];
        console.log(`Sample home hitter: ${sampleHitter.name}`);
        console.log(`Stats: AVG ${sampleHitter.stats.avg}, ${sampleHitter.stats.hits} H, ${sampleHitter.stats.homeRuns} HR`);
      }
      
      if (hitterStats.away.length > 0) {
        const sampleHitter = hitterStats.away[0];
        console.log(`Sample away hitter: ${sampleHitter.name}`);
        console.log(`Stats: AVG ${sampleHitter.stats.avg}, ${sampleHitter.stats.hits} H, ${sampleHitter.stats.homeRuns} HR`);
      }
    } catch (error) {
      console.error('Error getting hitter stats:', error.message);
    }
    
    // 5. Test creating a complete prop picks prompt
    console.log('\n5. Testing complete prop picks generation data:');
    const gameData = {
      league: 'MLB',
      sportKey: 'baseball_mlb',
      matchup: `${homeTeam} vs ${awayTeam}`,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      date: today
    };
    
    try {
      const mlbStats = await propPicksService.formatMLBPlayerStats(homeTeam, awayTeam);
      if (mlbStats) {
        console.log('Formatted MLB player stats successfully for prop picks prompt');
        
        // This just tests the data preparation, not the actual OpenAI call
        const prompt = propPicksService.createPropPicksPrompt(
          gameData,
          mlbStats,
          [{ player: 'Test Player', prop_type: 'hits', line: 1.5, side: 'OVER', odds: -110 }]
        );
        
        console.log('Successfully created prop picks prompt with MLB Stats API data');
        console.log('\nSample of the prompt:');
        console.log(prompt.substring(0, 500) + '...');
      }
    } catch (error) {
      console.error('Error generating prop picks prompt:', error.message);
    }
    
    console.log('\n===== MLB STATS API INTEGRATION TEST COMPLETE =====');
  } catch (error) {
    console.error('Error in MLB Stats API test:', error);
  }
}

// Run the test
testMLBStatsForPropPicks();
