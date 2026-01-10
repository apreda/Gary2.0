/**
 * Direct DFS Test - No HTTP layer, just the core generation logic
 */

// Load environment variables from .env
import dotenv from 'dotenv';
dotenv.config();

import { buildDFSContext } from './src/services/agentic/dfsAgenticContext.js';
import { generateDFSLineup, validateLineup, PLATFORM_CONSTRAINTS } from './src/services/dfsLineupService.js';

const platform = 'draftkings';
const sport = 'NBA';
const date = '2026-01-05'; // Today

console.log('\n' + '='.repeat(80));
console.log('  🎰 GARY\'S FANTASY - REAL DATA TEST');
console.log('='.repeat(80));
console.log(`\nPlatform: ${platform.toUpperCase()}`);
console.log(`Sport: ${sport}`);
console.log(`Date: ${date}`);
console.log(`Mode: TOURNAMENT (ceiling optimization to WIN)\n`);

async function testDFS() {
  try {
    console.log('⏳ Step 1: Fetching real data...');
    console.log('   - Tank01 API: DFS salaries');
    console.log('   - Ball Don\'t Lie API: Player stats, games, injuries');
    console.log('   - Gemini Grounding: Narrative context, ownership\n');
    
    const context = await buildDFSContext(platform, sport, date);
    
    if (!context.players || context.players.length === 0) {
      console.log(`\n❌ No players found`);
      console.log('   Possible reasons:');
      console.log('   - No NBA games scheduled for ${date}');
      console.log('   - Salaries not yet posted by DraftKings');
      console.log('   - API rate limit hit');
      return;
    }
    
    console.log(`✅ Found ${context.players.length} players with salaries`);
    console.log(`   Games: ${context.games?.length || 0}`);
    
    console.log('\n⏳ Step 2: Generating optimal lineup...\n');
    
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
    console.log('  📊 LINEUP GENERATED');
    console.log('='.repeat(80));
    
    console.log(`\n💰 Salary: $${lineup.total_salary.toLocaleString()} / $${constraints.salaryCap.toLocaleString()}`);
    console.log(`📈 Projected: ${lineup.projected_points} pts (Ceiling: ${lineup.ceiling_projection}, Floor: ${lineup.floor_projection})`);
    
    console.log(`\n📝 Lineup:`);
    lineup.lineup.forEach((p, i) => {
      const badges = [];
      if (p.isContrarian) badges.push('🎲');
      if (p.isPriceLag) badges.push('🚀');
      console.log(`${i+1}. ${p.position.padEnd(4)} ${p.player.padEnd(25)} $${p.salary.toLocaleString().padStart(6)} | ${p.projected_pts.toFixed(1)} pts | ${p.ownership}% own ${badges.join(' ')}`);
    });
    
    console.log(`\n${validation.valid ? '✅' : '⚠️ '} Validation: ${validation.valid ? 'Valid' : validation.errors.join(', ')}`);
    console.log('\n' + '='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testDFS();

