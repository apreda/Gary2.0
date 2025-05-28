/**
 * Simple Bet/Fade Test
 * Tests the core bet/fade logic without complex database triggers
 */
import { supabase } from './src/supabaseClient.js';
import { userPickResultsService } from './src/services/userPickResultsService.js';
import { randomUUID } from 'crypto';

const testSimpleBetFade = async () => {
  console.log('🧪 SIMPLE BET/FADE TEST STARTING...\n');
  
  const testData = {
    pickId: null,
    userIds: [],
    cleanup: []
  };

  try {
    // Step 1: Create a simple test pick ID (we'll simulate this without daily_picks)
    const testPickId = randomUUID();
    testData.pickId = testPickId;
    console.log('1️⃣ Using test pick ID:', testPickId);

    // Step 2: Create test users and their decisions directly in user_picks
    console.log('\n2️⃣ Creating test user decisions...');
    
    const testUser1 = randomUUID();
    const testUser2 = randomUUID();
    const testUser3 = randomUUID();
    
    testData.userIds = [testUser1, testUser2, testUser3];
    
    const userDecisions = [
      {
        user_id: testUser1,
        pick_id: testPickId,
        decision: 'bet',    // User 1 bets WITH Gary
        outcome: null,
        created_at: new Date().toISOString()
      },
      {
        user_id: testUser2,
        pick_id: testPickId,
        decision: 'fade',   // User 2 bets AGAINST Gary
        outcome: null,
        created_at: new Date().toISOString()
      },
      {
        user_id: testUser3,
        pick_id: testPickId,
        decision: 'bet',    // User 3 also bets WITH Gary
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
      return { success: false, error: decisionsError.message };
    }
    
    testData.cleanup.push(() => supabase.from('user_picks').delete().eq('pick_id', testPickId));
    console.log('✅ User decisions created:', createdDecisions.length);
    
    // Display the decisions
    createdDecisions.forEach(decision => {
      console.log(`   ${decision.user_id.slice(-1)}: ${decision.decision.toUpperCase()}`);
    });

    // Step 3: Create a game result directly (simulating Gary's pick result)
    console.log('\n3️⃣ Creating Gary\'s pick result (WON)...');
    
    const gameResultWin = {
      pick_id: testPickId,
      result: 'won',
      final_score: 'Lakers 112 - Warriors 108',
      matchup: 'Lakers @ Warriors',
      game_date: new Date().toISOString(),
      league: 'NBA',
      pick_text: 'Lakers -3.5'
    };
    
    const { data: winResult, error: winError } = await supabase
      .from('game_results')
      .insert([gameResultWin])
      .select()
      .single();
    
    if (winError) {
      console.error('❌ Failed to create game result:', winError);
      return { success: false, error: winError.message };
    }
    
    testData.cleanup.push(() => supabase.from('game_results').delete().eq('pick_id', testPickId));
    console.log('✅ Gary WIN result created');

    // Step 4: Process the results using our service
    console.log('\n4️⃣ Processing user results...');
    const processingResult = await userPickResultsService.manualProcessResults();
    
    console.log('📊 Processing result:', {
      processed: processingResult.processed,
      updated: processingResult.updated,
      errors: processingResult.errors,
      message: processingResult.message
    });

    // Step 5: Verify the outcomes
    console.log('\n5️⃣ Verifying user outcomes...');
    const { data: finalDecisions, error: verifyError } = await supabase
      .from('user_picks')
      .select('*')
      .eq('pick_id', testPickId)
      .order('user_id');
    
    if (verifyError) {
      console.error('❌ Failed to verify outcomes:', verifyError);
      return { success: false, error: verifyError.message };
    }

    console.log('\n📋 RESULTS ANALYSIS:');
    console.log('Gary\'s pick: WON');
    console.log('Expected outcomes:');
    console.log('  - BET users should WIN');
    console.log('  - FADE users should LOSE');
    console.log('\nActual outcomes:');
    
    let allCorrect = true;
    finalDecisions.forEach(decision => {
      const expectedOutcome = decision.decision === 'bet' ? 'won' : 'lost';
      const actualOutcome = decision.outcome;
      const isCorrect = expectedOutcome === actualOutcome;
      
      if (!isCorrect) allCorrect = false;
      
      console.log(`  User ${decision.user_id.slice(-1)}: ${decision.decision.toUpperCase()} → ${actualOutcome?.toUpperCase() || 'NULL'} ${isCorrect ? '✅' : '❌'}`);
    });

    // Step 6: Test the opposite scenario (Gary loses)
    console.log('\n6️⃣ Testing opposite scenario (Gary LOSES)...');
    
    // Update the game result to lost
    const { error: updateError } = await supabase
      .from('game_results')
      .update({ 
        result: 'lost',
        final_score: 'Lakers 105 - Warriors 110'
      })
      .eq('pick_id', testPickId);
    
    if (updateError) {
      console.error('❌ Failed to update result:', updateError);
    } else {
      console.log('✅ Gary result changed to LOST');
      
      // Reset user pick outcomes to null
      await supabase
        .from('user_picks')
        .update({ outcome: null })
        .eq('pick_id', testPickId);
      
      // Process again
      const processingResult2 = await userPickResultsService.manualProcessResults();
      console.log('📊 Second processing result:', {
        processed: processingResult2.processed,
        updated: processingResult2.updated
      });
      
      // Check new outcomes
      const { data: newDecisions } = await supabase
        .from('user_picks')
        .select('*')
        .eq('pick_id', testPickId)
        .order('user_id');
      
      console.log('\n📋 NEW RESULTS ANALYSIS:');
      console.log('Gary\'s pick: LOST');
      console.log('Expected outcomes:');
      console.log('  - BET users should LOSE');
      console.log('  - FADE users should WIN');
      console.log('\nActual outcomes:');
      
      let allCorrect2 = true;
      newDecisions?.forEach(decision => {
        const expectedOutcome = decision.decision === 'bet' ? 'lost' : 'won';
        const actualOutcome = decision.outcome;
        const isCorrect = expectedOutcome === actualOutcome;
        
        if (!isCorrect) allCorrect2 = false;
        
        console.log(`  User ${decision.user_id.slice(-1)}: ${decision.decision.toUpperCase()} → ${actualOutcome?.toUpperCase() || 'NULL'} ${isCorrect ? '✅' : '❌'}`);
      });
      
      allCorrect = allCorrect && allCorrect2;
    }

    // Step 7: Test push scenario
    console.log('\n7️⃣ Testing PUSH scenario...');
    
    // Update the game result to push
    const { error: pushUpdateError } = await supabase
      .from('game_results')
      .update({ 
        result: 'push',
        final_score: 'Lakers 108 - Warriors 108 (Push on -3.5)'
      })
      .eq('pick_id', testPickId);
    
    if (pushUpdateError) {
      console.error('❌ Failed to update to push:', pushUpdateError);
    } else {
      console.log('✅ Gary result changed to PUSH');
      
      // Reset user pick outcomes to null
      await supabase
        .from('user_picks')
        .update({ outcome: null })
        .eq('pick_id', testPickId);
      
      // Process again
      const processingResult3 = await userPickResultsService.manualProcessResults();
      console.log('📊 Push processing result:', {
        processed: processingResult3.processed,
        updated: processingResult3.updated
      });
      
      // Check push outcomes
      const { data: pushDecisions } = await supabase
        .from('user_picks')
        .select('*')
        .eq('pick_id', testPickId)
        .order('user_id');
      
      console.log('\n📋 PUSH RESULTS ANALYSIS:');
      console.log('Gary\'s pick: PUSH');
      console.log('Expected outcomes:');
      console.log('  - ALL users should get PUSH (regardless of bet/fade)');
      console.log('\nActual outcomes:');
      
      let allCorrect3 = true;
      pushDecisions?.forEach(decision => {
        const expectedOutcome = 'push'; // Everyone gets push
        const actualOutcome = decision.outcome;
        const isCorrect = expectedOutcome === actualOutcome;
        
        if (!isCorrect) allCorrect3 = false;
        
        console.log(`  User ${decision.user_id.slice(-1)}: ${decision.decision.toUpperCase()} → ${actualOutcome?.toUpperCase() || 'NULL'} ${isCorrect ? '✅' : '❌'}`);
      });
      
      allCorrect = allCorrect && allCorrect3;
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 SIMPLE BET/FADE TEST COMPLETE!');
    console.log('='.repeat(60));
    
    if (allCorrect) {
      console.log('✅ ALL SCENARIOS PASSED! Your bet/fade system is working perfectly!');
    } else {
      console.log('❌ Some scenarios failed. Check the results above.');
    }
    
    return {
      success: allCorrect,
      testPickId: testPickId,
      userDecisions: createdDecisions,
      finalOutcomes: finalDecisions,
      processingResult
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    // Cleanup test data
    console.log('\n🧹 Cleaning up test data...');
    for (const cleanupFn of testData.cleanup) {
      try {
        await cleanupFn();
      } catch (error) {
        console.log('⚠️ Cleanup warning:', error.message);
      }
    }
    console.log('✅ Cleanup complete');
  }
};

// Export for use
export { testSimpleBetFade };

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSimpleBetFade().then((result) => {
    if (result.success) {
      console.log('\n🎉 ALL TESTS PASSED! Your bet/fade system is working correctly!');
    } else {
      console.log('\n❌ Test failed:', result.error);
    }
    process.exit(0);
  }).catch(error => {
    console.error('Test crashed:', error);
    process.exit(1);
  });
} 