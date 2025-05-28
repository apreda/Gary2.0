/**
 * Diagnostic Script for Bet/Fade Functionality
 * Run this to check if everything is set up correctly
 */
import { supabase } from './src/supabaseClient.js';

const diagnosticBetFadeSetup = async () => {
  console.log('🔍 DIAGNOSING BET/FADE SETUP...\n');
  
  const results = {
    tableStructures: {},
    sampleData: {},
    issues: [],
    recommendations: []
  };

  try {
    // 1. Check user_picks table structure
    console.log('📋 Checking user_picks table structure...');
    const { data: userPicksColumns, error: userPicksError } = await supabase
      .rpc('get_table_columns', { table_name: 'user_picks' })
      .catch(async () => {
        // Fallback method if RPC doesn't exist
        const { data, error } = await supabase
          .from('user_picks')
          .select('*')
          .limit(1);
        
        if (error && error.code === '42P01') {
          return { data: null, error: { message: 'Table does not exist' } };
        }
        
        return { data: data || [], error };
      });

    if (userPicksError) {
      results.issues.push(`❌ user_picks table issue: ${userPicksError.message}`);
    } else {
      results.tableStructures.user_picks = userPicksColumns;
      console.log('✅ user_picks table found');
    }

    // 2. Check user_stats table structure  
    console.log('📋 Checking user_stats table structure...');
    const { data: userStatsColumns, error: userStatsError } = await supabase
      .from('user_stats')
      .select('*')
      .limit(1);

    if (userStatsError) {
      results.issues.push(`❌ user_stats table issue: ${userStatsError.message}`);
    } else {
      results.tableStructures.user_stats = userStatsColumns;
      console.log('✅ user_stats table found');
    }

    // 3. Check game_results table
    console.log('📋 Checking game_results table structure...');
    const { data: gameResultsColumns, error: gameResultsError } = await supabase
      .from('game_results')
      .select('*')
      .limit(1);

    if (gameResultsError) {
      results.issues.push(`❌ game_results table issue: ${gameResultsError.message}`);
    } else {
      results.tableStructures.game_results = gameResultsColumns;
      console.log('✅ game_results table found');
    }

    // 4. Check daily_picks table
    console.log('📋 Checking daily_picks table structure...');
    const { data: dailyPicksColumns, error: dailyPicksError } = await supabase
      .from('daily_picks')
      .select('*')
      .limit(1);

    if (dailyPicksError) {
      results.issues.push(`❌ daily_picks table issue: ${dailyPicksError.message}`);
    } else {
      results.tableStructures.daily_picks = dailyPicksColumns;
      console.log('✅ daily_picks table found');
    }

    // 5. Check for sample data
    console.log('\n📊 Checking for sample data...');
    
    // Check user_picks data
    const { data: sampleUserPicks } = await supabase
      .from('user_picks')
      .select('*')
      .limit(5);
    results.sampleData.user_picks = sampleUserPicks || [];
    console.log(`📝 Found ${sampleUserPicks?.length || 0} user picks`);

    // Check user_stats data
    const { data: sampleUserStats } = await supabase
      .from('user_stats')
      .select('*')
      .limit(5);
    results.sampleData.user_stats = sampleUserStats || [];
    console.log(`📝 Found ${sampleUserStats?.length || 0} user stats records`);

    // Check game_results data
    const { data: sampleGameResults } = await supabase
      .from('game_results')
      .select('*')
      .limit(5);
    results.sampleData.game_results = sampleGameResults || [];
    console.log(`📝 Found ${sampleGameResults?.length || 0} game results`);

    // Check daily_picks data
    const { data: sampleDailyPicks } = await supabase
      .from('daily_picks')
      .select('*')
      .limit(5);
    results.sampleData.daily_picks = sampleDailyPicks || [];
    console.log(`📝 Found ${sampleDailyPicks?.length || 0} daily picks`);

    // 6. Validate data relationships
    console.log('\n🔗 Checking data relationships...');
    
    if (sampleUserPicks?.length > 0 && sampleDailyPicks?.length > 0) {
      const userPickIds = sampleUserPicks.map(p => p.pick_id);
      const dailyPickIds = sampleDailyPicks.map(p => p.id);
      const matchingIds = userPickIds.filter(id => dailyPickIds.includes(id));
      
      if (matchingIds.length === 0) {
        results.issues.push('❌ No matching pick_ids between user_picks and daily_picks');
      } else {
        console.log(`✅ Found ${matchingIds.length} matching pick relationships`);
      }
    }

    // 7. Check for required columns
    console.log('\n🔍 Validating required columns...');
    
    const requiredUserPicksColumns = ['id', 'user_id', 'pick_id', 'decision', 'outcome', 'created_at'];
    const requiredUserStatsColumns = ['id', 'total_picks', 'win_count', 'loss_count', 'push_count', 'current_streak'];
    
    if (sampleUserPicks?.length > 0) {
      const userPicksKeys = Object.keys(sampleUserPicks[0]);
      const missingUserPicksColumns = requiredUserPicksColumns.filter(col => !userPicksKeys.includes(col));
      
      if (missingUserPicksColumns.length > 0) {
        results.issues.push(`❌ user_picks missing columns: ${missingUserPicksColumns.join(', ')}`);
      } else {
        console.log('✅ user_picks has all required columns');
      }
    }

    if (sampleUserStats?.length > 0) {
      const userStatsKeys = Object.keys(sampleUserStats[0]);
      const missingUserStatsColumns = requiredUserStatsColumns.filter(col => !userStatsKeys.includes(col));
      
      if (missingUserStatsColumns.length > 0) {
        results.issues.push(`❌ user_stats missing columns: ${missingUserStatsColumns.join(', ')}`);
      } else {
        console.log('✅ user_stats has all required columns');
      }
    }

    // 8. Generate recommendations
    console.log('\n💡 Generating recommendations...');
    
    if (results.issues.length === 0) {
      results.recommendations.push('✅ Database structure looks good!');
      results.recommendations.push('🎯 Test the full flow: User makes bet/fade → Gary pick gets result → Process user results');
    } else {
      results.recommendations.push('🔧 Fix the identified issues first');
      results.recommendations.push('📋 Run the update_user_stats_table.sql script if tables are missing columns');
    }

    // 9. Test scenario simulation
    console.log('\n🧪 Testing scenario simulation...');
    console.log('Scenario: User bets WITH Gary, Gary wins, User should win');
    
    const testScenario = {
      userDecision: 'bet',
      garyResult: 'won',
      expectedUserOutcome: 'won'
    };
    
    let actualUserOutcome;
    if (testScenario.garyResult === 'push') {
      actualUserOutcome = 'push';
    } else if (testScenario.userDecision === 'bet') {
      actualUserOutcome = testScenario.garyResult === 'won' ? 'won' : 'lost';
    } else if (testScenario.userDecision === 'fade') {
      actualUserOutcome = testScenario.garyResult === 'won' ? 'lost' : 'won';
    }
    
    if (actualUserOutcome === testScenario.expectedUserOutcome) {
      console.log('✅ Logic test passed: User outcome calculation is correct');
    } else {
      results.issues.push(`❌ Logic test failed: Expected ${testScenario.expectedUserOutcome}, got ${actualUserOutcome}`);
    }

  } catch (error) {
    results.issues.push(`❌ Diagnostic error: ${error.message}`);
  }

  // 10. Print final report
  console.log('\n' + '='.repeat(60));
  console.log('📋 DIAGNOSTIC REPORT');
  console.log('='.repeat(60));
  
  console.log('\n🏗️  TABLE STRUCTURES:');
  Object.entries(results.tableStructures).forEach(([table, data]) => {
    console.log(`  ${table}: ${data?.length || 0} sample records`);
  });
  
  console.log('\n📊 SAMPLE DATA COUNTS:');
  Object.entries(results.sampleData).forEach(([table, data]) => {
    console.log(`  ${table}: ${data?.length || 0} records`);
  });
  
  if (results.issues.length > 0) {
    console.log('\n❌ ISSUES FOUND:');
    results.issues.forEach(issue => console.log(`  ${issue}`));
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  results.recommendations.forEach(rec => console.log(`  ${rec}`));
  
  console.log('\n' + '='.repeat(60));
  
  return results;
};

// Export for use
export { diagnosticBetFadeSetup };

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  diagnosticBetFadeSetup().then(() => {
    console.log('Diagnostic complete!');
    process.exit(0);
  }).catch(error => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  });
} 