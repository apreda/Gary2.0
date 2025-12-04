#!/usr/bin/env node
/**
 * Local script to generate player prop picks for NBA and NFL
 * Stores results in Supabase prop_picks table with sport-specific entries
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

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

// Parse command line args
const args = process.argv.slice(2);
const sportArg = args.find(a => a.startsWith('--sport='))?.split('=')[1] || 'all';
const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');

async function main() {
  console.log('🏈🏀 Player Props Generation');
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

  // Determine which sports to process
  const sportsToProcess = sportArg === 'all' 
    ? ['basketball_nba', 'americanfootball_nfl']
    : [sportArg === 'nba' ? 'basketball_nba' : 'americanfootball_nfl'];

  console.log(`📅 Date: ${dateParam}`);
  console.log(`🎯 Sports: ${sportsToProcess.map(s => s.includes('nba') ? 'NBA' : 'NFL').join(', ')}`);
  console.log(`📊 Limit: ${limitArg} picks per sport\n`);

  // Import services
  const { ballDontLieOddsService } = await import('../src/services/ballDontLieOddsService.js');
  const { oddsService } = await import('../src/services/oddsService.js');
  const { propPicksService } = await import('../src/services/propPicksService.js');

  // Filter to games within next 36h for NBA, 7 days for NFL (weekly schedule)
  const now = new Date();
  
  let allPropPicks = { nba: [], nfl: [] };

  for (const sport of sportsToProcess) {
    const sportLabel = sport.includes('nba') ? 'NBA' : 'NFL';
    const sportKey = sport.includes('nba') ? 'nba' : 'nfl';
    
    // NFL has weekly games, so use longer horizon
    const horizonHours = sport.includes('nfl') ? 7 * 24 : 36;
    const horizon = new Date(now.getTime() + horizonHours * 60 * 60 * 1000).getTime();
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${sportLabel} PLAYER PROPS`);
    console.log(`${'='.repeat(50)}\n`);

    try {
      // Fetch games - always use The Odds API for accurate game times
      console.log(`📡 Fetching ${sportLabel} games from The Odds API...`);
      let games = await oddsService.getUpcomingGames(sport);
      
      console.log(`✅ Found ${games.length} ${sportLabel} games\n`);

      // Filter to games within horizon
      const gamesToProcess = games.filter(g => {
        const t = new Date(g.commence_time).getTime();
        return isFinite(t) && t <= horizon && t > now.getTime();
      });
      
      // For NFL, limit to first few games (Thursday night, or Sunday games)
      const maxGames = sport.includes('nfl') ? 5 : 10;
      const limitedGames = gamesToProcess.slice(0, maxGames);
      
      console.log(`🎮 Processing ${limitedGames.length} games (within ${horizonHours}h window)\n`);

      for (const game of limitedGames) {
        const matchup = `${game.away_team} @ ${game.home_team}`;
        const gameTime = new Date(game.commence_time).toLocaleString('en-US', { 
          timeZone: 'America/New_York',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true 
        });
        
        console.log(`\n${sportLabel === 'NFL' ? '🏈' : '🏀'} Processing: ${matchup}`);
        console.log(`   Time: ${gameTime} EST`);

        try {
          const picks = await propPicksService.generatePropBets({
            sport,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            time: game.commence_time
          });

          if (Array.isArray(picks) && picks.length > 0) {
            allPropPicks[sportKey].push(...picks);
            console.log(`   ✅ Generated ${picks.length} prop picks`);
            picks.slice(0, 3).forEach(p => {
              console.log(`      • ${p.player}: ${p.bet.toUpperCase()} ${p.prop} (${p.odds}) - ${(p.confidence * 100).toFixed(0)}% conf`);
            });
            if (picks.length > 3) {
              console.log(`      ... and ${picks.length - 3} more`);
            }
          } else {
            console.log(`   ⚠️ No prop picks generated`);
          }
        } catch (e) {
          console.log(`   ❌ Error: ${e.message}`);
        }
      }
    } catch (error) {
      console.error(`\n❌ Error processing ${sportLabel}:`, error.message);
    }
  }

  // Combine all picks from all sports
  console.log('\n' + '='.repeat(50));
  console.log('STORING ALL PICKS IN SUPABASE');
  console.log('='.repeat(50) + '\n');

  const allPicksCombined = [];
  
  for (const [sportKey, picks] of Object.entries(allPropPicks)) {
    if (picks.length === 0) {
      console.log(`⚠️ No ${sportKey.toUpperCase()} picks generated`);
      continue;
    }

    // Sort by confidence and take top picks per sport
    const sorted = picks.sort((a, b) => {
      const ca = typeof a.confidence === 'number' ? a.confidence : parseFloat(a.confidence) || 0;
      const cb = typeof b.confidence === 'number' ? b.confidence : parseFloat(b.confidence) || 0;
      if (cb !== ca) return cb - ca;
      return (b.ev || 0) - (a.ev || 0);
    });
    const topPicks = sorted.slice(0, limitArg);

    console.log(`\n📊 Top ${topPicks.length} ${sportKey.toUpperCase()} picks:`);
    topPicks.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.player}: ${p.bet.toUpperCase()} ${p.prop} (${p.odds}) - ${(p.confidence * 100).toFixed(0)}%`);
    });
    
    allPicksCombined.push(...topPicks);
  }

  if (allPicksCombined.length === 0) {
    console.log('\n⚠️ No picks to store');
  } else {
    // Delete existing picks for this date
    const { error: delError } = await supabase
      .from('prop_picks')
      .delete()
      .eq('date', dateParam);

    if (delError && !delError.message.includes('0 rows')) {
      console.warn(`   ⚠️ Delete warning: ${delError.message}`);
    }

    // Insert all picks in a single record (sport is inside each pick)
    const { error: insertError } = await supabase
      .from('prop_picks')
      .insert({
        date: dateParam,
        picks: allPicksCombined,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error(`   ❌ Insert error: ${insertError.message}`);
    } else {
      const nbaPicks = allPicksCombined.filter(p => p.sport === 'NBA').length;
      const nflPicks = allPicksCombined.filter(p => p.sport === 'NFL').length;
      console.log(`\n   ✅ Stored ${allPicksCombined.length} total picks for ${dateParam}`);
      console.log(`      • NBA: ${nbaPicks} picks`);
      console.log(`      • NFL: ${nflPicks} picks`);
    }
  }

  console.log('\n🎉 Done! Picks are now available in Supabase.\n');
}

main().catch(console.error);

