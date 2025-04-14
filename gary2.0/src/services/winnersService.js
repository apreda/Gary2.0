import { oddsService } from './oddsService';

/**
 * Service for managing Gary's winning picks history
 */
export const winnersService = {
  /**
   * Add a new winning pick to history
   * @param {Object} pick - The winning pick to add
   * @returns {Promise<void>}
   */
  addWinningPick: async (pick) => {
    try {
      // Get existing winners from localStorage
      const existingWinners = await winnersService.getWinningPicks();
      
      // Add timestamp to the pick
      const winningPick = {
        ...pick,
        timestamp: new Date().toISOString(),
        result: {
          outcome: 'WIN',
          final_score: pick.finalScore || 'Not available' // If available from outcome API
        }
      };
      
      // Add new winner to the beginning of the array
      existingWinners.unshift(winningPick);
      
      // Keep only the last 50 winners to prevent localStorage from growing too large
      const trimmedWinners = existingWinners.slice(0, 50);
      
      // Save to localStorage
      localStorage.setItem('garyWinningPicks', JSON.stringify(trimmedWinners));
      
      return winningPick;
    } catch (error) {
      console.error('Error adding winning pick:', error);
      throw error;
    }
  },
  
  /**
   * Get all winning picks history
   * @param {number} limit - Maximum number of picks to return
   * @returns {Promise<Array>} - Array of winning picks
   */
  getWinningPicks: async (limit = 50) => {
    try {
      // Get from localStorage
      const storedWinners = localStorage.getItem('garyWinningPicks');
      
      if (storedWinners) {
        const winners = JSON.parse(storedWinners);
        return winners.slice(0, limit);
      }
      
      return winnersService.getMockWinners();
    } catch (error) {
      console.error('Error getting winning picks:', error);
      return winnersService.getMockWinners();
    }
  },
  
  /**
   * Mock function to mark a pick as a winner (normally would verify against actual game results)
   * In a real implementation, this would check the actual game outcome
   * @param {Object} pick - The pick to mark as a winner
   * @param {string} finalScore - The final score of the game
   * @returns {Promise<Object>} - The updated winning pick
   */
  markPickAsWinner: async (pick, finalScore) => {
    try {
      // In a real implementation, this would verify the pick against actual game results
      // For now, we'll just mark it as a winner with the provided final score
      const winningPick = {
        ...pick,
        finalScore
      };
      
      return await winnersService.addWinningPick(winningPick);
    } catch (error) {
      console.error('Error marking pick as winner:', error);
      throw error;
    }
  },
  
  /**
   * Get mock winning picks in case no real data is available
   * @returns {Array} - Array of mock winning picks
   */
  getMockWinners: () => {
    // Create dates for the mock data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    return [
      {
        id: 101,
        league: "NBA",
        game: "Celtics vs Knicks",
        pick: "Celtics -4.5",
        pickDetail: "The Celtics are clicking on all cylinders lately. Their defense is ELITE and the Knicks simply don't have the firepower to keep up.",
        result: {
          outcome: "WIN",
          final_score: "112-97"
        },
        confidenceLevel: 87,
        timestamp: yesterday.toISOString()
      },
      {
        id: 102,
        league: "MLB",
        game: "Yankees vs Red Sox",
        pick: "Yankees ML",
        pickDetail: "Yankees own the Red Sox this season. PERIOD. This is the closest thing to free money you'll ever see.",
        result: {
          outcome: "WIN",
          final_score: "8-3"
        },
        confidenceLevel: 78,
        timestamp: twoDaysAgo.toISOString()
      },
      {
        id: 103,
        league: "NFL",
        game: "Chiefs vs Ravens",
        pick: "Chiefs -3",
        pickDetail: "Mahomes in prime time is automatic money. Chiefs not only cover, they dominate.",
        result: {
          outcome: "WIN",
          final_score: "27-20"
        },
        confidenceLevel: 92,
        timestamp: fourDaysAgo.toISOString()
      },
      {
        id: 104,
        league: "NHL",
        game: "Bruins vs Rangers",
        pick: "Over 5.5",
        pickDetail: "Both teams' goaltending has been suspect lately while the offenses have been firing. This goes OVER without breaking a sweat.",
        result: {
          outcome: "WIN",
          final_score: "4-3"
        },
        confidenceLevel: 81,
        timestamp: fiveDaysAgo.toISOString()
      },
      {
        id: 105,
        league: "EURO",
        game: "Man City vs Arsenal",
        pick: "Man City -1.5",
        pickDetail: "City at home with everything on the line? Pure class will show up. City takes this one in a dominant performance.",
        result: {
          outcome: "WIN",
          final_score: "3-1"
        },
        confidenceLevel: 85,
        timestamp: oneWeekAgo.toISOString()
      },
      {
        id: 106,
        league: "PARLAY",
        game: "3-Leg Parlay",
        pick: "Lakers ML + Cowboys -7 + Dodgers/Giants U8.5",
        pickDetail: "This parlay combines my HIGHEST CONVICTION picks across leagues. This combination gives us a juicy +650 payout potential.",
        result: {
          outcome: "WIN",
          final_score: "All legs hit"
        },
        confidenceLevel: 65,
        timestamp: oneWeekAgo.toISOString(),
        parlayOdds: "+650"
      }
    ];
  }
};
