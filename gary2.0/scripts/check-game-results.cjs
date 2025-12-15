const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const dateStr = process.argv[2] || '2025-12-14';
  
  // Check game_results
  const { data: gameResults } = await supabase
    .from('game_results')
    .select('pick_text, result, home_score, away_score')
    .eq('game_date', dateStr);
  
  // Check nfl_results  
  const { data: nflResults } = await supabase
    .from('nfl_results')
    .select('pick_text, result, home_score, away_score')
    .gte('game_date', '2025-12-08')
    .lte('game_date', '2025-12-15');
  
  console.log('\n📋 GAME RESULTS for ' + dateStr + ':');
  if (gameResults?.length) {
    gameResults.forEach(r => {
      const emoji = r.result === 'won' ? '✅' : r.result === 'push' ? '🟡' : '❌';
      console.log('  ' + emoji + ' ' + r.pick_text + ' (' + r.result + ')');
    });
    const won = gameResults.filter(r => r.result === 'won').length;
    const lost = gameResults.filter(r => r.result === 'lost').length;
    console.log('\n  Total: ' + gameResults.length + ' | Record: ' + won + '-' + lost);
  } else {
    console.log('  No game results found');
  }
  
  console.log('\n🏈 NFL RESULTS (Week 15):');
  if (nflResults?.length) {
    nflResults.forEach(r => {
      const emoji = r.result === 'won' ? '✅' : r.result === 'push' ? '🟡' : '❌';
      console.log('  ' + emoji + ' ' + r.pick_text + ' (' + r.result + ')');
    });
    const won = nflResults.filter(r => r.result === 'won').length;
    const lost = nflResults.filter(r => r.result === 'lost').length;
    console.log('\n  Total: ' + nflResults.length + ' | Record: ' + won + '-' + lost);
  } else {
    console.log('  No NFL results found');
  }
})();
