/**
 * Service for interacting with the Perplexity API
 * Provides real-time search capabilities for sports data and news
 */
import axios from 'axios';

export const perplexityService = {
  /**
   * Search for information using Perplexity API
   * @param {string} query - The search query
   * @param {object} options - Additional options for the search
   * @returns {Promise<object>} - The search results
   */
  search: async function(query, options = {}) {
    try {
      console.log(`Searching Perplexity for: "${query}"`);
      
      // Default options with correct model name from Perplexity documentation
      const defaultOptions = {
        model: 'sonar',
        temperature: 0.3,
        maxTokens: 500
      };
      
      // Merge options
      const requestOptions = { ...defaultOptions, ...options };
      
      const response = await axios.post(
        this.API_BASE_URL,
        {
          model: requestOptions.model,
          messages: [
            {
              role: 'user',
              content: query
            }
          ],
          temperature: requestOptions.temperature,
          max_tokens: requestOptions.maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.API_KEY}`
          },
          timeout: 30000 // 30 second timeout
        }
      );
      
      return {
        success: true,
        data: response.data.choices?.[0]?.message?.content || 'No results found',
        raw: response.data
      };
      
    } catch (error) {
      console.error('Error in Perplexity search:', error);
      return {
        success: false,
        error: error.message,
        status: error.response?.status
      };
    }
  },
  
  /**
   * The Perplexity API key (will be loaded from environment variables)
   */
  API_KEY: import.meta.env?.VITE_PERPLEXITY_API_KEY || '',
  
  /**
   * Base URL for Perplexity API
   */
  API_BASE_URL: 'https://api.perplexity.ai/chat/completions',
  
  /**
   * Fetches real-time information using Perplexity's search capabilities
   * @param {string} query - The search query to send to Perplexity
   * @param {object} options - Additional options for the request
   * @returns {Promise<string>} - The search results as text
   */
  fetchRealTimeInfo: async (query, options = {}) => {
    try {
      console.log(`Fetching real-time information: "${query}"`);
      
      // Create a more concise, focused query
      let optimizedQuery = query;
      if (query.length > 150) {
        // Extract team names for very focused query
        const teamMatch = query.match(/between ([\w\s]+) and ([\w\s]+)/i);
        if (teamMatch && teamMatch.length >= 3) {
          const sportMatch = query.match(/(basketball|baseball|icehockey|soccer|football)_(\w+)/i);
          const sport = sportMatch ? sportMatch[0] : '';
          optimizedQuery = `${sport} ${teamMatch[1]} vs ${teamMatch[2]}: key injuries, form, betting trends. Brief factual analysis only.`;
          console.log(`🔥 Optimized query: ${optimizedQuery}`);
        }
      }
      
      // Default options with correct model name from Perplexity documentation
      const defaultOptions = {
        model: 'sonar', // Using the official model name from Perplexity documentation
        temperature: 0.3, // Lower temperature for more factual, faster responses
        maxTokens: 300    // Reasonable output length for sports analysis
      };
      
      // Merge default options with provided options
      const requestOptions = { ...defaultOptions, ...options };
      
      try {
        console.log('📤 Making direct API call to Perplexity API');
        
        // Check if we should use the proxy endpoint (when available) or direct API call
        const useProxy = typeof import.meta.env?.VITE_USE_API_PROXY !== 'undefined' 
          ? import.meta.env.VITE_USE_API_PROXY === 'true'
          : false;
        
        const apiUrl = useProxy 
          ? '/api/perplexity' // Path to Vercel serverless function for Vite projects
          : perplexityService.API_BASE_URL;
          
        console.log(`Using ${useProxy ? 'proxy endpoint' : 'direct API call'} for Perplexity: ${apiUrl}`);
        
        // Use optimized query for faster responses
        console.log(`Original query length: ${query.length} chars | Optimized length: ${optimizedQuery.length} chars`);
        // Implement retry logic for resilience
        const maxRetries = 2;
        let retryCount = 0;
        let response;
        
        while (retryCount <= maxRetries) {
          try {
            // If this is a retry, log it
            if (retryCount > 0) {
              console.log(`Retry attempt ${retryCount}/${maxRetries} for Perplexity API call`);
            }
            
            // Make request with optimized query
            response = await axios.post(
              apiUrl,
              {
                model: requestOptions.model || 'sonar-small-online', // Use faster model
                messages: [{ role: 'user', content: optimizedQuery }],
                temperature: requestOptions.temperature,
                max_tokens: requestOptions.maxTokens
              },
              {
                headers: {
                  'Authorization': `Bearer ${perplexityService.API_KEY}`,
                  'Content-Type': 'application/json'
                },
                timeout: 60000 // Increased timeout to 60 seconds
              }
            );
            
            // If we get here, the request succeeded, so we can break out of the retry loop
            break;
          } catch (retryError) {
            // If this is our last retry, throw the error
            if (retryCount === maxRetries) {
              throw retryError;
            }
            
            // If it's a timeout or 504, wait and retry
            if (retryError.code === 'ECONNABORTED' || 
                retryError.message.includes('timeout') || 
                (retryError.response && retryError.response.status === 504)) {
              // Exponential backoff (1s, 2s, 4s, etc.)
              const waitTime = 1000 * Math.pow(2, retryCount);
              console.log(`Request timed out. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retryCount++;
            } else {
              // For non-timeout errors, don't retry
              throw retryError;
            }
          }
        }
        
        // Log successful response status
        console.log('Successfully retrieved real-time information from Perplexity');
        
        // Log the full response to help debug JSON parsing issues
        console.log('Perplexity response:', response.data);
        
        // Extract the response content
        if (response.data && response.data.choices && response.data.choices.length > 0) {
          const result = response.data.choices[0].message.content;
          // Log the first 200 characters of the response to see what we're getting
          console.log('Perplexity response preview:', result.substring(0, 200) + '...');
          console.log('Perplexity response length:', result.length);
          return result;
        } else {
          console.error('Invalid response format from Perplexity API:', response.data);
          // No fallbacks - require proper API response
          throw new Error('Invalid response format from Perplexity API');
        }
      } catch (apiError) {
        console.error('❌ API call to Perplexity failed:', apiError.message);
        
        // Error handling for premium tier
        if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout') || 
            (apiError.response && apiError.response.status === 504)) {
          console.log('⚠️ Request timed out even with premium tier. This could be an unusual server issue.');
          
          // Simply propagate the timeout error - no fallbacks to mock data as per development guidelines
          throw new Error(`Perplexity API request timed out (${apiError.message}). Please try again.`);
        } else if (apiError.response && apiError.response.status === 429) {
          throw new Error('Perplexity API rate limit exceeded. Please try again later.');
        } else if (apiError.response && apiError.response.status === 401) {
          throw new Error('Invalid Perplexity API key. Please check your environment variables.');
        } else {
          // No fallbacks - propagate the error with enhanced message
          throw new Error(`Perplexity API error: ${apiError.message}`);
        }
      }
    } catch (error) {
      console.error('Error in fetchRealTimeInfo:', error);
      // No fallbacks - propagate the error
      throw error;
    }
  },
  
  // No simulation responses - only use real API data
  
  /**
   * Gets the latest news and updates for a specific game
   * @param {string} homeTeam - The home team name
   * @param {string} awayTeam - The away team name
   * @param {string} league - The sports league (NBA, MLB, etc.)
   * @returns {Promise<string>} - The latest news as text
   */
  getGameNews: async (homeTeam, awayTeam, league) => {
    try {
      const query = `${league} ${homeTeam} vs ${awayTeam}: key injuries, recent form, betting trends, last 5 games. Factual only, no opinions.`;
      
      return await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar',
        temperature: 0.3, // Lower temperature for more factual responses
        maxTokens: 500    // Reasonable context length
      });
    } catch (error) {
      console.error(`Error getting game news for ${homeTeam} vs ${awayTeam}:`, error);
      // Return a message that indicates the issue rather than null
      return `Unable to retrieve real-time data for ${homeTeam} vs ${awayTeam} due to API timeout. Analysis will proceed with available data.`;
    }
  },
  
  /**
   * Gets team-specific insights and analysis
   * @param {string} teamName - The team to get insights for
   * @param {string} league - The sports league (NBA, MLB, etc.)
   * @returns {Promise<string>} - Team insights as text
   */
  getTeamInsights: async (teamName, league) => {
    try {
      const query = `${league} ${teamName}: current form, injuries, betting trends, last 5 games performance. Brief facts only.`;
      
      return await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar',
        temperature: 0.4,
        maxTokens: 400
      });
    } catch (error) {
      console.error(`Error getting insights for ${teamName}:`, error);
      // Return a message that indicates the issue rather than null
      return `Unable to retrieve real-time data for ${teamName} due to API timeout. Analysis will proceed with available data.`;
    }
  },
  
  /**
   * Gets player-specific insights for prop betting
   * @param {object} gameData - Game data containing teams, league, and player info
   * @returns {Promise<object>} - Structured player insights for prop betting
   */
  getPlayerPropInsights: async (gameData) => {
    try {
      console.log(`Fetching player prop insights for ${gameData.matchup}`);
      
      // Extract home and away team names
      const homeTeam = gameData.homeTeam || '';
      const awayTeam = gameData.awayTeam || '';
      const league = gameData.league || '';
      
      // Get list of key players (if available)
      let keyPlayers = [];
      
      // Extract players from playerStats if available
      if (gameData.playerStats) {
        // Add home team players
        if (gameData.playerStats.homeTeam && gameData.playerStats.homeTeam.players) {
          keyPlayers = [...keyPlayers, ...gameData.playerStats.homeTeam.players.slice(0, 5)
            .map(p => p.name || p.player_name)]
        }
        // Add away team players
        if (gameData.playerStats.awayTeam && gameData.playerStats.awayTeam.players) {
          keyPlayers = [...keyPlayers, ...gameData.playerStats.awayTeam.players.slice(0, 5)
            .map(p => p.name || p.player_name)]
        }
      }
      
      // Construct league-specific query for player props with strong emphasis on factual data
      let propQuery = '';
      
      if (league === 'MLB') {
        propQuery = `CRITICAL: Provide ONLY VERIFIABLE FACTUAL stats for ${homeTeam} vs ${awayTeam} MLB game TODAY. For each of the key players, provide EXACT stats from their last 10 games including:
        
          1. EXACT number of home runs hit in last 10 games (not an estimate)
          2. EXACT number of hits in last 10 games
          3. EXACT number of total bases in last 10 games
          4. For pitchers: EXACT strikeout totals in last 10 games
          5. Any statistical home/away or matchup splits
          
          EXTREMELY IMPORTANT: Do NOT invent or estimate stats. ONLY provide EXACT numbers that you can verify.
          When stating a stat (e.g., "hit 3 home runs in last 10 games"), it MUST be factually correct and verifiable.
          If you cannot find precise stats for a player, explicitly state "No verified data available" rather than providing estimates.`;
      } else if (league === 'NBA') {
        propQuery = `CRITICAL: Provide ONLY VERIFIABLE FACTUAL stats for ${homeTeam} vs ${awayTeam} NBA game TODAY. For each key player, provide EXACT stats from their last 10 games including:
        
          1. EXACT points per game in last 10 games (not an estimate)
          2. EXACT rebounds per game in last 10 games
          3. EXACT assists per game in last 10 games
          4. EXACT 3-pointers made in last 10 games
          5. Any statistical home/away or matchup splits
          
          EXTREMELY IMPORTANT: Do NOT invent or estimate stats. ONLY provide EXACT numbers that you can verify.
          When stating a stat (e.g., "averaged 26.3 points in last 10 games"), it MUST be factually correct and verifiable.
          If you cannot find precise stats for a player, explicitly state "No verified data available" rather than providing estimates.`;
      } else if (league === 'NHL') {
        propQuery = `CRITICAL: Provide ONLY VERIFIABLE FACTUAL stats for ${homeTeam} vs ${awayTeam} NHL game TODAY. For each key player, provide EXACT stats from their last 10 games including:
        
          1. EXACT goals scored in last 10 games (not an estimate)
          2. EXACT assists in last 10 games
          3. EXACT shots on goal in last 10 games
          4. EXACT minutes played in last 10 games
          5. Any statistical home/away or matchup splits
          
          EXTREMELY IMPORTANT: Do NOT invent or estimate stats. ONLY provide EXACT numbers that you can verify.
          When stating a stat (e.g., "scored 5 goals in last 10 games"), it MUST be factually correct and verifiable.
          If you cannot find precise stats for a player, explicitly state "No verified data available" rather than providing estimates.`;
      }
      
      // If we have key players, add them to the query
      if (keyPlayers.length > 0) {
        propQuery += `\n\nPROVIDE DETAILED STATS SPECIFICALLY FOR THESE PLAYERS: ${keyPlayers.join(', ')}`;
      }
      
      propQuery += `\n\nRETURN FORMAT: Format each player's stats as bullet points, with the player name followed by a list of EXACT, VERIFIED stats. NEVER invent or estimate statistics.`;
      
      // Call Perplexity with our specialized query
      const insights = await perplexityService.fetchRealTimeInfo(propQuery, {
        model: 'sonar',
        temperature: 0.2, // Lower temperature for factual data
        maxTokens: 650    // Need more tokens for detailed player insights
      });
      
      // Process the insights to create a structured result
      return {
        player_insights: insights,
        meta: {
          query_time: new Date().toISOString(),
          game: gameData.matchup,
          league: gameData.league,
          insight_weight: '20%' // Indicate this should be 20% of decision weight
        }
      };
    } catch (error) {
      console.error(`Error getting player prop insights: ${error.message}`);
      return {
        player_insights: `Unable to retrieve player trend data. Analysis will proceed with available statistical data only.`,
        meta: {
          error: error.message,
          game: gameData.matchup,
          league: gameData.league || 'unknown',
          query_time: new Date().toISOString()
        }
      };
    }
  }
};

export default perplexityService;
