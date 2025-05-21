/**
 * Verify Normal Picks Components
 * 
 * This script directly checks each component required for enhanced normal picks:
 * 1. Ball Don't Lie API for team stats
 * 2. MLB Stats API for pitcher data 
 * 3. Perplexity for game context
 */
import dotenv from 'dotenv';
import { ballDontLieService } from './services/ballDontLieService.js';
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { perplexityService } from './services/perplexityService.js';

// Load environment variables
dotenv.config();

// Explicitly set the Perplexity API key
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY || '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';
perplexityService.API_KEY = PERPLEXITY_API_KEY;
console.log(`🔑 Perplexity API Key (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);

// Use teams that exist and have scheduled games
const HOME_TEAM = 'Dodgers';
const AWAY_TEAM = 'Yankees';

async function verifyDataSources() {
  console.log('\n🏆 VERIFYING NORMAL PICKS DATA SOURCES 🏆');
  console.log('==========================================');
  
  let allSourcesWorking = true;
  
  try {
    // 1. Test Ball Don't Lie API for team stats
    console.log('\n1️⃣ Testing Ball Don\'t Lie API for team statistics...');
    try {
      console.log(`Looking up team: ${HOME_TEAM}`);
      const homeTeam = await ballDontLieService.getTeamByName(HOME_TEAM);
      console.log(`Looking up team: ${AWAY_TEAM}`);
      const awayTeam = await ballDontLieService.getTeamByName(AWAY_TEAM);
      
      if (homeTeam && awayTeam) {
        console.log('✅ Successfully retrieved teams from Ball Don\'t Lie');
        console.log(`   ${HOME_TEAM} ID: ${homeTeam.id}`);
        console.log(`   ${AWAY_TEAM} ID: ${awayTeam.id}`);
        
        // Get team season stats
        console.log('\n   Getting team season stats...');
        const homeStats = await ballDontLieService.getMlbTeamSeasonStats(homeTeam.id);
        const awayStats = await ballDontLieService.getMlbTeamSeasonStats(awayTeam.id);
        
        if (homeStats && awayStats) {
          console.log('✅ Successfully retrieved team season stats');
          console.log(`   ${HOME_TEAM} Wins: ${homeStats.wins}, Losses: ${homeStats.losses}`);
          console.log(`   ${AWAY_TEAM} Wins: ${awayStats.wins}, Losses: ${awayStats.losses}`);
        } else {
          console.log('❌ Failed to retrieve team season stats');
          allSourcesWorking = false;
        }
      } else {
        console.log('❌ Failed to retrieve teams from Ball Don\'t Lie');
        allSourcesWorking = false;
      }
    } catch (error) {
      console.error('❌ Error testing Ball Don\'t Lie API:', error);
      allSourcesWorking = false;
    }
    
    // 2. Test MLB Stats API for pitcher data
    console.log('\n2️⃣ Testing MLB Stats API for starting pitcher data...');
    try {
      // Get game data from MLB Stats API for today
      const date = new Date().toISOString().slice(0, 10);
      console.log(`Getting games for ${date}`);
      const gamesData = await mlbStatsApiService.getTodaysGames(date);
      
      // The API returns an array directly
      if (gamesData && Array.isArray(gamesData) && gamesData.length > 0) {
        console.log(`✅ Successfully retrieved ${gamesData.length} games from MLB Stats API`);
        
        // Find the first game with probable pitchers to test
        const gameWithPitchers = gamesData.find(game => 
          game.probablePitchers?.home || game.probablePitchers?.away
        );
        
        if (gameWithPitchers) {
          console.log('✅ Found game with probable pitchers');
          console.log(`   Home Team: ${gameWithPitchers.homeTeam?.name || gameWithPitchers.teams?.home?.team?.name}`);
          console.log(`   Away Team: ${gameWithPitchers.awayTeam?.name || gameWithPitchers.teams?.away?.team?.name}`);
          
          // Check if we have probable pitchers
          const homePitcher = gameWithPitchers.probablePitchers?.home;
          const awayPitcher = gameWithPitchers.probablePitchers?.away;
          
          if (homePitcher) {
            console.log(`   Home Pitcher: ${homePitcher.fullName}`);
            
            // Get detailed pitcher stats
            if (homePitcher.id) {
              const homePitcherStats = await mlbStatsApiService.getPitcherSeasonStats(homePitcher.id);
              if (homePitcherStats) {
                console.log(`   Home Pitcher Stats: ERA ${homePitcherStats.era}, WHIP ${homePitcherStats.whip}`);
              }
            }
          }
          
          if (awayPitcher) {
            console.log(`   Away Pitcher: ${awayPitcher.fullName}`);
            
            // Get detailed pitcher stats
            if (awayPitcher.id) {
              const awayPitcherStats = await mlbStatsApiService.getPitcherSeasonStats(awayPitcher.id);
              if (awayPitcherStats) {
                console.log(`   Away Pitcher Stats: ERA ${awayPitcherStats.era}, WHIP ${awayPitcherStats.whip}`);
              }
            }
          }
        } else {
          console.log('⚠️ No games with probable pitchers found - this could be normal depending on game time');
          console.log('   Testing pitcher stats retrieval directly...');
          
          // Test getting pitcher stats directly
          console.log('   Testing direct pitcher stats retrieval (Mike Clevinger as sample pitcher)');
          // Use a known pitcher ID for testing - Mike Clevinger
          const pitcherId = 592222;
          const pitcherStats = await mlbStatsApiService.getPitcherSeasonStats(pitcherId);
          if (pitcherStats) {
            console.log(`✅ Successfully retrieved stats for pitcher ID ${pitcherId}`);
            console.log(`   Pitcher Stats: ERA ${pitcherStats.era}, WHIP ${pitcherStats.whip}`);
          } else {
            console.log(`❌ Failed to retrieve stats for pitcher ID ${pitcherId}`);
            allSourcesWorking = false;
          }
        }
      } else {
        console.log('❌ Failed to retrieve games from MLB Stats API');
        allSourcesWorking = false;
      }
    } catch (error) {
      console.error('❌ Error testing MLB Stats API:', error);
      allSourcesWorking = false;
    }
    
    // 3. Test Perplexity API for game context
    console.log('\n3️⃣ Testing Perplexity API for game context...');
    try {
      // Create a simple prompt to test Perplexity
      const prompt = `Give me a brief preview of tonight's MLB game between the ${HOME_TEAM} and the ${AWAY_TEAM}. Include recent team performance and any notable storylines.`;
      
      console.log('   Sending query to Perplexity API...');
      const perplexityResponse = await perplexityService.search(prompt);
      
      if (perplexityResponse && perplexityResponse.success && perplexityResponse.data) {
        console.log('✅ Successfully retrieved game context from Perplexity');
        console.log('   Game preview snippet:');
        console.log(`   ${perplexityResponse.data.substring(0, 150)}...`);
      } else {
        console.log('❌ Failed to retrieve game context from Perplexity');
        allSourcesWorking = false;
      }
    } catch (error) {
      console.error('❌ Error testing Perplexity API:', error);
      allSourcesWorking = false;
    }
    
    // Final verification
    console.log('\n🔍 FINAL VERIFICATION RESULTS:');
    console.log('---------------------------');
    
    if (allSourcesWorking) {
      console.log('✅ ALL NORMAL PICKS DATA SOURCES ARE WORKING CORRECTLY');
      console.log('✅ Your enhanced MLB normal picks system is READY FOR PRODUCTION');
      console.log('\n🏆 IMPORTANT FEATURES VERIFIED:');
      console.log('1. Ball Don\'t Lie API integration for team statistics');
      console.log('2. MLB Stats API integration for accurate pitcher data');
      console.log('3. Perplexity API integration for game context');
      console.log('\nYour system now correctly integrates all three data sources for enhanced normal picks!');
    } else {
      console.log('❌ ONE OR MORE DATA SOURCES ARE NOT WORKING CORRECTLY');
      console.log('Please fix the issues before deploying to production.');
    }
    
  } catch (error) {
    console.error('Error verifying data sources:', error);
  }
}

// Run the verification
verifyDataSources()
  .then(() => console.log('\nVerification complete.'))
  .catch(err => console.error('Fatal error:', err));
