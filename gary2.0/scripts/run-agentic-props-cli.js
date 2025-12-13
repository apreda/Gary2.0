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
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

export async function runAgenticPropsCli({
  sportKey,
  leagueLabel,
  buildContext,
  windowHours = 24 * 7,
  propsPerGame = 5,
  limitDefault = 5
}) {
  if (!sportKey || !buildContext) {
    throw new Error('runAgenticPropsCli requires sportKey and buildContext');
  }

  const args = parseArgs();
  const limit = Number.parseInt(args.limit || process.env.AGENTIC_PROPS_LIMIT || String(limitDefault), 10);
  const nocache = args.nocache === '1' || args.nocache === 'true';
  const shouldStore = args.store === '1' || args.store === 'true' || process.env.AGENTIC_STORE === '1';

  console.log(`\n🏈 Agentic ${leagueLabel} Props Runner Starting...`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`🎯 Sport: ${leagueLabel}`);
  console.log(`📊 Games limit: ${limit}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}`);
  console.log(`${'='.repeat(50)}\n`);

  // Fetch upcoming games
  const games = await oddsService.getUpcomingGames(sportKey, { nocache });
  const now = Date.now();
  const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : null;

  const filtered = games
    .filter((game) => {
      const tip = new Date(game.commence_time).getTime();
      if (Number.isNaN(tip) || tip <= now) return false;
      if (windowMs != null) {
        return tip <= now + windowMs;
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
        options: { nocache }
      });

      if (result.picks && result.picks.length > 0) {
        console.log(`\n✅ Generated ${result.picks.length} prop picks:`);
        result.picks.forEach((pick, i) => {
          const conf = (pick.confidence * 100).toFixed(0);
          const ev = pick.ev ? ` | EV: ${pick.ev > 0 ? '+' : ''}${pick.ev.toFixed(1)}%` : '';
          console.log(`   ${i + 1}. ${pick.player}: ${pick.bet.toUpperCase()} ${pick.prop} (${pick.odds}) - ${conf}% conf${ev}`);
        });
        allPropPicks.push(...result.picks);
      } else {
        console.log(`⚠️ No confident prop picks for this game`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${matchup}:`, error.message);
    }
  }

  // Summary and storage
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 SUMMARY: ${allPropPicks.length} total prop picks generated`);
  console.log(`${'='.repeat(50)}`);

  if (allPropPicks.length === 0) {
    console.log(`\n⚠️ No prop picks generated across all games.`);
    return;
  }

  // Sort by confidence and EV
  const sortedPicks = allPropPicks.sort((a, b) => {
    const confDiff = (b.confidence || 0) - (a.confidence || 0);
    if (confDiff !== 0) return confDiff;
    return (b.ev || 0) - (a.ev || 0);
  });

  // Take top picks
  const topPicks = sortedPicks.slice(0, 10);

  console.log(`\n🏆 Top ${topPicks.length} Picks:`);
  topPicks.forEach((pick, i) => {
    const conf = (pick.confidence * 100).toFixed(0);
    const ev = pick.ev ? ` | EV: ${pick.ev > 0 ? '+' : ''}${pick.ev.toFixed(1)}%` : '';
    console.log(`   ${i + 1}. ${pick.player}: ${pick.bet.toUpperCase()} ${pick.prop} (${pick.odds}) - ${conf}% conf${ev}`);
  });

  if (shouldStore) {
    console.log(`\n💾 Storing picks in Supabase...`);
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error(`❌ Missing Supabase credentials`);
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      const dateParam = getESTDate();

      // First fetch existing picks for today
      const { data: existingData } = await supabase
        .from('prop_picks')
        .select('picks')
        .eq('date', dateParam)
        .single();

      let existingPicks = [];
      if (existingData?.picks) {
        existingPicks = existingData.picks.filter(p => p.sport !== leagueLabel);
      }

      // Merge with new picks
      const mergedPicks = [...existingPicks, ...topPicks];

      // Delete and re-insert
      await supabase.from('prop_picks').delete().eq('date', dateParam);
      
      const { error: insertError } = await supabase
        .from('prop_picks')
        .insert({
          date: dateParam,
          picks: mergedPicks,
          created_at: new Date().toISOString()
        });

      if (insertError) {
        console.error(`❌ Insert error: ${insertError.message}`);
      } else {
        console.log(`✅ Stored ${topPicks.length} ${leagueLabel} prop picks for ${dateParam}`);
      }
    }
  } else {
    console.log(`\nℹ️ Pass --store=1 to save picks to database.`);
  }

  console.log(`\n🏁 Agentic ${leagueLabel} Props Runner Complete.\n`);
}
