const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { createClient } = require('@supabase/supabase-js');

console.log('URL:', process.env.VITE_SUPABASE_URL ? 'Set' : 'Missing');
console.log('KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const dateStr = process.argv[2] || '2025-12-13';
  const { data, error } = await supabase
    .from('prop_results')
    .select('player_name, prop_type, actual_value, result, created_at')
    .eq('game_date', dateStr)
    .order('created_at', { ascending: false });

  console.log('\nProp results for ' + dateStr + ':');
  data?.forEach(r => {
    const emoji = r.result === 'won' ? '✅' : r.result === 'push' ? '🟡' : '❌';
    console.log('  ' + emoji + ' ' + r.player_name + ': ' + r.prop_type + ' = ' + r.actual_value + ' (' + r.result + ')');
  });
  
  const won = data?.filter(r => r.result === 'won').length || 0;
  const lost = data?.filter(r => r.result === 'lost').length || 0;
  console.log('\nTotal: ' + (data?.length || 0) + ' results');
  console.log('Record: ' + won + '-' + lost);
})();
