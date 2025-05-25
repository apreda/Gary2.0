/**
 * Gary Engine - The core analysis and betting recommendation system
 * @module garyEngine
 */
import { openaiService } from './openaiService.js';

/**
 * Generate a pick for a specific game using Gary's analysis system
 * @param {object} gameData - The game data to analyze
 * @param {object} options - Additional options
 * @returns {Promise<object>} - The generated pick
 */
export async function makeGaryPick(gameData, options = {}) {
  console.log(`Making a pick for ${gameData?.homeTeam} vs ${gameData?.awayTeam}`);
  
  try {
    // Analyze the game using Gary's engine
    const analysis = await generateGaryAnalysis(gameData, options);
    
    // Parse the analysis to get a standardized pick format
    const pick = parseGaryAnalysis(analysis);
    
    return {
      success: !!pick,
      pick: pick,
      rawAnalysis: analysis,
      game: gameData?.game || `${gameData?.homeTeam} vs ${gameData?.awayTeam}`,
      sport: gameData?.sport,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error making Gary pick:', error);
    return {
      success: false,
      pick: null,
      rawAnalysis: null,
      error: error.message
    };
  }
}

/**
 * Fetch real-time game information and news
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sportKey - Sport identification key
 * @returns {Promise<object>} - Real-time game context information
 */
export async function fetchRealTimeGameInfo(homeTeam, awayTeam, sportKey) {
  // Simple implementation that returns a placeholder
  console.log(`Fetching real-time info for ${homeTeam} vs ${awayTeam} (${sportKey})`);
  
  return {
    summary: `Latest information for ${homeTeam} vs ${awayTeam}`,
    insights: ['Using statistical analysis only'],
    source: 'Gary Stats Engine',
    sport: sportKey || 'unknown',
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate Gary's analysis for a specific game
 * @param {object} gameData - The data for the game to analyze
 * @param {object} options - Optional parameters
 * @returns {Promise<object>} - Gary's analysis
 */
export async function generateGaryAnalysis(gameData, options = {}) {
  console.log('GARY ENGINE: Analyzing game...', gameData?.homeTeam, 'vs', gameData?.awayTeam);
  
  // Validate input data first
  if (!gameData || (!gameData.homeTeam && !gameData.awayTeam)) {
    console.error('CRITICAL ERROR: Missing required game data for analysis');
    console.log('Game data received:', JSON.stringify(gameData, null, 2));
    return {
      success: false,
      message: 'Error: Insufficient game data for analysis',
      rawOpenAIOutput: null,
      game: gameData?.matchup || 'Unknown Game',
      sport: gameData?.league || gameData?.sport || 'unknown',
      timestamp: new Date().toISOString()
    };
  }
  
  try {
    // Format the game data for analysis
    const formattedData = {
      game: gameData?.matchup || `${gameData?.homeTeam || ''} vs ${gameData?.awayTeam || ''}`,
      homeTeam: gameData?.homeTeam || '',
      awayTeam: gameData?.awayTeam || '',
      sport: gameData?.league || gameData?.sport || '',
      league: gameData?.league || gameData?.sport || '',
      odds: gameData?.odds || null,
      // Ensure we pass the comprehensive team stats
      teamStats: gameData?.teamStats || null,
      pitchers: gameData?.pitchers || null,
      hitterStats: gameData?.hitterStats || null, // Include top batters for both teams
      gameContext: gameData?.gameContext || null,
      lineMovement: gameData?.lineMovement || null,
      // Add game time data - important for OpenAI to include in response
      gameTime: gameData?.gameTime || gameData?.time || 'TBD',
      time: gameData?.gameTime || gameData?.time || 'TBD'
    };
    
    // Format odds data for better OpenAI understanding
    if (formattedData.odds && formattedData.odds.markets) {
      console.log('Formatting odds data for OpenAI...');
      let oddsText = `\nCURRENT BETTING ODDS:\n`;
      
      formattedData.odds.markets.forEach(market => {
        if (market.key === 'h2h') {
          oddsText += `Moneyline odds:\n`;
          market.outcomes.forEach(outcome => {
            oddsText += `  ${outcome.name}: ${outcome.price}\n`;
          });
        } else if (market.key === 'spreads') {
          oddsText += `Point spread odds:\n`;
          market.outcomes.forEach(outcome => {
            oddsText += `  ${outcome.name} ${outcome.point}: ${outcome.price}\n`;
          });
        } else if (market.key === 'totals') {
          oddsText += `Total (Over/Under) odds:\n`;
          market.outcomes.forEach(outcome => {
            oddsText += `  ${outcome.name} ${outcome.point}: ${outcome.price}\n`;
          });
        }
      });
      
      formattedData.oddsText = oddsText;
      console.log('Formatted odds text:', oddsText);
    } else {
      console.log('No odds data available for formatting');
      formattedData.oddsText = '\nNo current betting odds available.\n';
    }
    
    // Log the availability of team stats for debugging
    console.log(`Team Stats Available: ${!!gameData?.teamStats}`);
    console.log(`Pitcher Data Available: ${!!gameData?.pitchers}`);
    console.log(`Game Context Available: ${!!gameData?.gameContext}`);
    
    console.log('Formatted game data:', JSON.stringify(formattedData, null, 2));
    
    // Simple placeholder for news data
    const newsData = options.newsData || 'Using stats-only analysis.';
    
    // Generate analysis using OpenAI
    console.log('Calling OpenAI for analysis with temperature:', options.temperature || 0.7);
    const rawOpenAIResponse = await openaiService.generateGaryAnalysis(
      formattedData, 
      newsData,
      {
        temperature: options.temperature || 0.7,
        model: options.model
      }
    );
    
    // Validate the raw response
    if (!rawOpenAIResponse) {
      console.error('CRITICAL ERROR: Empty response received from OpenAI');
      return {
        success: false,
        message: 'Error: No response from OpenAI',
        rawOpenAIOutput: null,
        game: formattedData.game,
        sport: formattedData.sport,
        timestamp: new Date().toISOString()
      };
    }
    
    // Log the entire raw response for complete debugging
    console.log('FULL RAW OPENAI RESPONSE:');
    console.log(rawOpenAIResponse);
    console.log('Response length:', rawOpenAIResponse.length, 'characters');
    
    // Unified JSON extraction function - more maintainable and reusable
    const extractJSON = (rawResponse) => {
      // Result object with extraction details
      const result = {
        json: null,
        method: 'none',
        success: false
      };
      
      // CASE 1: Response is already an object (not a string)
      if (rawResponse && typeof rawResponse === 'object' && !Array.isArray(rawResponse)) {
        console.log('Response is already a valid object, no parsing needed');
        result.json = rawResponse;
        result.method = 'direct_object';
        result.success = true;
        return result;
      }
      
      // CASE 2: Invalid input
      if (typeof rawResponse !== 'string') {
        console.error('Invalid response format - not a string or object:', typeof rawResponse);
        return result;
      }
      
      // CASE 3: Try direct JSON parsing first (fastest method)
      try {
        result.json = JSON.parse(rawResponse);
        result.method = 'direct_json';
        result.success = true;
        console.log('Successfully parsed direct JSON');
        return result;
      } catch (directError) {
        // Continue to other methods if direct parsing fails
        console.log('Direct JSON parsing failed:', directError.message);
      }
      
      // CASE 4: Extract from code blocks like ```json {content} ```
      try {
        const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          const cleanJson = codeBlockMatch[1].trim();
          result.json = JSON.parse(cleanJson);
          result.method = 'markdown_code_block';
          result.success = true;
          console.log('Successfully extracted JSON from markdown code block');
          return result;
        }
      } catch (markdownError) {
        console.log('Markdown extraction failed:', markdownError.message);
      }
      
      // CASE 5: Last resort - regex match for JSON-like pattern
      try {
        const jsonPattern = rawResponse.match(/\{[\s\S]*?"pick"[\s\S]*?"confidence"[\s\S]*?\}/);
        if (jsonPattern) {
          result.json = JSON.parse(jsonPattern[0]);
          result.method = 'regex_pattern';
          result.success = true;
          console.log('Successfully extracted JSON via regex pattern');
          return result;
        }
      } catch (regexError) {
        console.log('Regex pattern extraction failed:', regexError.message);
      }
      
      // If all extraction methods fail, return the empty result
      console.error('All JSON extraction methods failed');
      return result;
    };
    
    // Use the extraction function
    const extraction = extractJSON(rawOpenAIResponse);
    const extractedJSON = extraction.success ? extraction.json : null;
    const extractionMethod = extraction.method;
    
    // Create the result object with the parsed JSON
    const result = {
      success: !!extractedJSON,
      message: extractedJSON 
        ? `Analysis completed successfully (using ${extractionMethod})` 
        : 'Failed to generate valid analysis',
      rawOpenAIOutput: extractedJSON,
      extractionMethod: extractionMethod,
      game: formattedData.game,
      sport: formattedData.sport,
      timestamp: new Date().toISOString()
    };
    
    // Validate required fields in the extracted JSON
    if (extractedJSON) {
      const requiredFields = ['pick', 'type', 'confidence'];
      const missingFields = requiredFields.filter(field => !extractedJSON[field]);
      
      if (missingFields.length > 0) {
        console.warn(`Warning: Extracted JSON is missing required fields: ${missingFields.join(', ')}`);
        result.warning = `Missing fields: ${missingFields.join(', ')}`;
      }
      
      if (extractedJSON.confidence && extractedJSON.confidence < 0.5) {
        console.warn(`Warning: Confidence level ${extractedJSON.confidence} is unusually low`);
        result.warning = `Low confidence: ${extractedJSON.confidence}`;
      }
    }
    
    console.log('PARSED JSON OUTPUT:', result.rawOpenAIOutput ? 'SUCCESS' : 'FAILED');
    if (result.rawOpenAIOutput) {
      console.log('Extracted fields:', Object.keys(result.rawOpenAIOutput).join(', '));
      console.log('Confidence:', result.rawOpenAIOutput.confidence);
      console.log('Pick:', result.rawOpenAIOutput.pick);
    }
    
    return result;
  } catch (error) {
    console.error('Error in Gary Engine:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      rawOpenAIOutput: null,
      game: gameData?.matchup || `${gameData?.homeTeam || ''} vs ${gameData?.awayTeam || ''}`,
      sport: gameData?.league || gameData?.sport || '',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Calculate stake amount based on bet type
 * @param {object} pick - The pick object
 * @returns {number} - Recommended stake amount
 */
export function calculateStake(pick) {
  if (!pick) return 0;
  
  try {
    // Default confidence if not provided
    const confidence = 0.8;
    
    // Calculate stake based on confidence
    return Math.round(100 * confidence);
  } catch (error) {
    console.error('Error calculating stake:', error);
    return 100; // Default
  }
}

/**
 * Function that simply returns the raw OpenAI output without transformations
 * @param {object} analysisObject - The object from generateGaryAnalysis
 * @returns {object} - The raw OpenAI output directly
 */
export function parseGaryAnalysis(analysisObject) {
  try {
    // Just log what we're receiving for debugging
    console.log('parseGaryAnalysis input:', !!analysisObject);
    
    // Early return if nothing was passed
    if (!analysisObject) {
      console.log('No analysis object received, returning null');
      return null;
    }
    
    // If we have the raw OpenAI output, return it directly
    if (analysisObject.rawOpenAIOutput) {
      console.log('Returning raw OpenAI output directly without transformation');
      return analysisObject.rawOpenAIOutput;
    }
    
    // If the analysisObject is itself the raw output
    if (typeof analysisObject === 'object' && analysisObject.pick) {
      console.log('Returning analysisObject directly as raw OpenAI data');
      return analysisObject;
    }
    
    // Fallback
    console.log('No usable data found in analysisObject');
    return null;
  } catch (error) {
    console.error('Error in parseGaryAnalysis:', error);
    return null;
  }
}
