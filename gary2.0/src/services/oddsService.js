/**
 * Service for fetching data from The Odds API
 */
import axios from 'axios';
import { configLoader } from './configLoader.js';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

// Track in-flight requests to prevent duplicates
const inFlightRequests = new Map();

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
 * Get API key from environment or config
 */
const getApiKey = async () => {
  let apiKey = process.env.ODDS_API_KEY || import.meta.env.VITE_ODDS_API_KEY;
  
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
 */
const getCompletedGamesByDate = async (sport, date) => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Odds API key not configured');
  }
  
  const sportKeyMap = {
    'nba': 'basketball_nba',
    'nhl': 'icehockey_nhl',
    'mlb': 'baseball_mlb'
  };
  
  const sportKey = sportKeyMap[sport.toLowerCase()] || sport;
  
  try {
    const apiDate = new Date(date);
    apiDate.setUTCHours(0, 0, 0, 0);
    const commenceDateFrom = apiDate.toISOString();
    
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
        position: outcome.name,
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
  const winProb = 0.5;
  return (opportunity.price * winProb) - (1 - winProb);
};

const calculateROI = (opportunity) => {
  let decimalOdds = opportunity.price;
  if (decimalOdds < 0) {
    decimalOdds = (100 / Math.abs(decimalOdds)) + 1;
  } else {
    decimalOdds = (decimalOdds / 100) + 1;
  }
  return ((decimalOdds - 1) * 100).toFixed(2) + '%';
};

const processMarketData = (bookmakers, marketKey, game) => {
  const playerProps = [];
  
  for (const bookmaker of bookmakers) {
    const market = bookmaker.markets.find(m => m.key === marketKey);
    if (!market || !market.outcomes) continue;
    
    for (const outcome of market.outcomes) {
      if (!outcome.description) continue;
      
      try {
        const player = outcome.description;
        const team = determinePlayerTeam(player, game);
        const point = outcome.point || null;
        
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
  
  function determinePlayerTeam(playerName, game) {
    if (!game) return 'unknown';
    return game.home_team || game.homeTeam || 'unknown';
  }
  
  return playerProps;
};

const dedupeRequest = async (key, fn) => {
  if (inFlightRequests.has(key)) {
    console.log(`[OddsService] Deduplicating request: ${key}`);
    return inFlightRequests.get(key);
  }

  try {
    const promise = fn();
    inFlightRequests.set(key, promise);
    const result = await promise;
    return result;
  } finally {
    inFlightRequests.delete(key);
  }
};

const analyzeLineMovement = (historicalData) => {
  const bookmakerData = historicalData.bookmakerData;
  
  if (Object.keys(bookmakerData).length < 2) {
    return {
      market: historicalData.title,
      bookmakers: Object.keys(bookmakerData),
      discrepancy: 0,
      bestOption: null,
      analysis: 'Not enough bookmakers for comparison'
    };
  }
  
  const oddsToProb = (americanOdds) => {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  };
  
  const outcomes = {};
  
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
      
      if (outcome.price < outcomes[key].min.price) {
        outcomes[key].min = { price: outcome.price, bookmaker };
      }
      
      if (outcome.price > outcomes[key].max.price) {
        outcomes[key].max = { price: outcome.price, bookmaker };
      }
    });
  }
  
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
        price: outcome.max.price,
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
};

export const oddsService = {
  getSports: async () => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      const url = `${ODDS_API_BASE_URL}/sports`;
      const response = (await axios.get(url, { 
        params: { 
          apiKey,
          all: true
        } 
      }));
      
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
  
  getBatchOdds: async (sports) => {
    try {
      if (!Array.isArray(sports) || sports.length === 0) {
        return {};
      }
      
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
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
      
      const results = await Promise.all(promises);
      
      return results.reduce((acc, { sport, data }) => {
        acc[sport] = data;
        return acc;
      }, {});
    } catch (error) {
      console.error('Error fetching batch odds:', error);
      return {};
    }
  },

  getGameOdds: async (gameId, { useCache = true } = {}) => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('No API key available for The Odds API');
      }

      const cacheKey = `game-odds:${gameId}`;
      
      return dedupeRequest(cacheKey, async () => {
        const response = await axios.get(`${ODDS_API_BASE_URL}/sports/upcoming/events/${gameId}/odds`, {
          params: {
            apiKey,
            regions: 'us',
            markets: 'h2h,spreads,totals',
            oddsFormat: 'american',
            bookmakers: 'fanduel,draftkings,williamhill_us,pointsbetus'
          },
          timeout: 10000
        });

        if (!response.data) {
          throw new Error('No data received from odds API');
        }

        return response.data;
      });
    } catch (error) {
      console.error(`[OddsService] Error getting game odds for ${gameId}:`, error.message);
      throw error;
    }
  },

  getCompletedGamesByDate,
  
  getUpcomingGames: async (sport = 'upcoming', options = {}) => {
    const cacheKey = `upcoming-games:${sport}:${JSON.stringify(options)}`;
    
    return dedupeRequest(cacheKey, async () => {
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
      console.log(`Fetching odds from: ${url} for sport: ${sport}`);
      const response = await axios.get(url, { params });
      
      if (response.data) {
        const games = response.data;
        console.log(`Raw API response: Found ${games.length} total games for ${sport}`);
        
        const now = new Date();
        const estOffset = -5;
        const utcDate = now.getTime() + (now.getTimezoneOffset() * 60000);
        const estDate = new Date(utcDate + (3600000 * estOffset));
        
        const windowStart = new Date(estDate);
        windowStart.setDate(windowStart.getDate() - 1);
        windowStart.setHours(18, 0, 0, 0);
        
        const windowEnd = new Date(estDate);
        windowEnd.setDate(windowEnd.getDate() + 1);
        windowEnd.setHours(6, 0, 0, 0);
        
        console.log(`Expanded time window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
        
        const relevantGames = games.filter(game => {
          const gameTime = new Date(game.commence_time);
          const includeGame = gameTime >= windowStart && gameTime <= windowEnd;
          
          console.log(`Game: ${game.home_team} vs ${game.away_team}`);
          console.log(`  Time: ${gameTime.toISOString()}`);
          console.log(`  EST Time: ${gameTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
          console.log(`  Include: ${includeGame}`);
          
          return includeGame;
        });
        
        console.log(`After time filtering: ${relevantGames.length} games from ${games.length} total`);
        
        const uniqueGames = [];
        const gameMap = new Map();
        
        relevantGames.forEach(game => {
          const gameKey = `${game.home_team}-${game.away_team}`;
          if (!gameMap.has(gameKey)) {
            gameMap.set(gameKey, true);
            uniqueGames.push(game);
          } else {
            console.log(`Removing duplicate game: ${game.home_team} vs ${game.away_team}`);
          }
        });
        
        console.log(`After deduplication: ${uniqueGames.length} unique games`);
        
        const processedGames = uniqueGames.map(game => {
          const bestOpportunity = analyzeBettingMarkets(game);
          
          return {
            ...game,
            bestBet: bestOpportunity
          };
        });
        
        if (processedGames.length > 0) {
          console.log(`Final games for ${sport}:`);
          processedGames.forEach(game => {
            console.log(`  ${game.away_team} @ ${game.home_team} at ${new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
          });
        } else {
          console.log(`No games found for ${sport} in the current time window`);
        }
        
        return processedGames;
      }
      
      return [];
    });
  },
  
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
  
  getLineMovement: async (sport, eventId) => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
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
      
      const bookmakers = [
        'fanduel',
        'draftkings',
        'betmgm',
        'caesars',
        'pointsbetus',
        'superbook'
      ];
      
      const filteredBookmakers = game.bookmakers.filter(b => 
        bookmakers.includes(b.key.toLowerCase())
      );
      
      if (filteredBookmakers.length < 2) {
        return {
          success: false,
          message: 'Not enough bookmakers available for meaningful analysis'
        };
      }
      
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
      
      filteredBookmakers.forEach(bookmaker => {
        const bookmakerName = bookmaker.title;
        
        for (const marketType in markets) {
          const market = bookmaker.markets.find(m => m.key === markets[marketType].key);
          if (!market) continue;
          
          if (!markets[marketType].bookmakerData[bookmakerName]) {
            markets[marketType].bookmakerData[bookmakerName] = [];
          }
          
          markets[marketType].bookmakerData[bookmakerName] = market.outcomes.map(outcome => ({
            name: outcome.name,
            price: outcome.price,
            point: outcome.point
          }));
        }
      });
      
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
      
      for (const marketType in markets) {
        const analysis = analysisResults[marketType];
        
        if (analysis.discrepancy > 0.15) {
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
  
  analyzeLineMovement,
  
  getPlayerPropOdds: async (sport, homeTeam, awayTeam) => {
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        throw new Error('Odds API key not configured');
      }
      
      const upcomingGames = await oddsService.getUpcomingGames(sport);
      
      const game = upcomingGames.find(game => {
        const gameHomeTeam = game.home_team.toLowerCase();
        const gameAwayTeam = game.away_team.toLowerCase();
        const searchHomeTeam = homeTeam.toLowerCase();
        const searchAwayTeam = awayTeam.toLowerCase();
        
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
      
      const marketsList = sport in PROP_MARKETS ? 
        PROP_MARKETS[sport] : 
        ['player_points'];
      
      console.log(`Will fetch individual prop markets for ${sport}: ${marketsList.join(', ')}`);
      
      const allPlayerProps = [];
      
      for (const market of marketsList) {
        console.log(`Fetching ${sport} player props for market: ${market}`);
        
        try {
          const propResponse = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/events/${game.id}/odds`, {
            params: {
              apiKey,
              regions: 'us',
              markets: market,
              oddsFormat: 'american',
              dateFormat: 'iso'
            }
          });
          
          if (propResponse.data && 
              propResponse.data.bookmakers && 
              propResponse.data.bookmakers.length > 0) {
                
            const bookmakers = propResponse.data.bookmakers;
            const marketProps = processMarketData(bookmakers, market, game);
            allPlayerProps.push(...marketProps);
          }
        } catch (err) {
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
      
      if (allPlayerProps.length === 0) {
        console.warn('No player prop data found from The Odds API after trying all markets');
        return [];
      }
      
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
      
      const result = Object.values(groupedProps);
      console.log(`Found ${result.length} player props for ${homeTeam} vs ${awayTeam}`);
      
      return result;
    } catch (error) {
      console.error('Error fetching player prop odds:', error);
      return [];
    }
  }
};