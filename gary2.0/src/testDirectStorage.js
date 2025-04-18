import { supabase, ensureAnonymousSession } from './supabaseClient.js';

/**
 * Direct test of Supabase storage functionality without dependencies
 */
const testDirectDailyPicksStorage = async () => {
  console.log('DIRECT SUPABASE STORAGE TEST');
  console.log('===========================');
  
  try {
    // Get current date for the record
    const todayDate = new Date();
    const dateString = todayDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = new Date().toISOString();
    
    console.log(`Testing with date: ${dateString}`);
    
    // Create simple test picks data
    const testPicks = [
      {
        id: `test-direct-${Date.now()}`,
        league: 'NBA',
        game: 'Boston Celtics vs Miami Heat',
        betType: 'Moneyline',
        moneyline: 'Boston Celtics',
        odds: '-180',
        confidenceLevel: 'High',
        shortPick: 'BOS ML -180',
        result: 'pending'
      }
    ];
    
    console.log(`Created ${testPicks.length} test picks`);
    
    // 1. Ensure Supabase connection
    console.log('Verifying Supabase connection...');
    const connectionVerified = await ensureAnonymousSession();
    if (!connectionVerified) {
      console.error('Supabase connection failed - test cannot continue');
      return false;
    }
    console.log('Supabase connection verified');
    
    // 2. Clean up any existing record for today
    console.log('Cleaning up any existing record for today...');
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
      
    if (deleteError) {
      console.warn('Warning during cleanup:', deleteError);
      // Continue anyway
    }
    
    // 3. Try direct insert approach from picksPersistenceService.js
    console.log('Inserting test picks with known working approach...');
    let success = false;
    
    try {
      // Direct insert with the approach from picksPersistenceService.js
      const { data, error } = await supabase
        .from('daily_picks')
        .insert([{ 
          date: dateString, 
          picks: testPicks,
          created_at: timestamp,
          updated_at: timestamp
        }]);
        
      if (error) {
        console.error('Direct insert failed:', error);
        
        // Try fallback approach with stringified picks
        console.log('Trying fallback approach with stringified picks...');
        const { error: fallbackError } = await supabase
          .from('daily_picks')
          .insert([{ 
            date: dateString, 
            picks: JSON.stringify(testPicks)
          }]);
          
        if (fallbackError) {
          console.error('Fallback approach also failed:', fallbackError);
          throw new Error('All direct insert approaches failed');
        } else {
          console.log('Fallback approach succeeded');
          success = true;
        }
      } else {
        console.log('Direct insert succeeded');
        success = true;
      }
    } catch (insertError) {
      console.error('Critical error during insert:', insertError);
      return false;
    }
    
    // 4. Verify the record exists
    if (success) {
      console.log('Verifying record exists...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('daily_picks')
        .select('date')
        .eq('date', dateString);
        
      if (verifyError) {
        console.error('Verification error:', verifyError);
        return false;
      }
      
      if (!verifyData || verifyData.length === 0) {
        console.error('Verification failed - no record found');
        return false;
      }
      
      console.log('✅ SUCCESS: Record verified in database');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Test error:', error);
    return false;
  }
};

// Run the test
testDirectDailyPicksStorage()
  .then(success => {
    console.log(`\nTest result: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
