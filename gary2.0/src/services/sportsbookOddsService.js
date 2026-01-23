/**
 * Sportsbook Odds Service
 * Fetches and formats multi-book odds for comparison display
 * Shows ML and Spread only (no over/unders for game picks)
 * Also supports player props odds comparison
 */
import { ballDontLieService } from './ballDontLieService.js';

// Sport-specific available vendors for GAME ODDS
const GAME_ODDS_VENDORS = {
  basketball_nba: ['betmgm', 'fanduel', 'draftkings', 'bet365', 'caesars', 'ballybet', 'betway', 'betparx', 'betrivers', 'rebet', 'polymarket', 'kalshi'],
  icehockey_nhl: ['draftkings', 'fanduel', 'caesars', 'polymarket', 'kalshi'],
  americanfootball_nfl: ['betmgm', 'fanduel', 'draftkings', 'bet365', 'caesars', 'ballybet', 'betparx', 'betrivers', 'betway', 'polymarket', 'kalshi'],
  basketball_ncaab: ['betmgm', 'fanduel', 'draftkings', 'bet365', 'caesars', 'polymarket', 'kalshi'],
  americanfootball_ncaaf: ['betmgm', 'fanduel', 'draftkings', 'bet365', 'caesars', 'polymarket', 'kalshi']
};

// Sport-specific available vendors for PLAYER PROPS
const PROPS_VENDORS = {
  basketball_nba: ['draftkings', 'betway', 'betrivers', 'ballybet', 'betparx', 'caesars', 'fanduel', 'rebet'],
  icehockey_nhl: ['fanduel', 'draftkings', 'caesars'],
  americanfootball_nfl: ['draftkings', 'betway', 'betrivers', 'ballybet', 'betparx']
};

// Preferred sportsbooks in display order (major books first)
const PREFERRED_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'bet365', 'betrivers', 'betway', 'ballybet', 'betparx', 'rebet'];

// Map BDL vendor names to display names
const BOOK_DISPLAY_NAMES = {
  draftkings: 'DraftKings',
  fanduel: 'FanDuel',
  caesars: 'Caesars',
  betmgm: 'BetMGM',
  betrivers: 'BetRivers',
  bet365: 'Bet365',
  betway: 'Betway',
  ballybet: 'Bally Bet',
  betparx: 'BetParx',
  rebet: 'Rebet',
  polymarket: 'Polymarket',
  kalshi: 'Kalshi'
};

/**
 * Get the BDL odds endpoint for a sport
 */
function getOddsEndpoint(sport) {
  const sportMap = {
    basketball_nba: 'nba/v2/odds',
    americanfootball_nfl: 'nfl/v1/odds',
    icehockey_nhl: 'nhl/v1/odds',
    basketball_ncaab: 'ncaab/v1/odds',
    americanfootball_ncaaf: 'ncaaf/v1/odds'
  };
  return sportMap[sport] || null;
}

/**
 * Format American odds for display
 */
function formatOdds(odds) {
  if (odds === null || odds === undefined) return '-';
  const num = Number(odds);
  if (isNaN(num)) return '-';
  return num > 0 ? `+${num}` : String(num);
}

/**
 * Fetch sportsbook odds for a specific game
 * @param {string} sport - Sport key (e.g., 'basketball_nba')
 * @param {number} gameId - BDL game ID
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Promise<Array>} Array of sportsbook odds objects
 */
export async function fetchSportsbookOdds(sport, gameId, homeTeam, awayTeam) {
  try {
    // Use the appropriate BDL odds service based on sport
    const odds = await ballDontLieService.getOddsV2({ game_ids: [gameId], per_page: 100 }, sport);

    if (!Array.isArray(odds) || odds.length === 0) {
      console.log(`[SportsbookOdds] No odds data for game ${gameId}`);
      return [];
    }

    // Group by vendor and format
    const vendorOdds = {};
    for (const row of odds) {
      if (row.game_id !== gameId) continue;

      const vendor = (row.vendor || '').toLowerCase();
      if (!vendor) continue;

      vendorOdds[vendor] = {
        vendor: vendor,
        displayName: BOOK_DISPLAY_NAMES[vendor] || vendor.charAt(0).toUpperCase() + vendor.slice(1),
        spread_home: row.spread_home_value,
        spread_home_odds: row.spread_home_odds,
        spread_away: row.spread_away_value,
        spread_away_odds: row.spread_away_odds,
        ml_home: row.moneyline_home_odds,
        ml_away: row.moneyline_away_odds,
        updated_at: row.updated_at
      };
    }

    // Sort by preferred books first, then alphabetically
    const sortedVendors = Object.keys(vendorOdds).sort((a, b) => {
      const aIdx = PREFERRED_BOOKS.indexOf(a);
      const bIdx = PREFERRED_BOOKS.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.localeCompare(b);
    });

    return sortedVendors.map(v => vendorOdds[v]);
  } catch (error) {
    console.error(`[SportsbookOdds] Error fetching odds:`, error.message);
    return [];
  }
}

/**
 * Format sportsbook odds for storage in pick object
 * This is a simplified format for Supabase storage
 */
export function formatOddsForStorage(oddsArray, pickTeam, homeTeam, awayTeam) {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return null;

  const isHomePick = pickTeam && (
    pickTeam.toLowerCase().includes(homeTeam?.toLowerCase()?.split(' ').pop()) ||
    homeTeam?.toLowerCase().includes(pickTeam?.toLowerCase()?.split(' ').pop())
  );

  return oddsArray.slice(0, 8).map(odds => {
    // CRITICAL: spread MUST be a number for iOS parsing
    const rawSpread = isHomePick ? odds.spread_home : odds.spread_away;
    const spreadNum = typeof rawSpread === 'number' ? rawSpread : parseFloat(rawSpread);

    return {
      book: odds.displayName,
      spread: isNaN(spreadNum) ? null : spreadNum, // NUMBER, not string
      spread_odds: formatOdds(isHomePick ? odds.spread_home_odds : odds.spread_away_odds),
      ml: formatOdds(isHomePick ? odds.ml_home : odds.ml_away)
    };
  });
}

/**
 * Get best odds for a pick across all sportsbooks
 * @param {Array} oddsArray - Array of sportsbook odds
 * @param {string} betType - 'spread' or 'ml'
 * @param {boolean} isHomePick - Whether the pick is on the home team
 * @returns {Object} { book, odds, value }
 */
export function getBestOdds(oddsArray, betType, isHomePick) {
  if (!Array.isArray(oddsArray) || oddsArray.length === 0) return null;

  let best = null;
  for (const odds of oddsArray) {
    let value, oddsVal;

    if (betType === 'spread') {
      value = isHomePick ? parseFloat(odds.spread_home) : parseFloat(odds.spread_away);
      oddsVal = isHomePick ? odds.spread_home_odds : odds.spread_away_odds;
    } else {
      value = null;
      oddsVal = isHomePick ? odds.ml_home : odds.ml_away;
    }

    if (oddsVal === null || oddsVal === undefined) continue;
    const numOdds = Number(oddsVal);
    if (isNaN(numOdds)) continue;

    // Higher odds are better (less negative or more positive)
    if (!best || numOdds > best.odds) {
      best = {
        book: odds.displayName,
        odds: numOdds,
        oddsFormatted: formatOdds(numOdds),
        value: value
      };
    }
  }

  return best;
}

/**
 * Fetch player props odds for a specific game and player
 * @param {string} sport - Sport key (e.g., 'basketball_nba')
 * @param {number} gameId - BDL game ID
 * @param {number} playerId - BDL player ID (optional)
 * @param {string} propType - Prop type filter (optional, e.g., 'points', 'assists')
 * @returns {Promise<Array>} Array of props with multi-book odds
 */
export async function fetchPropOdds(sport, gameId, playerId = null, propType = null) {
  try {
    // Check if sport supports props
    const availableVendors = PROPS_VENDORS[sport];
    if (!availableVendors) {
      console.log(`[PropOdds] No props vendors available for ${sport}`);
      return [];
    }

    // Build options
    const options = {};
    if (playerId) options.player_id = playerId;
    if (propType) options.prop_type = propType;

    // Fetch from sport-specific BDL player props endpoint
    let props;
    if (sport === 'basketball_nba') {
      props = await ballDontLieService.getNbaPlayerProps(gameId, options);
    } else if (sport === 'icehockey_nhl') {
      props = await ballDontLieService.getNhlPlayerProps(gameId, options);
    } else if (sport === 'americanfootball_nfl') {
      props = await ballDontLieService.getNflPlayerProps(gameId, options);
    } else {
      console.log(`[PropOdds] Unsupported sport for props: ${sport}`);
      return [];
    }

    if (!Array.isArray(props) || props.length === 0) {
      console.log(`[PropOdds] No props data for game ${gameId}`);
      return [];
    }

    // Group props by player + prop_type + line_value to compare across vendors
    const propGroups = {};
    for (const prop of props) {
      const key = `${prop.player_id}:${prop.prop_type}:${prop.line_value}`;
      if (!propGroups[key]) {
        propGroups[key] = {
          player_id: prop.player_id,
          prop_type: prop.prop_type,
          line_value: prop.line_value,
          vendors: []
        };
      }

      // Extract odds based on market type
      let overOdds = null;
      let underOdds = null;
      let milestoneOdds = null;

      if (prop.market?.type === 'over_under') {
        overOdds = prop.market.over_odds;
        underOdds = prop.market.under_odds;
      } else if (prop.market?.type === 'milestone') {
        milestoneOdds = prop.market.odds;
      }

      propGroups[key].vendors.push({
        vendor: prop.vendor,
        displayName: BOOK_DISPLAY_NAMES[prop.vendor] || prop.vendor,
        market_type: prop.market?.type,
        over_odds: overOdds,
        under_odds: underOdds,
        milestone_odds: milestoneOdds,
        updated_at: prop.updated_at
      });
    }

    return Object.values(propGroups);
  } catch (error) {
    console.error(`[PropOdds] Error fetching props odds:`, error.message);
    return [];
  }
}

/**
 * Get best odds for a specific prop across all sportsbooks
 * @param {Array} vendorOdds - Array of vendor odds for a prop
 * @param {string} direction - 'over', 'under', or 'milestone'
 * @returns {Object} { book, odds, oddsFormatted }
 */
export function getBestPropOdds(vendorOdds, direction = 'over') {
  if (!Array.isArray(vendorOdds) || vendorOdds.length === 0) return null;

  let best = null;
  for (const v of vendorOdds) {
    let oddsVal;
    if (direction === 'over') {
      oddsVal = v.over_odds;
    } else if (direction === 'under') {
      oddsVal = v.under_odds;
    } else if (direction === 'milestone') {
      oddsVal = v.milestone_odds;
    }

    if (oddsVal === null || oddsVal === undefined) continue;
    const numOdds = Number(oddsVal);
    if (isNaN(numOdds)) continue;

    // Higher odds are better (less negative or more positive)
    if (!best || numOdds > best.odds) {
      best = {
        book: v.displayName,
        vendor: v.vendor,
        odds: numOdds,
        oddsFormatted: formatOdds(numOdds)
      };
    }
  }

  return best;
}

/**
 * Format prop odds for storage in pick object
 * Returns simplified format for Supabase storage
 */
export function formatPropOddsForStorage(vendorOdds, direction = 'over') {
  if (!Array.isArray(vendorOdds) || vendorOdds.length === 0) return null;

  // Sort by preferred books
  const sorted = [...vendorOdds].sort((a, b) => {
    const aIdx = PREFERRED_BOOKS.indexOf(a.vendor);
    const bIdx = PREFERRED_BOOKS.indexOf(b.vendor);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return 0;
  });

  return sorted.slice(0, 6).map(v => {
    const odds = direction === 'over' ? v.over_odds :
                 direction === 'under' ? v.under_odds :
                 v.milestone_odds;
    return {
      book: v.displayName,
      odds: formatOdds(odds)
    };
  });
}

export const sportsbookOddsService = {
  fetchSportsbookOdds,
  formatOddsForStorage,
  getBestOdds,
  formatOdds,
  fetchPropOdds,
  getBestPropOdds,
  formatPropOddsForStorage,
  PREFERRED_BOOKS,
  BOOK_DISPLAY_NAMES,
  GAME_ODDS_VENDORS,
  PROPS_VENDORS
};
