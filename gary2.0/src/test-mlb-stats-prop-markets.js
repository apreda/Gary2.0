/**
 * Test MLB Stats API and Prop Markets
 * This script tests:
 * 1. MLB Stats API functionality that replaced SportsDB
 * 2. The problematic prop markets (batter_strikeouts, pitcher_outs, pitcher_record_a_win)
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { propPicksService } from './services/propPicksService.js';
import { propOddsService } from './services/propOddsService.js';
import { configLoader } from './services/configLoader.js';
import { oddsService } from './services/oddsService.js';

async function testMLBStatsAPI() {
  console.log('===== TESTING MLB STATS API (REPLACEMENT FOR SPORTSDB) =====');
  
  try {
    // Get today's date
    const today = new Date().toISOString().slice(0, 10);
    console.log(`Testing for date: ${today}`);
    
    // 1. Test getting games
    console.log('\n1. Getting MLB games for today:');
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('No MLB games found for today');
      return;
    }
    
    console.log(`Found ${games.length} MLB games for today`);
    
    // Select the first game for testing
    const game = games[0];
    console.log(`Selected game: ${game.teams?.home?.team?.name} vs ${game.teams?.away?.team?.name}, Game ID: ${game.gamePk}`);
    
    const homeTeam = game.teams?.home?.team?.name;
    const awayTeam = game.teams?.away?.team?.name;
    
    // 2. Test getting starting pitchers
    console.log('\n2. Getting starting pitchers:');
    try {
      const startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(game.gamePk);
      console.log('Starting pitchers retrieved successfully:');
      
      if (startingPitchers?.homeStarter) {
        console.log(`Home starter: ${startingPitchers.homeStarter.fullName} (ID: ${startingPitchers.homeStarter.id})`);
        
        // Get pitcher stats to validate
        const homeStats = startingPitchers.homeStarter.seasonStats || {};
        console.log(`Home pitcher stats: ERA ${homeStats.era}, ${homeStats.wins}W-${homeStats.losses}L, ${homeStats.inningsPitched} IP`);
      } else {
        console.log('No home starting pitcher found');
      }
      
      if (startingPitchers?.awayStarter) {
        console.log(`Away starter: ${startingPitchers.awayStarter.fullName} (ID: ${startingPitchers.awayStarter.id})`);
        
        // Get pitcher stats to validate
        const awayStats = startingPitchers.awayStarter.seasonStats || {};
        console.log(`Away pitcher stats: ERA ${awayStats.era}, ${awayStats.wins}W-${awayStats.losses}L, ${awayStats.inningsPitched} IP`);
      } else {
        console.log('No away starting pitcher found');
      }
    } catch (error) {
      console.error('Error getting starting pitchers:', error.message);
    }
    
    // 3. Test getting hitter stats
    console.log('\n3. Getting hitter stats:');
    try {
      const hitterStats = await mlbStatsApiService.getHitterStats(game.gamePk);
      
      console.log(`Retrieved ${hitterStats.home.length} home team hitters and ${hitterStats.away.length} away team hitters`);
      
      // Show sample hitter data
      if (hitterStats.home.length > 0) {
        const sampleHitter = hitterStats.home[0];
        console.log(`Sample home hitter: ${sampleHitter.name} (${sampleHitter.position})`);
        console.log(`Stats: AVG ${sampleHitter.stats.avg}, ${sampleHitter.stats.hits} H, ${sampleHitter.stats.homeRuns} HR, ${sampleHitter.stats.rbi} RBI`);
      }
      
      if (hitterStats.away.length > 0) {
        const sampleHitter = hitterStats.away[0];
        console.log(`Sample away hitter: ${sampleHitter.name} (${sampleHitter.position})`);
        console.log(`Stats: AVG ${sampleHitter.stats.avg}, ${sampleHitter.stats.hits} H, ${sampleHitter.stats.homeRuns} HR, ${sampleHitter.stats.rbi} RBI`);
      }
    } catch (error) {
      console.error('Error getting hitter stats:', error.message);
    }
    
    // 4. Test the formatMLBPlayerStats function
    console.log('\n4. Testing the formatMLBPlayerStats function:');
    try {
      const formattedStats = await propPicksService.formatMLBPlayerStats(homeTeam, awayTeam);
      
      if (formattedStats) {
        console.log('Successfully generated formatted player stats:');
        console.log(formattedStats.substring(0, 300) + '...'); // Show first 300 chars
      } else {
        console.log('No formatted stats returned');
      }
    } catch (error) {
      console.error('Error formatting MLB player stats:', error.message);
    }
    
    console.log('\n===== MLB STATS API TESTING COMPLETE =====');
    
  } catch (error) {
    console.error('Error testing MLB Stats API:', error);
  }
}

async function testProblemPropMarkets() {
  console.log('\n===== TESTING PROBLEMATIC PROP MARKETS =====');
  
  try {
    // Get API key
    const apiKey = await configLoader.getOddsApiKey();
    if (!apiKey) {
      console.error('⚠️ ODDS API KEY IS MISSING - Cannot test prop markets');
      return;
    }
    
    // Define the problematic markets
    const problematicMarkets = ['batter_strikeouts', 'pitcher_outs', 'pitcher_record_a_win'];
    const sport = 'baseball_mlb';
    
    // Get a list of MLB games
    const games = await oddsService.getUpcomingGames(sport);
    if (!games || games.length === 0) {
      console.log('No upcoming MLB games found');
      return;
    }
    
    console.log(`Found ${games.length} upcoming MLB games`);
    
    // Use first game for testing
    const game = games[0];
    console.log(`Using game: ${game.home_team} vs ${game.away_team} (ID: ${game.id})`);
    
    // Test the raw endpoint for each market directly
    const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
    
    for (const market of problematicMarkets) {
      console.log(`\nTesting market: ${market}`);
      
      try {
        const url = `${ODDS_API_BASE_URL}/sports/${sport}/events/${game.id}/odds?apiKey=${apiKey}&regions=us&markets=${market}&oddsFormat=american`;
        console.log(`API URL: ${url.replace(apiKey, 'API_KEY_HIDDEN')}`);
        
        const response = await fetch(url);
        const responseText = await response.text();
        
        if (!response.ok) {
          console.log(`❌ API returned error status ${response.status} for ${market}`);
          console.log(`Response: ${responseText}`);
          continue;
        }
        
        // Try to parse the response
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.log(`❌ Failed to parse JSON response for ${market}: ${e.message}`);
          console.log(`Raw response: ${responseText}`);
          continue;
        }
        
        // Check if we have bookmakers
        if (!data.bookmakers || data.bookmakers.length === 0) {
          console.log(`⚠️ No bookmakers returned for ${market}`);
          continue;
        }
        
        // Check if any bookmakers have this market
        let totalOutcomes = 0;
        let marketFound = false;
        
        for (const bookmaker of data.bookmakers) {
          for (const bkMarket of bookmaker.markets) {
            if (bkMarket.key === market) {
              marketFound = true;
              totalOutcomes += bkMarket.outcomes.length;
              
              console.log(`Found ${bkMarket.outcomes.length} outcomes at ${bookmaker.title}`);
              
              // Show sample outcomes
              if (bkMarket.outcomes.length > 0) {
                const outcome = bkMarket.outcomes[0];
                console.log(`Sample outcome: ${outcome.description}, ${outcome.name}, ${outcome.point}, ${outcome.price}`);
              }
            }
          }
        }
        
        if (!marketFound) {
          console.log(`⚠️ Market ${market} not found in any bookmaker data`);
        } else {
          console.log(`✅ Market ${market} found with ${totalOutcomes} total outcomes`);
        }
        
        // Check how this market is processed in propOddsService
        console.log(`\nNow tracing how ${market} is processed in propOddsService:`);
        
        // Use the propOddsService directly to get player props
        const propOdds = await propOddsService.getPlayerPropOdds(sport, game.home_team, game.away_team);
        
        // Check if any props of this type exist in the returned data
        const matchingProps = propOdds.filter(prop => prop.prop_type === market.replace('batter_', '').replace('pitcher_', ''));
        
        if (matchingProps.length === 0) {
          console.log(`❌ No ${market} props found in the processed data`);
        } else {
          console.log(`✅ Found ${matchingProps.length} ${market} props in the processed data`);
          
          // Display a sample
          if (matchingProps.length > 0) {
            const sample = matchingProps[0];
            console.log(`Sample: ${sample.player}, ${sample.prop_type}, ${sample.line}, ${sample.side || 'N/A'}, ${sample.odds || 'N/A'}`);
          }
        }
        
      } catch (error) {
        console.error(`Error testing ${market}:`, error);
      }
    }
    
    console.log('\n===== PROBLEMATIC PROP MARKETS TESTING COMPLETE =====');
  } catch (error) {
    console.error('Error testing problematic prop markets:', error);
  }
}

// Run both tests
async function runTests() {
  await testMLBStatsAPI();
  await testProblemPropMarkets();
}

runTests();
