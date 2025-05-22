/**
 * Comprehensive MLB Stats API Test
 * Tests retrieving:
 * 1. League leaders in key stat categories
 * 2. Complete team rosters with stats (8 hitters + 1 pitcher from each team)
 */
import { mlbStatsApiService } from './services/mlbStatsApiService.js';

async function testComprehensiveStats() {
  try {
    console.log('===== TESTING COMPREHENSIVE MLB STATISTICS =====');
    
    // 1. Test getting league leaders in various categories
    await testLeagueLeaders();
    
    // 2. Test getting team rosters with stats
    await testTeamRosters();
    
    console.log('\n===== COMPREHENSIVE MLB STATISTICS TEST COMPLETE =====');
  } catch (error) {
    console.error('Error in comprehensive stats test:', error);
  }
}

// Test league leaders in various categories
async function testLeagueLeaders() {
  console.log('\n----- TESTING MLB LEAGUE LEADERS -----');
  
  const statCategories = [
    { name: 'Home Runs', group: 'hitting', statType: 'homeRuns' },
    { name: 'Batting Average', group: 'hitting', statType: 'battingAverage' },
    { name: 'RBIs', group: 'hitting', statType: 'rbi' },
    { name: 'Hits', group: 'hitting', statType: 'hits' },
    { name: 'ERA', group: 'pitching', statType: 'earnedRunAverage' },
    { name: 'Strikeouts', group: 'pitching', statType: 'strikeouts' },
    { name: 'Wins', group: 'pitching', statType: 'wins' }
  ];
  
  for (const category of statCategories) {
    console.log(`\nGetting league leaders in ${category.name}...`);
    
    try {
      const response = await fetch(`https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${category.statType}&sportId=1&statGroup=${category.group}&season=${new Date().getFullYear()}&limit=10`);
      
      if (!response.ok) {
        console.log(`Error getting ${category.name} leaders: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data && data.leagueLeaders && data.leagueLeaders.length > 0) {
        const leaders = data.leagueLeaders[0].leaders;
        console.log(`Top ${Math.min(5, leaders.length)} players in ${category.name}:`);
        
        for (let i = 0; i < Math.min(5, leaders.length); i++) {
          const leader = leaders[i];
          console.log(`${i+1}. ${leader.person.fullName}: ${leader.value} ${category.statType}`);
        }
      } else {
        console.log(`No leaders found for ${category.name}`);
      }
    } catch (error) {
      console.error(`Error retrieving ${category.name} leaders:`, error.message);
    }
  }
}

// Test getting team rosters with stats
async function testTeamRosters() {
  console.log('\n----- TESTING TEAM ROSTERS WITH STATS -----');
  
  // Get games for today to identify teams
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Getting MLB games for ${today}...`);
  
  const games = await mlbStatsApiService.getGamesByDate(today);
  
  if (!games || games.length === 0) {
    console.log('No MLB games found for today, testing with known team IDs');
    // Test with Yankees (147) and Red Sox (111) as fallback
    await getTeamRosterWithStats(147, 'New York Yankees');
    await getTeamRosterWithStats(111, 'Boston Red Sox');
    return;
  }
  
  // Choose the first game for testing
  const game = games[0];
  console.log(`Selected game: ${game.teams?.home?.team?.name} vs ${game.teams?.away?.team?.name}`);
  
  // Get rosters for both teams
  const homeTeamId = game.teams?.home?.team?.id;
  const awayTeamId = game.teams?.away?.team?.id;
  
  if (homeTeamId) {
    await getTeamRosterWithStats(homeTeamId, game.teams?.home?.team?.name);
  }
  
  if (awayTeamId) {
    await getTeamRosterWithStats(awayTeamId, game.teams?.away?.team?.name);
  }
}

// Helper function to get a team's roster with stats
async function getTeamRosterWithStats(teamId, teamName) {
  console.log(`\nGetting roster and stats for ${teamName} (ID: ${teamId})...`);
  
  try {
    // 1. Get the team roster
    const rosterResponse = await fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/roster?rosterType=active`);
    
    if (!rosterResponse.ok) {
      console.log(`Error getting roster for ${teamName}: ${rosterResponse.status}`);
      return;
    }
    
    const rosterData = await rosterResponse.json();
    
    if (!rosterData || !rosterData.roster || rosterData.roster.length === 0) {
      console.log(`No roster found for ${teamName}`);
      return;
    }
    
    // 2. Get pitchers and position players
    const pitchers = rosterData.roster.filter(player => player.position.code === '1');
    const hitters = rosterData.roster.filter(player => player.position.code !== '1');
    
    console.log(`Found ${pitchers.length} pitchers and ${hitters.length} position players on the ${teamName} roster`);
    
    // 3. Get stats for starting pitcher (first pitcher in list)
    if (pitchers.length > 0) {
      const startingPitcher = pitchers[0];
      console.log(`\nGetting stats for starting pitcher: ${startingPitcher.person.fullName}`);
      
      const pitcherStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitcher.person.id);
      console.log('Pitcher stats:');
      console.log(pitcherStats);
    }
    
    // 4. Get stats for top 8 hitters (or all if less than 8)
    console.log(`\nGetting stats for top ${Math.min(8, hitters.length)} hitters on ${teamName}:`);
    
    const topHitters = hitters.slice(0, Math.min(8, hitters.length));
    
    for (const hitter of topHitters) {
      console.log(`\nGetting stats for ${hitter.person.fullName} (${hitter.position.abbreviation})...`);
      
      try {
        const response = await fetch(`https://statsapi.mlb.com/api/v1/people/${hitter.person.id}/stats?stats=season&group=batting&season=${new Date().getFullYear()}&sportId=1`);
        
        if (!response.ok) {
          console.log(`Error getting stats for ${hitter.person.fullName}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data && data.stats && data.stats.length > 0 && data.stats[0].splits && data.stats[0].splits.length > 0) {
          const stats = data.stats[0].splits[0].stat;
          console.log({
            avg: stats.avg || '.000',
            hits: stats.hits || 0,
            homeRuns: stats.homeRuns || 0,
            rbi: stats.rbi || 0,
            runs: stats.runs || 0,
            strikeouts: stats.strikeOuts || 0,
            walks: stats.baseOnBalls || 0,
            atBats: stats.atBats || 0,
            obp: stats.obp || '.000',
            slg: stats.slg || '.000',
            ops: stats.ops || '.000'
          });
        } else {
          console.log(`No stats found for ${hitter.person.fullName}`);
        }
      } catch (error) {
        console.error(`Error retrieving stats for ${hitter.person.fullName}:`, error.message);
      }
    }
    
  } catch (error) {
    console.error(`Error getting roster with stats for ${teamName}:`, error.message);
  }
}

// Run the tests
testComprehensiveStats();
