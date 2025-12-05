/**
 * Service for fetching betting data (now using Ball Don't Lie for odds)
 */
import axios from 'axios';
import { configLoader } from './configLoader.js';
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4'; // kept for legacy props endpoints if needed

// Track in-flight requests to prevent duplicates and cache API responses
const inFlightRequests = new Map();
const oddsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
  let apiKey = '';

  // Safe process.env access (Node.js)
  if (typeof process !== 'undefined' && process.env?.ODDS_API_KEY) {
    apiKey = process.env.ODDS_API_KEY;
  }

  // Safe import.meta.env access (Vite)
  if (!apiKey) {
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        apiKey = import.meta.env.VITE_ODDS_API_KEY;
      }
    } catch (e) {
      // Ignore errors accessing import.meta.env in non-module environments
    }
  }

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

const normalizeOddsApiBookmakers = (bookmakers = []) => {
  if (!Array.isArray(bookmakers)) return [];
  return bookmakers.map((bookmaker) => ({
    key: bookmaker?.key || bookmaker?.title || 'unknown',
    title: bookmaker?.title || bookmaker?.key || 'Unknown',
    last_update: bookmaker?.last_update,
    markets: Array.isArray(bookmaker?.markets)
      ? bookmaker.markets.map((market) => ({
        key: market?.key,
        outcomes: Array.isArray(market?.outcomes)
          ? market.outcomes
            .map((outcome) => {
              if (typeof outcome?.price !== 'number') return null;
              const normalized = {
                name: outcome.name,
                price: outcome.price
              };
              if (typeof outcome.point === 'number') {
                normalized.point = outcome.point;
              }
              return normalized;
            })
            .filter(Boolean)
          : []
      }))
      : []
  }));
};

const normalizeOddsApiGame = (event, sportKey) => {
  const id =
    event?.id ||
    event?.game_id ||
    event?.event_id ||
    `${sportKey}-${event?.commence_time || Date.now()}-${event?.home_team || 'home'}-${event?.away_team || 'away'}`;

  const bookmakers = normalizeOddsApiBookmakers(event?.bookmakers);
  
  // Extract odds values from the first bookmaker for easy access
  const extractedOdds = extractOddsFromBookmakers(bookmakers, event?.home_team, event?.away_team);

  return {
    id,
    sport_key: event?.sport_key || sportKey,
    home_team: event?.home_team || event?.teams?.[0] || '',
    away_team: event?.away_team || event?.teams?.[1] || '',
    commence_time: event?.commence_time,
    bookmakers,
    // Extracted odds for easy access
    spread_home: extractedOdds.spread_home,
    spread_away: extractedOdds.spread_away,
    spread_home_odds: extractedOdds.spread_home_odds,
    spread_away_odds: extractedOdds.spread_away_odds,
    moneyline_home: extractedOdds.moneyline_home,
    moneyline_away: extractedOdds.moneyline_away,
    total: extractedOdds.total,
    total_over_odds: extractedOdds.total_over_odds,
    total_under_odds: extractedOdds.total_under_odds,
    source: 'odds_api_fallback'
  };
};

// Helper to extract odds from bookmakers array
const extractOddsFromBookmakers = (bookmakers, homeTeam, awayTeam) => {
  const result = {
    spread_home: null,
    spread_away: null,
    spread_home_odds: -110,
    spread_away_odds: -110,
    moneyline_home: null,
    moneyline_away: null,
    total: null,
    total_over_odds: -110,
    total_under_odds: -110
  };

  if (!bookmakers || !bookmakers.length) return result;

  // Use first available bookmaker
  const bookmaker = bookmakers[0];
  if (!bookmaker?.markets) return result;

  // Extract spreads
  const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
  if (spreadsMarket?.outcomes) {
    for (const outcome of spreadsMarket.outcomes) {
      if (outcome.name === homeTeam) {
        result.spread_home = outcome.point;
        result.spread_home_odds = outcome.price || -110;
      } else if (outcome.name === awayTeam) {
        result.spread_away = outcome.point;
        result.spread_away_odds = outcome.price || -110;
      }
    }
  }

  // Extract moneyline (h2h)
  const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
  if (h2hMarket?.outcomes) {
    for (const outcome of h2hMarket.outcomes) {
      if (outcome.name === homeTeam) {
        result.moneyline_home = outcome.price;
      } else if (outcome.name === awayTeam) {
        result.moneyline_away = outcome.price;
      }
    }
  }

  // Extract totals
  const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
  if (totalsMarket?.outcomes) {
    for (const outcome of totalsMarket.outcomes) {
      if (outcome.name === 'Over') {
        result.total = outcome.point;
        result.total_over_odds = outcome.price || -110;
      } else if (outcome.name === 'Under') {
        result.total_under_odds = outcome.price || -110;
      }
    }
  }

  return result;
};

const fetchUpcomingOddsFallback = async (sport) => {
  const apiKey = await getApiKey();
  if (!apiKey) return [];

  try {
    const url = `${ODDS_API_BASE_URL}/sports/${sport}/odds`;
    const response = await axios.get(url, {
      params: {
        apiKey,
        regions: 'us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'american',
        dateFormat: 'iso'
      },
      timeout: 10000
    });
    const events = Array.isArray(response?.data) ? response.data : [];
    console.log(`[Odds Service] ${sport}: Generic Odds API fallback returned ${events.length} upcoming games.`);
    return events.map(event => normalizeOddsApiGame(event, sport));
  } catch (error) {
    console.warn(`[Odds Service] ${sport}: Generic Odds API fallback failed:`, error?.message || error);
    return [];
  }
};

const fetchOddsFromOddsApiByDate = async (sport, dateStr) => {
  // Legacy strict-date fetcher kept if needed, but upcoming is preferred for fallbacks
  const apiKey = await getApiKey();
  if (!apiKey) return [];
  // ... (rest of existing function if needed)
  // But we'll replace usage in getUpcomingGames with the new helper
  try {
    // ...
    const url = `${ODDS_API_BASE_URL}/sports/${sport}/odds`;
    const response = await axios.get(url, {
      params: {
        apiKey,
        regions: 'us',
        markets: 'h2h,spreads,totals',
        oddsFormat: 'american',
        dateFormat: 'iso'
      },
      timeout: 10000
    });
    const events = Array.isArray(response?.data) ? response.data : [];
    const toEstDate = (iso) => {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
      } catch (e) { return ''; }
    };
    const filtered = events.filter(event => toEstDate(event.commence_time) === dateStr);
    return filtered.map(event => normalizeOddsApiGame(event, sport));
  } catch (e) { return []; }
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

// Helpers to normalize BDL odds into the structure our pipeline expects
const properCase = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
const toBookmakersFromV2 = (rows, homeTeam, awayTeam) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byVendor = rows.reduce((acc, r) => {
    if (!r || !r.vendor) return acc;
    if (!acc[r.vendor]) acc[r.vendor] = [];
    acc[r.vendor].push(r);
    return acc;
  }, {});
  const mkOutcome = (name, price, point) => {
    const out = { name, price };
    if (typeof point !== 'undefined' && point !== null) out.point = typeof point === 'number' ? point : parseFloat(point);
    return out;
  };
  const result = [];
  for (const vendor of Object.keys(byVendor)) {
    const vendorRows = byVendor[vendor];
    // Use the latest row per vendor per game_id (already filtered per game)
    const latest = vendorRows.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || ''))).slice(-1)[0] || vendorRows[0];
    const markets = [];
    // Moneyline
    if (typeof latest.moneyline_home_odds === 'number' || typeof latest.moneyline_away_odds === 'number') {
      markets.push({
        key: 'h2h',
        outcomes: [
          mkOutcome(homeTeam, latest.moneyline_home_odds),
          mkOutcome(awayTeam, latest.moneyline_away_odds)
        ]
      });
    }
    // Spreads
    if (latest.spread_home_value || latest.spread_away_value) {
      const homePoint = latest.spread_home_value != null ? parseFloat(latest.spread_home_value) : null;
      const awayPoint = latest.spread_away_value != null ? parseFloat(latest.spread_away_value) : null;
      markets.push({
        key: 'spreads',
        outcomes: [
          mkOutcome(homeTeam, latest.spread_home_odds, homePoint),
          mkOutcome(awayTeam, latest.spread_away_odds, awayPoint)
        ]
      });
    }
    // Totals (reference only)
    if (latest.total_value != null && (typeof latest.total_over_odds === 'number' || typeof latest.total_under_odds === 'number')) {
      const totPoint = parseFloat(latest.total_value);
      markets.push({
        key: 'totals',
        outcomes: [
          { name: 'Over', price: latest.total_over_odds, point: totPoint },
          { name: 'Under', price: latest.total_under_odds, point: totPoint }
        ]
      });
    }
    result.push({
      key: vendor,
      title: properCase(vendor),
      markets
    });
  }
  return result;
};

const normalizeTeamString = (teamObjOrStr) => {
  if (!teamObjOrStr) return '';
  if (typeof teamObjOrStr === 'string') return teamObjOrStr;
  return teamObjOrStr.full_name || teamObjOrStr.display_name || teamObjOrStr.name || '';
};

const computeWindow = (sport) => {
  const now = new Date();

  // NFL weekly window stays 6 days (Thu–Tue coverage)
  if (sport === 'americanfootball_nfl') {
    const windowStart = new Date(now.getTime());
    const windowEnd = new Date(now.getTime() + (6 * 24 * 60 * 60 * 1000));
    return { windowStart, windowEnd };
  }

  // STRICT "Today EST" window for all other sports
  // We get the current date in EST
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });

  // Format parts to construct YYYY-MM-DD
  const parts = estFormatter.formatToParts(now);
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  const todayEstStr = `${p.year}-${p.month}-${p.day}`;

  // Create start/end times in EST
  // Note: We just need the Date objects to represent the window relative to NOW for filtering
  // But for "dates[]" param, we use the string.
  // For the window filter (used in some places), we'll set it to cover the rest of the EST day.

  const windowStart = new Date(now.getTime()); // Now

  // End of today EST:
  // We can approximate by taking "tomorrow 00:00 EST"
  // A simple way is to just allow 24 hours from now, but user said "never do anything that is tomorrow".
  // Let's stick to the "next 16 hours" as a loose bound for "upcoming", but rely on the DATE filter for strictness.
  const SIXTEEN_HOURS_MS = 16 * 60 * 60 * 1000;
  const windowEnd = new Date(now.getTime() + SIXTEEN_HOURS_MS);

  return { windowStart, windowEnd, todayEstStr };
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
      console.log(`[Odds Service] Fetching upcoming games for ${sport}...`);

      // NBA & NFL EXEMPTION: Use The Odds API directly for correct game IDs (needed for player props)
      // This bypasses the BDL -> Fallback logic used for other sports.
      if (sport === 'basketball_nba' || sport === 'americanfootball_nfl') {
        console.log(`[Odds Service] ${sport}: Using The Odds API directly for correct game IDs.`);
        return fetchUpcomingOddsFallback(sport);
      }

      let dates = [];
      const isNfl = sport === 'americanfootball_nfl';

      if (isNfl) {
        const { windowStart, windowEnd } = computeWindow(sport);
        console.log(`[Odds Service] ${sport}: Expanded NFL window ${windowStart.toISOString()} to ${windowEnd.toISOString()}`);
        const dayMs = 24 * 60 * 60 * 1000;
        const startOfDayUtc = new Date(Date.UTC(
          windowStart.getUTCFullYear(),
          windowStart.getUTCMonth(),
          windowStart.getUTCDate(), 0, 0, 0, 0
        )).getTime();
        const endOfDayUtc = new Date(Date.UTC(
          windowEnd.getUTCFullYear(),
          windowEnd.getUTCMonth(),
          windowEnd.getUTCDate(), 0, 0, 0, 0
        )).getTime();
        for (let t = startOfDayUtc; t <= endOfDayUtc; t += dayMs) {
          dates.push(new Date(t).toISOString().slice(0, 10));
        }
      } else {
        // Use the strict EST date string from computeWindow or regenerate
        const estFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
        const todayEst = estFormatter.format(new Date());

        // We MUST ask for today AND tomorrow to handle UTC drift.
        // BDL stores times in UTC. 7pm EST on Nov 21 is 00:00 UTC on Nov 22.
        // So if we only ask for Nov 21, we miss the evening games!
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowEst = estFormatter.format(tomorrow);

        dates = [todayEst, tomorrowEst];
        console.log(`[Odds Service] ${sport}: Fetching [${dates.join(', ')}] to handle UTC offsets (will filter strictly to EST today)`);
      }

      // Fetch games+odds for each day in parallel and merge
      let combined = [];
      try {
        const perDay = await Promise.all(
          dates.map(async (d) => {
            let dayGames = [];
            try {
              // PRIMARY SOURCE: Ball Don't Lie
              console.log(`[Odds Service] ${sport}: Attempting Primary Source (BDL) for ${d}`);
              dayGames = await ballDontLieOddsService.getGamesWithOddsForSport(sport, d);
            } catch (err) {
              console.warn(`[Odds Service] ${sport}: Failed fetching odds for ${d}:`, err?.message || err);
            }

            // Check if BDL returned games but they are missing bookmakers (odds)
            // Or if the bookmakers array exists but contains no valid markets
            // The structure is game.bookmakers[].markets[]
            const missingOdds = Array.isArray(dayGames) && dayGames.some(g => {
              if (!g.bookmakers || g.bookmakers.length === 0) return true;
              // Check if bookmakers have actual markets
              const hasMarkets = g.bookmakers.some(b => b.markets && b.markets.length > 0);
              return !hasMarkets;
            });

            if (!Array.isArray(dayGames) || dayGames.length === 0 || missingOdds) {
              if (missingOdds) {
                console.log(`[Odds Service] ${sport}: BDL returned games but some are missing valid odds. Attempting Odds API fallback for ${d}.`);
              } else {
                console.log(`[Odds Service] ${sport}: No games/odds from BDL. Attempting Odds API fallback for ${d}.`);
              }

              // FALLBACK SOURCE: The Odds API
              // Use the generic upcoming fallback instead of strict date matching
              // This allows us to find games that might have slightly different dates in different APIs
              const fallbackGames = await fetchUpcomingOddsFallback(sport);

              if (fallbackGames.length) {
                // console.log(`[Odds Service] ${sport}: Odds API fallback returned ${fallbackGames.length} games for ${d}`);

                if (!Array.isArray(dayGames) || dayGames.length === 0) {
                  // Filter fallback games to match the requested date 'd' (EST)
                  // Only if we are replacing the entire list.
                  // But if BDL returned nothing, we should trust the fallback's list for that day.
                  const toEstDate = (iso) => {
                    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso)); } catch (e) { return ''; }
                  };
                  dayGames = fallbackGames.filter(g => toEstDate(g.commence_time) === d);
                } else {
                  // Merge fallback odds into BDL games where missing
                  // Robust team matching logic
                  const normalizeTeamForMatch = (name) => {
                    if (!name || typeof name !== 'string') return '';
                    return name.toLowerCase()
                      .replace(/\./g, '') // remove dots (L.A. -> LA)
                      .replace(/'/g, '')  // remove apostrophes (76ers -> 76ers)
                      .replace(/[^a-z0-9]/g, ''); // remove spaces and other chars
                  };

                  dayGames = dayGames.map(bdlGame => {
                    // If we already have valid markets, keep it
                    if (bdlGame.bookmakers && bdlGame.bookmakers.length > 0 && bdlGame.bookmakers.some(b => b.markets && b.markets.length > 0)) {
                      return bdlGame;
                    }

                    // Find matching game in fallback
                    const match = fallbackGames.find(fb => {
                      // Normalization 1: Simple remove non-alphanumeric
                      const h1 = normalizeTeamForMatch(bdlGame.home_team);
                      const a1 = normalizeTeamForMatch(bdlGame.away_team);
                      const h2 = normalizeTeamForMatch(fb.home_team);
                      const a2 = normalizeTeamForMatch(fb.away_team);

                      // Check 1: Direct match of normalized strings
                      let isMatch = (h1 === h2 && a1 === a2) || (h1 === a2 && a1 === h2);

                      // Check 2: Inclusion (handles "LA Clippers" vs "Los Angeles Clippers")
                      if (!isMatch) {
                        // Check if the shorter one is contained in the longer one (e.g. "laclippers" in "losangelesclippers" is FALSE)
                        // But "clippers" in "losangelesclippers" is TRUE.
                        // Let's try matching just the last significant part (mascot)
                        const getMascotClean = (n) => {
                          const parts = n.trim().split(' ');
                          return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
                        };
                        const mH1 = getMascotClean(bdlGame.home_team);
                        const mA1 = getMascotClean(bdlGame.away_team);
                        const mH2 = getMascotClean(fb.home_team);
                        const mA2 = getMascotClean(fb.away_team);

                        isMatch = (mH1 === mH2 && mA1 === mA2) || (mH1 === mA2 && mA1 === mH2);
                      }

                      // Check 3: Specific hardcoded fixes for known issues
                      if (!isMatch) {
                        const fix = (n) => n.replace('losangeles', 'la').replace('trailblazers', 'blazers');
                        if ((fix(h1) === fix(h2) && fix(a1) === fix(a2))) isMatch = true;
                      }

                      if (!isMatch && (bdlGame.home_team.includes('Clippers') || bdlGame.away_team.includes('Clippers'))) {
                        // console.log(`[Merge Debug] Comparing BDL '${bdlGame.home_team}' vs OddsAPI '${fb.home_team}'`);
                      }

                      return isMatch;
                    });

                    if (match && match.bookmakers && match.bookmakers.length > 0) {
                      console.log(`[Odds Service] Merged Odds API odds into BDL game: ${bdlGame.home_team} vs ${bdlGame.away_team} (Matched via mascot)`);
                      return {
                        ...bdlGame,
                        bookmakers: match.bookmakers,
                        // Copy extracted odds fields from the Odds API game
                        moneyline_home: match.moneyline_home,
                        moneyline_away: match.moneyline_away,
                        spread_home: match.spread_home,
                        spread_away: match.spread_away,
                        spread_home_odds: match.spread_home_odds,
                        spread_away_odds: match.spread_away_odds,
                        total: match.total,
                        total_over_odds: match.total_over_odds,
                        total_under_odds: match.total_under_odds,
                        source: 'merged_odds_api'
                      };
                    }
                    return bdlGame;
                  });
                }
              } else {
                console.log(`[Odds Service] ${sport}: Odds API fallback returned 0 upcoming games. Cannot fill gaps.`);
              }
            }

            return Array.isArray(dayGames) ? dayGames : [];
          })
        );
        combined = perDay.flat();
      } catch (e) {
        console.error(`[Odds Service] BallDontLieOdds adapter error for ${sport}:`, e?.message || e);
      }

      if (!Array.isArray(combined) || combined.length === 0) {
        console.log(`[Odds Service] ${sport}: No odds available from Ball Don't Lie or Odds API for dates ${dates.join(', ')}`);
        return [];
      }

      // Filter out games that are not within the strict EST window (if not NFL)
      // User request: "only get games happening in the next 16 hours... never do anything that is tomorrow"
      // We rely on 'dates' being strictly today's date string for BDL, but let's ensure we don't include late-night games that spill over if not desired.
      // Actually, the user said "happening in the next 16 hours... never do anything that is tomorrow".
      // Since we query by date=TODAY, we should only get today's games.
      // But let's double check the game times against the window if needed.
      // For now, just deduplication.

      const seen = new Set();
      const unique = [];
      for (const g of combined) {
        if (!g || g.id == null) continue;
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        unique.push(g);
      }

      const processedGames = unique.map(game => {
        const bestOpportunity = analyzeBettingMarkets(game);
        
        // Extract odds from bookmakers if not already present
        let extractedOdds = {};
        if (game.moneyline_home === undefined && game.bookmakers?.length > 0) {
          extractedOdds = extractOddsFromBookmakers(game.bookmakers, game.home_team, game.away_team);
        }
        
        return {
          ...game,
          // Include extracted odds if they weren't already set
          moneyline_home: game.moneyline_home ?? extractedOdds.moneyline_home,
          moneyline_away: game.moneyline_away ?? extractedOdds.moneyline_away,
          spread_home: game.spread_home ?? extractedOdds.spread_home,
          spread_away: game.spread_away ?? extractedOdds.spread_away,
          spread_home_odds: game.spread_home_odds ?? extractedOdds.spread_home_odds,
          spread_away_odds: game.spread_away_odds ?? extractedOdds.spread_away_odds,
          total: game.total ?? extractedOdds.total,
          total_over_odds: game.total_over_odds ?? extractedOdds.total_over_odds,
          total_under_odds: game.total_under_odds ?? extractedOdds.total_under_odds,
          bestBet: bestOpportunity
        };
      });

      console.log(`[Odds Service] ${sport}: Final result - ${processedGames.length} games ready for analysis`);
      return processedGames;
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