import axios from 'axios';

/**
 * Config loading service to ensure API keys are available in all environments
 */
export const configLoader = {
  // Variables to hold API credentials
  odds_api_key: import.meta.env.VITE_ODDS_API_KEY || '',
  openai_api_key: import.meta.env.VITE_OPENAI_API_KEY || '',
  openai_base_url: import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  perplexity_api_key: import.meta.env.VITE_PERPLEXITY_API_KEY || '',
  sports_db_api_key: import.meta.env.VITE_SPORTS_DB_API_KEY || '3', // Default to free tier
  loaded: false,

  /**
   * Load API configuration from either environment or API endpoint
   */
  load: async function() {
    // Don't reload if already loaded
    if (this.loaded && this.odds_api_key && this.openai_api_key) {
      return;
    }

    // If we already have the keys from Vite, just use those
    // Check for the OpenAI API key as the primary provider
    if (import.meta.env.VITE_ODDS_API_KEY && import.meta.env.VITE_OPENAI_API_KEY) {
      
      this.odds_api_key = import.meta.env.VITE_ODDS_API_KEY;
      this.openai_api_key = import.meta.env.VITE_OPENAI_API_KEY;
      this.openai_base_url = import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1';
      this.perplexity_api_key = import.meta.env.VITE_PERPLEXITY_API_KEY || '';
      this.sports_db_api_key = import.meta.env.VITE_SPORTS_DB_API_KEY || '3'; // Default to free tier
      
      // No legacy providers needed
      
      this.loaded = true;
      console.log('Using environment variables for API keys');
      return;
    }

    // Try to load from API endpoint
    try {
      console.log('Loading API configuration from endpoint...');
      const response = await axios.get('/api/config');
      if (response.data) {
        this.odds_api_key = response.data.odds_api_key || this.odds_api_key;
        this.openai_api_key = response.data.openai_api_key || this.openai_api_key;
        this.openai_base_url = response.data.openai_base_url || this.openai_base_url;
        this.perplexity_api_key = response.data.perplexity_api_key || this.perplexity_api_key;
        this.sports_db_api_key = response.data.sports_db_api_key || this.sports_db_api_key || '3';
        
        // All providers loaded
        this.loaded = true;
        console.log('Successfully loaded API configuration from endpoint');
      }
    } catch (error) {
      console.error('Failed to load API configuration from endpoint:', error);
      // Continue with whatever keys we have
    }
  },

  /**
   * Get the Odds API key
   */
  getOddsApiKey: async function() {
    await this.load();
    return this.odds_api_key;
  },

  /**
   * COMPATIBILITY FUNCTION - Routes all DeepSeek requests to OpenAI
   * @returns {Promise<string>} OpenAI API key
   */
  getDeepseekApiKey: async function() {
    return this.getOpenaiApiKey();
  },
  
  /**
   * COMPATIBILITY FUNCTION - Routes all DeepSeek requests to OpenAI
   * @returns {Promise<string>} OpenAI base URL
   */
  getDeepseekBaseUrl: async function() {
    return this.getOpenaiBaseUrl();
  },

  /**
   * Get the OpenAI API key - primary AI provider
   * @returns {Promise<string>} - The OpenAI API key
   */
  getOpenaiApiKey: async function() {
    await this.load();
    return this.openai_api_key;
  },

  /**
   * Get TheSportsDB API key
   * @returns {Promise<string>} - TheSportsDB API key (defaults to free tier '3')
   */
  getSportsDBApiKey: async function() {
    await this.load();
    return this.sports_db_api_key;
  },

  /**
   * Get the OpenAI base URL
   */
  getOpenaiBaseUrl: async function() {
    await this.load();
    return this.openai_base_url;
  },

  /**
   * Get the Perplexity API key
   */
  getPerplexityApiKey: async function() {
    await this.load();
    return this.perplexity_api_key;
  }
};
