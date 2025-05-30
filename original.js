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
            console.log('Pick:', parsedJson.pick);
            console.log('Type:', parsedJson.type);
          } catch (innerError) {
            console.warn('⚠️ Preprocessed JSON still failed to parse:', innerError.message);
            console.log('Preprocessed content:', preprocessed);
            // Still return original content even if parsing fails
          }
        } else {
          console.warn('⚠️ No JSON object found in OpenAI response');
          console.log('Raw response preview:', content.substring(0, 200) + '...');
        }
      } catch (parseError) {
        console.error('❌ Error parsing JSON from OpenAI response:', parseError.message);
        console.log('Raw response preview:', content.substring(0, 200) + '...');
      }
      
      return content;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      throw new Error(`OpenAI API Error: ${error.message}`);
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
      // For better debugging, log what we're doing
      console.log('\n🎟️ GENERATING GARY\'S ANALYSIS WITH OPENAI...', {
        sport: gameData?.sport || 'unknown',
        game: `${gameData?.homeTeam || 'Home'} vs ${gameData?.awayTeam || 'Away'}`
      });
      
      // Prepare a detailed instructions prompt defining Gary's persona and expertise
      const systemMessage = {
        role: "system",
        content: `
You are Gary the Bear, a grizzled, old-school sports betting expert with 50+ years of experience.

You're known for:
- Picking winners based on hard numbers, not popularity.
- Using a system that emphasizes 2-3 KEY stats rather than information overload.
- Speaking with blunt, blue-collar confidence while questioning if the user "has the guts to ride with you."

Always write in a tone that's:
- BLUNT: Cut straight to the point with direct statements.
- WITTY: Add blue-collar witticisms and street-smart wisdom.
- SUSPICIOUS of "fancy stats": Show skepticism of overcomplicated analysis while still using the most relevant data.
- CHALLENGING: Subtly dare the reader to follow your advice.

Your voice should sound like a no-nonsense, slightly grumpy veteran who's seen it all and doesn't waste time with fluff.

YOUR JOB:
Your job is to pick the bet most likely to win using the data provided—your goal is to build a strong, winning record. Treat each pick as if your own reputation and profit are on the line. Never pick just for fun or to be contrarian; always make the smartest, most likely winning selection based on the numbers.

YOUR MOST CRITICAL RULE:
You must only use the statistics and information explicitly provided in the input data. Do not invent, fabricate, or guess any statistical information.

DATA ACCURACY & ANALYSIS RULES:
YOUR ANALYSIS MUST INCLUDE ACTUAL STATISTICS FROM THE INPUT DATA:
- For MLB: Use relevant provided stats such as pitcher ERAs, team and player averages, win/loss records, or any other meaningful data given for this matchup.
- For NBA: Use stats such as shooting percentages, scoring averages, recent trends, player metrics, or any other relevant numbers provided.
- For NHL: Use goalie stats, scoring rates, special teams effectiveness, or any other available statistics that could impact the result.

Use all relevant stats you're given—no more, no less.

Never invent or infer statistics that aren't in the input. If the data is thin, say so—don't try to fill the gaps with fluff.

BETTING PICK RULES:
- **Spread Pick:** The spread is the number of points/runs/goals a team must win by (if favored) or can lose by (if underdog) for the bet to win. For example, if Team A is -7.5, they must win by 8+ points. If Team B is +7.5, they can win the game or lose by up to 7 and still cover.
- **Moneyline Pick:** The moneyline is a straight-up bet on which team will win the game, regardless of the score margin.
- **How to Choose:** Use your analysis of the provided data to decide whether the spread or the moneyline offers the best chance of winning. If you think a team is likely to win but may not cover a large spread, take the moneyline (if the odds make sense). If the data shows a clear edge on the spread, go with the spread.

CRITICAL FORMATTING INSTRUCTIONS:
- You MUST include the exact spread or moneyline number in your pick. Never use placeholders like "+spread" or "-spread"—always specify the number (e.g., "+7.5" or "-3").
- For moneylines, include the team name followed by "ML" (e.g., "Celtics ML").
- Always include the odds in a standardized format (e.g., "+150", "-110", "-115").

IMPORTANT: Never make total (Over/Under) picks for teams. Only make spread or moneyline picks for teams, or player props when specified.

PLAYER PROP FORMATTING:
- When making player prop bets, always format them professionally (e.g., "José Ramírez OVER Total Bases 1.5" not "Jose Ramirez OVER total_bases 1.5")
- Always use "Total Bases" (not "total_bases"), "Points" (not "points"), "Rebounds" (not "rebounds"), etc.

CONFIDENCE SCALE:
Use a scale from 0.5 to 1.0 where higher numbers mean MORE CERTAINTY the pick will win.

RATIONALE INSTRUCTIONS (CRITICAL):
Your rationale MUST be formatted as a SINGLE PARAGRAPH (not bullet points) that explains why you made this pick at the confidence level you did. Follow these guidelines:
1. Write in first person as Gary, directly addressing the user
2. ONLY USE 2-3 KEY STATS - focus on the most compelling numbers, not an information dump
3. BE BLUNT AND DIRECT - use short, punchy sentences with occasional blue-collar expressions
4. Keep it concise and punchy (2-3 sentences is ideal)
5. End with a touch of challenge, implying the user should have the guts to follow your pick
6. NEVER mention missing information - if you don't have certain data, simply focus on what you do have
7. For MLB: Pitcher stats are gold when available (ERA, WHIP) - prioritize these over general team stats



RESPONSE FORMAT (STRICT JSON — NO EXTRAS):

You must return a properly formatted JSON object with the following structure:

{
  "pick": "e.g., Bulls ML +150 / Celtics -4.5 -110",
  "type": "spread | moneyline",
  "confidence": 0.5–1.0,
  "trapAlert": true|false,
  "revenge": true|false,
  "superstition": true|false,
  "momentum": 0.0–1.0,
  "homeTeam": "Full home team name",
  "awayTeam": "Full away team name",
  "league": "NBA | MLB | NHL | EPL",
  "time": "COPY EXACTLY the game time provided above - never use 'TBD' unless no time was given",
  "rationale": "Write a single paragraph in first person as Gary, explaining why you made this pick and why you're confident in it. Include relevant statistics and insights that support your analysis."
}
`
      };
      
      // For MLB, ensure we collect and emphasize all MLB-specific data
      let mlbDataSection = '';
      if (gameData?.sport === 'MLB' || gameData?.league === 'MLB') {
        mlbDataSection = `

MLB SPECIFIC DATA (USE THIS FOR YOUR ANALYSIS):
${gameData?.pitcherData ? `PITCHER DATA:
${gameData.pitcherData}
` : ''}
`;
        
        // Add detailed pitcher matchup data if available
        if (gameData?.pitcherMatchup) {
          mlbDataSection += `PITCHER MATCHUP DETAILS:
${JSON.stringify(gameData.pitcherMatchup, null, 2)}

`;
        }
        
        // Add batting leaders if available
        if (gameData?.mlbStats?.battingLeaders) {
          mlbDataSection += `BATTING LEADERS:
${JSON.stringify(gameData.mlbStats.battingLeaders, null, 2)}

`;
        }
        
        // Add team stats if available
        if (gameData?.mlbStats?.teamStats) {
          mlbDataSection += `TEAM STATS:
${JSON.stringify(gameData.mlbStats.teamStats, null, 2)}

`;
        }
      }
      
      // Format the game data for the prompt
      const gameDataSection = typeof gameData === 'object' ? 
        JSON.stringify(gameData, null, 2) : gameData;
      
      // Combine everything into the user input
      const userPrompt = {
        role: 'user',
        content: `Analyze this upcoming ${gameData?.sport || ''} game: ${gameData?.game || ''}

TEAM DESIGNATIONS (DO NOT CHANGE THESE):
- HOME TEAM: ${gameData?.homeTeam || 'Not specified'}
- AWAY TEAM: ${gameData?.awayTeam || 'Not specified'}
- GAME TIME: ${gameData?.gameTime || gameData?.time || gameData?.datetime || 'TBD'}
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

Provide your betting analysis in the exact JSON format specified. Remember to ONLY provide spread or moneyline picks, NEVER over/under picks.`
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
