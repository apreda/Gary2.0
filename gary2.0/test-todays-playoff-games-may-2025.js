#!/usr/bin/env node

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function testTodaysPlayoffGamesMay2025() {
  console.log('🏀 TESTING TODAY\'S NBA PLAYOFF GAMES FOR MAY 27TH, 2025');
  console.log('='.repeat(70));
  
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
  console.log(`Expected Season: ${expectedSeason} (for ${expectedSeason}-${expectedSeason + 1} NBA season)`);
  console.log(`Today's Date String: ${now.toISOString().split('T')[0]}`);
  
  try {
    console.log('\n🔍 TESTING: Get All Playoff Games for 2024 Season');
    const allPlayoffGames = await ballDontLieService.getNbaPlayoffGames();
    console.log(`Found ${allPlayoffGames.length} total playoff games for 2024 season`);
    
    if (allPlayoffGames.length > 0) {
      console.log('\nSample of all playoff games:');
      allPlayoffGames.slice(0, 5).forEach((game, idx) => {
        console.log(`  ${idx + 1}. ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
      });
    }
    
    console.log('\n🎯 TESTING: Get TODAY\'S Playoff Games Only');
    const todaysGames = await ballDontLieService.getTodaysNbaPlayoffGames();
    console.log(`Found ${todaysGames.length} playoff games for TODAY (${now.toISOString().split('T')[0]})`);
    
    if (todaysGames.length > 0) {
      console.log('\nToday\'s playoff games:');
      todaysGames.forEach((game, idx) => {
        console.log(`  ${idx + 1}. ${game.visitor_team.name} @ ${game.home_team.name}`);
        console.log(`     Date: ${game.date}`);
        console.log(`     Status: ${game.status}`);
        console.log(`     Home Score: ${game.home_team_score}, Away Score: ${game.visitor_team_score}`);
        console.log('');
      });
    } else {
      console.log('❌ No playoff games found for today');
      console.log('This could mean:');
      console.log('  1. No games scheduled for today');
      console.log('  2. API date format issue');
      console.log('  3. Season parameter issue');
      console.log('  4. Playoffs haven\'t started yet or are over');
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`Total 2024 season playoff games: ${allPlayoffGames.length}`);
    console.log(`Today's playoff games: ${todaysGames.length}`);
    console.log(`Season being queried: ${expectedSeason}`);
    console.log(`Date being filtered: ${now.toISOString().split('T')[0]}`);
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testTodaysPlayoffGamesMay2025()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }); 