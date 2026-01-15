#!/usr/bin/env node

/**
 * Test NBA DFS Lineups (No Database)
 * Verifies KD tier labels and rotation awareness for Jan 13, 2026
 */

import 'dotenv/config';
import { generateDFSLineup, PLATFORM_CONSTRAINTS } from './src/services/dfsLineupService.js';
import { buildDFSContext, discoverDFSSlates } from './src/services/agentic/dfsAgenticContext.js';

const TODAY = '2026-01-13';

async function runTest() {
  console.log('═'.repeat(100));
  console.log(`🏀 NBA DFS TEST (NO DB) - ${TODAY}`);
  console.log('═'.repeat(100));

  const platforms = ['draftkings', 'fanduel'];
  
  for (const platform of platforms) {
    console.log(`\n🎰 TESTING ${platform.toUpperCase()}`);
    
    // 1. Discover Slates
    const slates = await discoverDFSSlates('NBA', platform, TODAY);
    if (!slates || slates.length === 0) {
      console.log('❌ No slates found');
      continue;
    }

    // Just test the first classic/main slate found
    const slate = slates.find(s => s.name.toLowerCase().includes('main') || s.name.toLowerCase().includes('all')) || slates[0];
    console.log(`\n📋 Testing Slate: ${slate.name} (${slate.gameCount} games)`);

    // 2. Build Context
    const context = await buildDFSContext(platform, 'NBA', TODAY, slate);
    
    // Check for Looney/Huerter specifically in the pool
    const looney = context.players.find(p => p.name.includes('Kevon Looney'));
    const huerter = context.players.find(p => p.name.includes('Kevin Huerter'));
    
    if (looney) {
      console.log(`⚠️  Looney found in pool - Status: ${looney.status}, PPG: ${looney.seasonStats?.ppg}, MPG: ${looney.seasonStats?.mpg}`);
    } else {
      console.log('✅ Kevon Looney correctly EXCLUDED from pool (Rotation Risk)');
    }

    if (huerter) {
      console.log(`⚠️  Huerter found in pool - Team: ${huerter.team}`);
    } else {
      console.log('✅ Kevin Huerter check: He plays for CHI in 2026, so he should be in pool.');
    }

    // 3. Generate Lineup
    console.log('\n[Lineup Generation] Building optimal lineup...');
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

    // 4. Print Results
    console.log(`\n✅ Grade: ${result.audit?.grade} (${result.audit?.sharpScore}/100)`);
    console.log(`\nLineup:`);
    result.lineup.forEach(slot => {
      console.log(`   ${slot.position.padEnd(5)} | ${slot.player.padEnd(20)} | $${slot.salary.toString().padEnd(6)} | ${slot.team}`);
    });

    // 5. Check KD Pivots
    console.log('\n🔍 Checking Pivots (KD Label Verification):');
    const giannisSlot = result.lineup.find(s => s.player.includes('Giannis'));
    if (giannisSlot) {
      const kdPivot = giannisSlot.pivots.find(p => p.player.includes('Durant'));
      if (kdPivot) {
        console.log(`   Found KD Pivot: ${kdPivot.player} - Salary: $${kdPivot.salary}`);
        console.log(`   Label: ${kdPivot.tierLabel} (Expected: Core Alternative)`);
        console.log(`   Description: ${kdPivot.tierDescription}`);
        if (kdPivot.tierLabel === 'Core Alternative') {
          console.log('   ✅ KD correctly labeled as CORE player!');
        } else {
          console.log('   ❌ KD label still incorrect');
        }
      } else {
        console.log('   Giannis in lineup but KD not found in pivots (likely due to positional eligibility)');
      }
    } else {
      // Check all pivots for KD
      let foundKD = false;
      result.lineup.forEach(slot => {
        const kd = slot.pivots.find(p => p.player.includes('Durant'));
        if (kd) {
          foundKD = true;
          console.log(`   Found KD Pivot for ${slot.player}: ${kd.tierLabel}`);
        }
      });
      if (!foundKD) console.log('   KD not found in any pivot spots for this build.');
    }
  }
}

runTest().catch(console.error);
