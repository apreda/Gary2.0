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
      
      // Try with mock data for testing
      console.log('\n📝 Using mock data for testing...\n');
      const mockPlayers = generateMockPlayers(sport, platform);
      context.players = mockPlayers;
    }
    
    console.log(`✅ Found ${context.players.length} players with salaries`);
    console.log(`   Games: ${context.gamesCount || 'N/A'}`);
    console.log(`   Grounding used: ${context.groundingUsed ? 'Yes' : 'No'}`);
    
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
      players: context.players
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

/**
 * Generate mock players for testing when no real data available
 */
function generateMockPlayers(sport, platform) {
  if (sport === 'NBA') {
    return [
      // PGs
      { name: 'Luka Doncic', team: 'DAL', position: 'PG', salary: 11200, seasonStats: { ppg: 33.5, rpg: 9.2, apg: 9.8, spg: 1.4, bpg: 0.5, tpg: 3.1 } },
      { name: 'Shai Gilgeous-Alexander', team: 'OKC', position: 'PG', salary: 10800, seasonStats: { ppg: 31.2, rpg: 5.5, apg: 6.2, spg: 2.0, bpg: 0.9, tpg: 1.8 } },
      { name: 'Tyrese Haliburton', team: 'IND', position: 'PG', salary: 8400, seasonStats: { ppg: 20.1, rpg: 4.0, apg: 10.8, spg: 1.2, bpg: 0.5, tpg: 2.5 } },
      { name: 'Darius Garland', team: 'CLE', position: 'PG', salary: 6800, seasonStats: { ppg: 18.5, rpg: 2.6, apg: 6.8, spg: 1.1, bpg: 0.1, tpg: 1.2 } },
      // SGs
      { name: 'Anthony Edwards', team: 'MIN', position: 'SG', salary: 9200, seasonStats: { ppg: 26.2, rpg: 5.5, apg: 5.2, spg: 1.3, bpg: 0.6, tpg: 2.4 } },
      { name: 'Donovan Mitchell', team: 'CLE', position: 'SG', salary: 8600, seasonStats: { ppg: 24.5, rpg: 4.2, apg: 5.0, spg: 1.5, bpg: 0.3, tpg: 1.8 } },
      { name: 'Desmond Bane', team: 'MEM', position: 'SG', salary: 6200, seasonStats: { ppg: 18.2, rpg: 4.5, apg: 4.2, spg: 0.9, bpg: 0.3, tpg: 1.5 } },
      // SFs
      { name: 'LeBron James', team: 'LAL', position: 'SF', salary: 10200, seasonStats: { ppg: 25.5, rpg: 7.8, apg: 8.5, spg: 1.2, bpg: 0.6, tpg: 2.8 } },
      { name: 'Jayson Tatum', team: 'BOS', position: 'SF', salary: 9800, seasonStats: { ppg: 27.0, rpg: 8.2, apg: 4.8, spg: 1.0, bpg: 0.7, tpg: 2.2 } },
      { name: 'Kawhi Leonard', team: 'LAC', position: 'SF', salary: 8200, seasonStats: { ppg: 23.8, rpg: 6.5, apg: 4.0, spg: 1.6, bpg: 0.5, tpg: 1.9 } },
      // PFs
      { name: 'Giannis Antetokounmpo', team: 'MIL', position: 'PF', salary: 11500, seasonStats: { ppg: 31.5, rpg: 12.0, apg: 6.5, spg: 1.1, bpg: 1.4, tpg: 0.8 } },
      { name: 'Kevin Durant', team: 'PHX', position: 'PF', salary: 9400, seasonStats: { ppg: 27.2, rpg: 6.8, apg: 5.2, spg: 0.9, bpg: 1.4, tpg: 1.5 } },
      { name: 'Pascal Siakam', team: 'IND', position: 'PF', salary: 7800, seasonStats: { ppg: 22.5, rpg: 7.2, apg: 4.0, spg: 0.8, bpg: 0.5, tpg: 1.2 } },
      // Cs
      { name: 'Nikola Jokic', team: 'DEN', position: 'C', salary: 12000, seasonStats: { ppg: 26.5, rpg: 12.2, apg: 9.0, spg: 1.4, bpg: 0.9, tpg: 2.8 } },
      { name: 'Victor Wembanyama', team: 'SAS', position: 'C', salary: 9600, seasonStats: { ppg: 21.5, rpg: 10.5, apg: 3.8, spg: 1.2, bpg: 3.8, tpg: 1.0 } },
      { name: 'Bam Adebayo', team: 'MIA', position: 'C', salary: 7200, seasonStats: { ppg: 19.5, rpg: 10.2, apg: 4.5, spg: 1.1, bpg: 0.9, tpg: 1.0 } },
      { name: 'Myles Turner', team: 'IND', position: 'C', salary: 5600, seasonStats: { ppg: 14.2, rpg: 6.8, apg: 1.2, spg: 0.6, bpg: 2.5, tpg: 0.3 } },
    ];
  }
  
  // NFL mock data
  return [
    { name: 'Josh Allen', team: 'BUF', position: 'QB', salary: 8200, seasonStats: { passing_yards_per_game: 285, passing_touchdowns: 28, passing_interceptions: 8, rushing_yards_per_game: 45, rushing_touchdowns: 6 } },
    { name: 'Lamar Jackson', team: 'BAL', position: 'QB', salary: 7800, seasonStats: { passing_yards_per_game: 245, passing_touchdowns: 24, passing_interceptions: 5, rushing_yards_per_game: 65, rushing_touchdowns: 5 } },
    { name: 'Derrick Henry', team: 'BAL', position: 'RB', salary: 7200, seasonStats: { rushing_yards_per_game: 95, rushing_touchdowns: 14, receptions: 20, receiving_yards_per_game: 15 } },
    { name: 'Saquon Barkley', team: 'PHI', position: 'RB', salary: 7000, seasonStats: { rushing_yards_per_game: 88, rushing_touchdowns: 11, receptions: 45, receiving_yards_per_game: 30 } },
    { name: "Ja'Marr Chase", team: 'CIN', position: 'WR', salary: 8400, seasonStats: { receiving_yards_per_game: 105, receiving_touchdowns: 15, receptions: 95, receiving_targets: 140 } },
    { name: 'Tyreek Hill', team: 'MIA', position: 'WR', salary: 7800, seasonStats: { receiving_yards_per_game: 92, receiving_touchdowns: 10, receptions: 88, receiving_targets: 125 } },
    { name: 'CeeDee Lamb', team: 'DAL', position: 'WR', salary: 7600, seasonStats: { receiving_yards_per_game: 85, receiving_touchdowns: 9, receptions: 82, receiving_targets: 120 } },
    { name: 'Travis Kelce', team: 'KC', position: 'TE', salary: 6200, seasonStats: { receiving_yards_per_game: 65, receiving_touchdowns: 8, receptions: 75, receiving_targets: 100 } },
  ];
}

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

