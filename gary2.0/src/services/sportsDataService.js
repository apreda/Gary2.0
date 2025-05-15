import axios from 'axios';
import { oddsService } from './oddsService';

// Import Ball Don't Lie service for enhanced statistics
import ballDontLieService from './ballDontLieService';

/**
 * Service for fetching and processing sports data from TheSportsDB API and Ball Don't Lie API
 */
export const sportsDataService = {
  // API configuration - Using direct API access with paid API key for enhanced reliability
  API_BASE_URL: 'https://www.thesportsdb.com/api/v1/json',
  API_KEY: import.meta.env?.VITE_THESPORTSDB_API_KEY || '3', // Use environment variable or fall back to free tier
  
  /**
   * Convert league names to TheSportsDB format
   * @param {string} league - League name from Gary's system (NBA, MLB, etc.)
   * @returns {string} - League name in TheSportsDB format
   */
  mapLeagueToSportsDBFormat: (league) => {
    const leagueMap = {
      'NBA': 'NBA',
      'MLB': 'MLB',
      'NHL': 'NHL',
      'NFL': 'NFL',
      'EURO': 'English Premier League' // Default to EPL for European soccer
    };
    return leagueMap[league] || league;
  },
  
  /**
   * Search for a team by name
   * @param {string} teamName - Team name to search for
   * @returns {Promise<Object>} - Team data
   */
  getTeamData: async (teamName) => {
    try {
      console.log(`TheSportsDB API: Fetching team data for ${teamName}`);
      // Direct API call for better reliability in production
      const response = await axios.get(`${sportsDataService.API_BASE_URL}/${sportsDataService.API_KEY}/searchteams.php`, {
        params: { 
          t: teamName 
        }
      }).catch(error => {
        console.error(`TheSportsDB API: Error fetching team data for ${teamName}:`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        return { data: { teams: [] } }; // Return empty result for error case
      });
      
      if (response.data && response.data.teams && response.data.teams.length > 0) {
        return response.data.teams[0];
      } else {
        console.log(`TheSportsDB API: No data found for team: ${teamName}`);
        return null;
      }
    } catch (error) {
      console.error(`TheSportsDB API: Error fetching team data for ${teamName}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get a team's last 5 events
   * @param {string} teamId - Team ID from TheSportsDB
   * @returns {Promise<Array>} - Last 5 events
   */
  getTeamLastEvents: async (teamId, limit = 5) => {
    try {
      // Direct API call for better reliability in production
      const response = await axios.get(`${sportsDataService.API_BASE_URL}/${sportsDataService.API_KEY}/eventslast.php`, {
        params: { 
          id: teamId 
        }
      }).catch(error => {
        console.error(`TheSportsDB API: Error fetching recent events for team ID ${teamId}:`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        return { data: { results: [] } }; // Return empty result for error case
      });
      
      if (response.data && response.data.results) {
        return response.data.results.slice(0, limit); // Return only the specified number of events
      } else {
        console.log(`TheSportsDB API: No recent events found for team ID: ${teamId}`);
        return [];
      }
    } catch (error) {
      console.error(`TheSportsDB API: Error fetching recent events for team ID ${teamId}:`, error.message);
      return [];
    }
  },
  
  /**
   * Get a team's next 5 events
   * @param {string} teamId - Team ID from TheSportsDB
   * @returns {Promise<Array>} - Next 5 events
   */
  getTeamNextEvents: async (teamId) => {
    try {
      const response = await axios.get(
        `${sportsDataService.API_BASE_URL}/${sportsDataService.API_KEY}/eventsnext.php`,
        {
          params: {
            id: teamId
          }
        }
      ).catch(error => {
        console.error(`TheSportsDB API: Error fetching next events for team ${teamId}:`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        return { data: { events: [] } }; // Return empty result for error case
      });
      
      if (response.data && response.data.events) {
        return response.data.events;
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching next events for team ${teamId}:`, error);
      return [];
    }
  },
  
  /**
   * Get league standings
   * @param {string} leagueName - League name (NBA, MLB, etc.)
   * @returns {Promise<Array>} - League standings
   */
  getLeagueStandings: async (leagueName) => {
    try {
      const mappedLeague = sportsDataService.mapLeagueToSportsDBFormat(leagueName);
      // Direct API call for better reliability in production
      const response = await axios.get(`${sportsDataService.API_BASE_URL}/${sportsDataService.API_KEY}/lookuptable.php`, {
        params: { 
          l: mappedLeague 
        }
      }).catch(error => {
        console.error(`TheSportsDB API: Error fetching standings for ${leagueName}:`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        return { data: { table: [] } }; // Return empty result for error case
      });
      
      if (response.data && response.data.table) {
        return response.data.table;
      }
      
      return [];
    } catch (error) {
      console.error(`TheSportsDB API: Error fetching standings for ${leagueName}:`, error.message);
      return [];
    }
  },
  
  /**
   * Generate comprehensive team stats for use in OpenAI prompts
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} league - League name
   * @returns {Promise<Object>} - Enhanced game data with team stats
   */
  generateTeamStatsForGame: async (homeTeam, awayTeam, league) => {
    try {
      console.log(`TheSportsDB API: Generating team stats for ${homeTeam} vs ${awayTeam} (${league})`);
      
      // Get team data with fallback to previous season if current season fails
      let homeTeamData, awayTeamData;
      let currentSeason = new Date().getFullYear();
      
      try {
        homeTeamData = await sportsDataService.getTeamData(homeTeam);
        awayTeamData = await sportsDataService.getTeamData(awayTeam);
      } catch (error) {
        console.error(`Failed to get current season data, trying previous season...`);
        currentSeason--;
        homeTeamData = await sportsDataService.getTeamData(homeTeam);
        awayTeamData = await sportsDataService.getTeamData(awayTeam);
      }
      
      if (!homeTeamData || !awayTeamData) {
        console.error(`TheSportsDB API: Could not find team data for ${homeTeam} and/or ${awayTeam}. This will affect pick quality.`);
        return {
          homeTeamStats: null,
          awayTeamStats: null,
          statsAvailable: false
        };
      }
      
      // Get recent results for both teams with season context
      const homeTeamEvents = await sportsDataService.getTeamLastEvents(homeTeamData.idTeam);
      const awayTeamEvents = await sportsDataService.getTeamLastEvents(awayTeamData.idTeam);
      
      // If no recent events found, try previous season's data
      if (!homeTeamEvents.length || !awayTeamEvents.length) {
        console.log('No recent events found, trying previous season data...');
        currentSeason--;
        const prevHomeTeamData = await sportsDataService.getTeamData(homeTeam);
        const prevAwayTeamData = await sportsDataService.getTeamData(awayTeam);
        
        if (prevHomeTeamData && prevAwayTeamData) {
          homeTeamEvents.push(...await sportsDataService.getTeamLastEvents(prevHomeTeamData.idTeam));
          awayTeamEvents.push(...await sportsDataService.getTeamLastEvents(prevAwayTeamData.idTeam));
        }
      }
      
      // Calculate win-loss record from recent games
      const calculateRecentRecord = (events) => {
        if (!events || events.length === 0) return { wins: 0, losses: 0, form: "Unknown" };
        
        const wins = events.filter(event => {
          const teamScore = parseInt(event.intHomeScore) || 0;
          const opponentScore = parseInt(event.intAwayScore) || 0;
          return teamScore > opponentScore;
        }).length;
        
        return {
          wins,
          losses: events.length - wins,
          form: `${wins}-${events.length - wins} in last ${events.length} games`
        };
      };
      
      // Create enhanced stats object with more detailed statistics by sport type
      const homeTeamStats = {
        id: homeTeamData.idTeam,
        name: homeTeamData.strTeam,
        formed: homeTeamData.intFormedYear,
        stadium: homeTeamData.strStadium,
        recentForm: calculateRecentRecord(homeTeamEvents),
        description: homeTeamData.strDescriptionEN?.substring(0, 200) || "No description available",
        detailedStats: {}
      };
      
      const awayTeamStats = {
        id: awayTeamData.idTeam,
        name: awayTeamData.strTeam,
        formed: awayTeamData.intFormedYear,
        stadium: awayTeamData.strStadium,
        recentForm: calculateRecentRecord(awayTeamEvents),
        description: awayTeamData.strDescriptionEN?.substring(0, 200) || "No description available",
        detailedStats: {}
      };
      
      // Add sport-specific detailed statistics
      if (league === 'MLB') {
        // Extract and add detailed MLB stats
        try {
          // Parse team performance from recent events
          const extractMLBStats = (events) => {
            const runs = events.map(e => parseInt(e.intHomeScore) || 0);
            const runsAllowed = events.map(e => parseInt(e.intAwayScore) || 0);
            
            return {
              avgRuns: (runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(2),
              avgRunsAllowed: (runsAllowed.reduce((a, b) => a + b, 0) / runsAllowed.length).toFixed(2),
              lastGameScore: events.length > 0 ? `${runs[0]}-${runsAllowed[0]}` : 'N/A',
              winStreak: calculateWinStreak(events),
              record: homeTeamData.strLeague?.includes('American') ? 
                `${homeTeamData.strLeague} (${homeTeamData.strDivision})` : homeTeamData.strLeague || 'Unknown'
            };
          };
          
          homeTeamStats.detailedStats = extractMLBStats(homeTeamEvents);
          awayTeamStats.detailedStats = extractMLBStats(awayTeamEvents);
          
          // Additional MLB-specific data (e.g., starting pitchers would ideally come here)
          homeTeamStats.detailedStats.startingPitcherNote = "Starting pitcher data not available through current API";
          awayTeamStats.detailedStats.startingPitcherNote = "Starting pitcher data not available through current API";
        } catch (error) {
          console.error('Error extracting detailed MLB stats:', error.message);
        }
      } else if (league === 'NBA') {
        // Extract and add detailed NBA stats
        try {
          const extractNBAStats = (events) => {
            const points = events.map(e => parseInt(e.intHomeScore) || 0);
            const pointsAllowed = events.map(e => parseInt(e.intAwayScore) || 0);
            
            return {
              avgPoints: (points.reduce((a, b) => a + b, 0) / points.length).toFixed(1),
              avgPointsAllowed: (pointsAllowed.reduce((a, b) => a + b, 0) / pointsAllowed.length).toFixed(1),
              lastGameScore: events.length > 0 ? `${points[0]}-${pointsAllowed[0]}` : 'N/A',
              conference: homeTeamData.strLeague || 'Unknown',
              winStreak: calculateWinStreak(events)
            };
          };
          
          homeTeamStats.detailedStats = extractNBAStats(homeTeamEvents);
          awayTeamStats.detailedStats = extractNBAStats(awayTeamEvents);
        } catch (error) {
          console.error('Error extracting detailed NBA stats:', error.message);
        }
      } else if (league === 'NHL') {
        // Extract and add detailed NHL stats
        try {
          const extractNHLStats = (events) => {
            const goals = events.map(e => parseInt(e.intHomeScore) || 0);
            const goalsAllowed = events.map(e => parseInt(e.intAwayScore) || 0);
            
            return {
              avgGoals: (goals.reduce((a, b) => a + b, 0) / goals.length).toFixed(1),
              avgGoalsAllowed: (goalsAllowed.reduce((a, b) => a + b, 0) / goalsAllowed.length).toFixed(1),
              lastGameScore: events.length > 0 ? `${goals[0]}-${goalsAllowed[0]}` : 'N/A',
              conference: homeTeamData.strLeague || 'Unknown',
              winStreak: calculateWinStreak(events)
            };
          };
          
          homeTeamStats.detailedStats = extractNHLStats(homeTeamEvents);
          awayTeamStats.detailedStats = extractNHLStats(awayTeamEvents);
        } catch (error) {
          console.error('Error extracting detailed NHL stats:', error.message);
        }
      }
      
      // Helper function to calculate win streak
      function calculateWinStreak(events) {
        if (!events || events.length === 0) return 'No recent games';
        
        let streak = 0;
        for (const event of events) {
          const teamScore = parseInt(event.intHomeScore) || 0;
          const opponentScore = parseInt(event.intAwayScore) || 0;
          
          if (teamScore > opponentScore) {
            streak++;
          } else {
            break;
          }
        }
        
        return streak > 0 ? `${streak} game winning streak` : 'No current streak';
      }
      
      return {
        homeTeamStats,
        awayTeamStats,
        statsAvailable: true
      };
    } catch (error) {
      console.error('Error generating team stats:', error);
      return {
        homeTeamStats: null,
        awayTeamStats: null,
        statsAvailable: false
      };
    }
  },
  
  /**
   * Format team stats for OpenAI prompt
   * @param {Object} gameStats - Team stats object from generateTeamStatsForGame
   * @returns {string} - Formatted stats string for OpenAI prompt
   */
  formatStatsForPrompt: (gameStats) => {
    if (!gameStats || !gameStats.statsAvailable) {
      console.warn('TheSportsDB API: No stats available for OpenAI prompt.');
      return 'NOTE: Current team statistics unavailable - using historical data only.';
    }
    
    const { homeTeamStats, awayTeamStats } = gameStats;
    
    // Get current season and previous season for fallback
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const season = currentYear; // Default to current season
    
    // Attempt to get team stats
    try {
      // Get team season stats for current season
      const response = await axios.get(`https://api.balldontlie.io/mlb/v1/teams`, {
        headers: { 'Authorization': ballDontLieService.getApiKey() },
        params: { per_page: 100 }
      });
      
      if (response.data && response.data.data) {
        const teams = response.data.data;
        
        // Find home and away teams by name (with fuzzy matching)
        const homeTeamData = teams.find(team => 
          team.display_name.includes(homeTeam) || 
          homeTeam.includes(team.name) ||
          homeTeam.includes(team.location));
        
        const awayTeamData = teams.find(team => 
          team.display_name.includes(awayTeam) || 
          awayTeam.includes(team.name) ||
          awayTeam.includes(team.location));
        
        if (homeTeamData) {
          // Get team season stats
          try {
            const homeTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { 
                season: season, // Use determined season
                'team_id[]': [homeTeamData.id], // Correct array parameter format
                postseason: false
              }
            });
            
            if (homeTeamStatsResponse.data && homeTeamStatsResponse.data.data && homeTeamStatsResponse.data.data[0]) {
              enhancedStats.home.detailedStats = homeTeamStatsResponse.data.data[0];
              enhancedStats.home.teamId = homeTeamData.id;
              enhancedStats.home.league = `${homeTeamData.league} League ${homeTeamData.division} Division`;
            }
          } catch (error) {
            console.error(`Error getting home team stats: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
            // Try with previous season as fallback
            try {
              console.log(`Attempting fallback to previous season ${previousYear} for home team...`);
              const homeTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  season: previousYear,
                  'team_id[]': homeTeamData.id, // Correct array parameter format
                  postseason: false
                }
              });
              
              if (homeTeamStatsResponse.data && homeTeamStatsResponse.data.data && homeTeamStatsResponse.data.data[0]) {
                enhancedStats.home.detailedStats = homeTeamStatsResponse.data.data[0];
                enhancedStats.home.teamId = homeTeamData.id;
                enhancedStats.home.league = `${homeTeamData.league} League ${homeTeamData.division} Division`;
              }
            } catch (fallbackError) {
              console.error(`Fallback attempt for home team also failed: ${fallbackError.message}`);
            }
          }
        }
        
        if (awayTeamData) {
          // Get team season stats
          try {
            const awayTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { 
                season: season, // Use determined season
                'team_id[]': awayTeamData.id, // Correct array parameter format
                postseason: false
              }
            });
            
            if (awayTeamStatsResponse.data && awayTeamStatsResponse.data.data && awayTeamStatsResponse.data.data[0]) {
              enhancedStats.away.detailedStats = awayTeamStatsResponse.data.data[0];
              enhancedStats.away.teamId = awayTeamData.id;
              enhancedStats.away.league = `${awayTeamData.league} League ${awayTeamData.division} Division`;
            }
          } catch (error) {
            console.error(`Error getting away team stats: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
            // Try with previous season as fallback
            try {
              console.log(`Attempting fallback to previous season ${previousYear} for away team...`);
              const awayTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  season: previousYear,
                  'team_id[]': awayTeamData.id, // Correct array parameter format
                  postseason: false
                }
              });
              
              if (awayTeamStatsResponse.data && awayTeamStatsResponse.data.data && awayTeamStatsResponse.data.data[0]) {
                enhancedStats.away.detailedStats = awayTeamStatsResponse.data.data[0];
                enhancedStats.away.teamId = awayTeamData.id;
                enhancedStats.away.league = `${awayTeamData.league} League ${awayTeamData.division} Division`;
              }
            } catch (fallbackError) {
              console.error(`Fallback attempt for away team also failed: ${fallbackError.message}`);
            }
          }
                if (pitchers.length > 0) {
                  // Get most recent pitcher stats
                  const topPitcher = pitchers[0]; // Ideally we'd identify the actual starting pitcher
                  enhancedStats.startingPitchers.home = {
                    name: `${topPitcher.first_name} ${topPitcher.last_name}`,
                    position: topPitcher.position
                  };
                  
                  // Try to get pitcher stats
                  try {
                    const pitcherStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/season_stats`, {
                      headers: { 'Authorization': ballDontLieService.getApiKey() },
                      params: { 
                        season: season, // Use determined season
                        'player_ids[]': topPitcher.id, // Correct format for array parameters
                        postseason: false
                      }
                    });
                    
                    if (pitcherStatsResponse.data && pitcherStatsResponse.data.data && pitcherStatsResponse.data.data[0]) {
                      enhancedStats.startingPitchers.home.stats = pitcherStatsResponse.data.data[0];
                    }
                  } catch (error) {
                    console.error(`Error getting home pitcher stats: ${error.message}`);
                    console.error(`Response data:`, error.response?.data);
                    console.error(`Status code:`, error.response?.status);
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting home team pitchers: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
          }
          
          // Same for away team pitchers
          if (enhancedStats.away.teamId) {
            try {
              // Get team players
              const awayPitchersResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/players`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  'team_ids[]': enhancedStats.away.teamId, // Correct format for array parameters
                  per_page: 100
                }
              });
              
              if (awayPitchersResponse.data && awayPitchersResponse.data.data) {
                const pitchers = awayPitchersResponse.data.data.filter(player => 
                  player.position && player.position.includes('Pitcher'));
                
                if (pitchers.length > 0) {
                  // Get most recent pitcher stats
                  const topPitcher = pitchers[0]; // Ideally we'd identify the actual starting pitcher
                  enhancedStats.startingPitchers.away = {
                    name: `${topPitcher.first_name} ${topPitcher.last_name}`,
                    position: topPitcher.position
                  };
                  
                  // Try to get pitcher stats
                  try {
                    const pitcherStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/season_stats`, {
                      headers: { 'Authorization': ballDontLieService.getApiKey() },
                      params: { 
                        season: season, // Use determined season
                        'player_ids[]': topPitcher.id, // Correct format for array parameters
                        postseason: false
                      }
                    });
                    
                    if (pitcherStatsResponse.data && pitcherStatsResponse.data.data && pitcherStatsResponse.data.data[0]) {
                      enhancedStats.startingPitchers.away.stats = pitcherStatsResponse.data.data[0];
                    }
                  } catch (error) {
                    console.error(`Error getting away pitcher stats: ${error.message}`);
                    console.error(`Response data:`, error.response?.data);
                    console.error(`Status code:`, error.response?.status);
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting away team pitchers: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching MLB team data: ${error.message}`);
        console.error(`Response data:`, error.response?.data);
        console.error(`Status code:`, error.response?.status);
      }
      
      return enhancedStats;
    } catch (error) {
      console.error(`Error getting enhanced MLB stats: ${error.message}`);
      return { home: { team: homeTeam }, away: { team: awayTeam }, startingPitchers: {} };
    }
  },
  
  /**
   * Get enhanced NBA statistics from Ball Don't Lie API
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} - Detailed NBA statistics
   */
  getEnhancedNBAStats: async (homeTeam, awayTeam) => {
    try {
      console.log(`Getting enhanced NBA stats for ${homeTeam} vs ${awayTeam} from Ball Don't Lie API...`);
      
      // Create a basic stats object
      const enhancedStats = {
        home: { team: homeTeam, detailedStats: {}, keyPlayers: [] },
        away: { team: awayTeam, detailedStats: {}, keyPlayers: [] }
      };
      
      // Get current season and previous season for fallback
      const currentYear = new Date().getFullYear();
      const previousYear = currentYear - 1;
      const season = currentYear; // Default to current season
      
      // Attempt to get team stats
      try {
        // Get all NBA teams
        const response = await axios.get(`https://api.balldontlie.io/v1/teams`, {
          headers: { 'Authorization': ballDontLieService.getApiKey() }
        });
        
        if (response.data && response.data.data) {
          const teams = response.data.data;
          
          // Find home and away teams by name (with fuzzy matching)
          const homeTeamData = teams.find(team => 
            team.full_name.includes(homeTeam) || 
            homeTeam.includes(team.name) ||
            homeTeam.includes(team.city));
          
          const awayTeamData = teams.find(team => 
            team.full_name.includes(awayTeam) || 
            awayTeam.includes(team.name) ||
            awayTeam.includes(team.city));
          
          // Get team standings for current season
          if (homeTeamData) {
            enhancedStats.home.teamId = homeTeamData.id;
            enhancedStats.home.conference = homeTeamData.conference;
            enhancedStats.home.division = homeTeamData.division;
            
            // Try to get team standings
            try {
              const standingsResponse = await axios.get(`https://api.balldontlie.io/v1/standings`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { season: season } // Use consistent season variable
              });
              
              if (standingsResponse.data && standingsResponse.data.data) {
                const homeStanding = standingsResponse.data.data.find(standing => 
                  standing.team.id === homeTeamData.id);
                
                if (homeStanding) {
                  enhancedStats.home.detailedStats = {
                    wins: homeStanding.wins,
                    losses: homeStanding.losses,
                    winPercent: homeStanding.win_percent,
                    conferenceRank: homeStanding.conference_rank,
                    divisionRank: homeStanding.division_rank,
                    homeRecord: homeStanding.home_record,
                    awayRecord: homeStanding.road_record,
                    lastTenGames: homeStanding.last_ten_games
                  };
                }
              }
            } catch (error) {
              console.error(`Error getting NBA standings: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
            
            // Get key players for home team
            try {
              const playersResponse = await axios.get(`https://api.balldontlie.io/v1/players`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  'team_ids[]': [homeTeamData.id], // Correct format for array parameters
                  per_page: 25 // Get top players
                }
              });
              
              if (playersResponse.data && playersResponse.data.data) {
                const players = playersResponse.data.data;
                enhancedStats.home.keyPlayers = players.slice(0, 5).map(player => ({
                  id: player.id,
                  name: `${player.first_name} ${player.last_name}`,
                  position: player.position,
                  stats: {}
                }));
                
                // Try to get season averages for key players
                if (enhancedStats.home.keyPlayers.length > 0) {
                  const playerIds = enhancedStats.home.keyPlayers.map(p => p.id);
                  
                  try {
                    // For multiple player IDs, we need to format each one properly
                    const playerIdParams = {};
                    // Pass player IDs directly as an array
playerIdParams['player_ids[]'] = playerIds;
                    
                    const statsResponse = await axios.get(`https://api.balldontlie.io/v1/season_averages/general`, {
                      headers: { 'Authorization': ballDontLieService.getApiKey() },
                      params: { 
                        season: season, // Use consistent season variable
                        season_type: 'regular',
                        type: 'base',
                        'player_ids[]': playerIds // Pass array directly
                      }
                    });
                    
                    if (statsResponse.data && statsResponse.data.data) {
                      statsResponse.data.data.forEach(playerStat => {
                        const player = enhancedStats.home.keyPlayers.find(p => p.id === playerStat.player.id);
                        if (player) {
                          player.stats = playerStat.stats;
                        }
                      });
                    }
                  } catch (error) {
                    console.error(`Error getting player stats: ${error.message}`);
                    console.error(`Response data:`, error.response?.data);
                    console.error(`Status code:`, error.response?.status);
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting home team players: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
          }
          
          // Same process for away team
          if (awayTeamData) {
            enhancedStats.away.teamId = awayTeamData.id;
            enhancedStats.away.conference = awayTeamData.conference;
            enhancedStats.away.division = awayTeamData.division;
            
            // Try to get team standings
            try {
              const standingsResponse = await axios.get(`https://api.balldontlie.io/v1/standings`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { season: season } // Use consistent season variable
              });
              
              if (standingsResponse.data && standingsResponse.data.data) {
                const awayStanding = standingsResponse.data.data.find(standing => 
                  standing.team.id === awayTeamData.id);
                
                if (awayStanding) {
                  enhancedStats.away.detailedStats = {
                    wins: awayStanding.wins,
                    losses: awayStanding.losses,
                    winPercent: awayStanding.win_percent,
                    conferenceRank: awayStanding.conference_rank,
                    divisionRank: awayStanding.division_rank,
                    homeRecord: awayStanding.home_record,
                    awayRecord: awayStanding.road_record,
                    lastTenGames: awayStanding.last_ten_games
                  };
                }
              }
            } catch (error) {
              console.error(`Error getting NBA standings: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
            
            // Get key players for away team
            try {
              const playersResponse = await axios.get(`https://api.balldontlie.io/v1/players`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  'team_ids[]': [awayTeamData.id], // Correct format for array parameters
                  per_page: 25 // Get top players
                }
              });
              
              if (playersResponse.data && playersResponse.data.data) {
                const players = playersResponse.data.data;
                enhancedStats.away.keyPlayers = players.slice(0, 5).map(player => ({
                  id: player.id,
                  name: `${player.first_name} ${player.last_name}`,
                  position: player.position,
                  stats: {}
                }));
                
                // Try to get season averages for key players
                if (enhancedStats.away.keyPlayers.length > 0) {
                  const playerIds = enhancedStats.away.keyPlayers.map(p => p.id);
                  
                  try {
                    // For multiple player IDs, we need to format each one properly
                    const playerIdParams = {};
                    // Pass player IDs directly as an array
playerIdParams['player_ids[]'] = playerIds;
                    
                    const statsResponse = await axios.get(`https://api.balldontlie.io/v1/season_averages/general`, {
                      headers: { 'Authorization': ballDontLieService.getApiKey() },
                      params: { 
                        season: season, // Use consistent season variable
                        season_type: 'regular',
                        type: 'base',
                        'player_ids[]': playerIds // Pass array directly
                      }
                    });
                    
                    if (statsResponse.data && statsResponse.data.data) {
                      statsResponse.data.data.forEach(playerStat => {
                        const player = enhancedStats.away.keyPlayers.find(p => p.id === playerStat.player.id);
                        if (player) {
                          player.stats = playerStat.stats;
                        }
                      });
                    }
                  } catch (error) {
                    console.error(`Error getting player stats: ${error.message}`);
                    console.error(`Response data:`, error.response?.data);
                    console.error(`Status code:`, error.response?.status);
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting away team players: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching NBA team data: ${error.message}`);
        console.error(`Response data:`, error.response?.data);
        console.error(`Status code:`, error.response?.status);
      }
      
      return enhancedStats;
    } catch (error) {
      console.error(`Error getting enhanced NBA stats: ${error.message}`);
      return { home: { team: homeTeam, keyPlayers: [] }, away: { team: awayTeam, keyPlayers: [] } };
    }
  },

  /**
   * Get enhanced statistics for a game based on league
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name 
   * @param {string} league - League name (NBA, MLB, NHL)
   * @returns {Promise<Object>} - Enhanced statistics for the game
   */
  getEnhancedGameStats: async (homeTeam, awayTeam, league) => {
    try {
      console.log(`Getting enhanced game stats for ${homeTeam} vs ${awayTeam} (${league})...`);
      
      if (league === 'MLB') {
        return await sportsDataService.getEnhancedMLBStats(homeTeam, awayTeam);
      } else if (league === 'NBA') {
        return await sportsDataService.getEnhancedNBAStats(homeTeam, awayTeam);
      } else {
        // For NHL and other leagues, we'll use TheSportsDB API
        console.log(`No enhanced stats available for ${league}, using TheSportsDB data only`);
        return null;
      }
    } catch (error) {
      console.error(`Error getting enhanced game stats: ${error.message}`);
      return null;
    }
  },
  
  buildComprehensiveStatsContext: async (homeTeam, awayTeam, league, oddsData) => {
    try {
      // Get team stats from TheSportsDB
      const gameStats = await sportsDataService.generateTeamStatsForGame(homeTeam, awayTeam, league);
      
      // Try to get enhanced stats from Ball Don't Lie API
      const enhancedStats = await sportsDataService.getEnhancedGameStats(homeTeam, awayTeam, league);
      
      // Get current odds and line data
      const {
        homeOdds = 'N/A',
        awayOdds = 'N/A',
        pointSpread = 'N/A',
        totalPoints = 'N/A',
        openingHomeOdds = 'N/A',
        openingAwayOdds = 'N/A',
        openingSpread = 'N/A',
        publicBetPercentageHome = 50,
        publicBetPercentageAway = 50,
        lineMovement = 'No significant movement',
        sharpAction = 'No clear sharp action detected'
      } = oddsData || {};

      // Format line movement description
      const lineMovementDescription = lineMovement === 'No significant movement' ? 
        lineMovement : 
        `Line moved from ${openingSpread} to ${pointSpread}`;
      
      // Generate comprehensive detailed stats content based on sport
      let detailedStatsContent = '';
      
      // Add enhanced Ball Don't Lie API stats if available
      if (enhancedStats) {
        if (league === 'MLB') {
          const homeStats = enhancedStats.home.detailedStats;
          const awayStats = enhancedStats.away.detailedStats;
          
          detailedStatsContent = `
📊 ENHANCED MLB TEAM STATISTICS (VERIFIED DATA)

${homeTeam} STATS:
${enhancedStats.home.league ? `- League: ${enhancedStats.home.league}` : ''}
- Team Batting Average: ${homeStats.batting_avg?.toFixed(3) || 'N/A'}
- Team OPS: ${homeStats.batting_ops?.toFixed(3) || 'N/A'}
- Team ERA: ${homeStats.pitching_era?.toFixed(2) || 'N/A'}
- Total Home Runs: ${homeStats.batting_hr || 'N/A'} 
- WHIP: ${homeStats.pitching_whip?.toFixed(2) || 'N/A'}
- Season Record: ${homeStats.pitching_w || 0}-${homeStats.pitching_l || 0}

${awayTeam} STATS:
${enhancedStats.away.league ? `- League: ${enhancedStats.away.league}` : ''}
- Team Batting Average: ${awayStats.batting_avg?.toFixed(3) || 'N/A'}
- Team OPS: ${awayStats.batting_ops?.toFixed(3) || 'N/A'}
- Team ERA: ${awayStats.pitching_era?.toFixed(2) || 'N/A'}
- Total Home Runs: ${awayStats.batting_hr || 'N/A'} 
- WHIP: ${awayStats.pitching_whip?.toFixed(2) || 'N/A'}
- Season Record: ${awayStats.pitching_w || 0}-${awayStats.pitching_l || 0}
`;
          
          // Add starting pitcher information if available
          if (enhancedStats.startingPitchers.home && enhancedStats.startingPitchers.home.name) {
            const homePitcher = enhancedStats.startingPitchers.home;
            const homePitcherStats = homePitcher.stats;
            
            detailedStatsContent += `
HOME STARTING PITCHER: ${homePitcher.name}
`;
            if (homePitcherStats) {
              detailedStatsContent += `- ERA: ${homePitcherStats.pitching_era?.toFixed(2) || 'N/A'}
`;
              detailedStatsContent += `- Record: ${homePitcherStats.pitching_w || 0}-${homePitcherStats.pitching_l || 0}
`;
              detailedStatsContent += `- WHIP: ${homePitcherStats.pitching_whip?.toFixed(2) || 'N/A'}
`;
              detailedStatsContent += `- K/9: ${homePitcherStats.pitching_k_per_9?.toFixed(1) || 'N/A'}
`;
            }
          }
          
          if (enhancedStats.startingPitchers.away && enhancedStats.startingPitchers.away.name) {
            const awayPitcher = enhancedStats.startingPitchers.away;
            const awayPitcherStats = awayPitcher.stats;
            
            detailedStatsContent += `
AWAY STARTING PITCHER: ${awayPitcher.name}
`;
            if (awayPitcherStats) {
              detailedStatsContent += `- ERA: ${awayPitcherStats.pitching_era?.toFixed(2) || 'N/A'}
`;
              detailedStatsContent += `- Record: ${awayPitcherStats.pitching_w || 0}-${awayPitcherStats.pitching_l || 0}
`;
              detailedStatsContent += `- WHIP: ${awayPitcherStats.pitching_whip?.toFixed(2) || 'N/A'}
`;
              detailedStatsContent += `- K/9: ${awayPitcherStats.pitching_k_per_9?.toFixed(1) || 'N/A'}
`;
            }
          }
        } 
        else if (league === 'NBA') {
          const homeStats = enhancedStats.home.detailedStats;
          const awayStats = enhancedStats.away.detailedStats;
          
          detailedStatsContent = `
📊 ENHANCED NBA TEAM STATISTICS (VERIFIED DATA)

${homeTeam} STATS:
- Record: ${homeStats.wins || 0}-${homeStats.losses || 0}
- Win Percentage: ${(homeStats.winPercent || 0).toFixed(3)}
- Conference Rank: ${homeStats.conferenceRank || 'N/A'}
- Home Record: ${homeStats.homeRecord || 'N/A'}
- Away Record: ${homeStats.awayRecord || 'N/A'}
- Last 10 Games: ${homeStats.lastTenGames || 'N/A'}

${awayTeam} STATS:
- Record: ${awayStats.wins || 0}-${awayStats.losses || 0}
- Win Percentage: ${(awayStats.winPercent || 0).toFixed(3)}
- Conference Rank: ${awayStats.conferenceRank || 'N/A'}
- Home Record: ${awayStats.homeRecord || 'N/A'}
- Away Record: ${awayStats.awayRecord || 'N/A'}
- Last 10 Games: ${awayStats.lastTenGames || 'N/A'}
`;
          
          // Add key player statistics for home team
          if (enhancedStats.home.keyPlayers && enhancedStats.home.keyPlayers.length > 0) {
            detailedStatsContent += `
${homeTeam} KEY PLAYERS:
`;
            
            enhancedStats.home.keyPlayers.forEach(player => {
              if (player.stats) {
                detailedStatsContent += `- ${player.name} (${player.position})`;
                
                if (player.stats.pts) detailedStatsContent += ` - ${player.stats.pts} PPG`;
                if (player.stats.reb) detailedStatsContent += `, ${player.stats.reb} RPG`;
                if (player.stats.ast) detailedStatsContent += `, ${player.stats.ast} APG`;
                if (player.stats.fg_pct) detailedStatsContent += `, ${(player.stats.fg_pct * 100).toFixed(1)}% FG`;
                
                detailedStatsContent += '\n';
              }
            });
          }
          
          // Add key player statistics for away team
          if (enhancedStats.away.keyPlayers && enhancedStats.away.keyPlayers.length > 0) {
            detailedStatsContent += `
${awayTeam} KEY PLAYERS:
`;
            
            enhancedStats.away.keyPlayers.forEach(player => {
              if (player.stats) {
                detailedStatsContent += `- ${player.name} (${player.position})`;
                
                if (player.stats.pts) detailedStatsContent += ` - ${player.stats.pts} PPG`;
                if (player.stats.reb) detailedStatsContent += `, ${player.stats.reb} RPG`;
                if (player.stats.ast) detailedStatsContent += `, ${player.stats.ast} APG`;
                if (player.stats.fg_pct) detailedStatsContent += `, ${(player.stats.fg_pct * 100).toFixed(1)}% FG`;
                
                detailedStatsContent += '\n';
              }
            });
          }
        }
      }
      
      // Fall back to TheSportsDB stats if Ball Don't Lie data isn't available
      if (!detailedStatsContent && gameStats.statsAvailable) {
        const home = gameStats.homeTeamStats;
        const away = gameStats.awayTeamStats;
        
        if (league === 'MLB') {
          detailedStatsContent = `
📊 DETAILED TEAM STATISTICS (MLB)

${homeTeam} STATS:
- Recent Form: ${home.recentForm.form}
- League: ${home.detailedStats.record || 'N/A'}
- Avg Runs Scored: ${home.detailedStats.avgRuns || 'N/A'} per game
- Avg Runs Allowed: ${home.detailedStats.avgRunsAllowed || 'N/A'} per game
- Most Recent Game: ${home.detailedStats.lastGameScore || 'No data'}
- Current Streak: ${home.detailedStats.winStreak || 'No data'}
- ${home.detailedStats.startingPitcherNote || ''}

${awayTeam} STATS:
- Recent Form: ${away.recentForm.form}
- League: ${away.detailedStats.record || 'N/A'}
- Avg Runs Scored: ${away.detailedStats.avgRuns || 'N/A'} per game
- Avg Runs Allowed: ${away.detailedStats.avgRunsAllowed || 'N/A'} per game
- Most Recent Game: ${away.detailedStats.lastGameScore || 'No data'}
- Current Streak: ${away.detailedStats.winStreak || 'No data'}
- ${away.detailedStats.startingPitcherNote || ''}
`;
        } else if (league === 'NBA') {
          detailedStatsContent = `
📊 DETAILED TEAM STATISTICS (NBA)

${homeTeam} STATS:
- Recent Form: ${home.recentForm.form}
- Conference: ${home.detailedStats.conference || 'N/A'}
- Avg Points Scored: ${home.detailedStats.avgPoints || 'N/A'} per game
- Avg Points Allowed: ${home.detailedStats.avgPointsAllowed || 'N/A'} per game
- Most Recent Game: ${home.detailedStats.lastGameScore || 'No data'}
- Current Streak: ${home.detailedStats.winStreak || 'No data'}

${awayTeam} STATS:
- Recent Form: ${away.recentForm.form}
- Conference: ${away.detailedStats.conference || 'N/A'}
- Avg Points Scored: ${away.detailedStats.avgPoints || 'N/A'} per game
- Avg Points Allowed: ${away.detailedStats.avgPointsAllowed || 'N/A'} per game
- Most Recent Game: ${away.detailedStats.lastGameScore || 'No data'}
- Current Streak: ${away.detailedStats.winStreak || 'No data'}
`;
        } else if (league === 'NHL') {
          detailedStatsContent = `
📊 DETAILED TEAM STATISTICS (NHL)

${homeTeam} STATS:
- Recent Form: ${home.recentForm.form}
- Conference: ${home.detailedStats.conference || 'N/A'}
- Avg Goals Scored: ${home.detailedStats.avgGoals || 'N/A'} per game
- Avg Goals Allowed: ${home.detailedStats.avgGoalsAllowed || 'N/A'} per game
- Most Recent Game: ${home.detailedStats.lastGameScore || 'No data'}
- Current Streak: ${home.detailedStats.winStreak || 'No data'}

${awayTeam} STATS:
- Recent Form: ${away.recentForm.form}
- Conference: ${away.detailedStats.conference || 'N/A'}
- Avg Goals Scored: ${away.detailedStats.avgGoals || 'N/A'} per game
- Avg Goals Allowed: ${away.detailedStats.avgGoalsAllowed || 'N/A'} per game
- Most Recent Game: ${away.detailedStats.lastGameScore || 'No data'}
- Current Streak: ${away.detailedStats.winStreak || 'No data'}
`;
        } else {
          // Generic format for other sports
          detailedStatsContent = `
📊 DETAILED TEAM STATISTICS

${homeTeam} STATS:
- Recent Form: ${home.recentForm.form}

${awayTeam} STATS:
- Recent Form: ${away.recentForm.form}
`;
        }
      }

      return `
🔢 ODDS & LINE DATA
- Opening Moneyline: ${openingHomeOdds}, ${openingAwayOdds}
- Current Moneyline: ${homeOdds}, ${awayOdds}
- Opening Spread: ${openingSpread}
- Current Spread: ${pointSpread}
- Over/Under Total: ${totalPoints}
- Line Movement: ${lineMovementDescription}
- Public Bets: ${publicBetPercentageHome}% on ${homeTeam}, ${publicBetPercentageAway}% on ${awayTeam}
- Sharp Money: ${sharpAction}

${detailedStatsContent || 'No current team statistics available'}

🏟️ VENUE INFO
- Home: ${gameStats.statsAvailable ? `${gameStats.homeTeamStats.stadium} (${homeTeam})` : homeTeam}
- Away: ${gameStats.statsAvailable ? `${gameStats.awayTeamStats.name} traveling` : awayTeam}

🌡️ MOMENTUM CHECK
- Line Movement Analysis: ${Math.abs(parseFloat(openingSpread || 0) - parseFloat(pointSpread || 0)) > 1 ? 'Significant line movement detected' : 'Stable line'}
- Public vs Sharp: ${Math.abs(publicBetPercentageHome - 50) > 20 ? 'Heavy public lean detected' : 'Balanced action'}
- Sharp Action: ${sharpAction}

🧠 GARY'S ANALYTICS FOCUS (80% WEIGHT)
- Line value vs public perception
- Recent team performance trends
- Sharp money indicators
- Home/Away splits and matchup history
- Detailed player and team statistics
- Verified statistical data from multiple sources
`;
    } catch (error) {
      console.error('Error building comprehensive stats context:', error);
      return 'Error: Could not build comprehensive stats context. Using limited data for analysis.';
    }
  }
};
