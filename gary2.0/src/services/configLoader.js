import axios from 'axios';

/**
 * Config loading service to ensure API keys are available in all environments
 */
export const configLoader = {
  // Variables to hold API credentials
  odds_api_key: import.meta.env.VITE_ODDS_API_KEY || '',
  deepseek_api_key: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
  deepseek_base_url: import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  openai_api_key: import.meta.env.VITE_OPENAI_API_KEY || '',
  openai_base_url: import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  perplexity_api_key: import.meta.env.VITE_PERPLEXITY_API_KEY || '',
  loaded: false,

  /**
   * Load API configuration from either environment or API endpoint
   */
  load: async function() {
    // Don't reload if already loaded
    if (this.loaded && this.odds_api_key && this.deepseek_api_key) {
      return;
    }

    // If we already have the keys from Vite, just use those
    // Check for at least one of the AI provider keys (OpenAI or DeepSeek)
    if (import.meta.env.VITE_ODDS_API_KEY && 
        (import.meta.env.VITE_OPENAI_API_KEY || import.meta.env.VITE_DEEPSEEK_API_KEY)) {
      
      this.odds_api_key = import.meta.env.VITE_ODDS_API_KEY;
      this.deepseek_api_key = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
      this.deepseek_base_url = import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
      this.openai_api_key = import.meta.env.VITE_OPENAI_API_KEY || '';
      this.openai_base_url = import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1';
      this.perplexity_api_key = import.meta.env.VITE_PERPLEXITY_API_KEY || '';
      
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
        this.deepseek_api_key = response.data.deepseek_api_key || this.deepseek_api_key;
        this.deepseek_base_url = response.data.deepseek_base_url || this.deepseek_base_url;
        this.openai_api_key = response.data.openai_api_key || this.openai_api_key;
        this.openai_base_url = response.data.openai_base_url || this.openai_base_url;
        this.perplexity_api_key = response.data.perplexity_api_key || this.perplexity_api_key;
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
   * Get the DeepSeek API key
   */
  getDeepseekApiKey: async function() {
    await this.load();
    return this.deepseek_api_key;
  },

  /**
   * Get the DeepSeek base URL
   */
  getDeepseekBaseUrl: async function() {
    await this.load();
    return this.deepseek_base_url;
  },

  /**
   * Get the OpenAI API key
   */
  getOpenaiApiKey: async function() {
    await this.load();
    return this.openai_api_key;
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
