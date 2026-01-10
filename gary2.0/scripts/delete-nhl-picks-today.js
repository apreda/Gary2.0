#!/usr/bin/env node
/**
 * Delete today's NHL picks from Supabase
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

// Now import supabase
const { supabase } = await import('../src/supabaseClient.js');

const today = new Date().toISOString().split('T')[0];
console.log(`🏒 Deleting NHL picks for ${today}`);

try {
  // Get daily picks for today
  const { data, error } = await supabase
    .from('daily_picks')
    .select('id, picks')
    .eq('date', today)
    .limit(1);

  if (error) {
    console.error('Error fetching:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️ No picks found for today');
    process.exit(0);
  }

  const row = data[0];
  let picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
  console.log(`📊 Total picks before filter: ${picks.length}`);

  // Count NHL picks
  const nhlPicks = picks.filter(p => p.league === 'NHL' || p.sport === 'NHL');
  console.log(`🏒 NHL picks found: ${nhlPicks.length}`);
  
  if (nhlPicks.length === 0) {
    console.log('✅ No NHL picks to delete');
    process.exit(0);
  }

  // Show which NHL picks will be deleted
  nhlPicks.forEach(p => {
    console.log(`   - ${p.awayTeam} @ ${p.homeTeam} - ${p.pick}`);
  });

  // Filter out NHL picks
  const nonNHLPicks = picks.filter(p => p.league !== 'NHL' && p.sport !== 'NHL');
  console.log(`📊 Picks after filter: ${nonNHLPicks.length}`);

  // Update the row with filtered picks
  const { error: updateError } = await supabase
    .from('daily_picks')
    .update({ picks: nonNHLPicks, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  if (updateError) {
    console.error('❌ Error updating:', updateError);
    process.exit(1);
  }

  console.log(`\n✅ Successfully deleted ${nhlPicks.length} NHL pick(s)`);
  process.exit(0);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}

