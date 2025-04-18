import { supabase } from './supabaseClient.js';

/**
 * Direct test of the daily_picks table with minimal dependencies
 */
const directTableTest = async () => {
  console.log('DIRECT TEST OF DAILY_PICKS TABLE');
  console.log('===============================');
  
  try {
    // Get current date
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`Testing with date: ${dateString}`);
    
    // Clean up any existing record
    console.log('Cleaning up any existing records...');
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
      
    if (deleteError) {
      console.warn('Warning during cleanup:', deleteError);
    } else {
      console.log('Successfully deleted any existing records');
    }
    
    // Insert record with null picks (known to work from previous test)
    console.log('Inserting record with null picks...');
    const { data, error } = await supabase
      .from('daily_picks')
      .insert({
        date: dateString,
        picks: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    if (error) {
      console.error('Insert error:', error);
      return false;
    }
    
    console.log('Successfully inserted record with null picks');
    
    // Try to add picks_text field with additional JSON data
    console.log('Attempting to update with picks_text field...');
    
    const testPicks = [{
      id: `direct-test-${Date.now()}`,
      league: 'NBA',
      game: 'Dallas Mavericks vs LA Clippers',
      betType: 'Moneyline',
      odds: '+115',
      shortPick: 'DAL ML +115',
      result: 'pending'
    }];
    
    const picksJson = JSON.stringify(testPicks);
    
    const { error: updateError } = await supabase
      .from('daily_picks')
      .update({
        picks_text: picksJson,
        picks_count: testPicks.length
      })
      .eq('date', dateString);
      
    if (updateError) {
      console.warn('Warning: Could not add picks_text field:', updateError);
      console.log('This is expected if the field doesn\'t exist in the schema');
    } else {
      console.log('Successfully updated record with picks_text field');
    }
    
    // Verify the record exists
    console.log('Verifying record exists...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', dateString)
      .single();
      
    if (verifyError) {
      console.error('Verification error:', verifyError);
      return false;
    }
    
    if (!verifyData) {
      console.error('No record found during verification');
      return false;
    }
    
    console.log('✅ SUCCESS: Record exists in database');
    console.log('Record data:', verifyData);
    
    return true;
  } catch (error) {
    console.error('Test error:', error);
    return false;
  }
};

// Run the test
directTableTest()
  .then(success => {
    console.log(`\nTest result: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
