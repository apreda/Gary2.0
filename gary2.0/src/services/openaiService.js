/**
 * Service for interacting with the OpenAI API
 * Provides Gary's analysis and betting recommendations
 */
import axios from 'axios';

export const openaiService = {
  /**
   * The OpenAI API key (loaded from environment variables)
   */
  API_KEY: import.meta.env?.VITE_OPENAI_API_KEY || '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',
  
  /**
   * Base URL for OpenAI API
   */
  API_BASE_URL: 'https://api.openai.com/v1/chat/completions',
  
  /**
   * Preferred model for Gary's analysis
   */
  DEFAULT_MODEL: 'gpt-4-0125-preview', // Using the most advanced model for best sports analysis
  
  /**
   * Generates a response from OpenAI based on the provided prompt
   * @param {string|array} prompt - Either a string prompt or an array of message objects
   * @param {object} options - Additional options for the request
   * @returns {Promise<string>} - The generated response
   */
  generateResponse: async (prompt, options = {}) => {
    try {
      console.log('Generating response from OpenAI...');
      
      // Default options
      const defaultOptions = {
        model: openaiService.DEFAULT_MODEL,
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
        openaiService.API_BASE_URL,
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
            'Authorization': `Bearer ${openaiService.API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Extract the response content
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const result = response.data.choices[0].message.content;
        console.log('Successfully generated response from OpenAI');
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
  generateGaryAnalysis: async (gameData, newsData, options = {}) => {
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
      const analysis = await openaiService.generateResponse(messages, {
        temperature: options.temperature || 0.8,
        maxTokens: options.maxTokens || 1500,
        model: options.model || 'gpt-4-0125-preview'
      });
      
      return analysis;
    } catch (error) {
      console.error('Error generating Gary\'s analysis:', error);
      return 'Unable to generate analysis at this time. Please try again later.';
    }
  }
};

export default openaiService;
