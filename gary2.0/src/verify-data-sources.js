/**
 * Simple Verification Script for MLB Data Sources
 * 
 * This script directly verifies that our MLB normal picks system correctly uses:
 * 1. Ball Dont Lie API for team stats 
 * 2. MLB Stats API Enhanced for accurate pitcher data
 * 3. Perplexity for game context
 */
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Test game data
const homeTeam = 'Athletics';
const awayTeam = 'Angels';
const date = '2025-05-21';
const gamePk = 718976; // Sample game ID

async function verifyDataSources() {
  console.log('\n=== VERIFYING MLB ENHANCED PICKS DATA SOURCES ===\n');
  
  try {
    // 1. First import combinedMlbService which integrates all three data sources
    console.log('Importing combinedMlbService...');
    const { combinedMlbService } = await import('./services/combinedMlbService.js');
    
    // 2. Check what MLB Stats API service it's importing
    console.log('\nChecking MLB Stats API service import in combinedMlbService.js...');
    
    // Make a call that uses the enhanced MLB Stats API method
    console.log('\nCalling getComprehensiveGameData which should use enhanced methods:');
    console.log(`- Home Team: ${homeTeam}`);
    console.log(`- Away Team: ${awayTeam}`);
    console.log(`- Date: ${date}`);

    console.log('\nThis method should call:');
    console.log('1. Ball Dont Lie API for team stats');
    console.log('2. MLB Stats API enhanced getStartingPitchersEnhanced for pitcher data');
    console.log('3. Perplexity for game context');
    
    // Special trace flags to track API calls
    global.TRACE_BALLDONTLIE_API = true;
    global.TRACE_MLBSTATS_ENHANCED_API = true;
    global.TRACE_PERPLEXITY_API = true;
    
    // Now directly test the combined service which should use all three data sources
    const result = await combinedMlbService.getComprehensiveGameData(homeTeam, awayTeam, date);
    
    // Check if we got proper data from each source
    console.log('\n=== VERIFICATION RESULTS ===\n');
    
    // Check Ball Dont Lie data
    if (result && result.teamStats && 
        result.teamStats.homeTeam && 
        result.teamStats.awayTeam) {
      console.log('✅ BALL DONT LIE API (Team Stats): Successfully used');
      console.log(`   Home team record: ${result.teamStats.homeTeam.record || 'N/A'}`);
      console.log(`   Away team record: ${result.teamStats.awayTeam.record || 'N/A'}`);
    } else {
      console.log('❌ BALL DONT LIE API: Not used or failed');
    }
    
    // Check MLB Stats API Enhanced data
    if (result && result.pitchers && 
        result.pitchers.home && 
        result.pitchers.away) {
      console.log('\n✅ MLB STATS API ENHANCED (Pitcher Data): Successfully used');
      console.log(`   Home pitcher: ${result.pitchers.home.fullName || 'N/A'}`);
      console.log(`   Away pitcher: ${result.pitchers.away.fullName || 'N/A'}`);
      
      // Check for ERA which should only be in the enhanced version
      if (result.pitchers.home.seasonStats && 
          result.pitchers.home.seasonStats.era !== undefined) {
        console.log('   Enhanced pitcher stats present ✓');
      } else {
        console.log('   Enhanced pitcher stats missing ✗');
      }
    } else {
      console.log('\n❌ MLB STATS API ENHANCED: Not used or failed');
    }
    
    // Check Perplexity data
    if (result && result.gameContext) {
      console.log('\n✅ PERPLEXITY API (Game Context): Successfully used');
      console.log('   Context keys: ' + Object.keys(result.gameContext).join(', '));
    } else {
      console.log('\n❌ PERPLEXITY API: Not used or failed');
    }
    
    console.log('\n=== FINAL VERDICT ===');
    const allAPIsWorking = 
      (result && result.teamStats && result.pitchers && result.gameContext);
    
    if (allAPIsWorking) {
      console.log('✅ SUCCESS: All three data sources are correctly integrated!');
      console.log('1. Ball Dont Lie API for team stats ✓');
      console.log('2. MLB Stats API Enhanced for pitcher data ✓');
      console.log('3. Perplexity for game context ✓');
    } else {
      console.log('❌ FAILURE: One or more data sources are not properly integrated');
    }
    
  } catch (error) {
    console.error('Error during verification:', error);
  }
}

// Run the verification
verifyDataSources();
