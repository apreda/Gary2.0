/**
 * Test Script for Complete Bet/Fade Flow
 * This simulates the entire process from user decision to result processing
 */
import { supabase } from './src/supabaseClient.js';
import { userPickResultsService } from './src/services/userPickResultsService.js';

const testBetFadeFlow = async () => {
  console.log('🧪 TESTING COMPLETE BET/FADE FLOW...\n');
  
  try {
    // Step 1: Create a test pick in daily_picks
    console.log('1️⃣ Creating test pick...');
    const testPick = {
      id: `test-pick-${Date.now()}`,
      matchup: 'Test Team A @ Test Team B',
      pick: 'Test Team A -3.5',
      odds: '-110',
      confidence: 'High',
      league: 'TEST',
      sport: 'test',
      created_at: new Date().toISOString()
    };
    
    const { data: createdPick, error: pickError } = await supabase
      .from('daily_picks')
      .insert([testPick])
      .select()
      .single();
    
    if (pickError) {
      console.error('❌ Failed to create test pick:', pickError);
      return;
    }
    console.log('✅ Test pick created:', createdPick.id);

    // Step 2: Create test user decisions
    console.log('\n2️⃣ Creating test user decisions...');
    const testUserId1 = 'test-user-1';
    const testUserId2 = 'test-user-2';
    
    const userDecisions = [
      {
        user_id: testUserId1,
        pick_id: createdPick.id,
        decision: 'bet', // User 1 bets WITH Gary
        outcome: null,
        created_at: new Date().toISOString()
      },
      {
        user_id: testUserId2,
        pick_id: createdPick.id,
        decision: 'fade', // User 2 bets AGAINST Gary
        outcome: null,
        created_at: new Date().toISOString()
      }
    ];
    
    const { data: createdDecisions, error: decisionsError } = await supabase
      .from('user_picks')
      .insert(userDecisions)
      .select();
    
    if (decisionsError) {
      console.error('❌ Failed to create user decisions:', decisionsError);
      return;
    }
    console.log('✅ User decisions created:', createdDecisions.length);

    // Step 3: Simulate Gary's pick result
    console.log('\n3️⃣ Simulating Gary\'s pick result...');
    const garyResult = 'won'; // Gary's pick won
    
    const gameResult = {
      pick_id: createdPick.id,
      result: garyResult,
      final_score: 'Team A 28 - Team B 21',
      matchup: testPick.matchup,
      game_date: new Date().toISOString(),
      league: 'TEST'
    };
    
    const { data: createdResult, error: resultError } = await supabase
      .from('game_results')
      .insert([gameResult])
      .select()
      .single();
    
    if (resultError) {
      console.error('❌ Failed to create game result:', resultError);
      return;
    }
    console.log('✅ Game result created:', garyResult);

    // Step 4: Process user pick results
    console.log('\n4️⃣ Processing user pick results...');
    const processingResult = await userPickResultsService.manualProcessResults();
    
    console.log('📊 Processing result:', processingResult);

    // Step 5: Verify outcomes
    console.log('\n5️⃣ Verifying user outcomes...');
    const { data: updatedDecisions, error: verifyError } = await supabase
      .from('user_picks')
      .select('*')
      .eq('pick_id', createdPick.id);
    
    if (verifyError) {
      console.error('❌ Failed to verify outcomes:', verifyError);
      return;
    }

    console.log('\n📋 EXPECTED vs ACTUAL OUTCOMES:');
    updatedDecisions.forEach(decision => {
      const expectedOutcome = decision.decision === 'bet' ? 'won' : 'lost'; // Gary won, so bet=won, fade=lost
      const actualOutcome = decision.outcome;
      const isCorrect = expectedOutcome === actualOutcome;
      
      console.log(`User ${decision.user_id}:`);
      console.log(`  Decision: ${decision.decision}`);
      console.log(`  Expected: ${expectedOutcome}`);
      console.log(`  Actual: ${actualOutcome}`);
      console.log(`  Status: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
    });

    // Step 6: Check user stats
    console.log('\n6️⃣ Checking user stats...');
    const { data: userStats, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .in('id', [testUserId1, testUserId2]);
    
    if (statsError) {
      console.log('⚠️ No user stats found (this is normal for test users)');
    } else {
      console.log('📊 User stats:', userStats);
    }

    // Step 7: Cleanup test data
    console.log('\n7️⃣ Cleaning up test data...');
    
    // Delete user picks
    await supabase
      .from('user_picks')
      .delete()
      .eq('pick_id', createdPick.id);
    
    // Delete game result
    await supabase
      .from('game_results')
      .delete()
      .eq('pick_id', createdPick.id);
    
    // Delete test pick
    await supabase
      .from('daily_picks')
      .delete()
      .eq('id', createdPick.id);
    
    console.log('✅ Test data cleaned up');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 BET/FADE FLOW TEST COMPLETE!');
    console.log('='.repeat(60));
    
    return {
      success: true,
      testPick: createdPick,
      userDecisions: createdDecisions,
      gameResult: createdResult,
      processingResult,
      finalOutcomes: updatedDecisions
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Export for use
export { testBetFadeFlow };

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testBetFadeFlow().then((result) => {
    if (result.success) {
      console.log('✅ Test completed successfully!');
    } else {
      console.log('❌ Test failed:', result.error);
    }
    process.exit(0);
  }).catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });
} 