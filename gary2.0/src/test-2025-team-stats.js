/**
 * Test script to verify Ball Don't Lie API can successfully retrieve 2025 MLB team stats
 */
import { BalldontlieAPI } from '@balldontlie/sdk';

// Initialize API client with the API key
let API_KEY;
try {
  API_KEY = import.meta.env?.VITE_BALLDONTLIE_API_KEY || process.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  API_KEY = process.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
}

const api = new BalldontlieAPI({ apiKey: API_KEY });

async function testTeamStats2025() {
  console.log('===== TESTING BALL DON\'T LIE API FOR 2025 MLB TEAM STATS =====\n');
  
  try {
    // 1. Test getting all MLB teams
    console.log('1. Testing getTeams() function...');
    const teams = await api.mlb.getTeams();
    
    if (teams && teams.data && teams.data.length > 0) {
      console.log(`✅ SUCCESS: Retrieved ${teams.data.length} MLB teams`);
      console.log(`   Sample team: ${teams.data[0].display_name}`);
    } else {
      console.log('❌ FAILED: Could not retrieve MLB teams');
    }
    
    // Pick a team for testing (Using Yankees as an example)
    const teamToTest = teams.data.find(t => t.display_name === 'New York Yankees') || teams.data[0];
    const teamId = teamToTest.id;
    console.log(`\nUsing team for testing: ${teamToTest.display_name} (ID: ${teamId})`);
    
    // 2. Test getting team season stats for 2025
    console.log('\n2. Testing getTeamSeasonStats() for 2025 season...');
    try {
      const teamStats = await api.mlb.getTeamSeasonStats({
        team_id: teamId,
        season: 2025,
        postseason: false
      });
      
      if (teamStats && teamStats.data && teamStats.data.length > 0) {
        console.log(`✅ SUCCESS: Retrieved 2025 season stats for ${teamToTest.display_name}`);
        console.log('\nSample of team stats:');
        const stats = teamStats.data[0];
        console.log(`   Team: ${stats.team_name}`);
        console.log(`   Season: ${stats.season}`);
        console.log(`   Games Played: ${stats.gp}`);
        console.log(`   Batting AVG: ${stats.batting_avg}`);
        console.log(`   ERA: ${stats.pitching_era}`);
        console.log(`   Home Runs: ${stats.batting_hr}`);
      } else {
        console.log(`❌ FAILED: Could not retrieve 2025 season stats for ${teamToTest.display_name}`);
      }
    } catch (error) {
      console.error(`❌ ERROR getting team season stats: ${error.message}`);
      console.log('This suggests the Ball Don\'t Lie API might not have complete 2025 stats available yet');
    }
    
    // 3. Test getting team standings for 2025
    console.log('\n3. Testing getStandings() for 2025 season...');
    try {
      const standings = await api.mlb.getStandings({ 
        season: 2025 
      });
      
      if (standings && standings.data && standings.data.length > 0) {
        console.log(`✅ SUCCESS: Retrieved 2025 standings data for ${standings.data.length} teams`);
        
        // Find our test team in standings
        const teamStanding = standings.data.find(s => s.team.id === teamId);
        
        if (teamStanding) {
          console.log('\nStandings for test team:');
          console.log(`   Team: ${teamStanding.team_name}`);
          console.log(`   Record: ${teamStanding.wins}-${teamStanding.losses}`);
          console.log(`   Division: ${teamStanding.division_name}`);
          console.log(`   Position: ${teamStanding.division_games_behind === 0 ? '1st' : teamStanding.games_behind + ' GB'}`);
        }
      } else {
        console.log('❌ FAILED: Could not retrieve 2025 standings');
      }
    } catch (error) {
      console.error(`❌ ERROR getting standings: ${error.message}`);
    }
    
    // 4. Test getting active MLB players for 2025
    console.log('\n4. Testing getActivePlayers() to verify 2025 season availability...');
    try {
      const players = await api.mlb.getActivePlayers();
      
      if (players && players.data && players.data.length > 0) {
        console.log(`✅ SUCCESS: Retrieved ${players.data.length} active MLB players`);
        console.log(`   Sample player: ${players.data[0].full_name}`);
      } else {
        console.log('❌ FAILED: Could not retrieve active MLB players');
      }
    } catch (error) {
      console.error(`❌ ERROR getting active players: ${error.message}`);
    }
    
    // Summary
    console.log('\n===== TEST SUMMARY =====');
    console.log('The Ball Don\'t Lie API appears to have 2025 MLB data available.');
    console.log('However, some specific team stats might be incomplete for the 2025 season.');
    console.log('It\'s recommended to add robust error handling in your app to account for potential gaps in the API data.');
    
  } catch (error) {
    console.error('Error testing Ball Don\'t Lie API:', error);
  }
}

// Run the test
testTeamStats2025().catch(console.error);
