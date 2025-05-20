// Import the OpenAI service correctly
import { openaiService } from './openaiService.js';

/**
 * Helper function to safely check if a string includes another string
 * Handles undefined, null, and non-string values
 * @param {string} str1 - The first string
 * @param {string} str2 - The second string
 * @returns {boolean} - True if str1 includes str2 or str2 includes str1
 */
const safeStringIncludes = (str1, str2) => {
  if (!str1 || !str2) return false;
  if (typeof str1 !== 'string' || typeof str2 !== 'string') return false;
  
  const safe1 = String(str1).toLowerCase();
  const safe2 = String(str2).toLowerCase();
  
  return safe1.includes(safe2) || safe2.includes(safe1);
};

/**
 * Service to analyze pick results and determine the correct outcome (won/lost/push)
 */
export const pickResultsAnalyzer = {
  /**
   * Safely check if a pick text indicates an OVER bet
   * @param {string} pickText - The pick text to check
   * @returns {boolean} - True if the pick is an OVER bet
   */
  isOverPick: (pickText) => {
    if (!pickText || typeof pickText !== 'string') return false;
    return pickText.toLowerCase().includes('over');
  },
  
  /**
   * Safely check if a pick text indicates an UNDER bet
   * @param {string} pickText - The pick text to check
   * @returns {boolean} - True if the pick is an UNDER bet
   */
  isUnderPick: (pickText) => {
    if (!pickText || typeof pickText !== 'string') return false;
    return pickText.toLowerCase().includes('under');
  },
  /**
   * Analyze a pick and the final game score to determine if the pick was a win, loss, or push
   * @param {Object} pick - The pick object from daily_picks
   * @param {Object} gameScore - The final game score data 
   * @returns {Object} The analyzed result with win/loss/push determination
   */
  analyzePickResult: async (pick, gameScore) => {
    try {
      console.log(`Analyzing pick result: ${pick.pick} with score: ${gameScore.away_score}-${gameScore.home_score}`);
      
      // First try to determine the result without calling OpenAI
      const result = pickResultsAnalyzer.determineResult(pick, gameScore);
      
      if (result.result && result.result !== 'unknown') {
        console.log(`Determined result without OpenAI: ${result.result}`);
        return result;
      }
      
      // If unable to determine result, use OpenAI as fallback
      console.log(`Unable to determine result automatically, using OpenAI`);
      return await pickResultsAnalyzer.analyzeWithOpenAI(pick, gameScore);
    } catch (error) {
      console.error('Error analyzing pick result:', error);
      return {
        pick_id: pick.id,
        game_date: pick.date,
        league: pick.league || gameScore.league,
        result: 'unknown',
        final_score: `${gameScore.away_score}-${gameScore.home_score}`,
        pick_text: pick.pick,
        matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
        confidence: pick.confidence
      };
    }
  },
  
  /**
   * Extract team name from a formatted pick string
   * @param {string} pickString - The formatted pick string (e.g., "Washington Capitals +1.5 -185")
   * @returns {string} The extracted team name
   */
  extractTeamName: (pickString) => {
    if (!pickString) return '';
    
    // Extract team name by removing betting elements
    let teamName = pickString;
    
    // Remove spread and odds: "Team +1.5 -110" -> "Team"
    teamName = teamName.replace(/\s+[+-]?\d+(\.\d+)?\s+[+-]\d+$/, '');
    
    // Remove ML and odds: "Team ML +110" -> "Team"
    teamName = teamName.replace(/\s+ML\s+[+-]\d+$/, '');
    
    // Remove just odds: "Team -110" -> "Team"
    teamName = teamName.replace(/\s+[+-]\d+$/, '');
    
    // Remove Over/Under terms
    teamName = teamName.replace(/\s+OVER\s+.*$/i, '');
    teamName = teamName.replace(/\s+UNDER\s+.*$/i, '');
    
    // Return the cleaned team name
    return teamName.trim();
  },
  
  /**
   * Determine the result of a pick based on the final score and pick details
   * @param {Object} pick - The pick object from daily_picks
   * @param {Object} gameScore - The final game score data
   * @returns {Object} The analyzed result with win/loss/push determination
   */
  determineResult: (pick, gameScore) => {
    // More comprehensive validation of game score data
    if (!gameScore) {
      console.warn('Game score data is null or undefined');
      return { result: 'unknown' };
    }
    
    // Check for missing scores
    if (gameScore.home_score === undefined || gameScore.home_score === null || 
        gameScore.away_score === undefined || gameScore.away_score === null) {
      console.warn(`Invalid game score data: home_score=${gameScore.home_score}, away_score=${gameScore.away_score}`);
      return { result: 'unknown' };
    }
    
    // Check for non-parseable scores
    const homeScore = parseInt(gameScore.home_score);
    const awayScore = parseInt(gameScore.away_score);
    if (isNaN(homeScore) || isNaN(awayScore)) {
      console.warn(`Non-numeric game scores: home_score=${gameScore.home_score}, away_score=${gameScore.away_score}`);
      return { result: 'unknown' };
    }
    
    // Get team names
    const homeTeam = gameScore.home_team;
    const awayTeam = gameScore.away_team;
    
    // Extract clean team name from the pick
    const extractedTeamName = pickResultsAnalyzer.extractTeamName(pick.pick);
    
    // Find which team was picked
    let pickedTeam = '';
    let isHomeTeamPicked = false;
    
    // First try to use the extracted team name
    if (extractedTeamName) {
      if (safeStringIncludes(homeTeam, extractedTeamName)) {
        pickedTeam = homeTeam;
        isHomeTeamPicked = true;
        console.log(`Matched extracted team name "${extractedTeamName}" to home team "${homeTeam}"`);
      } else if (safeStringIncludes(awayTeam, extractedTeamName)) {
        pickedTeam = awayTeam;
        isHomeTeamPicked = false;
        console.log(`Matched extracted team name "${extractedTeamName}" to away team "${awayTeam}"`);
      }
    }
    
    // If no match with extracted name, try original pick string
    if (!pickedTeam) {
      if (pick && pick.pick && safeStringIncludes(pick.pick, homeTeam)) {
        pickedTeam = homeTeam;
        isHomeTeamPicked = true;
      } else if (pick && pick.pick && safeStringIncludes(pick.pick, awayTeam)) {
        pickedTeam = awayTeam;
        isHomeTeamPicked = false;
      } else {
        console.warn(`Could not determine picked team for ${pick.pick}`);
        return { result: 'unknown' };
      }
    }
    
    let result = 'unknown';
    
    // Determine result based on bet type
    if (pick.type === 'moneyline' || !pick.type) {
      // Moneyline bet - straight up win/loss
      if (isHomeTeamPicked) {
        result = homeScore > awayScore ? 'won' : (homeScore === awayScore ? 'push' : 'lost');
      } else {
        result = awayScore > homeScore ? 'won' : (awayScore === homeScore ? 'push' : 'lost');
      }
    } 
    else if (pick.type === 'spread' && pick.spread) {
      // Spread bet
      const spread = parseFloat(pick.spread);
      
      if (isHomeTeamPicked) {
        // Home team with spread
        const adjScore = homeScore + spread;
        result = adjScore > awayScore ? 'won' : (adjScore === awayScore ? 'push' : 'lost');
      } else {
        // Away team with spread
        const adjScore = awayScore + spread;
        result = adjScore > homeScore ? 'won' : (adjScore === homeScore ? 'push' : 'lost');
      }
    }
    else if (pick.type === 'total' && pick.total) {
      // Total (over/under) bet
      const total = parseFloat(pick.total);
      const actualTotal = homeScore + awayScore;
      
      if (pickResultsAnalyzer.isOverPick(pick.pick)) {
        result = actualTotal > total ? 'won' : (actualTotal === total ? 'push' : 'lost');
      } else if (pickResultsAnalyzer.isUnderPick(pick.pick)) {
        result = actualTotal < total ? 'won' : (actualTotal === total ? 'push' : 'lost');
      }
    }
    
    // Return complete object for game_results table
    return {
      pick_id: pick.id,
      game_date: pick.date,
      league: pick.league || gameScore.league || 'Unknown',
      result: result,
      final_score: `${awayScore}-${homeScore}`,
      pick_text: pick.pick,
      matchup: `${awayTeam} @ ${homeTeam}`,
      confidence: pick.confidence || null
    };
  },
  
  /**
   * Use OpenAI to analyze a pick and determine if it won, lost, or pushed
   * @param {Object} pick - The pick object from daily_picks
   * @param {Object} gameScore - The final game score data
   * @returns {Object} The analyzed result with win/loss/push determination from OpenAI
   */
  analyzeWithOpenAI: async (pick, gameScore) => {
    // Extract team name from the formatted pick
    const extractedTeam = pickResultsAnalyzer.extractTeamName(pick.pick);
    
    // Parse the line (spread/total) and odds from the pick
    let line = '';
    let odds = '';
    let betType = pick.type || 'moneyline';
    
    // Try to extract line and odds from the pick format
    const spreadMatch = pick.pick.match(/([+-]\d+(\.\d+)?)\s+([+-]\d+)$/);
    const mlMatch = pick.pick.match(/ML\s+([+-]\d+)$/);
    
    if (spreadMatch) {
      line = spreadMatch[1]; // The spread value 
      odds = spreadMatch[3]; // The odds value
      betType = 'spread';
    } else if (mlMatch) {
      odds = mlMatch[1]; // The odds value
      betType = 'moneyline';
    }
    
    const prompt = `Analyze this sports betting pick and determine if it WON, LOST, or was a PUSH:

PICK: ${pick.pick}
EXTRACTED TEAM: ${extractedTeam}
PICK TYPE: ${betType}
${pick.spread || line ? `SPREAD: ${pick.spread || line}` : ''}
${pick.total ? `TOTAL: ${pick.total}` : ''}
${odds ? `ODDS: ${odds}` : ''}
GAME: ${gameScore.away_team} @ ${gameScore.home_team}
FINAL SCORE: ${gameScore.away_team} ${gameScore.away_score}, ${gameScore.home_team} ${gameScore.home_score}
DATE: ${pick.date}
LEAGUE: ${pick.league || gameScore.league || 'Unknown'}

Analyze if this pick won, lost or pushed based on the following rules:
1. For MONEYLINE bets: The bettor wins if their chosen team wins the game outright
2. For SPREAD bets: Apply the spread value to the chosen team's score to determine the result
3. For TOTAL bets: Compare the combined score to the over/under line

Respond with VALID JSON ONLY in this exact format:
{
  "result": "won|lost|push",
  "explanation": "Brief explanation of why this is a win/loss/push"
}`;

    try {
      // Use the correct method from the openaiService
      console.log('Calling OpenAI for bet result analysis');
      const response = await openaiService.generateResponse([
        {
          role: 'system',
          content: 'You are a sports betting expert who analyzes picks and determines if they won, lost, or pushed based on the final score and pick details. Respond with valid JSON only in the format specified.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        model: 'gpt-3.5-turbo-0125',
        temperature: 0.1,
        maxTokens: 500
      });
      
      // The response from openaiService.generateResponse might already be parsed or might be a string
      let analysis;
      
      if (typeof response === 'string') {
        try {
          // Try to parse if it's a string
          analysis = JSON.parse(response);
        } catch (e) {
          console.error('Failed to parse OpenAI response as JSON:', e);
          console.log('Raw response:', response);
          analysis = { result: 'unknown', explanation: 'Error parsing analysis' };
        }
      } else {
        // If it's already an object, use it directly
        analysis = response;
      }
      
      // Make sure analysis is not null/undefined
      if (!analysis) {
        analysis = { result: 'unknown', explanation: 'No analysis returned' };
      }
      
      // Make sure analysis.result is not null/undefined
      if (!analysis.result) {
        analysis.result = 'unknown';
      }
      
      // Validate that the result is one of the allowed values
      if (!['won', 'lost', 'push'].includes(analysis.result)) {
        console.warn(`OpenAI returned invalid result: ${analysis?.result || 'undefined'}, defaulting to unknown`);
        analysis.result = 'unknown';
      }
      
      // Return complete object for game_results table
      return {
        pick_id: pick.id,
        game_date: pick.date,
        league: pick.league || gameScore.league || 'Unknown',
        result: analysis.result,
        final_score: `${gameScore.away_score}-${gameScore.home_score}`,
        pick_text: pick.pick,
        matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
        confidence: pick.confidence || null,
        explanation: analysis.explanation // Not stored in DB but useful for debugging
      };
    } catch (error) {
      console.error('Error analyzing with OpenAI:', error);
      // If OpenAI call fails, we need a fallback to determine the result
      // For moneyline: if team won, result is 'won', if team lost, result is 'lost'
      // For spread: if actual spread meets the pick, result is 'won', else 'lost'
      // Make a basic determination based on scores
      try {
        if (betType === 'moneyline' || betType === 'ML') {
          const homeScore = parseInt(gameScore.home_score);
          const awayScore = parseInt(gameScore.away_score);
          const homeTeam = gameScore.home_team;
          const awayTeam = gameScore.away_team;
          const extractedTeamName = pickResultsAnalyzer.extractTeamName(pick.pick);
          let pickedTeam = '';
          let isHomeTeamPicked = false;
          if (extractedTeamName) {
            if (safeStringIncludes(homeTeam, extractedTeamName)) {
              pickedTeam = homeTeam;
              isHomeTeamPicked = true;
            } else if (safeStringIncludes(awayTeam, extractedTeamName)) {
              pickedTeam = awayTeam;
              isHomeTeamPicked = false;
            }
          }
          if (!pickedTeam) {
            if (pick && pick.pick && safeStringIncludes(pick.pick, homeTeam)) {
              pickedTeam = homeTeam;
              isHomeTeamPicked = true;
            } else if (pick && pick.pick && safeStringIncludes(pick.pick, awayTeam)) {
              pickedTeam = awayTeam;
              isHomeTeamPicked = false;
            } else {
              console.warn(`Could not determine picked team for ${pick.pick}`);
              return { result: 'unknown' };
            }
          }
          if (isHomeTeamPicked) {
            return { 
              pick_id: pick.id,
              game_date: pick.date,
              league: pick.league || gameScore.league || 'Unknown',
              result: homeScore > awayScore ? 'won' : (homeScore < awayScore ? 'lost' : 'push'),
              final_score: `${gameScore.away_score}-${gameScore.home_score}`,
              pick_text: pick.pick,
              matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
              confidence: pick.confidence || null
            };
          } else {
            return { 
              pick_id: pick.id,
              game_date: pick.date,
              league: pick.league || gameScore.league || 'Unknown',
              result: awayScore > homeScore ? 'won' : (awayScore < homeScore ? 'lost' : 'push'),
              final_score: `${gameScore.away_score}-${gameScore.home_score}`,
              pick_text: pick.pick,
              matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
              confidence: pick.confidence || null
            };
          }
        } else if (betType === 'spread' && line) {
          const spreadValue = parseFloat(line);
          const homeScore = parseInt(gameScore.home_score);
          const awayScore = parseInt(gameScore.away_score);
          const homeTeam = gameScore.home_team;
          const awayTeam = gameScore.away_team;
          const extractedTeamName = pickResultsAnalyzer.extractTeamName(pick.pick);
          let pickedTeam = '';
          let isHomeTeamPicked = false;
          if (extractedTeamName) {
            if (safeStringIncludes(homeTeam, extractedTeamName)) {
              pickedTeam = homeTeam;
              isHomeTeamPicked = true;
            } else if (safeStringIncludes(awayTeam, extractedTeamName)) {
              pickedTeam = awayTeam;
              isHomeTeamPicked = false;
            }
          }
          if (!pickedTeam) {
            if (pick && pick.pick && safeStringIncludes(pick.pick, homeTeam)) {
              pickedTeam = homeTeam;
              isHomeTeamPicked = true;
            } else if (pick && pick.pick && safeStringIncludes(pick.pick, awayTeam)) {
              pickedTeam = awayTeam;
              isHomeTeamPicked = false;
            } else {
              console.warn(`Could not determine picked team for ${pick.pick}`);
              return { result: 'unknown' };
            }
          }
          if (isHomeTeamPicked) {
            const adjustedScore = homeScore + spreadValue;
            return { 
              pick_id: pick.id,
              game_date: pick.date,
              league: pick.league || gameScore.league || 'Unknown',
              result: adjustedScore > awayScore ? 'won' : (adjustedScore < awayScore ? 'lost' : 'push'),
              final_score: `${gameScore.away_score}-${gameScore.home_score}`,
              pick_text: pick.pick,
              matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
              confidence: pick.confidence || null
            };
          } else {
            const adjustedScore = awayScore + spreadValue;
            return { 
              pick_id: pick.id,
              game_date: pick.date,
              league: pick.league || gameScore.league || 'Unknown',
              result: adjustedScore > homeScore ? 'won' : (adjustedScore < homeScore ? 'lost' : 'push'),
              final_score: `${gameScore.away_score}-${gameScore.home_score}`,
              pick_text: pick.pick,
              matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
              confidence: pick.confidence || null
            };
          }
        } else if (betType === 'total' && pick.total) {
          const totalValue = parseFloat(pick.total);
          const gameTotal = parseInt(gameScore.home_score) + parseInt(gameScore.away_score);
          const isOver = pickResultsAnalyzer.isOverPick(pick.pick);
          const isUnder = pickResultsAnalyzer.isUnderPick(pick.pick);
          if (isOver) {
            return { 
              pick_id: pick.id,
              game_date: pick.date,
              league: pick.league || gameScore.league || 'Unknown',
              result: gameTotal > totalValue ? 'won' : (gameTotal < totalValue ? 'lost' : 'push'),
              final_score: `${gameScore.away_score}-${gameScore.home_score}`,
              pick_text: pick.pick,
              matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
              confidence: pick.confidence || null
            };
          } else if (isUnder) { 
            return { 
              pick_id: pick.id,
              game_date: pick.date,
              league: pick.league || gameScore.league || 'Unknown',
              result: gameTotal < totalValue ? 'won' : (gameTotal > totalValue ? 'lost' : 'push'),
              final_score: `${gameScore.away_score}-${gameScore.home_score}`,
              pick_text: pick.pick,
              matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
              confidence: pick.confidence || null
            };
          }
        }
        
        // If we couldn't determine anything, use a best guess based on score
        const homeScore = parseInt(gameScore.home_score);
        const awayScore = parseInt(gameScore.away_score);
        const homeTeam = gameScore.home_team;
        const awayTeam = gameScore.away_team;
        const extractedTeamName = pickResultsAnalyzer.extractTeamName(pick.pick);
        let pickedTeam = '';
        let isHomeTeamPicked = false;
        if (extractedTeamName) {
          if (safeStringIncludes(homeTeam, extractedTeamName)) {
            pickedTeam = homeTeam;
            isHomeTeamPicked = true;
          } else if (safeStringIncludes(awayTeam, extractedTeamName)) {
            pickedTeam = awayTeam;
            isHomeTeamPicked = false;
          }
        }
        if (!pickedTeam) {
          if (pick && pick.pick && safeStringIncludes(pick.pick, homeTeam)) {
            pickedTeam = homeTeam;
            isHomeTeamPicked = true;
          } else if (pick && pick.pick && safeStringIncludes(pick.pick, awayTeam)) {
            pickedTeam = awayTeam;
            isHomeTeamPicked = false;
          } else {
            console.warn(`Could not determine picked team for ${pick.pick}`);
            return { result: 'unknown' };
          }
        }
        if (isHomeTeamPicked) {
          return { 
            pick_id: pick.id,
            game_date: pick.date,
            league: pick.league || gameScore.league || 'Unknown',
            result: homeScore > awayScore ? 'won' : (homeScore < awayScore ? 'lost' : 'push'),
            final_score: `${gameScore.away_score}-${gameScore.home_score}`,
            pick_text: pick.pick,
            matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
            confidence: pick.confidence || null
          };
        } else {
          return { 
            pick_id: pick.id,
            game_date: pick.date,
            league: pick.league || gameScore.league || 'Unknown',
            result: awayScore > homeScore ? 'won' : (awayScore < homeScore ? 'lost' : 'push'),
            final_score: `${gameScore.away_score}-${gameScore.home_score}`,
            pick_text: pick.pick,
            matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
            confidence: pick.confidence || null
          };
        }
      } catch (fallbackError) {
        console.error('Error in fallback result determination:', fallbackError);
        return { 
          pick_id: pick.id,
          game_date: pick.date,
          league: pick.league || gameScore.league || 'Unknown',
          result: 'unknown',
          final_score: `${gameScore.away_score}-${gameScore.home_score}`,
          pick_text: pick.pick,
          matchup: `${gameScore.away_team} @ ${gameScore.home_team}`,
          confidence: pick.confidence || null
        };
      }
    }
  }
};
