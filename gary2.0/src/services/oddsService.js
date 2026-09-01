/**
 * Service for fetching betting data (using Ball Don't Lie as primary source)
 * Uses all available sportsbooks, with preference for FanDuel/DraftKings
 */
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';
import { ncaafSlateDateForInstant } from './ncaafGamePolicy.js';
import { americanImpliedProbability, finiteMarketNumber } from './marketTruth.js';
import { recordOddsSnapshots } from './oddsSnapshots.js';

// Track in-flight requests to prevent duplicates
const inFlightRequests = new Map();

// Normalize provider and game team names before an EXACT identity comparison.
// Never infer home/away from array order, a shared mascot, or a substring: an
// unmatched market is safer as null than attached to the wrong side.
const normalizeForMatch = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

// Check if two team names have the same normalized identity.
const teamNamesMatch = (outcomeName, targetName) => {
  if (!outcomeName || !targetName) return false;
  const normOutcome = normalizeForMatch(outcomeName);
  const normTarget = normalizeForMatch(targetName);
  return normOutcome.length > 0 && normOutcome === normTarget;
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
export const validateSpreadMLDirection = (odds, bookmakerKey, sport) => {
  const spreadHome = finiteMarketNumber(odds?.spread_home);
  const homeProbability = americanImpliedProbability(odds?.moneyline_home);
  const awayProbability = americanImpliedProbability(odds?.moneyline_away);
  // Can't determine direction without both sides of the moneyline — abstain
  // from rejecting the vendor rather than guessing from the home sign alone.
  if (spreadHome === null || homeProbability === null || awayProbability === null) return true;
  // Spread 0 (pick'em) is consistent with any ML
  if (spreadHome === 0) return true;
  // MLB: run line is always ±1.5 regardless of who's favored on ML — skip this check
  if (sport && (sport.includes('baseball') || sport.includes('mlb'))) return true;

  // Both sides can legitimately be negative around pick'em because of vig.
  // Compare their implied probabilities instead of treating every negative
  // home price as proof that the home team is favored.
  if (Math.abs(homeProbability - awayProbability) < 1e-9) return true;
  const mlFavorsHome = homeProbability > awayProbability;
  const spreadFavorsHome = spreadHome < 0;

  if (mlFavorsHome !== spreadFavorsHome) {
    console.warn(`[Odds Service] SPREAD/ML MISMATCH from ${bookmakerKey}: spread_home=${spreadHome}, ML_home=${odds.moneyline_home}, ML_away=${odds.moneyline_away} — skipping vendor`);
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
    total: null, total_over_odds: null, total_under_odds: null,
    // Which book actually supplied these numbers. The priority walk below can
    // legitimately switch vendors between fetches (FanDuel down at noon ->
    // DraftKings), and any open-vs-now comparison MUST know that happened —
    // two books' prices are not a line move (founder, Aug 14).
    line_vendor: null
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

  // Try vendors in order — use the first one where spread/ML agree.
  // A direction mismatch is rejected, never recycled as a "best" fallback.
  for (const bookmaker of orderedBookmakers) {
    const odds = extractFromBookmaker(bookmaker, homeTeam, awayTeam);
    odds.line_vendor = (bookmaker.key || bookmaker.title || '').toLowerCase() || null;
    if (validateSpreadMLDirection(odds, bookmaker.key || bookmaker.title, sport)) {
      return odds;
    }
  }

  console.warn(`[Odds Service] ALL ${orderedBookmakers.length} vendors have spread/ML mismatch for ${homeTeam} vs ${awayTeam} — market fields left null`);
  return emptyResult;
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

/**
 * SLATE GUARD (founder GO, Aug 10 2026 — recurring ET-date class, 7th bite):
 * BDL's dates[] param is UTC-day based, so yesterday's late games bleed into
 * today's fetch while tonight's West-Coast games genuinely belong. Three
 * rules, all fail-open toward keeping real games:
 *   1. ET DATE: a row whose parseable start falls on the wrong ET date goes.
 *      A bare date string is the feed's own date claim — compared directly.
 *      No/unparseable start: the row STAYS (never drop a game on parse doubt).
 *   2. STALE CORPSE: a game that started 6+ hours ago is not tonight's slate
 *      no matter what the feed says (the frozen -10000 row).
 *   3. DEDUPE: same feed id, or same matchup at the same start time, prints
 *      once. Real doubleheaders differ by start time and both survive.
 */
export function filterSlateGames(games, dates, now = Date.now(), sport = null) {
  const seenIds = new Set();
  const seenSlots = new Set();
  const out = [];
  for (const g of games || []) {
    if (!g || g.id == null) continue;
    if (seenIds.has(g.id)) continue;
    seenIds.add(g.id);
    const raw = g.commence_time != null ? String(g.commence_time) : '';
    const scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(String(g.scheduled_date || ''))
      ? String(g.scheduled_date)
      : null;
    let etDate = null;
    let startMs = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      etDate = raw;
    } else if (raw) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        etDate = sport === 'americanfootball_ncaaf'
          ? ncaafSlateDateForInstant(d)
          : d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        startMs = d.getTime();
      }
    }
    etDate ??= scheduledDate;
    if (etDate && Array.isArray(dates) && dates.length && !dates.includes(etDate)) continue;
    if (startMs != null && now - startMs > 6 * 60 * 60 * 1000) continue;
    const slot = `${String(g.away_team || '').toLowerCase()}@${String(g.home_team || '').toLowerCase()}|${raw || scheduledDate || g.id}`;
    if (seenSlots.has(slot)) continue;
    seenSlots.add(slot);
    out.push(g);
  }
  return out;
}

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
      const isNcaaf = sport === 'americanfootball_ncaaf';

      if (options.targetDate) {
        // An explicit date is an exact slate request for every sport. NFL's
        // weekly analysis window must not turn a one-day Home/Board refresh
        // into seven parallel BDL calls (and a predictable 429 burst).
        dates = options.targetDate.split(',').map(d => d.trim());
        console.log(`[Odds Service] ${sport}: Fetching games for target date(s): ${dates.join(', ')}`);
      } else if (isNfl) {
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

        dates = [todayEst];
        console.log(`[Odds Service] ${sport}: Fetching games for TODAY only: ${todayEst}`);
      }

      // Fetch games+odds for each day in parallel and merge. Scheduler
      // football children already carry the canonical BDL game id, so resolve
      // that one game directly instead of downloading the date/full-slate
      // pages first. Manual no-id runs deliberately retain the slate path.
      let combined = [];
      try {
        if ((isNfl || isNcaaf) && options.gameId != null) {
          console.log(`[Odds Service] ${sport}: Fetching exact provider game ${options.gameId}`);
          combined = isNfl
            ? await ballDontLieOddsService.getNflGameWithOddsById(options.gameId)
            : await ballDontLieOddsService.getNcaafGameWithOddsById(options.gameId);
        } else {
          const perDay = await Promise.all(
            dates.map(async (d) => {
              // PRIMARY SOURCE: Ball Don't Lie. A failed day rejects the whole
              // requested window; returning the other days would publish and
              // cache a partial slate as if it were complete.
              console.log(`[Odds Service] ${sport}: Attempting Primary Source (BDL) for ${d}`);
              const dayGames = await ballDontLieOddsService.getGamesWithOddsForSport(sport, d);
              if (!Array.isArray(dayGames)) {
                throw new Error(`[Odds Service] ${sport}: BDL returned a non-array slate for ${d}`);
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

              return dayGames;
            })
          );
          combined = perDay.flat();
        }
      } catch (e) {
        console.error(`[Odds Service] BallDontLieOdds adapter error for ${sport}:`, e?.message || e);
        throw e;
      }

      if (!Array.isArray(combined) || combined.length === 0) {
        console.log(`[Odds Service] ${sport}: No odds available from Ball Don't Lie for dates ${dates.join(', ')}`);
        return [];
      }

      // ET-date + staleness + dedupe guard at the SOURCE (founder GO,
      // Aug 10 — the frozen -10000 Astros@Padres corpse and duplicate
      // matchup rows survived to the raw list; downstream nets caught them,
      // but the ET-date law belongs here).
      const unique = filterSlateGames(combined, dates, Date.now(), sport);

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
          // The book that actually supplied the flat numbers — the same-book
          // law for open-vs-now comparisons rides on this surviving the flatten.
          line_vendor: game.line_vendor ?? extractedOdds.line_vendor ?? null,
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
      // ODDS SNAPSHOTS (Sep 1 2026): keep the board we just saw, once per
      // change, so the desk can print the day's open beside the current
      // price. Fire-and-forget; a ledger failure never touches the slate.
      recordOddsSnapshots(sport, processedGames).then((n) => { if (n) console.log(`[Odds Snapshots] ${sport}: ${n} board change(s) recorded`); }).catch(() => {});
      return processedGames;
    });
  },

  // NOTE: getPlayerPropOdds removed — use propOddsService.getPlayerPropOdds() instead
};
