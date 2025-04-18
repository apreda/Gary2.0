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

      // No longer using localStorage to ensure consistent behavior across all devices
      const timestamp = new Date().toISOString();
      console.log('Skipping localStorage - using only Supabase for universal access');
      
      // 2. Try to save to Supabase for multi-user sharing
      try {
        // Verify Supabase connection
        const connectionVerified = await ensureAnonymousSession();
        if (!connectionVerified) {
          console.warn('Supabase connection could not be verified, skipping database save');
          return false; // Return failure since we no longer use localStorage as fallback
        }
        
        const today = new Date();
        const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
        console.log('Attempting to save picks for date:', dateString);
        
        // Check if entry for today exists
        // Use PostgreSQL date format with quotes to ensure correct handling
        const { data: existingData, error: checkError } = await supabase
          .from('daily_picks')
          .select('*')
          .filter('date', 'eq', dateString)
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
            return false; // Return failure since we no longer use localStorage as fallback
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
            return false; // Return failure since we no longer use localStorage as fallback
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
            .filter('date', 'eq', dateString)
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
      
      // No longer using localStorage fallback - we only rely on Supabase
      // This ensures consistent behavior across all devices and browsers
      
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
      // No longer checking localStorage - only using Supabase
      // This ensures consistent behavior across all devices
      
      // Check Supabase for today's picks
      try {
        const connectionVerified = await ensureAnonymousSession();
        if (connectionVerified) {
          const today = new Date();
          const dateString = today.toISOString().split('T')[0];
          
          const { data, error } = await supabase
            .from('daily_picks')
            .select('id')
            .filter('date', 'eq', dateString)
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
      // No longer using localStorage
      // Only clearing Supabase data
      
      // Clear Supabase entry for today
      await ensureAnonymousSession();
      const today = new Date();
      const dateString = today.toISOString().split('T')[0];
      
      await supabase
        .from('daily_picks')
        .delete()
        .filter('date', 'eq', dateString);
        
      console.log('Picks data cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing picks data:', error);
      return false;
    }
  }
};

export default picksPersistenceService;
