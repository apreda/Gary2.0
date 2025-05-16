import axios from 'axios';
import { oddsService } from './oddsService';
import { ballDontLieService } from './ballDontLieService';

/**
 * Service for fetching and processing sports data from TheSportsDB API and Ball Don't Lie API
 */
const sportsDataService = {
  // API configuration
  API_BASE_URL: 'https://www.thesportsdb.com/api/v1/json',
  API_KEY: import.meta.env?.VITE_THESPORTSDB_API_KEY || '3',

  /**
   * Convert league names to TheSportsDB format
   * @param {string} league - League name from Gary's system (NBA, MLB, etc.)
   * @returns {string} - League name in TheSportsDB format
   */
  mapLeagueToSportsDBFormat(league) {
    const leagueMap = {
      'NBA': 'NBA',
      'MLB': 'MLB',
      'NHL': 'NHL',
      'NFL': 'NFL',
      'EURO': 'English Premier League'
    };
    return leagueMap[league] || league;
  },

  /**
   * Search for a team by name
   * @param {string} teamName - Team name to search for
   * @returns {Promise<Object|null>} - Team data or null if not found
   */
  async getTeamData(teamName) {
    try {
      const response = await axios.get(
        `${this.API_BASE_URL}/${this.API_KEY}/searchteams.php`,
        { params: { t: teamName } }
      );
      
      if (response.data?.teams?.length > 0) {
        return response.data.teams[0];
      }
      return null;
    } catch (error) {
      console.error(`Error fetching team data for ${teamName}:`, error);
      return null;
    }
  },

  /**
   * Get a team's last events
   * @param {string} teamId - Team ID from TheSportsDB
   * @param {number} limit - Number of events to return
   * @returns {Promise<Array>} - Array of past events
   */
  async getTeamLastEvents(teamId, limit = 5) {
    try {
      const response = await axios.get(
        `${this.API_BASE_URL}/${this.API_KEY}/eventslast.php`,
        { params: { id: teamId } }
      );
      
      if (response.data?.results) {
        return response.data.results.slice(0, limit);
      }
      return [];
    } catch (error) {
      console.error(`Error getting last events for team ${teamId}:`, error);
      return [];
    }
  },

  /**
   * Get a team's upcoming events
   * @param {string} teamId - Team ID from TheSportsDB
   * @param {number} limit - Number of events to return
   * @returns {Promise<Array>} - Array of upcoming events
   */
  async getTeamNextEvents(teamId, limit = 5) {
    try {
      const response = await axios.get(
        `${this.API_BASE_URL}/${this.API_KEY}/eventsnext.php`,
        { params: { id: teamId } }
      );
      
      if (response.data?.events) {
        return response.data.events.slice(0, limit);
      }
      return [];
    } catch (error) {
      console.error(`Error getting next events for team ${teamId}:`, error);
      return [];
    }
  },

  /**
   * Get league standings
   * @param {string} leagueName - League name (NBA, MLB, etc.)
   * @returns {Promise<Array>} - League standings
   */
  async getLeagueStandings(leagueName) {
    const mappedLeague = this.mapLeagueToSportsDBFormat(leagueName);
    try {
      const response = await axios.get(
        `${this.API_BASE_URL}/${this.API_KEY}/lookuptable.php`,
        { params: { l: mappedLeague } }
      );
      
      if (response.data?.table) {
        return response.data.table;
      }
      return [];
    } catch (error) {
      console.error(`Error getting standings for ${leagueName}:`, error);
      return [];
    }
  },

  /**
   * Calculate win streak from events
   * @private
   * @param {Array} events - Array of game events
   * @returns {string} - Formatted win streak
   */
  _calculateWinStreak(events) {
    if (!events?.length) return 'No recent games';
    
    // Sort events by date in EST timezone (newest first)
    const sortedEvents = [...events].sort((a, b) => {
      const dateA = new Date(a.dateEvent);
      const dateB = new Date(b.dateEvent);
      const estA = new Date(dateA.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const estB = new Date(dateB.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      return estB - estA; // Newest first
    });
    
    let streak = 0;
    for (const event of sortedEvents) {
      const teamScore = parseInt(event.intHomeScore) || 0;
      const opponentScore = parseInt(event.intAwayScore) || 0;
      
      if (teamScore > opponentScore) {
        streak++;
      } else if (teamScore < opponentScore) {
        break; // Streak ends on a loss
      }
      // Ties (if any) don't affect the streak
    }
    
    return streak > 0 ? `${streak} game winning streak` : 'No current streak';
  },

  /**
   * Calculate recent record from events
   * @private
   * @param {Array} events - Array of game events
   * @returns {Object} - Win/loss record
   */
  _calculateRecentRecord(events) {
    if (!events?.length) return { wins: 0, losses: 0, record: '0-0' };
    
    // Sort by date in EST timezone and take the last 10 games
    const sortedEvents = [...events].sort((a, b) => {
      const dateA = new Date(a.dateEvent);
      const dateB = new Date(b.dateEvent);
      const estA = new Date(dateA.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const estB = new Date(dateB.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      return estB - estA; // Newest first
    }).slice(0, 10);
    
    let wins = 0;
    let losses = 0;
    
    sortedEvents.forEach(event => {
      const result = (event.strResult || '').toUpperCase();
      if (result === 'W') wins++;
      else if (result === 'L') losses++;
    });
    
    return {
      wins,
      losses,
      record: `${wins}-${losses}`
    };
  },

  /**
   * Generate comprehensive team stats for use in OpenAI prompts
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} league - League name
   * @returns {Promise<Object>} - Enhanced game data with team stats
   */
  async generateTeamStatsForGame(homeTeam, awayTeam, league) {
    try {
      // Get team data with retry logic for previous seasons
      let homeTeamData, awayTeamData;
      let currentSeason = new Date().getFullYear();
      const maxRetries = 3;
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        try {
          [homeTeamData, awayTeamData] = await Promise.all([
            this.getTeamData(homeTeam),
            this.getTeamData(awayTeam)
          ]);
          
          if (homeTeamData && awayTeamData) break;
          
          retryCount++;
          if (retryCount >= maxRetries) {
            throw new Error('Failed to get team data after maximum retries');
          }
          
          currentSeason--;
          console.log(`Retry ${retryCount}/${maxRetries}: Trying ${currentSeason} season data...`);
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) throw error;
        }
      }
      
      if (!homeTeamData || !awayTeamData) {
        console.error(`Could not find team data for ${homeTeam} and/or ${awayTeam}`);
        return { homeTeamStats: null, awayTeamStats: null, statsAvailable: false };
      }
      
      // Get recent events for both teams
      const [homeTeamEvents, awayTeamEvents] = await Promise.all([
        this.getTeamLastEvents(homeTeamData.idTeam).catch(() => []),
        this.getTeamLastEvents(awayTeamData.idTeam).catch(() => [])
      ]);
      
      // Create base stats objects
      const createTeamStats = (teamData, events) => ({
        id: teamData.idTeam,
        name: teamData.strTeam,
        formed: teamData.intFormedYear,
        stadium: teamData.strStadium,
        recentForm: this._calculateRecentRecord(events),
        description: teamData.strDescriptionEN?.substring(0, 200) || "No description available",
        detailedStats: {}
      });
      
      const homeTeamStats = createTeamStats(homeTeamData, homeTeamEvents);
      const awayTeamStats = createTeamStats(awayTeamData, awayTeamEvents);
      
      // Add sport-specific stats
      await this._addSportSpecificStats({
        homeTeamStats,
        awayTeamStats,
        homeTeamEvents,
        awayTeamEvents,
        league,
        homeTeamData
      });
      
      return { homeTeamStats, awayTeamStats, statsAvailable: true };
      
    } catch (error) {
      console.error('Error generating team stats:', error);
      return { homeTeamStats: null, awayTeamStats: null, statsAvailable: false };
    }
  },

  /**
   * Add sport-specific statistics to team stats
   * @private
   */
  async _addSportSpecificStats({ homeTeamStats, awayTeamStats, homeTeamEvents, awayTeamEvents, league, homeTeamData }) {
    try {
      const statsExtractors = {
        MLB: this._extractMLBStats.bind(this),
        NBA: this._extractNBAStats.bind(this),
        NHL: this._extractNHLStats.bind(this)
      };
      
      const extractor = statsExtractors[league] || (() => ({}));
      
      // Sort events by date in EST timezone (newest first)
      const sortEventsByEST = (events) => {
        if (!events?.length) return [];
        return [...events].sort((a, b) => {
          const dateA = new Date(a.dateEvent);
          const dateB = new Date(b.dateEvent);
          const estA = new Date(dateA.toLocaleString('en-US', { timeZone: 'America/New_York' }));
          const estB = new Date(dateB.toLocaleString('en-US', { timeZone: 'America/New_York' }));
          return estB - estA; // Newest first
        });
      };
      
      const sortedHomeEvents = sortEventsByEST(homeTeamEvents);
      const sortedAwayEvents = sortEventsByEST(awayTeamEvents);
      
      homeTeamStats.detailedStats = {
        ...extractor(sortedHomeEvents, homeTeamData),
        startingPitcherNote: league === 'MLB' ? "Starting pitcher data not available through current API" : undefined
      };
      
      awayTeamStats.detailedStats = {
        ...extractor(sortedAwayEvents, homeTeamData),
        startingPitcherNote: league === 'MLB' ? "Starting pitcher data not available through current API" : undefined
      };
      
    } catch (error) {
      console.error(`Error extracting ${league} stats:`, error);
    }
  },

  /**
   * Extract MLB-specific statistics
   * @private
   */
  _extractMLBStats(events) {
    const runs = events.map(e => parseInt(e.intHomeScore) || 0);
    const runsAllowed = events.map(e => parseInt(e.intAwayScore) || 0);
    
    return {
      avgRuns: (runs.reduce((a, b) => a + b, 0) / (runs.length || 1)).toFixed(2),
      avgRunsAllowed: (runsAllowed.reduce((a, b) => a + b, 0) / (runsAllowed.length || 1)).toFixed(2),
      lastGameScore: events.length > 0 ? `${runs[0]}-${runsAllowed[0]}` : 'N/A',
      winStreak: this._calculateWinStreak(events)
    };
  },

  /**
   * Extract NBA-specific statistics
   * @private
   */
  _extractNBAStats(events) {
    const points = events.map(e => parseInt(e.intHomeScore) || 0);
    const pointsAllowed = events.map(e => parseInt(e.intAwayScore) || 0);
    
    return {
      avgPoints: (points.reduce((a, b) => a + b, 0) / (points.length || 1)).toFixed(1),
      avgPointsAllowed: (pointsAllowed.reduce((a, b) => a + b, 0) / (pointsAllowed.length || 1)).toFixed(1),
      lastGameScore: events.length > 0 ? `${points[0]}-${pointsAllowed[0]}` : 'N/A',
      winStreak: this._calculateWinStreak(events)
    };
  },

  /**
   * Extract NHL-specific statistics
   * @private
   */
  _extractNHLStats(events) {
    const goals = events.map(e => parseInt(e.intHomeScore) || 0);
    const goalsAllowed = events.map(e => parseInt(e.intAwayScore) || 0);
    
    return {
      avgGoals: (goals.reduce((a, b) => a + b, 0) / (goals.length || 1)).toFixed(1),
      avgGoalsAllowed: (goalsAllowed.reduce((a, b) => a + b, 0) / (goalsAllowed.length || 1)).toFixed(1),
      lastGameScore: events.length > 0 ? `${goals[0]}-${goalsAllowed[0]}` : 'N/A',
      winStreak: this._calculateWinStreak(events)
    };
  },

  /**
   * Format team stats for OpenAI prompt
   * @param {Object} gameStats - Team stats object from generateTeamStatsForGame
   * @returns {string} - Formatted stats string for OpenAI prompt
   */
  formatStatsForPrompt(gameStats) {
    if (!gameStats?.statsAvailable) {
      return 'NOTE: Current team statistics unavailable - using historical data only.';
    }
    
    const { homeTeamStats, awayTeamStats } = gameStats;
    const currentYear = new Date().getFullYear();
    
    try {
      let prompt = `\n${currentYear} Season Stats:\n`;
      
      const formatTeamStats = (team) => {
        if (!team) return '';
        
        let stats = `\n${team.name || 'Team'}:\n`;
        stats += `- Record: ${team.recentForm?.wins || 0}-${team.recentForm?.losses || 0}`;
        if (team.recentForm?.form) stats += ` (${team.recentForm.form})`;
        
        // Add detailed stats if available
        if (team.detailedStats) {
          Object.entries(team.detailedStats).forEach(([key, value]) => {
            if (value !== undefined && value !== null && key !== 'startingPitcherNote') {
              stats += `\n- ${key.replace(/([A-Z])/g, ' $1').trim()}: ${value}`;
            }
          });
        }
        
        return stats;
      };
      
      prompt += formatTeamStats(homeTeamStats);
      prompt += '\n';
      prompt += formatTeamStats(awayTeamStats);
      
      return prompt;
      
    } catch (error) {
      console.error('Error formatting stats for prompt:', error);
      return 'Error generating statistics. Falling back to basic information.';
    }
  },

  /**
   * Build comprehensive stats context for OpenAI analysis
   * This function exists to integrate with the picksService workflow
   * @param {Object} statsData - Team stats data
   * @returns {string} - Formatted stats for OpenAI prompt
   */
  buildComprehensiveStatsContext(statsData) {
    return this.formatStatsForPrompt(statsData);
  },

  /**
   * Get enhanced MLB statistics from Ball Don't Lie API
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name 
   * @returns {Promise<Object>} - Enhanced MLB statistics
   */
  getEnhancedMLBStats: async function(homeTeam, awayTeam) {
    try {
      console.log(`Fetching enhanced MLB stats for ${homeTeam} vs ${awayTeam}...`);
      
      // Find upcoming game for these teams
      const games = await ballDontLieService.getAllGamesByDate(new Date());
      let gameId = null;
      
      // Find the game ID for these two teams
      if (games && games.MLB) {
        const matchedGame = games.MLB.find(game => 
          (game.home_team.display_name.includes(homeTeam) || homeTeam.includes(game.home_team.display_name)) && 
          (game.away_team.display_name.includes(awayTeam) || awayTeam.includes(game.away_team.display_name))
        );
        
        if (matchedGame) {
          gameId = matchedGame.id;
        }
      }
      
      // Generate game preview if we found the game
      let gamePreview = '';
      if (gameId) {
        gamePreview = await ballDontLieService.generateMlbGamePreview(gameId);
      } else {
        // If we can't find the exact game, still try to get team info
        console.log('Game not found in Ball Don\'t Lie API, using team names only');
        const homeTeamData = await this.getTeamData(homeTeam);
        const awayTeamData = await this.getTeamData(awayTeam);
        
        gamePreview = `## MLB Game Preview: ${awayTeam} @ ${homeTeam} ##\n\n`;
        gamePreview += 'Note: Limited statistics available from Ball Don\'t Lie API.\n';
      }
      
      return gamePreview;
    } catch (error) {
      console.error('Error fetching enhanced MLB stats:', error);
      return 'Error fetching enhanced MLB statistics. Using basic information only.';
    }
  },
  
  /**
   * Get enhanced NBA statistics from Ball Don't Lie API
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name 
   * @returns {Promise<Object>} - Enhanced NBA statistics
   */
  getEnhancedNBAStats: async function(homeTeam, awayTeam) {
    try {
      console.log(`Fetching enhanced NBA stats for ${homeTeam} vs ${awayTeam}...`);
      
      // Get current date in YYYY-MM-DD format
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      
      // Find upcoming game for these teams - checking both regular season and playoff games
      const regularSeasonGames = await ballDontLieService.getNbaGamesByDate(dateString);
      
      // Explicitly fetch playoff games with the postseason parameter
      const client = ballDontLieService.getClient();
      const playoffGamesResponse = await client.nba.getGames({ 
        dates: [dateString],
        postseason: true,
        per_page: 100 // Max allowed
      }).catch(err => {
        console.warn('Error fetching playoff games:', err);
        return { data: [] };
      });
      
      const playoffGames = playoffGamesResponse.data || [];
      
      // Combine regular season and playoff games
      const allGames = [...regularSeasonGames, ...playoffGames];
      
      console.log(`Found ${allGames.length} NBA games for ${dateString}`);
      
      let matchedGame = null;
      let gameStats = {};
      
      // Try to find the exact game by team names
      for (const game of allGames) {
        const homeTeamName = game.home_team?.full_name || '';
        const awayTeamName = game.visitor_team?.full_name || '';
        
        // Check for various formats of the team names
        if ((homeTeamName.includes(homeTeam) || homeTeam.includes(homeTeamName)) && 
            (awayTeamName.includes(awayTeam) || awayTeam.includes(awayTeamName))) {
          matchedGame = game;
          break;
        }
      }
      
      if (!matchedGame) {
        console.warn(`Game not found: ${awayTeam} @ ${homeTeam}`);
        return `Unable to find NBA game data for ${awayTeam} @ ${homeTeam}. Using basic statistics.`;
      }
      
      // Format the game preview with detailed stats
      let gamePreview = `## NBA Game Preview: ${awayTeam} @ ${homeTeam} ##\n\n`;
      
      // Extract game time from datetime if available, otherwise use date
      const gameTime = matchedGame.datetime ? 
        new Date(matchedGame.datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 
        'TBD';
        
      // Store for returning to the caller
      gameStats.gameTime = gameTime;
      gameStats.date = matchedGame.date;
        
      // Add basic game info
      const gameType = matchedGame.postseason ? 'Playoff Game' : 'Regular Season';
      gamePreview += `**Game Type:** ${gameType}\n`;
      gamePreview += `**Date:** ${matchedGame.date}\n`;
      gamePreview += `**Time:** ${gameTime}\n`;
      
      // Get team records and standings information
      const homeTeamId = matchedGame.home_team.id;
      const awayTeamId = matchedGame.visitor_team.id;
      
      // Try to get standings data
      const standingsResponse = await client.nba.getStandings({ season: today.getFullYear() })
        .catch(err => {
          console.warn('Error fetching standings:', err);
          return { data: [] };
        });
      
      const standings = standingsResponse.data || [];
      
      // Find team standings
      const homeTeamStanding = standings.find(s => s.team.id === homeTeamId);
      const awayTeamStanding = standings.find(s => s.team.id === awayTeamId);
      
      if (homeTeamStanding && awayTeamStanding) {
        gamePreview += `\n### Team Records ###\n`;
        gamePreview += `${matchedGame.home_team.full_name}: ${homeTeamStanding.wins}-${homeTeamStanding.losses} (${homeTeamStanding.home_record} Home)\n`;
        gamePreview += `${matchedGame.visitor_team.full_name}: ${awayTeamStanding.wins}-${awayTeamStanding.losses} (${awayTeamStanding.road_record} Away)\n`;
        gamePreview += `\n`;
      }
      
      // Get key player stats for both teams
      const statsResponse = await client.nba.getStats({
        team_ids: [homeTeamId, awayTeamId],
        seasons: [today.getFullYear()],
        per_page: 50
      }).catch(err => {
        console.warn('Error fetching player stats:', err);
        return { data: [] };
      });
      
      const playerStats = statsResponse.data || [];
      
      if (playerStats.length > 0) {
        // Group stats by team
        const homeTeamPlayerStats = playerStats.filter(s => s.team.id === homeTeamId);
        const awayTeamPlayerStats = playerStats.filter(s => s.team.id === awayTeamId);
        
        // Function to format player stats
        const formatPlayerStats = (teamStats) => {
          // Sort by points descending to get top players
          const sortedStats = [...teamStats].sort((a, b) => b.pts - a.pts);
          const topPlayers = sortedStats.slice(0, 5); // Get top 5 players
          
          let result = '';
          for (const playerStat of topPlayers) {
            const player = playerStat.player;
            result += `${player.first_name} ${player.last_name}: ${playerStat.pts.toFixed(1)} PPG, `;
            result += `${playerStat.reb.toFixed(1)} RPG, ${playerStat.ast.toFixed(1)} APG, `;
            result += `${(playerStat.fg_pct * 100).toFixed(1)}% FG, ${(playerStat.fg3_pct * 100).toFixed(1)}% 3PT\n`;
          }
          return result;
        };
        
        // Add key player stats to the preview
        gamePreview += `### Key Player Stats (Season Averages) ###\n\n`;
        gamePreview += `**${matchedGame.home_team.full_name}:**\n${formatPlayerStats(homeTeamPlayerStats)}\n`;
        gamePreview += `**${matchedGame.visitor_team.full_name}:**\n${formatPlayerStats(awayTeamPlayerStats)}\n`;
      }
      
      // Try to get player injuries
      const injuriesResponse = await client.nba.getPlayerInjuries({
        team_ids: [homeTeamId, awayTeamId]
      }).catch(err => {
        console.warn('Error fetching injuries:', err);
        return { data: [] };
      });
      
      const injuries = injuriesResponse.data || [];
      
      if (injuries.length > 0) {
        // Group injuries by team
        const homeTeamInjuries = injuries.filter(i => i.player.team_id === homeTeamId);
        const awayTeamInjuries = injuries.filter(i => i.player.team_id === awayTeamId);
        
        if (homeTeamInjuries.length > 0 || awayTeamInjuries.length > 0) {
          gamePreview += `\n### Key Injuries ###\n`;
          
          if (awayTeamInjuries.length > 0) {
            gamePreview += `**${matchedGame.visitor_team.full_name}:**\n`;
            awayTeamInjuries.forEach(injury => {
              gamePreview += `- ${injury.player.first_name} ${injury.player.last_name}: ${injury.status} - ${injury.description}\n`;
            });
            gamePreview += '\n';
          }
          
          if (homeTeamInjuries.length > 0) {
            gamePreview += `**${matchedGame.home_team.full_name}:**\n`;
            homeTeamInjuries.forEach(injury => {
              gamePreview += `- ${injury.player.first_name} ${injury.player.last_name}: ${injury.status} - ${injury.description}\n`;
            });
          }
        }
      }
      
      // Add team comparison table
      if (homeTeamStanding && awayTeamStanding) {
        gamePreview += `\n### Team Comparison ###\n`;
        gamePreview += `| Stat | ${matchedGame.visitor_team.abbreviation} | ${matchedGame.home_team.abbreviation} |\n`;
        gamePreview += `|------|------|---------|\n`;
        gamePreview += `| Win % | ${(awayTeamStanding.wins / (awayTeamStanding.wins + awayTeamStanding.losses) * 100).toFixed(1)}% | ${(homeTeamStanding.wins / (homeTeamStanding.wins + homeTeamStanding.losses) * 100).toFixed(1)}% |\n`;
        gamePreview += `| Conference Rank | ${awayTeamStanding.conference_rank} | ${homeTeamStanding.conference_rank} |\n`;
        gamePreview += `| Home/Away | ${awayTeamStanding.road_record} (Away) | ${homeTeamStanding.home_record} (Home) |\n`;
      }
      
      return gamePreview;
      
    } catch (error) {
      console.error('Error fetching enhanced NBA stats:', error);
      return `Error fetching enhanced NBA statistics. Using basic information only.\nError: ${error.message}`;
    }
  },

  /**
   * Get scores for games on a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} league - League name (NBA, MLB, etc.)
   * @returns {Promise<Object>} Object with game scores
   */
  async getScores(date, league) {
    try {
      const formattedLeague = this.mapLeagueToSportsDBFormat(league);
      const response = await axios.get(
        `${this.API_BASE_URL}/${this.API_KEY}/eventsday.php`,
        { params: { d: date, s: 'Basketball', l: formattedLeague } }
      );

      if (!response.data?.events) {
        console.log(`No events found for ${league} on ${date}`);
        return null;
      }

      const scores = {};
      response.data.events.forEach(event => {
        if (event.strHomeTeam && event.strAwayTeam && event.intHomeScore && event.intAwayScore) {
          const key = `${event.strAwayTeam} @ ${event.strHomeTeam}`;
          scores[key] = `${event.intAwayScore}-${event.intHomeScore}`;
        }
      });

      return Object.keys(scores).length > 0 ? scores : null;
    } catch (error) {
      console.error(`Error fetching scores for ${league} on ${date}:`, error);
      return null;
    }
  }
};

// Export as both default and named export
export default sportsDataService;
export { sportsDataService };
