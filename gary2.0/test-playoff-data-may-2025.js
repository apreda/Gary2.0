#!/usr/bin/env node

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function testPlayoffDataMay2025() {
  console.log('🏀 TESTING NBA PLAYOFF DATA FOR MAY 2025');
  console.log('='.repeat(60));
  
  // Initialize the service
  ballDontLieService.initialize();
  
  // Clear cache to ensure fresh data
  ballDontLieService.clearCache();
  console.log('✅ Cache cleared successfully');
  
  // Test current date and season calculation
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const expectedSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
  
  console.log('\n📅 CURRENT DATE INFO:');
  console.log(`Current Date: ${now.toISOString()}`);
  console.log(`Current Month: ${currentMonth}`);
  console.log(`Current Year: ${currentYear}`);
  console.log(`Expected NBA Season: ${expectedSeason} (${expectedSeason}-${expectedSeason + 1})`);
  console.log(`🏀 May 2025 = NBA Playoffs are ACTIVE for 2024-25 season`);
  
  // Test getting current playoff games
  console.log('\n🏀 TESTING CURRENT PLAYOFF GAMES:');
  try {
    const playoffGames = await ballDontLieService.getNbaPlayoffGames();
    console.log(`Found ${playoffGames.length} playoff games for ${expectedSeason} season`);
    
    if (playoffGames.length > 0) {
      console.log('\n📊 SAMPLE PLAYOFF GAMES:');
      playoffGames.slice(0, 5).forEach((game, idx) => {
        const gameDate = new Date(game.date);
        const isPostseason = game.postseason ? '🏆 PLAYOFF' : '📅 Regular';
        console.log(`${idx + 1}. ${isPostseason}: ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
      });
      
      // Check if we have recent games (2024 or 2025 dates)
      const recentGames = playoffGames.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        return gameYear >= 2024;
      });
      
      console.log(`\n✅ Found ${recentGames.length} games from 2024-2025 season`);
      
      // Check for playoff games specifically
      const actualPlayoffGames = playoffGames.filter(game => game.postseason === true);
      console.log(`🏆 Found ${actualPlayoffGames.length} confirmed playoff games`);
      
      if (recentGames.length === 0) {
        console.log('❌ WARNING: No games found from current season (2024-2025)');
        console.log('   This suggests we\'re still getting old cached data');
      }
      
      if (actualPlayoffGames.length === 0) {
        console.log('❌ WARNING: No playoff games found (postseason=true)');
        console.log('   This suggests the API might not have playoff data yet');
      }
    } else {
      console.log('❌ No playoff games found');
      console.log('   This could mean:');
      console.log('   1. Playoffs haven\'t started yet for 2024-25 season');
      console.log('   2. API doesn\'t have playoff data yet');
      console.log('   3. Season calculation is incorrect');
    }
  } catch (error) {
    console.error('❌ Error getting playoff games:', error.message);
  }
  
  // Test team lookup
  console.log('\n🏀 TESTING TEAM LOOKUP:');
  try {
    const knicks = await ballDontLieService.getTeamByName('New York Knicks');
    const pacers = await ballDontLieService.getTeamByName('Indiana Pacers');
    
    if (knicks && pacers) {
      console.log(`✅ Found teams: ${knicks.full_name} (ID: ${knicks.id}), ${pacers.full_name} (ID: ${pacers.id})`);
      
      // Test getting player stats for current season playoffs
      console.log('\n🏀 TESTING CURRENT PLAYOFF PLAYER STATS:');
      const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats('New York Knicks', 'Indiana Pacers');
      
      console.log(`Knicks players found: ${playerStats.home?.length || 0}`);
      console.log(`Pacers players found: ${playerStats.away?.length || 0}`);
      
      if (playerStats.home?.length > 0) {
        console.log('\n📊 SAMPLE KNICKS PLAYOFF PLAYERS:');
        playerStats.home.slice(0, 3).forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} playoff games, ${player.avgPts} PPG`);
        });
      } else {
        console.log('❌ No Knicks playoff players found');
      }
      
      if (playerStats.away?.length > 0) {
        console.log('\n📊 SAMPLE PACERS PLAYOFF PLAYERS:');
        playerStats.away.slice(0, 3).forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} playoff games, ${player.avgPts} PPG`);
        });
      } else {
        console.log('❌ No Pacers playoff players found');
      }
      
      // Check for balance
      if (playerStats.home?.length > 0 && playerStats.away?.length === 0) {
        console.log('\n⚠️  IMBALANCE DETECTED: Knicks have players but Pacers don\'t');
      } else if (playerStats.away?.length > 0 && playerStats.home?.length === 0) {
        console.log('\n⚠️  IMBALANCE DETECTED: Pacers have players but Knicks don\'t');
      } else if (playerStats.home?.length > 0 && playerStats.away?.length > 0) {
        console.log('\n✅ BALANCED: Both teams have playoff player data');
      } else {
        console.log('\n❌ NO DATA: Neither team has playoff player data');
      }
    } else {
      console.log('❌ Could not find Knicks or Pacers team data');
    }
  } catch (error) {
    console.error('❌ Error testing team lookup:', error.message);
  }
  
  console.log('\n✅ Playoff data test for May 2025 completed');
  console.log('🏀 System is now configured for NBA PLAYOFFS (postseason=true)');
}

// Run the test
testPlayoffDataMay2025().catch(console.error); 