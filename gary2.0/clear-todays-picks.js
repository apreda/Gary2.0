import { supabase } from './src/supabaseClient.js';

async function clearTodaysPicks() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`🗑️  Clearing picks for ${today}...`);
    
    const { error } = await supabase
      .from('daily_picks')
      .delete()
      .eq('date', today);
    
    if (error) {
      console.error('❌ Error clearing picks:', error);
    } else {
      console.log('✅ Successfully cleared today\'s picks');
    }
  } catch (err) {
    console.error('❌ Failed to clear picks:', err);
  } finally {
    process.exit(0);
  }
}

clearTodaysPicks(); 