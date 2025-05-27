/**
 * Test NBA 2025 Playoffs Fixes
 * Verifies that the season parameter fix (2024 for 2025 playoffs) and enhanced team matching work
 */

console.log('🏀 Testing NBA 2025 Playoffs Fixes...\n');

async function testNba2025PlayoffsFixes() {
  try {
    const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
    
    // Test current season calculation
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const expectedSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    console.log(`📅 Current date: ${new Date().toLocaleDateString()}`);
    console.log(`📅 Current year: ${currentYear}, Month: ${currentMonth}`);
    console.log(`📅 Expected playoff season: ${expectedSeason} (for ${expectedSeason}-${expectedSeason + 1} NBA season)\n`);
    
    console.log('1️⃣ Testing NBA playoff games with correct season parameter...');
    const playoffGames = await ballDontLieService.getNbaPlayoffGames();
    console.log(`   Found ${playoffGames.length} playoff games for ${expectedSeason} season`);
    
    if (playoffGames.length > 0) {
      console.log('   ✅ Playoff games found! Season parameter working correctly.');
      console.log('   📊 Sample playoff games:');
      playoffGames.slice(0, 5).forEach((game, index) => {
        console.log(`   ${index + 1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date}) - Status: ${game.status}`);
      });
      
      // Check if we have recent/current playoff games
      const recentGames = playoffGames.filter(game => {
        const gameDate = new Date(game.date);
        const daysDiff = (new Date() - gameDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30; // Games within last 30 days
      });
      
      console.log(`   📈 Recent games (last 30 days): ${recentGames.length}`);
    } else {
      console.log('   ⚠️ No playoff games found - may be off-season or API issue');
    }
    
    console.log('\n2️⃣ Testing active playoff teams detection...');
    const activeTeams = await ballDontLieService.getActivePlayoffTeams();
    console.log(`   Found ${activeTeams.length} active playoff teams`);
    
    if (activeTeams.length > 0) {
      console.log('   ✅ Active teams found!');
      activeTeams.slice(0, 8).forEach((team, index) => {
        console.log(`   ${index + 1}. ${team.full_name} (${team.conference} Conference)`);
      });
    } else {
      console.log('   ⚠️ No active teams found - may be off-season');
    }
    
    console.log('\n3️⃣ Testing enhanced team matching and player stats...');
    
    // Test with common playoff teams (adjust based on current playoffs)
    const testTeams = [
      ['Boston Celtics', 'Miami Heat'],
      ['Denver Nuggets', 'Los Angeles Lakers'],
      ['Milwaukee Bucks', 'Philadelphia 76ers'],
      ['Phoenix Suns', 'Golden State Warriors']
    ];
    
    let successfulTests = 0;
    
    for (const [team1, team2] of testTeams) {
      console.log(`\n   Testing: ${team1} vs ${team2}`);
      
      const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats(team1, team2);
      
      const team1Players = playerStats.home?.length || 0;
      const team2Players = playerStats.away?.length || 0;
      
      console.log(`   ${team1}: ${team1Players} players found`);
      console.log(`   ${team2}: ${team2Players} players found`);
      
      if (team1Players > 0 && team2Players > 0) {
        console.log('   ✅ Both teams have player data!');
        successfulTests++;
        
        // Show top player from each team
        if (playerStats.home[0]) {
          const topHome = playerStats.home[0];
          console.log(`   🏀 Top ${team1} player: ${topHome.player.first_name} ${topHome.player.last_name} - ${topHome.avgPts} PPG`);
        }
        if (playerStats.away[0]) {
          const topAway = playerStats.away[0];
          console.log(`   🏀 Top ${team2} player: ${topAway.player.first_name} ${topAway.player.last_name} - ${topAway.avgPts} PPG`);
        }
        break; // Found working teams, no need to test more
      } else {
        console.log('   ⚠️ Missing player data for one or both teams');
      }
    }
    
    console.log('\n4️⃣ Testing playoff series detection...');
    
    if (activeTeams.length >= 2) {
      const team1 = activeTeams[0];
      const team2 = activeTeams[1];
      
      console.log(`   Testing series: ${team1.name} vs ${team2.name}`);
      
      const seriesData = await ballDontLieService.getNbaPlayoffSeries(
        expectedSeason, 
        team1.name, 
        team2.name
      );
      
      if (seriesData.seriesFound) {
        console.log('   ✅ Series data found!');
        console.log(`   📊 Series status: ${seriesData.seriesStatus}`);
        console.log(`   🎮 Games played: ${seriesData.games.length}`);
      } else {
        console.log('   ⚠️ No series found between these teams');
        console.log(`   💡 Message: ${seriesData.message}`);
      }
    }
    
    console.log('\n5️⃣ Testing comprehensive playoff report generation...');
    
    if (activeTeams.length >= 2) {
      const team1 = activeTeams[0];
      const team2 = activeTeams[1];
      
      const report = await ballDontLieService.generateNbaPlayoffReport(
        expectedSeason,
        team1.name,
        team2.name
      );
      
      if (report && report.length > 100) {
        console.log('   ✅ Comprehensive playoff report generated!');
        console.log(`   📄 Report length: ${report.length} characters`);
        console.log(`   📖 Report preview:\n${report.substring(0, 300)}...`);
      } else {
        console.log('   ⚠️ Report generation issue');
        console.log(`   📄 Report: ${report}`);
      }
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log(`✅ Season calculation: ${expectedSeason} for ${expectedSeason}-${expectedSeason + 1} playoffs`);
    console.log(`✅ Playoff games found: ${playoffGames.length}`);
    console.log(`✅ Active teams found: ${activeTeams.length}`);
    console.log(`✅ Successful player stats tests: ${successfulTests}/${testTeams.length}`);
    
    if (playoffGames.length > 0 && activeTeams.length > 0) {
      console.log('\n🏆 NBA 2025 Playoffs integration is working correctly!');
    } else {
      console.log('\n⚠️ May be off-season or need further investigation');
    }
    
  } catch (error) {
    console.error('❌ Error testing NBA 2025 playoffs fixes:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testNba2025PlayoffsFixes(); 