#!/usr/bin/env node
/**
 * DFS Diagnostic Test
 */

import 'dotenv/config';
import { buildDFSContext, discoverDFSSlates } from './src/services/agentic/dfsAgenticContext.js';
import { generateAgenticDFSLineup } from './src/services/agentic/dfs/dfsAgenticOrchestrator.js';

async function runDFS() {
  console.log('=== DFS DIAGNOSTIC RUN ===');
  console.log('Date: 2026-02-03');
  console.log('Platform: DraftKings');

  // 1. Discover slates
  console.log('\n[1] Discovering slates...');
  const slates = await discoverDFSSlates('NBA', 'draftkings', '2026-02-03');
  console.log('Found', slates?.length || 0, 'slates:');
  slates?.forEach(s => console.log('  -', s.name, '(', s.gameCount, 'games)'));

  if (!slates || slates.length === 0) {
    console.log('No slates found!');
    return;
  }

  // Use Main slate
  const slate = slates.find(s => s.name.toLowerCase().includes('main')) || slates[0];
  console.log('\n[2] Using slate:', slate.name);

  // 2. Build context
  console.log('\n[3] Building context...');
  const context = await buildDFSContext('draftkings', 'NBA', '2026-02-03', slate);
  console.log('Context built:');
  console.log('  - Players:', context.players?.length);
  console.log('  - Games:', context.games?.length);
  console.log('  - Context size:', JSON.stringify(context).length, 'chars');

  // Show sample players
  console.log('\n[4] Sample players:');
  context.players?.slice(0, 5).forEach(p => {
    console.log('  -', p.name, '(' + p.team + ')', '$' + p.salary, p.positions?.join('/'));
  });

  // 3. Generate lineup
  console.log('\n[5] Generating agentic lineup...');
  const startTime = Date.now();
  try {
    const result = await generateAgenticDFSLineup({
      platform: 'draftkings',
      sport: 'NBA',
      date: '2026-02-03',  // Fixed: use 'date' not 'slateDate'
      slate,
      context,  // Pass pre-built context to avoid rebuild
      contestType: 'gpp'
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n[6] RESULT (' + elapsed + 's):');
    console.log('  Conviction:', result.conviction);
    console.log('  Total Salary:', result.totalSalary);
    console.log('  Projected Ceiling:', result.ceilingProjection);
    console.log('\nLineup:');
    // Note: orchestrator returns result.lineup, not result.players
    const lineupPlayers = result.lineup || result.players || [];
    lineupPlayers.forEach(p => {
      console.log('  ' + p.position + ': ' + p.name + ' (' + p.team + ') - $' + p.salary);
    });

    // Verify all players are from context
    console.log('\n[7] VALIDATION:');
    const contextTeams = new Set(context.players.map(p => p.team));
    const lineupTeams = new Set(lineupPlayers.map(p => p.team) || []);
    console.log('  Context teams:', [...contextTeams].sort().join(', '));
    console.log('  Lineup teams:', [...lineupTeams].sort().join(', '));

    const invalidTeams = [...lineupTeams].filter(t => !contextTeams.has(t));
    if (invalidTeams.length > 0) {
      console.log('  ❌ INVALID - Players from teams not in context:', invalidTeams);
    } else {
      console.log('  ✓ All players from valid teams');
    }

  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n[6] ERROR after ' + elapsed + 's:');
    console.log(e.message);
    console.log('\nStack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

runDFS().catch(console.error);
