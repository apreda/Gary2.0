import axios from 'axios';

/**
 * Helper function to safely get environment variables from either Node.js or Vite
 */
function getEnvVar(key, defaultValue = '') {
  // Check if we're in a Node.js environment first
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || defaultValue;
  }

  // Then check for Vite environment
  try {
    return import.meta.env[key] || defaultValue;
  } catch (e) {
    console.log(`Unable to access ${key} from import.meta.env, using default value`);
    return defaultValue;
  }
}

/**
 * Config loading service to ensure API keys are available in all environments
 */
export const configLoader = {
  // Variables to hold API credentials
  odds_api_key: getEnvVar('VITE_ODDS_API_KEY', ''),
  // Never load OpenAI keys on the client; proxy uses server-side OPENAI_API_KEY only
  openai_api_key: '',
  openai_base_url: 'https://api.openai.com/v1',
  // Never expose Perplexity key in browser; proxy uses server-side PERPLEXITY_API_KEY only
  perplexity_api_key: '',
  sports_db_api_key: getEnvVar('VITE_SPORTS_DB_API_KEY', '3'), // Default to free tier
  loaded: false,

  /**
   * Load API configuration from either environment or API endpoint
   */
  load: async function() {
    // Don't reload if already loaded
    if (this.loaded && this.odds_api_key && this.openai_api_key) {
      return;
    }

    // If we already have the odds (client-safe) and other non-sensitive keys, just use those
    const oddsApiKey = getEnvVar('VITE_ODDS_API_KEY');
    
    if (oddsApiKey) {
      this.odds_api_key = oddsApiKey;
      // Do not load Perplexity key in the browser
      this.perplexity_api_key = '';
      this.sports_db_api_key = getEnvVar('VITE_SPORTS_DB_API_KEY', '3'); // Default to free tier
      
      this.loaded = true;
      console.log('Using environment variables for non-sensitive API keys');
      return;
    }

    // Try to load from API endpoint
    try {
      console.log('Loading API configuration from endpoint...');
      const response = await axios.get('/api/config');
      if (response.data) {
        this.odds_api_key = response.data.odds_api_key || this.odds_api_key;
        // Never hydrate OpenAI keys client-side
        this.openai_base_url = this.openai_base_url;
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
    // Intentionally return empty on client; server should read process.env.OPENAI_API_KEY
    return '';
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
