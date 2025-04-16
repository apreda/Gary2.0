/**
 * Service for managing the persistence of picks data
 * Ensures picks are properly saved and retrieved across sessions and users
 */
import { supabase, ensureAnonymousSession } from '../supabaseClient';

export const picksPersistenceService = {
  /**
   * Save picks to both localStorage and Supabase
   * @param {Array} picks - Array of picks to store
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  savePicks: async (picks) => {
    try {
      if (!picks || !Array.isArray(picks) || picks.length === 0) {
        console.error('Cannot save invalid picks data');
        return false;
      }

      // 1. Save to localStorage with timestamp
      const timestamp = new Date().toISOString();
      localStorage.setItem('dailyPicksTimestamp', timestamp);
      localStorage.setItem('dailyPicks', JSON.stringify(picks));
      
      // 2. Save to Supabase for multi-user sharing
      await ensureAnonymousSession();
      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Check if entry for today exists
      const { data: existingData } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', dateString)
        .single();
      
      if (existingData) {
        // Update existing entry
        await supabase
          .from('daily_picks')
          .update({ 
            picks: picks,
            updated_at: timestamp
          })
          .eq('date', dateString);
      } else {
        // Create new entry
        await supabase
          .from('daily_picks')
          .insert([
            { 
              date: dateString, 
              picks: picks,
              created_at: timestamp,
              updated_at: timestamp
            }
          ]);
      }
      
      console.log('Picks saved successfully to both localStorage and Supabase');
      return true;
    } catch (error) {
      console.error('Error saving picks:', error);
      return false;
    }
  },
  
  /**
   * Load picks from the most reliable source (Supabase or localStorage)
   * @returns {Promise<Array|null>} - Array of picks or null if not found
   */
  loadPicks: async () => {
    try {
      // 1. Check Supabase first (most up-to-date across users)
      await ensureAnonymousSession();
      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', dateString)
        .single();
      
      if (!error && data && data.picks && Array.isArray(data.picks) && data.picks.length > 0) {
        console.log('Loaded picks from Supabase');
        
        // Update localStorage for offline access
        localStorage.setItem('dailyPicksTimestamp', data.updated_at);
        localStorage.setItem('dailyPicks', JSON.stringify(data.picks));
        
        return data.picks;
      }
      
      // 2. Fall back to localStorage if Supabase fails
      const localPicks = localStorage.getItem('dailyPicks');
      const localTimestamp = localStorage.getItem('dailyPicksTimestamp');
      
      if (localPicks && localTimestamp) {
        const parsedPicks = JSON.parse(localPicks);
        const pickDate = new Date(localTimestamp).toISOString().split('T')[0];
        
        // Only use local picks if they're from today
        if (pickDate === dateString && Array.isArray(parsedPicks) && parsedPicks.length > 0) {
          console.log('Loaded picks from localStorage');
          return parsedPicks;
        }
      }
      
      console.log('No valid picks found for today');
      return null;
    } catch (error) {
      console.error('Error loading picks:', error);
      
      // Last resort - try localStorage directly
      try {
        const localPicks = localStorage.getItem('dailyPicks');
        if (localPicks) {
          return JSON.parse(localPicks);
        }
      } catch (e) {
        console.error('Error parsing localStorage picks:', e);
      }
      
      return null;
    }
  },
  
  /**
   * Check if picks exist for today
   * @returns {Promise<boolean>} - Whether picks exist for today
   */
  picksExistForToday: async () => {
    try {
      const picks = await picksPersistenceService.loadPicks();
      return !!picks && Array.isArray(picks) && picks.length > 0;
    } catch (error) {
      console.error('Error checking if picks exist:', error);
      return false;
    }
  },
  
  /**
   * Clear picks data from all storage
   * Should only be used for testing or admin purposes
   */
  clearPicksData: async () => {
    try {
      // Clear localStorage
      localStorage.removeItem('dailyPicks');
      localStorage.removeItem('dailyPicksTimestamp');
      
      // Clear Supabase entry for today
      await ensureAnonymousSession();
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      
      await supabase
        .from('daily_picks')
        .delete()
        .eq('date', dateString);
        
      console.log('Picks data cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing picks data:', error);
      return false;
    }
  }
};

export default picksPersistenceService;
