/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 */
import axios from 'axios';
import { configLoader } from './configLoader';
import { oddsService } from './oddsService';

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
    'batter_home_runs',
    'batter_hits',
    'batter_total_bases',
    'pitcher_strikeouts'
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
      
      for (const market of marketsList) {
        console.log(`Fetching ${sport} player props for market: ${market}`);
        
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
                
                // Process each outcome for this market
                for (const outcome of bkMarket.outcomes) {
                  allPlayerProps.push({
                    player: outcome.description, // Player name
                    team: outcome.team || (outcome.name?.includes(game.home_team) ? game.home_team : game.away_team),
                    prop_type: propType,
                    line: outcome.point,
                    over_odds: outcome.name === 'Over' ? outcome.price : null,
                    under_odds: outcome.name === 'Under' ? outcome.price : null
                  });
                }
              }
            }
          }
        } catch (err) {
          // Handle 404 error for this specific market (just continue to next market)
          if (err.response && err.response.status === 404) {
            console.warn(`No data available for ${market} in game ${game.id}, continuing to next market`);
            continue;
          } else if (err.response && err.response.status === 422) {
            console.warn(`API cannot process ${market} market request (422 error), continuing to next market`);
            continue;
          } else {
            console.error(`Error fetching ${market} data:`, err);
          }
        }
      }
      
      // If we didn't find any props after trying all markets
      if (allPlayerProps.length === 0) {
        console.error('❌ No player prop data found from The Odds API after trying all markets');
        throw new Error('No player prop data available for this game after trying all markets.');
      }
      
      // Group over/under odds together for the same player and prop type
      const groupedProps = {};
      for (const prop of allPlayerProps) {
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
      
      return result;
    } catch (error) {
      console.error(`❌ Error fetching player prop odds for ${homeTeam} vs ${awayTeam}: ${error.message}`);
      throw error;
    }
  },

  /**
   * Get player props from sportsbooks via Perplexity if The Odds API data is not available
   * This serves as a fallback solution using web search
   * @param {string} sport - Sport key (e.g., 'nba', 'mlb')
   * @param {string} game - Game description (e.g., 'Warriors vs Timberwolves')
   * @returns {Promise<Array>} - Array of player props from sportsbooks
   */
  getPlayerPropsFromSportsbooks: async (sport, game) => {
    try {
      console.log(`🔍 Attempting to fetch player props for ${sport} game: ${game} from sportsbooks via Perplexity...`);
      
      // If we have perplexityService, we can use it to search for current prop data
      if (typeof perplexityService !== 'undefined' && perplexityService.search) {
        // Define site-specific search patterns as provided
        const sportsbooks = [
          // Main sportsbooks
          `site:fanduel.com/sportsbook/${sport} "player props" "${game}"`, 
          `site:sportsbook.draftkings.com "${sport} player props" "${game}"`,
          `site:betmgm.com "${sport} player props" "${game}"`,
          `site:caesars.com "${sport} player props" "${game}"`,
          
          // Aggregators
          `site:oddsshark.com "${sport} player props today" "${game}"`, 
          `site:covers.com "${sport} player props" "${game}"`,
          `site:actionnetwork.com "${sport} player props" "${game}"`,
          
          // General searches with dates to ensure freshness
          `${sport} player props "${game}" today`, 
          `${game} betting lines player props "over under" today`
        ];
        
        console.log(`Trying ${sportsbooks.length} different sportsbook search patterns...`);
        
        // Try each sportsbook until we get results
        for (const searchPattern of sportsbooks) {
          console.log(`Searching with pattern: ${searchPattern}`);
          const results = await perplexityService.search(searchPattern);
          
          if (results && results.length > 0) {
            console.log(`✅ Found player props data from search pattern: ${searchPattern}`);
            return results;
          }
        }
        
        // If no specific searches worked, try a more direct approach
        const directQueries = [
          `What are the current player props for ${game} in ${sport} today?`,
          `List all available player props for ${game} in ${sport} with current odds.`
        ];
        
        for (const query of directQueries) {
          const results = await perplexityService.search(query, true); // force direct question
          if (results && results.length > 0) {
            console.log(`✅ Found player props data using direct query: ${query}`);
            return results;
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
