import { supabase } from '../supabaseClient';

// Service for tracking user bet decisions and results
export const betTrackingService = {
  // Save a user's bet decision (ride or fade) to localStorage and Supabase if logged in
  saveBetDecision: async (pickId, decision, userId = null) => {
    try {
      // Get existing decisions from localStorage
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
      
      // If user is logged in, save to Supabase too
      if (userId) {
        await supabase
          .from('user_picks')
          .upsert({
            user_id: userId,
            pick_id: pickId,
            decision,
            created_at: new Date().toISOString()
          });
      }
      
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
  
  // Track game result and update user's bet performance
  updateBetResult: async (pickId, gameResult, userId = null) => {
    try {
      // Get existing decisions
      const savedDecisions = localStorage.getItem('userPickDecisions') || '{}';
      const decisions = JSON.parse(savedDecisions);
      
      // If user made a decision on this pick
      if (decisions[pickId]) {
        // User rode with Gary
        if (decisions[pickId].decision === 'ride') {
          decisions[pickId].result = gameResult; // WIN, LOSS, PUSH
        }
        // User faded Gary
        else if (decisions[pickId].decision === 'fade') {
          // If Gary won, user lost by fading
          if (gameResult === 'WIN') {
            decisions[pickId].result = 'LOSS';
          }
          // If Gary lost, user won by fading
          else if (gameResult === 'LOSS') {
            decisions[pickId].result = 'WIN';
          }
          // If push, still a push
          else {
            decisions[pickId].result = 'PUSH';
          }
        }
        
        // Save updated results
        localStorage.setItem('userPickDecisions', JSON.stringify(decisions));
        
        // If user is logged in, update Supabase too
        if (userId) {
          await supabase
            .from('user_picks')
            .update({ 
              result: decisions[pickId].result,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('pick_id', pickId);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating bet result:', error);
      return { success: false, error };
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
