/**
 * Service for calculating bet results based on scores and bet types
 */

export const resultCalculator = {
  /**
   * Determine the result of a bet based on the score and bet type
   * @param {Object} options - The bet and score details
   * @param {string} options.pick - The pick text (e.g., "Lakers -5.5")
   * @param {number} options.confidence - The confidence score from the original pick (0.0 to 1.0)
   * @param {string} options.score - The final score in format "AWAY-HOME"
   * @param {string} options.league - The league (NBA, NHL, etc.)
   * @returns {{result: string, confidence: number}} - The result and original confidence score
   */
  calculateResult: function({ pick, confidence, score, league = 'NBA' }) {
    // Validate inputs
    if (!pick) {
      throw new Error('Pick is required');
    }
    
    // Get confidence from the pick if not provided
    const pickConfidence = confidence !== undefined ? 
      Math.min(1, Math.max(0, Number(confidence) || 0.5)) : 
      this.getConfidence(pick);
    
    if (!score) {
      return { result: 'pending', confidence: pickConfidence };
    }

    try {
      // Parse the score
      const [awayScore, homeScore] = score.split('-').map(Number);
      
      // Extract team and spread from pick
      const { team, spread, isHome, isMoneyline } = this.parsePick(pick);
      
      // Get confidence from the pick
      const pickConfidence = this.getConfidence(pick);
      
      // If we can't parse the pick, return pending with default confidence
      if (!team) {
        return { result: 'pending', confidence: pickConfidence };
      }

      // Calculate the result with the determined confidence
      if (isMoneyline) {
        return this.calculateMoneylineResult(awayScore, homeScore, isHome, pickConfidence);
      } else {
        return this.calculateSpreadResult(awayScore, homeScore, spread, isHome, league, pickConfidence);
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
  calculateMoneylineResult: function(awayScore, homeScore, isHome, confidence) {
    const winner = homeScore > awayScore ? 'home' : 'away';
    const betOn = isHome ? 'home' : 'away';
    
    if (homeScore === awayScore) {
      return { result: 'push', confidence };
    }
    
    return {
      result: winner === betOn ? 'won' : 'lost',
      confidence
    };
  },

  /**
   * Calculate result for spread bets
   * @private
   */
  calculateSpreadResult: function(awayScore, homeScore, spread, isHome, league, confidence) {
    // Adjust the spread based on home/away
    const adjustedSpread = isHome ? -spread : spread;
    
    // Calculate the score difference from the perspective of the picked team
    const scoreDiff = isHome ? homeScore - awayScore : awayScore - homeScore;
    const spreadDiff = scoreDiff + adjustedSpread;
    
    // Handle push (exact spread hit)
    if (spreadDiff === 0) {
      return { result: 'push', confidence };
    }
    
    // Determine win/loss
    return {
      result: spreadDiff > 0 ? 'won' : 'lost',
      confidence
    };
  },
  
  /**
   * Get the confidence from a pick object
   * @param {Object|string} pick - The pick object or string
   * @returns {number} - The confidence score (0.0 to 1.0)
   */
  getConfidence: function(pick) {
    if (!pick) return 0.5;
    
    // If pick is a string, try to parse it for a confidence value
    if (typeof pick === 'string') {
      const confidenceMatch = pick.match(/\[([0-9.]+)%?\]/);
      if (confidenceMatch) {
        return Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]) / 100));
      }
      return 0.5; // Default confidence if not specified
    }
    
    // If pick is an object with a confidence property
    if (typeof pick === 'object' && pick !== null) {
      const conf = parseFloat(pick.confidence);
      return isNaN(conf) ? 0.5 : Math.min(1, Math.max(0, conf));
    }
    
    return 0.5; // Fallback default
  }
};

export default resultCalculator;
