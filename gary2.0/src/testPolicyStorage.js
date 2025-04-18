import { supabase } from './supabaseClient.js';

/**
 * Test to verify storage with the RLS policy in place
 */
const testPolicyStorage = async () => {
  console.log('TESTING STORAGE WITH RLS POLICY');
  console.log('==============================');
  
  try {
    // Get current date
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = today.toISOString();
    
    console.log(`Testing with date: ${dateString}`);
    
    // Create test pick
    const testPicks = [{
      id: `policy-test-${Date.now()}`,
      league: 'NBA',
      game: 'Milwaukee Bucks vs Philadelphia 76ers',
      betType: 'Moneyline',
      moneyline: 'Milwaukee Bucks',
      odds: '-110',
      confidenceLevel: 70,
      shortPick: 'MIL ML -110',
      result: 'pending'
    }];
    
    console.log(`Created ${testPicks.length} test pick(s)`);
    
    // 1. First delete any existing record (clean slate)
    console.log('Deleting any existing records for today...');
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
      
    if (deleteError) {
      console.warn('Warning during delete operation:', deleteError);
    } else {
      console.log('Successfully deleted any existing records');
    }
    
    // 2. Insert new record with the test pick
    console.log('Inserting test pick with simple direct approach...');
    const { error } = await supabase
      .from('daily_picks')
      .insert({
        date: dateString,
        picks: testPicks,
        created_at: timestamp,
        updated_at: timestamp
      });
      
    if (error) {
      console.error('Error inserting test pick:', error);
      throw error;
    }
    
    console.log('Successfully inserted test pick');
    
    // 3. Verify the pick was stored
    console.log('Verifying pick was stored...');
    const { data, error: selectError } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', dateString)
      .single();
      
    if (selectError) {
      console.error('Error verifying pick was stored:', selectError);
      throw selectError;
    }
    
    if (!data) {
      console.error('No data found after insert');
      return false;
    }
    
    console.log('✅ SUCCESS: Verified pick was stored in database');
    console.log('Stored record:', data);
    return true;
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    return false;
  }
};

// Run the test
testPolicyStorage()
  .then(success => {
    console.log(`\nTest result: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
