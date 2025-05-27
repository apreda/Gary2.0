/**
 * Test script for retrieving starting pitchers for today's MLB games
 * This is specifically for prop picks functionality
 */

import { mlbStatsApiService } from './services/mlbStatsApiService.enhanced.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Get today's games and their starting pitchers
 */
const getTodaysStartingPitchers = async () => {
  // Get today's date
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Getting games for date: ${today}`);
  
  // Get games for today
  const games = await mlbStatsApiService.getGamesByDate(today);
  
  if (!games || games.length === 0) {
    console.log('No games found for today');
    return;
  }
  
  console.log(`Found ${games.length} games scheduled for today\n`);
  
  // For each game, get starting pitchers
  for (const game of games) {
    const homeTeam = game.teams.home.team.name;
    const awayTeam = game.teams.away.team.name;
    const gameId = game.gamePk;
    
    console.log(`\n=== GAME: ${awayTeam} @ ${homeTeam} ===`);
    console.log(`Game ID: ${gameId}`);
    
    try {
      console.log('Getting starting pitchers...');
      const startingPitchers = await mlbStatsApiService.getStartingPitchers(gameId);
      
      if (startingPitchers) {
        if (startingPitchers.homeStarter) {
          const hp = startingPitchers.homeStarter;
          const hpStats = hp.seasonStats || {};
          console.log(`\n${homeTeam} starting pitcher:`);
          console.log(`${hp.fullName} (#${hp.number || 'N/A'})`);
          console.log(`Season stats: ${hpStats.wins || 0}W-${hpStats.losses || 0}L, ERA ${hpStats.era || 'N/A'}, ${hpStats.strikeouts || 0} K, WHIP ${hpStats.whip || 'N/A'}`);
        } else {
          console.log(`\n${homeTeam} starting pitcher: Not announced`);
        }
        
        if (startingPitchers.awayStarter) {
          const ap = startingPitchers.awayStarter;
          const apStats = ap.seasonStats || {};
          console.log(`\n${awayTeam} starting pitcher:`);
          console.log(`${ap.fullName} (#${ap.number || 'N/A'})`);
          console.log(`Season stats: ${apStats.wins || 0}W-${apStats.losses || 0}L, ERA ${apStats.era || 'N/A'}, ${apStats.strikeouts || 0} K, WHIP ${apStats.whip || 'N/A'}`);
        } else {
          console.log(`\n${awayTeam} starting pitcher: Not announced`);
        }
        
        // Try to get enhanced pitcher stats
        try {
          console.log('\nAttempting to get enhanced pitcher stats...');
          const enhancedPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(gameId);
          
          if (enhancedPitchers) {
            console.log('Enhanced starting pitcher data available!');
            
            // Check for league rankings
            const eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 20);
            const strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 20);
            
            if (enhancedPitchers.homeStarter) {
              const hpId = enhancedPitchers.homeStarter.id;
              const eraRank = findPlayerRanking(eraLeaders, hpId);
              const soRank = findPlayerRanking(strikeoutLeaders, hpId);
              
              console.log(`\n${homeTeam} starting pitcher rankings:`);
              console.log(`ERA Rank: ${eraRank > 0 ? `#${eraRank} in MLB` : 'Not in top 20'}`);
              console.log(`Strikeout Rank: ${soRank > 0 ? `#${soRank} in MLB` : 'Not in top 20'}`);
            }
            
            if (enhancedPitchers.awayStarter) {
              const apId = enhancedPitchers.awayStarter.id;
              const eraRank = findPlayerRanking(eraLeaders, apId);
              const soRank = findPlayerRanking(strikeoutLeaders, apId);
              
              console.log(`\n${awayTeam} starting pitcher rankings:`);
              console.log(`ERA Rank: ${eraRank > 0 ? `#${eraRank} in MLB` : 'Not in top 20'}`);
              console.log(`Strikeout Rank: ${soRank > 0 ? `#${soRank} in MLB` : 'Not in top 20'}`);
            }
          }
        } catch (error) {
          console.log('Enhanced pitcher data not available');
        }
      } else {
        console.log('No starting pitcher information available');
      }
    } catch (error) {
      console.error(`Error getting starting pitchers for game ${gameId}:`, error.message);
    }
    
    console.log('-----------------------------------');
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

// Run the test
console.log('==============================================');
console.log('TESTING MLB STARTING PITCHERS FOR TODAY\'S GAMES');
console.log('==============================================\n');

getTodaysStartingPitchers().then(() => {
  console.log('\nTest completed');
}).catch(error => {
  console.error('Error running test:', error);
});
