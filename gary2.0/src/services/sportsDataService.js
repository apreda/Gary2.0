import axios from 'axios';
import { oddsService } from './oddsService';

/**
 * Service for fetching and processing sports data from TheSportsDB API
 */
export const sportsDataService = {
  // API configuration - Using direct API access with public key for reliability
  API_BASE_URL: 'https://www.thesportsdb.com/api/v1/json',
  API_KEY: '3', // Using the free tier public key (documented as reliable for production)
  
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
        `${sportsDataService.API_BASE_URL}/${sportsDataService.API_KEY}/eventsnext.php?id=${teamId}`
      );
      
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
      
      // Get team data
      const homeTeamData = await sportsDataService.getTeamData(homeTeam);
      const awayTeamData = await sportsDataService.getTeamData(awayTeam);
      
      if (!homeTeamData || !awayTeamData) {
        console.error(`TheSportsDB API: Could not find team data for ${homeTeam} and/or ${awayTeam}. This will affect pick quality.`);
        return {
          homeTeamStats: null,
          awayTeamStats: null,
          statsAvailable: false
        };
      }
      
      // Get recent results for both teams
      const homeTeamEvents = await sportsDataService.getTeamLastEvents(homeTeamData.idTeam);
      const awayTeamEvents = await sportsDataService.getTeamLastEvents(awayTeamData.idTeam);
      
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
      
      // Create enhanced stats object
      const homeTeamStats = {
        id: homeTeamData.idTeam,
        name: homeTeamData.strTeam,
        formed: homeTeamData.intFormedYear,
        stadium: homeTeamData.strStadium,
        recentForm: calculateRecentRecord(homeTeamEvents),
        description: homeTeamData.strDescriptionEN?.substring(0, 200) || "No description available"
      };
      
      const awayTeamStats = {
        id: awayTeamData.idTeam,
        name: awayTeamData.strTeam,
        formed: awayTeamData.intFormedYear,
        stadium: awayTeamData.strStadium,
        recentForm: calculateRecentRecord(awayTeamEvents),
        description: awayTeamData.strDescriptionEN?.substring(0, 200) || "No description available"
      };
      
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
    console.log(`TheSportsDB API: Formatting stats for ${homeTeamStats.name} vs ${awayTeamStats.name}`);
    
    return `
📊 TEAM PERFORMANCE (LAST 5 GAMES)
- ${homeTeamStats.name}: ${homeTeamStats.recentForm.form}
- ${awayTeamStats.name}: ${awayTeamStats.recentForm.form}

🏟️ VENUE
${homeTeamStats.name} plays at ${homeTeamStats.stadium}.
${awayTeamStats.name} will be the visiting team.

🔍 TEAM INSIGHTS
${homeTeamStats.description?.substring(0, 100)}...
${awayTeamStats.description?.substring(0, 100)}...
`;
  },

  /**
   * Build comprehensive stats context for OpenAI prompt
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} league - League name
   * @param {Object} oddsData - Current odds and line data
   * @returns {Promise<string>} - Formatted comprehensive stats context
   */
  buildComprehensiveStatsContext: async (homeTeam, awayTeam, league, oddsData) => {
    try {
      // Get team stats from TheSportsDB
      const gameStats = await sportsDataService.generateTeamStatsForGame(homeTeam, awayTeam, league);
      
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

${gameStats.statsAvailable ? `📊 TEAM PERFORMANCE (LAST 5 GAMES)
- ${homeTeam}: ${gameStats.homeTeamStats.recentForm.form}
- ${awayTeam}: ${gameStats.awayTeamStats.recentForm.form}

🏟️ VENUE INFO
- Home: ${gameStats.homeTeamStats.stadium} (${homeTeam})
- Away: ${gameStats.awayTeamStats.name} traveling

🔍 TEAM INSIGHTS
${gameStats.homeTeamStats.description?.substring(0, 100)}...
${gameStats.awayTeamStats.description?.substring(0, 100)}...` : 'No current team statistics available'}

🌡️ MOMENTUM CHECK
- Line Movement Analysis: ${Math.abs(parseFloat(openingSpread || 0) - parseFloat(pointSpread || 0)) > 1 ? 'Significant line movement detected' : 'Stable line'}
- Public vs Sharp: ${Math.abs(publicBetPercentageHome - 50) > 20 ? 'Heavy public lean detected' : 'Balanced action'}
- Sharp Action: ${sharpAction}

🧠 GARY'S ANALYTICS FOCUS (80% WEIGHT)
- Line value vs public perception
- Recent team performance trends
- Sharp money indicators
- Home/Away splits and matchup history
`;
    } catch (error) {
      console.error('Error building comprehensive stats context:', error);
      return 'Error: Could not build comprehensive stats context. Using limited data for analysis.';
    }
  }
};
