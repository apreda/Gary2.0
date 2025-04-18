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

      // 1. Save to localStorage with timestamp (Always works as fallback)
      const timestamp = new Date().toISOString();
      localStorage.setItem('dailyPicksTimestamp', timestamp);
      localStorage.setItem('dailyPicks', JSON.stringify(picks));
      console.log('Picks saved to localStorage successfully');
      
      // 2. Try to save to Supabase for multi-user sharing
      try {
        // Verify Supabase connection
        const connectionVerified = await ensureAnonymousSession();
        if (!connectionVerified) {
          console.warn('Supabase connection could not be verified, skipping database save');
          return true; // Still return success because localStorage worked
        }
        
        const today = new Date();
        const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
        console.log('Attempting to save picks for date:', dateString);
        
        // Check if entry for today exists
        const { data: existingData, error: checkError } = await supabase
          .from('daily_picks')
          .select('*')
          .eq('date', dateString)
          .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
          console.error('Error checking for existing data:', checkError);
          // Continue with localStorage only
          return true;
        }
        
        if (existingData) {
          // Update existing entry
          console.log('Updating existing entry in Supabase');
          const { error: updateError } = await supabase
            .from('daily_picks')
            .update({ 
              picks: picks,
              updated_at: timestamp
            })
            .eq('date', dateString);
            
          if (updateError) {
            console.error('Error updating picks in Supabase:', updateError);
            return true; // Still return success because localStorage worked
          }
        } else {
          // Create new entry
          console.log('Creating new entry in Supabase');
          const { error: insertError } = await supabase
            .from('daily_picks')
            .insert([
              { 
                date: dateString, 
                picks: picks,
                created_at: timestamp,
                updated_at: timestamp
              }
            ]);
            
          if (insertError) {
            console.error('Error inserting picks in Supabase:', insertError);
            return true; // Still return success because localStorage worked
          }
        }
        
        // Verify data was saved
        const { data: verifyData, error: verifyError } = await supabase
          .from('daily_picks')
          .select('*')
          .eq('date', dateString)
          .single();
          
        if (verifyError) {
          console.error('Error verifying picks were saved:', verifyError);
        } else if (!verifyData || !verifyData.picks) {
          console.error('Picks verification failed - data missing or empty');
        } else {
          console.log('Picks saved to Supabase successfully');
        }
        
        return true;
      } catch (supabaseError) {
        console.error('Error saving to Supabase:', supabaseError);
        return true; // Still return success because localStorage worked
      }
    } catch (error) {
      console.error('Error saving picks:', error);
      return false;
    }
  },
  
  /**
   * Load picks from localStorage or Supabase
   * @returns {Promise<Array>} - Array of picks or empty array if none
   */
  loadPicks: async () => {
    try {
      console.log('Loading picks from persistence service...');
      
      // The Supabase entry has been manually cleared, so new picks will be generated
      // with the updated formatting
      
      // Get the current date in YYYY-MM-DD format
      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Try to load from Supabase first (preferred source of truth for multi-user)
      try {
        // Ensure anonymous session for Supabase access
        const connectionVerified = await ensureAnonymousSession();
        if (connectionVerified) {
          const { data, error } = await supabase
            .from('daily_picks')
            .select('*')
            .eq('date', dateString)
            .single();
          
          if (!error && data && data.picks && Array.isArray(data.picks) && data.picks.length > 0) {
            console.log(`Loaded ${data.picks.length} picks from Supabase`);
            return data.picks;
          } else {
            console.log('No valid picks found in Supabase for today');
          }
        }
      } catch (supabaseError) {
        console.error('Error retrieving picks from Supabase:', supabaseError);
      }
      
      // Fall back to localStorage if Supabase fails or has no data
      const savedPicksJson = localStorage.getItem('dailyPicks');
      if (savedPicksJson) {
        try {
          const savedPicks = JSON.parse(savedPicksJson);
          if (Array.isArray(savedPicks) && savedPicks.length > 0) {
            console.log(`Loaded ${savedPicks.length} picks from localStorage`);
            // Also sync these to Supabase to help with persistence
            try {
              await picksPersistenceService.savePicks(savedPicks);
            } catch (syncError) {
              console.error('Error syncing localStorage picks to Supabase:', syncError);
            }
            return savedPicks;
          }
        } catch (parseError) {
          console.error('Error parsing picks from localStorage:', parseError);
        }
      }
      
      console.log('No saved picks found in any storage');
      return [];
    } catch (error) {
      console.error('Error loading picks:', error);
      return [];
    }
  },
  
  /**
   * Check if picks exist for today
   * @returns {Promise<boolean>} - Whether picks exist for today
   */
  picksExistForToday: async () => {
    try {
      // First check localStorage since it's faster
      const localPicks = localStorage.getItem('dailyPicks');
      const localTimestamp = localStorage.getItem('dailyPicksTimestamp');
      
      if (localPicks && localTimestamp) {
        try {
          const parsedPicks = JSON.parse(localPicks);
          const today = new Date();
          const dateString = today.toISOString().split('T')[0];
          const pickDate = new Date(localTimestamp).toISOString().split('T')[0];
          
          if (pickDate === dateString && Array.isArray(parsedPicks) && parsedPicks.length > 0) {
            console.log('Picks exist in localStorage for today');
            return true;
          }
        } catch (parseError) {
          console.error('Error parsing local picks during existence check:', parseError);
        }
      }
      
      // Check Supabase for today's picks
      try {
        const connectionVerified = await ensureAnonymousSession();
        if (connectionVerified) {
          const today = new Date();
          const dateString = today.toISOString().split('T')[0];
          
          const { data, error } = await supabase
            .from('daily_picks')
            .select('id')
            .eq('date', dateString)
            .limit(1);
          
          if (!error && data && data.length > 0) {
            console.log('Picks exist in Supabase for today');
            return true;
          }
        }
      } catch (supabaseError) {
        console.error('Error checking Supabase for picks:', supabaseError);
      }
      
      // If we get here, no picks found in any source
      console.log('No picks exist for today from any source');
      return false;
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
