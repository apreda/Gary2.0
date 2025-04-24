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
      
      // Default options
      const defaultOptions = {
        model: 'sonar-pro', // Using Sonar Pro for best real-time search capabilities
        temperature: 0.7,    // Default temperature for balanced responses
        maxTokens: 800       // Reasonable length for search results
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
          ? '/api/proxy/perplexity' // Path to Vercel API route
          : perplexityService.API_BASE_URL;
          
        console.log(`Using ${useProxy ? 'proxy endpoint' : 'direct API call'} for Perplexity: ${apiUrl}`);
        
        // Make request to Perplexity API with additional error handling
        const response = await axios.post(
          apiUrl,
          {
            model: requestOptions.model,
            messages: [{ role: 'user', content: query }],
            temperature: requestOptions.temperature,
            max_tokens: requestOptions.maxTokens
          },
          {
            headers: {
              'Authorization': `Bearer ${perplexityService.API_KEY}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000 // Increased to 30 second timeout for more reliability
          }
        );
        
        // Extract the response content
        if (response.data && response.data.choices && response.data.choices.length > 0) {
          const result = response.data.choices[0].message.content;
          console.log('Successfully retrieved real-time information from Perplexity');
          return result;
        } else {
          console.error('Invalid response format from Perplexity API:', response.data);
          // No fallbacks - require proper API response
          throw new Error('Invalid response format from Perplexity API');
        }
      } catch (apiError) {
        console.error('❌ API call to Perplexity failed:', apiError.message);
        
        // Enhanced error handling with retry for timeout errors
        if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
          console.log('⚠️ Request timed out. This might be due to CORS restrictions or network issues.');
          console.log('💡 Consider setting up a server-side proxy to avoid CORS issues.');
          
          throw new Error('Perplexity API request timed out. Please check your network connection or API proxy settings.');
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
      const query = `
        Give me the latest news, stats, team updates, player injuries, and betting trends for the upcoming 
        ${league} game between ${homeTeam} and ${awayTeam}. 
        Focus on information that would be relevant for betting purposes and provide only facts, not opinions.
        Include the most recent team performance and any breaking news in the last 24 hours.
      `;
      
      return await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar-pro',
        temperature: 0.3, // Lower temperature for more factual responses
        maxTokens: 1000   // Longer context for comprehensive news
      });
    } catch (error) {
      console.error(`Error getting game news for ${homeTeam} vs ${awayTeam}:`, error);
      return null;
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
      const query = `
        Give me detailed insights about ${teamName} in the ${league}. 
        Include their current form, recent game results, key player statistics, injury reports,
        coaching strategies, and any other factors that would be relevant for sports betting.
        Focus on objective data and statistics from the most recent games and practices.
      `;
      
      return await perplexityService.fetchRealTimeInfo(query, {
        model: 'sonar-pro',
        temperature: 0.4,
        maxTokens: 800
      });
    } catch (error) {
      console.error(`Error getting insights for ${teamName}:`, error);
      return null;
    }
  }
};

export default perplexityService;
