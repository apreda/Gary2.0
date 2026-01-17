#!/usr/bin/env node
import 'dotenv/config';
import { generateDFSLineup, PLATFORM_CONSTRAINTS, validateLineup } from './src/services/dfsLineupService.js';
import { buildDFSContext, discoverDFSSlates } from './src/services/agentic/dfsAgenticContext.js';

const TODAY = '2026-01-16';

async function runTest() {
  console.log('═'.repeat(100));
  console.log(`🏀 NBA DFS LINEUP TEST - ${TODAY} (NO DB STORAGE)`);
  console.log('═'.repeat(100));
  
  for (const platform of ['draftkings', 'fanduel']) {
    console.log(`\n\n${'▓'.repeat(100)}`);
    console.log(`🎰 ${platform.toUpperCase()} LINEUPS`);
    console.log('▓'.repeat(100));
    
    const slates = await discoverDFSSlates('NBA', platform, TODAY);
    if (!slates || slates.length === 0) {
      console.log('No slates found');
      continue;
    }
    
    const slate = slates[0];
    console.log(`\n📋 Slate: ${slate.name} (${slate.gameCount || '?'} games)\n`);
    
    const context = await buildDFSContext(platform, 'NBA', TODAY, slate);
    
    if (!context.players || context.players.length === 0) {
      console.log('No players found');
      continue;
    }
    
    console.log(`✅ ${context.players.length} players loaded`);
    console.log('Generating lineup...\n');
    
    const result = await generateDFSLineup({
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
    
    // Display lineup
    console.log('\n' + '═'.repeat(100));
    console.log(`💰 ${platform.toUpperCase()} LINEUP`);
    console.log('═'.repeat(100));
    console.log(`Salary: $${result.total_salary?.toLocaleString()} / $${result.salary_cap?.toLocaleString()}`);
    console.log(`Projected: ${result.projected_points?.toFixed(1)} pts | Ceiling: ${result.total_ceiling?.toFixed(1)} pts | Floor: ${result.total_floor?.toFixed(1)} pts`);
    console.log(`Avg Ownership: ${result.avg_ownership?.toFixed(1)}%`);
    
    console.log('\n' + '-'.repeat(100));
    console.log('POS   PLAYER                        TEAM    SALARY      PROJ   VALUE   OWN%');
    console.log('-'.repeat(100));
    
    result.lineup.forEach((slot, i) => {
      const pos = slot.position.padEnd(5);
      const name = slot.player.padEnd(28);
      const team = (slot.team || '').padEnd(4);
      const salary = `$${(slot.salary || 0).toLocaleString()}`.padStart(8);
      const proj = `${(slot.projected_pts || 0).toFixed(1)}`.padStart(6);
      const val = `${((slot.projected_pts || 0) / ((slot.salary || 5000) / 1000)).toFixed(2)}x`.padStart(6);
      const own = slot.ownership ? `${slot.ownership.toFixed(0)}%`.padStart(4) : ' N/A';
      console.log(`${pos} ${name} ${team} ${salary}   ${proj}  ${val}  ${own}`);
    });
    
    console.log('\n' + '═'.repeat(100));
    console.log('📝 GARY\'S REASONING:');
    console.log('═'.repeat(100));
    console.log(result.gary_notes);
  }
}

runTest().catch(console.error);
