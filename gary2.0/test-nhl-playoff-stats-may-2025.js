#!/usr/bin/env node

/**
 * Test NHL Playoff Stats for May 2025
 * Tests the new Ball Don't Lie API NHL playoff functionality
 */

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function testNhlPlayoffStats() {
  console.log('🏒 Testing NHL Playoff Stats for May 2025 (2024-25 season)');
  console.log('=' .repeat(60));
  
  try {
    // Initialize the service
    ballDontLieService.initialize();
    
    // Test 1: Get NHL teams
    console.log('\n1. Testing NHL Teams...');
    const teams = await ballDontLieService.getNhlTeams();
    console.log(`✅ Found ${teams.length} NHL teams`);
    if (teams.length > 0) {
      console.log(`Sample teams: ${teams.slice(0, 3).map(t => t.full_name).join(', ')}`);
    }
    
    // Test 2: Get specific teams by name
    console.log('\n2. Testing Team Lookup...');
    const oilers = await ballDontLieService.getNhlTeamByName('Edmonton Oilers');
    const stars = await ballDontLieService.getNhlTeamByName('Dallas Stars');
    
    if (oilers) {
      console.log(`✅ Found Edmonton Oilers: ${oilers.full_name} (ID: ${oilers.id})`);
    } else {
      console.log('❌ Could not find Edmonton Oilers');
    }
    
    if (stars) {
      console.log(`✅ Found Dallas Stars: ${stars.full_name} (ID: ${stars.id})`);
    } else {
      console.log('❌ Could not find Dallas Stars');
    }
    
    // Test 3: Get playoff games for 2024 season (2024-25 NHL season)
    console.log('\n3. Testing NHL Playoff Games (2024 season = 2024-25 NHL season)...');
    const playoffGames = await ballDontLieService.getNhlPlayoffGames();
    console.log(`✅ Found ${playoffGames.length} total playoff games for 2024 season`);
    
    if (playoffGames.length > 0) {
      console.log('Sample playoff games:');
      playoffGames.slice(0, 5).forEach(game => {
        console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} (${game.date})`);
      });
    }
    
    // Test 4: Get today's playoff games
    console.log('\n4. Testing Today\'s NHL Playoff Games...');
    const todaysGames = await ballDontLieService.getTodaysNhlPlayoffGames();
    console.log(`✅ Found ${todaysGames.length} playoff games for today`);
    
    if (todaysGames.length > 0) {
      console.log('Today\'s playoff games:');
      todaysGames.forEach(game => {
        console.log(`  - ${game.visitor_team.name} @ ${game.home_team.name} at ${game.date}`);
      });
    } else {
      console.log('No NHL playoff games scheduled for today');
    }
    
    // Test 5: Get active playoff teams
    console.log('\n5. Testing Active Playoff Teams...');
    const activeTeams = await ballDontLieService.getActiveNhlPlayoffTeams();
    console.log(`✅ Found ${activeTeams.length} active playoff teams`);
    
    // Test 6: Test playoff player stats (using sample teams)
    if (oilers && stars) {
      console.log('\n6. Testing NHL Playoff Player Stats...');
      console.log('Getting playoff stats for Edmonton Oilers vs Dallas Stars...');
      
      const playerStats = await ballDontLieService.getNhlPlayoffPlayerStats(
        'Edmonton Oilers',
        'Dallas Stars'
      );
      
      console.log(`✅ Home team (Edmonton Oilers): ${playerStats.home.length} players with playoff stats`);
      console.log(`✅ Away team (Dallas Stars): ${playerStats.away.length} players with playoff stats`);
      
      if (playerStats.home.length > 0) {
        console.log('\nTop Edmonton Oilers playoff performers:');
        playerStats.home.slice(0, 3).forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.avgGoals}G, ${player.avgAssists}A, ${player.avgPoints}P per game (${player.games} games)`);
          console.log(`    +/- ${player.avgPlusMinus}, ${player.shootingPct}% shooting, ${player.avgTimeOnIce} min TOI`);
        });
      }
      
      if (playerStats.away.length > 0) {
        console.log('\nTop Dallas Stars playoff performers:');
        playerStats.away.slice(0, 3).forEach(player => {
          console.log(`  - ${player.player.first_name} ${player.player.last_name}: ${player.avgGoals}G, ${player.avgAssists}A, ${player.avgPoints}P per game (${player.games} games)`);
          console.log(`    +/- ${player.avgPlusMinus}, ${player.shootingPct}% shooting, ${player.avgTimeOnIce} min TOI`);
        });
      }
    }
    
    // Test 7: Test comprehensive playoff analysis
    if (oilers && stars) {
      console.log('\n7. Testing Comprehensive NHL Playoff Analysis...');
      
      const analysis = await ballDontLieService.getComprehensiveNhlPlayoffAnalysis(
        'Edmonton Oilers',
        'Dallas Stars'
      );
      
      if (analysis) {
        console.log('✅ Comprehensive analysis retrieved successfully');
        console.log(`Season: ${analysis.season} (2024-25 NHL season)`);
        console.log(`Active playoff teams: ${analysis.activePlayoffTeams?.length || 0}`);
        
        if (analysis.series?.seriesFound) {
          console.log(`Series status: ${analysis.series.seriesStatus}`);
        }
        
        if (analysis.game) {
          console.log(`Today's game found: ${analysis.game.visitor_team.name} @ ${analysis.game.home_team.name}`);
        } else {
          console.log('No game scheduled today between these teams');
        }
      } else {
        console.log('❌ Could not retrieve comprehensive analysis');
      }
    }
    
    console.log('\n🏒 NHL Playoff Stats Test Complete!');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testNhlPlayoffStats().catch(console.error); 