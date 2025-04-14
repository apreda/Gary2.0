import axios from 'axios';

/**
 * Service for fetching data from The Odds API via our proxy
 * This helps avoid CORS issues by using a server-side proxy
 */
export const oddsProxyService = {
  /**
   * Get sports list available from the API via proxy
   * @returns {Promise<Array>} List of available sports
   */
  getSports: async () => {
    try {
      console.log('📊 Fetching sports via proxy service...');
      
      // Try the direct API first (for local development with CORS extensions)
      try {
        const directResponse = await axios.get(`https://api.the-odds-api.com/v4/sports`, {
          params: {
            apiKey: import.meta.env.VITE_ODDS_API_KEY
          }
        });
        console.log(`✅ Successfully retrieved ${directResponse.data.length} sports directly`);
        return directResponse.data;
      } catch (directError) {
        console.log('Direct API call failed, trying proxy:', directError.message);
      }
      
      // Fall back to the proxy if direct call fails
      const response = await axios.get('/api/odds-proxy?endpoint=sports');
      console.log(`✅ Successfully retrieved ${response.data.length} sports via proxy`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching sports:', error.response?.data || error.message);
      throw new Error(`Failed to fetch sports: ${error.message}`);
    }
  },

  /**
   * Get odds for a specific sport via proxy
   * @param {string} sport - Sport key
   * @returns {Promise<Array>} - Odds data
   */
  getOdds: async (sport) => {
    try {
      console.log(`📊 Fetching odds for ${sport} via proxy...`);
      
      // Try direct API first
      try {
        const params = {
          apiKey: import.meta.env.VITE_ODDS_API_KEY,
          regions: 'us',
          markets: 'spreads,totals,h2h',
          oddsFormat: 'american'
        };
        
        const directResponse = await axios.get(`https://api.the-odds-api.com/v4/sports/${sport}/odds`, { params });
        console.log(`✅ Retrieved ${directResponse.data.length} games for ${sport} directly`);
        return directResponse.data;
      } catch (directError) {
        console.log(`Direct API call for ${sport} failed, trying proxy:`, directError.message);
      }
      
      // Fall back to proxy
      const proxyUrl = `/api/odds-proxy?endpoint=sports/${sport}/odds&regions=us&markets=spreads,totals,h2h&oddsFormat=american`;
      const response = await axios.get(proxyUrl);
      
      console.log(`✅ Retrieved ${response.data.length} games for ${sport} via proxy`);
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching odds for ${sport}:`, error.response?.data || error.message);
      throw new Error(`Failed to fetch odds for ${sport}: ${error.message}`);
    }
  },

  /**
   * Get batch odds for multiple sports
   * @param {Array<string>} sports - Array of sport keys
   * @returns {Promise<Object>} - Object with sports as keys and odds data as values
   */
  getBatchOdds: async (sports) => {
    try {
      console.log(`📊 Fetching batch odds for ${sports.length} sports via proxy...`);
      
      const promises = sports.map(sport => oddsProxyService.getOdds(sport));
      const results = await Promise.allSettled(promises);
      
      // Log any failed requests
      const failedRequests = results
        .map((result, index) => ({ sport: sports[index], result }))
        .filter(item => item.result.status === 'rejected');
      
      if (failedRequests.length > 0) {
        console.warn(`⚠️ Failed to fetch odds for ${failedRequests.length} sports:`, 
          failedRequests.map(item => `${item.sport}: ${item.result.reason}`));
      }
      
      const batchOdds = {};
      sports.forEach((sport, index) => {
        // Only use fulfilled promises
        batchOdds[sport] = results[index].status === 'fulfilled' 
          ? results[index].value 
          : [];
      });
      
      // Check if we got any valid data at all
      const hasAnyValidData = Object.values(batchOdds).some(odds => odds.length > 0);
      
      if (!hasAnyValidData) {
        throw new Error('Failed to get odds for any sports via proxy');
      }
      
      return batchOdds;
    } catch (error) {
      console.error('❌ Error fetching batch odds:', error.message);
      throw error;
    }
  }
};
