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
      
      // Always use server proxy to avoid exposing the key
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
      
      // Always use server proxy
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
