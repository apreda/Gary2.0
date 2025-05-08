import { winnersService } from './winnersService';
import { oddsService } from './oddsService';
import { betTrackingService } from './betTrackingService';
import { supabase } from '../supabaseClient';

/**
 * Service to manage game results and update the status of picks
 */
export const resultsService = {
  /**
   * Initialize the results checking service
   * Starts polling for game results
   */
  initialize: () => {
    // Start checking for results every 5 minutes
    resultsService.startPolling();
    
    console.log('Results service initialized');
  },
  
  /**
   * Start polling for game results
   */
  startPolling: () => {
    // Check immediately on start
    resultsService.checkResults();
    
    // Then set up interval for every 5 minutes
    const pollingInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
    const intervalId = setInterval(() => {
      resultsService.checkResults();
    }, pollingInterval);
    
    // Store the interval ID in localStorage so we can clear it if needed
    localStorage.setItem('resultsPollingIntervalId', intervalId.toString());
  },
  
  /**
   * Stop polling for game results
   */
  stopPolling: () => {
    const intervalId = localStorage.getItem('resultsPollingIntervalId');
    if (intervalId) {
      clearInterval(parseInt(intervalId));
      localStorage.removeItem('resultsPollingIntervalId');
    }
  },
  
  /**
   * Check results for current picks
   */
  checkResults: async () => {
    try {
      // Get today's picks
      const todayPicksJson = localStorage.getItem('dailyPicks');
      if (!todayPicksJson) {
        console.log('No picks found for today');
        return;
      }
      
      const todayPicks = JSON.parse(todayPicksJson);
      
      // Track if any updates were made
      let updatesDetected = false;
      
      // Check each pick for results
      const updatedPicks = await Promise.all(todayPicks.map(async (pick) => {
        // Skip if the pick already has a result
        if (pick.result && pick.result !== 'pending') {
          return pick;
        }
        
        // Get the current time and the scheduled game time
        const now = new Date();
        const gameTime = new Date(pick.rawTime || pick.time);
        
        // Add estimated game duration (3 hours) to determine if the game should be over
        const estimatedEndTime = new Date(gameTime);
        estimatedEndTime.setHours(estimatedEndTime.getHours() + 3);
        
        // Only check games that should be finished
        if (now < estimatedEndTime) {
          return pick; // Game likely not finished yet
        }
        
        // Check if results are available from the API
        const gameResult = await resultsService.fetchGameResult(pick);
        
        if (gameResult) {
          updatesDetected = true;
          
          // Update the pick with the result
          const updatedPick = {
            ...pick,
            result: gameResult.outcome, // 'WIN', 'LOSS', or 'PUSH'
            finalScore: gameResult.final_score,
            resultCheckedAt: now.toISOString()
          };
          
          // If it's a winning pick, add it to the winners history
          if (gameResult.outcome === 'WIN') {
            await winnersService.addWinningPick(updatedPick);
          }
          
          // Update bet tracking for all users who bet on this pick
          const { data: currentAuth } = await supabase.auth.getSession();
          const currentUser = currentAuth?.session?.user;
          
          // Update current user's bet locally if logged in
          if (currentUser) {
            await betTrackingService.updateBetResult(pick.id, gameResult.outcome, currentUser.id);
          }
          
          // Update all users' bets in Supabase who bet on this pick
          try {
            const { data: userPicks } = await supabase
              .from('user_picks')
              .select('user_id, decision')
              .eq('pick_id', pick.id);
                
            if (userPicks && userPicks.length > 0) {
              console.log(`Updating bet results for ${userPicks.length} users who bet on pick ${pick.id}`);
              
              for (const userPick of userPicks) {
                // Only update if not the current user (already updated above)
                if (currentUser && userPick.user_id === currentUser.id) continue;
                
                await betTrackingService.updateBetResult(pick.id, gameResult.outcome, userPick.user_id);
              }
            }
          } catch (error) {
            console.error('Error updating user bet results:', error);
          }
          
          return updatedPick;
        }
        
        return pick;
      }));
      
      // If any updates were made, save the updated picks
      if (updatesDetected) {
        localStorage.setItem('dailyPicks', JSON.stringify(updatedPicks));
        console.log('Updated picks with game results');
      }
    } catch (error) {
      console.error('Error checking results:', error);
    }
  },
  
  /**
   * Fetch the result of a game from the API
   * @param {Object} pick - The pick to check result for
   * @returns {Object|null} - The game result if available, null otherwise
   */
  fetchGameResult: async (pick) => {
    try {
      // In production, this would make an API call to get real results
      // For now, use the Odds API to check if the game has ended
      
      // Extract relevant information from the pick
      const { sport, gameId } = pick;
      
      if (!sport || !gameId) {
        return null; // Skip picks without proper identifiers
      }
      
      // Try to get the game from the Odds API
      const events = await oddsService.getEvents(sport);
      const game = events.find(event => event.id === gameId);
      
      // If the game is not found, it might have concluded
      // For demo purposes, simulate results
      
      // Get current time and game time
      const now = new Date();
      const gameTime = new Date(pick.rawTime || pick.time);
      
      // Add estimated game duration
      const estimatedEndTime = new Date(gameTime);
      estimatedEndTime.setHours(estimatedEndTime.getHours() + 3);
      
      // Only generate a result if the game should be over
      if (now > estimatedEndTime) {
        // For demonstration, randomly determine if Gary's pick was correct
        // In production, this would be based on actual API data
        const outcomes = ['WIN', 'LOSS'];
        const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        
        // Generate a realistic final score based on the sport
        let finalScore;
        if (sport === 'basketball_nba') {
          const homeScore = 90 + Math.floor(Math.random() * 40);
          const awayScore = 90 + Math.floor(Math.random() * 40);
          finalScore = `${pick.awayTeam || 'Away'} ${awayScore} - ${homeScore} ${pick.homeTeam || 'Home'}`;
        } else if (sport === 'baseball_mlb') {
          const homeScore = Math.floor(Math.random() * 10);
          const awayScore = Math.floor(Math.random() * 10);
          finalScore = `${pick.awayTeam || 'Away'} ${awayScore} - ${homeScore} ${pick.homeTeam || 'Home'}`;
        } else {
          // Default for other sports
          const homeScore = Math.floor(Math.random() * 5);
          const awayScore = Math.floor(Math.random() * 5);
          finalScore = `${pick.awayTeam || 'Away'} ${awayScore} - ${homeScore} ${pick.homeTeam || 'Home'}`;
        }
        
        return {
          outcome: randomOutcome,
          final_score: finalScore
        };
      }
      
      return null; // Game not finished yet
    } catch (error) {
      console.error('Error fetching game result:', error);
      return null;
    }
  }
};

// Auto-initialize on import if in browser environment
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => resultsService.initialize(), 1000);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => resultsService.initialize(), 1000);
    });
  }
}
