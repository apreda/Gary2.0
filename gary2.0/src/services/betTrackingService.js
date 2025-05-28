import { supabase } from '../supabaseClient';

// Service for tracking user bet decisions and results - PRODUCTION READY (No localStorage)
export const betTrackingService = {
  // Save a user's bet decision (bet or fade) to Supabase only
  saveBetDecision: async (pickId, decision, userId = null) => {
    try {
      console.log('[betTrackingService] Saving decision:', { pickId, decision, userId });
      
      if (!userId) {
        return { success: false, error: 'User authentication required' };
      }
      
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
      return { success: true };
    } catch (error) {
      console.error('Error saving bet decision:', error);
      return { success: false, error: error.message || 'Failed to save decision' };
    }
  },
  
  // Get all user's bet decisions from Supabase
  getBetDecisions: async (userId) => {
    try {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('user_picks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting bet decisions:', error);
      return [];
    }
  },
  
  // Check if user has already made a decision for a specific pick
  hasUserMadeDecision: async (pickId, userId = null) => {
    try {
      if (!userId) {
        return { hasMade: false };
      }
      
      const { data, error } = await supabase
        .from('user_picks')
        .select('decision')
        .eq('user_id', userId)
        .eq('pick_id', pickId)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking user decision:', error);
        return { hasMade: false, error };
      }
      
      if (data) {
        return {
          hasMade: true,
          decision: data.decision
        };
      }
      
      return { hasMade: false };
    } catch (error) {
      console.error('Error checking user decision:', error);
      return { hasMade: false, error };
    }
  },
  
  // Get user's betting record from Supabase
  getBettingRecord: async (userId) => {
    try {
      if (!userId) {
        return { wins: 0, losses: 0, pushes: 0, pending: 0 };
      }
      
      const { data, error } = await supabase
        .from('user_picks')
        .select('outcome')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      // Initialize counts
      let wins = 0;
      let losses = 0;
      let pushes = 0;
      let pending = 0;
      
      // Count each type
      data.forEach(pick => {
        if (pick.outcome === 'won') wins++;
        else if (pick.outcome === 'lost') losses++;
        else if (pick.outcome === 'push') pushes++;
        else pending++;
      });
      
      return { wins, losses, pushes, pending };
    } catch (error) {
      console.error('Error getting betting record:', error);
      return { wins: 0, losses: 0, pushes: 0, pending: 0 };
    }
  },
  
  // Get user's recent picks with details
  getRecentPicks: async (userId, limit = 10) => {
    try {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('user_picks')
        .select(`
          *,
          daily_picks!inner(picks)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting recent picks:', error);
      return [];
    }
  },
  
  // Get user statistics from user_stats table
  getUserStats: async (userId) => {
    try {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting user stats:', error);
      return null;
    }
  }
};
