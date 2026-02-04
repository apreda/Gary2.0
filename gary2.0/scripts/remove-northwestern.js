import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function removeNorthwestern() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_picks')
    .select('*')
    .eq('date', today);

  if (error) {
    console.error('Error fetching:', error);
    return;
  }

  console.log('Found', data?.length, 'records for today');

  for (const record of data || []) {
    const picks = record.picks || [];
    const hasNorthwestern = picks.some(p => p.pick?.includes('Northwestern') && (p.sport === 'NCAAB' || p.sport === 'basketball_ncaab'));

    if (hasNorthwestern) {
      console.log('Found Northwestern pick in record', record.id);
      const filteredPicks = picks.filter(p => {
        const isNorthwesternNcaab = p.pick?.includes('Northwestern') && (p.sport === 'NCAAB' || p.sport === 'basketball_ncaab');
        return !isNorthwesternNcaab;
      });
      console.log('Removing Northwestern, keeping', filteredPicks.length, 'picks');

      const { error: updateError } = await supabase
        .from('daily_picks')
        .update({ picks: filteredPicks })
        .eq('id', record.id);

      if (updateError) {
        console.error('Update error:', updateError);
      } else {
        console.log('Successfully removed Northwestern pick');
      }
    }
  }
}

removeNorthwestern();
