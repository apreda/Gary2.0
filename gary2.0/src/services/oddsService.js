/**
 * Service for fetching data from The Odds API
 */
import axios from 'axios';
import { configLoader } from './configLoader.js';

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
const getApiKey = async () => {
  // First try environment variable
  let apiKey = process.env.ODDS_API_KEY || import.meta.env.VITE_ODDS_API_KEY;
  
  // Fallback to config loader
  if (!apiKey) {
    try {
      apiKey = await configLoader.getOddsApiKey();
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
  const apiKey = await getApiKey();
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
        price: outcome.price,
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
        position: outcome.name, // over or under
        point: outcome.point,
        price: outcome.price,
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
        price: outcome.price,
        bookmaker: bookmaker.key
      });
    });
  });

  return findBestInMarket(opportunities, 'moneyline');
};

const findBestInMarket = (opportunities, marketType) => {
  if (!opportunities.length) return null;

  opportunities.forEach(opp => {
    opp.ev = calculateExpectedValue(opp);
    opp.roi = calculateROI(opp);
  });

  return opportunities.sort((a, b) => b.ev - a.ev)[0];
};

const findBestOpportunity = (markets) => {
  const bestOpportunities = [];
  
  for (const market in markets) {
    if (markets[market]) bestOpportunities.push(markets[market]);
  }
  
  if (!bestOpportunities.length) return null;
  
  return bestOpportunities.sort((a, b) => b.ev - a.ev)[0];
};

const calculateExpectedValue = (opportunity) => {
  // Simplified EV calculation
  // In a real-world scenario, you would use your own model to estimate win probability
  const winProb = 0.5; // Assuming 50% win probability for simplicity
  return (opportunity.price * winProb) - (1 - winProb);
};

const calculateROI = (opportunity) => {
  // Converting American odds to decimal
  let decimalOdds = opportunity.price;
  if (decimalOdds < 0) {
    decimalOdds = (100 / Math.abs(decimalOdds)) + 1;
  } else {
    decimalOdds = (decimalOdds / 100) + 1;
  }
  return ((decimalOdds - 1) * 100).toFixed(2) + '%';
};

// Process market data from bookmakers to extract player props
const processMarketData = (bookmakers, marketKey, game) => {
  const playerProps = [];
  
  for (const bookmaker of bookmakers) {
    const market = bookmaker.markets.find(m => m.key === marketKey);
    if (!market || !market.outcomes) continue;
    
    for (const outcome of market.outcomes) {
      if (!outcome.description) continue;
      
      // Get player name, team, line, and over/under direction
      try {
        const player = outcome.description;
        const team = determinePlayerTeam(player, game);
        const point = outcome.point || null;
        
        // Extract over/under odds
        if (outcome.name.toLowerCase() === 'over') {
          playerProps.push({
            player,
            team,
            prop_type: marketKey,
            line: point,
            over_odds: outcome.price,
            under_odds: null,
            bookmaker: bookmaker.key
          });
        } else if (outcome.name.toLowerCase() === 'under') {
          playerProps.push({
            player,
            team,
            prop_type: marketKey,
            line: point,
            over_odds: null,
            under_odds: outcome.price,
            bookmaker: bookmaker.key
          });
        }
      } catch (err) {
        console.warn(`Error processing prop data: ${err.message}`);
      }
    }
  }
  
  // Simple team determination (can be enhanced for better accuracy)
  function determinePlayerTeam(playerName, game) {
    if (!game) return 'unknown';
    return game.home_team || game.homeTeam || 'unknown';
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
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      const url = `${ODDS_API_BASE_URL}/sports`;
      const response = await axios.get(url, { 
        params: { 
          apiKey,
          all: true
        } 
      });
      
      if (response.data) {
        return response.data.map(sport => ({
          key: sport.key,
          group: sport.group,
          title: sport.title,
          description: sport.description,
          active: sport.active,
          has_outrights: sport.has_outrights
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching sports from The Odds API:', error);
      return [];
    }
  },
  
  /**
   * Get odds for a specific sport
   * @param {string} sport - Sport key
   * @returns {Promise<Array>} - Odds data
   */
  getOdds: async (sport) => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      const url = `${ODDS_API_BASE_URL}/sports/${sport}/odds`;
      const response = await axios.get(url, { 
        params: { 
          apiKey,
          regions: 'us',
          oddsFormat: 'american'
        } 
      });
      
      if (response.data) {
        return response.data;
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching odds for ${sport} from The Odds API:`, error);
      return [];
    }
  },
  
  /**
   * Get odds for multiple sports
   * @param {Array<string>} sports - Array of sport keys
   * @returns {Promise<Object>} - Object with sports as keys and odds data as values
   */
  getBatchOdds: async (sports) => {
    try {
      if (!Array.isArray(sports) || sports.length === 0) {
        return {};
      }
      
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      // Create a promise for each sport
      const promises = sports.map(sport => 
        axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, { 
          params: { 
            apiKey,
            regions: 'us',
            oddsFormat: 'american'
          } 
        })
        .then(response => ({ sport, data: response.data }))
        .catch(error => {
          console.error(`Error fetching odds for ${sport}:`, error);
          return { sport, data: [] };
        })
      );
      
      // Wait for all promises to resolve
      const results = await Promise.all(promises);
      
      // Convert results to object
      return results.reduce((acc, { sport, data }) => {
        acc[sport] = data;
        return acc;
      }, {});
    } catch (error) {
      console.error('Error fetching batch odds:', error);
      return {};
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
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      const params = {
        apiKey,
        regions: options.regions || 'us',
        markets: options.markets || 'h2h,spreads,totals',
        oddsFormat: options.oddsFormat || 'american',
        dateFormat: 'iso',
        sport: sport
      };
      
      const url = `${ODDS_API_BASE_URL}/sports/${sport}/odds`;
      const response = await axios.get(url, { params });
      
      if (response.data) {
        const games = response.data;
        
        // Process games to add bet analysis
        const processedGames = games.map(game => {
          // Find the best betting opportunity for this game
          const bestOpportunity = analyzeBettingMarkets(game);
          
          return {
            ...game,
            bestBet: bestOpportunity
          };
        });
        
        return processedGames;
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching upcoming games for ${sport}:`, error);
      return [];
    }
  },
  
  /**
   * Get all available sports
   * @returns {Promise<Array>} List of available sports
   */
  getAllSports: async () => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      const url = `${ODDS_API_BASE_URL}/sports`;
      const response = await axios.get(url, { 
        params: { 
          apiKey,
          all: true
        } 
      });
      
      return response.data || [];
    } catch (error) {
      console.error('Error fetching sports list:', error);
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
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      // Get current odds for the event
      const url = `${ODDS_API_BASE_URL}/sports/${sport}/events/${eventId}/odds`;
      const response = await axios.get(url, { 
        params: { 
          apiKey,
          regions: 'us',
          oddsFormat: 'american',
          markets: 'h2h,spreads,totals'
        } 
      });
      
      if (!response.data || !response.data.bookmakers || response.data.bookmakers.length === 0) {
        return {
          success: false,
          message: 'No odds data available for this event'
        };
      }
      
      const game = response.data;
      
      // Extract bookmakers we want to analyze
      const bookmakers = [
        'fanduel',
        'draftkings',
        'betmgm',
        'caesars',
        'pointsbetus',
        'superbook'
      ];
      
      // Filter to only include the bookmakers we care about
      const filteredBookmakers = game.bookmakers.filter(b => 
        bookmakers.includes(b.key.toLowerCase())
      );
      
      // If we don't have enough bookmakers, return an error
      if (filteredBookmakers.length < 2) {
        return {
          success: false,
          message: 'Not enough bookmakers available for meaningful analysis'
        };
      }
      
      // For each market, compare the lines and odds across different bookmakers
      const markets = {
        moneyline: {
          key: 'h2h',
          title: 'Moneyline',
          bookmakerData: {}
        },
        spreads: {
          key: 'spreads',
          title: 'Point Spread',
          bookmakerData: {}
        },
        totals: {
          key: 'totals',
          title: 'Game Total (Over/Under)',
          bookmakerData: {}
        }
      };
      
      // Collect data from each bookmaker for each market
      filteredBookmakers.forEach(bookmaker => {
        const bookmakerName = bookmaker.title;
        
        // Process each market type
        for (const marketType in markets) {
          const market = bookmaker.markets.find(m => m.key === markets[marketType].key);
          if (!market) continue;
          
          // Add the bookmaker to the market data if not already there
          if (!markets[marketType].bookmakerData[bookmakerName]) {
            markets[marketType].bookmakerData[bookmakerName] = [];
          }
          
          // Add the outcomes to the bookmaker's data for this market
          markets[marketType].bookmakerData[bookmakerName] = market.outcomes.map(outcome => ({
            name: outcome.name,
            price: outcome.price,
            point: outcome.point
          }));
        }
      });
      
      // Calculate line movement statistics
      const analysisResults = {
        event: {
          id: game.id,
          sport: game.sport_key,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          commenceTime: game.commence_time
        },
        moneyline: analyzeLineMovement(markets.moneyline),
        spreads: analyzeLineMovement(markets.spreads),
        totals: analyzeLineMovement(markets.totals),
        recommendedBets: []
      };
      
      // Generate betting recommendations based on the analysis
      // A simple heuristic might be to bet on discrepancies greater than a certain threshold
      // Note: this is a very simple approach and should be improved with more sophisticated models
      for (const marketType in markets) {
        const analysis = analysisResults[marketType];
        
        if (analysis.discrepancy > 0.15) { // 15% or more difference in implied probability
          analysisResults.recommendedBets.push({
            market: marketType,
            recommendation: `Consider ${analysis.bestOption.name} ${marketType === 'spreads' ? analysis.bestOption.point : ''} @ ${analysis.bestOption.price} with ${analysis.bestOption.bookmaker}`,
            reason: `${analysis.discrepancy.toFixed(2) * 100}% discrepancy between bookmakers`,
            confidence: Math.min(analysis.discrepancy * 2, 0.9).toFixed(2)
          });
        }
      }
      
      return analysisResults;
    } catch (error) {
      console.error('Error analyzing line movement:', error);
      return {
        success: false,
        message: `Error analyzing line movement: ${error.message}`
      };
    }
  },
  
  /**
   * Analyze line movement from historical data
   * @param {Object} historicalData - Historical odds data
   * @returns {Object} Line movement analysis
   */
  analyzeLineMovement: (historicalData) => {
    const marketKey = historicalData.key;
    const bookmakerData = historicalData.bookmakerData;
    
    // If we don't have enough data, return minimal analysis
    if (Object.keys(bookmakerData).length < 2) {
      return {
        market: historicalData.title,
        bookmakers: Object.keys(bookmakerData),
        discrepancy: 0,
        bestOption: null,
        analysis: 'Not enough bookmakers for comparison'
      };
    }
    
    // Function to convert american odds to implied probability
    const oddsToProb = (americanOdds) => {
      if (americanOdds > 0) {
        return 100 / (americanOdds + 100);
      } else {
        return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
      }
    };
    
    // Find min and max odds for each outcome
    const outcomes = {};
    
    // Collect all outcomes from all bookmakers
    for (const bookmaker in bookmakerData) {
      const bookmakerOdds = bookmakerData[bookmaker];
      
      bookmakerOdds.forEach(outcome => {
        const key = `${outcome.name}_${outcome.point || ''}`;
        
        if (!outcomes[key]) {
          outcomes[key] = {
            name: outcome.name,
            point: outcome.point,
            min: { price: Infinity, bookmaker: '' },
            max: { price: -Infinity, bookmaker: '' }
          };
        }
        
        // Track min and max
        if (outcome.price < outcomes[key].min.price) {
          outcomes[key].min = { price: outcome.price, bookmaker };
        }
        
        if (outcome.price > outcomes[key].max.price) {
          outcomes[key].max = { price: outcome.price, bookmaker };
        }
      });
    }
    
    // Calculate the discrepancy and find the best value
    let maxDiscrepancy = 0;
    let bestOption = null;
    
    for (const key in outcomes) {
      const outcome = outcomes[key];
      const minProb = oddsToProb(outcome.min.price);
      const maxProb = oddsToProb(outcome.max.price);
      const discrepancy = Math.abs(minProb - maxProb);
      
      if (discrepancy > maxDiscrepancy) {
        maxDiscrepancy = discrepancy;
        bestOption = {
          name: outcome.name,
          point: outcome.point,
          price: outcome.max.price, // Best odds for the bettor
          bookmaker: outcome.max.bookmaker
        };
      }
    }
    
    return {
      market: historicalData.title,
      bookmakers: Object.keys(bookmakerData),
      discrepancy: maxDiscrepancy,
      bestOption,
      analysis: maxDiscrepancy > 0.1 ? 'Significant line movement detected' : 'No significant line movement'
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
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      // Get upcoming games to find the game ID
      const upcomingGames = await oddsService.getUpcomingGames(sport);
      
      // Find the game that matches the team names
      const game = upcomingGames.find(game => {
        const gameHomeTeam = game.home_team.toLowerCase();
        const gameAwayTeam = game.away_team.toLowerCase();
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
