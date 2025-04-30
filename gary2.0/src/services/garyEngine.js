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
  console.log('GARY ENGINE: Analyzing game...');
  
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
    
    // Simple placeholder for news data
    const newsData = options.newsData || 'Using stats-only analysis.';
    
    // Generate analysis using OpenAI
    const rawOpenAIResponse = await openaiService.generateGaryAnalysis(
      formattedData, 
      newsData,
      {
        temperature: options.temperature || 0.7,
        model: options.model
      }
    );
    
    // Log the raw response for troubleshooting
    console.log('RAW OPENAI RESPONSE:', rawOpenAIResponse);
    
    // Extract JSON content from the response
    let extractedJSON;
    try {
      // First try to parse the entire response as JSON
      extractedJSON = JSON.parse(rawOpenAIResponse);
      console.log('Full response parsed as valid JSON');
    } catch (parseError) {
      // If that fails, try to extract JSON from markdown code blocks
      console.log('Attempting to extract JSON from markdown...');
      const jsonMatch = rawOpenAIResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          extractedJSON = JSON.parse(jsonMatch[1]);
          console.log('Successfully extracted JSON from markdown code block');
        } catch (nestedError) {
          console.error('Failed to parse extracted content as JSON:', nestedError.message);
          extractedJSON = null;
        }
      } else {
        // Last resort - try to find anything that looks like JSON with curly braces
        const lastResortMatch = rawOpenAIResponse.match(/\{[\s\S]*\}/);
        if (lastResortMatch) {
          try {
            extractedJSON = JSON.parse(lastResortMatch[0]);
            console.log('Successfully extracted JSON using curly brace matching');
          } catch (lastError) {
            console.error('All JSON extraction methods failed');
            extractedJSON = null;
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
      message: extractedJSON ? 'Analysis completed successfully' : 'Failed to generate valid analysis',
      rawOpenAIOutput: extractedJSON,
      game: formattedData.game,
      sport: formattedData.sport,
      timestamp: new Date().toISOString()
    };
    
    console.log('PARSED JSON OUTPUT:', result.rawOpenAIOutput);
    
    return result;
  } catch (error) {
    console.error('Error in Gary Engine:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      rawOpenAIOutput: null
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
