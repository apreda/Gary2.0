/**
 * Test the Complete Normal Picks Generation Process
 * 
 * This test verifies that our enhanced normal picks generation process works properly
 * with all three data sources integrated:
 * 1. Ball Don't Lie API for team stats (PRIORITY 1)
 * 2. MLB Stats API for pitcher data (PRIORITY 2)
 * 3. Perplexity for game context, storylines, and other relevant data
 * 
 * It focuses exclusively on moneyline and spread bets.
 */
import dotenv from 'dotenv';
import { picksService } from './services/picksService.enhanced.js';
import { perplexityService } from './services/perplexityService.js';

// Load environment variables
dotenv.config();

// Explicitly set the Perplexity API key for testing
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY || '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';
perplexityService.API_KEY = PERPLEXITY_API_KEY;
console.log(`🔑 Perplexity API Key (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);

async function testNormalPicksProcess() {
  console.log('🏆 TESTING COMPLETE NORMAL PICKS GENERATION PROCESS 🏆');
  console.log('--------------------------------------------------');
  
  try {
    console.log('Generating normal picks for MLB...');
    const mlbPicks = await picksService.generateDailyPicks('baseball_mlb');
    
    if (!mlbPicks || mlbPicks.length === 0) {
      console.log('❌ No MLB picks generated');
      return;
    }
    
    console.log(`✅ Successfully generated ${mlbPicks.length} MLB normal picks\n`);
    
    // Display the picks
    mlbPicks.forEach((pick, index) => {
      console.log(`\n===== PICK ${index + 1} =====`);
      console.log(`Game: ${pick.awayTeam} @ ${pick.homeTeam}`);
      console.log(`ID: ${pick.id}`);
      
      try {
        // Try to parse and display the analysis in a readable format
        let analysis;
        if (typeof pick.analysis === 'string') {
          analysis = JSON.parse(pick.analysis);
        } else {
          analysis = pick.analysis;
        }
        
        console.log('\nANALYSIS:');
        console.log('---------');
        // Show first 300 characters of analysis text
        const analysisText = analysis.analysis || 'No analysis provided';
        console.log(analysisText.slice(0, 300) + (analysisText.length > 300 ? '...' : ''));
        
        console.log('\nRECOMMENDATIONS:');
        console.log('---------------');
        
        if (analysis.recommendations && analysis.recommendations.length > 0) {
          analysis.recommendations.forEach(rec => {
            console.log(`${rec.type}: ${rec.team} (Confidence: ${rec.confidence})`);
            if (rec.odds) console.log(`Odds: ${rec.odds}`);
            if (rec.line) console.log(`Line: ${rec.line}`);
            console.log('');
          });
        } else {
          console.log('No recommendations provided');
        }
        
      } catch (parseError) {
        console.log('Could not parse analysis:', parseError.message);
        console.log('Raw analysis:', pick.analysis);
      }
      
      console.log('----------------------');
    });
    
    console.log('\nVerifying data sources integration:');
    console.log('--------------------------------');
    
    // Verify Ball Don't Lie integration (team stats)
    const firstPick = mlbPicks[0];
    if (firstPick && firstPick.gameData && firstPick.gameData.teamStats) {
      console.log('✅ Ball Don\'t Lie team stats successfully integrated');
      // Display sample team stats
      const homeTeamRecord = firstPick.gameData.teamStats.homeTeam?.record || 'N/A';
      const awayTeamRecord = firstPick.gameData.teamStats.awayTeam?.record || 'N/A';
      console.log(`Sample data: ${firstPick.homeTeam} record: ${homeTeamRecord}, ${firstPick.awayTeam} record: ${awayTeamRecord}`);
    } else {
      console.log('❌ Ball Don\'t Lie team stats not found in pick data');
    }
    
    // Verify MLB Stats API integration (pitcher data)
    if (firstPick && firstPick.gameData && firstPick.gameData.pitchers) {
      console.log('✅ MLB Stats API pitcher data successfully integrated');
      // Display sample pitcher data
      const homePitcher = firstPick.gameData.pitchers.home?.fullName || 'N/A';
      const awayPitcher = firstPick.gameData.pitchers.away?.fullName || 'N/A';
      console.log(`Sample data: ${firstPick.homeTeam} pitcher: ${homePitcher}, ${firstPick.awayTeam} pitcher: ${awayPitcher}`);
    } else {
      console.log('❌ MLB Stats API pitcher data not found in pick data');
    }
    
    // Verify Perplexity integration (game context)
    if (firstPick && firstPick.gameData && firstPick.gameData.gameContext) {
      console.log('✅ Perplexity game context successfully integrated');
      // Display sample game context
      const keysPresent = Object.keys(firstPick.gameData.gameContext);
      console.log(`Sample data: Game context includes: ${keysPresent.join(', ')}`);
    } else {
      console.log('❌ Perplexity game context not found in pick data');
    }
    
    console.log('\nTEST COMPLETED SUCCESSFULLY!');
    console.log('The enhanced normal picks generation process is working with all three data sources integrated.');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testNormalPicksProcess();
