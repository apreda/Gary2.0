/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 */
import axios from 'axios';
import { configLoader } from './configLoader.js';
import { oddsService } from './oddsService.js';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

// Define player prop markets by sport
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
    'player_points',
    'player_goals',
    'player_assists',
    'player_shots_on_goal'
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
      // Get the API key from the config loader
      const apiKey = await configLoader.getOddsApiKey();
      
      if (!apiKey) {
        console.error('⚠️ ODDS API KEY IS MISSING - Cannot fetch player prop odds');
        throw new Error('API key is required for The Odds API');
      }
      
      console.log(`🔍 Fetching player prop odds for ${sport} game: ${homeTeam} vs ${awayTeam}...`);
      
      // Look up the game by team names
      const games = await oddsService.getUpcomingGames(sport);
      console.log(`Found ${games.length} upcoming ${sport} games.`);
      
      const game = games.find(g => 
        (g.home_team === homeTeam && g.away_team === awayTeam) || 
        (g.home_team === awayTeam && g.away_team === homeTeam)
      );
      
      if (!game) {
        console.error(`❌ No game found matching ${homeTeam} vs ${awayTeam} for ${sport} today.`);
        throw new Error(`No game found for ${homeTeam} vs ${awayTeam} in today's schedule.`);
      }
      
      console.log(`✅ Found matching game with ID: ${game.id}, scheduled for ${new Date(game.commence_time).toLocaleString()}`);
      
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
              dateFormat: 'iso'
            }
          });
          
          // If we got valid data, process it
          if (propResponse.data && 
              propResponse.data.bookmakers && 
              propResponse.data.bookmakers.length > 0) {
                
            // Process each bookmaker's data for this market
            const bookmakers = propResponse.data.bookmakers;
            
            // Look for bookmakers with this market
            for (const bookmaker of bookmakers) {
              for (const bkMarket of bookmaker.markets) {
                // Skip if this isn't the market we're processing
                if (bkMarket.key !== market) continue;
                
                // Clean up the market key for display (remove player_, batter_, pitcher_ prefixes)
                const propType = bkMarket.key
                  .replace('player_', '')
                  .replace('batter_', '')
                  .replace('pitcher_', '');
                
                // Debug log for problematic markets
                if (['batter_strikeouts', 'pitcher_outs', 'pitcher_record_a_win'].includes(market)) {
                  console.log(`Processing problematic market: ${market}`);
                  console.log(`Found ${bkMarket.outcomes.length} outcomes for ${market}`);
                  console.log('Sample outcome:', bkMarket.outcomes[0]);
                }
                
                // Process each outcome for this market
                for (const outcome of bkMarket.outcomes) {
                  // Check if this is a Yes/No prop like pitcher_record_a_win or batter_first_home_run
                  const isYesNoProp = ['Yes', 'No'].includes(outcome.name);
                  
                  // For Yes/No props, treat Yes like Over and No like Under
                  let overOdds = null;
                  let underOdds = null;
                  let lineValue = outcome.point;
                  
                  if (isYesNoProp) {
                    // For Yes/No props, set the line to 0.5 for consistency with over/under
                    // This way we can use the same filtering and display logic
                    lineValue = 0.5;
                    
                    if (outcome.name === 'Yes') {
                      overOdds = outcome.price;
                    } else if (outcome.name === 'No') {
                      underOdds = outcome.price;
                    }
                  } else {
                    // For regular Over/Under props
                    overOdds = outcome.name === 'Over' ? outcome.price : null;
                    underOdds = outcome.name === 'Under' ? outcome.price : null;
                  }
                  
                  // Use the real odds values as provided by the odds API
                  // No capping of extreme odds values
                  
                  allPlayerProps.push({
                    player: outcome.description, // Player name
                    team: outcome.team || (outcome.name?.includes(game.home_team) ? game.home_team : game.away_team),
                    prop_type: propType,
                    line: lineValue,
                    over_odds: overOdds,
                    under_odds: underOdds
                  });
                }
              }
            }
          }
        } catch (err) {
          // Handle 404 error for this specific market (just continue to next market)
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
        
        // Calculate stats for this market
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
      
      // Print a summary of all markets attempted
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
      
      // If we didn't find any props after trying all markets
      if (allPlayerProps.length === 0) {
        console.error('❌ No player prop data found from The Odds API after trying all markets');
        
        // We will now try to use perplexity integration as a fallback
        console.log('🔄 Attempting to fall back to Perplexity for prop data...');
        try {
          let sportShortName;
          switch(sport) {
            case 'basketball_nba': sportShortName = 'nba'; break;
            case 'baseball_mlb': sportShortName = 'mlb'; break;
            case 'icehockey_nhl': sportShortName = 'nhl'; break;
            default: sportShortName = sport.split('_').pop();
          }
          
          const matchup = `${homeTeam} vs ${awayTeam}`;
          const perplexityProps = await propOddsService.getPlayerPropsFromSportsbooks(sportShortName, matchup);
          
          if (perplexityProps && perplexityProps.length > 0) {
            console.log(`✅ Successfully retrieved ${perplexityProps.length} props via Perplexity`);
            return perplexityProps; // Return the Perplexity props instead
          }
        } catch (perplexityError) {
          console.error('❌ Perplexity fallback also failed:', perplexityError.message);
        }
        
        // If both methods fail, throw the error
        throw new Error('No player prop data available for this game after trying all sources.');
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
   * Get player props from sportsbooks via Perplexity if The Odds API data is not available
   * This serves as a fallback solution using web search and AI to parse the data
   * @param {string} sport - Sport key (e.g., 'nba', 'mlb')
   * @param {string} game - Game description (e.g., 'Warriors vs Timberwolves')
   * @returns {Promise<Array>} - Array of player props from sportsbooks formatted like The Odds API data
   */
  getPlayerPropsFromSportsbooks: async (sport, game) => {
    try {
      console.log(`🔍 Attempting to fetch player props for ${sport} game: ${game} from sportsbooks via Perplexity...`);
      
      // Split the game string to get team names
      const [homeTeam, awayTeam] = game.split(' vs ').map(team => team.trim());
      
      // If we have perplexityService, we can use it to search for current prop data
      if (typeof perplexityService !== 'undefined' && perplexityService.fetchRealTimeInfo) {
        console.log(`Trying to get prop data from Perplexity for ${game}...`);
        
        // Create a well-structured query for Perplexity
        const propQuery = `
          Find the current player props for the ${sport.toUpperCase()} game: ${game} today. 
          For each available prop bet, provide:
          1. Player name
          2. Team (${homeTeam} or ${awayTeam})
          3. Prop type (hits, home runs, total bases, strikeouts, etc.)
          4. Line value (the number set for over/under)
          5. Over odds (American format)
          6. Under odds (American format)
          
          Format the data in a structured way that can be parsed, preferably in JSON like this sample format:
          [{
            "player": "Player Name",
            "team": "Team Name",
            "prop_type": "hits",
            "line": 1.5,
            "over_odds": 120,
            "under_odds": -140
          }]
          
          Include at least 15-20 different player props if available, with a mix of different prop types.
          Only include props for this specific game. Use data from major sportsbooks like DraftKings, FanDuel, BetMGM.
        `;

        // Use Perplexity to get the data (with Sonar model for structured data)
        const insights = await perplexityService.fetchRealTimeInfo(propQuery, {
          model: 'sonar',
          temperature: 0.2,
          maxTokens: 1500
        });
        
        if (!insights) {
          throw new Error('No response from Perplexity');
        }
        
        console.log(`Got response from Perplexity, parsing structured prop data...`);
        
        // Try to extract JSON from the response
        const propData = extractStructuredPropsFromText(insights, sport, homeTeam, awayTeam);
        
        if (propData && propData.length > 0) {
          console.log(`✅ Successfully parsed ${propData.length} prop bets from Perplexity response`);
          
          // Log the prop types we found
          const propTypes = [...new Set(propData.map(p => p.prop_type))];
          console.log(`Prop types found: ${propTypes.join(', ')}`);
          
          return propData;
        }
        
        // If JSON extraction fails, try backup direct queries
        const directQueries = [
          `List today's MLB player prop bets for ${game} with odds in JSON format`,
          `What are the current player props for ${game} with their odds?`
        ];
        
        for (const query of directQueries) {
          console.log(`Trying backup query: ${query}`);
          const backupResponse = await perplexityService.fetchRealTimeInfo(query, {
            model: 'sonar',
            temperature: 0.1,
            maxTokens: 1000
          });
          
          if (backupResponse) {
            const backupData = extractStructuredPropsFromText(backupResponse, sport, homeTeam, awayTeam);
            if (backupData && backupData.length > 0) {
              console.log(`✅ Successfully parsed ${backupData.length} prop bets from backup query`);
              return backupData;
            }
          }
        }
      }
      
      console.log(`❌ No player props data found from sportsbooks for ${game}`);
      throw new Error(`Could not find current player props for ${game} from sportsbooks`);
    } catch (error) {
      console.error(`❌ Error fetching player props from sportsbooks:`, error.message);
      throw error;
    }
  },
  
  /**
   * Extract structured prop data from Perplexity text response
   * @private
   * @param {string} text - The text to extract props from
   * @param {string} sport - Sport key
   * @param {string} homeTeam - Home team name 
   * @param {string} awayTeam - Away team name
   * @returns {Array} - Array of structured prop objects
   */
  extractStructuredPropsFromText: (text, sport, homeTeam, awayTeam) => {
    try {
      // First, try to extract JSON directly
      const jsonMatches = text.match(/```(?:json)?([\s\S]*?)```|\[\s*{[\s\S]*?}\s*\]/g);
      
      if (jsonMatches && jsonMatches.length > 0) {
        for (const match of jsonMatches) {
          try {
            // Clean up the match to extract just the JSON content
            const cleanJson = match.replace(/```(?:json)?|```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Validate and standardize the prop data
              const validProps = parsed.filter(prop => {
                return prop.player && prop.prop_type && 
                       (prop.line !== undefined) && 
                       (prop.over_odds !== undefined || prop.under_odds !== undefined);
              }).map(prop => ({
                player: prop.player,
                team: prop.team || determineTeam(prop.player, homeTeam, awayTeam),
                prop_type: standardizePropType(prop.prop_type, sport),
                line: parseFloat(prop.line),
                over_odds: typeof prop.over_odds === 'string' ? parseInt(prop.over_odds) : prop.over_odds,
                under_odds: typeof prop.under_odds === 'string' ? parseInt(prop.under_odds) : prop.under_odds
              }));
              
              if (validProps.length > 0) {
                return validProps;
              }
            }
          } catch (e) {
            console.warn('Failed to parse JSON match:', e.message);
          }
        }
      }
      
      // If JSON parsing fails, try to extract props using regex patterns
      console.log('Attempting to extract props using regex patterns...');
      const props = [];
      
      // Pattern for MLB-style lines: "Player Name (Team) Over/Under 1.5 Hits (-110/+120)"
      const mlbPattern = /([\w\s.'-]+)\s*(?:\(([\w\s.]+)\))?\s*(Over|Under)\s*([0-9.]+)\s*([\w\s]+)\s*\(([-+][0-9]+)(?:\/([-+][0-9]+))?\)/gi;
      let mlbMatch;
      
      while ((mlbMatch = mlbPattern.exec(text)) !== null) {
        const [_, playerName, teamName, position, lineValue, propType, firstOdds, secondOdds] = mlbMatch;
        
        // Determine over/under odds based on position
        const overOdds = position.toLowerCase() === 'over' ? parseInt(firstOdds) : (secondOdds ? parseInt(secondOdds) : null);
        const underOdds = position.toLowerCase() === 'under' ? parseInt(firstOdds) : (secondOdds ? parseInt(secondOdds) : null);
        
        props.push({
          player: playerName.trim(),
          team: teamName ? teamName.trim() : determineTeam(playerName, homeTeam, awayTeam),
          prop_type: standardizePropType(propType.trim(), sport),
          line: parseFloat(lineValue),
          over_odds: overOdds,
          under_odds: underOdds
        });
      }
      
      // Additional pattern for table-style formatting
      const tablePattern = /([\w\s.'-]+)\s*\|\s*([\w\s.]+)\s*\|\s*([\w\s]+)\s*\|\s*([0-9.]+)\s*\|\s*([-+][0-9]+)\s*\|\s*([-+][0-9]+)/gi;
      let tableMatch;
      
      while ((tableMatch = tablePattern.exec(text)) !== null) {
        const [_, playerName, teamName, propType, lineValue, overOdds, underOdds] = tableMatch;
        
        props.push({
          player: playerName.trim(),
          team: teamName.trim(),
          prop_type: standardizePropType(propType.trim(), sport),
          line: parseFloat(lineValue),
          over_odds: parseInt(overOdds),
          under_odds: parseInt(underOdds)
        });
      }
      
      // Filter out any invalid props
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
