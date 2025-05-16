/**
 * Service for calculating bet results based on scores and bet types
 */

export const resultCalculator = {
  /**
   * Determine the result of a bet based on the score and bet type
   * @param {Object} options - The bet and score details
   * @param {string} options.pick - The pick text (e.g., "Lakers -5.5")
   * @param {string} options.score - The final score in format "AWAY-HOME"
   * @param {string} options.league - The league (NBA, NHL, etc.)
   * @returns {{result: string, confidence: number}} - The result and confidence score
   */
  calculateResult: function({ pick, score, league = 'NBA' }) {
    if (!pick || !score) {
      return { result: 'push', confidence: 0 };
    }

    try {
      // Parse the score
      const [awayScore, homeScore] = score.split('-').map(Number);
      
      // Extract team and spread from pick
      const { team, spread, isHome, isMoneyline } = this.parsePick(pick);
      
      // If we can't parse the pick, return push
      if (!team) {
        return { result: 'push', confidence: 0 };
      }

      // Calculate the result
      if (isMoneyline) {
        return this.calculateMoneylineResult(awayScore, homeScore, isHome);
      } else {
        return this.calculateSpreadResult(awayScore, homeScore, spread, isHome, league);
      }
    } catch (error) {
      console.error('Error calculating result:', error);
      return { result: 'push', confidence: 0 };
    }
  },

  /**
   * Parse the pick string to extract team and spread information
   * @private
   */
  parsePick: function(pick) {
    // Handle moneyline bets (e.g., "Lakers ML")
    if (pick.toUpperCase().includes(' ML')) {
      const team = pick.replace(/\s*ML.*/i, '').trim();
      return { team, isMoneyline: true, isHome: pick.includes('@') };
    }

    // Handle spread bets (e.g., "Lakers -5.5")
    const spreadMatch = pick.match(/^([^\d+-]+)([+-]?\d+(?:\.\d+)?)/);
    if (spreadMatch) {
      const team = spreadMatch[1].trim();
      const spread = parseFloat(spreadMatch[2]);
      return { team, spread, isHome: pick.includes('@') };
    }

    // Default to moneyline if we can't parse
    return { team: pick, isMoneyline: true, isHome: pick.includes('@') };
  },

  /**
   * Calculate result for moneyline bets
   * @private
   */
  calculateMoneylineResult: function(awayScore, homeScore, isHome) {
    const winner = homeScore > awayScore ? 'home' : 'away';
    const betOn = isHome ? 'home' : 'away';
    
    if (homeScore === awayScore) {
      return { result: 'push', confidence: 1 };
    }
    
    return {
      result: winner === betOn ? 'won' : 'lost',
      confidence: 1
    };
  },

  /**
   * Calculate result for spread bets
   * @private
   */
  calculateSpreadResult: function(awayScore, homeScore, spread, isHome, league) {
    // Adjust the spread based on home/away
    const adjustedSpread = isHome ? -spread : spread;
    
    // Calculate the score difference from the perspective of the picked team
    const scoreDiff = isHome ? homeScore - awayScore : awayScore - homeScore;
    const spreadDiff = scoreDiff + adjustedSpread;
    
    // Handle push (exact spread hit)
    if (spreadDiff === 0) {
      return { result: 'push', confidence: 1 };
    }
    
    // Determine win/loss
    return {
      result: spreadDiff > 0 ? 'won' : 'lost',
      confidence: 1
    };
  }
};

export default resultCalculator;
