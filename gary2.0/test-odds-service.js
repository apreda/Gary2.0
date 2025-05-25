import { oddsService } from './src/services/oddsService.js';

async function testOddsService() {
  console.log('🏀 Testing NBA odds service...\n');
  
  try {
    console.log('Fetching NBA games...');
    const nbaGames = await oddsService.getUpcomingGames('basketball_nba');
    
    console.log(`Found ${nbaGames.length} NBA games:`);
    
    if (nbaGames.length === 0) {
      console.log('❌ No NBA games found');
      
      // Try other sports to see if the service is working
      console.log('\nTrying MLB...');
      const mlbGames = await oddsService.getUpcomingGames('baseball_mlb');
      console.log(`Found ${mlbGames.length} MLB games`);
      
      console.log('\nTrying NHL...');
      const nhlGames = await oddsService.getUpcomingGames('icehockey_nhl');
      console.log(`Found ${nhlGames.length} NHL games`);
      
    } else {
      nbaGames.forEach((game, index) => {
        console.log(`\n${index + 1}. ${game.away_team} @ ${game.home_team}`);
        console.log(`   Time: ${new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
        console.log(`   Bookmakers: ${game.bookmakers?.length || 0}`);
        
        if (game.bookmakers && game.bookmakers.length > 0) {
          const bookmaker = game.bookmakers[0];
          console.log(`   Markets: ${bookmaker.markets?.map(m => m.key).join(', ') || 'None'}`);
          
          // Show moneyline odds if available
          const moneylineMarket = bookmaker.markets?.find(m => m.key === 'h2h');
          if (moneylineMarket) {
            console.log(`   Moneyline:`);
            moneylineMarket.outcomes.forEach(outcome => {
              console.log(`     ${outcome.name}: ${outcome.price}`);
            });
          }
          
          // Show spread odds if available
          const spreadMarket = bookmaker.markets?.find(m => m.key === 'spreads');
          if (spreadMarket) {
            console.log(`   Spread:`);
            spreadMarket.outcomes.forEach(outcome => {
              console.log(`     ${outcome.name} ${outcome.point}: ${outcome.price}`);
            });
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing odds service:', error);
  } finally {
    console.log('\n🏁 Test completed');
    process.exit(0);
  }
}

testOddsService(); 