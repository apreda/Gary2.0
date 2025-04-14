import axios from 'axios';

const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

/**
 * Service for fetching data from The Odds API
 */
export const oddsService = {
  /**
   * Get sports list available from the API
   * @returns {Promise<Array>} List of available sports
   */
  getSports: async () => {
    try {
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports`, {
        params: {
          apiKey: ODDS_API_KEY
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching sports:', error);
      throw error;
    }
  },

  /**
   * Get odds for a specific sport
   * @param {string} sport - Sport key
   * @returns {Promise<Array>} - Odds data
   */
  getOdds: async (sport) => {
    try {
      // Check if it's a futures market (contains "winner" in the key)
      const isFuturesMarket = sport.includes('winner');
      
      // Different endpoints and params for game odds vs futures
      const endpoint = isFuturesMarket 
        ? `https://api.the-odds-api.com/v4/sports/${sport}/odds`
        : `https://api.the-odds-api.com/v4/sports/${sport}/odds`;
      
      const params = isFuturesMarket
        ? {
            apiKey: ODDS_API_KEY,
            regions: 'us',
            oddsFormat: 'american'
          }
        : {
            apiKey: ODDS_API_KEY,
            regions: 'us',
            markets: 'spreads,totals,h2h',
            oddsFormat: 'american'
          };
      
      const response = await axios.get(endpoint, { params });
      return response.data;
    } catch (error) {
      console.error(`Error fetching odds for ${sport}:`, error);
      // Return empty array instead of throwing
      return [];
    }
  },

  /**
   * Get batch odds for multiple sports
   * @param {Array<string>} sports - Array of sport keys
   * @returns {Promise<Object>} - Object with sports as keys and odds data as values
   */
  getBatchOdds: async (sports) => {
    try {
      const promises = sports.map(sport => oddsService.getOdds(sport));
      const results = await Promise.allSettled(promises);
      
      const batchOdds = {};
      sports.forEach((sport, index) => {
        // Only use fulfilled promises, empty array for rejected ones
        batchOdds[sport] = results[index].status === 'fulfilled' 
          ? results[index].value 
          : [];
      });
      
      return batchOdds;
    } catch (error) {
      console.error('Error fetching batch odds:', error);
      // Return empty object instead of throwing
      return sports.reduce((acc, sport) => {
        acc[sport] = [];
        return acc;
      }, {});
    }
  },

  /**
   * Get events for a specific sport
   * @param {string} sport - Sport key (e.g., 'basketball_nba')
   * @returns {Promise<Array>} List of upcoming events
   */
  getEvents: async (sport) => {
    try {
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/scores`, {
        params: {
          apiKey: ODDS_API_KEY
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching events for ${sport}:`, error);
      throw error;
    }
  }
};
