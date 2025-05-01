import axios from 'axios';

/**
 * Service for interacting with the Odds API
 * https://the-odds-api.com/
 */
export const oddsApiService = {
  API_KEY: import.meta.env.VITE_ODDS_API_KEY || '',
  BASE_URL: 'https://api.the-odds-api.com/v4',
  
  /**
   * Get scores for a specific sport and date
   * @param {string} sport - Sport key (e.g. 'basketball_nba', 'baseball_mlb')
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of game results
   */
  getScores: async (sport, date) => {
    try {
      if (!oddsApiService.API_KEY) {
        throw new Error('Odds API key not configured');
      }
      
      console.log(`Fetching scores for ${sport} on ${date} from Odds API`);
      
      const url = `${oddsApiService.BASE_URL}/sports/${sport}/scores/`;
      const response = await axios.get(url, {
        params: {
          apiKey: oddsApiService.API_KEY,
          daysFrom: 1, // Get games from the last day
          dateFormat: 'iso' // Use ISO format for dates
        }
      });
      
      if (response.status !== 200) {
        throw new Error(`Failed to fetch scores: ${response.status}`);
      }
      
      // Filter for games on the specific date
      const formattedDate = new Date(date).toISOString().split('T')[0];
      const games = response.data.filter(game => {
        const gameDate = new Date(game.commence_time).toISOString().split('T')[0];
        return gameDate === formattedDate;
      });
      
      console.log(`Found ${games.length} games for ${sport} on ${date}`);
      return games;
    } catch (error) {
      console.error('Error fetching scores from Odds API:', error);
      throw error;
    }
  },
  
  /**
   * Determine if a pick won, lost, or pushed based on the game result
   * @param {Object} game - Game data from the Odds API
   * @param {string} pickText - The text of the pick
   * @returns {Object} Result object with result and score
   */
  evaluatePick: (game, pickText) => {
    // Skip if the game is not completed
    if (!game.completed) {
      return { result: 'unknown', score: 'Game not completed' };
    }
    
    // Get the scores
    const homeScore = game.scores?.[game.home_team] || 0;
    const awayScore = game.scores?.[game.away_team] || 0;
    
    // Format the score string
    const scoreString = `${game.home_team} ${homeScore} - ${game.away_team} ${awayScore}`;
    
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
      const isHomeTeam = game.home_team.toLowerCase().includes(team);
      const isAwayTeam = game.away_team.toLowerCase().includes(team);
      
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
        const isHomeTeam = game.home_team.toLowerCase().includes(team);
        const isAwayTeam = game.away_team.toLowerCase().includes(team);
        
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
      if (!oddsApiService.API_KEY) {
        return false;
      }
      
      // Try a simple API call to check if the key is valid
      const url = `${oddsApiService.BASE_URL}/sports`;
      const response = await axios.get(url, {
        params: {
          apiKey: oddsApiService.API_KEY
        }
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('Error checking Odds API key:', error);
      return false;
    }
  }
};
