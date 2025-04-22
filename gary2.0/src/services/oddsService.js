import axios from 'axios';
import { configLoader } from './configLoader';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

/**
 * Service for fetching data from The Odds API
 */
// Bet analysis helper functions
const analyzeBettingMarkets = (game) => {
  if (!game || !game.bookmakers || !Array.isArray(game.bookmakers)) {
    return null;
  }

  const markets = {
    spreads: analyzeSpreadMarket(game.bookmakers),
    totals: analyzeTotalsMarket(game.bookmakers),
    moneyline: analyzeMoneylineMarket(game.bookmakers)
  };

  return findBestOpportunity(markets);
};

const analyzeSpreadMarket = (bookmakers) => {
  const opportunities = [];

  bookmakers.forEach(bookmaker => {
    const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
    if (!spreadMarket) return;

    spreadMarket.outcomes.forEach(outcome => {
      opportunities.push({
        type: 'spread',
        team: outcome.name,
        point: outcome.point,
        odds: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'spread');
};

const analyzeTotalsMarket = (bookmakers) => {
  const opportunities = [];

  bookmakers.forEach(bookmaker => {
    const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
    if (!totalsMarket) return;

    totalsMarket.outcomes.forEach(outcome => {
      opportunities.push({
        type: 'total',
        position: outcome.name,
        point: outcome.point,
        odds: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'total');
};

const analyzeMoneylineMarket = (bookmakers) => {
  const opportunities = [];

  bookmakers.forEach(bookmaker => {
    const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
    if (!h2hMarket) return;

    h2hMarket.outcomes.forEach(outcome => {
      opportunities.push({
        type: 'moneyline',
        team: outcome.name,
        odds: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'moneyline');
};

const findBestInMarket = (opportunities, marketType) => {
  if (opportunities.length === 0) return null;

  const withMetrics = opportunities.map(opp => ({
    ...opp,
    ev: calculateExpectedValue(opp),
    roi: calculateROI(opp)
  }));

  return withMetrics.sort((a, b) => (b.roi + b.ev) - (a.roi + a.ev))[0];
};

const findBestOpportunity = (markets) => {
  const opportunities = Object.values(markets).filter(Boolean);
  if (opportunities.length === 0) return null;

  return opportunities.sort((a, b) => {
    const aScore = a.ev * 0.6 + a.roi * 0.4;
    const bScore = b.ev * 0.6 + b.roi * 0.4;
    return bScore - aScore;
  })[0];
};

const calculateExpectedValue = (opportunity) => {
  const impliedProb = opportunity.odds > 0 
    ? 100 / (opportunity.odds + 100)
    : -opportunity.odds / (-opportunity.odds + 100);
  
  const edge = 0.02;
  return (1 + edge) * impliedProb;
};

const calculateROI = (opportunity) => {
  const impliedProb = opportunity.odds > 0 
    ? 100 / (opportunity.odds + 100)
    : -opportunity.odds / (-opportunity.odds + 100);
  
  return (1 / impliedProb) - 1;
};

export const oddsService = {
  /**
   * Get list of available sports
   * @returns {Promise<Array>} - List of sports
   */
  getSports: async () => {
    try {
      // Get the API key from the config loader
      const apiKey = await configLoader.getOddsApiKey();
      
      // Log API key being used (truncated for security)
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - This will cause picks generation to fail');
        throw new Error('API key is required for The Odds API');
      }
      
      const displayKey = apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING';
      console.log(`🔍 Making API request to The Odds API with key: ${displayKey}`);
      console.log(`🔗 API URL: ${ODDS_API_BASE_URL}/sports`);
      
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports`, {
        params: {
          apiKey: apiKey
        }
      });
      
      console.log(`✅ Successfully retrieved ${response.data.length} sports`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching sports:', error.response?.data || error.message);
      throw new Error('Failed to get sports list. Check API key and network connection.');
    }
  },

  /**
   * Get odds for a specific sport
   * @param {string} sport - Sport key
   * @returns {Promise<Array>} - Odds data
   */
  getOdds: async (sport) => {
    try {
      // Get the API key from the config loader
      const apiKey = await configLoader.getOddsApiKey();
      
      // Check if API key is missing
      if (!apiKey) {
        throw new Error('API Key is missing. Please check your environment variables.');
      }
      
      // Check if it's a futures market (contains "winner" in the key)
      const isFuturesMarket = sport.includes('winner');
      
      // Different endpoints and params for game odds vs futures
      const endpoint = `https://api.the-odds-api.com/v4/sports/${sport}/odds`;
      
      const params = isFuturesMarket
        ? {
            apiKey: apiKey,
            regions: 'us',
            oddsFormat: 'american'
          }
        : {
            apiKey: apiKey,
            regions: 'us',
            markets: 'spreads,totals,h2h',
            oddsFormat: 'american'
          };
      
      console.log(`🔍 Fetching odds for ${sport} from: ${endpoint}`);
      
      const response = await axios.get(endpoint, { params });
      console.log(`✅ Retrieved ${response.data.length} games for ${sport}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching odds for ${sport}:`, error.response?.data || error.message);
      throw new Error(`Failed to fetch odds for ${sport}: ${error.response?.data?.message || error.message}`);
    }
  },

  /**
   * Get batch odds for multiple sports
   * @param {Array<string>} sports - Array of sport keys
   * @returns {Promise<Object>} - Object with sports as keys and odds data as values
   */
  getBatchOdds: async (sports) => {
    try {
      // Handle case where no sports are passed
      if (!sports || sports.length === 0) {
        console.error('No sports provided to getBatchOdds - API returned no active sports');
        throw new Error('No active sports found to get odds for. The API may be experiencing issues.');
      }
      
      console.log(`Fetching batch odds for sports: ${sports.join(', ')}`);
      const promises = sports.map(sport => oddsService.getOdds(sport));
      const results = await Promise.allSettled(promises);
      
      // Log any failed requests
      const failedRequests = results
        .map((result, index) => ({ sport: sports[index], result }))
        .filter(item => item.result.status === 'rejected');
      
      if (failedRequests.length > 0) {
        console.error(`❌ Failed to fetch odds for ${failedRequests.length} sports:`, 
          failedRequests.map(item => `${item.sport}: ${item.result.reason}`))
      }
      
      const batchOdds = {};
      sports.forEach((sport, index) => {
        // Only use fulfilled promises, empty array for rejected ones
        batchOdds[sport] = results[index].status === 'fulfilled' 
          ? results[index].value 
          : [];
      });
      
      // Check if we got any valid data at all
      const hasAnyValidData = Object.values(batchOdds).some(odds => odds.length > 0);
      if (!hasAnyValidData) {
        throw new Error('Failed to get odds for any sports. Check API key and network connection.');
      }
      
      return batchOdds;
    } catch (error) {
      console.error('❌ Error fetching batch odds:', error.message);
      throw error;
    }
  },

  /**
   * Get events for a specific sport
   * @param {string} sport - Sport key (e.g., 'basketball_nba')
   * @returns {Promise<Array>} List of upcoming events
   */
  getEvents: async (sport) => {
    try {
      // Get the API key from the config loader
      const apiKey = await configLoader.getOddsApiKey();
      
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/scores`, {
        params: {
          apiKey: apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching events for ${sport}:`, error);
      throw error;
    }
  }
};
