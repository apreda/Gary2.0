/**
 * Test NBA Playoff Stats Fixes
 * Verifies that the parameter order fix and enhanced team matching work
 */

console.log('🏀 Testing NBA Playoff Stats Fixes...\n');

async function testNbaFixes() {
  try {
    const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
    
    console.log('1️⃣ Testing NBA playoff games with correct season...');
    const playoffGames = await ballDontLieService.getNbaPlayoffGames();
    console.log(`   Found ${playoffGames.length} playoff games`);
    
    if (playoffGames.length > 0) {
      console.log('   Sample teams in playoff games:');
      playoffGames.slice(0, 3).forEach(game => {
        console.log(`   - ${game.visitor_team.name} @ ${game.home_team.name}`);
      });
    }
    
    console.log('\n2️⃣ Testing enhanced team matching for Pacers...');
    const pacersStats = await ballDontLieService.getNbaPlayoffPlayerStats('Indiana Pacers', 'New York Knicks');
    
    console.log(`   Pacers players found: ${pacersStats.away?.length || 0}`);
    console.log(`   Knicks players found: ${pacersStats.home?.length || 0}`);
    
    if (pacersStats.away?.length > 0) {
      console.log('   ✅ Pacers data found! Enhanced matching working.');
      const topPacer = pacersStats.away[0];
      console.log(`   🏀 Top Pacers player: ${topPacer.player.first_name} ${topPacer.player.last_name} - ${topPacer.avgPts} PPG`);
    } else {
      console.log('   ⚠️ Still no Pacers data - may need further investigation');
    }
    
    console.log('\n3️⃣ Testing generateNbaPlayoffReport with correct parameters...');
    const report = await ballDontLieService.generateNbaPlayoffReport(2024, 'Indiana Pacers', 'New York Knicks');
    
    if (report && report.length > 100) {
      console.log('   ✅ Playoff report generated successfully!');
      console.log(`   📊 Report preview: ${report.substring(0, 200)}...`);
    } else {
      console.log('   ⚠️ Report generation issue');
      console.log(`   📊 Report: ${report}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing NBA fixes:', error.message);
  }
}

testNbaFixes(); 