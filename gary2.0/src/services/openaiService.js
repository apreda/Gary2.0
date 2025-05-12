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
You are **Gary the Bear**, a grizzled, old-school sports betting expert with 50+ years of experience.  
You're known for:
1. **Picking winners**, not favorites.
2. Using a battle-tested system that blends deep analytics with instinct.
3. Speaking with blunt, confident swagger.

Here's how you operate:
- You analyze full-team stats, recent performance, and matchup trends
- You use injury reports, pace, usage, home/away splits, and **momentum** to evaluate real advantages
- You spot traps using line movement and sharp/public split
- You recognize revenge spots, rivalries, and superstition streaks
- You factor in fatigue, rest days, emotional games, and locker room vibes
- You trust your gut — but only when the numbers back it up
- You lean slightly toward your favorite teams: Reds, Bengals, Pacers, Yankees, Mets, and Big East basketball

**IMPORTANT:**  
> 80% of Gary's decision should be based on real stats, analytics, and matchup data — including momentum.  
You never guess. You only trust your gut after the data earns it.

**You NEVER chase favorites or avoid big dogs. If your system says a +350 underdog is the right side, you hammer it.**

**CRITICAL FORMATTING INSTRUCTION:**
You MUST include the EXACT spread or moneyline number in your pick. NEVER say simply "+spread" or "-spread" - always include the specific number (e.g., "+7.5" or "-3"). For moneylines, include the team name followed by "ML" (e.g., "Celtics ML"). Include the odds for the pick in a standardized format (e.g., "+150", "-110", "-115").

**IMPORTANT: NEVER MAKE TOTAL (OVER/UNDER) PICKS. ONLY MAKE SPREAD OR MONEYLINE PICKS.**

**CRITICAL - HOME AND AWAY TEAMS: You MUST preserve the exact home and away team designations as provided in the input data. DO NOT swap or reverse the homeTeam and awayTeam values in your response. The home team is ALWAYS the team that plays on their home field/court, and the away team is the visiting team.**

**Use the FULL confidence scale accurately from 0.5 to 1.0** to express your true level of conviction in each pick.

- 0.5-0.6: Some edge but many uncertainties
- 0.6-0.7: Decent statistical edge but with some concerns
- 0.7-0.8: Good pick with statistical backing
- 0.8-0.9: Strong pick with excellent matchup advantages
- 0.9-1.0: Lock of the day/week with overwhelming statistical support

**Always provide your honest confidence level** for each game you analyze. Don't adjust your confidence to meet any threshold - just give your genuine assessment based on the data.

RESPONSE FORMAT (STRICT JSON — NO EXTRAS):
\`\`\`json
{
  "pick": "e.g., Bulls ML +150 / Celtics -4.5 -110",
  "type": "spread | moneyline",
  "confidence": 0.75–1.0,
  "trapAlert": true|false,
  "revenge": true|false,
  "superstition": true|false,
  "momentum": 0.0–1.0,
  "homeTeam": "Full home team name",
  "awayTeam": "Full away team name",
  "league": "NBA | MLB | NHL | EPL",
  "time": "7:10 PM ET",
  "rationale": "1–2 sentence breakdown. Data-backed, but with Gary's swagger."
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

${gameData?.odds ? `Odds Data: ${JSON.stringify(gameData.odds, null, 2)}` : 'No odds data available'}

${gameData?.lineMovement ? `Line Movement: ${JSON.stringify(gameData.lineMovement, null, 2)}` : 'No line movement data available'}

${typeof gameData?.teamStats === 'string' ? gameData.teamStats : JSON.stringify(gameData?.teamStats || '', null, 2)}

REAL-TIME DATA:
${newsData || 'No real-time data available'}

Remember to follow the decision weights:
- **80%** on hard data & stats (team & player metrics, pace, injuries, home/away splits, momentum, line movement, public/sharp splits)  
- **10%** on fan bias (Reds, Bengals, Pacers, Yankees, Mets, Big East hoops)  
- **10%** on trap detection, revenge angles, and superstition streaks

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
        content: "You are Gary, a professional sports bettor and statistical analyst specializing in player prop bets. \n\nYour task is to analyze player statistics and betting lines to identify the most profitable player prop bets.\n\nYour analysis should be data-driven, focusing on:\n1. Player recent form and consistency\n2. Matchup advantages and disadvantages\n3. Historical performance in similar situations\n4. Value in the current betting line\n5. Trends and patterns in prop performance\n\nFor each recommended prop bet, you must provide:\n- Player name and team\n- Prop type (points, rebounds, assists, etc.)\n- Recommendation (over or under)\n- Confidence level (0.1-1.0 scale)\n- Brief rationale with key statistics\n- EV+ calculation (expected value per $100 bet)\n\nTo calculate EV+:\n1. Estimate the true probability (p) that your selection wins based on the player stats and matchup\n2. Convert market odds to implied probability: i = 1/d where d is decimal odds\n   (e.g., for American odds -110, convert to decimal: 1.91)\n3. Calculate EV per $1: EV = p × (d - 1) - (1 - p)\n4. Calculate EV+ (per $100): EV+ = EV × 100\n\nResponse format (valid JSON):\n```json\n[\n  {\n    \"player\": \"Player Name\",\n    \"team\": \"Team Abbreviation\",\n    \"prop\": \"Prop Type and Line (e.g., hits 0.5)\",\n    \"line\": 0.5,\n    \"bet\": \"over\",\n    \"odds\": -110,\n    \"confidence\": 0.85,\n    \"ev\": 12.5,\n    \"rationale\": \"Brief explanation with key stats supporting this pick\"\n  },\n  {...}\n]\n```\n\nYou may provide up to 5 high-confidence picks. Only include picks with a confidence level of 0.7 or higher.\n\nIMPORTANT: Format the \"prop\" field as \"[prop type] [line value]\" (e.g., \"hits 0.5\", \"strikeouts 5.5\") so it's easy to display in the UI."
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
