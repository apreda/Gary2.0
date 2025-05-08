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
      
      // Update BetCard stats
      betTrackingService.updateBetCardStats(decision);
      
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
      
      // If not found locally and user is logged in, check Supabase
      if (userId) {
        const { data } = await supabase
          .from('user_picks')
          .select('decision')
          .eq('user_id', userId)
          .eq('pick_id', pickId)
          .maybeSingle();
        
        if (data) {
          // Update local storage for next time
          decisions[pickId] = {
            decision: data.decision,
            timestamp: new Date().toISOString(),
            result: null
          };
          localStorage.setItem('userPickDecisions', JSON.stringify(decisions));
          
          return {
            hasMade: true,
            decision: data.decision
          };
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
        
        // If user is logged in, update Supabase too
        if (userId) {
          await supabase
            .from('user_picks')
            .update({ 
              result: userResult,
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
