/**
 * Comprehensive MLB Stats API Test for Prop Picks
 * Tests:
 * 1. Starting pitchers for today's games
 * 2. Key player stats for prop evaluation
 * 3. League leader rankings
 * 
 * This test specifically focuses on gathering data for prop picks.
 */

import { mlbStatsApiService } from './services/mlbStatsApiService.enhanced2.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test retrieving starting pitchers for today's games
 */
const testStartingPitchers = async () => {
  console.log('\n========== TESTING STARTING PITCHERS ==========\n');
  
  // Get today's date
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Getting games for date: ${today}`);
  
  // Get games for today
  const games = await mlbStatsApiService.getGamesByDate(today);
  
  if (!games || games.length === 0) {
    console.log('No games found for today');
    return [];
  }
  
  console.log(`Found ${games.length} games scheduled for today\n`);
  
  const gameDetails = [];
  
  // For each game, get starting pitchers
  for (const game of games) {
    const homeTeam = game.teams.home.team.name;
    const awayTeam = game.teams.away.team.name;
    const gameId = game.gamePk;
    
    console.log(`\n--- GAME: ${awayTeam} @ ${homeTeam} ---`);
    
    try {
      console.log('Getting starting pitchers...');
      const startingPitchers = await mlbStatsApiService.getStartingPitchers(gameId);
      
      let homeStarter = null;
      let awayStarter = null;
      
      if (startingPitchers) {
        if (startingPitchers.homeStarter) {
          const hp = startingPitchers.homeStarter;
          const hpStats = hp.seasonStats || {};
          console.log(`\n${homeTeam} starting pitcher:`);
          console.log(`${hp.fullName} (#${hp.number || 'N/A'})`);
          console.log(`Season stats: ${hpStats.wins || 0}W-${hpStats.losses || 0}L, ERA ${hpStats.era || 'N/A'}, ${hpStats.strikeouts || 0} K, WHIP ${hpStats.whip || 'N/A'}`);
          
          homeStarter = {
            id: hp.id,
            fullName: hp.fullName,
            number: hp.number,
            stats: hpStats
          };
        } else {
          console.log(`\n${homeTeam} starting pitcher: Not announced`);
        }
        
        if (startingPitchers.awayStarter) {
          const ap = startingPitchers.awayStarter;
          const apStats = ap.seasonStats || {};
          console.log(`\n${awayTeam} starting pitcher:`);
          console.log(`${ap.fullName} (#${ap.number || 'N/A'})`);
          console.log(`Season stats: ${apStats.wins || 0}W-${apStats.losses || 0}L, ERA ${apStats.era || 'N/A'}, ${apStats.strikeouts || 0} K, WHIP ${apStats.whip || 'N/A'}`);
          
          awayStarter = {
            id: ap.id,
            fullName: ap.fullName,
            number: ap.number,
            stats: apStats
          };
        } else {
          console.log(`\n${awayTeam} starting pitcher: Not announced`);
        }
      } else {
        console.log('No starting pitcher information available');
      }
      
      gameDetails.push({
        gameId,
        homeTeam: {
          name: homeTeam,
          id: game.teams.home.team.id
        },
        awayTeam: {
          name: awayTeam,
          id: game.teams.away.team.id
        },
        homeStarter,
        awayStarter
      });
    } catch (error) {
      console.error(`Error getting starting pitchers for game ${gameId}:`, error.message);
    }
  }
  
  return gameDetails;
};

/**
 * Test retrieving team roster stats (key players for prop picks)
 */
const testTeamRosterStats = async (games) => {
  console.log('\n========== TESTING TEAM ROSTER STATS ==========\n');
  
  if (!games || games.length === 0) {
    console.log('No games to get roster stats for');
    return;
  }
  
  // Select the first game to test roster stats
  const game = games[0];
  console.log(`Getting roster stats for: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  
  // Get home team roster
  console.log(`\n--- ${game.homeTeam.name} ROSTER ---`);
  try {
    const homeRoster = await mlbStatsApiService.getTeamRosterWithStats(game.homeTeam.id);
    
    if (homeRoster && homeRoster.hitters && homeRoster.hitters.length > 0) {
      console.log(`\nKey hitters (${homeRoster.hitters.length} total):`);
      homeRoster.hitters.slice(0, 5).forEach((hitter, index) => {
        const s = hitter.stats;
        console.log(`${index + 1}. ${hitter.fullName} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.strikeouts || 0} K, ` +
                   `OPS ${s.ops || '.000'}`);
      });
    } else {
      console.log('No hitter data available');
    }
    
    if (homeRoster && homeRoster.pitchers && homeRoster.pitchers.length > 0) {
      console.log(`\nKey pitchers (${homeRoster.pitchers.length} total):`);
      homeRoster.pitchers.slice(0, 3).forEach((pitcher, index) => {
        const s = pitcher.stats;
        console.log(`${index + 1}. ${pitcher.fullName} (${pitcher.position}): ` +
                   `ERA ${s.era || 'N/A'}, ` +
                   `${s.wins || 0}W-${s.losses || 0}L, ` + 
                   `${s.strikeouts || 0} K, ` +
                   `WHIP ${s.whip || 'N/A'}`);
      });
    } else {
      console.log('No pitcher data available');
    }
  } catch (error) {
    console.error(`Error getting home team roster stats:`, error.message);
  }
  
  // Get away team roster
  console.log(`\n--- ${game.awayTeam.name} ROSTER ---`);
  try {
    const awayRoster = await mlbStatsApiService.getTeamRosterWithStats(game.awayTeam.id);
    
    if (awayRoster && awayRoster.hitters && awayRoster.hitters.length > 0) {
      console.log(`\nKey hitters (${awayRoster.hitters.length} total):`);
      awayRoster.hitters.slice(0, 5).forEach((hitter, index) => {
        const s = hitter.stats;
        console.log(`${index + 1}. ${hitter.fullName} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.strikeouts || 0} K, ` +
                   `OPS ${s.ops || '.000'}`);
      });
    } else {
      console.log('No hitter data available');
    }
    
    if (awayRoster && awayRoster.pitchers && awayRoster.pitchers.length > 0) {
      console.log(`\nKey pitchers (${awayRoster.pitchers.length} total):`);
      awayRoster.pitchers.slice(0, 3).forEach((pitcher, index) => {
        const s = pitcher.stats;
        console.log(`${index + 1}. ${pitcher.fullName} (${pitcher.position}): ` +
                   `ERA ${s.era || 'N/A'}, ` +
                   `${s.wins || 0}W-${s.losses || 0}L, ` + 
                   `${s.strikeouts || 0} K, ` +
                   `WHIP ${s.whip || 'N/A'}`);
      });
    } else {
      console.log('No pitcher data available');
    }
  } catch (error) {
    console.error(`Error getting away team roster stats:`, error.message);
  }
};

/**
 * Test retrieving league leaders for prop context
 */
const testLeagueLeaders = async () => {
  console.log('\n========== TESTING LEAGUE LEADERS ==========\n');
  
  // Test different stat categories relevant for prop picks
  const categories = [
    { name: 'Home Runs', type: 'homeRuns', group: 'hitting' },
    { name: 'Batting Average', type: 'battingAverage', group: 'hitting' },
    { name: 'RBIs', type: 'rbi', group: 'hitting' },
    { name: 'Hits', type: 'hits', group: 'hitting' },
    { name: 'ERA', type: 'earnedRunAverage', group: 'pitching' },
    { name: 'Strikeouts', type: 'strikeouts', group: 'pitching' },
    { name: 'Wins', type: 'wins', group: 'pitching' }
  ];
  
  for (const category of categories) {
    console.log(`\nGetting leaders for ${category.name}...`);
    const leaders = await mlbStatsApiService.getLeagueLeaders(category.type, category.group, 5);
    
    if (leaders && leaders.length > 0) {
      console.log(`Top 5 ${category.name} leaders:`);
      leaders.forEach((leader, index) => {
        console.log(`${index + 1}. ${leader.person?.fullName || 'Unknown'}: ${leader.value}`);
      });
    } else {
      console.log(`No leaders found for ${category.name}`);
    }
  }
};

/**
 * Format comprehensive player stats for a single game (for prop picks)
 */
const testPropPicksStatsFormat = async (games) => {
  console.log('\n========== TESTING PROP PICKS STATS FORMAT ==========\n');
  
  if (!games || games.length === 0) {
    console.log('No games to format stats for');
    return;
  }
  
  // Select the first game to test
  const game = games[0];
  console.log(`Formatting stats for: ${game.awayTeam.name} @ ${game.homeTeam.name}`);
  
  try {
    // Mock the formatMLBPlayerStats function from propPicksService
    console.log('\nGenerating stats in prop picks format...');
    
    // Get league leaders for rankings
    const homeRunLeaders = await mlbStatsApiService.getLeagueLeaders('homeRuns', 'hitting', 10);
    const battingAvgLeaders = await mlbStatsApiService.getLeagueLeaders('battingAverage', 'hitting', 10);
    const eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 10);
    const strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 10);
    
    // Get team rosters
    const homeRoster = await mlbStatsApiService.getTeamRosterWithStats(game.homeTeam.id);
    const awayRoster = await mlbStatsApiService.getTeamRosterWithStats(game.awayTeam.id);
    
    // Format stats text like propPicksService does
    let statsText = '';
    
    // SECTION 1: Starting Pitchers
    statsText += 'STARTING PITCHERS:\n';
    
    if (game.homeStarter) {
      const hp = game.homeStarter;
      const hpStats = hp.stats || {};
      statsText += `${game.homeTeam.name} - ${hp.fullName}: ERA ${hpStats.era || 'N/A'}, ` +
                 `${hpStats.wins || 0}W-${hpStats.losses || 0}L, ` +
                 `${hpStats.strikeouts || 0} K, ` +
                 `WHIP ${hpStats.whip || 'N/A'}\n`;
      
      // Add league ranking for ERA and strikeouts if available
      if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
        statsText += `RANKINGS: `;
        
        // Check ERA ranking
        const eraRank = findPlayerRanking(eraLeaders, hp.id);
        if (eraRank > 0) {
          statsText += `ERA #${eraRank} in MLB, `;
        }
        
        // Check strikeout ranking
        const soRank = findPlayerRanking(strikeoutLeaders, hp.id);
        if (soRank > 0) {
          statsText += `Strikeouts #${soRank} in MLB, `;
        }
        
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
    }
    
    if (game.awayStarter) {
      const ap = game.awayStarter;
      const apStats = ap.stats || {};
      statsText += `${game.awayTeam.name} - ${ap.fullName}: ERA ${apStats.era || 'N/A'}, ` +
                 `${apStats.wins || 0}W-${apStats.losses || 0}L, ` +
                 `${apStats.strikeouts || 0} K, ` +
                 `WHIP ${apStats.whip || 'N/A'}\n`;
      
      // Add league ranking for ERA and strikeouts if available
      if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
        statsText += `RANKINGS: `;
        
        // Check ERA ranking
        const eraRank = findPlayerRanking(eraLeaders, ap.id);
        if (eraRank > 0) {
          statsText += `ERA #${eraRank} in MLB, `;
        }
        
        // Check strikeout ranking
        const soRank = findPlayerRanking(strikeoutLeaders, ap.id);
        if (soRank > 0) {
          statsText += `Strikeouts #${soRank} in MLB, `;
        }
        
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
    }
    
    // SECTION 2: Home Team Hitters
    statsText += `\n${game.homeTeam.name} HITTERS:\n`;
    
    if (homeRoster && homeRoster.hitters && homeRoster.hitters.length > 0) {
      for (const hitter of homeRoster.hitters.slice(0, 5)) {
        const s = hitter.stats;
        statsText += `${hitter.fullName} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.hits || 0} H, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.runs || 0} R, ` +
                   `${s.strikeouts || 0} K, ` +
                   `${s.walks || 0} BB, ` +
                   `OPS ${s.ops || '.000'}\n`;
        
        // Add league rankings if available
        if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
          const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
          const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);
          
          if (hrRank > 0 || avgRank > 0) {
            statsText += `  RANKINGS: `;
            
            if (hrRank > 0) {
              statsText += `HR #${hrRank} in MLB, `;
            }
            
            if (avgRank > 0) {
              statsText += `AVG #${avgRank} in MLB, `;
            }
            
            statsText = statsText.replace(/, $/, '');
            statsText += '\n';
          }
        }
      }
    } else {
      statsText += 'No hitter data available\n';
    }
    
    // SECTION 3: Away Team Hitters
    statsText += `\n${game.awayTeam.name} HITTERS:\n`;
    
    if (awayRoster && awayRoster.hitters && awayRoster.hitters.length > 0) {
      for (const hitter of awayRoster.hitters.slice(0, 5)) {
        const s = hitter.stats;
        statsText += `${hitter.fullName} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.hits || 0} H, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.runs || 0} R, ` +
                   `${s.strikeouts || 0} K, ` +
                   `${s.walks || 0} BB, ` +
                   `OPS ${s.ops || '.000'}\n`;
        
        // Add league rankings if available
        if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
          const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
          const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);
          
          if (hrRank > 0 || avgRank > 0) {
            statsText += `  RANKINGS: `;
            
            if (hrRank > 0) {
              statsText += `HR #${hrRank} in MLB, `;
            }
            
            if (avgRank > 0) {
              statsText += `AVG #${avgRank} in MLB, `;
            }
            
            statsText = statsText.replace(/, $/, '');
            statsText += '\n';
          }
        }
      }
    } else {
      statsText += 'No hitter data available\n';
    }
    
    // SECTION 4: League Leaders Summary
    if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0 || eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
      statsText += `\nLEAGUE LEADERS:\n`;
      
      if (homeRunLeaders.length > 0) {
        statsText += `HOME RUNS: `;
        for (let i = 0; i < Math.min(3, homeRunLeaders.length); i++) {
          const leader = homeRunLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
      
      if (battingAvgLeaders.length > 0) {
        statsText += `BATTING AVG: `;
        for (let i = 0; i < Math.min(3, battingAvgLeaders.length); i++) {
          const leader = battingAvgLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
      
      if (eraLeaders.length > 0) {
        statsText += `ERA: `;
        for (let i = 0; i < Math.min(3, eraLeaders.length); i++) {
          const leader = eraLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
      
      if (strikeoutLeaders.length > 0) {
        statsText += `STRIKEOUTS: `;
        for (let i = 0; i < Math.min(3, strikeoutLeaders.length); i++) {
          const leader = strikeoutLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
    }
    
    console.log('\nFORMATTED STATS FOR PROP PICKS:');
    console.log('--------------------------------------');
    console.log(statsText);
    console.log('--------------------------------------');
    
  } catch (error) {
    console.error('Error formatting prop picks stats:', error);
  }
};

// Helper function to find player ranking in leaderboard
function findPlayerRanking(leaders, playerId) {
  for (let i = 0; i < leaders.length; i++) {
    if (leaders[i].person && leaders[i].person.id === playerId) {
      return i + 1; // Return 1-based rank
    }
  }
  return 0; // Not found in leaders
}

// Main test runner
const runTests = async () => {
  try {
    console.log('==============================================');
    console.log('COMPREHENSIVE MLB STATS TEST FOR PROP PICKS');
    console.log('==============================================');
    console.log(`Test Time: ${new Date().toLocaleString()}\n`);
    
    // Run tests in sequence
    const games = await testStartingPitchers();
    await testTeamRosterStats(games);
    await testLeagueLeaders();
    await testPropPicksStatsFormat(games);
    
    console.log('\n==============================================');
    console.log('ALL TESTS COMPLETED');
    console.log('==============================================');
  } catch (error) {
    console.error('Error running tests:', error);
  }
};

// Run all tests
runTests();
