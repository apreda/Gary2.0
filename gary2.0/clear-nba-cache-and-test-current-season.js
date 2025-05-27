#!/usr/bin/env node

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function clearCacheAndTestCurrentSeason() {
  console.log('🧹 CLEARING NBA CACHE AND TESTING CURRENT SEASON');
  console.log('='.repeat(60));
  
  // Initialize the service
  ballDontLieService.initialize();
  
  // Clear all cached data
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
  
  // Test getting current playoff games
  console.log('\n🏀 TESTING CURRENT PLAYOFF GAMES:');
  try {
    const playoffGames = await ballDontLieService.getNbaPlayoffGames();
    console.log(`Found ${playoffGames.length} playoff games for ${expectedSeason} season`);
    
    if (playoffGames.length > 0) {
      console.log('\n📊 SAMPLE PLAYOFF GAMES:');
      playoffGames.slice(0, 5).forEach((game, idx) => {
        console.log(`${idx + 1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
      });
      
      // Check if we have recent games (2024 or 2025 dates)
      const recentGames = playoffGames.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        return gameYear >= 2024;
      });
      
      console.log(`\n✅ Found ${recentGames.length} games from 2024-2025 season`);
      
      if (recentGames.length === 0) {
        console.log('❌ WARNING: No games found from current season (2024-2025)');
        console.log('   This suggests we\'re still getting old cached data');
      }
    } else {
      console.log('❌ No playoff games found - this might be expected if playoffs haven\'t started yet');
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
      
      // Test getting player stats for current season
      console.log('\n🏀 TESTING CURRENT SEASON PLAYER STATS:');
      const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats('New York Knicks', 'Indiana Pacers');
      
      console.log(`Knicks players found: ${playerStats.home?.length || 0}`);
      console.log(`Pacers players found: ${playerStats.away?.length || 0}`);
      
      if (playerStats.home?.length > 0) {
        console.log('\n📊 SAMPLE KNICKS PLAYERS:');
        playerStats.home.slice(0, 3).forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} games, ${player.avgPts?.toFixed(1) || 0} PPG`);
        });
      }
      
      if (playerStats.away?.length > 0) {
        console.log('\n📊 SAMPLE PACERS PLAYERS:');
        playerStats.away.slice(0, 3).forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.games} games, ${player.avgPts?.toFixed(1) || 0} PPG`);
        });
      }
    } else {
      console.log('❌ Could not find Knicks or Pacers team data');
    }
  } catch (error) {
    console.error('❌ Error testing team lookup:', error.message);
  }
  
  console.log('\n✅ Cache clear and current season test completed');
}

// Run the test
clearCacheAndTestCurrentSeason().catch(console.error); 