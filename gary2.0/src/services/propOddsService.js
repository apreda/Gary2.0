/**
 * Player Prop Odds Service
 * Specialized service for fetching and processing player prop odds
 * This is separate from the main oddsService to avoid affecting the regular picks system
 */
import axios from 'axios';
import { configLoader } from './configLoader';
import { oddsService } from './oddsService';

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

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
      
      // Now fetch player props for this specific game using the two-step process required by The Odds API
      console.log(`🔍 Fetching player props from The Odds API for game ID: ${game.id}`);
      
      // Choose the appropriate markets based on the sport
      const propMarkets = sport === 'basketball_nba' ? 'player_points,player_rebounds,player_assists,player_threes,player_blocks,player_steals' :
                          sport === 'baseball_mlb' ? 'batter_home_runs,batter_total_bases,pitcher_strikeouts,batter_hits' :
                          'player_points,player_rebounds,player_assists'; // default
      
      // IMPORTANT: Use the event-specific endpoint for player props
      const propResponse = await axios.get(`${ODDS_API_BASE_URL}/events/${game.id}/odds`, {
        params: {
          apiKey,
          regions: 'us',
          markets: propMarkets,
          oddsFormat: 'american',
          dateFormat: 'iso'
        }
      });
      
      // Validate we have player prop data
      if (!propResponse.data || !propResponse.data.bookmakers || propResponse.data.bookmakers.length === 0) {
        console.error('❌ No player prop data returned from The Odds API');
        throw new Error('No player prop data available for this game. This may be due to API tier limitations or the market not being available yet.');
      }
      
      // Process the API response to extract player prop information
      const playerProps = [];
      const bookmakers = propResponse.data.bookmakers;
      
      // Look for a bookmaker with player props
      let propMarketsFound = 0;
      const propsByBookmaker = {};
      
      for (const bookmaker of bookmakers) {
        if (!propsByBookmaker[bookmaker.key]) {
          propsByBookmaker[bookmaker.key] = 0;
        }
        
        for (const market of bookmaker.markets) {
          // Only process player prop markets
          if (!market.key.startsWith('player_') && 
              !market.key.startsWith('batter_') && 
              !market.key.startsWith('pitcher_')) {
            continue;
          }
          
          propMarketsFound++;
          propsByBookmaker[bookmaker.key]++;
          
          // Extract the prop type from the market key (e.g., player_points → points)
          const propType = market.key.replace(/^(player_|batter_|pitcher_)/, '');
          
          for (const outcome of market.outcomes) {
            playerProps.push({
              player: outcome.description, // Player name
              team: outcome.team, // Team name if available, or derive from game data
              prop_type: propType,
              line: outcome.point,
              over_odds: outcome.name === 'Over' ? outcome.price : null,
              under_odds: outcome.name === 'Under' ? outcome.price : null,
              bookmaker: bookmaker.key
            });
          }
        }
      }
      
      if (propMarketsFound === 0) {
        console.error(`❌ No player prop markets found for ${homeTeam} vs ${awayTeam}.`);
        console.error('Available bookmakers:', Object.keys(propsByBookmaker).join(', '));
        throw new Error(`No player prop markets available for ${homeTeam} vs ${awayTeam}. The API may not have prop data for this game yet.`);
      }
      
      console.log(`Found ${propMarketsFound} player prop markets across ${Object.keys(propsByBookmaker).length} bookmakers.`);
      Object.entries(propsByBookmaker).forEach(([bookmaker, count]) => {
        console.log(`  - ${bookmaker}: ${count} player prop markets`);
      });
      
      // Group over/under odds together for the same player and prop type
      const groupedProps = {};
      for (const prop of playerProps) {
        const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
        if (!groupedProps[key]) {
          groupedProps[key] = {
            player: prop.player,
            team: prop.team,
            prop_type: prop.prop_type,
            line: prop.line,
            over_odds: null,
            under_odds: null,
            bookmakers: []
          };
        }
        
        if (prop.over_odds !== null) {
          groupedProps[key].over_odds = prop.over_odds;
        }
        if (prop.under_odds !== null) {
          groupedProps[key].under_odds = prop.under_odds;
        }
        if (!groupedProps[key].bookmakers.includes(prop.bookmaker)) {
          groupedProps[key].bookmakers.push(prop.bookmaker);
        }
      }
      
      // Convert back to array and validate
      const result = Object.values(groupedProps);
      
      if (result.length === 0) {
        console.error(`❌ No valid player props found after processing data for ${homeTeam} vs ${awayTeam}.`);
        throw new Error(`No valid player props available for ${homeTeam} vs ${awayTeam}.`);
      }
      
      console.log(`✅ Successfully found ${result.length} player props for ${homeTeam} vs ${awayTeam}.`);
      
      // Validate we have a mix of teams (not all props for same team)
      const teamCounts = {};
      result.forEach(prop => {
        if (prop.team) {
          teamCounts[prop.team] = (teamCounts[prop.team] || 0) + 1;
        }
      });
      
      console.log('Player props by team:', Object.entries(teamCounts)
        .map(([team, count]) => `${team}: ${count} props`)
        .join(', '));
        
      return result;
      
    } catch (error) {
      console.error(`❌ Error fetching player prop odds for ${homeTeam} vs ${awayTeam}:`, error.message);
      // Re-throw the error to ensure caller knows this failed
      throw new Error(`Failed to get current player prop data: ${error.message}`);
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
        // Construct search queries for major sportsbooks
        const queries = [
          `site:fanduel.com/sportsbook/${sport} "${game}" "player props"`,
          `site:sportsbook.draftkings.com "${sport} player props" "${game}"`,
          `site:betmgm.com "${sport} player props" "${game}"`,
          `site:caesars.com "${sport} player props" "${game}"`
        ];
        
        // Try each query until we get results
        for (const query of queries) {
          const results = await perplexityService.search(query);
          if (results && results.length > 0) {
            console.log(`✅ Found player props data from sportsbooks for ${game}`);
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
