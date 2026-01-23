/**
 * Service for fetching betting data (using Ball Don't Lie as primary source)
 * Falls back to The Odds API if BDL doesn't return FanDuel/DraftKings odds
 */
import axios from 'axios';
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';

// Track in-flight requests to prevent duplicates and cache API responses
const inFlightRequests = new Map();
const oddsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// The Odds API configuration (fallback)
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

function getOddsApiKey() {
  try {
    return (
      (typeof process !== 'undefined' && process?.env?.ODDS_API_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_ODDS_API_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

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
 * Get game markets to fetch based on sport
 * Game picks = Spread/ML ONLY (no totals - totals are for props)
 * NHL: Moneyline ONLY (no puck line) - Gary picks winners
 * Other sports: Moneyline + Spreads
 */
const getMarketsForSport = (sport) => {
  // NHL: Moneyline ONLY - Gary picks who wins, no puck line
  if (sport === 'icehockey_nhl') {
    return 'h2h';
  }
  // All other sports: Moneyline + Spreads (NO TOTALS - totals are for props only)
  return 'h2h,spreads';
};

/**
 * Fetch odds from The Odds API (fallback when BDL doesn't have FanDuel/DraftKings)
 * @param {string} sport - Sport key (e.g., 'basketball_nba')
 * @param {string} markets - Markets to fetch (e.g., 'h2h,spreads')
 * @returns {Promise<Array>} Games with odds from The Odds API
 */
async function fetchFromTheOddsApi(sport, markets = 'h2h,spreads') {
  const apiKey = getOddsApiKey();
  if (!apiKey) {
    console.warn('[Odds API Fallback] No ODDS_API_KEY configured');
    return [];
  }

  try {
    console.log(`[Odds API Fallback] Fetching ${sport} odds from The Odds API...`);
    const response = await axios.get(`${ODDS_API_BASE}/sports/${sport}/odds`, {
      params: {
        apiKey,
        regions: 'us',
        markets,
        oddsFormat: 'american',
        bookmakers: 'fanduel,draftkings'
      },
      timeout: 15000
    });

    const games = response.data || [];
    console.log(`[Odds API Fallback] Got ${games.length} games from The Odds API`);
    return games;
  } catch (error) {
    console.warn(`[Odds API Fallback] Failed to fetch from The Odds API:`, error?.response?.data || error?.message);
    return [];
  }
}

/**
 * Match a game from The Odds API to a BDL game by team names
 */
function matchOddsApiGameToBdl(oddsApiGame, bdlGames) {
  const normalize = (name) => name?.toLowerCase().replace(/[^a-z]/g, '') || '';

  const oaHome = normalize(oddsApiGame.home_team);
  const oaAway = normalize(oddsApiGame.away_team);

  return bdlGames.find(bdlGame => {
    const bdlHome = normalize(bdlGame.home_team);
    const bdlAway = normalize(bdlGame.away_team);

    // Check for partial matches (city or team name)
    const homeMatch = bdlHome.includes(oaHome) || oaHome.includes(bdlHome) ||
                      bdlHome.split(' ').some(w => oaHome.includes(w) && w.length > 3);
    const awayMatch = bdlAway.includes(oaAway) || oaAway.includes(bdlAway) ||
                      bdlAway.split(' ').some(w => oaAway.includes(w) && w.length > 3);

    return homeMatch && awayMatch;
  });
}

/**
 * Fetches completed games from Ball Don't Lie API for a specific date and sport
 * NOTE: The Odds API has been deprecated - using BDL for all data
 */
const getCompletedGamesByDate = async (sport, date) => {
  const sportKeyMap = {
    'nba': 'basketball_nba',
    'nhl': 'icehockey_nhl',
    'mlb': 'baseball_mlb',
    'nfl': 'americanfootball_nfl'
  };

  const sportKey = sportKeyMap[sport.toLowerCase()] || sport;

  try {
    console.log(`Fetching scores from Ball Don't Lie for ${sport} on ${date}`);
    const games = await ballDontLieService.getGames(sportKey, { dates: [date], per_page: 100 }, 10);

    if (Array.isArray(games)) {
      return games
        .filter(game => game.status === 'Final' || game.home_team_score > 0 || game.visitor_team_score > 0)
        .map(game => ({
          id: game.id,
          sport_key: sportKey,
          home_team: game.home_team?.full_name || game.home_team?.name || game.home_team,
          away_team: game.visitor_team?.full_name || game.visitor_team?.name || game.visitor_team,
          scores: {
            home: game.home_team_score || 0,
            away: game.visitor_team_score || 0
          },
          completed: true,
          commence_time: game.date || game.start_time_utc
        }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching ${sport} scores from Ball Don't Lie:`, error);
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
    source: 'bdl_normalized'
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

  // ONLY use FanDuel and DraftKings - no fallback to other bookmakers
  const preferredKeys = ['fanduel', 'draftkings'];
  let bookmaker = null;
  
  for (const key of preferredKeys) {
    bookmaker = bookmakers.find(b => b.key.toLowerCase() === key);
    if (bookmaker) break;
  }
  
  // If neither FanDuel nor DraftKings found, return empty result
  // We do NOT fall back to other bookmakers for consistency
  if (!bookmaker) {
    console.warn('[Odds Service] No FanDuel or DraftKings odds found - skipping game');
    return result;
  }

  console.log(`[Odds Service] Using ${bookmaker.key} for game odds (standard spreads/ML only)`);

  if (!bookmaker?.markets) return result;

  // Extract spreads (standard only, no alternates)
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

// NOTE: fetchUpcomingOddsFallback and fetchOddsFromOddsApiByDate removed
// All odds now come from Ball Don't Lie via ballDontLieOddsService

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
  // DEPRECATED: These methods used The Odds API which has been removed
  // All odds now come from Ball Don't Lie - use getUpcomingGames instead
  getSports: async () => {
    console.warn('[oddsService.getSports] DEPRECATED - The Odds API removed. Use BDL for sports data.');
    return [
      { key: 'basketball_nba', title: 'NBA', active: true },
      { key: 'americanfootball_nfl', title: 'NFL', active: true },
      { key: 'icehockey_nhl', title: 'NHL', active: true },
      { key: 'basketball_ncaab', title: 'NCAAB', active: true },
      { key: 'americanfootball_ncaaf', title: 'NCAAF', active: true }
    ];
  },

  getOdds: async (sport) => {
    console.warn(`[oddsService.getOdds] DEPRECATED - use getUpcomingGames('${sport}') instead`);
    return oddsService.getUpcomingGames(sport);
  },

  getBatchOdds: async (sports) => {
    console.warn('[oddsService.getBatchOdds] DEPRECATED - use getUpcomingGames for each sport');
    if (!Array.isArray(sports) || sports.length === 0) return {};
    const results = {};
    for (const sport of sports) {
      results[sport] = await oddsService.getUpcomingGames(sport);
    }
    return results;
  },

  getGameOdds: async (gameId, { useCache = true, sport = null } = {}) => {
    // DEPRECATED: The Odds API has been removed - use getUpcomingGames and filter by game ID
    console.warn('[oddsService.getGameOdds] DEPRECATED - The Odds API removed. Use getUpcomingGames instead.');
    return null;
  },

  getCompletedGamesByDate,

  getUpcomingGames: async (sport = 'upcoming', options = {}) => {
    const cacheKey = `upcoming-games:${sport}:${JSON.stringify(options)}`;
    return dedupeRequest(cacheKey, async () => {
      console.log(`[Odds Service] Fetching upcoming games for ${sport}...`);

      // ALL SPORTS NOW USE BDL AS PRIMARY SOURCE (no more Odds API exemption)
      // BDL has comprehensive odds coverage for NBA, NFL, NHL, NCAAB, NCAAF
      // Fallback to The Odds API only if BDL fails

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
        // Use TODAY's EST date ONLY
        // BDL stores game dates in their local schedule date, not UTC
        // So querying for "2026-01-23" will return games scheduled for Jan 23
        const estFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
        const todayEst = estFormatter.format(new Date());

        dates = [todayEst];
        console.log(`[Odds Service] ${sport}: Fetching games for TODAY only: ${todayEst}`);
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

            // Note: If BDL returns games without odds, we still keep them.
            // Gary can work with games even when odds are missing.
            // The Odds API fallback has been removed (deprecated).
            if (!Array.isArray(dayGames) || dayGames.length === 0) {
              console.log(`[Odds Service] ${sport}: No games from BDL for ${d}.`);
            } else {
              // Log if some games are missing odds (informational only - we keep them)
              const gamesWithoutOdds = dayGames.filter(g => {
                if (!g.bookmakers || g.bookmakers.length === 0) return true;
                const hasMarkets = g.bookmakers.some(b => b.markets && b.markets.length > 0);
                return !hasMarkets;
              });
              if (gamesWithoutOdds.length > 0) {
                console.log(`[Odds Service] ${sport}: ${gamesWithoutOdds.length} of ${dayGames.length} games have missing odds (keeping them anyway).`);
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

      // Deduplicate games
      const seen = new Set();
      const unique = [];
      for (const g of combined) {
        if (!g || g.id == null) continue;
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        unique.push(g);
      }

      console.log(`[Odds Service] ${sport}: Found ${unique.length} games for today`)

      // First pass: extract odds from BDL bookmakers
      let processedGames = unique.map(game => {
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

      // Check which games are missing FanDuel/DraftKings odds
      const gamesMissingOdds = processedGames.filter(g =>
        g.moneyline_home === null && g.moneyline_away === null &&
        g.spread_home === null && g.spread_away === null
      );

      // FALLBACK: If games are missing odds, try The Odds API
      if (gamesMissingOdds.length > 0) {
        console.log(`[Odds Service] ${sport}: ${gamesMissingOdds.length} games missing FanDuel/DraftKings odds - trying The Odds API fallback...`);

        try {
          const markets = getMarketsForSport(sport);
          const oddsApiGames = await fetchFromTheOddsApi(sport, markets);

          if (oddsApiGames.length > 0) {
            let matchedCount = 0;

            // For each game missing odds, try to match it to an Odds API game
            processedGames = processedGames.map(game => {
              // Skip if game already has odds
              if (game.moneyline_home !== null || game.spread_home !== null) {
                return game;
              }

              // Find matching game from The Odds API
              const oddsApiMatch = matchOddsApiGameToBdl({ home_team: game.home_team, away_team: game.away_team }, oddsApiGames);

              if (oddsApiMatch && oddsApiMatch.bookmakers?.length > 0) {
                matchedCount++;
                console.log(`[Odds API Fallback] Matched: ${game.away_team} @ ${game.home_team}`);

                // Merge The Odds API bookmakers into this game
                const mergedBookmakers = [...(game.bookmakers || []), ...normalizeOddsApiBookmakers(oddsApiMatch.bookmakers)];
                const extractedOdds = extractOddsFromBookmakers(mergedBookmakers, game.home_team, game.away_team);

                return {
                  ...game,
                  bookmakers: mergedBookmakers,
                  moneyline_home: extractedOdds.moneyline_home,
                  moneyline_away: extractedOdds.moneyline_away,
                  spread_home: extractedOdds.spread_home,
                  spread_away: extractedOdds.spread_away,
                  spread_home_odds: extractedOdds.spread_home_odds,
                  spread_away_odds: extractedOdds.spread_away_odds,
                  total: extractedOdds.total,
                  total_over_odds: extractedOdds.total_over_odds,
                  total_under_odds: extractedOdds.total_under_odds,
                  source: 'bdl_with_odds_api_fallback'
                };
              }

              return game;
            });

            console.log(`[Odds API Fallback] Matched ${matchedCount} of ${gamesMissingOdds.length} games with missing odds`);
          }
        } catch (fallbackError) {
          console.warn(`[Odds API Fallback] Error during fallback:`, fallbackError?.message || fallbackError);
        }
      }

      console.log(`[Odds Service] ${sport}: Final result - ${processedGames.length} games ready for analysis`);
      return processedGames;
    });
  },

  getAllSports: async () => {
    // DEPRECATED: The Odds API removed - return static list of supported sports
    console.warn('[oddsService.getAllSports] DEPRECATED - The Odds API removed');
    return [
      { key: 'basketball_nba', title: 'NBA', active: true },
      { key: 'americanfootball_nfl', title: 'NFL', active: true },
      { key: 'icehockey_nhl', title: 'NHL', active: true },
      { key: 'basketball_ncaab', title: 'NCAAB', active: true },
      { key: 'americanfootball_ncaaf', title: 'NCAAF', active: true }
    ];
  },

  getLineMovement: async (sport, eventId) => {
    // DEPRECATED: The Odds API removed - line movement tracking not available
    console.warn('[oddsService.getLineMovement] DEPRECATED - The Odds API removed');
    return {
      success: false,
      message: 'Line movement tracking not available (The Odds API deprecated)'
    };
  },

  analyzeLineMovement,

  getPlayerPropOdds: async (sport, homeTeam, awayTeam) => {
    // DEPRECATED: The Odds API removed - use BDL player props via ballDontLieOddsService
    console.warn('[oddsService.getPlayerPropOdds] DEPRECATED - use ballDontLieOddsService for player props');
    try {
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

      // Use BDL for player props based on sport
      if (sport === 'basketball_nba') {
        return await ballDontLieOddsService.getNbaPlayerProps(game.id);
      } else if (sport === 'americanfootball_nfl') {
        return await ballDontLieOddsService.getNflPlayerProps(game.id);
      } else if (sport === 'icehockey_nhl') {
        return await ballDontLieOddsService.getNhlPlayerProps(game.id);
      }

      return [];
    } catch (error) {
      console.error('Error fetching player prop odds:', error);
      return [];
    }
  }
};