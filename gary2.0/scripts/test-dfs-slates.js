#!/usr/bin/env node
/**
 * Test script to verify DFS slate discovery and game filtering
 * Run with: node scripts/test-dfs-slates.js
 *
 * This tests WITHOUT saving to Supabase - just verifies slates and games are correct.
 */

import 'dotenv/config';
import { discoverDFSSlates } from '../src/services/agentic/dfsSlateDiscoveryService.js';
import { buildDFSContext } from '../src/services/agentic/dfsAgenticContext.js';
import { ballDontLieService } from '../src/services/ballDontLieService.js';

// Get today's date in EST
function estToday() {
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

async function testSlateDiscovery() {
  const dateStr = estToday();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`DFS SLATE DISCOVERY TEST - ${dateStr}`);
  console.log(`${'='.repeat(80)}\n`);

  // First, get all games for today to compare
  console.log('📅 Fetching all NBA games for today...\n');
  const allGames = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr] }, 5) || [];

  if (allGames.length === 0) {
    console.log('❌ No NBA games found for today. Exiting.\n');
    return;
  }

  console.log(`Found ${allGames.length} NBA games today:\n`);
  allGames.forEach(g => {
    const away = g.visitor_team?.abbreviation || g.away_team?.abbreviation || '???';
    const home = g.home_team?.abbreviation || '???';
    const time = g.status || 'TBD';
    console.log(`   ${away} @ ${home} - ${time}`);
  });

  // Test DraftKings slate discovery
  console.log(`\n${'─'.repeat(80)}`);
  console.log('🎯 DRAFTKINGS SLATE DISCOVERY');
  console.log(`${'─'.repeat(80)}\n`);

  const dkSlates = await discoverDFSSlates('nba', 'draftkings', dateStr);

  if (!dkSlates || dkSlates.length === 0) {
    console.log('❌ No DraftKings slates discovered!\n');
  } else {
    console.log(`✅ Found ${dkSlates.length} DraftKings Classic slates:\n`);
    for (const slate of dkSlates) {
      console.log(`\n   📋 ${slate.name} (${slate.startTime || 'TBD'})`);
      console.log(`      Game Count: ${slate.gameCount || 'unknown'}`);
      console.log(`      Games: ${(slate.games || slate.matchups || []).join(', ') || 'none'}`);
      console.log(`      Teams: ${(slate.teams || []).join(', ') || 'none'}`);
      console.log(`      Source: ${slate.source || 'unknown'}`);
    }
  }

  // Test FanDuel slate discovery
  console.log(`\n${'─'.repeat(80)}`);
  console.log('🎯 FANDUEL SLATE DISCOVERY');
  console.log(`${'─'.repeat(80)}\n`);

  const fdSlates = await discoverDFSSlates('nba', 'fanduel', dateStr);

  if (!fdSlates || fdSlates.length === 0) {
    console.log('❌ No FanDuel slates discovered!\n');
  } else {
    console.log(`✅ Found ${fdSlates.length} FanDuel Full Roster slates:\n`);
    for (const slate of fdSlates) {
      console.log(`\n   📋 ${slate.name} (${slate.startTime || 'TBD'})`);
      console.log(`      Game Count: ${slate.gameCount || 'unknown'}`);
      console.log(`      Games: ${(slate.games || slate.matchups || []).join(', ') || 'none'}`);
      console.log(`      Teams: ${(slate.teams || []).join(', ') || 'none'}`);
      console.log(`      Source: ${slate.source || 'unknown'}`);
    }
  }

  // Test building DFS context for first DK slate
  if (dkSlates && dkSlates.length > 0) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log('🧪 TESTING DFS CONTEXT BUILD (DraftKings)');
    console.log(`${'─'.repeat(80)}\n`);

    for (const slate of dkSlates.slice(0, 2)) { // Test first 2 slates
      console.log(`\n📦 Building context for "${slate.name}" slate...`);

      const context = await buildDFSContext('draftkings', 'NBA', dateStr, slate);

      if (context.error) {
        console.log(`   ❌ ERROR: ${context.error}`);
      } else {
        console.log(`   ✅ SUCCESS!`);
        console.log(`      Games in context: ${context.gamesCount || context.games?.length || 0}`);
        console.log(`      Players with salaries: ${context.players?.length || 0}`);

        // Show which teams' players are included
        const teamsInContext = new Set();
        (context.players || []).forEach(p => {
          if (p.team) teamsInContext.add(p.team.toUpperCase());
        });
        console.log(`      Teams in player pool: ${Array.from(teamsInContext).sort().join(', ')}`);

        // Validate no contamination
        const expectedTeams = new Set((slate.teams || []).map(t => t.toUpperCase()));
        const unexpectedTeams = Array.from(teamsInContext).filter(t => !expectedTeams.has(t));

        if (unexpectedTeams.length > 0) {
          console.log(`   ⚠️ CONTAMINATION DETECTED! Unexpected teams: ${unexpectedTeams.join(', ')}`);
        } else {
          console.log(`   ✅ No contamination - all players from expected teams`);
        }
      }
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('TEST COMPLETE');
  console.log(`${'='.repeat(80)}\n`);
}

// Run the test
testSlateDiscovery().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
