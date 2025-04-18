import { supabase, ensureAnonymousSession } from './supabaseClient.js';

/**
 * Direct test script to verify picks can be inserted into daily_picks table
 */
const testDirectInsert = async () => {
  try {
    console.log('Testing direct insert to daily_picks table...');
    
    // Ensure we have a valid Supabase session
    console.log('Verifying Supabase session...');
    await ensureAnonymousSession();
    
    // Get current date in YYYY-MM-DD format
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];
    console.log('Using date:', dateString);
    
    // Create a simple test pick
    const testPicks = [
      {
        id: `test-${Date.now()}`,
        league: 'NBA',
        game: 'Test Team vs Another Team',
        betType: 'Moneyline',
        moneyline: 'Test Team',
        odds: '+150',
        confidenceLevel: 'High',
        wagerAmount: 300,
        shortPick: 'TEST ML +150',
        result: 'pending'
      }
    ];
    
    // First delete any existing test records
    console.log('Removing any existing test records...');
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString)
      .eq('test_record', true);
      
    if (deleteError) {
      console.error('Error deleting test records:', deleteError);
    }
    
    // Create a new record with explicit schema structure
    console.log('Creating test record with proper schema structure...');
    const { data, error } = await supabase
      .from('daily_picks')
      .insert([{
        id: dateString,  // Explicitly set ID to date string
        date: dateString,
        picks: testPicks,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        test_record: true  // Mark as test record
      }])
      .select();
      
    if (error) {
      console.error('❌ ERROR inserting into daily_picks:', error);
      
      // Try alternative approach with upsert
      console.log('Attempting upsert approach instead...');
      const { data: upsertData, error: upsertError } = await supabase
        .from('daily_picks')
        .upsert([{
          id: dateString,
          date: dateString,
          picks: testPicks,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          test_record: true
        }])
        .select();
        
      if (upsertError) {
        console.error('❌ Upsert also failed:', upsertError);
        throw new Error('Both insert and upsert failed');
      } else {
        console.log('✅ Upsert succeeded:', upsertData);
        return true;
      }
    } else {
      console.log('✅ Insert succeeded:', data);
      return true;
    }
  } catch (error) {
    console.error('❌ Fatal error during test:', error);
    return false;
  }
};

// Execute the test
testDirectInsert()
  .then(result => {
    console.log(`Test completed with result: ${result ? 'SUCCESS' : 'FAILURE'}`);
    // Exit with appropriate code for scripting
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
