// Test Pacers Fix Verification
// This script tests if the Pacers stats issue has been resolved

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function testPacersFix() {
  console.log('🔧 TESTING PACERS STATS FIX');
  console.log('============================');
  
  try {
    // Initialize the service
    await ballDontLieService.initialize();
    
    console.log('\n📊 Testing NBA Playoff Player Stats Function');
    console.log('---------------------------------------------');
    
    // Test the function that was returning 8 Knicks and 0 Pacers
    const playerStats = await ballDontLieService.getNbaPlayoffPlayerStats(
      'New York Knicks', 
      'Indiana Pacers', 
      2024
    );
    
    console.log('\n🎯 RESULTS:');
    console.log(`Knicks players: ${playerStats.home?.length || 0}`);
    console.log(`Pacers players: ${playerStats.away?.length || 0}`);
    
    // Show sample players if found
    if (playerStats.home?.length > 0) {
      console.log('\n🏀 Top Knicks Players:');
      playerStats.home.slice(0, 3).forEach((player, i) => {
        console.log(`  ${i+1}. ${player.player.first_name} ${player.player.last_name}: ${player.avgPts} PPG, ${player.games} games`);
      });
    }
    
    if (playerStats.away?.length > 0) {
      console.log('\n🏀 Top Pacers Players:');
      playerStats.away.slice(0, 3).forEach((player, i) => {
        console.log(`  ${i+1}. ${player.player.first_name} ${player.player.last_name}: ${player.avgPts} PPG, ${player.games} games`);
      });
    } else {
      console.log('\n❌ Still no Pacers players found');
    }
    
    // Test balance
    console.log('\n⚖️  BALANCE CHECK:');
    if (playerStats.home?.length > 0 && playerStats.away?.length > 0) {
      console.log('✅ BALANCED: Both teams have playoff player data');
      console.log(`   Ratio: ${playerStats.home.length} Knicks : ${playerStats.away.length} Pacers`);
    } else if (playerStats.home?.length > 0 && playerStats.away?.length === 0) {
      console.log('❌ IMBALANCED: Knicks have players but Pacers have 0');
    } else if (playerStats.home?.length === 0 && playerStats.away?.length > 0) {
      console.log('❌ IMBALANCED: Pacers have players but Knicks have 0');
    } else {
      console.log('⚠️  NO DATA: Neither team has playoff player data');
    }
    
    // Expected Pacers players based on your research
    console.log('\n📋 EXPECTED PACERS PLAYERS:');
    console.log('   - Pascal Siakam: 20.1 PPG, 5.8 RPG, 3.2 APG');
    console.log('   - Tyrese Haliburton: 18.5 PPG, 5.5 RPG, 9.4 APG');
    console.log('   - Myles Turner: 16.5 PPG, 5.5 RPG, 2.3 BPG');
    console.log('   - Aaron Nesmith: 15.1 PPG, 6.2 RPG');
    console.log('   - Andrew Nembhard: 14.0 PPG, 3.5 RPG, 5.3 APG');
    
    // Check if we found any of these players
    if (playerStats.away?.length > 0) {
      console.log('\n🔍 FOUND PACERS PLAYERS:');
      const expectedNames = ['siakam', 'haliburton', 'turner', 'nesmith', 'nembhard'];
      const foundExpected = playerStats.away.filter(player => {
        const fullName = `${player.player.first_name} ${player.player.last_name}`.toLowerCase();
        return expectedNames.some(name => fullName.includes(name));
      });
      
      if (foundExpected.length > 0) {
        console.log(`✅ Found ${foundExpected.length} expected Pacers players:`);
        foundExpected.forEach(player => {
          console.log(`   - ${player.player.first_name} ${player.player.last_name}: ${player.avgPts} PPG`);
        });
      } else {
        console.log('⚠️  None of the expected star players found');
      }
    }
    
    // Summary
    console.log('\n🎯 FIX STATUS:');
    if (playerStats.away?.length > 0) {
      console.log('🎉 SUCCESS: Pacers players are now being returned!');
      console.log(`   Before: 0 Pacers players`);
      console.log(`   After: ${playerStats.away.length} Pacers players`);
    } else {
      console.log('❌ ISSUE PERSISTS: Still getting 0 Pacers players');
      console.log('   Need to investigate further...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testPacersFix(); 