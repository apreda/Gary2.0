#!/usr/bin/env node
/**
 * Generate DFS Lineup - REAL DATA
 * Runs Gary's Fantasy lineup generation for today's games
 */

import dotenv from 'dotenv';
dotenv.config();

// Wait for dotenv to load before importing services
setTimeout(async () => {
  const { buildDFSContext } = await import('./src/services/agentic/dfsAgenticContext.js');
  const { generateDFSLineup, validateLineup, PLATFORM_CONSTRAINTS } = await import('./src/services/dfsLineupService.js');

  const platform = process.argv[2] || 'draftkings';
  const sport = process.argv[3] || 'NBA';
  const date = process.argv[4] || '2026-01-05';

  console.log('\n' + '='.repeat(80));
  console.log('  🎰 GARY\'S FANTASY - GENERATING LINEUP WITH REAL DATA');
  console.log('='.repeat(80));
  console.log(`\nPlatform: ${platform.toUpperCase()}`);
  console.log(`Sport: ${sport}`);
  console.log(`Date: ${date}`);
  console.log(`Mode: TOURNAMENT (max ceiling to WIN BIG)\n`);

  try {
    console.log('⏳ Fetching real data from APIs...\n');
    
    const context = await buildDFSContext(platform, sport, date);
    
    if (!context.players || context.players.length === 0) {
      console.log(`\n❌ No players with salaries found for ${date}`);
      console.log('   Reasons: No games today OR salaries not posted yet');
      process.exit(1);
    }
    
    console.log(`✅ Player pool: ${context.players.length} players`);
    console.log(`✅ Games today: ${context.games?.length || 0}`);
    if (context.targetPlayers?.length) console.log(`✅ Narrative targets: ${context.targetPlayers.length}`);
    if (context.fadePlayers?.length) console.log(`✅ Players to fade: ${context.fadePlayers.length}`);
    
    console.log('\n⏳ Optimizing lineup...\n');
    
    const lineup = await generateDFSLineup({
      platform,
      sport,
      players: context.players,
      context: {
        contestType: 'gpp',
        fadePlayers: context.fadePlayers || [],
        targetPlayers: context.targetPlayers || [],
        games: context.games || []
      }
    });
    
    const validation = validateLineup(lineup, platform, sport);
    const constraints = PLATFORM_CONSTRAINTS[platform][sport];
    
    console.log('\n' + '='.repeat(80));
    console.log('  📊 OPTIMAL LINEUP');
    console.log('='.repeat(80));
    
    console.log(`\n💰 Salary: $${lineup.total_salary.toLocaleString()} / $${constraints.salaryCap.toLocaleString()}`);
    const remaining = constraints.salaryCap - lineup.total_salary;
    console.log(`   Remaining: $${remaining.toLocaleString()}`);
    
    console.log(`\n📈 Projections:`);
    console.log(`   Points: ${lineup.projected_points}`);
    console.log(`   Ceiling: ${lineup.ceiling_projection} pts (upside)`);
    console.log(`   Floor: ${lineup.floor_projection} pts (safe)`);
    
    const avgOwn = lineup.lineup.reduce((sum, p) => sum + (p.ownership || 0), 0) / lineup.lineup.length;
    console.log(`\n👥 Avg Ownership: ${avgOwn.toFixed(1)}%`);
    
    console.log(`\n📝 Starting Lineup:`);
    console.log('─'.repeat(80));
    
    lineup.lineup.forEach((p, i) => {
      const badges = [];
      if (p.isContrarian) badges.push('🎲');
      if (p.isPriceLag) badges.push('🚀');
      if (p.projectionBoosted) badges.push('⚡');
      if (p.ownership < 10) badges.push('💎');
      
      const num = `${i+1}.`.padStart(3);
      const pos = p.position.padEnd(4);
      const name = p.player.padEnd(25);
      const team = (p.team || '').padEnd(3);
      const sal = `$${p.salary.toLocaleString()}`.padStart(8);
      const pts = `${p.projected_pts.toFixed(1)}`.padStart(5);
      const own = `${p.ownership}%`.padStart(5);
      const val = `${(p.projected_pts / (p.salary / 1000)).toFixed(2)}x`.padStart(6);
      
      console.log(`${num} ${pos} ${name} ${team} ${sal} | ${pts} pts | ${own} own | ${val} ${badges.join(' ')}`);
    });
    
    if (lineup.stackInfo?.primaryStack) {
      console.log(`\n🏈 Stack: ${lineup.stackInfo.primaryStack.qb} + ${lineup.stackInfo.primaryStack.receivers.join(', ')}`);
    }
    
    console.log(`\n${validation.valid ? '✅ Valid lineup' : '⚠️  ' + validation.errors.join(', ')}`);
    
    console.log('\n' + '='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}, 100); // Wait for dotenv to fully load

