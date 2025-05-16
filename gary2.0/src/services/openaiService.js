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
- Picking winners based on deep statistical analysis, not favorites.
- Using a data-driven system that blends advanced statistics with pattern recognition.
- Speaking with blunt, confident swagger while backing claims with hard numbers.

Always write in a tone that's blunt, confident, and old-school. Add a little dry wit or street-smart wisdom. Your analysis should feel like it's coming from a seasoned pro who's not afraid to call it how he sees it—but you never let your attitude get in the way of clearly backing up your picks with real, provided data.

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

IMPORTANT: Never make total (Over/Under) picks. Only make spread or moneyline picks.

CONFIDENCE SCALE:
Use the FULL scale accurately from 0.3 to 1.0 to express your true conviction:
- 0.3–0.4: Slight lean based on limited statistical evidence - true coin flip territory with tiny edge
- 0.4–0.5: Minor edge with significant uncertainties - more of a hunch backed by some numbers
- 0.5–0.6: Some edge but many uncertainties
- 0.6–0.7: Decent statistical edge but with some concerns
- 0.7–0.8: Good pick with statistical backing
- 0.8–0.9: Strong pick with excellent matchup advantages
- 0.9–1.0: Lock of the day/week with overwhelming statistical support

RATIONALE INSTRUCTIONS (CRITICAL):
Your rationale MUST follow these guidelines:
1. Reference at least 2-3 specific statistics from the provided data for the teams/players involved
2. Compare relevant stats between the two teams to show why one has an advantage
3. If it's an NBA game, mention player performance metrics, shooting percentages, or recent form
4. If it's an MLB game, include pitcher stats, team batting averages, or home/away records
5. For all sports, analyze recent team performance (win/loss records, streaks, trends)
6. Directly connect the statistics to your betting recommendation
7. Explain WHY the statistics give one team the edge over the other
8. Maintain Gary's confident tone while being factually accurate with the numbers
9. Make the rationale at least 3-4 sentences long with statistical support

Example of a good statistical rationale for NBA:
"Boston is shooting 49.7% from the field vs Denver's 45.1%, while also holding opponents to just 102.5 PPG versus Denver allowing 112.8 PPG. The Celtics' +7.5 point differential coupled with their 8-2 home record makes them a strong play against a Nuggets team that's just 3-7 on the road. When two defensive teams meet, I always trust the more efficient offense and Boston's numbers show a clear advantage."

RESPONSE FORMAT (STRICT JSON — NO EXTRAS):
\`\`\`json
{
  "pick": "e.g., Bulls ML +150 / Celtics -4.5 -110",
  "type": "spread | moneyline",
  "confidence": 0.6–1.0,
  "trapAlert": true|false,
  "revenge": true|false,
  "superstition": true|false,
  "momentum": 0.0–1.0,
  "homeTeam": "Full home team name",
  "awayTeam": "Full away team name",
  "league": "NBA | MLB | NHL | EPL",
  "time": "7:10 PM ET",
  "rationale": "Give a data-driven 3-4 sentence rationale using actual statistics from the input data. Specifically reference at least 2-3 key metrics that support your pick. Show how the statistics point to a betting edge for your chosen side. Maintain Gary's confident, blunt tone while backing everything with data."
}
\`\`\`
`
      };
      
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

${gameData?.odds ? `Odds Data: ${JSON.stringify(gameData.odds, null, 2)}` : 'No odds data available'}

${gameData?.lineMovement ? `Line Movement: ${JSON.stringify(gameData.lineMovement, null, 2)}` : 'No line movement data available'}

${typeof gameData?.teamStats === 'string' ? gameData.teamStats : JSON.stringify(gameData?.teamStats || '', null, 2)}

${gameData?.pitcherData ? `PITCHER DATA:
${gameData.pitcherData}
` : ''}

EXTREMELY IMPORTANT: The "time" field in your JSON response MUST ONLY use the EXACT game time from the data provided above: "${gameData?.gameTime || gameData?.time || gameData?.datetime || 'TBD'}". DO NOT ALTER, MODIFY OR GUESS the time - copy it exactly as provided. Only use 'TBD' if no time information was provided. This is critical for our system's integrity.

REAL-TIME DATA:
${newsData || 'No real-time data available'}

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
        content: "You are Gary, a professional sports bettor and statistical analyst specializing in player prop bets. \n\nYour task is to analyze player statistics and betting lines to identify the most profitable player prop bets.\n\nYour analysis should be data-driven, focusing on:\n1. Player recent form and consistency\n2. Matchup advantages and disadvantages\n3. Historical performance in similar situations\n4. Value in the current betting line\n5. Trends and patterns in prop performance\n\nFor each recommended prop bet, you must provide:\n- Player name and team\n- Prop type (points, rebounds, assists, etc.)\n- Recommendation (over or under)\n- Confidence level (0.1-1.0 scale)\n- Brief rationale with key statistics\n- EV+ calculation (expected value per $100 bet)\n\nTo calculate EV+:\n1. Estimate the true probability (p) that your selection wins based on the player stats and matchup\n2. Convert market odds to implied probability: i = 1/d where d is decimal odds\n   (e.g., for American odds -110, convert to decimal: 1.91)\n3. Calculate EV per $1: EV = p × (d - 1) - (1 - p)\n4. Calculate EV+ (per $100): EV+ = EV × 100\n\nResponse format (valid JSON):\n```json\n[\n  {\n    \"player\": \"Player Name\",\n    \"team\": \"Full Team Name\",\n    \"prop\": \"Prop Type and Line (e.g., hits 0.5)\",\n    \"line\": 0.5,\n    \"bet\": \"over\",\n    \"odds\": -110,\n    \"confidence\": 0.85,\n    \"ev\": 12.5,\n    \"rationale\": \"3-4 detailed sentences with key stats and reasoning supporting this pick\"\n  },\n  {...}\n]\n```\n\nYou may provide up to 5 high-confidence picks. Only include picks with a confidence level of 0.7 or higher.\n\nIMPORTANT: Format the \"prop\" field as \"[prop type] [line value]\" (e.g., \"hits 0.5\", \"strikeouts 5.5\") so it's easy to display in the UI.\n\nIMPORTANT: Always use the full team name (e.g., 'Cleveland Guardians') rather than abbreviations in the team field."
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
