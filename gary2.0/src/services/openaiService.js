/**
 * Service for interacting with the OpenAI API
 * Provides Gary's analysis and betting recommendations
 */
import axios from 'axios';
import { apiCache } from '../utils/apiCache';

const openaiServiceInstance = {
  /**
   * The OpenAI API key (loaded from environment variables)
   */
  API_KEY: import.meta.env?.VITE_OPENAI_API_KEY || '',
  
  /**
   * Initialize the API key from environment variables
   */
  init: function() {
    const apiKey = import.meta.env?.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OpenAI API key not found in environment variables');
    } else {
      console.log('OpenAI API key loaded successfully from environment variables');
      // Mask the API key for security when logging (only showing first 5 chars)
      const maskedKey = apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 4);
      console.log(`API Key (masked): ${maskedKey}`);
      this.API_KEY = apiKey;
    }
    return this;
  },
  
  /**
   * Base URL for OpenAI API
   */
  API_BASE_URL: 'https://api.openai.com/v1/chat/completions',
  
  /**
   * Preferred model for Gary's analysis
   */
  DEFAULT_MODEL: 'gpt-3.5-turbo-0125', // Using a specific version to avoid 404 errors
  
  /**
   * Generates a response from OpenAI based on the provided prompt
   * @param {string|array} prompt - Either a string prompt or an array of message objects
   * @param {object} options - Additional options for the request
   * @returns {Promise<string>} - The generated response
   */
  generateResponse: async function(prompt, options = {}) {
    // Create a cache key based on the prompt and options
    const cacheKey = this._createCacheKey(prompt, options);
    
    // Check if we have a cached response
    const cachedResponse = apiCache.get(cacheKey);
    if (cachedResponse) {
      console.log('Using cached OpenAI response');
      return cachedResponse;
    }
    
    // If no cached response, make the API call with retry logic
    return await this._makeOpenAIRequestWithRetry(prompt, options, cacheKey);
  },
  
  /**
   * Creates a cache key from prompt and options
   * @private
   */
  _createCacheKey: function(prompt, options) {
    let promptString;
    if (Array.isArray(prompt)) {
      promptString = JSON.stringify(prompt);
    } else {
      promptString = prompt;
    }
    
    return `openai_${options.model || this.DEFAULT_MODEL}_${Buffer.from(promptString).toString('base64').substring(0, 100)}`;
  },
  
  /**
   * Makes an OpenAI request with retry logic for rate limiting
   * @private
   */
  _makeOpenAIRequestWithRetry: async function(prompt, options = {}, cacheKey, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000 * (2 ** retryCount); // Exponential backoff
    
    try {
      console.log('Generating response from OpenAI...');
      
      // Default options
      const defaultOptions = {
        model: openaiServiceInstance.DEFAULT_MODEL,
        temperature: 0.8,   // Higher value for more creative responses
        maxTokens: 1500,    // Generous length for detailed analysis
        topP: 0.9,
        presencePenalty: 0.3,
        frequencyPenalty: 0.3
      };
      
      // Merge default options with provided options
      const requestOptions = { ...defaultOptions, ...options };
      
      // Prepare the messages array
      let messages;
      if (Array.isArray(prompt)) {
        messages = prompt; // If prompt is already an array of message objects
      } else {
        messages = [{ role: 'user', content: prompt }]; // Convert string to message object
      }
      
      // Make request to OpenAI API
      const response = await axios.post(
        this.API_BASE_URL,
        {
          model: requestOptions.model,
          messages: messages,
          temperature: requestOptions.temperature,
          max_tokens: requestOptions.maxTokens,
          top_p: requestOptions.topP,
          presence_penalty: requestOptions.presencePenalty,
          frequency_penalty: requestOptions.frequencyPenalty
        },
        {
          headers: {
            'Authorization': `Bearer ${this.API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Extract the response content
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const result = response.data.choices[0].message.content;
        console.log('Successfully generated response from OpenAI');
        
        // Cache the successful response
        if (cacheKey) {
          // Cache less creative content (lower temperature) for longer
          const cacheTtl = options.temperature < 0.5 ? 86400 : 3600; // 24 hours or 1 hour
          apiCache.set(cacheKey, result, cacheTtl);
        }
        
        return result;
      } else {
        console.error('Invalid response format from OpenAI API:', response.data);
        return null;
      }
    } catch (error) {
      console.error('Error generating response from OpenAI:', error);
      
      // If there's an error with the API key or quota, log it for debugging
      if (error.response && error.response.data) {
        console.error('OpenAI API error details:', error.response.data);
        
        // Better debugging for different error types
        if (error.response.status === 401) {
          console.error('API Key Authentication Error. Check your API key is valid and has not expired.');
          console.error('Current API key (first 5 chars):', this.API_KEY ? (this.API_KEY.substring(0, 5) + '...') : 'No API key found');
          return null; // No point retrying with invalid credentials
        } else if (error.response.status === 404) {
          console.error('Model not found. The specified model may not exist or you may not have access to it.');
          console.error('Current model being used:', options?.model || this.DEFAULT_MODEL);
          return null; // No point retrying with an invalid model
        } else if (error.response.status === 429) {
          console.error('Rate limit exceeded or quota exceeded for your API key.');
          
          // Retry logic for rate limiting
          if (retryCount < MAX_RETRIES) {
            console.log(`Retrying OpenAI request in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1} of ${MAX_RETRIES})`);
            
            // Wait for the backoff period
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            
            // Try again with an incremented retry count
            return await this._makeOpenAIRequestWithRetry(prompt, options, cacheKey, retryCount + 1);
          }
          
          // Look for a fallback cached response with similar prompt
          // This helps during heavy rate limiting by returning a "close enough" response
          const similarResponses = this._findSimilarCachedResponse(prompt);
          if (similarResponses) {
            console.log('Using similar cached response due to rate limiting');
            return similarResponses;
          }
        }
      }
      
      // Return null to indicate failure, the caller should handle this case
      return null;
    }
  },
  
  /**
   * Generates Gary's detailed sports betting analysis
   * @param {object} gameData - The game data from sports API
   * @param {string} newsData - The latest news and trends from Perplexity
   * @param {object} options - Additional options for the analysis
   * @returns {Promise<string>} - Gary's detailed analysis
   */
  /**
   * Find a similar cached response when exact match isn't available
   * @private
   */
  _findSimilarCachedResponse: function(prompt) {
    // For simplicity, this is a placeholder implementation
    // A more sophisticated approach would use semantic similarity
    // For now, we'll just return null
    return null;
  },
  
  generateGaryAnalysis: async function(gameData, newsData, options = {}) {
    try {
      // Prepare a detailed system prompt defining Gary's persona and expertise
      const systemPrompt = {
        role: 'system',
        content: `You are Gary, a world-class professional sports betting analyst and handicapper with over 20 years of experience.
          
        Your analysis combines:
        - Deep statistical knowledge and data-driven insights
        - Understanding of team dynamics, coaching strategies, and player matchups
        - Current team news, injuries, and relevant situational factors
        - Expertise in identifying value in betting lines and finding exploitable edges
        
        Your predictions are presented with:
        - Clear reasoning behind your pick
        - Relevant statistics and trends supporting your analysis
        - A confidence level (High, Medium, Low) that reflects your conviction
        - A bullet-point summary of key factors
        
        Your personality:
        - Confident but not arrogant
        - Analytical and objective
        - Focused on long-term profitability
        - Willing to pass on games without clear edges
        
        Today's date is ${new Date().toLocaleDateString()}.
        
        Provide a comprehensive yet concise betting analysis on the provided game, incorporating the latest news and statistics.`
      };
      
      // Format the game data for the prompt
      const gameDataSection = typeof gameData === 'object' ? 
        JSON.stringify(gameData, null, 2) : gameData;
      
      // Combine everything into the user prompt
      const userPrompt = {
        role: 'user',
        content: `
        Please analyze this upcoming game based on the following information:

        GAME DATA:
        ${gameDataSection}

        LATEST NEWS AND TRENDS:
        ${newsData || 'No additional news data available'}

        Provide your analysis in the following format:
        1. A brief game overview
        2. Key factors influencing your pick
        3. Your recommended bet with reasoning
        4. A confidence rating (High/Medium/Low)
        5. 3-5 bullet points summarizing your key insights
        `
      };
      
      // Combine system and user prompts into a message array
      const messages = [systemPrompt, userPrompt];
      
      // Generate the analysis
      const analysis = await this.generateResponse(messages, {
        temperature: options.temperature || 0.8,
        maxTokens: options.maxTokens || 1500,
        model: options.model || this.DEFAULT_MODEL
      });
      
      return analysis;
    } catch (error) {
      console.error('Error generating Gary\'s analysis:', error);
      return 'Unable to generate analysis at this time. Please try again later.';
    }
  }
};

// Initialize and then export the service
openaiServiceInstance.init();

export { openaiServiceInstance as openaiService };
export default openaiServiceInstance;
