import axios from 'axios';
import { configLoader } from './configLoader';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

// Player prop markets by sport
const PROP_MARKETS = {
  basketball_nba: [
    'player_points',
    'player_rebounds',
    'player_assists',
    'player_threes',
    'player_blocks',
    'player_steals'
  ],
  baseball_mlb: [
    'batter_home_runs',
    'batter_hits',
    'batter_runs_scored',
    'batter_rbis',
    'batter_stolen_bases',
    'batter_total_bases',
    'pitcher_strikeouts',
    'pitcher_outs',
    'pitcher_earned_runs'
  ],
  icehockey_nhl: [
    'player_points',
    'player_goals',
    'player_assists',
    'player_shots_on_goal',
    'player_power_play_points'
  ]
};

/**
 * Service for fetching data from The Odds API
 */
const getApiKey = () => {
  // First try environment variable
  let apiKey = process.env.ODDS_API_KEY || import.meta.env.VITE_ODDS_API_KEY;
  
  // Fallback to config loader
  if (!apiKey) {
    try {
      const config = configLoader.getConfig();
      apiKey = config.ODDS_API_KEY;
    } catch (error) {
      console.warn('Could not load ODDS_API_KEY from config:', error);
    }
  }
  
  if (!apiKey) {
    console.error('ODDS_API_KEY is not configured');
  }
  
  return apiKey;
};

/**
 * Fetches completed games from The Odds API for a specific date and sport
 * @param {string} sport - Sport key (nba, nhl, mlb)
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} - Array of completed games with scores
 */
const getCompletedGamesByDate = async (sport, date) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Odds API key not configured');
  }
  
  // Map our internal sport codes to The Odds API sport keys
  const sportKeyMap = {
    'nba': 'basketball_nba',
    'nhl': 'icehockey_nhl',
    'mlb': 'baseball_mlb'
  };
  
  const sportKey = sportKeyMap[sport.toLowerCase()] || sport;
  
  try {
    // Format date for API (The Odds API uses ISO format with timezone)
    const apiDate = new Date(date);
    apiDate.setUTCHours(0, 0, 0, 0);
    const commenceDateFrom = apiDate.toISOString();
    
    // Set end date to the next day
    const endDate = new Date(apiDate);
    endDate.setDate(endDate.getDate() + 1);
    const commenceDateTo = endDate.toISOString();
    
    const url = `${ODDS_API_BASE_URL}/sports/${sportKey}/scores`;
    const params = {
      apiKey,
      daysFrom: 1,
      commenceTimeFrom: commenceDateFrom,
      commenceTimeTo: commenceDateTo
    };
    
    console.log(`Fetching scores from The Odds API for ${sport} on ${date}`);
    const response = await axios.get(url, { params });
    
    if (response.data && Array.isArray(response.data)) {
      // Filter for completed games only and map to our format
      return response.data
        .filter(game => game.completed || game.completed_at)
        .map(game => ({
          id: game.id,
          sport_key: game.sport_key,
          home_team: game.home_team,
          away_team: game.away_team,
          scores: {
            home: game.scores?.[0]?.score || 0,
            away: game.scores?.[1]?.score || 0
          },
          completed: true,
          commence_time: game.commence_time,
          completed_at: game.completed_at
        }));
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching ${sport} scores from The Odds API:`, error);
    return [];
  }
};

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

/**
 * Process market data from bookmakers to extract player props
 * @param {Array} bookmakers - Bookmakers data from the API response
 * @param {string} marketKey - The market key being processed
 * @param {Object} game - Game data for reference
 * @returns {Array} Array of processed player props
 */
const processMarketData = (bookmakers, marketKey, game) => {
  const playerProps = [];
  
  // Look for bookmakers with this market
  for (const bookmaker of bookmakers) {
    for (const market of bookmaker.markets) {
      // Skip if this isn't the market we're processing
      if (market.key !== marketKey) continue;
      
      // Clean up the market key for display (remove player_, batter_, pitcher_ prefixes)
      const propType = market.key
        .replace('player_', '')
        .replace('batter_', '')
        .replace('pitcher_', '');
      
      // Process each outcome for this market
      for (const outcome of market.outcomes) {
        playerProps.push({
          player: outcome.description, // Player name
          team: outcome.team || (outcome.name?.includes(game.home_team) ? game.home_team : game.away_team),
          prop_type: propType,
          line: outcome.point,
          over_odds: outcome.name === 'Over' ? outcome.price : null,
          under_odds: outcome.name === 'Under' ? outcome.price : null
        });
      }
    }
  }
  
  return playerProps;
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
          apiKey
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching sports:', error);
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
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch odds');
        throw new Error('API key is required for The Odds API');
      }
      
      console.log(`Fetching odds for ${sport}`);
      
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h,spreads,totals'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Error fetching odds for ${sport}:`, error);
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
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch batch odds');
        throw new Error('API key is required for The Odds API');
      }
      
      if (!sports || !Array.isArray(sports) || sports.length === 0) {
        console.error('Invalid sports parameter for getBatchOdds');
        return {};
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
   * Fetches completed games from The Odds API for a specific date and sport
   * @param {string} sport - Sport key (nba, nhl, mlb)
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of completed games with scores
   */
  getCompletedGamesByDate,

  /**
   * Get upcoming games with comprehensive odds data
   * @param {string} sport - Sport key
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Upcoming games with odds that happen on the current day (EST timezone)
   */
  getUpcomingGames: async (sport = 'upcoming', options = {}) => {
    try {
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch upcoming games');
        throw new Error('API key is required for The Odds API');
      }
      
      // Get the current date in EST timezone
      const now = new Date();
      // Convert to EST (UTC-4 or UTC-5 depending on daylight savings)
      const estOffset = -4; // Adjust for daylight savings if needed
      const estTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (estOffset * 3600000));
      
      // Create start and end dates for the current day in EST
      const startOfDay = new Date(estTime);
      startOfDay.setHours(0, 0, 0, 0); // Beginning of the day (midnight EST)
      
      const endOfDay = new Date(estTime);
      endOfDay.setHours(23, 59, 59, 999); // End of the day (11:59:59.999 PM EST)
      
      // Format date for logging
      const estDateStr = estTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      console.log(`Fetching games for ${estDateStr} in EST timezone (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);
      
      // Use only basic markets for initial game fetch (prop markets require separate API calls)
      // This avoids 422 Unprocessable Content errors with lower tier API subscriptions
      const marketParams = options.markets || 'h2h,spreads,totals';
      console.log(`Using basic markets for initial game fetch: ${marketParams}`);
      
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
        params: {
          apiKey,
          regions: options.regions || 'us',
          markets: marketParams,
          oddsFormat: options.oddsFormat || 'american',
          bookmakers: options.bookmakers || 'fanduel,draftkings,betmgm,caesars'
        }
      });
      
      // Filter games to only include those happening on the current day in EST timezone
      const filteredGames = response.data.filter(game => {
        if (!game.commence_time) return false;
        const gameTime = new Date(game.commence_time);
        // Convert game time to EST for comparison
        const gameTimeEST = new Date(gameTime.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        return gameTimeEST >= startOfDay && gameTimeEST <= endOfDay;
      });
      
      console.log(`Filtered from ${response.data.length} games to ${filteredGames.length} games happening today in EST timezone`);
      
      return filteredGames;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.error('⚠️ API KEY ERROR: The Odds API returned 401 Unauthorized. Your API key has expired or reached its limit. Please update your VITE_ODDS_API_KEY environment variable in Vercel.');
      }
      console.error('❌ Error fetching upcoming games:', error);
      return [];
    }
  },
  
  
  /**
   * Get all available sports
   * @returns {Promise<Array>} List of available sports
   */
  getAllSports: async () => {
    try {
      console.log('Fetching all available sports...');
      
      const sports = await oddsService.getSports();
      
      if (!sports || !Array.isArray(sports)) {
        console.error('Invalid response from The Odds API when fetching sports');
        return [];
      }
      
      return sports;
    } catch (error) {
      console.error('Error fetching all sports:', error);
      return [];
    }
  },
  
  /**
   * Get line movement data for a specific event using only current odds data
   * @param {string} sport - Sport key (e.g., 'basketball_nba')
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Line movement analysis
   */
  getLineMovement: async (sport, eventId) => {
    try {
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch line movement');
        throw new Error('API key is required for The Odds API');
      }
      
      console.log(`Analyzing line movement for event ${eventId}`);
      
      // Get current odds for this event
      const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/events/${eventId}/odds`, {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h,spreads,totals',
          oddsFormat: 'american',
          dateFormat: 'iso'
        }
      });
      
      // Check if we have valid data
      if (!response.data || !response.data.bookmakers || response.data.bookmakers.length === 0) {
        console.warn('No valid odds data found to analyze line movement');
        return {
          hasSignificantMovement: false,
          sharpAction: 'No data available for line movement analysis',
          timestamp: new Date().toISOString()
        };
      }
      
      // Use data from the top two or three bookmakers since we don't have historical data
      // This is a simplified approach - real line movement analysis requires historical odds data
      const majors = ['draftkings', 'fanduel', 'caesars', 'betmgm'];
      const bookmakers = response.data.bookmakers.filter(b => majors.includes(b.key));
      
      if (bookmakers.length < 2) {
        console.warn('Not enough major bookmakers to analyze line movement properly');
        return {
          hasSignificantMovement: false,
          sharpAction: 'Insufficient bookmaker data for line movement analysis',
          timestamp: new Date().toISOString()
        };
      }
      
      // Analyze spread market differences
      let spreadVariance = 0;
      try {
        const spreadMarkets = bookmakers
          .map(b => b.markets.find(m => m.key === 'spreads'))
          .filter(Boolean)
          .map(m => m.outcomes[0].point);
        
        // Calculate variance in the spread
        if (spreadMarkets.length >= 2) {
          const min = Math.min(...spreadMarkets);
          const max = Math.max(...spreadMarkets);
          spreadVariance = max - min;
        }
      } catch (e) {
        console.error('Error analyzing spread variance:', e);
      }
      
      // Analyze moneyline market differences
      let moneylineVariance = {
        home: 0,
        away: 0
      };
      
      try {
        const h2hMarkets = bookmakers
          .map(b => b.markets.find(m => m.key === 'h2h'))
          .filter(Boolean);
        
        if (h2hMarkets.length >= 2) {
          // Get home team odds
          const homeOdds = h2hMarkets.map(m => {
            const homeOutcome = m.outcomes.find(o => o.name === response.data.home_team);
            return homeOutcome ? homeOutcome.price : null;
          }).filter(Boolean);
          
          // Get away team odds
          const awayOdds = h2hMarkets.map(m => {
            const awayOutcome = m.outcomes.find(o => o.name === response.data.away_team);
            return awayOutcome ? awayOutcome.price : null;
          }).filter(Boolean);
          
          if (homeOdds.length >= 2) {
            const minHomeOdds = Math.min(...homeOdds);
            const maxHomeOdds = Math.max(...homeOdds);
            moneylineVariance.home = maxHomeOdds - minHomeOdds;
          }
          
          if (awayOdds.length >= 2) {
            const minAwayOdds = Math.min(...awayOdds);
            const maxAwayOdds = Math.max(...awayOdds);
            moneylineVariance.away = maxAwayOdds - minAwayOdds;
          }
        }
      } catch (e) {
        console.error('Error analyzing moneyline variance:', e);
      }
      
      // Determine if there's significant movement based on variance
      // These thresholds are somewhat arbitrary and could be tuned
      const hasSignificantMovement = spreadVariance >= 1 ||
        Math.abs(moneylineVariance.home) >= 15 ||
        Math.abs(moneylineVariance.away) >= 15;
      
      const lineMovementAnalysis = {
        hasSignificantMovement,
        variance: {
          spread: spreadVariance,
          moneyline: moneylineVariance
        },
        sharpAction: hasSignificantMovement ? 
          'Significant line discrepancies detected across major bookmakers' : 
          'No significant line discrepancies',
        timestamp: new Date().toISOString()
      };
      
      console.log('Line movement analysis:', lineMovementAnalysis);
      
      return lineMovementAnalysis;
    } catch (error) {
      console.error('Error analyzing line movement:', error);
      return {
        hasSignificantMovement: false,
        error: error.message,
        sharpAction: 'Error occurred during line movement analysis',
        timestamp: new Date().toISOString()
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
      const apiKey = await configLoader.getOddsApiKey();
      if (!apiKey) {
        console.error('⚠️ API key is missing - Cannot fetch player prop odds');
        return [];
      }
      
      // First, find the game ID by looking for a game with matching team names
      console.log(`Looking for game: ${homeTeam} vs ${awayTeam} in ${sport}`);
      
      // When fetching games, the markets parameter will already include prop markets
      // due to our update in getUpcomingGames
      const allGames = await oddsService.getUpcomingGames(sport);
      
      if (!allGames || allGames.length === 0) {
        console.warn(`No games found for ${sport}`);
        return [];
      }
      
      console.log(`Found ${allGames.length} games for ${sport}, looking for ${homeTeam} vs ${awayTeam}`);
      
      // Find the specific game with matching team names
      // Use inclusion check to handle slight name variations
      const game = allGames.find(g => {
        const gameHomeTeam = g.home_team.toLowerCase();
        const gameAwayTeam = g.away_team.toLowerCase();
        const searchHomeTeam = homeTeam.toLowerCase();
        const searchAwayTeam = awayTeam.toLowerCase();
        
        // Check if the team names contain each other (bidirectional inclusion)
        return (
          (gameHomeTeam.includes(searchHomeTeam) || searchHomeTeam.includes(gameHomeTeam)) &&
          (gameAwayTeam.includes(searchAwayTeam) || searchAwayTeam.includes(gameAwayTeam))
        );
      });
      
      if (!game) {
        console.warn(`No game found matching ${homeTeam} vs ${awayTeam} for ${sport}`);
        return [];
      }
      
      console.log(`Found matching game with ID: ${game.id}`);
      
      // Get the appropriate prop markets for this sport from our constants
      const marketsList = sport in PROP_MARKETS ? 
        PROP_MARKETS[sport] : 
        ['player_points']; // Default to player_points if sport not defined
      
      console.log(`Will fetch individual prop markets for ${sport}: ${marketsList.join(', ')}`);
      
      // Fetch each market type individually to avoid 422 errors
      // This works better with the API's structure
      const allPlayerProps = [];
      
      for (const market of marketsList) {
        console.log(`Fetching ${sport} player props for market: ${market}`);
        
        try {
          const propResponse = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/events/${game.id}/odds`, {
            params: {
              apiKey,
              regions: 'us',
              markets: market, // Just one market at a time
              oddsFormat: 'american',
              dateFormat: 'iso'
            }
          });
          
          // If we got valid data, process it
          if (propResponse.data && 
              propResponse.data.bookmakers && 
              propResponse.data.bookmakers.length > 0) {
                
            // Process each bookmaker's data for this market
            const bookmakers = propResponse.data.bookmakers;
            
            // Extract props data for this market and add to our collection
            const marketProps = processMarketData(bookmakers, market, game);
            allPlayerProps.push(...marketProps);
          }
        } catch (err) {
          // Handle 404 error for this specific market (just continue to next market)
          if (err.response && err.response.status === 404) {
            console.warn(`No data available for ${market} in game ${game.id}, continuing to next market`);
            continue;
          } else if (err.response && err.response.status === 422) {
            console.warn(`API cannot process ${market} market request (422 error), continuing to next market`);
            continue;
          } else {
            console.error(`Error fetching ${market} data:`, err);
          }
        }
      }
      
      // If we didn't find any props after trying all markets
      if (allPlayerProps.length === 0) {
        console.warn('No player prop data found from The Odds API after trying all markets');
        return [];
      }
      
      // Group over/under odds together for the same player and prop type
      const groupedProps = {};
      for (const prop of allPlayerProps) {
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
