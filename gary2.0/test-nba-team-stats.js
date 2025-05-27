/**
 * Test script for NBA team stats functionality
 * This will verify that the new getNBATeamStats method works correctly
 */

import { ballDontLieService } from './src/services/ballDontLieService.js';

async function testNBATeamStats() {
  console.log('🏀 Testing NBA Team Stats Functionality...\n');
  
  try {
    // Initialize the service
    ballDontLieService.initialize();
    
    // Test 1: Get NBA teams
    console.log('📋 Step 1: Getting NBA teams...');
    const nbaTeams = await ballDontLieService.getNbaTeams();
    console.log(`✅ Found ${nbaTeams.length} NBA teams`);
    
    // Test 2: Find specific teams (Knicks and Pacers from the console logs)
    console.log('\n🔍 Step 2: Finding specific teams...');
    const knicks = nbaTeams.find(t => 
      t.full_name.toLowerCase().includes('knicks') ||
      t.name.toLowerCase().includes('knicks')
    );
    const pacers = nbaTeams.find(t => 
      t.full_name.toLowerCase().includes('pacers') ||
      t.name.toLowerCase().includes('pacers')
    );
    
    if (knicks) {
      console.log(`✅ Found Knicks: ${knicks.full_name} (ID: ${knicks.id})`);
    } else {
      console.log('❌ Could not find Knicks');
    }
    
    if (pacers) {
      console.log(`✅ Found Pacers: ${pacers.full_name} (ID: ${pacers.id})`);
    } else {
      console.log('❌ Could not find Pacers');
    }
    
    // Test 3: Get team stats for both teams
    if (knicks && pacers) {
      console.log('\n📊 Step 3: Getting team stats...');
      const teamIds = [knicks.id, pacers.id];
      const teamStats = await ballDontLieService.getNBATeamStats(teamIds);
      
      console.log(`✅ Retrieved stats for ${teamStats.length} teams`);
      
      teamStats.forEach(stat => {
        if (stat) {
          console.log(`\n📈 Team ID ${stat.teamId} (Season ${stat.season}):`);
          console.log(`   Points Per Game: ${stat.stats.pointsPerGame.toFixed(1)}`);
          console.log(`   Field Goal %: ${(stat.stats.fieldGoalPct * 100).toFixed(1)}%`);
          console.log(`   Rebounds Per Game: ${stat.stats.reboundsPerGame.toFixed(1)}`);
          console.log(`   Assists Per Game: ${stat.stats.assistsPerGame.toFixed(1)}`);
          console.log(`   Player Count: ${stat.stats.playerCount}`);
        }
      });
      
      if (teamStats.length > 0) {
        console.log('\n🎉 SUCCESS: NBA Team Stats are now available!');
        console.log('✅ This should resolve the "Team Stats Available: false" issue');
      } else {
        console.log('\n❌ FAILED: No team stats retrieved');
      }
    } else {
      console.log('\n⚠️  Cannot test team stats without both teams');
    }
    
    // Test 4: Test with team names instead of IDs
    console.log('\n🔤 Step 4: Testing with team names...');
    const teamNames = ['New York Knicks', 'Indiana Pacers'];
    const teamStatsByName = await ballDontLieService.getNBATeamStats(teamNames);
    
    console.log(`✅ Retrieved stats by name for ${teamStatsByName.length} teams`);
    
    if (teamStatsByName.length > 0) {
      console.log('✅ Team name lookup works correctly');
    } else {
      console.log('❌ Team name lookup failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testNBATeamStats().then(() => {
  console.log('\n🏁 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
}); 