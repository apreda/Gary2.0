import axios from 'axios';

// Handle environment variables in both Vite and standalone Node.js
let apiKey = '';
try {
  apiKey = import.meta.env?.VITE_THESPORTSDB_API_KEY || process.env.VITE_THESPORTSDB_API_KEY || '';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  apiKey = process.env.VITE_THESPORTSDB_API_KEY || '';
}

/**
 * Service for interacting with TheSportsDB API
 * https://www.thesportsdb.com/api.php
 */
export const sportsDbApiService = {
  API_KEY: apiKey,
  BASE_URL: 'https://www.thesportsdb.com/api/v1/json',
  
  /**
   * Initialize the service
   */
  initialize: () => {
    console.log('Initializing TheSportsDB API Service');
    console.log(`TheSportsDB API key ${sportsDbApiService.API_KEY ? 'is set' : 'is NOT set'}`);
    if (sportsDbApiService.API_KEY) {
      console.log(`🔑 TheSportsDB API Key (masked): ${sportsDbApiService.API_KEY.substring(0, 3)}...`);
    } else {
      console.error('❌ VITE_THESPORTSDB_API_KEY environment variable is not set!');
    }
    return sportsDbApiService.API_KEY !== '';
  },
  
  // League IDs for TheSportsDB API
  leagueIds: {
    NBA: 4387,  // NBA
    NHL: 4380,  // NHL
    MLB: 4424   // MLB
  },
  
  /**
   * Get events (games) for a specific date and league
   * @param {number} leagueId - League ID (e.g. 4387 for NBA)
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of game results
   */
  getEventsByDate: async (leagueId, date) => {
    try {
      if (!sportsDbApiService.API_KEY) {
        throw new Error('TheSportsDB API key not configured');
      }
      
      console.log(`Fetching games for league ID ${leagueId} on ${date} from TheSportsDB API`);
      
      // Format date for API (YYYY-MM-DD)
      const formattedDate = new Date(date).toISOString().split('T')[0];
      
      // First try the regular eventsday endpoint
      const url = `${sportsDbApiService.BASE_URL}/${sportsDbApiService.API_KEY}/eventsday.php`;
      const response = await axios.get(url, {
        params: {
          d: formattedDate,   // Date parameter
          l: leagueId         // League ID parameter
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Failed to fetch games: ${response.status}`);
      }
      
      // The API returns { events: [...] } or null if no events
      let events = response.data.events || [];
      
      // If we don't have enough events, try the livescore endpoint as backup
      if (events.length < 2) {
        try {
          // Determine the sport type based on the league ID
          let sportType = 'soccer'; // default
          if (leagueId === sportsDbApiService.leagueIds.NBA) sportType = 'basketball';
          if (leagueId === sportsDbApiService.leagueIds.NHL) sportType = 'icehockey';
          if (leagueId === sportsDbApiService.leagueIds.MLB) sportType = 'baseball';
          
          console.log(`Trying livescore API for ${sportType} games on ${date}`);
          const livescoreUrl = `https://www.thesportsdb.com/api/v2/json/${sportsDbApiService.API_KEY}/livescore/${sportType}`;
          
          const livescoreResponse = await axios.get(livescoreUrl);
          if (livescoreResponse.status === 200 && livescoreResponse.data) {
            // Filter results for the requested date
            const livescoreEvents = livescoreResponse.data.livescore || [];
            const dateEvents = livescoreEvents.filter(event => event.dateEvent === formattedDate);
            
            console.log(`Found ${dateEvents.length} livescore events for ${sportType} on ${date}`);
            
            // Combine with regular events
            if (dateEvents.length > 0) {
              events = [...events, ...dateEvents];
              // Deduplicate by event ID
              const uniqueEvents = events.filter((event, index, self) => 
                index === self.findIndex(e => e.idEvent === event.idEvent)
              );
              events = uniqueEvents;
            }
          }
        } catch (livescoreError) {
          console.warn(`Livescore API fallback failed: ${livescoreError.message}`);
        }
      }
      
      console.log(`Found ${events.length} games for league ID ${leagueId} on ${date}`);
      
      // If we have events, log the first one to see structure
      if (events.length > 0) {
        console.log('Sample event data:', JSON.stringify(events[0], null, 2));
      }
      
      return events;
    } catch (error) {
      console.error('Error fetching games from TheSportsDB API:', error);
      throw error;
    }
  },
  
  /**
   * Get events for all supported leagues on a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Object with events grouped by league
   */
  getAllSportsEvents: async (date) => {
    try {
      if (!sportsDbApiService.API_KEY) {
        throw new Error('TheSportsDB API key not configured');
      }
      
      console.log(`Fetching events for all leagues on ${date} from TheSportsDB API`);
      
      // Define all leagues we want to fetch
      const leagues = [
        { id: sportsDbApiService.leagueIds.NBA, name: 'NBA' },
        { id: sportsDbApiService.leagueIds.NHL, name: 'NHL' },
        { id: sportsDbApiService.leagueIds.MLB, name: 'MLB' }
      ];
      
      // Fetch games for each league in parallel
      const eventsPromises = leagues.map(league => 
        sportsDbApiService.getEventsByDate(league.id, date)
          .then(events => ({ league: league.name, events }))
          .catch(error => {
            console.error(`Failed to fetch events for ${league.name}:`, error);
            return { league: league.name, events: [] };
          })
      );
      
      const eventsResults = await Promise.all(eventsPromises);
      
      // Format the results by league
      const allEvents = {};
      eventsResults.forEach(result => {
        allEvents[result.league] = result.events;
      });
      
      // Count total games found
      const totalGames = Object.values(allEvents).reduce(
        (total, leagueEvents) => total + leagueEvents.length, 0
      );
      
      console.log(`Found a total of ${totalGames} games across all leagues for ${date}`);
      return allEvents;
    } catch (error) {
      console.error('Error fetching all league events from TheSportsDB API:', error);
      throw error;
    }
  },
  
  /**
   * Determine if a pick won, lost, or pushed based on the game result
   * @param {Object} event - Event data from TheSportsDB API
   * @param {string} pickText - The text of the pick
   * @returns {Object} Result object with result and score
   */
  evaluatePick: (event, pickText) => {
    // Skip if we don't have scores
    if (!event.intHomeScore && !event.intAwayScore) {
      return { result: 'unknown', score: 'Scores not available' };
    }
    
    // Get the scores (convert to numbers)
    const homeScore = parseInt(event.intHomeScore, 10) || 0;
    const awayScore = parseInt(event.intAwayScore, 10) || 0;
    
    // Format the score string
    const scoreString = `${event.strHomeTeam} ${homeScore} - ${event.strAwayTeam} ${awayScore}`;
    
    // Get the home and away team names
    const homeTeam = event.strHomeTeam;
    const awayTeam = event.strAwayTeam;
    
    // Determine the result based on the pick text
    const pick = pickText.toLowerCase();
    let result = 'unknown';
    
    // Check for spread bets (e.g. "Team +3.5")
    const spreadRegex = /([\w\s]+)\s*([-+]\d+\.?\d*)/i;
    const spreadMatch = pick.match(spreadRegex);
    
    if (spreadMatch) {
      const team = spreadMatch[1].trim();
      const spread = parseFloat(spreadMatch[2]);
      
      // Determine if the team is home or away
      const isHomeTeam = homeTeam.toLowerCase().includes(team);
      const isAwayTeam = awayTeam.toLowerCase().includes(team);
      
      if (isHomeTeam) {
        const adjustedScore = homeScore + spread;
        if (adjustedScore > awayScore) result = 'won';
        else if (adjustedScore < awayScore) result = 'lost';
        else result = 'push';
      } else if (isAwayTeam) {
        const adjustedScore = awayScore + spread;
        if (adjustedScore > homeScore) result = 'won';
        else if (adjustedScore < homeScore) result = 'lost';
        else result = 'push';
      }
    }
    // Check for moneyline bets (e.g. "Team ML")
    else if (pick.includes('ml')) {
      const mlRegex = /([\w\s]+)\s*ml/i;
      const mlMatch = pick.match(mlRegex);
      
      if (mlMatch) {
        const team = mlMatch[1].trim();
        const isHomeTeam = homeTeam.toLowerCase().includes(team);
        const isAwayTeam = awayTeam.toLowerCase().includes(team);
        
        if (isHomeTeam) {
          if (homeScore > awayScore) result = 'won';
          else if (homeScore < awayScore) result = 'lost';
          else result = 'push';
        } else if (isAwayTeam) {
          if (awayScore > homeScore) result = 'won';
          else if (awayScore < homeScore) result = 'lost';
          else result = 'push';
        }
      }
    }
    // Check for over/under bets (e.g. "OVER 220.5")
    else if (pick.includes('over') || pick.includes('under')) {
      const ouRegex = /(over|under)\s*(\d+\.?\d*)/i;
      const ouMatch = pick.match(ouRegex);
      
      if (ouMatch) {
        const overUnder = ouMatch[1].toLowerCase();
        const total = parseFloat(ouMatch[2]);
        const gameTotal = homeScore + awayScore;
        
        if (overUnder === 'over') {
          if (gameTotal > total) result = 'won';
          else if (gameTotal < total) result = 'lost';
          else result = 'push';
        } else { // under
          if (gameTotal < total) result = 'won';
          else if (gameTotal > total) result = 'lost';
          else result = 'push';
        }
      }
    }
    
    return { result, score: scoreString };
  },
  
  /**
   * Check if the API key is valid
   * @returns {Promise<boolean>} True if valid, false otherwise
   */
  checkApiKey: async () => {
    try {
      if (!sportsDbApiService.API_KEY) {
        return false;
      }
      
      // Try a simple API call to check if the key is valid
      const url = `${sportsDbApiService.BASE_URL}/${sportsDbApiService.API_KEY}/all_leagues.php`;
      const response = await axios.get(url);
      
      return response.status === 200 && response.data && response.data.leagues;
    } catch (error) {
      console.error('Error checking TheSportsDB API key:', error);
      return false;
    }
  },
  
  /**
   * Look up a team by name and league
   * @param {string} teamName - The name of the team to look up
   * @param {string} leagueId - The league ID to search in
   * @returns {Promise<Object>} Team data
   */
  lookupTeam: async (teamName, leagueId) => {
    try {
      if (!sportsDbApiService.API_KEY) {
        throw new Error('TheSportsDB API key not configured');
      }
      
      console.log(`Looking up team "${teamName}" in league ${leagueId}`);
      
      // First attempt an exact team search
      const searchUrl = `${sportsDbApiService.BASE_URL}/${sportsDbApiService.API_KEY}/searchteams.php`;
      const searchResponse = await axios.get(searchUrl, {
        params: {
          t: teamName
        }
      });
      
      let teams = searchResponse.data.teams || [];
      
      // Filter by league if we have multiple results
      if (teams.length > 1 && leagueId) {
        teams = teams.filter(team => team.idLeague == leagueId);
      }
      
      // If we found a team, return it
      if (teams.length > 0) {
        console.log(`Found team: ${teams[0].strTeam}`);
        return teams[0];
      }
      
      // If not found with exact match, try a partial match
      console.log(`No exact match found for "${teamName}", trying partial search...`);
      
      // Get all teams in the league
      const leagueUrl = `${sportsDbApiService.BASE_URL}/${sportsDbApiService.API_KEY}/lookup_all_teams.php`;
      const leagueResponse = await axios.get(leagueUrl, {
        params: {
          id: leagueId
        }
      });
      
      const leagueTeams = leagueResponse.data.teams || [];
      
      // Try to find a team with a partial name match
      const normalizedTeamName = teamName.toLowerCase().replace(/\s+/g, '');
      const matchedTeam = leagueTeams.find(team => {
        const normalizedStrTeam = team.strTeam.toLowerCase().replace(/\s+/g, '');
        return normalizedStrTeam.includes(normalizedTeamName) || 
              normalizedTeamName.includes(normalizedStrTeam);
      });
      
      if (matchedTeam) {
        console.log(`Found team with partial match: ${matchedTeam.strTeam}`);
        return matchedTeam;
      }
      
      console.log(`Could not find team "${teamName}" in league ${leagueId}`);
      return null;
    } catch (error) {
      console.error(`Error looking up team "${teamName}":`, error);
      return null;
    }
  },
  
  /**
   * Get players for a specific team
   * @param {string} teamId - The ID of the team to get players for
   * @returns {Promise<Array>} Array of players
   */
  getTeamPlayers: async (teamId) => {
    try {
      if (!sportsDbApiService.API_KEY || !teamId) {
        throw new Error('TheSportsDB API key or teamId not configured');
      }
      
      console.log(`Fetching players for team ID ${teamId}`);
      
      const url = `${sportsDbApiService.BASE_URL}/${sportsDbApiService.API_KEY}/lookup_all_players.php`;
      const response = await axios.get(url, {
        params: {
          id: teamId
        }
      });
      
      const players = response.data.player || [];
      console.log(`Found ${players.length} players for team ID ${teamId}`);
      
      return players;
    } catch (error) {
      console.error(`Error fetching players for team ID ${teamId}:`, error);
      return [];
    }
  },
  
  /**
   * Get NBA team roster (current active players only)
   * @param {string} teamName - The name of the NBA team
   * @returns {Promise<Array>} Array of current active players
   */
  getNbaTeamRoster: async (teamName) => {
    try {
      if (!sportsDbApiService.API_KEY) {
        throw new Error('TheSportsDB API key not configured');
      }
      
      console.log(`Fetching current roster for NBA team "${teamName}"`);
      
      // First look up the team ID by name
      const team = await sportsDbApiService.lookupTeam(teamName, sportsDbApiService.leagueIds.NBA);
      
      if (!team || !team.idTeam) {
        console.error(`Could not find NBA team "${teamName}"`);
        return [];
      }
      
      // Get all players for this team (only active roster is returned)
      return await sportsDbApiService.getTeamPlayers(team.idTeam);
    } catch (error) {
      console.error(`Error fetching NBA roster for team "${teamName}":`, error);
      return [];
    }
  },
  
  /**
   * Get player statistics for prop betting
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} league - League code (NBA, MLB, NHL)
   * @returns {Promise<Object>} Player statistics object
   */
  getPlayerStatsForProps: async (homeTeam, awayTeam, league) => {
    try {
      console.log(`Fetching player statistics for ${homeTeam} vs ${awayTeam} (${league})`);
      
      if (!sportsDbApiService.API_KEY) {
        throw new Error('TheSportsDB API key not configured');
      }
      
      let leagueId;
      switch(league) {
        case 'NBA':
          leagueId = sportsDbApiService.leagueIds.NBA;
          break;
        case 'MLB':
          leagueId = sportsDbApiService.leagueIds.MLB;
          break;
        case 'NHL':
          leagueId = sportsDbApiService.leagueIds.NHL;
          break;
        default:
          throw new Error(`Unsupported league: ${league}`);
      }
      
      // Get team IDs
      const homeTeamData = await sportsDbApiService.lookupTeam(homeTeam, leagueId);
      const awayTeamData = await sportsDbApiService.lookupTeam(awayTeam, leagueId);
      
      if (!homeTeamData || !awayTeamData) {
        throw new Error(`Could not find team data for ${homeTeam} or ${awayTeam}`);
      }
      
      // Get players for both teams
      const [homePlayers, awayPlayers] = await Promise.all([
        sportsDbApiService.getTeamPlayers(homeTeamData.idTeam),
        sportsDbApiService.getTeamPlayers(awayTeamData.idTeam)
      ]);
      
      // Process player data to include only relevant stats
      const processPlayers = (players, isHomeTeam) => {
        return players.map(player => {
          // Extract relevant stats based on league
          let playerStats = {};
          
          // Common fields
          playerStats = {
            player_id: player.idPlayer,
            name: player.strPlayer,
            position: player.strPosition,
            team: isHomeTeam ? homeTeam : awayTeam,
            height: player.strHeight || 'N/A',
            weight: player.strWeight || 'N/A',
            birth_date: player.dateBorn || 'N/A',
            nationality: player.strNationality || 'N/A'
          };
          
          // Add league-specific stats if available
          return playerStats;
        });
      };
      
      const homeTeamPlayers = processPlayers(homePlayers, true);
      const awayTeamPlayers = processPlayers(awayPlayers, false);
      
      console.log(`Found ${homeTeamPlayers.length} players for ${homeTeam} and ${awayTeamPlayers.length} players for ${awayTeam}`);
      
      return {
        homeTeam: {
          team_id: homeTeamData.idTeam,
          name: homeTeam,
          players: homeTeamPlayers
        },
        awayTeam: {
          team_id: awayTeamData.idTeam,
          name: awayTeam,
          players: awayTeamPlayers
        },
        meta: {
          league: league,
          timestamp: new Date().toISOString(),
          source: 'TheSportsDB API'
        }
      };
    } catch (error) {
      console.error(`Error fetching player statistics: ${error.message}`);
      return {
        error: error.message,
        meta: {
          timestamp: new Date().toISOString()
        }
      };
    }
  }
};

// Initialize on import
sportsDbApiService.initialize();
