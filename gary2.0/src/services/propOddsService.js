/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 * NOTE: The Odds API has been deprecated - all props now come from Ball Don't Lie
 */
import { ballDontLieService } from './ballDontLieService.js';
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

/**
 * Check if odds are within acceptable range
 * @param {number} odds - American odds value
 * @returns {boolean} - True if odds are acceptable
 */
const isOddsAcceptable = (odds) => {
  if (odds === null || odds === undefined) return false;
  return odds >= MIN_ACCEPTABLE_ODDS && odds <= MAX_ACCEPTABLE_ODDS;
};

export const propOddsService = {
  /**
   * Filter out player props with odds outside acceptable range
   * Range: -200 to +400 (inclusive)
   * - Filters out heavy juice (-201 and worse)
   * - Filters out lottery tickets (+401 and higher)
   * @private
   * @param {Array} props - Array of player prop data
   * @returns {Array} - Filtered props with odds in acceptable range, split into separate over/under entries
   */
  filterPropsByOddsValue: (props) => {
    if (!props || !Array.isArray(props)) {
      return [];
    }
    
    const originalCount = props.length;
    let splitProps = [];
    
    // Process each prop to split into separate over/under entries and filter by odds
    for (const prop of props) {
      // Only include the OVER side if odds are in acceptable range (-200 to +400)
      if (prop.over_odds !== null && isOddsAcceptable(prop.over_odds)) {
        splitProps.push({
          player: prop.player,
          player_id: prop.player_id,  // FIXED: Preserve player_id for context building
          team: prop.team,
          prop_type: prop.prop_type,
          line: prop.line,
          side: 'OVER',  // Add explicit side for clarity
          odds: prop.over_odds,
          over_odds: prop.over_odds,
          under_odds: null  // Not relevant for this entry
        });
      } else if (prop.over_odds !== null) {
        const reason = prop.over_odds < MIN_ACCEPTABLE_ODDS 
          ? `heavy juice (${prop.over_odds} worse than ${MIN_ACCEPTABLE_ODDS})`
          : `lottery ticket (${prop.over_odds} exceeds +${MAX_ACCEPTABLE_ODDS})`;
        console.log(`Filtering out OVER side for ${prop.player} ${prop.prop_type} ${prop.line}: ${reason}`);
      }
      
      // Only include the UNDER side if odds are in acceptable range (-200 to +400)
      if (prop.under_odds !== null && isOddsAcceptable(prop.under_odds)) {
        splitProps.push({
          player: prop.player,
          player_id: prop.player_id,  // FIXED: Preserve player_id for context building
          team: prop.team,
          prop_type: prop.prop_type,
          line: prop.line,
          side: 'UNDER',  // Add explicit side for clarity
          odds: prop.under_odds,
          over_odds: null,  // Not relevant for this entry
          under_odds: prop.under_odds
        });
      } else if (prop.under_odds !== null) {
        const reason = prop.under_odds < MIN_ACCEPTABLE_ODDS 
          ? `heavy juice (${prop.under_odds} worse than ${MIN_ACCEPTABLE_ODDS})`
          : `lottery ticket (${prop.under_odds} exceeds +${MAX_ACCEPTABLE_ODDS})`;
        console.log(`Filtering out UNDER side for ${prop.player} ${prop.prop_type} ${prop.line}: ${reason}`);
      }
    }
    
    console.log(`Filtered props by odds value: ${originalCount} original props → ${splitProps.length} valid sides (range: ${MIN_ACCEPTABLE_ODDS} to +${MAX_ACCEPTABLE_ODDS})`);
    
    return splitProps;
  },
  /**
   * Get player prop odds for a specific game
   * @param {string} sport - Sport key (e.g., 'basketball_nba')
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} [commenceTime] - ISO datetime of game start (used to derive correct search date)
   * @returns {Promise<Array>} - Array of player prop odds
   * @throws {Error} When no valid current player prop data is available
   */
  getPlayerPropOdds: async (sport, homeTeam, awayTeam, commenceTime) => {
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
      
      // ============ NHL: Use Ball Don't Lie Player Props API ============
      if (sport === 'icehockey_nhl') {
        console.log(`[PropOdds] Using Ball Don't Lie for NHL player props`);

        const dateStr = getGameDateEST();
        console.log(`[PropOdds] NHL: Searching for games on EST date: ${dateStr}`);
        
        // Find the game ID from BDL
        const nhlGames = await ballDontLieService.getNhlGamesForDate(dateStr);
        
        // Find matching game
        const matchingGame = nhlGames.find(g => {
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
            
            // Filter by odds value
            const filtered = propOddsService.filterPropsByOddsValue(result);
            return filtered;
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

        // Find matching game
        const matchingGame = nflGames.find(g => {
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

            // Filter by odds value
            const filtered = propOddsService.filterPropsByOddsValue(fullGameProps);
            return filtered;
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

        // Find matching game
        const matchingGame = nbaGames.find(g => {
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

            // Filter by odds value
            const filtered = propOddsService.filterPropsByOddsValue(fullGameProps);
            return filtered;
          }
        }
      }

      // ============ Unsupported sport - BDL does not have props ============
      // The Odds API has been deprecated - only NHL, NFL, NBA props are supported via BDL
      console.warn(`[PropOdds] Sport '${sport}' player props not supported. BDL only has NHL, NFL, NBA props.`);
      console.log(`⚠️ No player props available for ${sport}. Returning empty.`);
      return [];
    } catch (error) {
      console.error(`❌ Error fetching player prop odds for ${homeTeam} vs ${awayTeam}: ${error.message}`);
      throw error;
    }
  },

  // getPlayerPropsFromSportsbooks, extractStructuredPropsFromText, standardizePropType, validatePlayerProps removed — deprecated dead code
};
