/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 * NOTE: The Odds API has been deprecated - all props now come from Ball Don't Lie
 */
import axios from 'axios';
import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { ballDontLieOddsService } from './ballDontLieOddsService.js';

// NOTE: The Odds API deprecated - BDL is now the primary source for all player props

// Only fetch from major US sportsbooks to reduce API token usage
const ALLOWED_BOOKMAKERS = ['draftkings', 'fanduel'];

// Define player prop markets by sport (limited to reduce API usage)
const PROP_MARKETS = {
  basketball_nba: [
    'player_points',
    'player_rebounds',
    'player_assists',
    'player_threes',
    'player_blocks',
    'player_steals',
    'player_points_rebounds_assists',  // PRA combo
    'player_points_rebounds'            // PR combo
  ],
  americanfootball_nfl: [
    // Full game NFL player prop markets (expanded coverage)
    // Passing
    'player_pass_yds',
    'player_pass_tds',
    'player_pass_completions',
    'player_pass_attempts',
    'player_pass_interceptions',
    'player_pass_longest_completion',
    // Rushing
    'player_rush_yds',
    'player_rush_attempts',
    'player_rush_tds',
    'player_rush_longest',
    // Receiving
    'player_reception_yds',
    'player_receptions',
    'player_reception_tds',
    'player_reception_longest',
    // Combined Stats
    'player_pass_rush_yds',
    'player_rush_reception_yds',
    'player_rush_reception_tds',
    'player_pass_rush_reception_yds',
    'player_pass_rush_reception_tds',
    // Touchdown Scorers
    'player_anytime_td',
    'player_1st_td',
    'player_last_td',
    'player_tds_over',
    // Defense
    'player_tackles_assists',
    'player_sacks',
    'player_solo_tackles',
    // Kicker
    'player_field_goals',
    'player_kicking_points',
    'player_pats'
  ],
  baseball_mlb: [
    // Standard MLB player props - using only non-alternate lines
    'batter_home_runs',
    'batter_hits',
    'batter_total_bases',
    'batter_rbis',
    'batter_runs_scored',
    'batter_hits_runs_rbis',
    'batter_singles',
    'batter_doubles',
    'batter_triples',
    'batter_walks',
    'batter_strikeouts',
    'batter_stolen_bases',
    'pitcher_strikeouts',
    'pitcher_hits_allowed',
    'pitcher_walks',
    'pitcher_earned_runs',
    'pitcher_outs',
    'batter_first_home_run',
    'pitcher_record_a_win'
  ],
  icehockey_nhl: [
    // NHL player props from The Odds API (limited to reduce API usage)
    'player_points',
    'player_power_play_points',
    'player_assists',
    'player_blocked_shots',
    'player_shots_on_goal',
    'player_goals',
    'player_total_saves'
    // Goal scorer props removed to reduce token usage
  ]
};

// ============================================================================
// ODDS FILTER CONSTANTS
// ============================================================================
// Only accept odds in a reasonable range for night-in-night-out picks:
// - No heavy juice (worse than -200) - the vig kills long-term edge
// - No lottery tickets (better than +250) - hat tricks, multi-goal, etc.
const MIN_ACCEPTABLE_ODDS = -200;  // -200 OK, -201 filtered
const MAX_ACCEPTABLE_ODDS = 250;   // +250 OK, +251 filtered

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
   * Range: -200 to +250 (inclusive)
   * - Filters out heavy juice (-201 and worse)
   * - Filters out lottery tickets (+251 and higher)
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
      // Only include the OVER side if odds are in acceptable range (-200 to +250)
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
      
      // Only include the UNDER side if odds are in acceptable range (-200 to +250)
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
   * @returns {Promise<Array>} - Array of player prop odds
   * @throws {Error} When no valid current player prop data is available
   */
  getPlayerPropOdds: async (sport, homeTeam, awayTeam) => {
    try {
      console.log(`🔍 Fetching player prop odds for ${sport} game: ${homeTeam} vs ${awayTeam}...`);
      
      // Normalize team names for more flexible matching
      const normalizeTeamName = (name) => name.toLowerCase().replace(/\s+/g, '');
      const normalizedHomeTeam = normalizeTeamName(homeTeam);
      const normalizedAwayTeam = normalizeTeamName(awayTeam);
      
      // ============ NHL: Use Ball Don't Lie Player Props API ============
      if (sport === 'icehockey_nhl') {
        console.log(`[PropOdds] Using Ball Don't Lie for NHL player props`);
        
        // Get today's date in YYYY-MM-DD format (EST) - DST-safe
        const now = new Date();
        const estOptions = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
        const estDate = new Intl.DateTimeFormat('en-US', estOptions).format(now);
        const [month, day, year] = estDate.split('/');
        const dateStr = `${year}-${month}-${day}`;
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

        // Get today's date in YYYY-MM-DD format (EST) - DST-safe
        const now = new Date();
        const estOptions = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
        const estDate = new Intl.DateTimeFormat('en-US', estOptions).format(now);
        const [month, day, year] = estDate.split('/');
        const dateStr = `${year}-${month}-${day}`;
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
            const quarterHalfPatterns = /(?:1st|2nd|3rd|4th|first|second|third|fourth)[-_\s]*(quarter|half)|(?:1q|2q|3q|4q|1h|2h|q1|q2|q3|q4|h1|h2)(?:_|$)/i;
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

        // Get today's date in YYYY-MM-DD format (EST) - DST-safe
        const now = new Date();
        const estOptions = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
        const estDate = new Intl.DateTimeFormat('en-US', estOptions).format(now);
        const [month, day, year] = estDate.split('/');
        const dateStr = `${year}-${month}-${day}`;
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

            // Log prop type breakdown
            const propTypes = {};
            result.forEach(p => { propTypes[p.prop_type] = (propTypes[p.prop_type] || 0) + 1; });
            console.log(`[PropOdds] BDL NBA props breakdown:`, propTypes);
            console.log(`[PropOdds] BDL returned ${result.length} unique NBA player props`);

            // Filter by odds value
            const filtered = propOddsService.filterPropsByOddsValue(result);
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

  /**
   * Get player props from sportsbooks - DEPRECATED
   * Use The Odds API for player props instead
   * @deprecated Use The Odds API directly
   */
  getPlayerPropsFromSportsbooks: async (sport, game) => {
    console.log(`⚠️ getPlayerPropsFromSportsbooks is deprecated - use The Odds API for ${sport} props`);
    return [];
  },
  
  /**
   * Extract structured prop data - DEPRECATED
   * @deprecated No longer used
   */
  extractStructuredPropsFromText: (text, sport, homeTeam, awayTeam) => {
    console.log('⚠️ extractStructuredPropsFromText is deprecated');
    return [];
  },

  /**
   * Filter out any invalid props - kept for backwards compatibility
   * @private
      const validProps = props.filter(prop => (
        prop.player && 
        prop.prop_type && 
        !isNaN(prop.line) && 
        (prop.over_odds !== null || prop.under_odds !== null)
      ));
      
      console.log(`Extracted ${validProps.length} props using regex patterns`);
      return validProps;
    } catch (error) {
      console.error('Error extracting structured props:', error);
      return [];
    }
  },
  
  /**
   * Standardize prop type names across different sources
   * @private
   * @param {string} propType - Raw prop type name
   * @param {string} sport - Sport key
   * @returns {string} - Standardized prop type
   */
  standardizePropType: (propType, sport) => {
    const type = propType.toLowerCase();
    
    // MLB standardization based on official Odds API documentation
    if (sport === 'mlb' || sport === 'baseball_mlb') {
      // Official market mapping using exact API keys
      const marketMap = {
        'batter_home_runs': 'home_runs',
        'batter_first_home_run': 'first_home_run',
        'batter_hits': 'hits',
        'batter_total_bases': 'total_bases',
        'batter_rbis': 'rbis',
        'batter_runs_scored': 'runs',
        'batter_hits_runs_rbis': 'hits_runs_rbis',
        'batter_singles': 'singles',
        'batter_doubles': 'doubles',
        'batter_triples': 'triples',
        'batter_walks': 'walks',
        'batter_strikeouts': 'strikeouts',  // Problematic market #1
        'batter_stolen_bases': 'stolen_bases',
        'pitcher_strikeouts': 'strikeouts',
        'pitcher_record_a_win': 'win',      // Problematic market #2
        'pitcher_hits_allowed': 'hits_allowed',
        'pitcher_walks': 'walks',
        'pitcher_earned_runs': 'earned_runs',
        'pitcher_outs': 'outs'              // Problematic market #3
      };
      
      // Return the standardized market name if it exists in our map
      if (marketMap[type]) {
        return marketMap[type];
      }
      
      // Fallback to pattern matching for compatibility with other data sources
      if (type.includes('hit') && !type.includes('hits_allowed')) return 'hits';
      if (type.includes('home') && type.includes('run') && !type.includes('first')) return 'home_runs';
      if (type.includes('total') && type.includes('base')) return 'total_bases';
      if (type.includes('strike') || type.includes('k')) return 'strikeouts';
      if (type.includes('rbi')) return 'rbis';
      if (type.includes('run') && !type.includes('home') && !type.includes('earned')) return 'runs';
      if (type.includes('walk')) return 'walks';
    } 
    // NBA standardization
    else if (sport === 'nba' || sport === 'basketball_nba') {
      if (type.includes('point')) return 'points';
      if (type.includes('rebound')) return 'rebounds';
      if (type.includes('assist')) return 'assists';
      if (type.includes('three') || type.includes('3pt') || type.includes('3-point')) return 'threes';
      if (type.includes('block')) return 'blocks';
      if (type.includes('steal')) return 'steals';
    }
    // NFL standardization
    else if (sport === 'nfl' || sport === 'americanfootball_nfl') {
      // Map exact Odds API market keys
      const nflMap = {
        // Passing
        'player_pass_yds': 'pass_yds',
        'player_pass_tds': 'pass_tds',
        'player_pass_completions': 'pass_completions',
        'player_pass_attempts': 'pass_attempts',
        'player_pass_interceptions': 'interceptions',
        'player_pass_longest_completion': 'longest_pass',
        // Rushing
        'player_rush_yds': 'rush_yds',
        'player_rush_attempts': 'rush_attempts',
        'player_rush_tds': 'rush_tds',
        'player_rush_longest': 'longest_rush',
        // Receiving
        'player_reception_yds': 'rec_yds',
        'player_receptions': 'receptions',
        'player_reception_tds': 'rec_tds',
        'player_reception_longest': 'longest_reception',
        // Combined Stats
        'player_pass_rush_yds': 'pass_rush_yds',
        'player_rush_reception_yds': 'rush_rec_yds',
        'player_rush_reception_tds': 'rush_rec_tds',
        'player_pass_rush_reception_yds': 'pass_rush_rec_yds',
        'player_pass_rush_reception_tds': 'pass_rush_rec_tds',
        // Touchdown Scorers
        'player_anytime_td': 'anytime_td',
        'player_1st_td': 'first_td',
        'player_last_td': 'last_td',
        'player_tds_over': 'tds_over',
        // Defense
        'player_tackles_assists': 'tackles_assists',
        'player_sacks': 'sacks',
        'player_solo_tackles': 'solo_tackles',
        // Kicker
        'player_field_goals': 'field_goals',
        'player_kicking_points': 'kicking_points',
        'player_pats': 'pats'
      };
      if (nflMap[type]) return nflMap[type];
      // Pattern-based fallback
      if (type.includes('pass') && type.includes('yd')) return 'pass_yds';
      if (type.includes('pass') && (type.includes('td') || type.includes('touchdown'))) return 'pass_tds';
      if (type.includes('interception')) return 'interceptions';
      if (type.includes('rush') && type.includes('yd')) return 'rush_yds';
      if (type.includes('rush') && (type.includes('attempt') || type.includes('att'))) return 'rush_attempts';
      if (type.includes('rush') && type.includes('td')) return 'rush_tds';
      if ((type.includes('receiving') || type.includes('rec')) && type.includes('yd')) return 'rec_yds';
      if (type.includes('reception') && !type.includes('yd')) return 'receptions';
      if (type.includes('anytime') && type.includes('td')) return 'anytime_td';
      if (type.includes('1st') && type.includes('td')) return 'first_td';
      if (type.includes('last') && type.includes('td')) return 'last_td';
      if (type.includes('tds_over')) return 'tds_over';
      if (type.includes('tackle') && type.includes('solo')) return 'solo_tackles';
      if (type.includes('tackle')) return 'tackles_assists';
      if (type.includes('sack')) return 'sacks';
      if (type.includes('field_goal') || type.includes('fg')) return 'field_goals';
      if (type.includes('kicking') && type.includes('point')) return 'kicking_points';
      if (type.includes('pat') || type.includes('extra_point')) return 'pats';
    }
    // NHL standardization
    else if (sport === 'nhl' || sport === 'icehockey_nhl') {
      // Map exact Odds API market keys
      const nhlMap = {
        'player_points': 'points',
        'player_power_play_points': 'power_play_points',
        'player_assists': 'assists',
        'player_blocked_shots': 'blocked_shots',
        'player_shots_on_goal': 'shots_on_goal',
        'player_goals': 'goals',
        'player_total_saves': 'saves',
        'player_goal_scorer_anytime': 'anytime_goal',
        'player_goal_scorer_first': 'first_goal',
        'player_goal_scorer_last': 'last_goal',
        // BDL format fallbacks
        'goals': 'goals',
        'assists': 'assists',
        'points': 'points',
        'shots_on_goal': 'shots_on_goal',
        'saves': 'saves',
        'power_play_points': 'power_play_points',
        'anytime_goal': 'anytime_goal'
      };
      if (nhlMap[type]) return nhlMap[type];
      // Pattern-based fallback
      if (type.includes('goal') && type.includes('anytime')) return 'anytime_goal';
      if (type.includes('goal') && type.includes('first')) return 'first_goal';
      if (type.includes('goal') && !type.includes('scorer')) return 'goals';
      if (type.includes('assist')) return 'assists';
      if (type.includes('shot')) return 'shots_on_goal';
      if (type.includes('point') && type.includes('power')) return 'power_play_points';
      if (type.includes('point')) return 'points';
      if (type.includes('save')) return 'saves';
      if (type.includes('block')) return 'blocked_shots';
    }
    
    // Return the market name without prefixes if no standardization matches
    if (type.startsWith('batter_') || type.startsWith('pitcher_')) {
      return type.replace('batter_', '').replace('pitcher_', '');
    }
    
    return type;
  },
  
  /**
   * Determine which team a player is on based on context
   * @private
   * @param {string} playerName - Player name
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {string} - Team name or 'Unknown'
   */
  determineTeam: (playerName, homeTeam, awayTeam) => {
    // This is a placeholder. In a real implementation, we would use an API
    // or player database to determine which team they're on
    return 'Unknown';
  },

  /**
   * Validate player props against known team rosters
   * @param {Array} propData - Array of player prop data
   * @param {Array} homeTeamPlayers - Array of players on home team
   * @param {Array} awayTeamPlayers - Array of players on away team
   * @returns {Array} - Valid player props
   */
  validatePlayerProps: (propData, homeTeamPlayers, awayTeamPlayers) => {
    // If we don't have prop data, return empty array
    if (!propData || propData.length === 0) {
      return [];
    }
    
    // If we don't have player data, return the props as is
    if (!homeTeamPlayers || !awayTeamPlayers) {
      return propData;
    }
    
    // Create a name lookup map for both teams' players
    const allPlayers = [...homeTeamPlayers, ...awayTeamPlayers];
    const playerNames = new Set(allPlayers.map(player => {
      return `${player.first_name} ${player.last_name}`.toLowerCase();
    }));
    
    // Filter props to only include players that are in the rosters
    const validProps = propData.filter(prop => {
      const playerName = prop.player.toLowerCase();
      return playerNames.has(playerName);
    });
    
    console.log(`Validated ${validProps.length} out of ${propData.length} player props against team rosters`);
    
    return validProps;
  }
};
