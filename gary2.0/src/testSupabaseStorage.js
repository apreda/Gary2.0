import { supabase } from './supabaseClient.js';

/**
 * Direct test for Supabase daily_picks storage without picksService dependencies
 */
const testDirectSupabaseStorage = async () => {
  console.log('SUPABASE STORAGE TEST - Direct Connection');
  console.log('======================================');
  
  try {
    // Get current date in YYYY-MM-DD format
    const todayDate = new Date();
    const dateString = todayDate.toISOString().split('T')[0]; // e.g., "2025-04-17"
    console.log(`Testing with date: ${dateString}`);
    
    // Create a simple test pick
    const testPicks = [
      {
        id: `test-${Date.now()}`,
        league: 'NBA',
        game: 'Denver Nuggets vs Dallas Mavericks',
        betType: 'Moneyline',
        moneyline: 'Denver Nuggets',
        odds: '-125',
        confidenceLevel: 'High',
        wagerAmount: 300,
        shortPick: 'DEN ML -125',
        result: 'pending'
      }
    ];
    
    // STEP 1: Clean up - delete any existing test record
    console.log('Step 1: Removing any existing records for today...');
    try {
      const { error: deleteError } = await supabase
        .from('daily_picks')
        .delete()
        .eq('date', dateString);
        
      if (deleteError) {
        console.error('Warning - Delete operation error:', deleteError);
        console.log('Continuing despite delete error');
      } else {
        console.log('Successfully cleared any existing records');
      }
    } catch (deleteErr) {
      console.error('Unexpected delete error:', deleteErr);
      console.log('Continuing to insert step');
    }
    
    // STEP 2: Create record with minimal approach
    console.log('Step 2: Creating new record with minimal fields...');
    
    // Minimal record with just date and picks
    const simpleRecord = {
      date: dateString,
      picks: testPicks
    };
    
    let insertSuccess = false;
    
    try {
      const { data, error } = await supabase
        .from('daily_picks')
        .insert(simpleRecord);
        
      if (error) {
        console.error('Simple insert error:', error);
        
        // Try stringified approach
        console.log('Trying with stringified picks...');
        const stringRecord = {
          date: dateString,
          picks: JSON.stringify(testPicks)
        };
        
        const { data: stringData, error: stringError } = await supabase
          .from('daily_picks')
          .insert(stringRecord);
          
        if (stringError) {
          console.error('Stringified insert error:', stringError);
          throw new Error('Both insert approaches failed');
        } else {
          console.log('Stringified insert succeeded');
          insertSuccess = true;
        }
      } else {
        console.log('Simple insert succeeded');
        insertSuccess = true;
      }
    } catch (insertErr) {
      console.error('Fatal insert error:', insertErr);
      return false;
    }
    
    // STEP 3: Verify the record exists
    console.log('Step 3: Verifying the record was created...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('daily_picks')
      .select('date')
      .eq('date', dateString);
      
    if (verifyError) {
      console.error('Verification error:', verifyError);
      return insertSuccess; // Return insert result since verification failed
    }
    
    if (!verifyData || verifyData.length === 0) {
      console.error('Verification failed: No records found');
      return false;
    }
    
    console.log(`Verification successful! Found ${verifyData.length} records for date ${dateString}`);
    return true;
  } catch (error) {
    console.error('Test error:', error);
    return false;
  }
};

// Execute the test
testDirectSupabaseStorage()
  .then(result => {
    console.log(`\nTest result: ${result ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
