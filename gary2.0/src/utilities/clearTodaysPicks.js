// One-time utility script to clear today's picks from Supabase
import { supabase, ensureAnonymousSession } from '../supabaseClient';

async function clearTodaysPicks() {
  try {
    console.log('Starting to clear today\'s picks from Supabase...');
    
    // Ensure we have an anonymous session
    await ensureAnonymousSession();
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`Deleting picks for date: ${dateString}`);
    
    // Delete today's entry from Supabase
    const { error } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', dateString);
    
    if (error) {
      console.error('Error deleting picks:', error);
      return false;
    }
    
    console.log('Successfully deleted today\'s picks from Supabase');
    return true;
  } catch (err) {
    console.error('Unexpected error clearing picks:', err);
    return false;
  }
}

// Auto-execute the function
clearTodaysPicks()
  .then(success => {
    if (success) {
      console.log('✅ CLEANUP COMPLETE: Today\'s picks have been cleared from Supabase');
      console.log('Please refresh the app to generate new picks with updated formatting');
    } else {
      console.log('❌ CLEANUP FAILED: Unable to clear today\'s picks');
    }
  })
  .catch(err => {
    console.error('Script execution failed:', err);
  });

export default clearTodaysPicks;
