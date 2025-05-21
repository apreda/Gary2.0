/**
 * OpenAI service for generating sports analysis and picks
 * This service uses OpenAI to generate Gary's betting analysis and recommendations
 * Provides betting insights through the legendary Gary the Grizzly Bear character
 * Deployment: 2025-05-19
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
- Use the statistics provided in the input to form your analysis and justify your pick.
- Focus on the data points that you believe are most relevant to the outcome.
- Incorporate both team and individual player statistics when making your case.

Use the stats in a way that feels natural and adds weight to your argument.

NEVER EVER mention missing or limited stats in your analysis. Do not use phrases like "with no player stats available" or "relying on league averages" or any other language that suggests data limitations. Users should never know if data is missing.

Never invent or infer statistics that aren't in the input. If data is limited, simply use what you have and be confident in your analysis without mentioning any data limitations.

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
Your rationale should be a SINGLE PARAGRAPH that explains your pick and confidence level. Follow these guidelines:
1. Write in first person as Gary, directly addressing the user
2. Keep it concise (2-4 sentences) 
3. Use your judgment to determine which stats are most relevant - don't feel obligated to use any specific metrics
4. Be conversational, direct, and confident
5. Each rationale should feel unique and organically generated



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
  "rationale": "A 2-4 sentence paragraph explaining your pick using whatever information you find most compelling."
}
`
    };
    
    /**
     * Combine all input data and format it for the user prompt
     */
    // Prepare all game stats in a flexible way - we'll pass whatever we have to OpenAI
    // This follows user's direction to be flexible with stats formatting
    let statsSection = '';  
      
    // Add any stats we have - don't be picky about structure, OpenAI can parse them
      
    // 1. First add the standard stats context if available
    if (gameData?.statsContext) {
      statsSection += gameData.statsContext;
      statsSection += '\n\n';
    }
      
    // 2. Add any enhanced stats if available
    if (gameData?.enhancedStats) {
      statsSection += gameData.enhancedStats;
      statsSection += '\n\n';
    }
      
    // 3. If we have pitcher data (critical for MLB), add it prominently
    if (gameData?.pitcherData) {
      statsSection += 'STARTING PITCHER MATCHUP:\n';
        
      if (typeof gameData.pitcherData === 'string') {
        statsSection += gameData.pitcherData;
      } else {
        const homePitcher = gameData.pitcherData.homePitcher;
        const awayPitcher = gameData.pitcherData.awayPitcher;
          
        if (homePitcher) {
          statsSection += `HOME: ${homePitcher.name} - `;
          if (homePitcher.stats) {
            statsSection += Object.entries(homePitcher.stats)
              .map(([key, val]) => `${key}: ${val}`)
              .join(', ');
          }
          statsSection += '\n';
        }
          
        if (awayPitcher) {
          statsSection += `AWAY: ${awayPitcher.name} - `;
          if (awayPitcher.stats) {
            statsSection += Object.entries(awayPitcher.stats)
              .map(([key, val]) => `${key}: ${val}`)
              .join(', ');
          }
          statsSection += '\n';
        }
      }
      statsSection += '\n';
    }
      
    // 4. Include MLB-specific note if this is MLB data
    if (gameData?.sport === 'MLB' || gameData?.league === 'MLB') {
      statsSection += '**NOTE: All MLB data is from the current 2025 season**\n\n';
    }
      
    // 5. Include any team stats we have
    if (gameData?.teamStats && typeof gameData.teamStats === 'object') {
      statsSection += 'TEAM STATISTICS SUMMARY:\n';
      try {
        statsSection += JSON.stringify(gameData.teamStats, null, 2);
      } catch (e) {
        statsSection += 'Team stats available but in non-JSON format';
      }
      statsSection += '\n\n';
    } else if (typeof gameData?.teamStats === 'string') {
      statsSection += gameData.teamStats;
      statsSection += '\n\n';
    }
      
    // 6. Include all collected stats if we have them
    if (gameData?.allCollectedStats && gameData.allCollectedStats.sources?.length > 0) {
      statsSection += 'COLLECTED STATS FROM MULTIPLE SOURCES:\n';
      statsSection += `${gameData.allCollectedStats.sources.length} data sources available\n`;
      statsSection += 'Data sources: ' + gameData.allCollectedStats.sources.map(s => s.source).join(', ') + '\n\n';
    }
      
    // If we still have no stats at all, just say so
    if (!statsSection.trim()) {
      statsSection = 'No detailed statistics available. Analysis will be based on limited data.\n';
    }
      
    // Combine everything into the user input in a format Gary can analyze
    const userPrompt = {
      role: 'user',
      content: `Analyze this upcoming ${gameData?.sport || ''} game: ${gameData?.homeTeam || 'Home'} vs ${gameData?.awayTeam || 'Away'}

TEAM DESIGNATIONS (DO NOT CHANGE THESE):
- HOME TEAM: ${gameData?.homeTeam || 'Not specified'}
- AWAY TEAM: ${gameData?.awayTeam || 'Not specified'}
- GAME TIME: ${gameData?.gameTime || gameData?.time || gameData?.datetime || 'TBD'}

${gameData?.odds ? `Odds Data: ${JSON.stringify(gameData.odds, null, 2)}` : 'No odds data available'}

${gameData?.lineMovement ? `Line Movement: ${JSON.stringify(gameData.lineMovement, null, 2)}` : 'No line movement data available'}

TEAM STATISTICS AND DATA:
${statsSection}

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
   * @param {string} prompt - The detailed prompt with game data and available props
   * @param {Object} options - Additional options for the generation
   * @returns {Promise<string>} - The generated prop picks response
   */
  generatePropPicks: async function(prompt, options = {}) {
    try {
      console.log('Generating prop picks from OpenAI...');
      
      const systemMessage = {
        role: 'system',
        content: "You are Gary, a professional sports bettor and statistical analyst specializing in player prop bets. \n\nYour task is to analyze player statistics and betting lines to identify the most profitable player prop bets.\n\nYour analysis should be data-driven, focusing on:\n1. Player recent form and consistency\n2. Matchup advantages and disadvantages\n3. Historical performance in similar situations\n4. Value in the current betting line\n5. Trends and patterns in prop performance\n\nFor each recommended prop bet, you must provide:\n- Player name and team\n- Prop type (points, rebounds, assists, etc.)\n- Recommendation (over or under)\n- Confidence level (0.1-1.0 scale)\n- Brief rationale with key statistics\n- EV+ calculation (expected value per $100 bet)\n\nTo calculate EV+:\n1. Estimate the true probability (p) that your selection wins based on the player stats and matchup\n2. Convert market odds to implied probability: i = 1/d where d is decimal odds\n   (e.g., for American odds -110, convert to decimal: 1.91)\n3. Calculate EV per $1: EV = p × (d - 1) - (1 - p)\n4. Calculate EV+ (per $100): EV+ = EV × 100\n\nNEVER EVER mention missing or limited stats in your rationale. Do not use phrases like \"with no player stats available\" or \"relying on league averages\" or any other language that suggests data limitations. Users should never know if data is missing.\n\nResponse format (valid JSON):\n```json\n[\n  {\n    \"player\": \"Player Name\",\n    \"team\": \"Full Team Name\",\n    \"prop\": \"Prop Type and Line (e.g., hits 0.5)\",\n    \"line\": 0.5,\n    \"bet\": \"over\",\n    \"odds\": -110,\n    \"confidence\": 0.85,\n    \"ev\": 12.5,\n    \"rationale\": \"3-4 detailed sentences with key stats and reasoning supporting this pick\"\n  },\n  {...}\n]\n```\n\nYou may provide up to 5 picks with their confidence scores (between 0.1 and 1.0).\n\nIMPORTANT: Format the \"prop\" field as \"[prop type] [line value]\" (e.g., \"hits 0.5\", \"strikeouts 5.5\") so it's easy to display in the UI.\n\nIMPORTANT: Always use the full team name (e.g., 'Cleveland Guardians') rather than abbreviations in the team field."
      };
      
      const userMessage = {
        role: 'user',
        content: prompt
      };
      
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
