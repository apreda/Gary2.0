/**
 * Service for fetching betting data (using Ball Don't Lie as primary source)
 * Uses all available sportsbooks, with preference for FanDuel/DraftKings
 */
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';

// Track in-flight requests to prevent duplicates
const inFlightRequests = new Map();

// Normalize a team name for fuzzy matching (lowercase, strip punctuation, collapse whitespace)
const normalizeForMatch = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

// Check if two team names match (exact first, then fuzzy includes-based fallback)
const teamNamesMatch = (outcomeName, targetName) => {
  if (!outcomeName || !targetName) return false;
  if (outcomeName === targetName) return true;
  const normOutcome = normalizeForMatch(outcomeName);
  const normTarget = normalizeForMatch(targetName);
  if (normOutcome === normTarget) return true;
  // Substring match: one contains the other (handles "Auburn" vs "Auburn Tigers", etc.)
  if (normOutcome.includes(normTarget) || normTarget.includes(normOutcome)) return true;
  return false;
};

// Extract odds from a single bookmaker's markets
const extractFromBookmaker = (bookmaker, homeTeam, awayTeam) => {
  const result = {
    spread_home: null,
    spread_away: null,
    spread_home_odds: null,
    spread_away_odds: null,
    moneyline_home: null,
    moneyline_away: null,
    total: null,
    total_over_odds: null,
    total_under_odds: null
  };

  if (!bookmaker?.markets) return result;

  // Extract spreads (standard only, no alternates)
  const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
  if (spreadsMarket?.outcomes) {
    for (const outcome of spreadsMarket.outcomes) {
      if (teamNamesMatch(outcome.name, homeTeam)) {
        result.spread_home = outcome.point;
        result.spread_home_odds = outcome.price ?? null;
      } else if (teamNamesMatch(outcome.name, awayTeam)) {
        result.spread_away = outcome.point;
        result.spread_away_odds = outcome.price ?? null;
      }
    }
    // Fallback: try mascot-name matching (last word) for spreads
    if (result.spread_home === null || result.spread_away === null) {
      const homeLast = normalizeForMatch(homeTeam).split(' ').pop();
      const awayLast = normalizeForMatch(awayTeam).split(' ').pop();
      for (const outcome of spreadsMarket.outcomes) {
        const outcomeLast = normalizeForMatch(outcome.name).split(' ').pop();
        if (result.spread_home === null && outcomeLast === homeLast) {
          result.spread_home = outcome.point;
          result.spread_home_odds = outcome.price ?? null;
        } else if (result.spread_away === null && outcomeLast === awayLast) {
          result.spread_away = outcome.point;
          result.spread_away_odds = outcome.price ?? null;
        }
      }
    }
    // Last resort: positional fallback
    if (result.spread_home === null && result.spread_away === null && spreadsMarket.outcomes.length === 2) {
      const [first, second] = spreadsMarket.outcomes;
      if (typeof first.point === 'number' && typeof second.point === 'number') {
        console.warn(`[Odds] ⚠️ Positional fallback used for spreads: ${homeTeam} vs ${awayTeam} — name matching failed for outcomes: ${spreadsMarket.outcomes.map(o => o.name).join(', ')}`);
        result.spread_home = first.point;
        result.spread_home_odds = first.price ?? null;
        result.spread_away = second.point;
        result.spread_away_odds = second.price ?? null;
      }
    }
  }

  // Extract moneyline (h2h)
  const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
  if (h2hMarket?.outcomes) {
    for (const outcome of h2hMarket.outcomes) {
      if (teamNamesMatch(outcome.name, homeTeam)) {
        result.moneyline_home = outcome.price;
      } else if (teamNamesMatch(outcome.name, awayTeam)) {
        result.moneyline_away = outcome.price;
      }
    }
    // Fallback: try mascot-name matching (last word) before positional assignment
    if (result.moneyline_home === null || result.moneyline_away === null) {
      const homeLast = normalizeForMatch(homeTeam).split(' ').pop();
      const awayLast = normalizeForMatch(awayTeam).split(' ').pop();
      for (const outcome of h2hMarket.outcomes) {
        const outcomeLast = normalizeForMatch(outcome.name).split(' ').pop();
        if (result.moneyline_home === null && outcomeLast === homeLast) {
          result.moneyline_home = outcome.price;
        } else if (result.moneyline_away === null && outcomeLast === awayLast) {
          result.moneyline_away = outcome.price;
        }
      }
    }
    // Last resort: positional fallback (BDL typically home first, away second)
    if (result.moneyline_home === null && result.moneyline_away === null && h2hMarket.outcomes.length === 2) {
      const [first, second] = h2hMarket.outcomes;
      if (typeof first.price === 'number' && typeof second.price === 'number') {
        console.warn(`[Odds] ⚠️ Positional fallback used for ML: ${homeTeam} vs ${awayTeam} — name matching failed for outcomes: ${h2hMarket.outcomes.map(o => o.name).join(', ')}`);
        result.moneyline_home = first.price;
        result.moneyline_away = second.price;
      }
    }
  }

  // Extract totals
  const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
  if (totalsMarket?.outcomes) {
    for (const outcome of totalsMarket.outcomes) {
      if (outcome.name === 'Over') {
        result.total = outcome.point;
        result.total_over_odds = outcome.price ?? null;
      } else if (outcome.name === 'Under') {
        result.total_under_odds = outcome.price ?? null;
      }
    }
  }

  return result;
};

// Check if spread and moneyline agree on which team is favored
// NOTE: MLB is exempt — run line is always 1.5 regardless of ML favorite
const validateSpreadMLDirection = (odds, bookmakerKey, sport) => {
  const { spread_home, moneyline_home } = odds;
  // Can't validate if either is missing — allow it through
  if (spread_home == null || moneyline_home == null) return true;
  // Spread 0 (pick'em) is consistent with any ML
  if (spread_home === 0) return true;
  // MLB: run line is always ±1.5 regardless of who's favored on ML — skip this check
  if (sport && (sport.includes('baseball') || sport.includes('mlb'))) return true;

  // ML < 0 means home favored → spread should be < 0 (home giving points)
  // ML > 0 means home underdog → spread should be > 0 (home getting points)
  const mlFavorsHome = moneyline_home < 0;
  const spreadFavorsHome = spread_home < 0;

  if (mlFavorsHome !== spreadFavorsHome) {
    console.warn(`[Odds Service] SPREAD/ML MISMATCH from ${bookmakerKey}: spread_home=${spread_home}, ML_home=${moneyline_home} — skipping vendor`);
    return false;
  }
  return true;
};

// Vendors to skip entirely — prediction markets, not real sportsbooks
const BLOCKED_VENDORS = new Set(['polymarket', 'kalshi']);

// Priority order for vendor selection — first match wins
const VENDOR_PRIORITY = [
  'fanduel', 'draftkings', 'betrivers', 'caesars', 'betmgm',
  'fanatics', 'betway', 'ballybet', 'betparx', 'rebet'
];

// Filter blocked vendors from a bookmakers array
const filterBlockedVendors = (bookmakers) => {
  if (!Array.isArray(bookmakers)) return [];
  return bookmakers.filter(b => !BLOCKED_VENDORS.has(b.key?.toLowerCase()));
};

// Helper to extract odds from bookmakers array, trying vendors in order with validation
const extractOddsFromBookmakers = (bookmakers, homeTeam, awayTeam, sport) => {
  const emptyResult = {
    spread_home: null, spread_away: null,
    spread_home_odds: null, spread_away_odds: null,
    moneyline_home: null, moneyline_away: null,
    total: null, total_over_odds: null, total_under_odds: null
  };

  if (!bookmakers || !bookmakers.length) return emptyResult;

  // Remove blocked vendors before processing
  const allowedBookmakers = filterBlockedVendors(bookmakers);
  if (!allowedBookmakers.length) return emptyResult;

  // Build ordered list: priority vendors first, then any remaining
  const orderedBookmakers = [];
  for (const key of VENDOR_PRIORITY) {
    const bk = allowedBookmakers.find(b => b.key?.toLowerCase() === key);
    if (bk && bk.markets?.length > 0) orderedBookmakers.push(bk);
  }
  // Add any bookmakers not in the priority list (but not blocked)
  for (const bk of allowedBookmakers) {
    if (bk.markets?.length > 0 && !orderedBookmakers.includes(bk)) {
      orderedBookmakers.push(bk);
    }
  }

  if (orderedBookmakers.length === 0) {
    console.warn('[Odds Service] No bookmaker with valid odds found for this game');
    return emptyResult;
  }

  // Try vendors in order — use the first one where spread/ML agree
  let bestMismatch = null;
  for (const bookmaker of orderedBookmakers) {
    const odds = extractFromBookmaker(bookmaker, homeTeam, awayTeam);
    if (validateSpreadMLDirection(odds, bookmaker.key || bookmaker.title, sport)) {
      return odds;
    }
    // Track first mismatch as fallback
    if (!bestMismatch) bestMismatch = odds;
  }

  // ALL vendors had spread/ML mismatch — use first vendor with warning
  console.warn(`[Odds Service] ALL ${orderedBookmakers.length} vendors have spread/ML mismatch for ${homeTeam} vs ${awayTeam} — using first vendor as fallback`);
  return bestMismatch || emptyResult;
};

// NOTE: fetchUpcomingOddsFallback and fetchOddsFromOddsApiByDate removed
// All odds now come from Ball Don't Lie via ballDontLieOddsService

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

export const oddsService = {
  // getCompletedGamesByDate removed — function was deleted in Round 10

  getUpcomingGames: async (sport = 'upcoming', options = {}) => {
    const cacheKey = `upcoming-games:${sport}:${JSON.stringify(options)}`;
    return dedupeRequest(cacheKey, async () => {
      console.log(`[Odds Service] Fetching upcoming games for ${sport}...`);

      // ALL SPORTS USE BDL AS PRIMARY SOURCE
      // BDL has comprehensive odds coverage for NBA, NFL, NHL, NCAAB, NCAAF

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
        // Use target date if provided (e.g., --date 2026-02-11), otherwise today EST
        const estFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
        const todayEst = estFormatter.format(new Date());

        if (options.targetDate) {
          // Support comma-separated dates (e.g., "2026-02-11,2026-02-12")
          dates = options.targetDate.split(',').map(d => d.trim());
          console.log(`[Odds Service] ${sport}: Fetching games for target date(s): ${dates.join(', ')}`);
        } else {
          dates = [todayEst];
          console.log(`[Odds Service] ${sport}: Fetching games for TODAY only: ${todayEst}`);
        }
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
        console.log(`[Odds Service] ${sport}: No odds available from Ball Don't Lie for dates ${dates.join(', ')}`);
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
        // Extract odds from bookmakers if not already present
        let extractedOdds = {};
        if (game.moneyline_home === undefined && game.bookmakers?.length > 0) {
          extractedOdds = extractOddsFromBookmakers(game.bookmakers, game.home_team, game.away_team, sport);
        }

        // BDL V1 flat field fallback: BDL NCAAB/NHL/NCAAF odds use field names like
        // spread_home_value, spread_away_value, moneyline_home_odds, moneyline_away_odds, total_value
        // If bookmaker extraction returned nulls, try reading these BDL-native fields directly
        const toNum = (v) => {
          if (v === null || v === undefined) return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const bdlSpreadHome = toNum(game.spread_home_value);
        const bdlSpreadAway = toNum(game.spread_away_value);
        const bdlSpreadHomeOdds = toNum(game.spread_home_odds);
        const bdlSpreadAwayOdds = toNum(game.spread_away_odds);
        const bdlMlHome = toNum(game.moneyline_home_odds);
        const bdlMlAway = toNum(game.moneyline_away_odds);
        const bdlTotal = toNum(game.total_value);
        const bdlTotalOver = toNum(game.total_over_odds);
        const bdlTotalUnder = toNum(game.total_under_odds);

        // Filter blocked vendors from bookmakers before passing downstream to app/UI
        const cleanBookmakers = filterBlockedVendors(game.bookmakers || []);

        return {
          ...game,
          // Replace bookmakers with filtered list (Polymarket/Kalshi never reach the app)
          bookmakers: cleanBookmakers,
          // Include extracted odds if they weren't already set
          // Priority: existing flat field > bookmaker extraction > BDL V1 flat field fallback
          moneyline_home: game.moneyline_home ?? extractedOdds.moneyline_home ?? bdlMlHome,
          moneyline_away: game.moneyline_away ?? extractedOdds.moneyline_away ?? bdlMlAway,
          spread_home: game.spread_home ?? extractedOdds.spread_home ?? bdlSpreadHome,
          spread_away: game.spread_away ?? extractedOdds.spread_away ?? bdlSpreadAway,
          spread_home_odds: game.spread_home_odds ?? extractedOdds.spread_home_odds ?? bdlSpreadHomeOdds,
          spread_away_odds: game.spread_away_odds ?? extractedOdds.spread_away_odds ?? bdlSpreadAwayOdds,
          total: game.total ?? extractedOdds.total ?? bdlTotal,
          total_over_odds: game.total_over_odds ?? extractedOdds.total_over_odds ?? bdlTotalOver,
          total_under_odds: game.total_under_odds ?? extractedOdds.total_under_odds ?? bdlTotalUnder,
        };
      });

      // Check which games are missing odds from ALL sportsbooks
      const gamesMissingOdds = processedGames.filter(g =>
        g.moneyline_home === null && g.moneyline_away === null &&
        g.spread_home === null && g.spread_away === null
      );

      if (gamesMissingOdds.length > 0) {
        console.log(`[Odds Service] ${sport}: ${gamesMissingOdds.length} games missing odds from all BDL sportsbooks`);
      }

      console.log(`[Odds Service] ${sport}: Final result - ${processedGames.length} games ready for analysis`);
      return processedGames;
    });
  },

  // NOTE: getPlayerPropOdds removed — use propOddsService.getPlayerPropOdds() instead
};