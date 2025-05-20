/**
 * Service for interacting with the OpenAI API
 * Provides Gary's analysis and betting recommendations
 */
import axios from 'axios';
import { apiCache } from '../utils/apiCache';
import { requestQueue } from '../utils/requestQueue';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: import.meta.env?.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

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
   * Default model for OpenAI
   */
  DEFAULT_MODEL: 'gpt-4.1', 
  
  /**
   * Generate a response from OpenAI based on the provided messages
   * @param {Array} messages - The messages to send to OpenAI
   * @param {Object} options - Configuration options for the OpenAI API
   * @returns {Promise<string>} - The generated response
   */
  generateResponse: async function(messages, options = {}) {
    try {
      console.log('Generating response from OpenAI...');
      
      const { temperature = 0.5, maxTokens = 800 } = options;
      
      // We don't log the full messages array to avoid sensitive info in logs
      // but we do log enough to debug if needed
      console.log(`Request messages count: ${messages.length}, ` + 
                 `Temp: ${temperature}, MaxTokens: ${maxTokens}`);
      
      // Make the API request
      const response = await openai.chat.completions.create({
        model: options.model || this.DEFAULT_MODEL,
        messages: messages,
        temperature,
        max_tokens: maxTokens,
      });
      
      // Extract the assistant's message
      const content = response.choices[0].message.content;
      
      // Add comprehensive logging to debug the structure of the OpenAI response
      console.log('\n🔍 OpenAI raw response received. Attempting to parse JSON...');
      try {
        // Helper function to preprocess JSON string to handle betting odds notation
        const preprocessJSON = (jsonStr) => {
          // Replace odds values like "odds": +120 with "odds": 120 (remove the plus sign)
          // and handle other betting odds formats
          return jsonStr.replace(/"odds"\s*:\s*\+([0-9]+)/g, '"odds": $1')
                      .replace(/"odds"\s*:\s*"\+([0-9]+)"/g, '"odds": "$1"')
                      // Also handle plus signs in picks notation
                      .replace(/("pick"\s*:\s*"[^"]*)(\+)([0-9]+)([^"]*")/g, '$1plus$3$4');
        };
        
        // Attempt to find and parse JSON in the response
        const jsonMatch = content.match(/\{[\s\S]*?\}/); // Match everything between { and } (non-greedy)
        if (jsonMatch) {
          const jsonContent = jsonMatch[0];
          // Preprocess the JSON to handle betting odds notation
          const preprocessed = preprocessJSON(jsonContent);
          try {
            const parsedJson = JSON.parse(preprocessed);
            console.log('✅ Successfully parsed JSON from OpenAI response:');
            console.log('JSON Structure:', Object.keys(parsedJson).join(', '));
            console.log('Confidence value:', parsedJson.confidence);
          } catch (e) {
            console.log('❌ Failed to parse JSON from OpenAI response:', e.message);
            console.log('Attempted to parse:', jsonContent.substring(0, 100) + '...');
          }
        } else {
          console.log('❓ No JSON object found in OpenAI response');
        }
      } catch (e) {
        console.log('Error when analyzing response:', e.message);
      }
      
      return content;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      
      // Provide more detailed error information for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        console.error('Status:', error.response.status);
      }
      
      throw error; // Rethrow so caller can handle it
    }
  },
  
  /**
   * Generates Gary's detailed sports betting analysis
   * @param {object} gameData - The game data from sports API
   * @param {string} newsData - The latest news and trends from Perplexity
   * @param {object} options - Additional options for the analysis
   * @returns {Promise<string>} - Gary's detailed analysis
   */
  generateGaryAnalysis: async function(gameData, newsData, options = {}) {
    try {
      console.log(`Generating Gary's analysis for ${gameData?.homeTeam} vs ${gameData?.awayTeam}`);
      
      // Format the game time for display (default to TBD if not provided)
      const gameTime = gameData?.gameTime || gameData?.time || gameData?.datetime || 'TBD';
      
      // Determine league-specific data to include
      let mlbDataSection = '';
      if (gameData?.sportKey?.includes('baseball') || gameData?.league === 'MLB') {
        // Special MLB data formatting
        if (gameData?.pitcherMatchup) {
          mlbDataSection = `
PITCHING MATCHUP:
${gameData.pitcherMatchup}

`;
        }
      }
      
      // Create dynamic system message based on the specific sport
      let systemPrompt = `You are Gary, a veteran sports betting analyst with decades of experience providing insights and picks. 

Analyze this upcoming game between ${gameData?.homeTeam} and ${gameData?.awayTeam} scheduled for ${gameTime}.

Your task is to provide a confident betting pick with supporting analysis. The pick must be in the exact JSON format shown below, with no variations or additions:

{
  "gameID": "${gameData?.id || ''}",
  "league": "${gameData?.league || gameData?.sportKey || ''}",
  "homeTeam": "${gameData?.homeTeam || ''}",
  "awayTeam": "${gameData?.awayTeam || ''}",
  "time": "${gameTime}",
  "matchup": "${gameData?.awayTeam || ''} @ ${gameData?.homeTeam || ''}",
  "pick": "TEAM_NAME" or "TEAM_NAME -X.X" or "TEAM_NAME +X.X",
  "betType": "moneyline" or "spread",
  "odds": X.XX,
  "confidence": X.XX,
  "rationale": "Your clear, concise reasoning based on stats, matchups, trends, and situational factors"
}

EXTREMELY IMPORTANT RULES:
1. Your confidence value MUST be between 0.1 and 1.0. Never higher than 1.0.
2. ONLY provide picks with confidence >= 0.75. If your true confidence is lower, increase it to exactly 0.75.
3. ALWAYS provide EXACTLY ONE pick - either a spread bet OR moneyline bet. NEVER provide over/under picks.
4. If betting the spread, clearly include the points in your pick (e.g., "Detroit Pistons +7.5").
5. Make sure ALL fields are properly filled in with the correct data types and format.
6. For the "odds" field: Use American odds format. For underdogs use positive values (e.g., +150), for favorites use negative values (e.g., -180).
7. Your response should contain ONLY the JSON object, nothing else.`;

      // Create the user prompt with game data
      const userPrompt = `
GAME DATA: ${gameData?.homeTeam} vs ${gameData?.awayTeam} at ${gameTime}

SPORT: ${gameData?.sportKey || 'N/A'}

LEAGUE: ${gameData?.league || 'N/A'}

ODDS DATA:
${gameData?.homeTeam} Moneyline: ${gameData?.odds?.homeMoneyline || 'N/A'} 
${gameData?.awayTeam} Moneyline: ${gameData?.odds?.awayMoneyline || 'N/A'}
Spread: ${gameData?.homeTeam} ${gameData?.odds?.homeSpread || 'N/A'} (${gameData?.odds?.homeSpreadOdds || 'N/A'})
Over/Under: ${gameData?.odds?.overUnder || 'N/A'} (Over: ${gameData?.odds?.overOdds || 'N/A'} / Under: ${gameData?.odds?.underOdds || 'N/A'})
${mlbDataSection}

${gameData?.odds ? `Odds Data: ${JSON.stringify(gameData.odds, null, 2)}` : 'No odds data available'}

${gameData?.lineMovement ? `Line Movement: ${JSON.stringify(gameData.lineMovement, null, 2)}` : 'No line movement data available'}

${typeof gameData?.teamStats === 'string' ? gameData.teamStats : JSON.stringify(gameData?.teamStats || '', null, 2)}

${gameData?.pitcherData ? `PITCHER DATA:
${gameData.pitcherData}
` : ''}

${gameData?.headlines && gameData.headlines.length > 0 ? `HEADLINES AND STORYLINES:
${gameData.headlines.map((headline, i) => `${i+1}. ${headline}`).join('\n')}
` : ''}

${gameData?.injuries && (gameData.injuries.homeTeam.length > 0 || gameData.injuries.awayTeam.length > 0) ? `KEY INJURIES:
${gameData.homeTeam}: ${gameData.injuries.homeTeam.join(', ') || 'None reported'}
${gameData.awayTeam}: ${gameData.injuries.awayTeam.join(', ') || 'None reported'}
` : ''}

EXTREMELY IMPORTANT - ABOUT THE GAME TIME: 
1. The system is reporting that you are incorrectly setting game times to "TBD" when actual times are available.
2. The "time" field in your JSON response MUST use the EXACT game time provided here: "${gameData?.gameTime || gameData?.time || gameData?.datetime || 'TBD'}"
3. LOOK CAREFULLY at the GAME TIME value provided above - it contains the actual game time.
4. DO NOT default to "TBD" unless absolutely no time was provided.
5. Copy the time EXACTLY as given - do not modify, reformat, or guess.

Example: If provided with game time "7:30 PM ET", your JSON must include "time": "7:30 PM ET" - not "TBD".

This is CRITICALLY important for our system's integrity.

REAL-TIME NEWS AND TRENDS:
${gameData?.realTimeNews || newsData || 'No real-time data available'}

Decision Weights:
- **90%** on hard data & stats (team & player metrics, recent team form, player statistics, home/away splits, momentum)
- **10%** on Gary's Gut - A sophisticated blend of:
  - Market intelligence (odds movement, line value, betting market signals)
  - Situational awareness (schedule spots, rest advantages, travel impact)
  - Game theory (how the public might be misvaluing the matchup)
  - Favorite-Longshot Bias consideration (accounting for the tendency of bettors to overvalue favorites and undervalue underdogs, creating value on longshots)

Provide your betting analysis in the exact JSON format specified. Remember to ONLY provide spread or moneyline picks, NEVER over/under picks.`;

      // Create system and user messages
      const systemMessage = {
        role: 'system',
        content: systemPrompt
      };
      
      // Use our standard generateResponse method to make the API call
      return await this.generateResponse([systemMessage, userPrompt], {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 1500,
        model: options.model || this.DEFAULT_MODEL
      });
    } catch (error) {
      console.error('Error generating Gary\'s analysis:', error);
      
      // Provide more detailed error information for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        console.error('Status:', error.response.status);
      }
      
      throw error; // Rethrow so caller can handle it
    }
  },
  /**
   * Generate prop picks recommendations from OpenAI
   */
  generatePropPicks: async function(prompt, options = {}) {
    try {
      const systemMessage = { role: 'system', content: 'You are Gary AI, a sports betting advisor specializing in prop bets.' };
      const userMessage = { role: 'user', content: prompt };
      
      // Use our standard generateResponse method to make the API call
      return await this.generateResponse([systemMessage, userMessage], {
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 1500,
        model: options.model || this.DEFAULT_MODEL
      });
    } catch (error) {
      console.error('Error generating prop picks:', error);
      
      // Provide more detailed error information for debugging
      if (error.response) {
        console.error('API Error Response:', error.response.data);
        console.error('Status:', error.response.status);
      }
      
      throw error; // Rethrow so caller can handle it
    }
  }
};

// Initialize and then export the service
openaiServiceInstance.init();

export { openaiServiceInstance as openaiService };
export default openaiServiceInstance;
