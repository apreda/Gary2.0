#!/usr/bin/env node
/**
 * Local script to generate NBA player prop picks
 * Stores results in Supabase prop_picks table
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

// Get EST date
function estToday() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

async function main() {
  console.log('🏀 NBA Player Props Generation');
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

  const dateParam = estToday();
  const limit = 10;

  console.log(`📅 Date: ${dateParam}`);
  console.log(`🎯 Target: NBA player props`);
  console.log(`📊 Limit: ${limit} picks\n`);

  // Import services
  const { ballDontLieOddsService } = await import('../src/services/ballDontLieOddsService.js');
  const { propPicksService } = await import('../src/services/propPicksService.js');

  // Filter to games within next 36h
  const now = new Date();
  const horizon = new Date(now.getTime() + 36 * 60 * 60 * 1000).getTime();

  let allPropPicks = [];

  try {
    // Fetch NBA games
    console.log('📡 Fetching NBA games...');
    const games = await ballDontLieOddsService.getGamesWithOddsForSport('basketball_nba', dateParam);
    console.log(`✅ Found ${games.length} NBA games\n`);

    const gamesToProcess = games.filter(g => {
      const t = new Date(g.commence_time).getTime();
      return isFinite(t) && t <= horizon;
    });
    console.log(`🎮 Processing ${gamesToProcess.length} games (within 36h window)\n`);

    for (const game of gamesToProcess) {
      const matchup = `${game.away_team} @ ${game.home_team}`;
      console.log(`\n🏀 Processing: ${matchup}`);
      console.log(`   Time: ${new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);

      try {
        const picks = await propPicksService.generatePropBets({
          sport: 'basketball_nba',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          time: game.commence_time
        });

        if (Array.isArray(picks) && picks.length > 0) {
          allPropPicks.push(...picks);
          console.log(`   ✅ Generated ${picks.length} prop picks`);
          picks.forEach(p => {
            console.log(`      • ${p.player}: ${p.bet.toUpperCase()} ${p.prop} (${p.odds}) - ${(p.confidence * 100).toFixed(0)}% conf`);
          });
        } else {
          console.log(`   ⚠️ No prop picks generated`);
        }
      } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
      }
    }

    if (allPropPicks.length === 0) {
      console.log('\n❌ No prop picks generated across all games');
      process.exit(0);
    }

    // Sort by confidence and take top picks
    const sorted = allPropPicks.sort((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : parseFloat(a.confidence) || 0;
      const cb = typeof b.confidence === 'number' ? b.confidence : parseFloat(b.confidence) || 0;
      if (cb !== ca) return cb - ca;
      return (b.ev || 0) - (a.ev || 0);
    });
    const topPicks = sorted.slice(0, limit);

    console.log(`\n📊 Top ${topPicks.length} picks (sorted by confidence):`);
    topPicks.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.player}: ${p.bet.toUpperCase()} ${p.prop} (${p.odds}) - ${(p.confidence * 100).toFixed(0)}%`);
    });

    // Store in Supabase
    console.log('\n💾 Storing picks in Supabase...');

    // Delete existing picks for today
    const { error: delError } = await supabase
      .from('prop_picks')
      .delete()
      .eq('date', dateParam);

    if (delError) {
      console.warn(`   ⚠️ Delete warning: ${delError.message}`);
    }

    // Insert new picks
    const { error: insertError } = await supabase
      .from('prop_picks')
      .insert({
        date: dateParam,
        picks: topPicks,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error(`   ❌ Insert error: ${insertError.message}`);
      process.exit(1);
    }

    console.log(`   ✅ Stored ${topPicks.length} picks for ${dateParam}`);
    console.log('\n🎉 Done! Picks are now available in Supabase.');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

