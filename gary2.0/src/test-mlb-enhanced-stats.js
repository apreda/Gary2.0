/**
 * Test script for enhanced MLB Stats API functionality
 * Tests:
 * 1. Retrieving league leaders for various statistical categories
 * 2. Getting team rosters with full player stats
 * 3. Comprehensive matchup data with all stats combined
 */

import { mlbStatsApiService } from './services/mlbStatsApiService.enhanced2.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const testLeagueLeaders = async () => {
  console.log('\n=== TESTING MLB LEAGUE LEADERS ===\n');
  
  // Test different stat categories
  const categories = [
    { type: 'homeRuns', group: 'hitting' },
    { type: 'battingAverage', group: 'hitting' },
    { type: 'onBasePlusSlugging', group: 'hitting' },
    { type: 'earnedRunAverage', group: 'pitching' },
    { type: 'strikeouts', group: 'pitching' },
    { type: 'wins', group: 'pitching' }
  ];
  
  for (const category of categories) {
    console.log(`\nGetting leaders for ${category.type}...`);
    const leaders = await mlbStatsApiService.getLeagueLeaders(category.type, category.group, 5);
    
    if (leaders && leaders.length > 0) {
      console.log(`Top 5 ${category.type} leaders:`);
      leaders.forEach((leader, index) => {
        console.log(`${index + 1}. ${leader.person?.fullName || 'Unknown'}: ${leader.value}`);
      });
    } else {
      console.log(`No leaders found for ${category.type}`);
    }
  }
};

const testTeamRoster = async () => {
  console.log('\n=== TESTING TEAM ROSTER WITH STATS ===\n');
  
  // Test with known team IDs (Yankees = 147, Dodgers = 119)
  const teamIds = [147, 119]; 
  
  for (const teamId of teamIds) {
    console.log(`\nGetting roster for team ID ${teamId}...`);
    const roster = await mlbStatsApiService.getTeamRosterWithStats(teamId);
    
    if (roster) {
      // Print pitchers
      console.log(`\nPitchers (${roster.pitchers.length}):`);
      roster.pitchers.slice(0, 3).forEach((pitcher, index) => {
        console.log(`${index + 1}. ${pitcher.fullName} (#${pitcher.jerseyNumber || 'N/A'}) - ${pitcher.position}`);
        if (pitcher.stats) {
          console.log(`   ERA: ${pitcher.stats.era || 'N/A'}, W-L: ${pitcher.stats.wins || 0}-${pitcher.stats.losses || 0}, IP: ${pitcher.stats.inningsPitched || '0.0'}, K: ${pitcher.stats.strikeouts || 0}`);
        }
      });
      
      // Print hitters
      console.log(`\nHitters (${roster.hitters.length}):`);
      roster.hitters.slice(0, 5).forEach((hitter, index) => {
        console.log(`${index + 1}. ${hitter.fullName} (#${hitter.jerseyNumber || 'N/A'}) - ${hitter.position}`);
        if (hitter.stats) {
          console.log(`   AVG: ${hitter.stats.avg || '.000'}, HR: ${hitter.stats.homeRuns || 0}, RBI: ${hitter.stats.rbi || 0}, OPS: ${hitter.stats.ops || '.000'}`);
        }
      });
    } else {
      console.log(`Failed to get roster for team ID ${teamId}`);
    }
  }
};

const testComprehensiveStats = async () => {
  console.log('\n=== TESTING COMPREHENSIVE MATCHUP STATS ===\n');
  
  // Get today's games
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Getting games for date: ${today}`);
  
  const games = await mlbStatsApiService.getGamesByDate(today);
  
  if (!games || games.length === 0) {
    console.log('No games found for today');
    
    // Try tomorrow as fallback
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    
    console.log(`Trying tomorrow: ${tomorrowStr}`);
    const tomorrowGames = await mlbStatsApiService.getGamesByDate(tomorrowStr);
    
    if (!tomorrowGames || tomorrowGames.length === 0) {
      console.log('No games found for tomorrow either');
      return;
    }
    
    // Use first game from tomorrow
    const game = tomorrowGames[0];
    console.log(`Using game: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`);
    
    const gameId = game.gamePk;
    const comprehensiveStats = await mlbStatsApiService.getComprehensiveMatchupStats(gameId);
    
    if (comprehensiveStats) {
      displayComprehensiveStats(comprehensiveStats);
    } else {
      console.log(`Failed to get comprehensive stats for game ID ${gameId}`);
    }
  } else {
    // Use first game from today
    const game = games[0];
    console.log(`Using game: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`);
    
    const gameId = game.gamePk;
    const comprehensiveStats = await mlbStatsApiService.getComprehensiveMatchupStats(gameId);
    
    if (comprehensiveStats) {
      displayComprehensiveStats(comprehensiveStats);
    } else {
      console.log(`Failed to get comprehensive stats for game ID ${gameId}`);
    }
  }
};

// Helper to display comprehensive stats
const displayComprehensiveStats = (stats) => {
  console.log('\n=== COMPREHENSIVE MATCHUP DETAILS ===');
  console.log(`${stats.awayTeam.name} @ ${stats.homeTeam.name}\n`);
  
  // Display starting pitchers
  console.log('STARTING PITCHERS:');
  if (stats.startingPitchers?.homeStarter) {
    const hp = stats.startingPitchers.homeStarter;
    const hpStats = hp.seasonStats || {};
    console.log(`${stats.homeTeam.name}: ${hp.fullName} - ERA ${hpStats.era || 'N/A'}, ${hpStats.wins || 0}W-${hpStats.losses || 0}L, ${hpStats.strikeouts || 0} K`);
  }
  if (stats.startingPitchers?.awayStarter) {
    const ap = stats.startingPitchers.awayStarter;
    const apStats = ap.seasonStats || {};
    console.log(`${stats.awayTeam.name}: ${ap.fullName} - ERA ${apStats.era || 'N/A'}, ${apStats.wins || 0}W-${apStats.losses || 0}L, ${apStats.strikeouts || 0} K`);
  }
  
  // Display select hitters
  console.log('\nKEY HITTERS:');
  // Home team
  console.log(`\n${stats.homeTeam.name}:`);
  stats.homeTeam.roster.hitters.slice(0, 3).forEach(hitter => {
    const s = hitter.stats;
    console.log(`${hitter.fullName} - AVG: ${s.avg || '.000'}, HR: ${s.homeRuns || 0}, RBI: ${s.rbi || 0}`);
  });
  
  // Away team
  console.log(`\n${stats.awayTeam.name}:`);
  stats.awayTeam.roster.hitters.slice(0, 3).forEach(hitter => {
    const s = hitter.stats;
    console.log(`${hitter.fullName} - AVG: ${s.avg || '.000'}, HR: ${s.homeRuns || 0}, RBI: ${s.rbi || 0}`);
  });
  
  // League leaders overview
  console.log('\nLEAGUE LEADERS:');
  
  if (stats.leagueLeaders.homeRuns && stats.leagueLeaders.homeRuns.length > 0) {
    console.log('\nHR Leaders:');
    stats.leagueLeaders.homeRuns.slice(0, 3).forEach((leader, idx) => {
      console.log(`${idx + 1}. ${leader.person.fullName}: ${leader.value}`);
    });
  }
  
  if (stats.leagueLeaders.battingAverage && stats.leagueLeaders.battingAverage.length > 0) {
    console.log('\nAVG Leaders:');
    stats.leagueLeaders.battingAverage.slice(0, 3).forEach((leader, idx) => {
      console.log(`${idx + 1}. ${leader.person.fullName}: ${leader.value}`);
    });
  }
  
  if (stats.leagueLeaders.era && stats.leagueLeaders.era.length > 0) {
    console.log('\nERA Leaders:');
    stats.leagueLeaders.era.slice(0, 3).forEach((leader, idx) => {
      console.log(`${idx + 1}. ${leader.person.fullName}: ${leader.value}`);
    });
  }
};

const testPlayerComparisonReport = async () => {
  console.log('\n=== TESTING PLAYER COMPARISON REPORT ===\n');
  
  // Test with known player IDs (Aaron Judge = 592450, Shohei Ohtani = 660271)
  const playerIds = [592450, 660271];
  
  for (const playerId of playerIds) {
    console.log(`\nGenerating comparison report for player ID ${playerId}...`);
    const report = await mlbStatsApiService.getPlayerComparisonReport(playerId);
    
    if (report) {
      console.log(report);
    } else {
      console.log(`Failed to generate report for player ID ${playerId}`);
    }
  }
};

// Main test runner
const runTests = async () => {
  try {
    console.log('========================================');
    console.log('ENHANCED MLB STATS API INTEGRATION TESTS');
    console.log('========================================\n');
    console.log(`Test Time: ${new Date().toLocaleString()}`);
    
    // Run all tests
    await testLeagueLeaders();
    await testTeamRoster();
    await testComprehensiveStats();
    await testPlayerComparisonReport();
    
    console.log('\n========================================');
    console.log('ALL TESTS COMPLETED');
    console.log('========================================');
  } catch (error) {
    console.error('Error running tests:', error);
  }
};

// Run all tests
runTests();
