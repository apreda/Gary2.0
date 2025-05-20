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
   * Helper to make API calls to TheSportsDB
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - API response
   */
  async apiGet(endpoint, params = {}) {
    try {
      // Check if endpoint already has full URL structure
      const url = endpoint.startsWith('http') 
        ? endpoint 
        : `${this.API_BASE_URL}/${this.API_KEY}/${endpoint}`;
      
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error.message);
      return null;
    }
  },

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
      const data = await this.apiGet('searchteams.php', { t: teamName });
      
      if (data?.teams?.length > 0) {
        return data.teams[0];
      }
      return null;
    } catch (error) {
      console.error(`Error fetching team data for ${teamName}:`, error);
      return null;
    }
  },
  
  /**
   * Get all players for a team
   * @param {string} teamId - Team ID from TheSportsDB
   * @returns {Promise<Array|null>} - Array of players or null if not found
   */
  async getTeamPlayers(teamId) {
    try {
      console.log(`Fetching players for team ID ${teamId}...`);
      const data = await this.apiGet('lookup_all_players.php', { id: teamId });
      
      if (data?.player?.length > 0) {
        return data.player;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching players for team ${teamId}:`, error);
      return null;
    }
  },
  
  /**
   * Get today's games for a specific league
   * @param {string} league - League code (MLB, NBA, etc.)
   * @returns {Promise<Array>} - Array of today's games
   */
  async getTodaysGames(league) {
    try {
      // Format date as YYYY-MM-DD for TheSportsDB API using EST timezone
      const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
      const estDate = new Intl.DateTimeFormat('en-US', options).format(new Date());
      const [month, day, year] = estDate.split('/');
      const formattedDate = `${year}-${month}-${day}`;
      
      console.log(`Fetching ${league} games for ${formattedDate} (EST date)...`);
      const data = await this.apiGet('eventsday.php', { d: formattedDate, l: league });
      
      if (data?.events?.length > 0) {
        return data.events;
      }
      return [];
    } catch (error) {
      console.error(`Error fetching today's ${league} games:`, error);
      return [];
    }
  },
  
  /**
   * Get lineup for a specific game
   * @param {string} eventId - Event ID from TheSportsDB
   * @returns {Promise<Object|null>} - Lineup data or null if not found
   */
  async getGameLineup(eventId) {
    try {
      console.log(`Fetching lineup for game ID ${eventId}...`);
      const data = await this.apiGet('lookuplineup.php', { id: eventId });
      
      if (data?.lineup) {
        return data.lineup;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching lineup for game ${eventId}:`, error);
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
   * Get today's MLB starting pitcher data for a team by checking game lineups
   * @param {string} teamName - The team name to get pitcher data for
   * @param {string} opponentName - Optional opponent team name to help find the right game
   * @returns {Promise<Object>} - Pitcher statistics with game context
   */
  async getMlbStartingPitchers(teamName, opponentName = null) {
    try {
      console.log(`SportsDB: Getting MLB pitcher data for ${teamName} vs ${opponentName || 'any opponent'}`);
      
      // Local helper function to avoid scope issues
      const matchTeamNames = (team1, team2) => {
        if (!team1 || !team2) return false;
        team1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
        team2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
        return team1.includes(team2) || team2.includes(team1);
      };
      
      // Get today's games
      const todaysGames = await this.getTodaysGames('MLB');
      
      if (!todaysGames || todaysGames.length === 0) {
        console.log('SportsDB: No MLB games found for today');
        return this._createFallbackPitcherResponse(teamName, opponentName);
      }
      
      console.log(`SportsDB: Found ${todaysGames.length} MLB games for today`);
      
      // Find the specific game for this team and optional opponent
      const game = todaysGames.find(g => {
        const homeTeam = g.strHomeTeam;
        const awayTeam = g.strAwayTeam;
        
        // If opponent is specified, make sure both teams match
        if (opponentName) {
          return (matchTeamNames(homeTeam, teamName) && matchTeamNames(awayTeam, opponentName)) ||
                 (matchTeamNames(awayTeam, teamName) && matchTeamNames(homeTeam, opponentName));
        }
        
        // Otherwise just match the target team
        return matchTeamNames(homeTeam, teamName) || matchTeamNames(awayTeam, teamName);
      });
      
      if (!game) {
        console.log(`SportsDB: No game found for ${teamName}`);
        return this._createFallbackPitcherResponse(teamName, opponentName);
      }
      
      console.log(`SportsDB: Found game: ${game.strAwayTeam} @ ${game.strHomeTeam} (ID: ${game.idEvent})`);
      
      // Get lineup for this game
      const lineup = await this.getGameLineup(game.idEvent);
      
      if (!lineup) {
        console.log(`SportsDB: No lineup available for game ID ${game.idEvent}, using fallback data`);
        return this._createFallbackPitcherResponse(teamName, opponentName, game);
      }
      
      // Determine if our team is home or away
      const isTargetHome = matchTeamNames(game.strHomeTeam, teamName);
      let ourPitcher = null;
      let opposingPitcher = null;
      
      // Extract pitchers from lineup
      if (lineup.home && lineup.away) {
        console.log(`SportsDB: Processing lineup data - Home pitchers: ${lineup.home.filter(p => p.strPosition === 'P').length}, Away pitchers: ${lineup.away.filter(p => p.strPosition === 'P').length}`);
        
        const homePitchers = lineup.home.filter(player => player.strPosition === 'P');
        const awayPitchers = lineup.away.filter(player => player.strPosition === 'P');
        
        // Get the first pitcher (usually the starter)
        const homePitcher = homePitchers[0] || null;
        const awayPitcher = awayPitchers[0] || null;
        
        if (isTargetHome) {
          ourPitcher = homePitcher;
          opposingPitcher = awayPitcher;
        } else {
          ourPitcher = awayPitcher;
          opposingPitcher = homePitcher;
        }
      } else {
        console.log(`SportsDB: Lineup data is missing home or away teams`);
      }
      
      // If no pitcher found, use fallback
      if (!ourPitcher) {
        console.log(`SportsDB: No pitcher found for ${teamName} in lineup, using fallback data`);
        return this._createFallbackPitcherResponse(teamName, opponentName, game);
      }
      
      // Get detailed pitcher stats
      console.log(`SportsDB: Getting detailed stats for pitcher: ${ourPitcher.strPlayer}`);
      const pitcherDetails = await this.getDetailedPitcherStats(ourPitcher);
      let opposingPitcherDetails = null;
      
      if (opposingPitcher) {
        console.log(`SportsDB: Getting detailed stats for opposing pitcher: ${opposingPitcher.strPlayer}`);
        opposingPitcherDetails = await this.getDetailedPitcherStats(opposingPitcher);
      }
      
      // Format the response in a way compatible with other services
      return {
        home: isTargetHome ? {
          name: ourPitcher.strPlayer,
          team: game.strHomeTeam,
          teamDisplayName: teamName,
          stats: pitcherDetails || {
            ERA: 'N/A',
            WHIP: 'N/A',
            record: 'N/A',
            description: 'Detailed statistics not available'
          }
        } : (opposingPitcher ? {
          name: opposingPitcher.strPlayer,
          team: game.strHomeTeam,
          teamDisplayName: game.strHomeTeam,
          stats: opposingPitcherDetails || {
            ERA: 'N/A',
            WHIP: 'N/A',
            record: 'N/A',
            description: 'Detailed statistics not available'
          }
        } : null),
        away: !isTargetHome ? {
          name: ourPitcher.strPlayer,
          team: game.strAwayTeam,
          teamDisplayName: teamName,
          stats: pitcherDetails || {
            ERA: 'N/A',
            WHIP: 'N/A',
            record: 'N/A',
            description: 'Detailed statistics not available'
          }
        } : (opposingPitcher ? {
          name: opposingPitcher.strPlayer,
          team: game.strAwayTeam,
          teamDisplayName: game.strAwayTeam,
          stats: opposingPitcherDetails || {
            ERA: 'N/A',
            WHIP: 'N/A',
            record: 'N/A',
            description: 'Detailed statistics not available'
          }
        } : null),
        gameId: game.idEvent,
        source: 'TheSportsDB'
      };
      
    } catch (error) {
      console.error('SportsDB Error getting MLB starting pitchers:', error.message);
      return this._createFallbackPitcherResponse(teamName, opponentName);
    }
  },
  
  /**
   * Create a standardized fallback response for pitcher data
   * @param {string} teamName - The team name
   * @param {string} opponentName - Optional opponent name
   * @param {Object} game - Optional game data if available
   * @returns {Object} - Formatted pitcher data response
   * @private
   */
  _createFallbackPitcherResponse(teamName, opponentName = null, game = null) {
    console.log(`SportsDB: Creating fallback pitcher response for ${teamName} vs ${opponentName || 'unknown opponent'}`);
    
    const fallbackStats = {
      ERA: 'TBD',
      WHIP: 'TBD',
      record: 'TBD',
      strikeouts: 'TBD',
      description: 'Starting pitcher information not available from TheSportsDB'
    };
    
    // If we have a game, we can at least provide team names
    if (game) {
      const isTargetHome = this._teamNameMatch(game.strHomeTeam, teamName);
      
      return {
        home: {
          name: 'TBD',
          team: game.strHomeTeam,
          teamDisplayName: isTargetHome ? teamName : game.strHomeTeam,
          stats: fallbackStats
        },
        away: {
          name: 'TBD',
          team: game.strAwayTeam,
          teamDisplayName: !isTargetHome ? teamName : game.strAwayTeam,
          stats: fallbackStats
        },
        gameId: game.idEvent,
        source: 'TheSportsDB (Fallback)'
      };
    }
    
    // Complete fallback when we don't even have game data
    return {
      home: opponentName ? {
        name: 'TBD',
        team: opponentName,
        teamDisplayName: opponentName,
        stats: fallbackStats
      } : null,
      away: {
        name: 'TBD',
        team: teamName,
        teamDisplayName: teamName,
        stats: fallbackStats
      },
      gameId: null,
      source: 'TheSportsDB (Complete Fallback)'
    };
  },
  
  /**
   * Helper to check if team names match (handles variations in team names)
   * @private
   */
  _teamNameMatch(team1, team2) {
    if (!team1 || !team2) return false;
    
    // Clean and lowercase both names
    const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for exact match or substring match
    return clean1 === clean2 || 
           clean1.includes(clean2) || 
           clean2.includes(clean1);
  },
  
  /**
   * Get detailed stats for a pitcher from the lineup
   * @param {Object} pitcherLineupData - Pitcher data from the lineup
   * @returns {Promise<Object>} - Detailed pitcher stats
   */
  async getDetailedPitcherStats(pitcherLineupData) {
    try {
      if (!pitcherLineupData) return null;
      
      // If we have the player ID directly
      const playerId = pitcherLineupData.idPlayer;
      if (!playerId) {
        // Search for the player by name if we don't have the ID
        const searchResult = await this.apiGet('searchplayers.php', { 
          p: pitcherLineupData.strPlayer
        });
        
        if (searchResult?.player?.length > 0) {
          const playerMatch = searchResult.player.find(p => 
            p.strPlayer === pitcherLineupData.strPlayer || 
            p.strTeam === pitcherLineupData.strTeam
          ) || searchResult.player[0];
          
          const playerDetails = await this.apiGet('lookupplayer.php', { id: playerMatch.idPlayer });
          if (playerDetails?.players?.length > 0) {
            return this._formatPitcherStats(playerDetails.players[0]);
          }
        }
        return null;
      }
      
      // Get detailed player stats
      const playerDetails = await this.apiGet('lookupplayer.php', { id: playerId });
      if (playerDetails?.players?.length > 0) {
        return this._formatPitcherStats(playerDetails.players[0]);
      }
      
      return null;
    } catch (error) {
      console.error('Error getting detailed pitcher stats:', error);
      return null;
    }
  },
  
  /**
   * Format pitcher stats from player details
   * @private
   */
  _formatPitcherStats(playerDetails) {
    if (!playerDetails) return null;
    
    // Extract stats from player description and structured data
    const era = this._extractStatFromText(playerDetails.strDescriptionEN, /ERA of ([0-9.]+)/i) || 
               this._extractStatFromText(playerDetails.strDescriptionEN, /([0-9.]+)\s*ERA/i) || 
               playerDetails.strERA || 'N/A';
               
    const wins = this._extractStatFromText(playerDetails.strDescriptionEN, /([0-9]+)\s*wins/i) || 
               this._extractStatFromText(playerDetails.strDescriptionEN, /record of ([0-9]+)-/i) || 
               playerDetails.strWin || 'N/A';
               
    const losses = this._extractStatFromText(playerDetails.strDescriptionEN, /([0-9]+)\s*losses/i) || 
                 this._extractStatFromText(playerDetails.strDescriptionEN, /record of [0-9]+-([0-9]+)/i) || 
                 playerDetails.strLoss || 'N/A';
                 
    const strikeouts = this._extractStatFromText(playerDetails.strDescriptionEN, /([0-9]+)\s*strikeouts/i) || 
                    this._extractStatFromText(playerDetails.strDescriptionEN, /([0-9]+)\s*K/i) || 
                    playerDetails.strStrikeouts || 'N/A';
                    
    const whip = this._extractStatFromText(playerDetails.strDescriptionEN, /WHIP of ([0-9.]+)/i) || 
               this._extractStatFromText(playerDetails.strDescriptionEN, /([0-9.]+)\s*WHIP/i) || 
               playerDetails.strWHIP || 'N/A';
    
    return {
      name: playerDetails.strPlayer,
      position: playerDetails.strPosition,
      team: playerDetails.strTeam,
      born: playerDetails.dateBorn,
      height: playerDetails.strHeight,
      weight: playerDetails.strWeight,
      thumb: playerDetails.strThumb || playerDetails.strCutout || playerDetails.strRender,
      stats: {
        ERA: era,
        record: (wins && losses && wins !== 'N/A' && losses !== 'N/A') ? `${wins}-${losses}` : 'N/A',
        strikeouts: strikeouts,
        WHIP: whip,
        description: this._getShortDescription(playerDetails.strDescriptionEN)
      }
    };
  },
  
  /**
   * Get probable starting pitcher for a team on a specific date
   * @param {string} teamName - Team name
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Pitcher data with name and stats
   */
  async getProbableStarter(teamName, dateStr) {
    try {
      console.log(`Looking for probable starting pitcher for ${teamName} on ${dateStr}`);
      
      // Step 1: Find the team in the database
      const teamData = await this.getTeamData(teamName);
      if (!teamData) {
        console.log(`Team not found: ${teamName}`);
        return null;
      }
      
      // Step 2: Find today's game involving this team
      // Format date for TheSportsDB API
      const [year, month, day] = dateStr.split('-');
      const formattedDate = `${year}-${month}-${day}`;
      
      // Get games for this date in the team's league
      const leagueGames = await this.apiGet('eventsday.php', { 
        d: formattedDate, 
        l: teamData.strLeague || 'MLB' 
      });
      
      if (!leagueGames?.events || leagueGames.events.length === 0) {
        console.log(`No games found for ${dateStr}`);
        return null;
      }
      
      // Find the game involving our team
      const teamGame = leagueGames.events.find(game => 
        this._teamNameMatch(game.strHomeTeam, teamName) || 
        this._teamNameMatch(game.strAwayTeam, teamName)
      );
      
      if (!teamGame) {
        console.log(`No game found for ${teamName} on ${dateStr}`);
        return null;
      }
      
      console.log(`Found game: ${teamGame.strAwayTeam} @ ${teamGame.strHomeTeam}`);
      
      // Step 3: Try to get lineup information which should include pitchers
      const lineup = await this.getGameLineup(teamGame.idEvent);
      
      if (!lineup) {
        console.log(`No lineup available for game: ${teamGame.idEvent}`);
        return null;
      }
      
      // Determine if the team is home or away
      const isHome = this._teamNameMatch(teamGame.strHomeTeam, teamName);
      
      // Step 4: Find the pitcher in the lineup
      const teamLineup = lineup.filter(player => {
        const playerTeamId = player.idTeam || player.idHomeTeam || player.idAwayTeam;
        return playerTeamId === teamData.idTeam;
      });
      
      // Look for starting pitcher designation
      const pitcher = teamLineup.find(player => 
        player.strPosition?.toLowerCase().includes('pitcher') &&
        (player.strStatus?.toLowerCase().includes('starter') || 
         player.strStatus?.toLowerCase().includes('starting'))
      );
      
      if (pitcher) {
        return {
          name: pitcher.strPlayer,
          id: pitcher.idPlayer,
          position: 'Starting Pitcher',
          teamId: teamData.idTeam,
          gameId: teamGame.idEvent
        };
      }
      
      // If no explicit starting pitcher, look for any pitcher
      const anyPitcher = teamLineup.find(player => 
        player.strPosition?.toLowerCase().includes('pitcher')
      );
      
      if (anyPitcher) {
        return {
          name: anyPitcher.strPlayer,
          id: anyPitcher.idPlayer,
          position: 'Pitcher',
          teamId: teamData.idTeam,
          gameId: teamGame.idEvent
        };
      }
      
      console.log(`No pitchers found in lineup for ${teamName}`);
      return null;
    } catch (error) {
      console.error(`Error getting probable starter for ${teamName}:`, error.message);
      return null;
    }
  },
  
  /**
   * Fallback method to get generic pitcher data when lineups aren't available
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Fallback pitcher data
   */
  async getFallbackPitcherData(teamName) {
    try {
      console.log(`Using fallback method to get pitcher data for ${teamName}...`);
      
      // Local helper function to avoid scope issues
      const matchTeamNames = (team1, team2) => {
        if (!team1 || !team2) return false;
        team1 = team1.toLowerCase().trim();
        team2 = team2.toLowerCase().trim();
        
        // Direct match
        if (team1 === team2) return true;
        
        // Handle team name variations (like 'LA' vs 'Los Angeles')
        return team1.includes(team2) || team2.includes(team1);
      };
      
      // Get team data
      const teamData = await this.getTeamData(teamName);
      if (!teamData) {
        console.error(`Could not find team data for ${teamName}`);
        return null;
      }
      
      // Get team players
      const players = await this.getTeamPlayers(teamData.idTeam);
      if (!players || !players.length) {
        console.error(`No players found for team ${teamName}`);
        return null;
      }
      
      // Find pitchers (typically position contains 'pitcher')
      const pitchers = players.filter(p => 
        p.strPosition?.toLowerCase().includes('pitcher')
      );
      
      if (!pitchers.length) {
        console.error(`No pitchers found for team ${teamName}`);
        return null;
      }
      
      // Get detailed stats for top pitchers (likely to be starters)
      const pitcherDetails = [];
      
      // Limit to top starting pitchers to avoid excessive API calls
      for (const pitcher of pitchers.slice(0, 2)) {
        try {
          const playerDetails = await this.apiGet('lookupplayer.php', { id: pitcher.idPlayer });
          if (playerDetails?.players?.length > 0) {
            pitcherDetails.push(this._formatPitcherStats(playerDetails.players[0]));
          }
        } catch (error) {
          console.error(`Error getting details for pitcher ${pitcher.strPlayer}:`, error);
        }
      }
      
      return {
        team: teamName,
        teamPitcher: pitcherDetails.length > 0 ? pitcherDetails[0] : null,
        opponentPitcher: null,
        game: null,
        note: "Fallback pitcher data - not based on today's lineup"
      };
    } catch (error) {
      console.error(`Error getting fallback pitcher data for ${teamName}:`, error);
      return null;
    }
  },
  
  /**
   * Legacy method for backward compatibility
   * @param {string} teamName - Team name
   * @returns {Promise<Array>} - Array of pitcher details
   */
  async getMlbPitcherStats(teamName) {
    try {
      const pitcherData = await this.getMlbStartingPitchers(teamName);
      if (!pitcherData) return null;
      
      const result = [];
      if (pitcherData.teamPitcher) result.push(pitcherData.teamPitcher);
      return result.length > 0 ? result : null;
    } catch (error) {
      console.error(`Error in legacy pitcher stats method for ${teamName}:`, error);
      return null;
    }
  },
  
  /**
   * Helper to extract statistics from text
   * @param {string} text - Text to parse
   * @param {RegExp} regex - Regular expression with capture group
   * @returns {string|null} - Extracted statistic or null
   * @private
   */
  _extractStatFromText(text, regex) {
    if (!text) return null;
    const match = text.match(regex);
    return match && match[1] ? match[1] : null;
  },
  
  /**
   * Helper to get a short description from long text
   * @param {string} text - Long description text
   * @returns {string} - Short description (first 1-2 sentences)
   * @private
   */
  _getShortDescription(text) {
    if (!text) return 'No description available';
    // Get first 1-2 sentences or first 100 chars
    const sentences = text.split('.');
    return sentences.slice(0, 2).join('.') + '.';
  },
  
  /**
   * Helper to check if team names match (handles variations in team names)
   * @private
   */
  _teamNameMatch(team1, team2) {
    if (!team1 || !team2) return false;
    
    // Clean and lowercase both names
    const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for exact match or substring match
    return clean1 === clean2 || 
           clean1.includes(clean2) || 
           clean2.includes(clean1);
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
