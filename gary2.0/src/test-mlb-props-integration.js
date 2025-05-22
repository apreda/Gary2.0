/**
 * Test MLB Stats API integration with Prop Picks
 * This script tests the MLB Stats API data retrieval for prop picks generation
 */
import { propPicksService } from './services/propPicksService.js';
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { propOddsService } from './services/propOddsService.js';
import { configLoader } from './services/configLoader.js';
import { oddsService } from './services/oddsService.js';

async function testMLBPropsIntegration() {
  try {
    console.log('===== TESTING MLB STATS API INTEGRATION WITH PROP PICKS =====');

    // 1. Test MLB Stats API directly - get today's games
    console.log('\n1. Testing MLB Stats API - Getting today\'s games:');
    const today = new Date().toISOString().slice(0, 10);
    const games = await mlbStatsApiService.getGamesByDate(today);
    
    if (!games || games.length === 0) {
      console.log('No MLB games found for today. Try another date or check the API status.');
      return;
    }
    
    console.log(`Found ${games.length} MLB games scheduled for today`);
    
    // Select the first game for testing
    const targetGame = games[0];
    console.log(`Selected game for testing: ${targetGame.teams?.home?.team?.name} vs ${targetGame.teams?.away?.team?.name}`);
    
    // 2. Test the formatMLBPlayerStats function
    console.log('\n2. Testing formatMLBPlayerStats function:');
    const homeTeam = targetGame.teams?.home?.team?.name;
    const awayTeam = targetGame.teams?.away?.team?.name;
    
    if (!homeTeam || !awayTeam) {
      console.log('Unable to extract team names from game data');
      return;
    }
    
    const formattedStats = await propPicksService.formatMLBPlayerStats(homeTeam, awayTeam);
    console.log('MLB player stats formatted successfully:');
    console.log(formattedStats || 'No formatted stats returned');
    
    // 3. Test prop odds service for this game
    console.log('\n3. Testing prop odds service for this game:');
    
    // Get the sportKey for MLB
    const sportKey = 'baseball_mlb';
    
    // Get prop odds data
    const propOddsData = await propOddsService.getPlayerPropOdds(
      sportKey,
      homeTeam,
      awayTeam
    );
    
    if (!propOddsData || propOddsData.length === 0) {
      console.log('No prop odds data available for this matchup');
    } else {
      console.log(`Retrieved ${propOddsData.length} prop odds entries`);
      
      // Group props by market for analysis
      const marketCounts = {};
      propOddsData.forEach(prop => {
        if (!marketCounts[prop.prop_type]) {
          marketCounts[prop.prop_type] = 0;
        }
        marketCounts[prop.prop_type]++;
      });
      
      console.log('Prop markets breakdown:');
      Object.entries(marketCounts).forEach(([market, count]) => {
        console.log(`- ${market}: ${count} props`);
      });
      
      // Check for the problematic markets
      const problematicMarkets = ['batter_strikeouts', 'pitcher_outs', 'pitcher_record_a_win'];
      console.log('\nChecking for problematic markets:');
      problematicMarkets.forEach(market => {
        const found = propOddsData.some(prop => prop.prop_type === market);
        console.log(`- ${market}: ${found ? 'Present' : 'Not found'} in props data`);
      });
    }
    
    // 4. Test complete prop picks generation
    console.log('\n4. Testing complete prop picks generation:');
    const gameData = {
      league: 'MLB',
      sportKey: sportKey,
      matchup: `${homeTeam} vs ${awayTeam}`,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      date: today
    };
    
    const propPicks = await propPicksService.generatePropBets(gameData);
    
    if (!propPicks || propPicks.length === 0) {
      console.log('No prop picks were generated');
    } else {
      console.log(`Successfully generated ${propPicks.length} prop picks`);
      propPicks.forEach((pick, index) => {
        console.log(`\nPick ${index + 1}:`);
        console.log(`Player: ${pick.player}`);
        console.log(`Pick: ${pick.pick}`);
        console.log(`Confidence: ${pick.confidence}`);
        console.log(`Rationale: ${pick.rationale.substring(0, 100)}...`);
      });
    }
    
    console.log('\n===== MLB PROPS INTEGRATION TEST COMPLETE =====');
  } catch (error) {
    console.error('Error testing MLB props integration:', error);
  }
}

// Now let's check the prop markets processing to find the issue
async function investigatePropMarkets() {
  try {
    console.log('\n===== INVESTIGATING PROP MARKETS ISSUE =====');
    
    // Get the propOddsService internal processing logic
    console.log('Checking prop markets processing in propOddsService:');
    
    // Test with a specific MLB game
    const sportKey = 'baseball_mlb';
    const homeTeam = 'Yankees'; // Example teams - adjust if needed
    const awayTeam = 'Red Sox';
    
    // Get raw prop data from the API
    console.log(`\nGetting raw prop data for ${homeTeam} vs ${awayTeam}:`);
    
    // Use the internal functions to see what's happening
    const propData = await propOddsService.getRawPlayerPropOdds(sportKey, homeTeam, awayTeam);
    
    if (!propData) {
      console.log('No raw prop data available');
      return;
    }
    
    // Check if the problematic markets exist in the raw data
    const problematicMarkets = ['batter_strikeouts', 'pitcher_outs', 'pitcher_record_a_win'];
    console.log('\nChecking if problematic markets exist in raw API data:');
    
    const marketsInRawData = new Set();
    if (propData.length > 0) {
      propData.forEach(item => {
        if (item.markets) {
          Object.keys(item.markets).forEach(market => {
            marketsInRawData.add(market);
          });
        }
      });
    }
    
    console.log('Markets found in raw data:', Array.from(marketsInRawData));
    
    problematicMarkets.forEach(market => {
      console.log(`- ${market}: ${marketsInRawData.has(market) ? 'Present in raw data' : 'Not found in raw data'}`);
    });
    
    // Analyze how props are processed
    console.log('\nAnalyzing the prop processing pipeline:');
    console.log('1. Check if the problematic markets are being recognized in the propOddsService');
    console.log('2. Check if there are specific filters that might be excluding these props');
    console.log('3. Check the odds values to see if they are being filtered by the -150 threshold');
    
    console.log('\n===== INVESTIGATION COMPLETE =====');
  } catch (error) {
    console.error('Error investigating prop markets:', error);
  }
}

// Direct test for problematic markets
async function testProblematicMarkets() {
  try {
    console.log('\n===== TESTING PROBLEMATIC PROP MARKETS DIRECTLY =====');
    
    // Set up test parameters
    const sport = 'baseball_mlb';
    const problematicMarkets = ['batter_strikeouts', 'pitcher_outs', 'pitcher_record_a_win'];
    
    // Get API key
    const apiKey = await configLoader.getOddsApiKey();
    if (!apiKey) {
      console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch player prop odds');
      return;
    }
    
    // Get upcoming games
    const games = await oddsService.getUpcomingGames(sport);
    if (!games || games.length === 0) {
      console.log('No upcoming MLB games found');
      return;
    }
    
    console.log(`Found ${games.length} upcoming MLB games`);
    const game = games[0]; // Use the first game for testing
    
    console.log(`Selected game: ${game.home_team} vs ${game.away_team}, ID: ${game.id}`);
    
    const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
    
    // Test each problematic market directly
    for (const market of problematicMarkets) {
      console.log(`\nTesting market directly: ${market}`);
      
      try {
        // Make direct API call to check if the market exists
        const response = await fetch(`${ODDS_API_BASE_URL}/sports/${sport}/events/${game.id}/odds?apiKey=${apiKey}&regions=us&markets=${market}&oddsFormat=american`);
        
        if (!response.ok) {
          console.log(`❌ API returned error status ${response.status} for market: ${market}`);
          console.log(`Response: ${await response.text()}`);
          continue;
        }
        
        const data = await response.json();
        
        // Check if we got valid data with bookmakers
        if (!data || !data.bookmakers || data.bookmakers.length === 0) {
          console.log(`⚠️ No bookmakers available for market: ${market}`);
          continue;
        }
        
        // Look through bookmakers for this market
        let foundMarket = false;
        let outcomesCount = 0;
        
        for (const bookmaker of data.bookmakers) {
          for (const bkMarket of bookmaker.markets) {
            if (bkMarket.key === market) {
              foundMarket = true;
              outcomesCount += bkMarket.outcomes.length;
              
              console.log(`Found ${bkMarket.outcomes.length} outcomes for ${market} at ${bookmaker.title}:`);
              
              // Log the first few outcomes to see what's there
              bkMarket.outcomes.slice(0, 3).forEach(outcome => {
                console.log(`  - ${outcome.description || 'Unknown'}: ${outcome.name} ${outcome.point} (${outcome.price})`);
              });
            }
          }
        }
        
        if (!foundMarket) {
          console.log(`⚠️ Market ${market} exists in API response but not found in any bookmaker markets`);
        } else {
          console.log(`✅ Market ${market} found with ${outcomesCount} total outcomes`);
        }
        
      } catch (error) {
        console.error(`Error testing market ${market}:`, error.message);
      }
    }
    
    console.log('\n===== DIRECT MARKET TESTING COMPLETE =====');
  } catch (error) {
    console.error('Error in problematic markets test:', error);
  }
}

// Run the tests
async function runAllTests() {
  await testMLBPropsIntegration();
  await investigatePropMarkets();
  await testProblematicMarkets();
}

runAllTests();
