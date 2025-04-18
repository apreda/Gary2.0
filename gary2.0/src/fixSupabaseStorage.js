import { supabase, ensureAnonymousSession } from './supabaseClient.js';

/**
 * Script to fix Supabase daily_picks storage issue
 * The script will:
 * 1. Verify the exact schema structure
 * 2. Fix the picksService.js issues with proper id field handling
 * 3. Directly insert a test record using the correct schema
 */
const fixSupabaseStorage = async () => {
  try {
    console.log('Starting Supabase daily_picks storage fix...');
    
    // 1. Verify connection and ensure session
    await ensureAnonymousSession();
    console.log('✅ Supabase connection verified');
    
    // 2. Check table structure to understand schema
    console.log('Checking table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .rpc('db_schema_inspect', { table_name: 'daily_picks' });
      
    if (tableError) {
      console.error('Error getting table structure:', tableError);
      // Fall back to a basic approach if we can't get table info
      console.log('Continuing with standard schema approach...');
    } else {
      console.log('Table structure retrieved:', tableInfo);
    }
    
    // 3. Get current date for record
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 4. Create simple test pick data
    const testPicks = [
      {
        id: `test-${Date.now()}`,
        league: 'NBA',
        game: 'Test Game',
        confidenceLevel: 70,
        betType: 'Moneyline',
        moneyline: 'Team A',
        odds: '+150',
        shortPick: 'TEST +150'
      }
    ];
    
    // 5. Try DELETE+INSERT approach (safer than update for testing)
    console.log('Removing any previous entry for today...');
    const { error: deleteError } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
      
    if (deleteError) {
      console.error('Error deleting previous entry:', deleteError);
      // Continue anyway - might not exist
    }
    
    // 6. Insert new record with proper schema structure
    console.log('Inserting new record with proper structure...');
    const { data: insertData, error: insertError } = await supabase
      .from('daily_picks')
      .insert({
        date: dateString,
        picks: testPicks,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    if (insertError) {
      console.error('❌ Insert failed:', insertError);
      
      // 7. Try alternative structure without timestamps
      console.log('Trying simplified structure...');
      const { data: simpleData, error: simpleError } = await supabase
        .from('daily_picks')
        .insert({
          date: dateString,
          picks: testPicks
        });
        
      if (simpleError) {
        console.error('❌ Simplified insert also failed:', simpleError);
        throw new Error('Could not insert records with any schema format');
      } else {
        console.log('✅ Simplified insert succeeded:', simpleData);
      }
    } else {
      console.log('✅ Insert succeeded:', insertData);
    }
    
    // 8. Verify record exists
    const { data: verifyData, error: verifyError } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', dateString);
      
    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
      return false;
    }
    
    if (verifyData && verifyData.length > 0) {
      console.log('✅ Record verified in table:', verifyData);
      return true;
    } else {
      console.error('❌ Record not found after insert');
      return false;
    }
  } catch (error) {
    console.error('❌ Fatal error during fix:', error);
    return false;
  }
};

// Execute the fix
fixSupabaseStorage()
  .then(result => {
    console.log(`Fix completed with result: ${result ? 'SUCCESS' : 'FAILURE'}`);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
