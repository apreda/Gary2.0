const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Check recent game_results
  const { data: gameResults, error: gameError } = await supabase
    .from('game_results')
    .select('game_date, pick_text, result')
    .order('game_date', { ascending: false })
    .limit(10);
  
  console.log('\n📋 RECENT GAME RESULTS:');
  if (gameError) {
    console.log('  Error:', gameError.message);
  } else if (gameResults?.length) {
    gameResults.forEach(r => {
      const emoji = r.result === 'won' ? '✅' : r.result === 'push' ? '🟡' : '❌';
      console.log('  ' + r.game_date + ' | ' + emoji + ' ' + r.pick_text);
    });
  } else {
    console.log('  No game results found');
  }
  
  // Check daily_picks for Dec 14
  const { data: dailyPicks } = await supabase
    .from('daily_picks')
    .select('date, picks')
    .eq('date', '2025-12-14');
  
  console.log('\n📋 DAILY PICKS for 2025-12-14:');
  if (dailyPicks?.length) {
    console.log('  Found ' + dailyPicks.length + ' pick rows');
    dailyPicks.forEach(row => {
      const picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
      console.log('  Contains ' + picks?.length + ' picks');
    });
  } else {
    console.log('  No daily picks found for this date');
  }
})();
