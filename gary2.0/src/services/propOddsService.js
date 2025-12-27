/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 */
import axios from 'axios';
import { configLoader } from './configLoader.js';
import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

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
  ],
  soccer_epl: [
    // Soccer player props - shots, goals, assists
    'player_shots',
    'player_shots_on_target',
    'player_goal_scorer_anytime',
    'player_first_goal_scorer',
    'player_last_goal_scorer',
    'player_to_score_2_or_more',
    'player_assists'
  ]
};

export const propOddsService = {
  /**
   * Filter out player props with odds of -150 or worse
   * @private
   * @param {Array} props - Array of player prop data
   * @returns {Array} - Filtered props with odds better than -150, split into separate over/under entries
   */
  filterPropsByOddsValue: (props) => {
    if (!props || !Array.isArray(props)) {
      return [];
    }
    
    const originalCount = props.length;
    let splitProps = [];
    
    // Process each prop to split into separate over/under entries and filter by odds
    for (const prop of props) {
      // Only include the OVER side if odds are better than -150
      if (prop.over_odds !== null && prop.over_odds > -150) {
        splitProps.push({
          player: prop.player,
          team: prop.team,
          prop_type: prop.prop_type,
          line: prop.line,
          side: 'OVER',  // Add explicit side for clarity
          odds: prop.over_odds,
          over_odds: prop.over_odds,
          under_odds: null  // Not relevant for this entry
        });
      } else if (prop.over_odds !== null) {
        console.log(`Filtering out OVER side for ${prop.player} ${prop.prop_type} ${prop.line} (odds: ${prop.over_odds} is worse than -150)`);
      }
      
      // Only include the UNDER side if odds are better than -150
      if (prop.under_odds !== null && prop.under_odds > -150) {
        splitProps.push({
          player: prop.player,
          team: prop.team,
          prop_type: prop.prop_type,
          line: prop.line,
          side: 'UNDER',  // Add explicit side for clarity
          odds: prop.under_odds,
          over_odds: null,  // Not relevant for this entry
          under_odds: prop.under_odds
        });
      } else if (prop.under_odds !== null) {
        console.log(`Filtering out UNDER side for ${prop.player} ${prop.prop_type} ${prop.line} (odds: ${prop.under_odds} is worse than -150)`);
      }
    }
    
    console.log(`Filtered props by odds value: ${originalCount} original props → ${splitProps.length} valid sides (removing odds of -150 or worse)`);
    
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
        
        // Get today's date in YYYY-MM-DD format (EST)
        const now = new Date();
        const estOffset = -5 * 60; // EST is UTC-5
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const est = new Date(utc + (estOffset * 60000));
        const dateStr = est.toISOString().split('T')[0];
        
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
      
      // ============ EPL: Use Ball Don't Lie Player Props API ============
      if (sport === 'soccer_epl') {
        console.log(`[PropOdds] Using Ball Don't Lie for EPL player props`);
        
        // Get today's date in YYYY-MM-DD format (EST)
        const now = new Date();
        const estOffset = -5 * 60; // EST is UTC-5
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const est = new Date(utc + (estOffset * 60000));
        const dateStr = est.toISOString().split('T')[0];
        
        // Find the game ID from BDL
        const eplGames = await ballDontLieService.getEplGamesForDate(dateStr);
        
        // Get all EPL teams for ID-to-name mapping
        const eplTeams = await ballDontLieService.getTeams('soccer_epl');
        const teamMap = {};
        (eplTeams || []).forEach(t => {
          teamMap[t.id] = t;
        });
        
        // Find matching game by resolving team IDs to names
        const matchingGame = eplGames.find(g => {
          // BDL EPL games use home_team_id/away_team_id (integers)
          const homeTeamObj = teamMap[g.home_team_id] || {};
          const awayTeamObj = teamMap[g.away_team_id] || {};
          const homeTeamName = homeTeamObj.name || homeTeamObj.short_name || '';
          const awayTeamName = awayTeamObj.name || awayTeamObj.short_name || '';
          
          const homeMatch = normalizeTeamName(homeTeamName) === normalizedHomeTeam ||
                           normalizeTeamName(homeTeamName).includes(normalizedHomeTeam) ||
                           normalizedHomeTeam.includes(normalizeTeamName(homeTeamName));
          const awayMatch = normalizeTeamName(awayTeamName) === normalizedAwayTeam ||
                           normalizeTeamName(awayTeamName).includes(normalizedAwayTeam) ||
                           normalizedAwayTeam.includes(normalizeTeamName(awayTeamName));
          return homeMatch && awayMatch;
        });
        
        if (!matchingGame) {
          console.warn(`[PropOdds] No BDL EPL game found for ${homeTeam} vs ${awayTeam} on ${dateStr}`);
          console.log(`[PropOdds] Available EPL games:`, eplGames.map(g => {
            const h = teamMap[g.home_team_id]?.name || g.home_team_id;
            const a = teamMap[g.away_team_id]?.name || g.away_team_id;
            return `${h} vs ${a}`;
          }));
          // Fall through to Odds API fallback below
        } else {
          console.log(`✅ Found BDL EPL game ID: ${matchingGame.id}`);
          
          // Fetch player props from BDL
          const bdlProps = await ballDontLieService.getEplPlayerProps(matchingGame.id);
          
          if (bdlProps && bdlProps.length > 0) {
            // Get unique player IDs to resolve names
            const playerIds = [...new Set(bdlProps.map(p => p.player_id).filter(Boolean))];
            const playerMap = await ballDontLieService.getEplPlayersByIds(playerIds);
            
            // Transform BDL format to our standard format
            // BDL EPL props have: { market: { type: 'milestone' | 'over_under', odds, over_odds, under_odds } }
            const transformedProps = bdlProps.map(prop => {
              const isOverUnder = prop.market?.type === 'over_under';
              const isMilestone = prop.market?.type === 'milestone';
              const playerInfo = playerMap[prop.player_id] || {};
              
              return {
                player: playerInfo.name || `Player ${prop.player_id}`,
                player_id: prop.player_id,
                team: playerInfo.team || 'EPL',
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
            console.log(`[PropOdds] BDL EPL props breakdown:`, propTypes);
            console.log(`[PropOdds] BDL returned ${result.length} unique EPL player props`);
            
            // Filter by odds value
            const filtered = propOddsService.filterPropsByOddsValue(result);
            return filtered;
          } else {
            console.log(`[PropOdds] BDL returned no EPL props for game ${matchingGame.id}, falling back to Odds API`);
          }
        }
      }
      
      // ============ Other Sports: Use The Odds API ============
      let apiKey = null;
      try {
        apiKey = await configLoader.getOddsApiKey();
      } catch (e) {
        apiKey = null;
      }
      const useOddsApi = Boolean(apiKey);
      
      let game = null;
      
      // For sports where we need The Odds API game IDs directly (if BDL fails for EPL), fetch from Odds API
      const needsOddsApiGameId = ['soccer_epl'].includes(sport);
      
      if (needsOddsApiGameId && useOddsApi) {
        try {
          console.log(`[PropOdds] Fetching game ID directly from The Odds API for ${sport}...`);
          const oddsApiGames = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
            params: { apiKey, regions: 'us', markets: 'h2h' }
          });
          
          if (oddsApiGames.data && oddsApiGames.data.length > 0) {
            // Find matching game by team names
            game = oddsApiGames.data.find(g => {
              const normalizedGameHome = normalizeTeamName(g.home_team);
              const normalizedGameAway = normalizeTeamName(g.away_team);
              return (normalizedGameHome === normalizedHomeTeam && normalizedGameAway === normalizedAwayTeam) ||
                     (normalizedGameHome === normalizedAwayTeam && normalizedGameAway === normalizedHomeTeam);
            });
            
            if (game) {
              console.log(`✅ Found matching game from Odds API with ID: ${game.id}`);
            }
          }
        } catch (e) {
          console.warn(`[PropOdds] Could not fetch from Odds API directly: ${e.message}`);
        }
      }
      
      // Fallback to BDL-backed oddsService for other sports or if Odds API lookup failed
      if (!game) {
        const games = await oddsService.getUpcomingGames(sport);
        console.log(`Found ${games.length} upcoming ${sport} games.`);
        
        // Try exact match first
        game = games.find(g => 
          (g.home_team === homeTeam && g.away_team === awayTeam) || 
          (g.home_team === awayTeam && g.away_team === homeTeam)
        );
        
        // If exact match fails, try normalized match
        if (!game) {
          game = games.find(g => {
            const normalizedGameHome = normalizeTeamName(g.home_team);
            const normalizedGameAway = normalizeTeamName(g.away_team);
            
            return (normalizedGameHome === normalizedHomeTeam && normalizedGameAway === normalizedAwayTeam) ||
                   (normalizedGameHome === normalizedAwayTeam && normalizedGameAway === normalizedHomeTeam);
          });
        }
        
        // Log all available games if we can't find a match
        if (!game) {
          console.error(`❌ No game found matching ${homeTeam} vs ${awayTeam} for ${sport} today.`);
          console.log('Available games:');
          games.forEach(g => console.log(`- ${g.home_team} vs ${g.away_team}`));
          throw new Error(`No game found for ${homeTeam} vs ${awayTeam} in today's schedule.`);
        }
      }
      
      console.log(`✅ Found matching game with ID: ${game.id}, scheduled for ${new Date(game.commence_time).toLocaleString()}`);
      
      // If no Odds API key, return empty array
      if (!useOddsApi) {
        console.log('⚠️ No Odds API key configured. Cannot fetch player props.');
        return [];
      }
      
      // Odds API path (only if key is available)
      // Get the appropriate prop markets for this sport
      const marketsList = PROP_MARKETS[sport] || ['player_points'];
      console.log(`Will fetch ${marketsList.length} markets individually for ${sport}`);
      
      // Fetch each market type individually to avoid 404 errors
      const allPlayerProps = [];
      const marketStats = {};
      
      console.log(`========= PROP MARKET ANALYSIS FOR ${sport}: ${homeTeam} vs ${awayTeam} =========`);
      
      for (const market of marketsList) {
        const startTime = Date.now();
        const startingPropsCount = allPlayerProps.length;
        
        console.log(`🔍 Fetching ${sport} player props for market: ${market}`);
        
        try {
          const propResponse = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/events/${game.id}/odds`, {
            params: {
              apiKey,
              regions: 'us',
              markets: market, // Just one market at a time
              oddsFormat: 'american',
              dateFormat: 'iso',
              bookmakers: ALLOWED_BOOKMAKERS.join(',')  // Only DraftKings & FanDuel
            }
          });
          
          if (propResponse.data && 
              propResponse.data.bookmakers && 
              propResponse.data.bookmakers.length > 0) {
            // Filter to only allowed bookmakers (belt & suspenders - API param should handle this)
            const bookmakers = propResponse.data.bookmakers.filter(
              bk => ALLOWED_BOOKMAKERS.includes(bk.key)
            );
            for (const bookmaker of bookmakers) {
              for (const bkMarket of bookmaker.markets) {
                if (bkMarket.key !== market) continue;
                const propType = bkMarket.key
                  .replace('player_', '')
                  .replace('batter_', '')
                  .replace('pitcher_', '');
                
                for (const outcome of bkMarket.outcomes) {
                  const isYesNoProp = ['Yes', 'No'].includes(outcome.name);
                  let overOdds = null;
                  let underOdds = null;
                  let lineValue = outcome.point;
                  
                  if (isYesNoProp) {
                    lineValue = 0.5;
                    if (outcome.name === 'Yes') overOdds = outcome.price;
                    else if (outcome.name === 'No') underOdds = outcome.price;
                  } else {
                    overOdds = outcome.name === 'Over' ? outcome.price : null;
                    underOdds = outcome.name === 'Under' ? outcome.price : null;
                  }
                  
                  // IMPORTANT: Do NOT trust team data from The Odds API - it's often stale/wrong
                  // Teams will be resolved from BDL (Ball Don't Lie) in the context builder
                  // BDL has authoritative, up-to-date roster data
                  
                  // Store with null team - let BDL resolve it later
                  allPlayerProps.push({
                    player: outcome.description,
                    team: null, // Will be resolved from BDL in context builder (source of truth)
                    prop_type: propType,
                    line: lineValue,
                    over_odds: overOdds,
                    under_odds: underOdds,
                    _home_team: game.home_team,  // Store game context for later team resolution
                    _away_team: game.away_team
                  });
                }
              }
            }
          }
        } catch (err) {
          if (err.response && err.response.status === 404) {
            console.warn(`❌ No data available for ${market} in game ${game.id}, continuing to next market`);
            marketStats[market] = { success: false, count: 0, error: '404 Not Found' };
            continue;
          } else if (err.response && err.response.status === 422) {
            console.warn(`❌ API cannot process ${market} market request (422 error), continuing to next market`);
            marketStats[market] = { success: false, count: 0, error: '422 Unprocessable Entity' };
            continue;
          } else {
            console.error(`❌ Error fetching ${market} data:`, err);
            marketStats[market] = { success: false, count: 0, error: err.message || 'Unknown error' };
          }
        }
        
        const endTime = Date.now();
        const propsAdded = allPlayerProps.length - startingPropsCount;
        marketStats[market] = {
          success: propsAdded > 0,
          count: propsAdded,
          timeMs: endTime - startTime
        };
        if (propsAdded > 0) {
          console.log(`✅ Successfully added ${propsAdded} props for market: ${market}`);
        } else {
          console.log(`⚠️ No props added for market: ${market} (API returned data but no valid props found)`);
        }
      }
      
      console.log('\n📊 MARKET RETRIEVAL SUMMARY:');
      for (const market in marketStats) {
        const stats = marketStats[market];
        if (stats.success) {
          console.log(`  ✅ ${market}: ${stats.count} props retrieved in ${stats.timeMs}ms`);
        } else {
          console.log(`  ❌ ${market}: Failed - ${stats.error || 'No props found'}`);
        }
      }
      console.log(`Total props retrieved: ${allPlayerProps.length}`);
      console.log(`==================================================`);
      
      if (allPlayerProps.length === 0) {
        console.log('❌ No player prop data found via Odds API. Returning empty.');
        return [];
      }
      
      // Filter out any alternate props that might have been returned by the API
      const filteredProps = allPlayerProps.filter(prop => {
        // Check if this is an MLB alternate prop type
        if (sport === 'baseball_mlb' && prop.prop_type.includes('alternate')) {
          console.log(`🔍 Filtering out alternate MLB prop: ${prop.player} - ${prop.prop_type}`);
          return false;
        }
        return true;
      });
      
      // Group over/under odds together for the same player and prop type
      const groupedProps = {};
      for (const prop of filteredProps) {
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
      
      // Convert back to array
      const result = Object.values(groupedProps);
      console.log(`Found ${result.length} player props for ${homeTeam} vs ${awayTeam}`);
      
      // Filter out props with odds of -150 or worse
      const filteredByOddsResult = propOddsService.filterPropsByOddsValue(result);
      console.log(`Final filtered prop count: ${filteredByOddsResult.length} props with odds better than -150`);
      
      return filteredByOddsResult;
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
