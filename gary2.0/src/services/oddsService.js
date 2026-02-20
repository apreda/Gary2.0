/**
 * Service for fetching betting data (using Ball Don't Lie as primary source)
 * Uses all available sportsbooks, with preference for FanDuel/DraftKings
 */
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';

// Track in-flight requests to prevent duplicates and cache API responses
const inFlightRequests = new Map();
const oddsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// All odds now come from Ball Don't Lie — The Odds API has been fully removed

// NOTE: PROP_MARKETS removed — BDL returns all prop types automatically via propOddsService

/**
 * Fetches completed games from Ball Don't Lie API for a specific date and sport
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

// Helper to extract odds from bookmakers array
const extractOddsFromBookmakers = (bookmakers, homeTeam, awayTeam) => {
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

  if (!bookmakers || !bookmakers.length) return result;

  // Prefer FanDuel and DraftKings, but fall back to other sportsbooks if needed
  const preferredKeys = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'pointsbet', 'betonlineag', 'bovada', 'mybookieag', 'williamhill_us', 'unibet_us'];
  let bookmaker = null;

  for (const key of preferredKeys) {
    bookmaker = bookmakers.find(b => b.key?.toLowerCase() === key);
    if (bookmaker && bookmaker.markets?.length > 0) break;
  }

  // Final fallback: use ANY bookmaker that has markets
  if (!bookmaker || !bookmaker.markets?.length) {
    bookmaker = bookmakers.find(b => b.markets && b.markets.length > 0);
  }

  if (!bookmaker) {
    console.warn('[Odds Service] No bookmaker with valid odds found for this game');
    return result;
  }

  // Bookmaker selected: ${bookmaker.key || bookmaker.title} (logged once per batch in fetchUpcomingGames)

  if (!bookmaker?.markets) return result;

  // Extract spreads (standard only, no alternates)
  const spreadsMarket = bookmaker.markets.find(m => m.key === 'spreads');
  if (spreadsMarket?.outcomes) {
    for (const outcome of spreadsMarket.outcomes) {
      if (outcome.name === homeTeam) {
        result.spread_home = outcome.point;
        result.spread_home_odds = outcome.price ?? null;
      } else if (outcome.name === awayTeam) {
        result.spread_away = outcome.point;
        result.spread_away_odds = outcome.price ?? null;
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
        result.total_over_odds = outcome.price ?? null;
      } else if (outcome.name === 'Under') {
        result.total_under_odds = outcome.price ?? null;
      }
    }
  }

  return result;
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

export const oddsService = {
  // DEPRECATED: Redirects to getUpcomingGames (still used by nbaPicksHandler.js)
  getOdds: async (sport) => {
    console.warn(`[oddsService.getOdds] DEPRECATED - use getUpcomingGames('${sport}') instead`);
    return oddsService.getUpcomingGames(sport);
  },

  getCompletedGamesByDate,

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