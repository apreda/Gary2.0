/**
 * Service for interacting with the Perplexity API
 * Provides real-time search capabilities for sports data and news
 */
import axios from 'axios';

export const perplexityService = {
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
  }
};

export default perplexityService;
