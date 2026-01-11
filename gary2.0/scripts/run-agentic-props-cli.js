#!/usr/bin/env node
/**
 * Agentic Props CLI Runner
 * Generic CLI for running agentic prop picks pipeline
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local first, then .env BEFORE importing services
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Dynamic imports after env is loaded (so openaiService gets correct proxy URL)
const { oddsService } = await import('../src/services/oddsService.js');
const { propOddsService } = await import('../src/services/propOddsService.js');
const { runAgenticPropsPipeline } = await import('../src/services/agentic/propsAgenticRunner.js');

const defaultArgv = process.argv.slice(2);

function parseArgs(argv = defaultArgv) {
  return argv.reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    const normalizedKey = key.replace(/^--/, '');
    acc[normalizedKey] = value ?? true;
    return acc;
  }, {});
}

function getESTDate() {
  // DST-safe: Use Intl with America/New_York timezone
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

export async function runAgenticPropsCli({
  sportKey,
  leagueLabel,
  buildContext,
  windowHours = 24 * 7,
  propsPerGame = 5,
  limitDefault = 5,
  useESTDayFiltering = false,  // If true, filter by EST day instead of rolling window
  regularOnly = false  // If true for NFL, only generate yards/receptions props (no TDs - use when TDs already stored)
}) {
  if (!sportKey || !buildContext) {
    throw new Error('runAgenticPropsCli requires sportKey and buildContext');
  }

  const args = parseArgs();
  const limit = Number.parseInt(args.limit || process.env.AGENTIC_PROPS_LIMIT || String(limitDefault), 10);
  const nocache = args.nocache === '1' || args.nocache === 'true';
  const shouldStore = args.store !== '0' && args.store !== 'false'; // Default TRUE, pass --store=0 to skip
  const matchupFilter = args.matchup || null;
  // CLI override for regularOnly: --regular=1 or --no-td=1
  const cliRegularOnly = regularOnly || args.regular === '1' || args['no-td'] === '1';

  console.log(`\n🏈 Agentic ${leagueLabel} Props Runner Starting...`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`🎯 Sport: ${leagueLabel}`);
  console.log(`📊 Games limit: ${limit}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}`);
  if (cliRegularOnly && leagueLabel === 'NFL') console.log(`🏈 Mode: Regular props only (yards/receptions - TDs handled separately)`);
  if (matchupFilter) console.log(`🔍 Matchup filter: ${matchupFilter}`);
  console.log(`${'='.repeat(50)}\n`);

  // Fetch upcoming games
  const games = await oddsService.getUpcomingGames(sportKey, { nocache });
  const now = Date.now();
  
  // Calculate time window based on filtering mode
  let todayStart, tomorrowStart;
  if (useESTDayFiltering) {
    // Use EST day boundaries for filtering (all games on current EST day)
    const todayEST = getESTDate();
    todayStart = new Date(`${todayEST}T00:00:00-05:00`).getTime();
    tomorrowStart = todayStart + (24 * 60 * 60 * 1000);
  }
  const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : null;

  const filtered = games
    .filter((game) => {
      const tip = new Date(game.commence_time).getTime();
      if (Number.isNaN(tip)) return false;
      
      if (useESTDayFiltering) {
        // Filter games starting on current EST day
        if (tip < todayStart || tip >= tomorrowStart) return false;
      } else {
        // Use rolling window (original behavior)
        if (tip <= now) return false;
        if (windowMs != null && tip > now + windowMs) return false;
      }
      
      // Apply matchup filter if provided
      if (matchupFilter) {
        const matchupLower = matchupFilter.toLowerCase();
        const homeMatch = game.home_team.toLowerCase().includes(matchupLower);
        const awayMatch = game.away_team.toLowerCase().includes(matchupLower);
        if (!homeMatch && !awayMatch) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .slice(0, Math.max(limit, 1));

  console.log(`Found ${filtered.length} ${leagueLabel} games to process.\n`);

  if (filtered.length === 0) {
    console.log(`⚠️ No upcoming ${leagueLabel} games found within ${windowHours}h window.`);
    return;
  }

  const allPropPicks = [];

  for (const game of filtered) {
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

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🏈 ${matchup}`);
    console.log(`⏰ ${gameTime} EST`);
    console.log(`${'='.repeat(50)}`);

    try {
      // Fetch available props for this game
      console.log(`\n📡 Fetching player props...`);
      let playerProps = [];
      try {
        playerProps = await propOddsService.getPlayerPropOdds(sportKey, game.home_team, game.away_team);
        console.log(`✅ Found ${playerProps.length} prop lines`);
      } catch (propsError) {
        console.warn(`⚠️ Could not fetch props: ${propsError.message}`);
        continue;
      }

      if (playerProps.length === 0) {
        console.log(`⚠️ No props available for this game, skipping...`);
        continue;
      }

      // Build context and run pipeline
      const result = await runAgenticPropsPipeline({
        game,
        playerProps,
        buildContext,
        sportLabel: leagueLabel,
        propsPerGame,
        options: { nocache },
        regularOnly: cliRegularOnly  // NFL: if true, skip TD categories (TDs handled by separate script)
      });

      if (result.picks && result.picks.length > 0) {
        console.log(`✅ Generated ${result.picks.length} picks for ${matchup}`);
        allPropPicks.push(...result.picks);
      } else {
        console.log(`⚠️ No confident prop picks for this game`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${matchup}:`, error.message);
    }
  }

  // Deduplicate and Prepare Final Picks
  if (allPropPicks.length === 0) {
    console.log(`\n⚠️ No prop picks generated across all games.`);
    return;
  }

  // CRITICAL: Deduplicate by player + prop_type
  const dedupeKey = (pick) => {
    const propType = (pick.prop || '').split(' ')[0].toLowerCase();
    return `${(pick.player || '').toLowerCase()}_${propType}`;
  };

  const deduped = new Map();
  for (const pick of allPropPicks) {
    const key = dedupeKey(pick);
    const existing = deduped.get(key);
    if (!existing || 
        (pick.confidence || 0) > (existing.confidence || 0) ||
        ((pick.confidence || 0) === (existing.confidence || 0) && (pick.ev || 0) > (existing.ev || 0))) {
      deduped.set(key, pick);
    }
  }

  const sortedPicks = Array.from(deduped.values()).sort((a, b) => {
    const confDiff = (b.confidence || 0) - (a.confidence || 0);
    if (confDiff !== 0) return confDiff;
    return (b.ev || 0) - (a.ev || 0);
  });

  // STORAGE (Do this BEFORE the big summary print)
  if (shouldStore) {
    console.log(`\n💾 Storing ${sortedPicks.length} picks in Supabase...`);
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error(`❌ Missing Supabase credentials`);
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const dateParam = getESTDate();
      const { data: existingData } = await supabase
        .from('prop_picks')
        .select('picks')
        .eq('date', dateParam)
        .single();

      let existingPicks = [];
      const newMatchups = new Set(sortedPicks.map(p => p.matchup?.toLowerCase()).filter(Boolean));
      // Check if new picks include TD picks (for NFL categorized format)
      const newHasTdPicks = sortedPicks.some(p => p.td_category);
      
      if (existingData?.picks) {
        existingPicks = existingData.picks.filter(p => {
          // Always keep picks from other sports
          if (p.sport !== leagueLabel) return true;
          
          const pickMatchup = p.matchup?.toLowerCase();
          const isSameMatchup = pickMatchup && newMatchups.has(pickMatchup);
          
          // For NFL: If new picks include TD picks, filter out existing TD picks for same matchup
          // This prevents duplicates when running NFL props (which now outputs categorized TD picks)
          if (leagueLabel === 'NFL' && p.td_category && newHasTdPicks && isSameMatchup) {
            console.log(`[Storage] Replacing existing ${p.td_category} TD pick for ${pickMatchup}`);
            return false;
          }
          
          // Keep existing TD picks if new picks don't include TDs (standalone TD script didn't run yet)
          if (p.td_category && !newHasTdPicks) return true;
          
          // Filter out existing regular props for same matchup
          return !isSameMatchup;
        });
      }

      const mergedPicks = [...existingPicks, ...sortedPicks];
      
      // Use upsert instead of delete-then-insert (atomic, race-safe)
      const { error: upsertError } = await supabase
        .from('prop_picks')
        .upsert({
          date: dateParam,
          picks: mergedPicks,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'date'
        });

      if (upsertError) {
        console.error(`❌ Upsert error: ${upsertError.message}`);
      } else {
        console.log(`✅ Successfully stored picks for ${dateParam}`);
      }
    }
  }

  // FINAL SUMMARY
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏆 FINAL ${leagueLabel} PICKS SUMMARY`);
  console.log(`${'='.repeat(50)}`);
  
  sortedPicks.forEach((pick, i) => {
    const conf = (pick.confidence * 100).toFixed(0);
    console.log(`${i + 1}. ${pick.player} (${pick.team}): ${pick.bet.toUpperCase()} ${pick.prop} @ ${pick.odds} (${conf}% confidence)`);
  });

  console.log(`\n🏁 Agentic ${leagueLabel} Props Runner Complete.\n`);
}
