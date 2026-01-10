#!/usr/bin/env node
/**
 * NBA DFS Test - CommonJS Version
 */
require('dotenv').config();

const TODAY = new Date().toISOString().split('T')[0];
console.log('═'.repeat(100));
console.log(`🏀 NBA DFS LINEUP GENERATION - ${TODAY}`);
console.log('═'.repeat(100));
console.log('Testing via CommonJS wrapper...\n');

// Use dynamic imports for ESM modules
async function main() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { generateDFSLineup, PLATFORM_CONSTRAINTS, validateLineup } = await import('./src/services/dfsLineupService.js');
    const { buildDFSContext, discoverDFSSlates } = await import('./src/services/agentic/dfsAgenticContext.js');
    const { clearSlateCache } = await import('./src/services/rotowireSlateService.js');
    const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CLEAR ALL CACHES - Ensure 100% fresh data for each run
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('[DFS] 🔄 Clearing all caches for fresh run...');
    clearSlateCache();
    ballDontLieService.clearCache();
    console.log('[DFS] ✅ Caches cleared - fetching fresh data\n');
    
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    );
    
    const platforms = ['draftkings', 'fanduel'];
    
    for (const platform of platforms) {
      console.log(`\n${'═'.repeat(100)}`);
      console.log(`🎰 ${platform.toUpperCase()} NBA LINEUPS`);
      console.log('═'.repeat(100));
      
      // Discover slates
      console.log(`[1/4] Discovering slates for ${TODAY}...`);
      const slates = await discoverDFSSlates('NBA', platform, TODAY);
      
      if (!slates || slates.length === 0) {
        console.log(`⚠️  No slates found for ${platform} - skipping`);
        continue;
      }
      
      console.log(`✅ Found ${slates.length} slate(s): ${slates.map(s => s.name).join(', ')}`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // SLATE FILTERING BY PLATFORM
      // ═══════════════════════════════════════════════════════════════════════════
      // DraftKings: Classic slates only (Classic, Turbo, Night) - NO Showdowns
      // FanDuel: Full roster slates only (Main, Express, After Hours) - NO Single Game
      // ═══════════════════════════════════════════════════════════════════════════
      // ═══════════════════════════════════════════════════════════════════════════
      // SLATE SELECTION - Classic/Full-Roster only (no Showdowns or Single Game)
      // ═══════════════════════════════════════════════════════════════════════════
      // DraftKings: Classic (All), Turbo, Night
      // FanDuel: Main, Express, Express II, After Hours
      const classicSlates = slates.filter(s => {
        const name = s.name.toLowerCase();
        
        // Exclude showdown/single game formats
        if (name.includes('showdown') || name.includes('single game') || name.includes('captain')) {
          return false;
        }
        
        return true;
      });
      
      console.log(`🎯 Available slates:`);
      classicSlates.forEach(s => {
        console.log(`   📋 ${s.name}: ${s.gameCount} games (${s.startTime})`);
        if (s.teams && s.teams.length > 0) {
          console.log(`      Teams: ${s.teams.join(', ')}`);
        }
      });
      
      // ═══════════════════════════════════════════════════════════════════════════
      // GENERATE LINEUPS FOR ALL CLASSIC SLATES
      // ═══════════════════════════════════════════════════════════════════════════
      // DraftKings: All, Turbo, Night
      // FanDuel: Main, Express, Express II, After Hours
      // Users can switch between slates in the UI
      // ═══════════════════════════════════════════════════════════════════════════
      
      console.log(`\n🎯 Generating lineups for ${classicSlates.length} slate(s)...`);
      
      for (const slate of classicSlates) {
        console.log(`\n📋 SLATE: ${slate.name}`);
        console.log(`   Games: ${slate.gameCount || 'unknown'}`);
        
        // Build context
        console.log(`[2/4] Building context...`);
        const context = await buildDFSContext(platform, 'NBA', TODAY, slate);
        
        if (!context.players || context.players.length === 0) {
          console.log(`⚠️  No players found - skipping`);
          continue;
        }
        
        console.log(`✅ ${context.players.length} players loaded`);
        
        // Show top salaries
        const topSalary = [...context.players].sort((a, b) => (b.salary || 0) - (a.salary || 0)).slice(0, 5);
        console.log(`\n📊 Top 5 Salaries:`);
        topSalary.forEach((p, i) => {
          console.log(`   ${i+1}. ${p.name} (${p.team}) - $${(p.salary||0).toLocaleString()}`);
        });
        
        // Generate lineup
        console.log(`\n[3/4] Generating lineup...`);
        const lineup = await generateDFSLineup({
          platform,
          sport: 'NBA',
          players: context.players,
          context: {
            ...context,
            contestType: 'gpp',
            // archetype: Let Gary decide based on slate analysis (awareness, not prescriptive)
            slate: slate
          }
        });
        
        // Display
        console.log(`\n💰 SALARY: $${lineup.total_salary?.toLocaleString()} / $${lineup.salary_cap?.toLocaleString()}`);
        console.log(`📈 PROJECTED: ${lineup.projected_points?.toFixed(1)} pts`);
        
        console.log(`\nROSTER:`);
        lineup.lineup.forEach((slot, i) => {
          const val = ((slot.projected_pts || 0) / ((slot.salary || 5000) / 1000)).toFixed(2);
          console.log(`${i+1}. ${slot.position.padEnd(5)} ${slot.player.padEnd(25)} ${(slot.team||'').padStart(4)} $${(slot.salary||0).toLocaleString().padStart(6)} ${val}x ${(slot.projected_pts||0).toFixed(1)}p`);
        });
        
        if (lineup.gary_notes) {
          console.log(`\n📝 GARY'S NOTES:\n${lineup.gary_notes}`);
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // [4/4] STORE TO SUPABASE
        // ═══════════════════════════════════════════════════════════════════════════
        console.log(`\n[4/4] Storing lineup to Supabase...`);
        
        // Clean up lineup for storage (remove circular refs, functions, etc)
        const cleanLineup = lineup.lineup.map(slot => ({
          position: slot.position,
          player: slot.player,
          team: slot.team,
          salary: slot.salary,
          projected_pts: slot.projected_pts,
          ownership: slot.ownership || null,
          rationale: slot.rationale || null,
          supportingStats: slot.supportingStats || [],
          // Include pivots (swap suggestions) - clean them for storage
          pivots: (slot.pivots || []).map(p => ({
            tier: p.tier,
            tierLabel: p.tierLabel,
            player: p.player,
            team: p.team,
            salary: p.salary,
            projected_pts: p.projected_pts,
            salaryDiff: p.salaryDiff
          }))
        }));
        
        // Check if lineup already exists for this date/platform/slate/time
        // CRITICAL: Include slate_start_time to distinguish slates with same name (e.g., two "Turbo" slates)
        const { data: existing } = await supabase
          .from('dfs_lineups')
          .select('id')
          .eq('date', TODAY)
          .eq('platform', platform)
          .eq('sport', 'NBA')
          .eq('slate_name', slate.name)
          .eq('slate_start_time', slate.startTime || null)
          .single();
        
        const lineupRecord = {
          date: TODAY,
          platform: platform,
          sport: 'NBA',
          salary_cap: lineup.salary_cap,
          total_salary: lineup.total_salary,
          projected_points: lineup.projected_points,
          ceiling_projection: lineup.ceiling_projection || lineup.projected_points,
          floor_projection: lineup.floor_projection || Math.round(lineup.projected_points * 0.8),
          lineup: cleanLineup,
          gary_notes: lineup.gary_notes || null,
          slate_name: slate.name,
          slate_start_time: slate.startTime || null,
          slate_game_count: slate.gameCount || null,
          contest_type: 'gpp',
          stack_info: lineup.stackInfo || null,
          updated_at: new Date().toISOString()
        };
        
        let result;
        if (existing?.id) {
          // Update existing
          result = await supabase
            .from('dfs_lineups')
            .update(lineupRecord)
            .eq('id', existing.id)
            .select();
          console.log(`✅ Updated existing lineup in Supabase (id: ${existing.id})`);
        } else {
          // Insert new
          result = await supabase
            .from('dfs_lineups')
            .insert(lineupRecord)
            .select();
          console.log(`✅ Stored new lineup in Supabase`);
        }
        
        if (result.error) {
          console.error(`❌ Supabase error: ${result.error.message}`);
        } else {
          console.log(`📊 Lineup ID: ${result.data?.[0]?.id}`);
        }
      }
    }
    
    console.log('\n✅ COMPLETE - Lineups stored in Supabase!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
