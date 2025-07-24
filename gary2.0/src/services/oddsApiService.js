import axios from 'axios';

/**
 * Service for interacting with the Odds API
 * https://the-odds-api.com/
 */
export const oddsApiService = {
  API_KEY: '', // API key should be handled server-side only
  
  /**
   * Initialize the service
   */
  initialize: () => {
    console.log('Initializing Odds API Service');
    console.warn('⚠️ Client-side Odds API calls are deprecated for security. Use server-side proxy instead.');
    return false; // Always return false to prevent client-side usage
  },
  BASE_URL: 'https://api.the-odds-api.com/v4',
  
  // Sport keys for the Odds API
  sportKeys: {
    NBA: 'basketball_nba',
    NHL: 'icehockey_nhl', // Fixed NHL sport key
    MLB: 'baseball_mlb'
  },
  
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
      
      // Construct request URL for completed scores
      const url = `${oddsApiService.BASE_URL}/sports/${sport}/scores/`;
      console.log(`Full API URL: ${url} (requesting completed games for ${date})`);
      
      // Calculate daysFrom based on the date parameter
      const targetDate = new Date(date);
      const today = new Date();
      const diffTime = Math.abs(today - targetDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`Requesting games from ${diffDays} days ago`);
      
      const response = await axios.get(url, {
        params: {
          apiKey: oddsApiService.API_KEY,
          daysFrom: diffDays, // Get games from the specific date
          dateFormat: 'iso', // Use ISO format for dates
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
      
      // Log details about completed games and scores
      const completedGames = games.filter(game => game.completed);
      console.log(`Of which ${completedGames.length} games are completed`);
      
      if (completedGames.length > 0) {
        // Log the first completed game to see structure
        console.log('Sample completed game data:', JSON.stringify(completedGames[0], null, 2));
      }
      
      // For games with missing scores, try to compute them from the score data
      games.forEach(game => {
        if (game.completed && (!game.scores || Object.keys(game.scores).length === 0)) {
          console.log(`Game ${game.id} is marked as completed but has no scores. Checking alternative score fields...`);
          
          // Some API responses might have scores in different formats
          if (game.scores_normalized) {
            console.log('Found normalized scores');
            game.scores = {};
            game.scores[game.home_team] = game.scores_normalized.home_score;
            game.scores[game.away_team] = game.scores_normalized.away_score;
          } else if (game.score) {
            console.log('Found score object');
            game.scores = {};
            game.scores[game.home_team] = game.score.home;
            game.scores[game.away_team] = game.score.away;
          }
        }
      });
      
      return games;
    } catch (error) {
      console.error('Error fetching scores from Odds API:', error);
      throw error;
    }
  },
  
  /**
   * Get scores for all sports (NBA, NHL, MLB) for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Object with scores grouped by sport
   */
  getAllSportsScores: async (date) => {
    try {
      if (!oddsApiService.API_KEY) {
        throw new Error('Odds API key not configured');
      }
      
      console.log(`Fetching scores for all sports on ${date} from Odds API`);
      
      // Define all sports we want to fetch
      const sports = [
        oddsApiService.sportKeys.NBA,
        oddsApiService.sportKeys.NHL,
        oddsApiService.sportKeys.MLB
      ];
      
      // Fetch scores for each sport in parallel
      const scoresPromises = sports.map(sport => oddsApiService.getScores(sport, date));
      const scoresResults = await Promise.allSettled(scoresPromises);
      
      // Process results, including handling errors for individual sports
      const allScores = {};
      
      sports.forEach((sport, index) => {
        const result = scoresResults[index];
        if (result.status === 'fulfilled') {
          allScores[sport] = result.value;
        } else {
          console.error(`Failed to fetch scores for ${sport}:`, result.reason);
          allScores[sport] = [];
        }
      });
      
      // Count total games found
      const totalGames = Object.values(allScores).reduce(
        (total, sportGames) => total + sportGames.length, 0
      );
      
      console.log(`Found a total of ${totalGames} games across all sports for ${date}`);
      return allScores;
    } catch (error) {
      console.error('Error fetching all sports scores from Odds API:', error);
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
