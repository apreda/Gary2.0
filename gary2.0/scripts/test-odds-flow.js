import 'dotenv/config';
import { oddsService } from '../src/services/oddsService.js';
import { configLoader } from '../src/services/configLoader.js';

async function testOddsFlow() {
    console.log('🧪 Starting Odds Flow Test...');

    // Load config to ensure API keys are present
    await configLoader.load();

    try {
        // Test NBA (Exempted from BDL, should use Odds API directly)
        console.log('\n🏀 Testing NBA Odds Fetching (Should use Odds API Direct)...');
        const nbaGames = await oddsService.getUpcomingGames('basketball_nba');

        console.log(`\n✅ NBA Results: ${nbaGames.length} games found.`);
        if (nbaGames.length > 0) {
            const sample = nbaGames[0];
            console.log(`   Sample Game: ${sample.away_team} @ ${sample.home_team}`);
            console.log(`   Source: ${sample.source || 'The Odds API (Direct)'}`);
            console.log(`   Bookmakers: ${sample.bookmakers?.length || 0}`);

            if (sample.bookmakers?.length > 0) {
                console.log(`   Sample Market: ${JSON.stringify(sample.bookmakers[0].markets[0]?.key)}`);
            } else {
                console.warn('   ⚠️ No bookmakers found for sample game!');
            }
        }

        // Test another sport (e.g. NFL or MLB) to ensure generic logic works
        // Note: NFL might be empty if no games, but let's try.
        console.log('\n🏈 Testing NFL Odds Fetching...');
        const nflGames = await oddsService.getUpcomingGames('americanfootball_nfl');
        console.log(`\n✅ NFL Results: ${nflGames.length} games found.`);

    } catch (error) {
        console.error('❌ Test Failed:', error);
    }

    console.log('\n🧪 Test Complete.');
    process.exit(0);
}

testOddsFlow();
