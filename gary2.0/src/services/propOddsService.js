/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 * NOTE: The Odds API has been deprecated - all props now come from Ball Don't Lie
 */
import { ballDontLieService } from './ballDontLieService.js';
import { ncaafPropOddsService } from './ncaafPropOddsService.js';
import { normalizeTeamName as _normalizeTeamName } from './agentic/sharedUtils.js';

// Wrap shared normalizer with space-stripping for this file's comparison pattern
const normalizeTeamName = (name) => _normalizeTeamName(name).replace(/\s+/g, '');

// NOTE: The Odds API deprecated - BDL is now the primary source for all player props

// NOTE: PROP_MARKETS removed — BDL returns all prop types automatically, no market filter needed

// ============================================================================
// ODDS FILTER CONSTANTS
// ============================================================================
// Only accept odds in a reasonable range for night-in-night-out picks:
// - No heavy juice (worse than -200) - the vig kills long-term edge
// - No extreme lottery tickets (better than +400)
const MIN_ACCEPTABLE_ODDS = -200;  // -200 OK, -201 filtered
const MAX_ACCEPTABLE_ODDS = 400;   // +400 OK, +401 filtered

// Per-prop-type upper-bound overrides. Home run props live almost entirely
// above +400 (typical market +250 to +900) — the universal cap stripped nearly
// every HR side before the hrOnly runner ever saw them, making HR-picks mode
// effectively dead. HR overs are intentionally long odds; the break-even math
// is handled at pick time, not by excluding the market.
const MAX_ODDS_BY_PROP_TYPE = {
  home_runs: 900,
};

/**
 * Check if odds are within acceptable range
 * @param {number} odds - American odds value
 * @param {string} [propType] - Prop type for per-type upper bounds
 * @returns {boolean} - True if odds are acceptable
 */
const isOddsAcceptable = (odds, propType) => {
  if (odds === null || odds === undefined) return false;
  const maxForType = MAX_ODDS_BY_PROP_TYPE[propType] ?? MAX_ACCEPTABLE_ODDS;
  return odds >= MIN_ACCEPTABLE_ODDS && odds <= maxForType;
};

// MLB core prop types + sane line caps — the ONE source. getPlayerPropOdds
// serves the off-season NHL/NBA/NFL lanes, which now return the SAME
// market shape as MLB (founder, Aug 3: props were broken for every sport —
// one universal fix, no old-style side-splitting anywhere).
const MLB_CORE_PROP_TYPES = new Set([
  'hits', 'home_runs', 'total_bases', 'rbis', 'runs_scored',
  'walks', 'stolen_bases', 'singles', 'doubles',
  'pitcher_strikeouts', 'pitcher_outs', 'pitcher_earned_runs',
  'pitcher_hits_allowed', 'pitcher_walks', 'hits_runs_rbis'
]);
const isCoreMlbMarket = (propType, line) => {
  const pt = (propType || '').toLowerCase();
  if (!MLB_CORE_PROP_TYPES.has(pt)) return false;
  const ln = parseFloat(line) || 0;
  if (pt === 'stolen_bases' && ln > 0.5) return false;
  if (pt === 'home_runs' && ln > 1.5) return false;
  if (pt === 'doubles' && ln > 0.5) return false;
  if (pt === 'singles' && ln > 1.5) return false;
  return true;
};

export const propOddsService = {
  /**
   * Bet-permission check — the odds window as a PICK rule, not a board rule
   * (props board V2, Aug 3 2026). The V2 board shows the real market both
   * sides priced; this gates which SIDES are takeable at pick time. Same
   * one window, applied where a bet is made.
   */
  isOddsTakeable: (odds, propType) => isOddsAcceptable(odds, propType),

  /**
   * MLB player prop MARKETS — one row per player+prop_type+line carrying BOTH
   * sides' best prices (vendor best-odds merge), core-type/line filtered,
   * with NO odds-window filtering and NO side-splitting. This is the props
   * board V2 source shape: the board prints the market the way a book
   * presents it; the -200..+400 window applies at pick time via
   * isOddsTakeable, never at board construction.
   *
   * Measured Aug 3 2026 (8-game slate): the legacy per-side window left a
   * board that was 58.6% over-only rows (97% of one-sided rows were overs)
   * and stripped the under from 26% of genuinely two-sided markets — the
   * menu itself manufactured the documented over-bias.
   *
   * Requires the exact BDL game id (production callers always have it).
   */
  getMlbPlayerPropMarkets: async (gameId) => {
    if (gameId == null) throw new Error('getMlbPlayerPropMarkets requires a BDL game id');

    const bdlProps = await ballDontLieService.getMlbPlayerProps(gameId);
    if (!bdlProps || bdlProps.length === 0) return [];

    const playerIds = [...new Set(bdlProps.map(p => p.player_id).filter(Boolean))];
    const playerMap = await ballDontLieService.getMlbPlayersByIds(playerIds);

    const transformed = bdlProps.map(prop => {
      const isOverUnder = prop.market?.type === 'over_under';
      const isMilestone = prop.market?.type === 'milestone';
      const playerInfo = playerMap[prop.player_id] || {};
      return {
        player: playerInfo.name || `Player ${prop.player_id}`,
        player_id: prop.player_id,
        team: playerInfo.team || 'MLB',
        teamAbbr: playerInfo.teamAbbr || '',
        position: playerInfo.position || '',
        batsThrows: playerInfo.batsThrows || '',
        prop_type: prop.prop_type,
        line: parseFloat(prop.line_value) || 0.5,
        over_odds: isOverUnder ? prop.market?.over_odds : (isMilestone ? prop.market?.odds : null),
        under_odds: isOverUnder ? prop.market?.under_odds : null,
        market_type: prop.market?.type || 'over_under',
        vendor: prop.vendor
      };
    });

    // Vendor best-odds merge per player+type+line (same semantics as the
    // legacy branch: each side independently takes the best price offered).
    const grouped = {};
    for (const prop of transformed) {
      const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
      if (!grouped[key]) {
        grouped[key] = { ...prop };
      } else {
        if (prop.over_odds && (!grouped[key].over_odds || prop.over_odds > grouped[key].over_odds)) {
          grouped[key].over_odds = prop.over_odds;
        }
        if (prop.under_odds && (!grouped[key].under_odds || prop.under_odds > grouped[key].under_odds)) {
          grouped[key].under_odds = prop.under_odds;
        }
      }
    }

    const markets = Object.values(grouped).filter(p => isCoreMlbMarket(p.prop_type, p.line));
    console.log(`[PropOdds] MLB markets for game ${gameId}: ${bdlProps.length} raw rows → ${markets.length} core markets (both-side shape, no odds-window filter)`);
    return markets;
  },

  /**
   * Get player prop odds for a specific game
   * @param {string} sport - Sport key (e.g., 'basketball_nba')
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} [commenceTime] - ISO datetime of game start (used to derive correct search date)
   * @param {string|number} [gameId] - Exact BDL game id. When provided it is used
   *   directly — team-name matching is only a fallback for manual runs. Name
   *   matching picked the WRONG game on 2026-06-10 (yesterday's FINAL game of
   *   the same series shared the UTC date window) and is doubleheader-blind.
   * @returns {Promise<Array>} - Array of player prop odds
   * @throws {Error} When no valid current player prop data is available
   */
  getPlayerPropOdds: async (sport, homeTeam, awayTeam, commenceTime, gameId = null) => {
    try {
      console.log(`🔍 Fetching player prop odds for ${sport} game: ${homeTeam} vs ${awayTeam}...`);

      // Derive game date in EST — use commenceTime when available, fall back to now
      const getGameDateEST = () => {
        const dateSource = commenceTime ? new Date(commenceTime) : new Date();
        const estOptions = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
        const estDate = new Intl.DateTimeFormat('en-US', estOptions).format(dateSource);
        const [month, day, year] = estDate.split('/');
        return `${year}-${month}-${day}`;
      };

      // Normalize team names for flexible matching (uses shared city alias mappings)
      const normalizedHomeTeam = normalizeTeamName(homeTeam);
      const normalizedAwayTeam = normalizeTeamName(awayTeam);

      // ============ NCAAF: current event markets from The Odds API ============
      // BDL's NCAAF prop product is historical/opening data, so it cannot be
      // used as tonight's bettable board. This adapter performs exact
      // home+away+ET-date matching, then the NCAAF context validates every
      // market player and stat against BDL before Gary can see the line.
      if (sport === 'americanfootball_ncaaf') {
        console.log('[PropOdds] Using The Odds API current event markets for NCAAF player props');
        return ncaafPropOddsService.getPlayerPropMarkets({
          homeTeam,
          awayTeam,
          commenceTime,
          bdlGameId: gameId,
        });
      }
      
      // ============ NHL: Use Ball Don't Lie Player Props API ============
      if (sport === 'icehockey_nhl') {
        console.log(`[PropOdds] Using Ball Don't Lie for NHL player props`);

        const dateStr = getGameDateEST();
        console.log(`[PropOdds] NHL: Searching for games on EST date: ${dateStr}`);
        
        // Find the game ID from BDL
        const nhlGames = await ballDontLieService.getNhlGamesForDate(dateStr);

        // Exact id from the caller wins; name matching is the manual-run fallback
        const matchingGame = gameId != null
          ? (nhlGames.find(g => String(g.id) === String(gameId)) ?? { id: gameId })
          : nhlGames.find(g => {
          const homeMatch = normalizeTeamName(g.home_team?.full_name || '') === normalizedHomeTeam ||
                           normalizeTeamName(g.home_team?.full_name || '').includes(normalizedHomeTeam) ||
                           normalizedHomeTeam.includes(normalizeTeamName(g.home_team?.full_name || ''));
          const awayMatch = normalizeTeamName(g.away_team?.full_name || '') === normalizedAwayTeam ||
                           normalizeTeamName(g.away_team?.full_name || '').includes(normalizedAwayTeam) ||
                           normalizedAwayTeam.includes(normalizeTeamName(g.away_team?.full_name || ''));
          return homeMatch && awayMatch;
        });

        if (!matchingGame) {
          console.warn(`[PropOdds] No BDL game found for ${homeTeam} vs ${awayTeam}`);
          // Fall through to Odds API fallback below
        } else {
          console.log(`✅ Found BDL NHL game ID: ${matchingGame.id}`);
          
          // Fetch player props from BDL
          const bdlProps = await ballDontLieService.getNhlPlayerProps(matchingGame.id);
          
          if (bdlProps && bdlProps.length > 0) {
            // Get unique player IDs to resolve names
            const playerIds = [...new Set(bdlProps.map(p => p.player_id).filter(Boolean))];
            const playerMap = await ballDontLieService.getNhlPlayersByIds(playerIds);
            
            // Transform BDL format to our standard format
            const transformedProps = bdlProps.map(prop => {
              const isOverUnder = prop.market?.type === 'over_under';
              const isMilestone = prop.market?.type === 'milestone';
              const playerInfo = playerMap[prop.player_id] || {};
              
              return {
                player: playerInfo.name || `Player ${prop.player_id}`,
                player_id: prop.player_id,
                team: playerInfo.team || 'NHL',
                prop_type: prop.prop_type,
                line: parseFloat(prop.line_value) || 0.5,
                over_odds: isOverUnder ? prop.market?.over_odds : (isMilestone ? prop.market?.odds : null),
                under_odds: isOverUnder ? prop.market?.under_odds : null,
                vendor: prop.vendor
              };
            });
            
            // Group by player and prop type to consolidate odds from different vendors
            const grouped = {};
            for (const prop of transformedProps) {
              const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
              if (!grouped[key]) {
                grouped[key] = { ...prop };
              } else {
                // Merge odds from different vendors - take best odds
                if (prop.over_odds && (!grouped[key].over_odds || prop.over_odds > grouped[key].over_odds)) {
                  grouped[key].over_odds = prop.over_odds;
                }
                if (prop.under_odds && (!grouped[key].under_odds || prop.under_odds > grouped[key].under_odds)) {
                  grouped[key].under_odds = prop.under_odds;
                }
              }
            }
            
            const result = Object.values(grouped);
            
            // Log prop type breakdown
            const propTypes = {};
            result.forEach(p => { propTypes[p.prop_type] = (propTypes[p.prop_type] || 0) + 1; });
            console.log(`[PropOdds] BDL NHL props breakdown:`, propTypes);
            console.log(`[PropOdds] BDL returned ${result.length} unique NHL player props`);
            
            // MARKET rows, both sides — same shape as MLB (founder, Aug 3:
            // props were broken for EVERY sport; the fix is universal). The
            // odds window applies at the CLI's pick gate, never here.
            return result;
          }
        }
      }
      
      // ============ NFL: Use Ball Don't Lie Player Props API ============
      if (sport === 'americanfootball_nfl') {
        console.log(`[PropOdds] Using Ball Don't Lie for NFL player props`);

        const dateStr = getGameDateEST();
        console.log(`[PropOdds] NFL: Searching for games on EST date: ${dateStr}`);

        // Find the game ID from BDL
        const nflGames = await ballDontLieService.getNflGamesForDate(dateStr);

        // Exact id from the caller wins; name matching is the manual-run fallback
        const matchingGame = gameId != null
          ? (nflGames.find(g => String(g.id) === String(gameId)) ?? { id: gameId })
          : nflGames.find(g => {
          const homeMatch = normalizeTeamName(g.home_team?.full_name || g.home_team?.name || '') === normalizedHomeTeam ||
                           normalizeTeamName(g.home_team?.full_name || g.home_team?.name || '').includes(normalizedHomeTeam) ||
                           normalizedHomeTeam.includes(normalizeTeamName(g.home_team?.full_name || g.home_team?.name || ''));
          const awayMatch = normalizeTeamName(g.away_team?.full_name || g.away_team?.name || g.visitor_team?.name || '') === normalizedAwayTeam ||
                           normalizeTeamName(g.away_team?.full_name || g.away_team?.name || g.visitor_team?.name || '').includes(normalizedAwayTeam) ||
                           normalizedAwayTeam.includes(normalizeTeamName(g.away_team?.full_name || g.away_team?.name || g.visitor_team?.name || ''));
          return homeMatch && awayMatch;
        });

        if (!matchingGame) {
          console.warn(`[PropOdds] No BDL game found for ${homeTeam} vs ${awayTeam}`);
        } else {
          console.log(`✅ Found BDL NFL game ID: ${matchingGame.id}`);

          // Fetch player props from BDL
          const bdlProps = await ballDontLieService.getNflPlayerProps(matchingGame.id);

          if (bdlProps && bdlProps.length > 0) {
            // Get unique player IDs to resolve names
            const playerIds = [...new Set(bdlProps.map(p => p.player_id).filter(Boolean))];
            const playerMap = await ballDontLieService.getNflPlayersByIds(playerIds);

            // Transform BDL format to our standard format
            const transformedProps = bdlProps.map(prop => {
              const isOverUnder = prop.market?.type === 'over_under';
              const isMilestone = prop.market?.type === 'milestone';
              const playerInfo = playerMap[prop.player_id] || {};

              return {
                player: playerInfo.name || `Player ${prop.player_id}`,
                player_id: prop.player_id,
                team: playerInfo.team || 'NFL',
                prop_type: prop.prop_type,
                line: parseFloat(prop.line_value) || 0.5,
                over_odds: isOverUnder ? prop.market?.over_odds : (isMilestone ? prop.market?.odds : null),
                under_odds: isOverUnder ? prop.market?.under_odds : null,
                vendor: prop.vendor
              };
            });

            // Group by player and prop type
            const grouped = {};
            for (const prop of transformedProps) {
              const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
              if (!grouped[key]) {
                grouped[key] = { ...prop };
              } else {
                if (prop.over_odds && (!grouped[key].over_odds || prop.over_odds > grouped[key].over_odds)) {
                  grouped[key].over_odds = prop.over_odds;
                }
                if (prop.under_odds && (!grouped[key].under_odds || prop.under_odds > grouped[key].under_odds)) {
                  grouped[key].under_odds = prop.under_odds;
                }
              }
            }

            const result = Object.values(grouped);

            // Filter to FULL GAME props only (no quarter/half props)
            const quarterHalfPatterns = /(?:1st|2nd|3rd|4th|first|second|third|fourth)[-_\s]*(quarter|half)|(?:1q|2q|3q|4q|1h|2h|q1|q2|q3|q4|h1|h2)(?:_|$)|first\d+min/i;
            const fullGameProps = result.filter(p => {
              const propType = (p.prop_type || '').toLowerCase();
              return !quarterHalfPatterns.test(propType);
            });

            // Log prop type breakdown
            const propTypes = {};
            fullGameProps.forEach(p => { propTypes[p.prop_type] = (propTypes[p.prop_type] || 0) + 1; });
            console.log(`[PropOdds] BDL NFL props breakdown (full game only):`, propTypes);
            console.log(`[PropOdds] BDL returned ${fullGameProps.length} unique NFL player props (filtered ${result.length - fullGameProps.length} quarter/half props)`);

            // MARKET rows, both sides — same shape as MLB (founder, Aug 3:
            // props were broken for EVERY sport; the fix is universal). The
            // odds window applies at the CLI's pick gate, never here.
            return fullGameProps;
          }
        }
      }

      // ============ NBA: Use Ball Don't Lie Player Props API ============
      if (sport === 'basketball_nba') {
        console.log(`[PropOdds] Using Ball Don't Lie for NBA player props`);

        const dateStr = getGameDateEST();
        console.log(`[PropOdds] NBA: Searching for games on EST date: ${dateStr}`);

        // Find the game ID from BDL
        const nbaGames = await ballDontLieService.getNbaGamesForDate(dateStr);

        // Exact id from the caller wins; name matching is the manual-run fallback
        const matchingGame = gameId != null
          ? (nbaGames.find(g => String(g.id) === String(gameId)) ?? { id: gameId })
          : nbaGames.find(g => {
          const homeMatch = normalizeTeamName(g.home_team?.full_name || g.home_team?.name || '') === normalizedHomeTeam ||
                           normalizeTeamName(g.home_team?.full_name || g.home_team?.name || '').includes(normalizedHomeTeam) ||
                           normalizedHomeTeam.includes(normalizeTeamName(g.home_team?.full_name || g.home_team?.name || ''));
          const awayMatch = normalizeTeamName(g.visitor_team?.full_name || g.visitor_team?.name || '') === normalizedAwayTeam ||
                           normalizeTeamName(g.visitor_team?.full_name || g.visitor_team?.name || '').includes(normalizedAwayTeam) ||
                           normalizedAwayTeam.includes(normalizeTeamName(g.visitor_team?.full_name || g.visitor_team?.name || ''));
          return homeMatch && awayMatch;
        });

        if (!matchingGame) {
          console.warn(`[PropOdds] No BDL game found for ${homeTeam} vs ${awayTeam}`);
        } else {
          console.log(`✅ Found BDL NBA game ID: ${matchingGame.id}`);

          // Fetch player props from BDL
          const bdlProps = await ballDontLieService.getNbaPlayerProps(matchingGame.id);

          if (bdlProps && bdlProps.length > 0) {
            // Get unique player IDs to resolve names
            const playerIds = [...new Set(bdlProps.map(p => p.player_id).filter(Boolean))];
            const playerMap = await ballDontLieService.getNbaPlayersByIds(playerIds);

            // Transform BDL format to our standard format
            const transformedProps = bdlProps.map(prop => {
              const isOverUnder = prop.market?.type === 'over_under';
              const isMilestone = prop.market?.type === 'milestone';
              const playerInfo = playerMap[prop.player_id] || {};

              return {
                player: playerInfo.name || `Player ${prop.player_id}`,
                player_id: prop.player_id,
                team: playerInfo.team || 'NBA',
                prop_type: prop.prop_type,
                line: parseFloat(prop.line_value) || 0.5,
                over_odds: isOverUnder ? prop.market?.over_odds : (isMilestone ? prop.market?.odds : null),
                under_odds: isOverUnder ? prop.market?.under_odds : null,
                vendor: prop.vendor
              };
            });

            // Group by player and prop type
            const grouped = {};
            for (const prop of transformedProps) {
              const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
              if (!grouped[key]) {
                grouped[key] = { ...prop };
              } else {
                if (prop.over_odds && (!grouped[key].over_odds || prop.over_odds > grouped[key].over_odds)) {
                  grouped[key].over_odds = prop.over_odds;
                }
                if (prop.under_odds && (!grouped[key].under_odds || prop.under_odds > grouped[key].under_odds)) {
                  grouped[key].under_odds = prop.under_odds;
                }
              }
            }

            const result = Object.values(grouped);

            // Filter to FULL GAME props only (no quarter/half props)
            const quarterHalfPatterns = /(?:1st|2nd|3rd|4th|first|second|third|fourth)[-_\s]*(quarter|half)|(?:1q|2q|3q|4q|1h|2h|q1|q2|q3|q4|h1|h2)(?:_|$)|first\d+min/i;
            const fullGameProps = result.filter(p => {
              const propType = (p.prop_type || '').toLowerCase();
              return !quarterHalfPatterns.test(propType);
            });

            // Log prop type breakdown
            const propTypes = {};
            fullGameProps.forEach(p => { propTypes[p.prop_type] = (propTypes[p.prop_type] || 0) + 1; });
            console.log(`[PropOdds] BDL NBA props breakdown (full game only):`, propTypes);
            console.log(`[PropOdds] BDL returned ${fullGameProps.length} unique NBA player props (filtered ${result.length - fullGameProps.length} quarter/half props)`);

            // MARKET rows, both sides — same shape as MLB (founder, Aug 3:
            // props were broken for EVERY sport; the fix is universal). The
            // odds window applies at the CLI's pick gate, never here.
            return fullGameProps;
          }
        }
      }


      // ============ Unsupported sport ============
      console.warn(`[PropOdds] Sport '${sport}' player props not supported.`);
      console.log(`⚠️ No player props available for ${sport}. Returning empty.`);
      return [];
    } catch (error) {
      console.error(`❌ Error fetching player prop odds for ${homeTeam} vs ${awayTeam}: ${error.message}`);
      throw error;
    }
  },

  // getPlayerPropsFromSportsbooks, extractStructuredPropsFromText, standardizePropType, validatePlayerProps removed — deprecated dead code
};
