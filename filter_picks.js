const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: 'gary2.0/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const date = '2025-12-31';
  const { data, error } = await supabase
    .from('daily_picks')
    .select('picks')
    .eq('date', date)
    .single();

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  const filteredPicks = data.picks.filter(p => {
    const pickStr = p.pick || '';
    const shouldRemove = 
      pickStr.includes('New York Knicks ML') || 
      pickStr.includes('New Orleans Pelicans +1.5') || 
      pickStr.includes('Golden State Warriors -6.5');
    return !shouldRemove;
  });

  console.log('Original count:', data.picks.length);
  console.log('Filtered count:', filteredPicks.length);

  const { error: updateError } = await supabase
    .from('daily_picks')
    .update({ picks: filteredPicks })
    .eq('date', date);

  if (updateError) {
    console.error('Error updating:', updateError);
  } else {
    console.log('Successfully updated picks!');
  }
}

run();
