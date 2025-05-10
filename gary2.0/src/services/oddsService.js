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
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - This will cause picks generation to fail');
        throw new Error('API key is required for The Odds API');
      }
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h,spreads,totals',
          oddsFormat: 'american',
          bookmakers: 'fanduel,draftkings,betmgm,caesars'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching odds for ${sport}:`, error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get odds for multiple sports
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
      
      return batchOdds;
    } catch (error) {
      console.error('❌ Error fetching batch odds:', error);
      throw error;
    }
  },

  /**
   * Get upcoming games with comprehensive odds data
   * @param {string} sport - Sport key
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Upcoming games with odds that happen on the current day
   */
  getUpcomingGames: async (sport = 'upcoming', options = {}) => {
    try {
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch upcoming games');
        throw new Error('API key is required for The Odds API');
      }
      
      // Get the current date in EST timezone (for 12pm cutoff)
      const now = new Date();
      // Convert to EST (UTC-4 or UTC-5 depending on daylight savings)
      const estOffset = -4; // Adjust for daylight savings if needed
      const estTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (estOffset * 3600000));
      
      // Set to 12pm EST today for our reference point
      const twelvePmEST = new Date(estTime);
      twelvePmEST.setHours(12, 0, 0, 0);
      
      // Calculate 12 hours from 12pm EST (midnight EST)
      const cutoffTime = new Date(twelvePmEST.getTime() + (12 * 60 * 60 * 1000));
      
      console.log(`Fetching games between ${twelvePmEST.toISOString()} and ${cutoffTime.toISOString()} EST`);
      
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
        params: {
          apiKey,
          regions: options.regions || 'us',
          markets: options.markets || 'h2h,spreads,totals',
          oddsFormat: options.oddsFormat || 'american',
          bookmakers: options.bookmakers || 'fanduel,draftkings,betmgm,caesars'
        }
      });
      
      // Filter games to only include those happening on the current day (between 12pm-12am EST)
      const filteredGames = response.data.filter(game => {
        const gameTime = new Date(game.commence_time);
        return gameTime >= twelvePmEST && gameTime <= cutoffTime;
      });
      
      console.log(`Filtered from ${response.data.length} games to ${filteredGames.length} games happening between 12pm-12am EST today`);
      
      return filteredGames;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.error('⚠️ API KEY ERROR: The Odds API returned 401 Unauthorized. Your API key has expired or reached its limit. Please update your VITE_ODDS_API_KEY environment variable in Vercel.');
      }
      console.error('Error fetching upcoming games:', error);
      throw error;
    }
  },


  /**
   * Get all available sports
   * @returns {Promise<Array>} List of available sports
   */
  getAllSports: async () => {
    try {
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch all sports');
        throw new Error('API key is required for The Odds API');
      }
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports`, {
        params: { apiKey }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching all sports:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Get line movement data for a specific event using only current odds data
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Line movement analysis
   */
  getLineMovement: async (eventId) => {
    try {
      // Fetch current odds for the event
      // We'll try to infer line movement by comparing available bookmaker lines
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch line movement');
        return {
          hasSignificantMovement: false,
          movement: 0,
          sharpAction: 'No clear sharp action detected',
          publicPercentages: { home: 50, away: 50 }
        };
      }
      // Fetch odds for the event (try all sports, filter for eventId)
      // For efficiency, fetch odds for all prioritized sports and find the event
      // This assumes eventId is unique across prioritized sports (NBA, MLB, NHL)
      const prioritizedSports = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
      let foundGame = null;
      for (const sport of prioritizedSports) {
        try {
          const games = await oddsService.getUpcomingGames(sport);
          foundGame = Array.isArray(games)
            ? games.find(g => g.id === eventId)
            : null;
          if (foundGame) break;
        } catch (sportErr) {
          // Log and continue
          console.error(`Error fetching games for ${sport}:`, sportErr);
        }
      }
      if (!foundGame) {
        console.warn(`No current odds found for eventId: ${eventId}`);
        return {
          hasSignificantMovement: false,
          movement: 0,
          sharpAction: 'No clear sharp action detected',
          publicPercentages: { home: 50, away: 50 }
        };
      }
      // Analyze bookmaker lines for spread and moneyline variance
      const bookmakers = foundGame.bookmakers || [];
      let spreadPoints = [];
      let moneylinesHome = [];
      let moneylinesAway = [];
      bookmakers.forEach(bm => {
        const spreadMarket = bm.markets.find(m => m.key === 'spreads');
        if (spreadMarket && Array.isArray(spreadMarket.outcomes)) {
          spreadMarket.outcomes.forEach(outcome => {
            if (typeof outcome.point === 'number') {
              spreadPoints.push(outcome.point);
            }
          });
        }
        const h2hMarket = bm.markets.find(m => m.key === 'h2h');
        if (h2hMarket && Array.isArray(h2hMarket.outcomes)) {
          if (h2hMarket.outcomes[0] && typeof h2hMarket.outcomes[0].price === 'number') {
            moneylinesHome.push(h2hMarket.outcomes[0].price);
          }
          if (h2hMarket.outcomes[1] && typeof h2hMarket.outcomes[1].price === 'number') {
            moneylinesAway.push(h2hMarket.outcomes[1].price);
          }
        }
      });
      // Calculate movement as the difference between max and min lines
      const spreadMovement =
        spreadPoints.length > 1 ? Math.max(...spreadPoints) - Math.min(...spreadPoints) : 0;
      const moneylineMovementHome =
        moneylinesHome.length > 1 ? Math.max(...moneylinesHome) - Math.min(...moneylinesHome) : 0;
      const moneylineMovementAway =
        moneylinesAway.length > 1 ? Math.max(...moneylinesAway) - Math.min(...moneylinesAway) : 0;
      const hasSignificantMovement =
        Math.abs(spreadMovement) >= 2 ||
        Math.abs(moneylineMovementHome) >= 20 ||
        Math.abs(moneylineMovementAway) >= 20;
      return {
        hasSignificantMovement,
        movement: {
          spread: spreadMovement,
          moneyline: {
            home: moneylineMovementHome,
            away: moneylineMovementAway
          }
        },
        sharpAction: hasSignificantMovement ? 'Significant sharp action detected' : 'No clear sharp action detected',
        publicPercentages: { home: 50, away: 50 }, // Not available from current odds
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error analyzing line movement from current odds:', error);
      // Always return a safe default
      return {
        hasSignificantMovement: false,
        movement: 0,
        sharpAction: 'No clear sharp action detected',
        publicPercentages: { home: 50, away: 50 }
      };
    }
  },


  /**
   * Analyze line movement from historical data
   * @param {Object} historicalData - Historical odds data
   * @returns {Object} Line movement analysis
   */
  analyzeLineMovement: (historicalData) => {
    if (!historicalData || !historicalData.odds || historicalData.odds.length === 0) {
      return {
        hasSignificantMovement: false,
        movement: 0,
        sharpAction: 'No clear sharp action detected',
        publicPercentages: { home: 50, away: 50 }
      };
    }

    const odds = historicalData.odds;
    const firstOdds = odds[0];
    const lastOdds = odds[odds.length - 1];

    const movement = {
      spread: (lastOdds.spread?.point || 0) - (firstOdds.spread?.point || 0),
      moneyline: {
        home: (lastOdds.h2h?.[0] || 0) - (firstOdds.h2h?.[0] || 0),
        away: (lastOdds.h2h?.[1] || 0) - (firstOdds.h2h?.[1] || 0)
      }
    };

    const hasSignificantMovement = Math.abs(movement.spread) >= 2 || 
      Math.abs(movement.moneyline.home) >= 20 ||
      Math.abs(movement.moneyline.away) >= 20;

    return {
      hasSignificantMovement,
      movement,
      sharpAction: hasSignificantMovement ? 'Significant sharp action detected' : 'No clear sharp action',
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Get player prop odds for a specific game
   * @param {string} sport - Sport key (e.g., 'basketball_nba')
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Array>} - Array of player prop odds
   */
  getPlayerPropOdds: async (sport, homeTeam, awayTeam) => {
    try {
      // Get the API key from the config loader
      const apiKey = await configLoader.getOddsApiKey();
      
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch player prop odds');
        return [];
      }

      console.log(`🔍 Fetching player prop odds for ${homeTeam} vs ${awayTeam}`);
      
      // Format today's date in ISO format
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      console.log(`Fetching prop odds for games on ${formattedDate}`);
      
      // First get the event ID for the game by fetching today's games
      const gamesResponse = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h,spreads',
          oddsFormat: 'american',
          dateFormat: 'iso',
          commenceTimeTo: `${formattedDate}T23:59:59Z` // End of today in UTC
        }
      });
      
      // Find the game that matches our home and away teams
      const game = gamesResponse.data.find(g => {
        const gameHomeTeam = g.home_team;
        const gameAwayTeam = g.away_team;
        
        // Try different matching approaches in case of naming differences
        return (
          (gameHomeTeam.includes(homeTeam) || homeTeam.includes(gameHomeTeam)) &&
          (gameAwayTeam.includes(awayTeam) || awayTeam.includes(gameAwayTeam))
        );
      });
      
      if (!game) {
        console.warn(`No game found matching ${homeTeam} vs ${awayTeam} for ${sport}`);
        return [];
      }
      
      console.log(`Found matching game with ID: ${game.id}`);
      
      // Now fetch player props for this specific game
      // NOTE: The Odds API offers player props endpoint only for certain sports and at higher subscription tiers
      // This implementation assumes access to the necessary tier for prop odds
      
      // Determine the appropriate markets based on sport
      let propMarkets = 'player_points';
      
      if (sport === 'basketball_nba') {
        propMarkets = 'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals,player_double_double,player_first_basket,player_points_rebounds_assists';
      } else if (sport === 'baseball_mlb') {
        propMarkets = 'batter_home_runs,batter_hits,batter_runs_scored,batter_rbis,batter_stolen_bases,batter_total_bases,pitcher_strikeouts,pitcher_outs,pitcher_earned_runs';
      } else if (sport === 'icehockey_nhl') {
        propMarkets = 'player_points,player_goals,player_assists,player_shots_on_goal,player_power_play_points';
      }
      
      console.log(`Fetching ${sport} player props with markets: ${propMarkets}`);
      
      const propResponse = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/events/${game.id}/odds`, {
        params: {
          apiKey,
          regions: 'us',
          markets: propMarkets,
          oddsFormat: 'american',
          dateFormat: 'iso'
        }
      });
      
      // If no player props were found, return an empty array - no mock data
      if (!propResponse.data || !propResponse.data.bookmakers || propResponse.data.bookmakers.length === 0) {
        console.warn('No player prop data found from The Odds API');
        return [];
      }
      
      // Process the API response to extract player prop information
      const playerProps = [];
      const bookmakers = propResponse.data.bookmakers;
      
      // Look for a bookmaker with player props
      for (const bookmaker of bookmakers) {
        for (const market of bookmaker.markets) {
          // Extract the prop type from the market key (e.g., player_points → points)
          const propType = market.key.replace('player_', '');
          
          for (const outcome of market.outcomes) {
            playerProps.push({
              player: outcome.description, // Player name
              team: outcome.team, // Team name if available, or derive from game data
              prop_type: propType,
              line: outcome.point,
              over_odds: outcome.name === 'Over' ? outcome.price : null,
              under_odds: outcome.name === 'Under' ? outcome.price : null
            });
          }
        }
      }
      
      // Group over/under odds together for the same player and prop type
      const groupedProps = {};
      for (const prop of playerProps) {
        const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
        if (!groupedProps[key]) {
          groupedProps[key] = {
            player: prop.player,
            team: prop.team,
            prop_type: prop.prop_type,
            line: prop.line,
            over_odds: null,
            under_odds: null
          };
        }
        
        if (prop.over_odds !== null) {
          groupedProps[key].over_odds = prop.over_odds;
        }
        if (prop.under_odds !== null) {
          groupedProps[key].under_odds = prop.under_odds;
        }
      }
      
      // Convert back to array
      const result = Object.values(groupedProps);
      console.log(`Found ${result.length} player props for ${homeTeam} vs ${awayTeam}`);
      
      return result;
      
    } catch (error) {
      console.error('Error fetching player prop odds:', error);
      return [];
    }
  }
};
