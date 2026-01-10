/**
 * Enhanced MLB Stats API Service
 * Includes improved functions for retrieving accurate starting pitcher information
 * This version uses the schedule API with hydration for reliable starting pitcher data
 */
import { mlbStatsApiService as originalService } from './mlbStatsApiService.js';
import axios from 'axios';

const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

// Add request deduplication for MLB API calls
const activeRequests = new Map();
const requestCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Make a deduplicated API request
 * @param {string} key - Unique key for the request
 * @param {Function} requestFunction - Function that makes the actual API call
 * @returns {Promise} - The API response
 */
const makeDeduplicatedRequest = async (key, requestFunction) => {
  // Check cache first
  const cached = requestCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[MLB API] Using cached data for ${key}`);
    return cached.data;
  }

  // Check if request is already in progress
  if (activeRequests.has(key)) {
    console.log(`[MLB API] Request for ${key} already in progress, waiting...`);
    return activeRequests.get(key);
  }

  // Make the request
  console.log(`[MLB API] Making fresh request for ${key}`);
  const requestPromise = requestFunction();
  activeRequests.set(key, requestPromise);

  try {
    const result = await requestPromise;
    // Cache the result
    requestCache.set(key, { data: result, timestamp: Date.now() });
    return result;
  } finally {
    activeRequests.delete(key);
  }
};

/**
 * Enhanced function to get pitcher season stats with better error handling
 * @param {number} playerId - The MLB player ID
 * @returns {Promise<Object>} - Pitcher's season stats
 */
async function getPitcherSeasonStatsEnhanced(playerId) {
  if (!playerId) {
    console.log(`[MLB API] Cannot get stats for pitcher: No pitcher ID provided`);
    return {};
  }
  
  try {
    console.log(`[MLB API] Getting season stats for pitcher ${playerId}`);
    
    return makeDeduplicatedRequest(`pitcher-season-stats-${playerId}`, async () => {
      const response = await axios.get(`${MLB_API_BASE_URL}/people/${playerId}/stats`, {
      params: {
        stats: 'season',
        group: 'pitching',
        season: new Date().getFullYear(),
        sportId: 1
      },
      headers: {
        'Accept': 'application/json'
        // User-Agent header removed to avoid browser security restrictions
      },
      timeout: 10000
    });
    
    console.log(`[MLB API] Raw response for pitcher ${playerId}:`, JSON.stringify(response.data, null, 2));
    
    if (response.data && response.data.stats && response.data.stats.length > 0) {
      const stats = response.data.stats[0].splits?.[0]?.stat || {};
      
      const processedStats = {
        era: stats.era || 0,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        inningsPitched: stats.inningsPitched || '0.0',
        strikeouts: stats.strikeOuts || 0,
        whip: stats.whip || 0,
        battingAvgAgainst: stats.avg || '.000',
        walks: stats.baseOnBalls || 0,
        hits: stats.hits || 0,
        homeRuns: stats.homeRuns || 0,
        gamesStarted: stats.gamesStarted || 0,
        saveOpportunities: stats.saveOpportunities || 0,
        saves: stats.saves || 0,
        year: new Date().getFullYear(),
        gamesPitched: stats.gamesPitched || 0
      };
      
      console.log(`[MLB API] Processed stats for pitcher ${playerId}:`, processedStats);
      return processedStats;
    }
    
    console.log(`[MLB API] No stats found in response for pitcher ${playerId}`);
    return {};
    });
  } catch (error) {
    console.error(`[MLB API] Error getting season stats for pitcher ${playerId}:`, error.message);
    console.error(`[MLB API] Error details:`, error.response?.data || 'No response data');
    
    // Try fallback with previous year's stats
    try {
      console.log(`[MLB API] Trying previous year stats for pitcher ${playerId}`);
      const fallbackResponse = await axios.get(`${MLB_API_BASE_URL}/people/${playerId}/stats`, {
        params: {
          stats: 'season',
          group: 'pitching',
          season: new Date().getFullYear() - 1,
          sportId: 1
        },
        headers: {
          'Accept': 'application/json'
          // User-Agent header removed to avoid browser security restrictions
        },
        timeout: 5000
      });
      
      if (fallbackResponse.data && fallbackResponse.data.stats && fallbackResponse.data.stats.length > 0) {
        const stats = fallbackResponse.data.stats[0].splits?.[0]?.stat || {};
        console.log(`[MLB API] Found previous year stats for pitcher ${playerId}`);
        
        return {
          era: stats.era || 0,
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          inningsPitched: stats.inningsPitched || '0.0',
          strikeouts: stats.strikeOuts || 0,
          whip: stats.whip || 0,
          battingAvgAgainst: stats.avg || '.000',
          walks: stats.baseOnBalls || 0,
          hits: stats.hits || 0,
          homeRuns: stats.homeRuns || 0,
          gamesStarted: stats.gamesStarted || 0,
          saveOpportunities: stats.saveOpportunities || 0,
          saves: stats.saves || 0,
          year: new Date().getFullYear() - 1,
          gamesPitched: stats.gamesPitched || 0
        };
      }
    } catch (fallbackError) {
      console.error(`[MLB API] Fallback also failed for pitcher ${playerId}:`, fallbackError.message);
    }
    
    return {};
  }
}

// Create an enhanced version of the MLB Stats API service
const mlbStatsApiService = {
  // Include all methods from the original service
  ...originalService,
  
  // Override the getPitcherSeasonStats with our enhanced version
  getPitcherSeasonStats: getPitcherSeasonStatsEnhanced,
  
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
   * Get only top hitters for a team (no pitchers to avoid unnecessary API calls)
   * @param {number} teamId - The MLB team ID
   * @param {number} limit - Number of top hitters to return (default 5)
   * @returns {Promise<Array>} - Array of top hitters with stats
   */
  getTopHitters: async (teamId, limit = 5) => {
    try {
      console.log(`[MLB API] Getting top ${limit} hitters for team ${teamId}`);
      
      // Get the team's active roster
      const rosterResponse = await axios.get(`${MLB_API_BASE_URL}/teams/${teamId}/roster`, {
        params: {
          rosterType: 'active'
        }
      });
      
      if (!rosterResponse.data || !rosterResponse.data.roster || rosterResponse.data.roster.length === 0) {
        console.log(`[MLB API] No roster found for team ${teamId}`);
        return [];
      }
      
      // Only get position players (not pitchers)
      const roster = rosterResponse.data.roster;
      const hitters = roster.filter(player => player.position.code !== '1');
      
      console.log(`[MLB API] Found ${hitters.length} position players`);
      
      // Get stats for top hitters only
      const topHitters = hitters.slice(0, Math.min(limit, hitters.length));
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
      
      return hittersWithStats;
    } catch (error) {
      console.error(`[MLB API] Error getting top hitters for team ${teamId}:`, error.message);
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
        const stats = await getPitcherSeasonStatsEnhanced(pitcher.person.id);
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
      const startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(gameId);
      
      // Get home team roster with stats
      const homeTeamRoster = await mlbStatsApiService.getTeamRosterWithStats(homeTeamId);
      
      // Get away team roster with stats
      const awayTeamRoster = await mlbStatsApiService.getTeamRosterWithStats(awayTeamId);
      
      // Get league leaders in key categories
      const homeRunLeaders = await mlbStatsApiService.getLeagueLeaders('homeRuns', 'hitting', 20);
      const avgLeaders = await mlbStatsApiService.getLeagueLeaders('battingAverage', 'hitting', 20);
      const eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 20);
      const strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 20);
      
      // Helper function to find player ranking
      const findPlayerRanking = (leaders, playerId) => {
        const playerRank = leaders.findIndex(leader => leader.person.id === playerId);
        return playerRank >= 0 ? playerRank + 1 : null;
      };
      
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
        },
        playerRankings: {
          findPlayerRanking
        }
      };
    } catch (error) {
      console.error(`[MLB API] Error getting comprehensive matchup stats for game ${gameId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Enhanced version of getStartingPitchers that uses the more reliable schedule API
   * @param {number} gamePk - The MLB game ID
   * @returns {Promise<Object>} - Object containing home and away starting pitchers with complete details
   */
  getStartingPitchersEnhanced: async (gamePk) => {
    try {
      console.log(`[MLB API] Getting enhanced starting pitchers data for game ${gamePk}`);
      
      // First try the schedule endpoint which includes probable pitchers
      const initialScheduleResponse = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
        params: {
          sportId: 1, // MLB
          gamePk: gamePk,
          hydrate: 'probablePitcher(note)',
          fields: 'dates,games,teams,probablePitcher,id,fullName,firstName,lastName,jerseyNumber,name',
          scheduleTypes: 'games'
        },
        headers: {
          'Accept': 'application/json'
          // User-Agent header removed to avoid browser security restrictions
        },
        timeout: 10000
      }).catch(error => {
        console.log(`[MLB API] Error with schedule endpoint: ${error.message}`);
        return null;
      });

      // Process schedule response if successful
      if (initialScheduleResponse?.data?.dates?.[0]?.games?.[0]) {
        const gameData = initialScheduleResponse.data.dates[0].games[0];
        let homeStarter = null;
        let awayStarter = null;

        // Process home team probable pitcher
        if (gameData.teams?.home?.probablePitcher) {
          const pitcher = gameData.teams.home.probablePitcher;
          console.log(`[MLB API] Getting stats for home pitcher: ${pitcher.fullName} (ID: ${pitcher.id})`);
          
          const stats = await getPitcherSeasonStatsEnhanced(pitcher.id);
          
          homeStarter = {
            id: pitcher.id,
            fullName: pitcher.fullName || `${pitcher.firstName} ${pitcher.lastName}`.trim(),
            firstName: pitcher.firstName || '',
            lastName: pitcher.lastName || '',
            number: pitcher.jerseyNumber || '',
            team: gameData.teams.home.team?.name || '',
            stats: {},
            seasonStats: stats,
            note: pitcher.note || ''
          };
        }

        // Process away team probable pitcher
        if (gameData.teams?.away?.probablePitcher) {
          const pitcher = gameData.teams.away.probablePitcher;
          console.log(`[MLB API] Getting stats for away pitcher: ${pitcher.fullName} (ID: ${pitcher.id})`);
          
          const stats = await getPitcherSeasonStatsEnhanced(pitcher.id);
          
          awayStarter = {
            id: pitcher.id,
            fullName: pitcher.fullName || `${pitcher.firstName} ${pitcher.lastName}`.trim(),
            firstName: pitcher.firstName || '',
            lastName: pitcher.lastName || '',
            number: pitcher.jerseyNumber || '',
            team: gameData.teams.away.team?.name || '',
            stats: {},
            seasonStats: stats,
            note: pitcher.note || ''
          };
        }

        if (homeStarter || awayStarter) {
          console.log(`[MLB API] Found probable pitchers from schedule endpoint`);
          console.log(`[MLB API] Home: ${homeStarter?.fullName || 'TBD'}, Away: ${awayStarter?.fullName || 'TBD'}`);
          
          return {
            home: homeStarter,
            away: awayStarter,
            homeStarter: homeStarter,
            awayStarter: awayStarter
          };
        }
      }

      // Fallback to the live endpoint if schedule endpoint doesn't work
      console.log(`[MLB API] Trying live endpoint as fallback for game ${gamePk}`);
      const liveResponse = await axios.get(`${MLB_API_BASE_URL}/game/${gamePk}/feed/live`, {
        headers: {
          'Accept': 'application/json'
          // User-Agent header removed to avoid browser security restrictions
        },
        timeout: 5000 // Shorter timeout for fallback
      }).catch(error => {
        console.log(`[MLB API] Live feed error: ${error.message}`);
        return null;
      });

      if (liveResponse?.data?.gameData) {
        const gameData = liveResponse.data.gameData;
        let homeProbablePitcher = gameData.probablePitchers?.home || 
                                gameData.teams?.home?.probablePitcher;
        let awayProbablePitcher = gameData.probablePitchers?.away || 
                                gameData.teams?.away?.probablePitcher;

        if (homeProbablePitcher || awayProbablePitcher) {
          console.log(`[MLB API] Found probable pitchers from live feed`);
          
          // Process pitchers
          let homeStarter = null;
          if (homeProbablePitcher) {
            console.log(`[MLB API] Getting stats for home pitcher: ${homeProbablePitcher.fullName} (ID: ${homeProbablePitcher.id})`);
            
            const stats = await getPitcherSeasonStatsEnhanced(homeProbablePitcher.id);
            
            homeStarter = {
              id: homeProbablePitcher.id,
              fullName: homeProbablePitcher.fullName || 
                       `${homeProbablePitcher.firstName || ''} ${homeProbablePitcher.lastName || ''}`.trim(),
              firstName: homeProbablePitcher.firstName || '',
              lastName: homeProbablePitcher.lastName || '',
              number: homeProbablePitcher.jerseyNumber || '',
              team: gameData.teams?.home?.name || '',
              stats: {},
              seasonStats: stats
            };
          }
          
          let awayStarter = null;
          if (awayProbablePitcher) {
            console.log(`[MLB API] Getting stats for away pitcher: ${awayProbablePitcher.fullName} (ID: ${awayProbablePitcher.id})`);
            
            const stats = await getPitcherSeasonStatsEnhanced(awayProbablePitcher.id);
            
            awayStarter = {
              id: awayProbablePitcher.id,
              fullName: awayProbablePitcher.fullName || 
                       `${awayProbablePitcher.firstName || ''} ${awayProbablePitcher.lastName || ''}`.trim(),
              firstName: awayProbablePitcher.firstName || '',
              lastName: awayProbablePitcher.lastName || '',
              number: awayProbablePitcher.jerseyNumber || '',
              team: gameData.teams?.away?.name || '',
              stats: {},
              seasonStats: stats
            };
          }
          
          return {
            home: homeStarter,
            away: awayStarter,
            homeStarter,
            awayStarter
          };
        }
      }
      
      // If game feed didn't work, try schedule API as fallback with different parameters
      console.log(`[MLB API] No probable pitchers in game feed, trying schedule API with different parameters`);
      const fallbackScheduleResponse = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
        params: {
          sportId: 1,
          gamePk: gamePk,
          hydrate: 'probablePitcher,person,stats',
        }
      });
      
      if (!fallbackScheduleResponse.data || !fallbackScheduleResponse.data.dates || !fallbackScheduleResponse.data.dates[0] || !fallbackScheduleResponse.data.dates[0].games || !fallbackScheduleResponse.data.dates[0].games[0]) {
        console.log(`[MLB API] No game data found for game ${gamePk} in fallback schedule API`);
        return { home: null, away: null, homeStarter: null, awayStarter: null };
      }
      
      const game = fallbackScheduleResponse.data.dates[0].games[0];
      
      // Check if probable pitchers exist in the data
      if (!game.teams || (!game.teams.home.probablePitcher && !game.teams.away.probablePitcher)) {
        console.log(`[MLB API] No probable pitchers listed for game ${gamePk}`);
        return { home: null, away: null, homeStarter: null, awayStarter: null };
      }
      
      // Process home starter
      let homeStarter = null;
      if (game.teams.home.probablePitcher) {
        const pitcher = game.teams.home.probablePitcher;
        console.log(`[MLB API] Found home probable pitcher: ${pitcher.fullName} (${pitcher.id})`);
        
        const stats = await getPitcherSeasonStatsEnhanced(pitcher.id);
        
        homeStarter = {
          id: pitcher.id,
          fullName: pitcher.fullName,
          firstName: pitcher.firstName || '',
          lastName: pitcher.lastName || '',
          number: pitcher.jerseyNumber || '',
          team: game.teams.home.team.name,
          stats: {},
          seasonStats: stats
        };
      }
      
      // Process away starter
      let awayStarter = null;
      if (game.teams.away.probablePitcher) {
        const pitcher = game.teams.away.probablePitcher;
        console.log(`[MLB API] Found away probable pitcher: ${pitcher.fullName} (${pitcher.id})`);
        
        const stats = await getPitcherSeasonStatsEnhanced(pitcher.id);
        
        awayStarter = {
          id: pitcher.id,
          fullName: pitcher.fullName,
          firstName: pitcher.firstName || '',
          lastName: pitcher.lastName || '',
          number: pitcher.jerseyNumber || '',
          team: game.teams.away.team.name,
          stats: {},
          seasonStats: stats
        };
      }
      
      return {
        home: homeStarter,
        away: awayStarter,
        homeStarter,  // Include for backward compatibility
        awayStarter   // Include for backward compatibility
      };
    } catch (error) {
      console.error(`[MLB API] Error getting enhanced starting pitchers for game ${gamePk}:`, error.message);
      return { home: null, away: null, homeStarter: null, awayStarter: null };
    }
  },
  
  /**
   * Gets games for a date with enhanced data including starting pitchers
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of game objects with enhanced data
   */
  getGamesWithStartingPitchers: async (date = new Date().toISOString().slice(0, 10)) => {
    try {
      console.log(`[MLB API] Getting games with starting pitchers for ${date}`);
      
      // Use the schedule API with full hydration for comprehensive game data
      const response = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
        params: {
          sportId: 1,
          date: date,
          hydrate: 'team,probablePitcher,person,stats'
        }
      });
      
      if (!response.data || !response.data.dates || !response.data.dates[0] || !response.data.dates[0].games) {
        console.log(`[MLB API] No games found for ${date}`);
        return [];
      }
      
      const games = response.data.dates[0].games;
      console.log(`[MLB API] Found ${games.length} games for ${date} with enhanced data`);
      
      // For each game, add the starting pitcher information with stats
      for (const game of games) {
        // Log what we found for debugging
        const homeProbable = game.teams?.home?.probablePitcher?.fullName || 'TBD';
        const awayProbable = game.teams?.away?.probablePitcher?.fullName || 'TBD';
        console.log(`[MLB API] Game ${game.gamePk}: ${game.teams.away.team.name} @ ${game.teams.home.team.name}`);
        console.log(`[MLB API] Probable pitchers: Away: ${awayProbable}, Home: ${homeProbable}`);
        
        // Get enhanced pitcher data with stats
        let homePitcherWithStats = null;
        let awayPitcherWithStats = null;
        
        if (game.teams.home.probablePitcher) {
          const pitcher = game.teams.home.probablePitcher;
          const stats = await getPitcherSeasonStatsEnhanced(pitcher.id);
          homePitcherWithStats = {
            ...pitcher,
            seasonStats: stats
          };
          console.log(`[MLB API] Retrieved stats for home pitcher ${pitcher.fullName}:`, stats);
        }
        
        if (game.teams.away.probablePitcher) {
          const pitcher = game.teams.away.probablePitcher;
          const stats = await getPitcherSeasonStatsEnhanced(pitcher.id);
          awayPitcherWithStats = {
            ...pitcher,
            seasonStats: stats
          };
          console.log(`[MLB API] Retrieved stats for away pitcher ${pitcher.fullName}:`, stats);
        }
        
        game.enhancedData = {
          homeProbablePitcher: homePitcherWithStats,
          awayProbablePitcher: awayPitcherWithStats
        };
      }
      
      return games;
    } catch (error) {
      console.error(`[MLB API] Error getting games with starting pitchers for ${date}:`, error.message);
      return [];
    }
  },
  
  /**
   * Override the original service's getStartingPitchers to use enhanced version
   */
  getStartingPitchers: async (gamePk) => {
    return mlbStatsApiService.getStartingPitchersEnhanced(gamePk);
  },

  async checkPropOutcome(prop) {
    // Implement logic to verify if player achieved the prop (e.g., hit HR) based on box score
    // For now, return random boolean for testing
    return Math.random() > 0.5;
  }
};

export { mlbStatsApiService };
