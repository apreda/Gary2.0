/**
 * Enhanced MLB Stats API Service (Version 2)
 * Includes comprehensive statistics for prop picks:
 * - League leaders in major categories
 * - Team rosters with complete stats (8 hitters + 1 pitcher per team)
 * - Season stats comparison
 */
import { mlbStatsApiService as originalService } from './mlbStatsApiService.js';
import axios from 'axios';

const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

// Create an enhanced version of the MLB Stats API service
const mlbStatsApiService = {
  // Include all methods from the original service
  ...originalService,
  
  /**
   * Get league leaders in a specific stat category
   * @param {string} statType - The stat type (e.g., 'homeRuns', 'battingAverage', 'earnedRunAverage')
   * @param {string} group - The stat group ('hitting' or 'pitching')
   * @param {number} limit - Maximum number of leaders to return
   * @returns {Promise<Array>} - Array of league leaders
   */
  getLeagueLeaders: async (statType, group = 'hitting', limit = 10) => {
    try {
      console.log(`[MLB API] Getting league leaders for ${statType}`);
      
      const response = await axios.get(`${MLB_API_BASE_URL}/stats/leaders`, {
        params: {
          leaderCategories: statType,
          sportId: 1,
          statGroup: group,
          season: new Date().getFullYear(),
          limit: limit
        }
      });
      
      if (response.data && response.data.leagueLeaders && response.data.leagueLeaders.length > 0) {
        const leaders = response.data.leagueLeaders[0].leaders;
        console.log(`[MLB API] Found ${leaders.length} leaders for ${statType}`);
        return leaders;
      }
      
      console.log(`[MLB API] No leaders found for ${statType}`);
      return [];
    } catch (error) {
      console.error(`[MLB API] Error getting league leaders for ${statType}:`, error.message);
      return [];
    }
  },
  
  /**
   * Get a team's complete roster with stats
   * @param {number} teamId - The MLB team ID
   * @returns {Promise<Object>} - Object containing pitchers and hitters with stats
   */
  getTeamRosterWithStats: async (teamId) => {
    try {
      console.log(`[MLB API] Getting roster with stats for team ${teamId}`);
      
      // Get the team's active roster
      const rosterResponse = await axios.get(`${MLB_API_BASE_URL}/teams/${teamId}/roster`, {
        params: {
          rosterType: 'active'
        }
      });
      
      if (!rosterResponse.data || !rosterResponse.data.roster || rosterResponse.data.roster.length === 0) {
        console.log(`[MLB API] No roster found for team ${teamId}`);
        return { pitchers: [], hitters: [] };
      }
      
      // Separate pitchers and position players
      const roster = rosterResponse.data.roster;
      const pitchers = roster.filter(player => player.position.code === '1');
      const hitters = roster.filter(player => player.position.code !== '1');
      
      console.log(`[MLB API] Found ${pitchers.length} pitchers and ${hitters.length} position players`);
      
      // Get stats for pitchers
      const pitchersWithStats = [];
      for (const pitcher of pitchers) {
        const stats = await originalService.getPitcherSeasonStats(pitcher.person.id);
        pitchersWithStats.push({
          id: pitcher.person.id,
          fullName: pitcher.person.fullName,
          position: pitcher.position.abbreviation,
          jerseyNumber: pitcher.jerseyNumber,
          stats: stats
        });
      }
      
      // Get stats for hitters (top 8 or all if less than 8)
      const topHitters = hitters.slice(0, Math.min(8, hitters.length));
      const hittersWithStats = [];
      
      for (const hitter of topHitters) {
        try {
          const response = await axios.get(`${MLB_API_BASE_URL}/people/${hitter.person.id}/stats`, {
            params: {
              stats: 'season',
              group: 'batting',
              season: new Date().getFullYear(),
              sportId: 1
            }
          });
          
          if (response.data && response.data.stats && response.data.stats.length > 0 && 
              response.data.stats[0].splits && response.data.stats[0].splits.length > 0) {
            
            const stats = response.data.stats[0].splits[0].stat;
            
            hittersWithStats.push({
              id: hitter.person.id,
              fullName: hitter.person.fullName,
              position: hitter.position.abbreviation,
              jerseyNumber: hitter.jerseyNumber,
              stats: {
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
                ops: stats.ops || '.000',
                stolenBases: stats.stolenBases || 0,
                doubles: stats.doubles || 0,
                triples: stats.triples || 0,
                totalBases: stats.totalBases || 0
              }
            });
          }
        } catch (error) {
          console.error(`[MLB API] Error getting stats for hitter ${hitter.person.fullName}:`, error.message);
        }
      }
      
      return {
        pitchers: pitchersWithStats,
        hitters: hittersWithStats
      };
    } catch (error) {
      console.error(`[MLB API] Error getting team roster with stats for team ${teamId}:`, error.message);
      return { pitchers: [], hitters: [] };
    }
  },
  
  /**
   * Get comprehensive statistics for a matchup, including:
   * - Team rosters with stats
   * - League leader rankings for players in the matchup
   * - Starting pitchers with complete stats
   * @param {number} gameId - The MLB game ID
   * @returns {Promise<Object>} - Comprehensive stats for the matchup
   */
  getComprehensiveMatchupStats: async (gameId) => {
    try {
      console.log(`[MLB API] Getting comprehensive matchup stats for game ${gameId}`);
      
      // Get game data
      const gameResponse = await axios.get(`${MLB_API_BASE_URL}/game/${gameId}/feed/live`);
      
      if (!gameResponse.data || !gameResponse.data.gameData) {
        console.log(`[MLB API] No game data found for game ${gameId}`);
        return null;
      }
      
      const gameData = gameResponse.data.gameData;
      const homeTeamId = gameData.teams.home.id;
      const awayTeamId = gameData.teams.away.id;
      const homeTeamName = gameData.teams.home.name;
      const awayTeamName = gameData.teams.away.name;
      
      console.log(`[MLB API] Getting stats for matchup: ${awayTeamName} @ ${homeTeamName}`);
      
      // Get starting pitchers
      const startingPitchers = await originalService.getStartingPitchers(gameId);
      
      // Get home team roster with stats
      const homeTeamRoster = await mlbStatsApiService.getTeamRosterWithStats(homeTeamId);
      
      // Get away team roster with stats
      const awayTeamRoster = await mlbStatsApiService.getTeamRosterWithStats(awayTeamId);
      
      // Get league leaders in key categories
      const homeRunLeaders = await mlbStatsApiService.getLeagueLeaders('homeRuns', 'hitting', 20);
      const avgLeaders = await mlbStatsApiService.getLeagueLeaders('battingAverage', 'hitting', 20);
      const eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 20);
      const strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 20);
      
      // Combine everything into comprehensive stats object
      return {
        gameId,
        homeTeam: {
          id: homeTeamId,
          name: homeTeamName,
          roster: homeTeamRoster
        },
        awayTeam: {
          id: awayTeamId,
          name: awayTeamName,
          roster: awayTeamRoster
        },
        startingPitchers,
        leagueLeaders: {
          homeRuns: homeRunLeaders,
          battingAverage: avgLeaders,
          era: eraLeaders,
          strikeouts: strikeoutLeaders
        }
      };
    } catch (error) {
      console.error(`[MLB API] Error getting comprehensive matchup stats for game ${gameId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get a formatted player comparison report for OpenAI prompt
   * Provides rankings and comparisons to league leaders
   * @param {number} playerId - The MLB player ID
   * @returns {Promise<string>} - Formatted player comparison report
   */
  getPlayerComparisonReport: async (playerId) => {
    try {
      console.log(`[MLB API] Getting player comparison report for player ${playerId}`);
      
      // Get player details
      const playerResponse = await axios.get(`${MLB_API_BASE_URL}/people/${playerId}`);
      
      if (!playerResponse.data || !playerResponse.data.people || playerResponse.data.people.length === 0) {
        console.log(`[MLB API] No player details found for player ${playerId}`);
        return '';
      }
      
      const player = playerResponse.data.people[0];
      const isPitcher = player.primaryPosition.code === '1';
      
      let report = `${player.fullName} COMPARISON REPORT:\n`;
      
      if (isPitcher) {
        // Get pitcher season stats
        const stats = await originalService.getPitcherSeasonStats(playerId);
        
        // Get league leaders in relevant categories
        const eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 20);
        const strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 20);
        const winsLeaders = await mlbStatsApiService.getLeagueLeaders('wins', 'pitching', 20);
        
        // Find player rankings
        const eraRank = findPlayerRanking(eraLeaders, playerId);
        const soRank = findPlayerRanking(strikeoutLeaders, playerId);
        const winsRank = findPlayerRanking(winsLeaders, playerId);
        
        report += `Current Season Stats: ${stats.wins}-${stats.losses}, ${stats.era} ERA, ${stats.strikeouts} K, ${stats.whip} WHIP\n`;
        report += `League Rankings:\n`;
        report += `- ERA: ${eraRank > 0 ? `#${eraRank} among qualified pitchers` : 'Not ranked in top 20'}\n`;
        report += `- Strikeouts: ${soRank > 0 ? `#${soRank} in MLB` : 'Not ranked in top 20'}\n`;
        report += `- Wins: ${winsRank > 0 ? `#${winsRank} in MLB` : 'Not ranked in top 20'}\n`;
        
      } else {
        // Get hitter season stats
        const response = await axios.get(`${MLB_API_BASE_URL}/people/${playerId}/stats`, {
          params: {
            stats: 'season',
            group: 'batting',
            season: new Date().getFullYear(),
            sportId: 1
          }
        });
        
        if (!response.data || !response.data.stats || !response.data.stats[0] || 
            !response.data.stats[0].splits || !response.data.stats[0].splits[0]) {
          return `No season stats available for ${player.fullName}`;
        }
        
        const stats = response.data.stats[0].splits[0].stat;
        
        // Get league leaders in relevant categories
        const hrLeaders = await mlbStatsApiService.getLeagueLeaders('homeRuns', 'hitting', 20);
        const avgLeaders = await mlbStatsApiService.getLeagueLeaders('battingAverage', 'hitting', 20);
        const rbiLeaders = await mlbStatsApiService.getLeagueLeaders('rbi', 'hitting', 20);
        
        // Find player rankings
        const hrRank = findPlayerRanking(hrLeaders, playerId);
        const avgRank = findPlayerRanking(avgLeaders, playerId);
        const rbiRank = findPlayerRanking(rbiLeaders, playerId);
        
        report += `Current Season Stats: ${stats.avg} AVG, ${stats.homeRuns} HR, ${stats.rbi} RBI, ${stats.ops} OPS\n`;
        report += `League Rankings:\n`;
        report += `- Home Runs: ${hrRank > 0 ? `#${hrRank} in MLB` : 'Not ranked in top 20'}\n`;
        report += `- Batting Average: ${avgRank > 0 ? `#${avgRank} among qualified hitters` : 'Not ranked in top 20'}\n`;
        report += `- RBIs: ${rbiRank > 0 ? `#${rbiRank} in MLB` : 'Not ranked in top 20'}\n`;
      }
      
      return report;
    } catch (error) {
      console.error(`[MLB API] Error getting player comparison report for player ${playerId}:`, error.message);
      return '';
    }
  }
};

// Helper function to find a player's ranking in a leaderboard
function findPlayerRanking(leaders, playerId) {
  for (let i = 0; i < leaders.length; i++) {
    if (leaders[i].person && leaders[i].person.id === playerId) {
      return i + 1; // Return 1-based rank
    }
  }
  return 0; // Not found in leaders
}

export { mlbStatsApiService };
