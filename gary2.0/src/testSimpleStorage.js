import { supabase } from './supabaseClient.js';

/**
 * Test storage with extremely simplified data format
 */
const testSimpleStorage = async () => {
  console.log('TESTING WITH SIMPLIFIED DATA FORMAT');
  console.log('=================================');
  
  try {
    // Get current date
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`Testing with date: ${dateString}`);
    
    // Create test pick with minimal data structure
    const testPick = {
      id: `simple-test-${Date.now()}`,
      league: 'NBA',
      shortPick: 'MIL ML -110',
      result: 'pending'
    };
    
    // Try a variety of data formats to see which one works
    console.log('Trying multiple data formats to find working approach...');
    
    // 1. Delete any existing record first
    console.log('Cleaning up any existing records...');
    await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
    
    // 2. Simple approach with minimal fields and string for picks
    console.log('FORMAT 1: Simple record with JSON stringify');
    try {
      const { error: error1 } = await supabase
        .from('daily_picks')
        .insert({
          date: dateString,
          picks: JSON.stringify([testPick])
        });
        
      if (error1) {
        console.log('Format 1 failed:', error1.message);
      } else {
        console.log('✅ FORMAT 1 SUCCEEDED');
        return true;
      }
    } catch (err) {
      console.log('Error with Format 1:', err.message);
    }
    
    // Clean up between tests
    await supabase.from('daily_picks').delete().eq('date', dateString);
    
    // 3. Try with an array of objects directly
    console.log('FORMAT 2: Direct array insert');
    try {
      const { error: error2 } = await supabase
        .from('daily_picks')
        .insert({
          date: dateString,
          picks: [testPick]
        });
        
      if (error2) {
        console.log('Format 2 failed:', error2.message);
      } else {
        console.log('✅ FORMAT 2 SUCCEEDED');
        return true;
      }
    } catch (err) {
      console.log('Error with Format 2:', err.message);
    }
    
    // Clean up between tests
    await supabase.from('daily_picks').delete().eq('date', dateString);
    
    // 4. Try simple string without JSON structure
    console.log('FORMAT 3: Simple string data');
    try {
      const { error: error3 } = await supabase
        .from('daily_picks')
        .insert({
          date: dateString,
          picks: 'MIL ML -110'
        });
        
      if (error3) {
        console.log('Format 3 failed:', error3.message);
      } else {
        console.log('✅ FORMAT 3 SUCCEEDED');
        return true;
      }
    } catch (err) {
      console.log('Error with Format 3:', err.message);
    }
    
    // Clean up between tests
    await supabase.from('daily_picks').delete().eq('date', dateString);
    
    // 5. Try with array syntax but as string
    console.log('FORMAT 4: Array string');
    try {
      const { error: error4 } = await supabase
        .from('daily_picks')
        .insert({
          date: dateString,
          picks: '[{"id":"test-simple","league":"NBA","shortPick":"MIL ML -110"}]'
        });
        
      if (error4) {
        console.log('Format 4 failed:', error4.message);
      } else {
        console.log('✅ FORMAT 4 SUCCEEDED');
        return true;
      }
    } catch (err) {
      console.log('Error with Format 4:', err.message);
    }
    
    // 6. Try with null value to see if that's accepted
    console.log('FORMAT 5: Null value');
    try {
      const { error: error5 } = await supabase
        .from('daily_picks')
        .insert({
          date: dateString,
          picks: null
        });
        
      if (error5) {
        console.log('Format 5 failed:', error5.message);
      } else {
        console.log('✅ FORMAT 5 SUCCEEDED');
        return true;
      }
    } catch (err) {
      console.log('Error with Format 5:', err.message);
    }
    
    console.log('❌ ALL FORMATS FAILED');
    return false;
  } catch (error) {
    console.error('Test error:', error);
    return false;
  }
};

// Run the test
testSimpleStorage()
  .then(success => {
    console.log(`\nOverall result: ${success ? 'SUCCESS ✅' : 'FAILURE ❌'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
