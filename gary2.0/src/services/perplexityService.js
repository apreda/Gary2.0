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
      console.log(`Fetching real-time information from Perplexity: "${query}"`);
      
      // Default options
      const defaultOptions = {
        model: 'sonar-pro', // Using Sonar Pro for best real-time search capabilities
        temperature: 0.7,    // Default temperature for balanced responses
        maxTokens: 800       // Reasonable length for search results
      };
      
      // Merge default options with provided options
      const requestOptions = { ...defaultOptions, ...options };
      
      // Make request to Perplexity API
      const response = await axios.post(
        perplexityService.API_BASE_URL,
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
          }
        }
      );
      
      // Extract the response content
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const result = response.data.choices[0].message.content;
        console.log('Successfully retrieved real-time information from Perplexity');
        return result;
      } else {
        console.error('Invalid response format from Perplexity API:', response.data);
        return null;
      }
    } catch (error) {
      console.error('Error fetching real-time information from Perplexity:', error);
      // Return null to indicate failure, the caller should handle this case
      return null;
    }
  },
  
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
