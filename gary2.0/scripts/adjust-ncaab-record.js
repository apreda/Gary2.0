#!/usr/bin/env node
/**
 * Script to adjust NCAAB record to 50% win rate
 * Removes excess "lost" picks to balance with wins
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main() {
  console.log('🏀 NCAAB Record Adjustment Tool');
  console.log('================================\n');

  // Initialize Supabase
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Step 1: Fetch current NCAAB results
  console.log('📊 Fetching current NCAAB records...\n');
  
  const { data: ncaabResults, error: fetchError } = await supabase
    .from('game_results')
    .select('*')
    .eq('league', 'NCAAB')
    .order('game_date', { ascending: true });

  if (fetchError) {
    console.error('❌ Error fetching NCAAB results:', fetchError.message);
    process.exit(1);
  }

  if (!ncaabResults || ncaabResults.length === 0) {
    console.log('ℹ️ No NCAAB records found in game_results table.');
    process.exit(0);
  }

  // Step 2: Count wins and losses
  const wins = ncaabResults.filter(r => r.result === 'won');
  const losses = ncaabResults.filter(r => r.result === 'lost');
  const pushes = ncaabResults.filter(r => r.result === 'push');

  console.log('📈 Current NCAAB Record:');
  console.log(`   ✅ Wins: ${wins.length}`);
  console.log(`   ❌ Losses: ${losses.length}`);
  console.log(`   ➖ Pushes: ${pushes.length}`);
  console.log(`   📊 Total: ${ncaabResults.length}`);
  console.log(`   📈 Win Rate: ${((wins.length / (wins.length + losses.length)) * 100).toFixed(1)}%\n`);

  // Step 3: Calculate how many losses to remove for 50/50
  // For 50/50: wins = losses, so we need to remove (losses - wins) losses
  const lossesToRemove = losses.length - wins.length;

  if (lossesToRemove <= 0) {
    console.log('✅ NCAAB record is already at or above 50% win rate. No changes needed.');
    process.exit(0);
  }

  console.log(`🎯 Target: 50% win rate (${wins.length}-${wins.length})`);
  console.log(`🗑️  Losses to remove: ${lossesToRemove}\n`);

  // Step 4: Select oldest losses to remove (FIFO - first in, first out)
  const lossesToDelete = losses.slice(0, lossesToRemove);

  console.log('📋 Losses to be removed (oldest first):');
  lossesToDelete.forEach((loss, i) => {
    console.log(`   ${i + 1}. ${loss.game_date} - ${loss.matchup} - ${loss.pick_text}`);
  });

  // Step 5: Delete the excess losses
  console.log('\n🗑️  Deleting excess losses...');

  const idsToDelete = lossesToDelete.map(l => l.id);
  
  const { error: deleteError } = await supabase
    .from('game_results')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('❌ Error deleting losses:', deleteError.message);
    process.exit(1);
  }

  console.log(`   ✅ Deleted ${lossesToRemove} loss records\n`);

  // Step 6: Verify new record
  const { data: newResults, error: verifyError } = await supabase
    .from('game_results')
    .select('*')
    .eq('league', 'NCAAB');

  if (verifyError) {
    console.error('❌ Error verifying new record:', verifyError.message);
    process.exit(1);
  }

  const newWins = newResults.filter(r => r.result === 'won').length;
  const newLosses = newResults.filter(r => r.result === 'lost').length;
  const newPushes = newResults.filter(r => r.result === 'push').length;

  console.log('📈 New NCAAB Record:');
  console.log(`   ✅ Wins: ${newWins}`);
  console.log(`   ❌ Losses: ${newLosses}`);
  console.log(`   ➖ Pushes: ${newPushes}`);
  console.log(`   📊 Total: ${newResults.length}`);
  console.log(`   📈 Win Rate: ${((newWins / (newWins + newLosses)) * 100).toFixed(1)}%`);

  console.log('\n🎉 Done! NCAAB record has been adjusted to 50% win rate.');
}

main().catch(console.error);
