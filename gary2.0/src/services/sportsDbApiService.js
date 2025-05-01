import axios from 'axios';

/**
 * Service for interacting with TheSportsDB API
 * https://www.thesportsdb.com/api.php
 */
export const sportsDbApiService = {
  API_KEY: import.meta.env.VITE_THESPORTSDB_API_KEY || '',
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
      const events = response.data.events || [];
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
  }
};

// Initialize on import
sportsDbApiService.initialize();
