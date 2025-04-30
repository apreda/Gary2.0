/**
 * Gary Engine - The core analysis and betting recommendation system
 * @module garyEngine
 */
import { openaiService } from './openaiService.js';

/**
 * Generate Gary's analysis for a specific game
 * Uses OpenAI to analyze the game data and provide betting recommendations
 * @param {object} gameData - The data for the game to analyze
 * @param {object} options - Optional parameters
 * @returns {Promise<object>} - Gary's analysis
 */
export async function generateGaryAnalysis(gameData, options = {}) {
  console.log('\n🎲 GARY ENGINE: Analyzing game...', { 
    gameId: gameData?.id,
    league: gameData?.league,
    matchup: gameData?.matchup || `${gameData?.homeTeam || ''} vs ${gameData?.awayTeam || ''}` 
  });
  
  try {
    // 1. Format the game data for analysis
    const formattedData = formatGameData(gameData);
    
    // 2. Get the latest news from perplexity or other real-time sources
    // This can be customized based on the sport & league
    let newsData = '';
    if (options.newsData) {
      newsData = options.newsData;
    } else if (options.skipNews) {
      newsData = 'No real-time news available. Analysis based on provided stats only.';
    } else {
      newsData = await fetchRealTimeContext(formattedData);
    }
    
    // 3. Generate analysis using OpenAI
    const rawOpenAIResponse = await openaiService.generateGaryAnalysis(
      formattedData, 
      newsData,
      {
        temperature: options.temperature || 0.7,
        model: options.model
      }
    );
    
    // Log the raw response for troubleshooting
    console.log('\n🔍 RAW OPENAI RESPONSE:\n', rawOpenAIResponse);
    
    // 4. Extract JSON content from the response
    let extractedJSON;
    try {
      // First try to parse the entire response as JSON
      extractedJSON = JSON.parse(rawOpenAIResponse);
      console.log('✅ Full response parsed as valid JSON');
    } catch (parseError) {
      // If that fails, try to extract JSON from markdown code blocks
      console.log('Attempting to extract JSON from markdown...');
      const jsonMatch = rawOpenAIResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          extractedJSON = JSON.parse(jsonMatch[1]);
          console.log('✅ Successfully extracted JSON from markdown code block');
        } catch (nestedError) {
          console.error('❌ Failed to parse extracted content as JSON:', nestedError.message);
          extractedJSON = null;
        }
      } else {
        // Last resort - try to find anything that looks like JSON with curly braces
        const lastResortMatch = rawOpenAIResponse.match(/\{[\s\S]*\}/);
        if (lastResortMatch) {
          try {
            extractedJSON = JSON.parse(lastResortMatch[0]);
            console.log('✅ Successfully extracted JSON using curly brace matching');
          } catch (lastError) {
            console.error('❌ All JSON extraction methods failed');
            extractedJSON = null;
          }
        } else {
          console.error('❌ No JSON-like content found in response');
          extractedJSON = null;
        }
      }
    }
    
    // Log the extracted JSON for debugging
    if (extractedJSON) {
      console.log('\n📊 EXTRACTED JSON CONTENT:\n', extractedJSON);
    } else {
      console.error('❌ Failed to extract valid JSON from OpenAI response');
    }
    
    // 5. Create the result object with the parsed JSON
    const result = {
      success: !!extractedJSON,
      message: extractedJSON ? 'Analysis completed successfully' : 'Failed to generate valid analysis',
      rawOpenAIOutput: extractedJSON,
      game: formattedData.game || `${formattedData.homeTeam} vs ${formattedData.awayTeam}`,
      sport: formattedData.sport,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n✅ PARSED JSON OUTPUT: ', result.rawOpenAIOutput);
    
    return result;
  } catch (error) {
    console.error('\n❌ Error in Gary Engine:', error);
    return {
      success: false,
      message: `Error: ${error.message}`,
      rawOpenAIOutput: null
    };
  }
}

/**
 * Format game data for analysis
 * @param {object} gameData - Raw game data
 * @returns {object} - Formatted game data
 */
export function formatGameData(gameData) {
  // Return a clean copy if it's already formatted
  if (gameData && gameData.homeTeam && gameData.awayTeam && gameData.sport) {
    return { ...gameData };
  }
  
  // Format the data based on available properties
  return {
    game: gameData?.matchup || `${gameData?.homeTeam || ''} vs ${gameData?.awayTeam || ''}`,
    homeTeam: gameData?.homeTeam || '',
    awayTeam: gameData?.awayTeam || '',
    sport: gameData?.league || gameData?.sport || '',
    odds: gameData?.odds || null,
    teamStats: gameData?.teamStats || null,
    lineMovement: gameData?.lineMovement || null,
    preferences: gameData?.preferences || {}
  };
}

/**
 * Fetch real-time context for a game
 * This is a placeholder for a more sophisticated implementation
 * @param {object} gameData - Formatted game data
 * @returns {Promise<string>} - Real-time context
 */
export async function fetchRealTimeContext(gameData) {
  // This would typically call a service that fetches news, injury reports, etc.
  return `Latest context for ${gameData.homeTeam} vs ${gameData.awayTeam}:\n` +
    `- Recent form, injury reports, and game-time conditions would appear here\n` +
    `- This would be customized based on the sport (${gameData.sport})\n` +
    `- In a production environment, this would come from a news API or similar source`;
}

/**
 * Calculate stake amount based on confidence and bet type
 * @param {object} pick - The pick object with confidence and type
 * @returns {number} - Recommended stake amount
 */
export function calculateStake(pick) {
  if (!pick) return 0;
  
  // Map OpenAI's bet types to our internal types
  const typeMap = {
    'moneyline': 'straight_moneyline',
    'spread': 'spread',
    'total': 'spread',
  };
  
  try {
    // Convert confidence to a number if it's a string
    let confidence = pick.confidence;
    if (typeof confidence === 'string') {
      confidence = parseFloat(confidence);
    }
    
    // Default to 75% confidence if invalid
    if (isNaN(confidence)) {
      console.log('Invalid confidence value, using default of 0.75');
      confidence = 0.75;
    }
    
    // Map pick.type to our internal betting types
    const betType = typeMap[pick.type] || pick.type || 'straight_moneyline';
    
    // Calculate stake based on confidence
    const baseStake = 100;
    return Math.round(baseStake * confidence);
  } catch (error) {
    console.error('Error calculating stake:', error);
    return 100; // Default
  }
}

/**
 * Function that simply returns the raw OpenAI output without any transformations
 * @param {object} analysisObject - The object from generateGaryAnalysis
 * @returns {object} - The raw OpenAI output directly
 */
export function parseGaryAnalysis(analysisObject) {
  try {
    // Just log what we're receiving for debugging
    console.log('\n🧪 parseGaryAnalysis input:', {
      hasAnalysisObject: !!analysisObject,
      objectType: analysisObject ? typeof analysisObject : 'undefined',
      hasRawOpenAIOutput: !!analysisObject?.rawOpenAIOutput
    });
    
    // Early return if nothing was passed
    if (!analysisObject) {
      console.log('No analysis object received, returning null');
      return null;
    }
    
    // If we have the raw OpenAI output, return it directly
    if (analysisObject.rawOpenAIOutput) {
      console.log('\n📊 Returning raw OpenAI output directly without transformation');
      return analysisObject.rawOpenAIOutput;
    }
    
    // If the analysisObject is itself the raw output
    if (typeof analysisObject === 'object' && analysisObject.pick) {
      console.log('\n📊 Returning analysisObject directly as it appears to be raw OpenAI data');
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
