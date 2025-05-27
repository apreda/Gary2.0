// Debug Pacers Stats Issue
// Comprehensive diagnostic to find why Pacers return 0 players while Knicks return 8

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function debugPacersStatsIssue() {
  console.log('🔍 DEBUGGING PACERS STATS ISSUE');
  console.log('================================');
  
  try {
    // Initialize the service
    await ballDontLieService.initialize();
    
    // Step 1: Verify team data retrieval
    console.log('\n📊 STEP 1: Team Data Verification');
    console.log('----------------------------------');
    
    const knicksTeam = await ballDontLieService.getTeamByName('New York Knicks');
    const pacersTeam = await ballDontLieService.getTeamByName('Indiana Pacers');
    
    console.log('Knicks Team Data:');
    console.log(`  - Name: ${knicksTeam?.name || 'NOT FOUND'}`);
    console.log(`  - Full Name: ${knicksTeam?.full_name || 'NOT FOUND'}`);
    console.log(`  - ID: ${knicksTeam?.id || 'NOT FOUND'}`);
    console.log(`  - Abbreviation: ${knicksTeam?.abbreviation || 'NOT FOUND'}`);
    
    console.log('\nPacers Team Data:');
    console.log(`  - Name: ${pacersTeam?.name || 'NOT FOUND'}`);
    console.log(`  - Full Name: ${pacersTeam?.full_name || 'NOT FOUND'}`);
    console.log(`  - ID: ${pacersTeam?.id || 'NOT FOUND'}`);
    console.log(`  - Abbreviation: ${pacersTeam?.abbreviation || 'NOT FOUND'}`);
    
    if (!knicksTeam || !pacersTeam) {
      console.log('❌ CRITICAL: One or both teams not found!');
      return;
    }
    
    // Step 2: Check playoff games for both teams
    console.log('\n📊 STEP 2: Playoff Games Analysis');
    console.log('----------------------------------');
    
    const playoffGames = await ballDontLieService.getNbaPlayoffGames(2024);
    console.log(`Total playoff games for 2024 season: ${playoffGames.length}`);
    
    // Filter games for each team
    const knicksGames = playoffGames.filter(game => 
      game.home_team.id === knicksTeam.id || game.visitor_team.id === knicksTeam.id
    );
    
    const pacersGames = playoffGames.filter(game => 
      game.home_team.id === pacersTeam.id || game.visitor_team.id === pacersTeam.id
    );
    
    console.log(`\nKnicks playoff games: ${knicksGames.length}`);
    if (knicksGames.length > 0) {
      console.log('Sample Knicks games:');
      knicksGames.slice(0, 3).forEach((game, i) => {
        console.log(`  ${i+1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date}) - Status: ${game.status}`);
      });
    }
    
    console.log(`\nPacers playoff games: ${pacersGames.length}`);
    if (pacersGames.length > 0) {
      console.log('Sample Pacers games:');
      pacersGames.slice(0, 3).forEach((game, i) => {
        console.log(`  ${i+1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date}) - Status: ${game.status}`);
      });
    } else {
      console.log('❌ NO PACERS PLAYOFF GAMES FOUND!');
      
      // Try alternative team name matching
      console.log('\n🔍 Trying alternative Pacers matching...');
      const alternativePacersGames = playoffGames.filter(game => {
        const homeTeam = game.home_team.name.toLowerCase();
        const awayTeam = game.visitor_team.name.toLowerCase();
        
        return homeTeam.includes('pacer') || awayTeam.includes('pacer') ||
               homeTeam.includes('indiana') || awayTeam.includes('indiana');
      });
      
      console.log(`Alternative matching found: ${alternativePacersGames.length} games`);
      if (alternativePacersGames.length > 0) {
        console.log('Alternative Pacers games:');
        alternativePacersGames.slice(0, 3).forEach((game, i) => {
          console.log(`  ${i+1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
          console.log(`      Home ID: ${game.home_team.id}, Away ID: ${game.visitor_team.id}`);
        });
      }
    }
    
    // Step 3: Test game stats retrieval for sample games
    console.log('\n📊 STEP 3: Game Stats Retrieval Test');
    console.log('------------------------------------');
    
    if (knicksGames.length > 0) {
      const sampleKnicksGame = knicksGames[0];
      console.log(`\nTesting stats for Knicks game: ${sampleKnicksGame.visitor_team.name} @ ${sampleKnicksGame.home_team.name}`);
      
      try {
        const gameStats = await ballDontLieService.getNbaPlayoffGameStats(sampleKnicksGame.id);
        console.log(`  Total player stats in game: ${gameStats.length}`);
        
        const knicksStats = gameStats.filter(stat => stat.team.id === knicksTeam.id);
        console.log(`  Knicks player stats: ${knicksStats.length}`);
        
        if (knicksStats.length > 0) {
          console.log('  Sample Knicks players:');
          knicksStats.slice(0, 3).forEach(stat => {
            console.log(`    - ${stat.player.first_name} ${stat.player.last_name}: ${stat.pts} PTS`);
          });
        }
      } catch (error) {
        console.log(`  ❌ Error getting Knicks game stats: ${error.message}`);
      }
    }
    
    if (pacersGames.length > 0) {
      const samplePacersGame = pacersGames[0];
      console.log(`\nTesting stats for Pacers game: ${samplePacersGame.visitor_team.name} @ ${samplePacersGame.home_team.name}`);
      
      try {
        const gameStats = await ballDontLieService.getNbaPlayoffGameStats(samplePacersGame.id);
        console.log(`  Total player stats in game: ${gameStats.length}`);
        
        const pacersStats = gameStats.filter(stat => stat.team.id === pacersTeam.id);
        console.log(`  Pacers player stats: ${pacersStats.length}`);
        
        if (pacersStats.length > 0) {
          console.log('  Sample Pacers players:');
          pacersStats.slice(0, 3).forEach(stat => {
            console.log(`    - ${stat.player.first_name} ${stat.player.last_name}: ${stat.pts} PTS`);
          });
        } else {
          console.log('  ❌ NO PACERS PLAYER STATS FOUND IN GAME!');
          
          // Debug: Show all team IDs in the game
          const uniqueTeamIds = [...new Set(gameStats.map(stat => stat.team.id))];
          console.log(`  🔍 Team IDs found in game stats: ${uniqueTeamIds.join(', ')}`);
          console.log(`  🔍 Expected Pacers team ID: ${pacersTeam.id}`);
          
          // Show sample stats to see team structure
          if (gameStats.length > 0) {
            console.log('  🔍 Sample stat structure:');
            const sampleStat = gameStats[0];
            console.log(`    Team ID: ${sampleStat.team.id}`);
            console.log(`    Team Name: ${sampleStat.team.name}`);
            console.log(`    Player: ${sampleStat.player.first_name} ${sampleStat.player.last_name}`);
          }
        }
      } catch (error) {
        console.log(`  ❌ Error getting Pacers game stats: ${error.message}`);
      }
    }
    
    // Step 4: Test the full getNbaPlayoffPlayerStats function
    console.log('\n📊 STEP 4: Full Function Test');
    console.log('------------------------------');
    
    console.log('Testing getNbaPlayoffPlayerStats function...');
    const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats(
      'New York Knicks', 
      'Indiana Pacers', 
      2024
    );
    
    console.log(`\nResults:`);
    console.log(`  Knicks players: ${playerStats.home?.length || 0}`);
    console.log(`  Pacers players: ${playerStats.away?.length || 0}`);
    
    if (playerStats.home?.length > 0) {
      console.log('  Top Knicks player:');
      const topKnick = playerStats.home[0];
      console.log(`    ${topKnick.player.first_name} ${topKnick.player.last_name}: ${topKnick.avgPts} PPG`);
    }
    
    if (playerStats.away?.length > 0) {
      console.log('  Top Pacers player:');
      const topPacer = playerStats.away[0];
      console.log(`    ${topPacer.player.first_name} ${topPacer.player.last_name}: ${topPacer.avgPts} PPG`);
    } else {
      console.log('  ❌ NO PACERS PLAYERS RETURNED FROM FUNCTION');
    }
    
    // Step 5: Check if it's a team ID mismatch issue
    console.log('\n📊 STEP 5: Team ID Mismatch Investigation');
    console.log('-----------------------------------------');
    
    // Get all teams and look for any Pacers-related entries
    const allTeams = await ballDontLieService.getNbaTeams();
    console.log(`Total NBA teams: ${allTeams.length}`);
    
    const pacersRelatedTeams = allTeams.filter(team => 
      team.name.toLowerCase().includes('pacer') ||
      team.full_name.toLowerCase().includes('pacer') ||
      team.name.toLowerCase().includes('indiana') ||
      team.full_name.toLowerCase().includes('indiana')
    );
    
    console.log(`\nPacers-related teams found: ${pacersRelatedTeams.length}`);
    pacersRelatedTeams.forEach(team => {
      console.log(`  - ${team.full_name} (${team.name}) - ID: ${team.id} - Abbr: ${team.abbreviation}`);
    });
    
    // Summary
    console.log('\n🎯 DIAGNOSTIC SUMMARY');
    console.log('=====================');
    console.log(`✅ Knicks team found: ${knicksTeam ? 'YES' : 'NO'}`);
    console.log(`✅ Pacers team found: ${pacersTeam ? 'YES' : 'NO'}`);
    console.log(`✅ Knicks playoff games: ${knicksGames.length}`);
    console.log(`✅ Pacers playoff games: ${pacersGames.length}`);
    console.log(`✅ Function returns Knicks players: ${playerStats.home?.length || 0}`);
    console.log(`✅ Function returns Pacers players: ${playerStats.away?.length || 0}`);
    
    if (pacersGames.length === 0) {
      console.log('\n🚨 ROOT CAUSE: No playoff games found for Pacers team ID');
      console.log('   This suggests either:');
      console.log('   1. Pacers team ID is incorrect');
      console.log('   2. Pacers playoff games are missing from API');
      console.log('   3. Season parameter is wrong');
    } else if (playerStats.away?.length === 0) {
      console.log('\n🚨 ROOT CAUSE: Playoff games found but no player stats');
      console.log('   This suggests:');
      console.log('   1. Game stats API calls are failing');
      console.log('   2. Team ID filtering in stats is incorrect');
      console.log('   3. Player stats aggregation logic has issues');
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

// Run the diagnostic
debugPacersStatsIssue(); 