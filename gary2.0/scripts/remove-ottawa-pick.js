#!/usr/bin/env node
/**
 * Remove Ottawa ML pick from today's daily picks
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

const today = '2026-01-07';
console.log(`🏒 Removing Ottawa ML pick for ${today}`);

try {
  // Get daily picks for today
  const { data, error } = await supabase
    .from('daily_picks')
    .select('id, picks')
    .eq('date', today)
    .limit(1);

  if (error) {
    console.error('❌ Error fetching:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️ No picks found for today');
    process.exit(0);
  }

  const row = data[0];
  let picks = typeof row.picks === 'string' ? JSON.parse(row.picks) : row.picks;
  console.log(`📊 Total picks before removal: ${picks.length}`);

  // Find Ottawa pick
  const ottawaPick = picks.find(p => 
    (p.awayTeam && p.awayTeam.toLowerCase().includes('ottawa')) || 
    (p.homeTeam && p.homeTeam.toLowerCase().includes('ottawa'))
  );

  if (!ottawaPick) {
    console.log('⚠️ No Ottawa pick found');
    console.log('Available NHL picks:');
    picks.filter(p => p.league === 'NHL' || p.sport === 'NHL').forEach(p => {
      console.log(`   - ${p.awayTeam} @ ${p.homeTeam} - ${p.pick}`);
    });
    process.exit(0);
  }

  console.log(`\n🎯 Found Ottawa pick to remove:`);
  console.log(`   ${ottawaPick.awayTeam} @ ${ottawaPick.homeTeam}`);
  console.log(`   Pick: ${ottawaPick.pick}`);
  console.log(`   League: ${ottawaPick.league || ottawaPick.sport}`);

  // Filter out the Ottawa pick
  const filteredPicks = picks.filter(p => p !== ottawaPick);
  console.log(`📊 Picks after removal: ${filteredPicks.length}`);

  // Update the row
  const { error: updateError } = await supabase
    .from('daily_picks')
    .update({ picks: filteredPicks, updated_at: new Date().toISOString() })
    .eq('id', row.id);

  if (updateError) {
    console.error('❌ Error updating:', updateError);
    process.exit(1);
  }

  console.log(`\n✅ Successfully removed Ottawa pick`);
  console.log(`   Remaining NHL picks: ${filteredPicks.filter(p => p.league === 'NHL' || p.sport === 'NHL').length}`);
  process.exit(0);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}

