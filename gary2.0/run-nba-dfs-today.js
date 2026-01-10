#!/usr/bin/env node

/**
 * Run NBA DFS Lineups for TODAY
 * Testing DraftKings and FanDuel lineup generation
 */

import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { generateDFSLineup, PLATFORM_CONSTRAINTS, validateLineup } from './src/services/dfsLineupService.js';
import { buildDFSContext, discoverDFSSlates } from './src/services/agentic/dfsAgenticContext.js';

// Get today's date
const TODAY = new Date().toISOString().split('T')[0];

// Initialize Supabase
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    console.error('Missing Supabase credentials');
    throw new Error('Missing Supabase credentials');
  }
  return createClient(url, serviceKey, { 
    auth: { autoRefreshToken: false, persistSession: false } 
  });
}

console.log('═'.repeat(100));
console.log(`🏀 NBA DFS LINEUP GENERATION - ${TODAY}`);
console.log('═'.repeat(100));
console.log('Testing: Balanced Build, Punt Limits, Anti-Correlation, Chalk Fade');
console.log('Goal: Beat DK/FD Pros with sharper player selection\n');

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
      console.log(`\n[1/4] Discovering slates for ${TODAY}...`);
      const slates = await discoverDFSSlates('NBA', platform, TODAY);
      
      if (!slates || slates.length === 0) {
        console.log(`⚠️  No slates found for ${platform} - skipping`);
        continue;
      }
      
      console.log(`✅ Found ${slates.length} slate(s): ${slates.map(s => s.name).join(', ')}\n`);
      
      // Generate lineup for each slate
      for (const slate of slates) {
        console.log(`\n${'-'.repeat(100)}`);
        console.log(`📋 SLATE: ${slate.name}`);
        console.log(`   Games: ${slate.gameCount || 'unknown'} | Start: ${slate.startTime || 'TBD'}`);
        console.log('-'.repeat(100));
        
        // Build context
        console.log(`[2/4] Building context (players, injuries, salaries, prop lines)...`);
        const context = await buildDFSContext(platform, 'NBA', TODAY, slate);
        
        if (!context.players || context.players.length === 0) {
          console.log(`⚠️  No players found for slate - skipping`);
          continue;
        }
        
        console.log(`✅ ${context.players.length} players loaded`);
        
        // Log top salary players for verification
        const topSalary = [...context.players].sort((a, b) => (b.salary || 0) - (a.salary || 0)).slice(0, 5);
        console.log(`\n📊 Top 5 Salaries:`);
        topSalary.forEach((p, i) => {
          console.log(`   ${i+1}. ${p.name} (${p.team}) - $${(p.salary || 0).toLocaleString()} | ${p.position}`);
        });
        
        // Generate lineup
        console.log(`\n[3/4] Generating optimal GPP lineup (Balanced Build)...`);
        const startGen = Date.now();
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
        const genTime = Date.now() - startGen;
        console.log(`✅ Lineup generated in ${(genTime/1000).toFixed(1)}s`);
        
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
        
        // Analyze lineup quality
        analyzeLineupQuality(lineup, context.players);
        
        // Store in Supabase
        const lineupRecord = {
          date: TODAY,
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
          console.log(`\n✅ Lineup saved to database`);
        }
        
        results.push({ platform, slate: slate.name, lineup });
      }
      
    } catch (error) {
      console.error(`\n❌ Error generating ${platform} lineups:`, error.message);
      console.error(error.stack);
    }
  }
  
  return results;
}

function displayLineup(lineup, platform, slate) {
  const cap = lineup.salary_cap;
  const used = lineup.total_salary;
  const remaining = cap - used;
  
  console.log(`\n${'▓'.repeat(100)}`);
  console.log(`💰 SALARY: $${used.toLocaleString()} / $${cap.toLocaleString()} (${remaining >= 0 ? '+' : ''}$${remaining.toLocaleString()} remaining)`);
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
  console.log('    POS   PLAYER                        TEAM    SALARY   VALUE    PROJ   OWN%   FLAGS');
  console.log('─'.repeat(100));
  
  lineup.lineup.forEach((slot, i) => {
    const pos = slot.position.padEnd(5);
    const name = slot.player.padEnd(28);
    const team = (slot.team || '').padStart(4);
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
    if ((slot.salary || 0) < 5000) indicators += ' 🎯';
    
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

function analyzeLineupQuality(lineup, allPlayers) {
  console.log(`\n${'─'.repeat(100)}`);
  console.log('🔍 LINEUP QUALITY ANALYSIS (Pro-Level Review):');
  console.log('─'.repeat(100));
  
  // 1. Salary Efficiency
  const salaryUsed = lineup.total_salary;
  const cap = lineup.salary_cap;
  const efficiency = ((salaryUsed / cap) * 100).toFixed(1);
  console.log(`\n1️⃣  SALARY EFFICIENCY: ${efficiency}% of cap used`);
  if (cap - salaryUsed > 2000) {
    console.log(`   ⚠️  ISSUE: Leaving $${(cap - salaryUsed).toLocaleString()} on the table - could upgrade a position`);
  } else if (cap - salaryUsed < 500) {
    console.log(`   ✅ GOOD: Maximizing salary cap usage`);
  }
  
  // 2. Value Analysis (pts per $1k)
  const avgValue = lineup.lineup.reduce((sum, p) => sum + ((p.projected_pts || 0) / ((p.salary || 5000) / 1000)), 0) / lineup.lineup.length;
  console.log(`\n2️⃣  AVG VALUE: ${avgValue.toFixed(2)}x (pts per $1k)`);
  if (avgValue < 5.5) {
    console.log(`   ⚠️  ISSUE: Value below 5.5x threshold - overpaying for production`);
  } else if (avgValue > 6.5) {
    console.log(`   ✅ EXCELLENT: High value lineup`);
  } else {
    console.log(`   ℹ️  OKAY: Average value - room for improvement`);
  }
  
  // 3. Punt Analysis
  const punts = lineup.lineup.filter(p => (p.salary || 0) < 4500);
  console.log(`\n3️⃣  PUNT COUNT: ${punts.length} players under $4,500`);
  if (punts.length > 2) {
    console.log(`   ⚠️  ISSUE: Too many punts - "fragile floor" risk`);
    punts.forEach(p => console.log(`   • ${p.player} ($${p.salary}) - high bust risk`));
  } else if (punts.length === 0) {
    console.log(`   ℹ️  NOTE: No punts - balanced but may lack ceiling`);
  } else {
    console.log(`   ✅ GOOD: Controlled punt exposure`);
  }
  
  // 4. Team Stacking
  const teamCounts = {};
  lineup.lineup.forEach(p => {
    teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });
  const stacks = Object.entries(teamCounts).filter(([_, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  console.log(`\n4️⃣  TEAM CORRELATION:`);
  if (stacks.length > 0) {
    stacks.forEach(([team, count]) => {
      console.log(`   • ${team}: ${count} players stacked`);
    });
    console.log(`   ✅ GOOD: Team correlation can boost ceiling`);
  } else {
    console.log(`   ⚠️  ISSUE: No team correlation - diversification may cap upside`);
  }
  
  // 5. Ownership Analysis (if available)
  const avgOwnership = lineup.avg_ownership;
  if (avgOwnership) {
    console.log(`\n5️⃣  OWNERSHIP PROFILE: ${avgOwnership.toFixed(1)}% average`);
    const highOwn = lineup.lineup.filter(p => (p.ownership || 0) > 25);
    const lowOwn = lineup.lineup.filter(p => (p.ownership || 0) < 10 && (p.ownership || 0) > 0);
    if (avgOwnership > 20) {
      console.log(`   ⚠️  ISSUE: Very chalky lineup - difficult to win large GPPs`);
    } else if (avgOwnership < 12) {
      console.log(`   ✅ CONTRARIAN: Low ownership - good GPP leverage`);
    }
    if (highOwn.length > 3) {
      console.log(`   ⚠️  ${highOwn.length} players over 25% owned - consider pivots`);
    }
    if (lowOwn.length > 0) {
      console.log(`   ✅ ${lowOwn.length} low-owned plays for differentiation`);
    }
  }
  
  // 6. Ceiling Check
  if (lineup.total_ceiling) {
    console.log(`\n6️⃣  GPP VIABILITY:`);
    if (lineup.total_ceiling > 380) {
      console.log(`   ✅ EXCELLENT: ${lineup.total_ceiling.toFixed(0)} ceiling can win large-field GPPs`);
    } else if (lineup.total_ceiling > 340) {
      console.log(`   ℹ️  MODERATE: ${lineup.total_ceiling.toFixed(0)} ceiling - competitive in mid-size GPPs`);
    } else {
      console.log(`   ⚠️  ISSUE: ${lineup.total_ceiling.toFixed(0)} ceiling may be too low for GPPs`);
    }
  }
  
  // 7. Missing Value Opportunities
  console.log(`\n7️⃣  POTENTIAL VALUE MISSES:`);
  const lineupNames = new Set(lineup.lineup.map(p => p.player));
  const missedValue = allPlayers
    .filter(p => !lineupNames.has(p.name))
    .filter(p => (p.projection || 0) / ((p.salary || 5000) / 1000) > 6.5)
    .filter(p => (p.salary || 0) > 4500)
    .sort((a, b) => ((b.projection || 0) / ((b.salary || 5000) / 1000)) - ((a.projection || 0) / ((a.salary || 5000) / 1000)))
    .slice(0, 3);
  
  if (missedValue.length > 0) {
    missedValue.forEach(p => {
      const val = ((p.projection || 0) / ((p.salary || 5000) / 1000)).toFixed(2);
      console.log(`   • ${p.name} (${p.team}) - $${(p.salary || 0).toLocaleString()} @ ${val}x value`);
    });
  } else {
    console.log(`   ✅ No obvious value misses detected`);
  }
  
  console.log(`\n${'═'.repeat(100)}`);
}

generateLineups().then(results => {
  console.log(`\n\n${'═'.repeat(100)}`);
  console.log('✅ GENERATION COMPLETE');
  console.log('═'.repeat(100));
  console.log(`\n📊 Generated ${results.length} lineup(s) for ${TODAY}`);
  console.log('💾 All lineups saved to Supabase database');
  console.log('📱 Ready to view in Gary app!\n');
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Generation failed:', error);
  console.error(error.stack);
  process.exit(1);
});
