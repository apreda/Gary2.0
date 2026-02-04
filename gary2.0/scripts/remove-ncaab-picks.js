import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function removeNCAABPicks() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', today);

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log('Found', data?.length, 'records for today:', today);

  for (const record of data || []) {
    const picks = record.picks || [];
    console.log('Record', record.id, 'has', picks.length, 'picks');

    // Show all picks with their sport
    picks.forEach((p, i) => console.log('  ', i+1, p.sport, '-', p.pick?.substring(0, 40)));

    // Filter out NCAAB picks only
    const ncaabPicks = picks.filter(p => p.sport === 'basketball_ncaab' || p.sport === 'NCAAB');
    const otherPicks = picks.filter(p => p.sport !== 'basketball_ncaab' && p.sport !== 'NCAAB');

    if (ncaabPicks.length > 0) {
      console.log('\nRemoving', ncaabPicks.length, 'NCAAB picks:');
      ncaabPicks.forEach(p => console.log('  - ', p.pick));
      console.log('Keeping', otherPicks.length, 'other picks');

      const { error: updateError } = await supabase
        .from('daily_picks')
        .update({ picks: otherPicks })
        .eq('id', record.id);

      if (updateError) {
        console.error('Update error:', updateError);
      } else {
        console.log('Successfully removed NCAAB picks');
      }
    } else {
      console.log('No NCAAB picks found');
    }
  }
}

removeNCAABPicks();
