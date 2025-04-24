/**
 * Service for interacting with the OpenAI API
 * Provides Gary's analysis and betting recommendations
 * Updated to use the latest OpenAI Responses API and Structured Outputs
 */
import axios from 'axios';
import { apiCache } from '../utils/apiCache';
import { requestQueue } from '../utils/requestQueue';

const openaiServiceInstance = {
  /**
   * The OpenAI API key (loaded from environment variables)
   */
  API_KEY: import.meta.env?.VITE_OPENAI_API_KEY || '',
  
  /**
   * Flag to indicate if initialization was successful
   */
  initialized: false,
  
  /**
   * Initialize the API key from environment variables
   */
  init: function() {
    const apiKey = import.meta.env?.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('❌ CRITICAL ERROR: OpenAI API key not found in environment variables');
      console.error('❌ Gary requires a valid OpenAI API key to function - please check your .env file');
      this.initialized = false;
    } else {
      console.log('✅ OpenAI API key loaded successfully from environment variables');
      // Mask the API key for security when logging (only showing first 5 chars)
      const maskedKey = apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 4);
      console.log(`🔑 API Key (masked): ${maskedKey}`);
      this.API_KEY = apiKey;
      this.initialized = true;
    }
    return this;
  },
  
  /**
   * Base URL for OpenAI API (updated to use Responses API)
   */
  API_BASE_URL: 'https://api.openai.com/v1/responses',
  
  /**
   * Preferred model for Gary's analysis
   */
  DEFAULT_MODEL: 'gpt-4.1', // Using the newest reliable model for better analysis
  
  /**
   * Generates a response from OpenAI based on the provided input
   * @param {string|array} input - Either a string input or an array of message objects
   * @param {object} options - Additional options for the request
   * @returns {Promise<string>} - The generated response text
   */
  generateResponse: async function(input, options = {}) {
    // Check if OpenAI API key is initialized
    if (!this.initialized || !this.API_KEY) {
      console.error('❌ Cannot generate response: OpenAI API key not initialized');
      throw new Error('OpenAI API key not initialized - add VITE_OPENAI_API_KEY to your environment');
    }
    
    // Create a cache key based on the input and options
    const cacheKey = this._createCacheKey(input, options);
    
    // Check if we have a cached response
    const cachedResponse = apiCache.get(cacheKey);
    if (cachedResponse) {
      console.log('Using cached OpenAI response');
      return cachedResponse;
    }
    
    console.log(`📤 Sending request to OpenAI with model: ${options.model || this.DEFAULT_MODEL}`);
    
    // If no cached response, add the request to the queue
    // This ensures we're only making one request at a time to avoid rate limits
    return await requestQueue.enqueue(() => this._makeOpenAIRequestWithRetry(input, options, cacheKey));
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
    
    // Create a hash from the prompt string (browser-compatible)
    const hashPrompt = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return hash.toString(36); // Convert to base36 for shorter strings
    };
    
    return `openai_${options.model || this.DEFAULT_MODEL}_${hashPrompt(promptString)}`;
  },
  
  /**
   * Makes an OpenAI request with retry logic for rate limiting
   * @private
   */
  _makeOpenAIRequestWithRetry: async function(input, options = {}, cacheKey, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000 * (2 ** retryCount); // Exponential backoff
    
    try {
      console.log('Generating response from OpenAI...');
      
      // Default options
      const model = options.model || this.DEFAULT_MODEL;
      const temperature = options.temperature !== undefined ? options.temperature : 0.7;
      const maxTokens = options.maxTokens || 800;
      
      // Prepare input format based on whether input is a string or array
      let formattedInput;
      if (typeof input === 'string') {
        formattedInput = input;
      } else if (Array.isArray(input)) {
        formattedInput = input;
      } else {
        formattedInput = [
          {
            role: 'user',
            content: String(input)
          }
        ];
      }
      
      // Prepare the request payload based on the new Responses API format
      const payload = {
        model: model,
        input: formattedInput,
        max_output_tokens: maxTokens,
        temperature: temperature
      };
      
      // Send the request to OpenAI API
      const response = await axios.post(
        this.API_BASE_URL,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.API_KEY}`
          }
        }
      );
      
      // Process the response according to the new Responses API format
      if (response.data && response.data.output_text) {
        const generatedContent = response.data.output_text;
        
        // Cache the response for future use
        apiCache.set(cacheKey, generatedContent);
        
        // Reset request delay back to normal after successful request
        requestQueue.setRequestDelay(1000);
        
        return generatedContent;
      } else if (response.data && response.data.output && response.data.output.length > 0) {
        // Handle the case where we get the raw output array
        const messageContent = response.data.output[0].content || [];
        let text = '';
        
        // Extract text from all content items of type 'output_text'
        for (const item of messageContent) {
          if (item.type === 'output_text') {
            text += item.text;
          }
        }
        
        if (text) {
          // Cache the response for future use
          apiCache.set(cacheKey, text);
          
          // Reset request delay back to normal after successful request
          requestQueue.setRequestDelay(1000);
          
          return text;
        }
      }
      
      const error = new Error('Unexpected response format from OpenAI API');
      error.response = response;
      throw error;
    } catch (error) {
      console.error('❌ Error generating response from OpenAI:', error);
      
      // If there's an error with the API key or quota, log it for debugging
      if (error.response && error.response.data) {
        console.error('❌ OpenAI API error details:', error.response.data);
        
        // Better debugging for different error types
        if (error.response.status === 401) {
          console.error('❌ API Key Authentication Error: Your API key is invalid or has expired');
          console.error('🔑 Current API key (first 5 chars):', this.API_KEY ? (this.API_KEY.substring(0, 5) + '...') : 'No API key found');
          throw new Error('OpenAI API key is invalid - please check your environment settings');
        } else if (error.response.status === 404) {
          console.error(`❌ Model not found: The model '${options?.model || this.DEFAULT_MODEL}' may not exist or you may not have access`);
          throw new Error(`Model '${options?.model || this.DEFAULT_MODEL}' not found - please check your model settings`);
        } else if (error.response.status === 429) {
          console.error('⚠️ Rate limit exceeded or quota exceeded for your API key');
          
          // Retry logic for rate limiting
          if (retryCount < MAX_RETRIES) {
            console.log(`⏱️ Retrying OpenAI request in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1} of ${MAX_RETRIES})`);
            
            // Wait for the backoff period
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            
            // Increase the delay between requests in the queue to avoid rate limits
            requestQueue.setRequestDelay(3000 * (retryCount + 1));
            
            // Try again with an incremented retry count
            return await this._makeOpenAIRequestWithRetry(prompt, options, cacheKey, retryCount + 1);
          } else {
            throw new Error('OpenAI API rate limit exceeded and retry attempts exhausted');
          }
        } else {
          throw new Error(`OpenAI API error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown error'}`);
        }
      } else {
        // Network or other errors
        throw new Error(`OpenAI service error: ${error.message}`);
      }
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
   * Generates Gary's detailed sports betting analysis using Structured Outputs
   * @param {object} gameData - The game data from sports API
   * @param {string} newsData - The latest news and trends from Perplexity
   * @param {object} options - Additional options for the analysis
   * @returns {Promise<string>} - Gary's detailed analysis
   */
  generateGaryAnalysis: async function(gameData, newsData, options = {}) {
    try {
      // Prepare a detailed instructions prompt defining Gary's persona and expertise
      const instructions = `You are Gary, a world-class professional sports betting analyst and handicapper with over 20 years of experience.
          
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
      
      Provide a comprehensive yet concise betting analysis on the provided game, incorporating the latest news and statistics.`;
      
      // Format the game data for the prompt
      const gameDataSection = typeof gameData === 'object' ? 
        JSON.stringify(gameData, null, 2) : gameData;
      
      // Combine everything into the user input
      const userInput = `
      Please analyze this upcoming game based on the following information:

      GAME DATA:
      ${gameDataSection}

      LATEST NEWS AND TRENDS:
      ${newsData || 'No additional news data available'}
      `;
      
      try {
        // First try with Structured Outputs for more reliable formatting
        const analysisSchema = {
          type: "json_schema",
          name: "betting_analysis",
          schema: {
            type: "object",
            properties: {
              gameOverview: { type: "string" },
              keyFactors: { 
                type: "array", 
                items: { type: "string" }
              },
              recommendedBet: { type: "string" },
              confidenceRating: { 
                type: "string",
                enum: ["High", "Medium", "Low"]
              },
              insightSummary: { 
                type: "array", 
                items: { type: "string" }
              }
            },
            required: ["gameOverview", "keyFactors", "recommendedBet", "confidenceRating", "insightSummary"],
            additionalProperties: false
          },
          strict: true
        };
        
        // Send request with structured output format
        const payload = {
          model: options.model || this.DEFAULT_MODEL,
          instructions: instructions,
          input: userInput,
          max_output_tokens: options.maxTokens || 1500,
          temperature: options.temperature || 0.8,
          text: { format: analysisSchema }
        };
        
        // Make the API call
        const response = await axios.post(
          this.API_BASE_URL,
          payload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.API_KEY}`
            }
          }
        );
        
        // Process the structured response
        if (response.data && response.data.output_text) {
          // Parse the JSON response
          try {
            const analysisData = JSON.parse(response.data.output_text);
            
            // Format the analysis into a readable text format
            const formattedAnalysis = `
# Game Overview
${analysisData.gameOverview}

# Key Factors
${analysisData.keyFactors.map((factor, i) => `${i+1}. ${factor}`).join('\n')}

# Recommended Bet
${analysisData.recommendedBet}

# Confidence Rating
${analysisData.confidenceRating}

# Key Insights
${analysisData.insightSummary.map(insight => `• ${insight}`).join('\n')}
`;
            
            return formattedAnalysis;
          } catch (parseError) {
            // If JSON parsing fails, return the raw text
            console.warn('Unable to parse structured output, using raw text', parseError);
            return response.data.output_text;
          }
        }
        
        // Fallback to extracting text from output array if structured format fails
        if (response.data && response.data.output && response.data.output.length > 0) {
          const messageContent = response.data.output[0].content || [];
          let text = '';
          
          // Extract text from all content items of type 'output_text'
          for (const item of messageContent) {
            if (item.type === 'output_text') {
              text += item.text;
            }
          }
          
          if (text) {
            return text;
          }
        }
        
        throw new Error('Unexpected response format from OpenAI API');
        
      } catch (structuredOutputError) {
        // Fallback to traditional message-based approach if structured output fails
        console.warn('Structured output failed, falling back to traditional format', structuredOutputError);
        
        // Format as traditional messages
        const messages = [
          {
            role: 'system',
            content: instructions
          },
          {
            role: 'user',
            content: userInput + '\n\nProvide your analysis in the following format:\n1. A brief game overview\n2. Key factors influencing your pick\n3. Your recommended bet with reasoning\n4. A confidence rating (High/Medium/Low)\n5. 3-5 bullet points summarizing your key insights'
          }
        ];
        
        // Use the regular generate response method as fallback
        return await this.generateResponse(messages, {
          temperature: options.temperature || 0.8,
          maxTokens: options.maxTokens || 1500,
          model: options.model || this.DEFAULT_MODEL
        });
      }
    } catch (error) {
      console.error('Error generating Gary\'s analysis:', error);
      
      // Provide more detailed error information for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        console.error('Status:', error.response.status);
      }
      
      return 'Unable to generate analysis at this time. Please try again later.';
    }
  }
};

// Initialize and then export the service
openaiServiceInstance.init();

export { openaiServiceInstance as openaiService };
export default openaiServiceInstance;
