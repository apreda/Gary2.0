#!/usr/bin/env node

/**
 * Test DFS Lineup Generation
 * Generates a test NBA lineup for DraftKings and stores it in Supabase
 * 
 * Usage: node scripts/test-dfs-lineup.js [platform] [sport]
 *   platform: draftkings (default) or fanduel
 *   sport: NBA (default) or NFL
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Get date in EST
function estToday() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const est = new Date(utc + (3600000 * -5));
  return est.toISOString().split('T')[0];
}

// Initialize Supabase
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }
  return createClient(url, key, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });
}

async function main() {
  const platform = process.argv[2] || 'draftkings';
  const sport = process.argv[3]?.toUpperCase() || 'NBA';
  const dateStr = estToday();
  
  console.log(`\n🏀 Gary's Fantasy - DFS Lineup Test`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Platform: ${platform.toUpperCase()}`);
  console.log(`Sport: ${sport}`);
  console.log(`Date: ${dateStr}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  try {
    // Import services
    const { buildDFSContext } = await import('../src/services/agentic/dfsAgenticContext.js');
    const { generateDFSLineup, validateLineup, PLATFORM_CONSTRAINTS } = await import('../src/services/dfsLineupService.js');
    
    console.log('📊 Building DFS context (BDL stats + Gemini Grounding)...\n');
    
    // Build context
    const context = await buildDFSContext(platform, sport, dateStr);
    
    if (!context.players || context.players.length === 0) {
      console.log('❌ No players found with salaries. Games may not be available today.');
      console.log(`   Games count: ${context.gamesCount || 0}`);
      console.log(`   Error: ${context.error || 'Unknown'}`);
      console.log(`   BDL players fetched: ${context.bdlPlayersCount || 0}`);
      console.log(`   Gemini grounded players: ${context.groundedPlayersCount || 0}`);
      console.log('\n⛔ NO MOCK DATA - Real data fetch failed. Please check:');
      console.log('   1. BDL API key is set and valid');
      console.log('   2. Gemini API key is set and valid');
      console.log('   3. Games are scheduled for today');
      process.exit(1);
    }
    
    console.log(`✅ Found ${context.players.length} players with salaries`);
    console.log(`   Games: ${context.gamesCount || 'N/A'}`);
    console.log(`   Grounding used: ${context.groundingUsed ? 'Yes' : 'No'}`);
    
    // Show salary data quality warning
    if (context.salaryData) {
      const { realCount, estimatedCount, quality, warning } = context.salaryData;
      if (quality === 'poor') {
        console.log(`\n❌ SALARY DATA ISSUE:`);
        console.log(`   Only ${realCount}/${context.players.length} players have REAL salaries`);
        console.log(`   ${estimatedCount} players have ESTIMATED salaries`);
        console.log(`   ⚠️ Lineup optimization may be inaccurate!`);
      } else if (quality === 'partial') {
        console.log(`\n⚠️ Partial salary data: ${realCount} real, ${estimatedCount} estimated`);
      } else {
        console.log(`   Salary data: ${realCount} real salaries ✓`);
      }
    }
    
    if (context.targetPlayers?.length > 0) {
      console.log(`\n🎯 Target Players:`);
      context.targetPlayers.slice(0, 3).forEach(p => {
        console.log(`   • ${p.name} - ${p.reason}`);
      });
    }
    
    if (context.fadePlayers?.length > 0) {
      console.log(`\n⚠️ Fade Players:`);
      context.fadePlayers.slice(0, 2).forEach(p => {
        console.log(`   • ${p.name} - ${p.reason}`);
      });
    }
    
    // Generate lineup
    console.log('\n🔧 Optimizing lineup...\n');
    const lineup = await generateDFSLineup({
      platform,
      sport,
      players: context.players,
      context: {
        fadePlayers: context.fadePlayers || [],
        targetPlayers: context.targetPlayers || []
      }
    });
    
    // Validate
    const validation = validateLineup(lineup, platform, sport);
    if (!validation.valid) {
      console.log(`⚠️ Validation issues: ${validation.errors.join(', ')}`);
    }
    
    // Display lineup
    const constraints = PLATFORM_CONSTRAINTS[platform][sport];
    console.log(`\n📋 OPTIMAL ${platform.toUpperCase()} ${sport} LINEUP`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Salary: $${lineup.total_salary.toLocaleString()} / $${constraints.salaryCap.toLocaleString()}`);
    console.log(`Projected: ${lineup.projected_points} pts`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    lineup.lineup.forEach((slot, i) => {
      const pts = slot.projected_pts?.toFixed(1) || '?';
      const salary = `$${slot.salary.toLocaleString()}`;
      console.log(`${slot.position.padEnd(4)} ${slot.player.padEnd(22)} ${slot.team.padEnd(4)} ${salary.padStart(7)} ${pts.padStart(5)} pts`);
      
      // Show rationale
      if (slot.rationale) {
        console.log(`     💡 ${slot.rationale}`);
      }
      
      // Show supporting stats
      if (slot.supportingStats?.length > 0) {
        const statsStr = slot.supportingStats.map(s => `${s.label}: ${s.value}`).join(' | ');
        console.log(`     📊 ${statsStr}`);
      }
      
      // Show pivots
      if (slot.pivots?.length > 0) {
        slot.pivots.forEach(p => {
          const pSalary = `$${p.salary.toLocaleString()}`;
          const pPts = p.projected_pts?.toFixed(1) || '?';
          const diff = p.salaryDiff >= 0 ? `+${p.salaryDiff}` : p.salaryDiff;
          console.log(`       ↳ ${p.tierLabel || p.tier}: ${p.player} (${p.team}) ${pSalary} ${pPts} pts [${diff}]`);
        });
      }
      console.log('');
    });
    
    // Build Gary's notes
    const garyNotes = buildGaryNotes(context, lineup);
    
    // Store in Supabase
    console.log(`\n💾 Storing in Supabase...`);
    const supabase = getSupabase();
    
    const lineupRecord = {
      date: dateStr,
      platform,
      sport,
      salary_cap: constraints.salaryCap,
      total_salary: lineup.total_salary,
      projected_points: lineup.projected_points,
      lineup: lineup.lineup,
      gary_notes: garyNotes,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('dfs_lineups')
      .upsert(lineupRecord, { onConflict: 'date,platform,sport' });
    
    if (error) {
      console.log(`❌ Supabase error: ${error.message}`);
    } else {
      console.log(`✅ Lineup stored successfully!`);
    }
    
    // Gary's notes
    if (garyNotes) {
      console.log(`\n📝 Gary's Notes:`);
      garyNotes.split('\n').forEach(line => {
        console.log(`   ${line}`);
      });
    }
    
    console.log(`\n✨ Done!`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// NO MOCK DATA - we only use real data from BDL and Gemini Grounding

/**
 * Build Gary's notes for the lineup
 */
function buildGaryNotes(context, lineup) {
  const notes = [];
  
  if (context.targetPlayers?.length > 0) {
    const targets = context.targetPlayers.slice(0, 2);
    const inLineup = targets.filter(t => 
      lineup.lineup.some(p => p.player.toLowerCase().includes(t.name?.toLowerCase()))
    );
    if (inLineup.length > 0) {
      notes.push(`🎯 Narrative plays: ${inLineup.map(t => `${t.name} (${t.reason})`).join(', ')}`);
    }
  }
  
  if (context.fadePlayers?.length > 0) {
    notes.push(`⚠️ Fading: ${context.fadePlayers.slice(0, 2).map(f => `${f.name}`).join(', ')}`);
  }
  
  if (context.lateScratches?.length > 0) {
    notes.push(`📝 Late scratches: ${context.lateScratches.join(', ')}`);
  }
  
  const cheapest = lineup.lineup.reduce((min, p) => p.salary < min.salary ? p : min, lineup.lineup[0]);
  if (cheapest) {
    notes.push(`💰 Value: ${cheapest.player} at $${cheapest.salary.toLocaleString()} unlocks salary`);
  }
  
  return notes.join('\n');
}

main();

