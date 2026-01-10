#!/usr/bin/env node

/**
 * Generate DFS Lineups for January 6, 2026
 * Testing all Phase 1-3 improvements with real data
 */

import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { generateDFSLineup, PLATFORM_CONSTRAINTS, validateLineup } from './src/services/dfsLineupService.js';
import { buildDFSContext, discoverDFSSlates } from './src/services/agentic/dfsAgenticContext.js';

const TEST_DATE = '2026-01-06';

// Initialize Supabase
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    console.error('Missing Supabase credentials');
    console.error('URL:', url ? 'Found' : 'Missing');
    console.error('Key:', serviceKey ? 'Found' : 'Missing');
    throw new Error('Missing Supabase credentials');
  }
  console.log(`Using Supabase: ${serviceKey.includes('anon') ? 'ANON' : 'SERVICE_ROLE'} key`);
  return createClient(url, serviceKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });
}

console.log('═'.repeat(100));
console.log('🏀 NBA DFS LINEUP GENERATION - JANUARY 6, 2026');
console.log('═'.repeat(100));
console.log('Testing: Balanced Build, Punt Limits, Anti-Correlation, Chalk Fade\n');

async function generateLineups() {
  const supabase = getSupabaseAdmin();
  const platforms = ['draftkings', 'fanduel'];
  const results = [];
  
  for (const platform of platforms) {
    try {
      console.log(`\n${'═'.repeat(100)}`);
      console.log(`🎰 ${platform.toUpperCase()} NBA LINEUPS`);
      console.log('═'.repeat(100));
      
      // Discover slates
      console.log(`\n[1/4] Discovering slates...`);
      const slates = await discoverDFSSlates('NBA', platform, TEST_DATE);
      console.log(`✅ Found ${slates.length} slate(s): ${slates.map(s => s.name).join(', ')}\n`);
      
      // Generate lineup for each slate
      for (const slate of slates) {
        console.log(`\n${'-'.repeat(100)}`);
        console.log(`📋 SLATE: ${slate.name}`);
        console.log('-'.repeat(100));
        
        // Build context
        console.log(`[2/4] Building context (players, injuries, salaries)...`);
        const context = await buildDFSContext(platform, 'NBA', TEST_DATE, slate);
        console.log(`✅ ${context.players.length} players loaded\n`);
        
        // Generate lineup
        console.log(`[3/4] Generating optimal lineup (Balanced Build)...`);
        const lineup = await generateDFSLineup({
          platform,
          sport: 'NBA',
          players: context.players,
          context: {
            ...context,
            contestType: 'gpp',
            archetype: 'balanced_build',
            slate: slate
          }
        });
        
        // Validate
        console.log(`[4/4] Validating lineup...`);
        const validation = validateLineup(lineup, platform, 'NBA');
        if (!validation.valid) {
          console.warn(`⚠️  Validation warnings: ${validation.errors.join(', ')}`);
        } else {
          console.log(`✅ Lineup valid\n`);
        }
        
        // Display lineup
        displayLineup(lineup, platform, slate);
        
        // Store in Supabase
        const lineupRecord = {
          date: TEST_DATE,
          platform,
          sport: 'NBA',
          slate_name: slate.name,
          slate_start_time: slate.startTime,
          slate_game_count: slate.gameCount || 0,
          contest_type: 'gpp',
          salary_cap: PLATFORM_CONSTRAINTS[platform]['NBA'].salaryCap,
          total_salary: lineup.total_salary,
          projected_points: lineup.projected_points,
          ceiling_projection: lineup.total_ceiling,
          floor_projection: lineup.total_floor,
          stack_info: lineup.stackInfo || null,
          lineup: lineup.lineup,
          gary_notes: lineup.gary_notes,
          updated_at: new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('dfs_lineups')
          .upsert(lineupRecord, {
            onConflict: 'date,platform,sport,slate_name,contest_type'
          });
        
        if (error) {
          console.error(`❌ Database error: ${error.message}`);
        } else {
          console.log(`✅ Lineup saved to database`);
        }
        
        results.push({ platform, slate: slate.name, lineup });
      }
      
    } catch (error) {
      console.error(`\n❌ Error generating ${platform} lineups:`, error.message);
    }
  }
  
  return results;
}

function displayLineup(lineup, platform, slate) {
  const cap = lineup.salary_cap;
  const used = lineup.total_salary;
  const remaining = cap - used;
  
  console.log(`\n${'▓'.repeat(100)}`);
  console.log(`💰 SALARY: $${used.toLocaleString()} / $${cap.toLocaleString()} (${remaining >= 0 ? '+' : ''}$${remaining.toLocaleString()})`);
  console.log(`📈 PROJECTED: ${lineup.projected_points?.toFixed(1) || 'N/A'} pts`);
  console.log(`🎯 CEILING: ${lineup.total_ceiling?.toFixed(1) || 'N/A'} pts`);
  console.log(`🛡️  FLOOR: ${lineup.total_floor?.toFixed(1) || 'N/A'} pts`);
  console.log(`📊 AVG OWNERSHIP: ${lineup.avg_ownership?.toFixed(1) || 'N/A'}%`);
  
  if (used > cap) {
    console.log(`\n⚠️  OVER CAP BY $${(used - cap).toLocaleString()}`);
  }
  
  console.log(`\n${'─'.repeat(100)}`);
  console.log('ROSTER:');
  console.log('─'.repeat(100));
  
  lineup.lineup.forEach((slot, i) => {
    const pos = slot.position.padEnd(5);
    const name = slot.player.padEnd(28);
    const team = (slot.team || '').padStart(3);
    const salary = `$${(slot.salary || 0).toLocaleString()}`.padStart(8);
    const value = `${((slot.projected_pts || 0) / ((slot.salary || 5000) / 1000)).toFixed(2)}x`.padStart(7);
    const proj = `${(slot.projected_pts || 0).toFixed(1)}p`.padStart(7);
    const own = slot.ownership ? `${slot.ownership.toFixed(0)}%`.padStart(4) : 'N/A ';
    
    let indicators = '';
    if (slot.rotation_status === 'expanded_role') indicators += ' 🚀';
    if (slot.rotation_status === 'breakout_candidate') indicators += ' ⭐';
    if (slot.isPriceLag) indicators += ' 💎';
    if (slot.isChalk) indicators += ' 🔥';
    if (slot.isContrarian) indicators += ' 🎲';
    
    console.log(`${(i + 1).toString().padStart(2)}. ${pos} ${name} ${team} ${salary} ${value} ${proj} ${own}${indicators}`);
  });
  
  // Validation warnings
  if (lineup.puntValidation && !lineup.puntValidation.valid) {
    console.log(`\n⚠️  ${lineup.puntValidation.error}`);
  }
  
  if (lineup.antiCorrelation && lineup.antiCorrelation.hasConflicts) {
    console.log(`\n⚠️  ANTI-CORRELATION: ${lineup.antiCorrelation.conflicts.length} conflict(s)`);
    lineup.antiCorrelation.conflicts.forEach(c => {
      console.log(`   • ${c.players.join(' + ')}: ${c.reason}`);
    });
  }
  
  if (lineup.chalkFade && lineup.chalkFade.shouldFade) {
    console.log(`\n🎯 CHALK FADE: ${lineup.chalkFade.fadeCandidate.name} → ${lineup.chalkFade.alternative.name}`);
  }
  
  // Gary's notes
  if (lineup.gary_notes) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log('📝 GARY\'S NOTES:');
    console.log('─'.repeat(100));
    console.log(lineup.gary_notes);
  }
}

generateLineups().then(results => {
  console.log(`\n\n${'═'.repeat(100)}`);
  console.log('✅ GENERATION COMPLETE');
  console.log('═'.repeat(100));
  console.log(`\n📊 Generated ${results.length} lineup(s) for ${TEST_DATE}`);
  console.log('💾 All lineups saved to Supabase database');
  console.log('📱 Ready to view in Gary app!\n');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Generation failed:', error);
  process.exit(1);
});

