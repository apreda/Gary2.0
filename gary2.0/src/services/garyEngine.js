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
      odds: gameData?.odds || null,
      teamStats: gameData?.teamStats || null,
      lineMovement: gameData?.lineMovement || null
    };
    
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
    
    // Log the raw response for troubleshooting (truncated for readability)
    console.log('RAW OPENAI RESPONSE (first 200 chars):', 
               rawOpenAIResponse.substring(0, 200) + 
               (rawOpenAIResponse.length > 200 ? '...' : ''));
    console.log('Response length:', rawOpenAIResponse.length, 'characters');
    
    // Extract JSON content from the response
    let extractedJSON;
    let extractionMethod = 'none';
    
    try {
      // First try to parse the entire response as JSON
      extractedJSON = JSON.parse(rawOpenAIResponse);
      extractionMethod = 'direct_json';
      console.log('Full response parsed as valid JSON');
    } catch (parseError) {
      console.log('Direct JSON parse failed:', parseError.message);
      console.log('Attempting to extract JSON from markdown...');
      
      // Try to extract JSON from markdown code blocks (both with and without json identifier)
      // This handles ```json and ``` formats
      const jsonMatch = rawOpenAIResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          // Trim whitespace which can cause JSON parsing errors
          const cleanedJson = jsonMatch[1].trim();
          extractedJSON = JSON.parse(cleanedJson);
          extractionMethod = 'markdown_code_block';
          console.log('Successfully extracted JSON from markdown code block');
        } catch (nestedError) {
          console.error('Failed to parse extracted content as JSON:', nestedError.message);
          console.log('Extracted content:', jsonMatch[1].substring(0, 100));
          // Continue to next method
        }
      }
      
      // If markdown extraction failed, try to find anything that looks like JSON with curly braces
      if (!extractedJSON) {
        console.log('Attempting last resort JSON extraction with regex...');
        // Look for the pattern that most closely resembles a complete JSON object
        const lastResortMatch = rawOpenAIResponse.match(/\{[\s\S]*?\"pick\"[\s\S]*?\"confidence\"[\s\S]*?\}/);
        
        if (lastResortMatch) {
          try {
            extractedJSON = JSON.parse(lastResortMatch[0]);
            extractionMethod = 'regex_curly_braces';
            console.log('Successfully extracted JSON using curly brace matching');
          } catch (lastError) {
            console.error('Regex extraction failed:', lastError.message);
            console.log('Extracted regex match:', lastResortMatch[0].substring(0, 100));
            
            // One final attempt - try to clean up common JSON formatting issues
            try {
              // Replace single quotes with double quotes and fix common issues
              const cleanedText = lastResortMatch[0]
                .replace(/'/g, '"')
                .replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":') // Add quotes to keys
                .replace(/:\s*([a-zA-Z0-9_]+)\s*([,}])/g, ':"$1"$2'); // Add quotes to string values
              
              extractedJSON = JSON.parse(cleanedText);
              extractionMethod = 'cleaned_regex';
              console.log('Successfully parsed JSON after cleaning');
            } catch (cleaningError) {
              console.error('All JSON extraction methods failed');
              extractedJSON = null;
            }
          }
        } else {
          console.error('No JSON-like content found in response');
          extractedJSON = null;
        }
      }
    }
    
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
      
      if (extractedJSON.confidence && extractedJSON.confidence < 0.75) {
        console.warn(`Warning: Confidence level ${extractedJSON.confidence} is below threshold of 0.75`);
        result.warning = `Confidence below threshold: ${extractedJSON.confidence}`;
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
    const confidence = 0.75;
    
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
