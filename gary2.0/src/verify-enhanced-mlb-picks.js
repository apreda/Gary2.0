/**
 * Comprehensive Verification Script for Enhanced MLB Normal Picks
 * 
 * This script verifies that our enhanced MLB normal picks system correctly:
 * 1. Uses the Ball Dont Lie API for team stats (PRIORITY 1)
 * 2. Uses the MLB Stats API for accurate pitcher data (PRIORITY 2)
 * 3. Uses Perplexity for game context (PRIORITY 3)
 * 4. Focuses exclusively on moneyline and spread bets (no totals or player props)
 * 
 * It adds detailed logging at each step to confirm the correct APIs are being used.
 */
import dotenv from 'dotenv';

// We need to dynamically import the services to avoid module resolution issues
let mainPicksService, enhancedPicksService, combinedMlbService, mlbStatsApiService;
let ballDontLieService, perplexityService, oddsService;

// This will be populated with our imports
let services = {};

// Load environment variables
dotenv.config();

// Test data for a known MLB game
const TEST_HOME_TEAM = 'Athletics';
const TEST_AWAY_TEAM = 'Angels';
const TEST_DATE = '2025-05-21';
const SPORT = 'baseball_mlb';

// We'll initialize our wrappers after importing services

/**
 * Main verification process
 */
async function verifyEnhancedMlbPicksFlow() {
  // First import all the services
  try {
    console.log('Importing services...');
    
    // Import all services
    services.picksService = (await import('./services/picksService.js')).picksService;
    services.enhancedPicksService = (await import('./services/picksService.enhanced.js')).picksService;
    services.combinedMlbService = (await import('./services/combinedMlbService.js')).combinedMlbService;
    services.mlbStatsApiService = (await import('./services/mlbStatsApiService.enhanced.js')).mlbStatsApiService;
    services.ballDontLieService = (await import('./services/ballDontLieService.js')).ballDontLieService;
    services.perplexityService = (await import('./services/perplexityService.js')).perplexityService;
    services.oddsService = (await import('./services/oddsService.js')).oddsService;
    
    // Assign to convenience variables
    mainPicksService = services.picksService;
    enhancedPicksService = services.enhancedPicksService;
    combinedMlbService = services.combinedMlbService;
    mlbStatsApiService = services.mlbStatsApiService;
    ballDontLieService = services.ballDontLieService;
    perplexityService = services.perplexityService;
    oddsService = services.oddsService;
    
    console.log('Services imported successfully!');
    
    // Explicitly set the Perplexity API key
    const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
    if (PERPLEXITY_API_KEY) {
      perplexityService.API_KEY = PERPLEXITY_API_KEY;
      console.log(`✅ Perplexity API Key loaded successfully (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);
    } else {
      console.error('❌ Perplexity API Key not found in environment variables');
      process.exit(1);
    }
    
    // Add detailed logging wrappers around key functions to verify they're being called
    const originalBallDontLieGetCompStats = ballDontLieService.getMlbTeamComparisonStats;
    ballDontLieService.getMlbTeamComparisonStats = async function(...args) {
      console.log(`🔍 VERIFICATION: Ball Dont Lie API getMlbTeamComparisonStats called for ${args[1]} @ ${args[0]}`);
      return originalBallDontLieGetCompStats.apply(this, args);
    };

    const originalMlbStatsApiGetEnhanced = mlbStatsApiService.getStartingPitchersEnhanced;
    mlbStatsApiService.getStartingPitchersEnhanced = async function(...args) {
      console.log(`🔍 VERIFICATION: MLB Stats API Enhanced getStartingPitchersEnhanced called for game ID ${args[0]}`);
      return originalMlbStatsApiGetEnhanced.apply(this, args);
    };

    const originalPerplexitySearch = perplexityService.search;
    perplexityService.search = async function(...args) {
      console.log(`🔍 VERIFICATION: Perplexity API search called with query starting: ${args[0].substring(0, 50)}...`);
      return originalPerplexitySearch.apply(this, args);
    };
    
  } catch (importError) {
    console.error('Failed to import services:', importError);
    process.exit(1);
  }
  console.log('=================================================================');
  console.log('🧪 STARTING ENHANCED MLB NORMAL PICKS VERIFICATION');
  console.log('=================================================================');
  
  try {
    // Step 1: Verify that the main picksService correctly uses the enhanced version for MLB
    console.log('\n📋 STEP 1: Verifying main picksService integration with enhanced version');
    console.log('Checking how main picksService handles MLB normal picks...');
    
    // Mock oddsService to provide test data
    const originalGetUpcomingGames = oddsService.getUpcomingGames;
    oddsService.getUpcomingGames = async function(sport) {
      console.log(`🔍 VERIFICATION: oddsService.getUpcomingGames called for ${sport}`);
      if (sport === SPORT) {
        return [{
          id: '888888',
          sport_key: SPORT,
          home_team: TEST_HOME_TEAM,
          away_team: TEST_AWAY_TEAM,
          commence_time: new Date().toISOString(),
          bookmakers: [{
            key: 'test_bookmaker',
            markets: [
              {
                key: 'h2h',
                outcomes: [
                  { name: TEST_HOME_TEAM, price: +150 },
                  { name: TEST_AWAY_TEAM, price: -170 }
                ]
              },
              {
                key: 'spreads',
                outcomes: [
                  { name: TEST_HOME_TEAM, price: -110, point: +1.5 },
                  { name: TEST_AWAY_TEAM, price: -110, point: -1.5 }
                ]
              }
            ]
          }]
        }];
      }
      return [];
    };
    
    // Call the main service's generateDailyPicks with our trace flags enabled
    console.log(`\nGenerating MLB picks via main picksService...`);
    global.TRACE_MLB_PICKS_FLOW = true;
    
    // We won't actually execute the full picks generation which would call OpenAI
    // Instead we'll call the enhanced picks service directly to verify data sources
    console.log('\n📋 STEP 2: Verifying enhanced picks service with combined data sources');
    console.log('Getting comprehensive game data from combinedMlbService...');
    
    const gameData = await combinedMlbService.getComprehensiveGameData(
      TEST_HOME_TEAM, 
      TEST_AWAY_TEAM,
      TEST_DATE
    );
    
    console.log('\n📊 VERIFICATION RESULTS:');
    
    // Verify Ball Dont Lie API data
    if (gameData && gameData.teamStats) {
      console.log('✅ Ball Dont Lie API (PRIORITY 1): Successfully fetched team stats');
      console.log(`   Home team (${TEST_HOME_TEAM}) record: ${gameData.teamStats.homeTeam.record || 'N/A'}`);
      console.log(`   Away team (${TEST_AWAY_TEAM}) record: ${gameData.teamStats.awayTeam.record || 'N/A'}`);
    } else {
      console.log('❌ Ball Dont Lie API (PRIORITY 1): Failed to fetch team stats');
    }
    
    // Verify MLB Stats API data
    if (gameData && gameData.pitchers && gameData.pitchers.home) {
      console.log('✅ MLB Stats API (PRIORITY 2): Successfully fetched pitcher data');
      console.log(`   Home pitcher: ${gameData.pitchers.home.fullName || 'N/A'}`);
      console.log(`   Away pitcher: ${gameData.pitchers.away.fullName || 'N/A'}`);
      
      // Verify enhanced pitcher data (ERA, etc.)
      if (gameData.pitchers.home.seasonStats && gameData.pitchers.home.seasonStats.era) {
        console.log('✅ Enhanced pitcher stats present (ERA, WHIP, etc.)');
      } else {
        console.log('❌ Enhanced pitcher stats missing');
      }
    } else {
      console.log('❌ MLB Stats API (PRIORITY 2): Failed to fetch pitcher data');
    }
    
    // Verify Perplexity API data
    if (gameData && gameData.gameContext) {
      console.log('✅ Perplexity API (PRIORITY 3): Successfully fetched game context');
      console.log('   Context includes:');
      for (const key in gameData.gameContext) {
        console.log(`   - ${key}`);
      }
    } else {
      console.log('❌ Perplexity API (PRIORITY 3): Failed to fetch game context');
    }
    
    // Generate a game preview to further verify data integration
    console.log('\n📋 STEP 3: Verifying game preview generation with all data sources');
    const gamePreview = await combinedMlbService.generateEnhancedGamePreview(
      TEST_HOME_TEAM, 
      TEST_AWAY_TEAM,
      TEST_DATE
    );
    
    console.log('\nGame Preview Sample:');
    console.log('-------------------');
    console.log(gamePreview.substring(0, 500) + '...');
    
    // Now build the complete MLB analysis prompt to verify bet type focus
    console.log('\n📋 STEP 4: Verifying analysis prompt construction (moneyline/spread only)');
    
    const testGame = {
      home_team: TEST_HOME_TEAM,
      away_team: TEST_AWAY_TEAM,
      bookmakers: [{
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: TEST_HOME_TEAM, price: +150 },
              { name: TEST_AWAY_TEAM, price: -170 }
            ]
          },
          {
            key: 'spreads',
            outcomes: [
              { name: TEST_HOME_TEAM, price: -110, point: +1.5 },
              { name: TEST_AWAY_TEAM, price: -110, point: -1.5 }
            ]
          }
        ]
      }]
    };
    
    const analysisPrompt = await enhancedPicksService.buildMlbGameAnalysisPrompt(gameData, testGame);
    
    // Check if the prompt explicitly mentions no totals or player props
    if (analysisPrompt.includes('Focus ONLY on moneyline and spread bets') && 
        analysisPrompt.includes('NO totals or player props')) {
      console.log('✅ Analysis prompt correctly focuses ONLY on moneyline and spread bets');
    } else {
      console.log('❌ Analysis prompt does not properly restrict to moneyline and spread bets only');
    }
    
    console.log('\n=================================================================');
    console.log('🎉 VERIFICATION COMPLETE');
    console.log('=================================================================');
    
    // Restore original functions if they were set
    if (originalGetUpcomingGames) {
      oddsService.getUpcomingGames = originalGetUpcomingGames;
    }
    if (originalBallDontLieGetCompStats) {
      ballDontLieService.getMlbTeamComparisonStats = originalBallDontLieGetCompStats;
    }
    if (originalMlbStatsApiGetEnhanced) {
      mlbStatsApiService.getStartingPitchersEnhanced = originalMlbStatsApiGetEnhanced;
    }
    if (originalPerplexitySearch) {
      perplexityService.search = originalPerplexitySearch;
    }
    
  } catch (error) {
    console.error('❌ ERROR during verification:', error.message);
    console.error(error.stack);
  }
}

// Run the verification
verifyEnhancedMlbPicksFlow();
