/**
 * Test script to verify MLB odds extraction and usage
 */
import { oddsService } from './src/services/oddsService.js';
import { combinedMlbService } from './src/services/combinedMlbService.js';
import { picksService as enhancedPicksService } from './src/services/picksService.enhanced.js';

async function testMlbOddsExtraction() {
  console.log('🧪 Testing MLB Odds Extraction and Usage\n');
  
  try {
    // 1. Test odds service for MLB
    console.log('1️⃣ Testing Odds Service for MLB...');
    const mlbGames = await oddsService.getUpcomingGames('baseball_mlb');
    console.log(`Found ${mlbGames.length} MLB games from odds service`);
    
    if (mlbGames.length > 0) {
      const testGame = mlbGames[0];
      console.log(`\nTest Game: ${testGame.away_team} @ ${testGame.home_team}`);
      console.log(`Game ID: ${testGame.id}`);
      console.log(`Commence Time: ${testGame.commence_time}`);
      console.log(`Bookmakers: ${testGame.bookmakers?.length || 0}`);
      
      if (testGame.bookmakers && testGame.bookmakers.length > 0) {
        const bookmaker = testGame.bookmakers[0];
        console.log(`\nFirst Bookmaker: ${bookmaker.title}`);
        console.log(`Markets: ${bookmaker.markets?.map(m => m.key).join(', ') || 'None'}`);
        
        // Check moneyline odds
        const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
        if (h2hMarket) {
          console.log('\n💰 Moneyline Odds:');
          h2hMarket.outcomes.forEach(outcome => {
            console.log(`  ${outcome.name}: ${outcome.price > 0 ? '+' : ''}${outcome.price}`);
          });
        }
        
        // Check spread odds
        const spreadMarket = bookmaker.markets?.find(m => m.key === 'spreads');
        if (spreadMarket) {
          console.log('\n📊 Spread Odds:');
          spreadMarket.outcomes.forEach(outcome => {
            console.log(`  ${outcome.name} ${outcome.point > 0 ? '+' : ''}${outcome.point}: ${outcome.price > 0 ? '+' : ''}${outcome.price}`);
          });
        }
      }
      
      // 2. Test combined MLB service odds extraction
      console.log('\n\n2️⃣ Testing Combined MLB Service Odds Extraction...');
      const gameData = await combinedMlbService.getComprehensiveGameData(
        testGame.home_team, 
        testGame.away_team
      );
      
      console.log(`\nCombined Service Results:`);
      console.log(`Has Odds: ${!!gameData.odds}`);
      console.log(`Odds Bookmakers: ${gameData.odds?.bookmakers?.length || 0}`);
      
      if (gameData.odds?.bookmakers?.length > 0) {
        const bookmaker = gameData.odds.bookmakers[0];
        console.log(`Bookmaker: ${bookmaker.title}`);
        console.log(`Markets: ${bookmaker.markets?.map(m => m.key).join(', ') || 'None'}`);
        
        // Test team name matching
        const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
        if (h2hMarket) {
          console.log('\n🎯 Team Name Matching Test:');
          console.log(`Looking for: ${testGame.home_team} and ${testGame.away_team}`);
          console.log(`Available teams: ${h2hMarket.outcomes?.map(o => o.name).join(', ')}`);
          
          const homeMatch = h2hMarket.outcomes.find(o => 
            o.name === testGame.home_team || 
            o.name.includes(testGame.home_team) || 
            testGame.home_team.includes(o.name)
          );
          const awayMatch = h2hMarket.outcomes.find(o => 
            o.name === testGame.away_team || 
            o.name.includes(testGame.away_team) || 
            testGame.away_team.includes(o.name)
          );
          
          console.log(`Home team match: ${homeMatch ? `${homeMatch.name} (${homeMatch.price})` : 'NOT FOUND'}`);
          console.log(`Away team match: ${awayMatch ? `${awayMatch.name} (${awayMatch.price})` : 'NOT FOUND'}`);
        }
      }
      
      // 3. Test enhanced picks service
      console.log('\n\n3️⃣ Testing Enhanced Picks Service...');
      const picks = await enhancedPicksService.generateMlbNormalPicks([testGame], new Date().toISOString().slice(0, 10));
      
      if (picks.length > 0) {
        const pick = picks[0];
        console.log(`\n✅ Generated Pick:`);
        console.log(`Analysis available: ${!!pick.analysis}`);
        
        if (pick.analysis?.rawOpenAIOutput) {
          const output = pick.analysis.rawOpenAIOutput;
          console.log(`Pick: ${output.pick || 'Not found'}`);
          console.log(`Odds: ${output.odds || 'Not found'}`);
          console.log(`Type: ${output.type || 'Not found'}`);
          console.log(`Confidence: ${output.confidence || 'Not found'}`);
          
          // Check if odds are the default fallbacks
          if (output.odds === '-150' || output.odds === '-110') {
            console.log('⚠️  WARNING: Using default fallback odds, real odds may not be extracted properly');
          } else {
            console.log('✅ SUCCESS: Using real odds from API');
          }
        }
      } else {
        console.log('❌ No picks generated');
      }
      
    } else {
      console.log('❌ No MLB games found to test');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testMlbOddsExtraction().catch(console.error); 