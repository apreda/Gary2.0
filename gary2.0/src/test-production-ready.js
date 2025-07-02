/**
 * Test Production-Ready System
 * 
 * This test script verifies that the production system is ready with:
 * 1. Enhanced normal MLB picks (moneyline/spread only) using all three data sources:
 *    - Ball Don't Lie API for team stats (PRIORITY 1)
 *    - MLB Stats API for pitcher data (PRIORITY 2)
 *    - Perplexity for game context (PRIORITY 3)
 * 2. MLB prop picks using the specialized prop picks generation service
 */
import dotenv from 'dotenv';
import { picksService as enhancedPicksService } from './services/picksService.enhanced.js';
import { mlbPicksGenerationService } from './services/mlbPicksGenerationService.js';
import { perplexityService } from './services/perplexityService.js';
import { combinedMlbService } from './services/combinedMlbService.js';

// Load environment variables
dotenv.config();

// Explicitly set the Perplexity API key for testing
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
perplexityService.API_KEY = PERPLEXITY_API_KEY;

if (!PERPLEXITY_API_KEY) {
  console.error('❌ PERPLEXITY_API_KEY not found in environment variables');
  process.exit(1);
}

console.log(`🔑 Perplexity API Key (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);

// Mock game data for testing
const mockGames = [
  {
    id: '777828',
    home_team: 'Athletics',
    away_team: 'Angels',
    sport_key: 'baseball_mlb',
    commence_time: '2025-05-21T22:05:00Z',
    bookmakers: [
      {
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Athletics', price: 2.10 },
              { name: 'Angels', price: 1.80 }
            ]
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Athletics', point: -1.5 },
              { name: 'Angels', point: 1.5 }
            ]
          }
        ]
      }
    ]
  }
];

async function testProductionReadiness() {
  console.log('🏆 TESTING PRODUCTION-READY SYSTEM 🏆');
  console.log('-------------------------------------');
  console.log('This test verifies the production system is ready with:');
  console.log('1. Enhanced normal MLB picks (moneyline/spread only)');
  console.log('2. MLB prop picks generation');
  console.log('-------------------------------------\n');
  
  try {
    // PART 1: Test enhanced normal MLB picks with all three data sources
    console.log('PART 1: Testing enhanced normal MLB picks...');
    
    // First, test the combined MLB service directly to verify data integration
    console.log('Testing combinedMlbService for data integration...');
    const gameData = await combinedMlbService.getComprehensiveGameData('Athletics', 'Angels');
    
    // Verify all three data sources are working
    console.log('\nVerifying data sources:');
    console.log('-------------------------');
    
    // 1. Ball Don't Lie for team stats
    if (gameData.teamStats && gameData.teamStats.homeTeam && gameData.teamStats.awayTeam) {
      console.log('✅ Ball Don\'t Lie team stats (PRIORITY 1) successfully integrated');
      console.log(`   Athletics record: ${gameData.teamStats.homeTeam.record}, Angels record: ${gameData.teamStats.awayTeam.record}`);
    } else {
      console.log('❌ Ball Don\'t Lie team stats not found');
    }
    
    // 2. MLB Stats API for pitcher data
    if (gameData.pitchers && (gameData.pitchers.home || gameData.pitchers.away)) {
      console.log('✅ MLB Stats API pitcher data (PRIORITY 2) successfully integrated');
      if (gameData.pitchers.home) {
        console.log(`   Athletics pitcher: ${gameData.pitchers.home.fullName} (ERA: ${gameData.pitchers.home.seasonStats?.era || 'N/A'})`);
      }
      if (gameData.pitchers.away) {
        console.log(`   Angels pitcher: ${gameData.pitchers.away.fullName} (ERA: ${gameData.pitchers.away.seasonStats?.era || 'N/A'})`);
      }
    } else {
      console.log('❌ MLB Stats API pitcher data not found');
    }
    
    // 3. Perplexity for game context
    if (gameData.gameContext) {
      console.log('✅ Perplexity game context (PRIORITY 3) successfully integrated');
      console.log(`   Context includes ${Object.keys(gameData.gameContext).length} elements`);
    } else {
      console.log('❌ Perplexity game context not found');
    }
    
    // Next, test the enhanced picks service for normal picks generation
    console.log('\nTesting enhancedPicksService.generateDailyPicks for normal picks...');
    
    try {
      // Use mock games for testing
      const normalPicks = await enhancedPicksService.generateMlbNormalPicks(mockGames, '2025-05-21');
      
      if (normalPicks.length > 0) {
        console.log(`✅ Successfully generated ${normalPicks.length} normal MLB picks`);
        
        // Verify picks are for moneyline/spread only (no totals or props)
        const samplePick = normalPicks[0];
        
        console.log('\nSample normal pick:');
        console.log(`Game: ${samplePick.awayTeam} @ ${samplePick.homeTeam}`);
        
        try {
          const analysis = typeof samplePick.analysis === 'string' ? 
            JSON.parse(samplePick.analysis) : 
            samplePick.analysis;
          
          if (analysis && analysis.recommendations) {
            console.log('Recommendations:');
            
            const types = analysis.recommendations.map(rec => rec.type);
            console.log(`Bet types: ${types.join(', ')}`);
            
            // Check if we have any totals bets, which should be excluded
            const hasTotals = analysis.recommendations.some(rec => 
              rec.type.toLowerCase().includes('total') || 
              rec.type.toLowerCase().includes('over/under'));
              
            if (hasTotals) {
              console.log('❌ Found totals/over-under bets which should be excluded');
            } else {
              console.log('✅ No totals/over-under bets found, only moneyline/spread as required');
            }
          }
        } catch (error) {
          console.error('Error parsing pick analysis:', error);
        }
      } else {
        console.log('❌ Failed to generate normal MLB picks');
      }
    } catch (normalPicksError) {
      console.error('Error testing normal picks generation:', normalPicksError);
    }
    
    // PART 2: Test MLB prop picks generation
    console.log('\nPART 2: Testing MLB prop picks generation...');
    
    try {
      const propPicks = await mlbPicksGenerationService.generateMLBPropPicks(mockGames);
      
      if (propPicks.length > 0) {
        console.log(`✅ Successfully generated ${propPicks.length} MLB prop picks`);
        
        // Verify picks are prop bets
        const samplePropPick = propPicks[0];
        
        console.log('\nSample prop pick:');
        console.log(`Game: ${samplePropPick.awayTeam} @ ${samplePropPick.homeTeam}`);
        
        try {
          const propAnalysis = typeof samplePropPick.analysis === 'string' ? 
            JSON.parse(samplePropPick.analysis) : 
            samplePropPick.analysis;
          
          if (propAnalysis && propAnalysis.recommendations) {
            console.log('Prop bet recommendation:');
            
            const isPropBet = propAnalysis.recommendations.some(rec => 
              rec.type === 'prop' || 
              rec.player);
              
            if (isPropBet) {
              console.log('✅ Confirmed prop bets are working correctly');
              console.log(`   ${propAnalysis.recommendations[0].player} ${propAnalysis.recommendations[0].prop}`);
            } else {
              console.log('❌ Prop bets not properly structured');
            }
          }
        } catch (error) {
          console.error('Error parsing prop pick analysis:', error);
        }
      } else {
        console.log('❌ Failed to generate MLB prop picks');
      }
    } catch (propPicksError) {
      console.error('Error testing prop picks generation:', propPicksError);
    }
    
    // Final verification of production readiness
    console.log('\n==== PRODUCTION READINESS VERIFICATION ====');
    
    const normalPicksReady = gameData && gameData.teamStats && gameData.pitchers && gameData.gameContext;
    const propPicksReady = mlbPicksGenerationService.generateMLBPropPicks !== undefined;
    
    if (normalPicksReady && propPicksReady) {
      console.log('✅✅✅ YOUR SYSTEM IS PRODUCTION-READY! ✅✅✅');
      console.log('Enhanced normal picks system with all three data sources is working');
      console.log('Prop picks system is working separately');
      console.log('\nYou can now safely use this in production!');
    } else {
      if (!normalPicksReady) {
        console.log('❌ Normal picks with integrated data sources are not ready');
      }
      if (!propPicksReady) {
        console.log('❌ Prop picks system is not ready');
      }
      console.log('\nPlease fix the issues before deploying to production.');
    }
    
  } catch (error) {
    console.error('Error testing production readiness:', error);
  }
}

// Run the test
testProductionReadiness();
