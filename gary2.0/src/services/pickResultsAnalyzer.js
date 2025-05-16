import { openaiService } from './openaiService.js';

/**
 * Service to analyze pick results and determine the correct outcome (won/lost/push)
 */
export const pickResultsAnalyzer = {
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
    if (!gameScore || !gameScore.home_score || !gameScore.away_score) {
      console.warn('Invalid game score data');
      return { result: 'unknown' };
    }
    
    const homeScore = parseInt(gameScore.home_score);
    const awayScore = parseInt(gameScore.away_score);
    const homeTeam = gameScore.home_team;
    const awayTeam = gameScore.away_team;
    
    // Extract clean team name from the pick
    const extractedTeamName = pickResultsAnalyzer.extractTeamName(pick.pick);
    
    // Find which team was picked
    let pickedTeam = '';
    let isHomeTeamPicked = false;
    
    // First try to use the extracted team name
    if (extractedTeamName) {
      if (homeTeam.includes(extractedTeamName) || extractedTeamName.includes(homeTeam)) {
        pickedTeam = homeTeam;
        isHomeTeamPicked = true;
        console.log(`Matched extracted team name "${extractedTeamName}" to home team "${homeTeam}"`);
      } else if (awayTeam.includes(extractedTeamName) || extractedTeamName.includes(awayTeam)) {
        pickedTeam = awayTeam;
        isHomeTeamPicked = false;
        console.log(`Matched extracted team name "${extractedTeamName}" to away team "${awayTeam}"`);
      }
    }
    
    // If no match with extracted name, try original pick string
    if (!pickedTeam) {
      if (pick.pick.includes(homeTeam)) {
        pickedTeam = homeTeam;
        isHomeTeamPicked = true;
      } else if (pick.pick.includes(awayTeam)) {
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
      
      if (pick.pick.toLowerCase().includes('over')) {
        result = actualTotal > total ? 'won' : (actualTotal === total ? 'push' : 'lost');
      } else if (pick.pick.toLowerCase().includes('under')) {
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
      const response = await openaiService.getCompletion({
        model: 'gpt-3.5-turbo-0125',
        messages: [
          {
            role: 'system',
            content: 'You are a sports betting expert who analyzes picks and determines if they won, lost, or pushed based on the final score and pick details. Respond with valid JSON only in the format specified.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });
      
      let analysis;
      try {
        analysis = JSON.parse(response);
      } catch (e) {
        console.error('Failed to parse OpenAI response as JSON:', e);
        console.log('Raw response:', response);
        analysis = { result: 'unknown', explanation: 'Error parsing analysis' };
      }
      
      // Validate that the result is one of the allowed values
      if (!['won', 'lost', 'push'].includes(analysis.result)) {
        console.warn(`OpenAI returned invalid result: ${analysis.result}, defaulting to unknown`);
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
};
