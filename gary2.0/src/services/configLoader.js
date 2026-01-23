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
 * Note: LLM keys (GEMINI_API_KEY) are loaded server-side only
 * Note: Ball Don't Lie API is now the primary source for all odds/stats (The Odds API deprecated)
 */
export const configLoader = {
  loaded: false,

  /**
   * Load API configuration from either environment or API endpoint
   */
  load: async function() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    console.log('Config loader initialized (BDL is primary data source)');
  }
};
