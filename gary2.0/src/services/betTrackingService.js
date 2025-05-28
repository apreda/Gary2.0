import { supabase } from '../supabaseClient';

// Service for tracking user bet decisions and results
export const betTrackingService = {
  // Save a user's bet decision (bet or fade) to both Supabase and localStorage
  saveBetDecision: async (pickId, decision, userId = null) => {
    try {
      console.log('[betTrackingService] Saving decision:', { pickId, decision, userId });
      
      // First, save to Supabase user_picks table if user is authenticated
      if (userId) {
        // Check if user already made a decision for this pick
        const { data: existingDecision, error: checkError } = await supabase
          .from('user_picks')
          .select('id, decision')
          .eq('user_id', userId)
          .eq('pick_id', pickId)
          .maybeSingle();
        
        if (checkError) {
          console.error('[betTrackingService] Error checking existing decision:', checkError);
          throw checkError;
        }
        
        if (existingDecision) {
          console.log('[betTrackingService] User already made decision:', existingDecision.decision);
          return { 
            success: false, 
            error: `You already chose to ${existingDecision.decision.toUpperCase()} this pick!`,
            existingDecision: existingDecision.decision
          };
        }
        
        // Insert new decision
        const { error: supabaseError } = await supabase
          .from('user_picks')
          .insert([
            {
              user_id: userId,
              pick_id: pickId,
              decision: decision,
              outcome: null, // Will be updated when results are processed
              created_at: new Date().toISOString()
            }
          ]);
        
        if (supabaseError) {
          console.error('[betTrackingService] Supabase error:', supabaseError);
          throw supabaseError;
        }
        
        console.log('[betTrackingService] Successfully saved to user_picks table');
      }
      
      // Also save to localStorage for immediate UI updates
      const savedDecisions = localStorage.getItem('userPickDecisions') || '{}';
      const decisions = JSON.parse(savedDecisions);
      
      // Add new decision
      decisions[pickId] = {
        decision,
        timestamp: new Date().toISOString(),
        result: null // Result will be updated when game completes
      };
      
      // Save back to localStorage
      localStorage.setItem('userPickDecisions', JSON.stringify(decisions));
      
      // Update BetCard stats
      betTrackingService.updateBetCardStats(decision);
      
      console.log('[betTrackingService] Decision saved successfully to both Supabase and localStorage');
      return { success: true };
    } catch (error) {
      console.error('Error saving bet decision:', error);
      return { success: false, error };
    }
  },
  
  // Get all user's bet decisions
  getBetDecisions: () => {
    try {
      const savedDecisions = localStorage.getItem('userPickDecisions') || '{}';
      return JSON.parse(savedDecisions);
    } catch (error) {
      console.error('Error getting bet decisions:', error);
      return {};
    }
  },
  
  // Check if user has already made a decision for a specific pick
  hasUserMadeDecision: async (pickId, userId = null) => {
    try {
      // First check local storage
      const savedDecisions = localStorage.getItem('userPickDecisions') || '{}';
      const decisions = JSON.parse(savedDecisions);
      
      if (decisions[pickId]) {
        return {
          hasMade: true,
          decision: decisions[pickId].decision
        };
      }
      
      // If not found locally and user is logged in, check user_stats in Supabase
      if (userId) {
        const { data } = await supabase
          .from('user_stats')
          .select('recent_results')
          .eq('id', userId)
          .maybeSingle();
        
        if (data && data.recent_results) {
          // Check if this pick is in recent_results
          const matchingResult = data.recent_results.find(result => result.pick_id === pickId);
          
          if (matchingResult) {
            // Update local storage for next time
            decisions[pickId] = {
              decision: matchingResult.decision,
              timestamp: matchingResult.timestamp,
              result: null
            };
            localStorage.setItem('userPickDecisions', JSON.stringify(decisions));
            
            return {
              hasMade: true,
              decision: matchingResult.decision
            };
          }
        }
      }
      
      return { hasMade: false };
    } catch (error) {
      console.error('Error checking user decision:', error);
      return { hasMade: false, error };
    }
  },
  
  // Update the BetCard stats
  updateBetCardStats: (decision) => {
    try {
      // Get existing BetCard tracking data from localStorage
      const savedTracking = localStorage.getItem('garyBetTracking') || JSON.stringify({
        betsWithGary: 0,
        betsAgainstGary: 0,
        totalBets: 0,
        correctDecisions: 0,
        currentStreak: 0,
        picks: []
      });
      
      const tracking = JSON.parse(savedTracking);
      
      // Update counts based on decision
      if (decision === 'ride') {
        tracking.betsWithGary += 1;
      } else if (decision === 'fade') {
        tracking.betsAgainstGary += 1;
      }
      
      // Update total bets
      tracking.totalBets += 1;
      
      // Add to picks history (limited to last 10)
      tracking.picks.unshift({
        decision,
        timestamp: new Date().toISOString(),
        result: null
      });
      
      if (tracking.picks.length > 10) {
        tracking.picks = tracking.picks.slice(0, 10);
      }
      
      // Save updated tracking data
      localStorage.setItem('garyBetTracking', JSON.stringify(tracking));
      
      console.log('Updated BetCard stats:', tracking);
      return tracking;
    } catch (error) {
      console.error('Error updating BetCard stats:', error);
      return null;
    }
  },
  
  // Track game result and update user's bet performance
  updateBetResult: async (pickId, gameResult, userId = null) => {
    try {
      // Get existing decisions
      const savedDecisions = localStorage.getItem('userPickDecisions') || '{}';
      const decisions = JSON.parse(savedDecisions);
      
      // If user made a decision on this pick
      if (decisions[pickId]) {
        const userDecision = decisions[pickId].decision;
        let userResult;
        
        // User rode with Gary
        if (userDecision === 'ride') {
          userResult = gameResult; // WIN, LOSS, PUSH
        }
        // User faded Gary
        else if (userDecision === 'fade') {
          // If Gary won, user lost by fading
          if (gameResult === 'WIN') {
            userResult = 'LOSS';
          }
          // If Gary lost, user won by fading
          else if (gameResult === 'LOSS') {
            userResult = 'WIN';
          }
          // If push, still a push
          else {
            userResult = 'PUSH';
          }
        }
        
        // Update decision with result
        decisions[pickId].result = userResult;
        
        // Save updated results
        localStorage.setItem('userPickDecisions', JSON.stringify(decisions));
        
        // Update BetCard with result
        betTrackingService.updateBetCardWithResult(userDecision, userResult);
        
        // If user is logged in, update the result in the user's recent_results in user_stats
        if (userId) {
          // First get the current user stats
          const { data } = await supabase
            .from('user_stats')
            .select('recent_results')
            .eq('id', userId)
            .maybeSingle();
          
          if (data && data.recent_results) {
            // Find the matching pick in recent_results and update it
            const updatedRecentResults = data.recent_results.map(result => {
              if (result.pick_id === pickId) {
                return {
                  ...result,
                  result: userResult,
                  result_pending: false
                };
              }
              return result;
            });
            
            // Update user_stats with the modified recent_results
            await supabase
              .from('user_stats')
              .update({
                recent_results: updatedRecentResults,
                // Also update win_count if it's a win
                ...(userResult === 'WIN' ? { win_count: supabase.sql`win_count + 1` } : {}),
                // Update loss_count if it's a loss
                ...(userResult === 'LOSS' ? { loss_count: supabase.sql`loss_count + 1` } : {}),
                updated_at: new Date().toISOString()
              })
              .eq('id', userId);
          }
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating bet result:', error);
      return { success: false, error };
    }
  },
  
  // Update BetCard with game result
  updateBetCardWithResult: (decision, result) => {
    try {
      // Get existing BetCard tracking
      const savedTracking = localStorage.getItem('garyBetTracking');
      if (!savedTracking) return;
      
      const tracking = JSON.parse(savedTracking);
      
      // Update correctDecisions count
      if (result === 'WIN') {
        tracking.correctDecisions += 1;
        tracking.currentStreak = Math.max(0, tracking.currentStreak) + 1;
      } else if (result === 'LOSS') {
        tracking.currentStreak = Math.min(0, tracking.currentStreak) - 1;
      }
      
      // Update the most recent pick with the result
      if (tracking.picks.length > 0) {
        for (let i = 0; i < tracking.picks.length; i++) {
          if (tracking.picks[i].decision === decision && tracking.picks[i].result === null) {
            tracking.picks[i].result = result;
            break;
          }
        }
      }
      
      // Save updated tracking
      localStorage.setItem('garyBetTracking', JSON.stringify(tracking));
      
      return tracking;
    } catch (error) {
      console.error('Error updating BetCard with result:', error);
      return null;
    }
  },
  
  // Get user's betting record
  getBettingRecord: () => {
    try {
      const savedDecisions = localStorage.getItem('userPickDecisions') || '{}';
      const decisions = JSON.parse(savedDecisions);
      
      // Initialize counts
      let wins = 0;
      let losses = 0;
      let pushes = 0;
      let pending = 0;
      
      // Count each type
      Object.values(decisions).forEach(bet => {
        if (bet.result === 'WIN') wins++;
        else if (bet.result === 'LOSS') losses++;
        else if (bet.result === 'PUSH') pushes++;
        else pending++;
      });
      
      return { wins, losses, pushes, pending };
    } catch (error) {
      console.error('Error getting betting record:', error);
      return { wins: 0, losses: 0, pushes: 0, pending: 0 };
    }
  }
};
