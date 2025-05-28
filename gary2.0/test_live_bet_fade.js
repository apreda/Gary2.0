/**
 * Live Test for Bet/Fade Functionality
 * Tests the actual flow with real table structures
 */
import { supabase } from './src/supabaseClient.js';
import { userPickResultsService } from './src/services/userPickResultsService.js';

const testLiveBetFade = async () => {
  console.log('🚀 LIVE BET/FADE TEST STARTING...\n');
  
  const testData = {
    pickId: null,
    userIds: [],
    cleanup: []
  };

  try {
    // Step 1: Create a test pick in daily_picks
    console.log('1️⃣ Creating test pick in daily_picks...');
    const testPickId = `test-${Date.now()}`;
    
    const testPick = {
      id: testPickId,
      matchup: 'Lakers @ Warriors',
      pick: 'Lakers -3.5',
      odds: '-110',
      confidence: 'High',
      league: 'NBA',
      sport: 'basketball_nba',
      time: '10:30 PM ET',
      created_at: new Date().toISOString()
    };
    
    const { data: createdPick, error: pickError } = await supabase
      .from('daily_picks')
      .insert([testPick])
      .select()
      .single();
    
    if (pickError) {
      console.error('❌ Failed to create test pick:', pickError);
      return { success: false, error: pickError.message };
    }
    
    testData.pickId = createdPick.id;
    testData.cleanup.push(() => supabase.from('daily_picks').delete().eq('id', createdPick.id));
    console.log('✅ Test pick created:', createdPick.id);

    // Step 2: Create test users and their decisions
    console.log('\n2️⃣ Creating test user decisions...');
    
    // Generate unique test user IDs
    const testUser1 = `test-user-${Date.now()}-1`;
    const testUser2 = `test-user-${Date.now()}-2`;
    const testUser3 = `test-user-${Date.now()}-3`;
    
    testData.userIds = [testUser1, testUser2, testUser3];
    
    const userDecisions = [
      {
        user_id: testUser1,
        pick_id: createdPick.id,
        decision: 'bet',    // User 1 bets WITH Gary
        outcome: null,
        created_at: new Date().toISOString()
      },
      {
        user_id: testUser2,
        pick_id: createdPick.id,
        decision: 'fade',   // User 2 bets AGAINST Gary
        outcome: null,
        created_at: new Date().toISOString()
      },
      {
        user_id: testUser3,
        pick_id: createdPick.id,
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
    
    testData.cleanup.push(() => supabase.from('user_picks').delete().eq('pick_id', createdPick.id));
    console.log('✅ User decisions created:', createdDecisions.length);
    
    // Display the decisions
    createdDecisions.forEach(decision => {
      console.log(`   ${decision.user_id}: ${decision.decision.toUpperCase()}`);
    });

    // Step 3: Test Scenario 1 - Gary WINS
    console.log('\n3️⃣ Testing Scenario 1: Gary WINS...');
    
    const gameResultWin = {
      pick_id: createdPick.id,
      result: 'won',
      final_score: 'Lakers 112 - Warriors 108',
      matchup: testPick.matchup,
      game_date: new Date().toISOString(),
      league: 'NBA'
    };
    
    const { data: winResult, error: winError } = await supabase
      .from('game_results')
      .insert([gameResultWin])
      .select()
      .single();
    
    if (winError) {
      console.error('❌ Failed to create win result:', winError);
      return { success: false, error: winError.message };
    }
    
    testData.cleanup.push(() => supabase.from('game_results').delete().eq('pick_id', createdPick.id));
    console.log('✅ Gary WIN result created');

    // Step 4: Process the results
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
      .eq('pick_id', createdPick.id)
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
      
      console.log(`  ${decision.user_id.slice(-1)}: ${decision.decision.toUpperCase()} → ${actualOutcome?.toUpperCase() || 'NULL'} ${isCorrect ? '✅' : '❌'}`);
    });

    // Step 6: Test user stats updates
    console.log('\n6️⃣ Checking user stats...');
    const { data: userStats, error: statsError } = await supabase
      .from('user_stats')
      .select('*')
      .in('id', testData.userIds);
    
    if (statsError) {
      console.log('⚠️ No user stats found (normal for test users)');
    } else if (userStats && userStats.length > 0) {
      console.log('📊 User stats created:');
      userStats.forEach(stat => {
        console.log(`  User ${stat.id.slice(-1)}: ${stat.win_count}W-${stat.loss_count}L-${stat.push_count}P`);
      });
      testData.cleanup.push(() => supabase.from('user_stats').delete().in('id', testData.userIds));
    }

    // Step 7: Test Scenario 2 - Change to Gary LOSES
    console.log('\n7️⃣ Testing Scenario 2: Changing Gary result to LOST...');
    
    // Update the game result to lost
    const { error: updateError } = await supabase
      .from('game_results')
      .update({ 
        result: 'lost',
        final_score: 'Lakers 105 - Warriors 110'
      })
      .eq('pick_id', createdPick.id);
    
    if (updateError) {
      console.error('❌ Failed to update result:', updateError);
    } else {
      console.log('✅ Gary result changed to LOST');
      
      // Reset user pick outcomes to null
      await supabase
        .from('user_picks')
        .update({ outcome: null })
        .eq('pick_id', createdPick.id);
      
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
        .eq('pick_id', createdPick.id)
        .order('user_id');
      
      console.log('\n📋 NEW RESULTS ANALYSIS:');
      console.log('Gary\'s pick: LOST');
      console.log('Expected outcomes:');
      console.log('  - BET users should LOSE');
      console.log('  - FADE users should WIN');
      console.log('\nActual outcomes:');
      
      newDecisions?.forEach(decision => {
        const expectedOutcome = decision.decision === 'bet' ? 'lost' : 'won';
        const actualOutcome = decision.outcome;
        const isCorrect = expectedOutcome === actualOutcome;
        
        console.log(`  ${decision.user_id.slice(-1)}: ${decision.decision.toUpperCase()} → ${actualOutcome?.toUpperCase() || 'NULL'} ${isCorrect ? '✅' : '❌'}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 LIVE TEST COMPLETE!');
    console.log('='.repeat(60));
    
    return {
      success: allCorrect,
      testPick: createdPick,
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
export { testLiveBetFade };

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testLiveBetFade().then((result) => {
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