/**
 * Test Indiana Pacers NBA Playoff Stats Fix
 * Debug why Pacers are returning 0 players while Knicks work fine
 */

console.log('🏀 Testing Indiana Pacers NBA Playoff Stats Fix...\n');

async function testPacersFix() {
  try {
    const { ballDontLieService } = await import('./src/services/ballDontLieService.js');
    
    console.log('1️⃣ Testing team name variations for Indiana Pacers...');
    
    const teamVariations = [
      'Indiana Pacers',
      'Pacers',
      'Indiana',
      'IND'
    ];
    
    for (const teamName of teamVariations) {
      console.log(`\n   Testing: "${teamName}"`);
      const teamData = await ballDontLieService.getTeamByName(teamName);
      
      if (teamData) {
        console.log(`   ✅ Found: ${teamData.full_name} (ID: ${teamData.id})`);
      } else {
        console.log(`   ❌ Not found: "${teamName}"`);
      }
    }
    
    console.log('\n2️⃣ Testing direct playoff games for 2024 season...');
    const playoffGames = await ballDontLieService.getNbaPlayoffGames(2024);
    console.log(`   Found ${playoffGames.length} total playoff games for 2024 season`);
    
    // Look for Pacers games specifically
    const pacersGames = playoffGames.filter(game => {
      const homeTeam = game.home_team?.name || game.home_team?.full_name || '';
      const awayTeam = game.visitor_team?.name || game.visitor_team?.full_name || '';
      
      return homeTeam.toLowerCase().includes('pacer') || 
             awayTeam.toLowerCase().includes('pacer') ||
             homeTeam.toLowerCase().includes('indiana') || 
             awayTeam.toLowerCase().includes('indiana');
    });
    
    console.log(`   Found ${pacersGames.length} games involving Pacers`);
    
    if (pacersGames.length > 0) {
      console.log('   📊 Sample Pacers playoff games:');
      pacersGames.slice(0, 3).forEach((game, index) => {
        console.log(`   ${index + 1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
      });
    }
    
    console.log('\n3️⃣ Testing player stats for Knicks vs Pacers specifically...');
    const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats(
      'New York Knicks', 
      'Indiana Pacers',
      2024
    );
    
    console.log(`   Knicks players: ${playerStats.home?.length || 0}`);
    console.log(`   Pacers players: ${playerStats.away?.length || 0}`);
    
    if (playerStats.home?.length > 0) {
      console.log('   🏀 Top Knicks player:');
      const topKnick = playerStats.home[0];
      console.log(`      ${topKnick.player.first_name} ${topKnick.player.last_name} - ${topKnick.avgPts} PPG`);
    }
    
    if (playerStats.away?.length > 0) {
      console.log('   🏀 Top Pacers player:');
      const topPacer = playerStats.away[0];
      console.log(`      ${topPacer.player.first_name} ${topPacer.player.last_name} - ${topPacer.avgPts} PPG`);
    } else {
      console.log('   ❌ No Pacers players found - investigating...');
      
      // Debug the team matching
      const pacersTeamData = await ballDontLieService.getTeamByName('Indiana Pacers');
      if (pacersTeamData) {
        console.log(`   🔍 Pacers team data: ${pacersTeamData.full_name} (ID: ${pacersTeamData.id})`);
        
        // Check if there are any games for this team ID
        const pacersGamesByTeamId = playoffGames.filter(game => 
          game.home_team.id === pacersTeamData.id || 
          game.visitor_team.id === pacersTeamData.id
        );
        
        console.log(`   🔍 Games by team ID: ${pacersGamesByTeamId.length}`);
        
        if (pacersGamesByTeamId.length > 0) {
          console.log('   📊 Games found by team ID:');
          pacersGamesByTeamId.slice(0, 3).forEach((game, index) => {
            console.log(`   ${index + 1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
          });
        }
      }
    }
    
    console.log('\n4️⃣ Testing alternative team name matching...');
    
    // Test the enhanced matching logic directly
    const alternativeStats = await ballDontLieService.getNbaPlayoffPlayerStats(
      'Knicks', 
      'Pacers',
      2024
    );
    
    console.log(`   Alternative matching - Knicks: ${alternativeStats.home?.length || 0}, Pacers: ${alternativeStats.away?.length || 0}`);
    
    console.log('\n🎯 DIAGNOSIS:');
    if (playerStats.away?.length > 0) {
      console.log('✅ Pacers stats are working correctly!');
    } else {
      console.log('❌ Pacers stats still not working. Possible issues:');
      console.log('   - Team name matching problem');
      console.log('   - No playoff games found for Pacers in 2024');
      console.log('   - API data structure mismatch');
      console.log('   - Season parameter issue');
    }
    
  } catch (error) {
    console.error('❌ Error testing Pacers fix:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testPacersFix(); 