/**
 * Service for managing the persistence of picks data
 * Ensures picks are properly saved and retrieved across sessions and users
 * 
 * NOTE: This service is maintained for backward compatibility only.
 * Primary picks storage is now handled by picksService.js
 * which preserves the exact OpenAI output format.
 */
import { supabase, ensureAnonymousSession } from '../supabaseClient';

export const picksPersistenceService = {
  /**
   * Save picks to Supabase database
   * @param {Array} picks - Array of picks to store
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  savePicks: async (picks) => {
    try {
      if (!picks || !Array.isArray(picks) || picks.length === 0) {
        console.error('Cannot save invalid picks data');
        return false;
      }

      // Store in Supabase for universal access across all devices
      const timestamp = new Date().toISOString();
      
      // 2. Try to save to Supabase for multi-user sharing
      try {
        // Verify Supabase connection
        const connectionVerified = await ensureAnonymousSession();
        if (!connectionVerified) {
          console.warn('Supabase connection could not be verified, skipping database save');
          return false; // Return failure since we no longer use localStorage as fallback
        }
        
        // Use Eastern Time consistently for all date operations
        const today = new Date();
        // Convert to Eastern Time
        const easternTime = new Date(today.toLocaleString("en-US", {timeZone: "America/New_York"}));
        const dateString = easternTime.toISOString().split('T')[0]; // YYYY-MM-DD in Eastern Time
        console.log(`Saving picks with Eastern Time date: ${dateString}`);
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
          return false; // Cannot proceed without Supabase
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
        return false; // Cannot proceed without Supabase
      }
    } catch (error) {
      console.error('Error saving picks:', error);
      return false;
    }
  },
  
  /**
   * Load picks from Supabase database
   * @returns {Promise<Array>} - Array of picks or empty array if none
   */
  loadPicks: async () => {
    try {
      console.log('Loading picks from persistence service...');
      
      // Use Eastern Time consistently for all date operations
      const today = new Date();
      // Convert to Eastern Time
      const easternTime = new Date(today.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const dateString = easternTime.toISOString().split('T')[0]; // YYYY-MM-DD in Eastern Time
      const easternHour = easternTime.getHours();
      
      console.log(`Current Eastern Time: ${easternTime.toLocaleString()} (Hour: ${easternHour})`);
      
      // Before 10am EST, always use yesterday's picks if available
      if (easternHour < 10) {
        console.log("It's before 10am Eastern Time - looking for yesterday's picks");
        
        // Calculate yesterday's date
        const yesterday = new Date(easternTime);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toISOString().split('T')[0];
        console.log(`Looking for picks from previous day: ${yesterdayString}`);
        
        // Try to load yesterday's picks from Supabase
        try {
          // Ensure anonymous session for Supabase access
          const connectionVerified = await ensureAnonymousSession();
          if (connectionVerified) {
            const { data: yesterdayData, error: yesterdayError } = await supabase
              .from('daily_picks')
              .select('*')
              .filter('date', 'eq', yesterdayString)
              .single();
            
            if (!yesterdayError && yesterdayData && yesterdayData.picks && 
                Array.isArray(yesterdayData.picks) && yesterdayData.picks.length > 0) {
              console.log(`Loaded ${yesterdayData.picks.length} picks from previous day (${yesterdayString}) since it's before 10am`);
              return yesterdayData.picks;
            } else {
              console.log(`No valid picks found for previous day ${yesterdayString}`);
              // If yesterday's picks aren't available, only then check for today's picks
            }
          }
        } catch (supabaseError) {
          console.error('Error retrieving previous day picks from Supabase:', supabaseError);
        }
      }
      
      // If it's after 10am or if no picks found for yesterday before 10am, try today's picks
      console.log(`Looking for picks from today: ${dateString}`);
      
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
            console.log(`Loaded ${data.picks.length} picks from today (${dateString})`);
            return data.picks;
          } else {
            console.log(`No valid picks found for today (${dateString})`);
          }
        }
      } catch (supabaseError) {
        console.error('Error retrieving today\'s picks from Supabase:', supabaseError);
      }
      
      console.log('No saved picks found in any storage for either yesterday or today');
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
      // Use Eastern Time consistently for all date operations
      const today = new Date();
      // Convert to Eastern Time
      const easternTime = new Date(today.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const dateString = easternTime.toISOString().split('T')[0];
      
      // Log Eastern Time information for debugging
      const easternHour = easternTime.getHours();
      console.log(`Current Eastern Time: ${easternTime.toLocaleString()} (Hour: ${easternHour})`);
      console.log(`Checking for picks with date: ${dateString} (Eastern Time)`);
      
      // Always use yesterday's picks before 10am Eastern Time, even if today's picks exist
      if (easternHour < 10) {
        console.log("It's before 10am Eastern Time - always using yesterday's picks if available");
        
        // If it's before 10am, check for yesterday's picks instead
        const yesterday = new Date(easternTime);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayString = yesterday.toISOString().split('T')[0];
        console.log(`Looking for previous day's picks with date: ${yesterdayString}`);
        
        // Only using Supabase for data consistency across all devices
        const connectionVerified = await ensureAnonymousSession();
        if (connectionVerified) {
          // Check for yesterday's picks
          const { data: yesterdayData, error: yesterdayError } = await supabase
            .from('daily_picks')
            .select('id')
            .filter('date', 'eq', yesterdayString)
            .limit(1);
          
          if (!yesterdayError && yesterdayData && yesterdayData.length > 0) {
            console.log(`Using picks from ${yesterdayString} since it's before 10am Eastern Time`);
            return true; // Pretend we have today's picks to prevent generation
          } else {
            console.log(`No picks found for previous day ${yesterdayString}`);
            // Fall through to check for today's picks
          }
        }
      }
      
      // Only using Supabase for data consistency across all devices
      try {
        const connectionVerified = await ensureAnonymousSession();
        if (connectionVerified) {
          const { data, error } = await supabase
            .from('daily_picks')
            .select('id')
            .filter('date', 'eq', dateString)
            .limit(1);
          
          if (!error && data && data.length > 0) {
            console.log(`Picks exist in Supabase for today (${dateString})`);
            return true;
          }
        }
      } catch (supabaseError) {
        console.error('Error checking Supabase for picks:', supabaseError);
      }
      
      // If we get here, no picks found in any source
      if (easternHour < 10) {
        console.log(`No picks found for yesterday or today, and it's before 10am. Will not generate new picks until 10am.`);
        return true; // Prevent generation before 10am even if no picks exist
      } else {
        console.log(`No picks exist for today (${dateString}) and it's after 10am - will generate new picks`);
        return false;
      }
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
      // Clear Supabase data
      
      // Clear Supabase entry for today
      await ensureAnonymousSession();
      
      // Use Eastern Time consistently for all date operations
      const today = new Date();
      // Convert to Eastern Time
      const easternTime = new Date(today.toLocaleString("en-US", {timeZone: "America/New_York"}));
      const dateString = easternTime.toISOString().split('T')[0]; // YYYY-MM-DD in Eastern Time
      console.log(`Clearing picks for Eastern Time date: ${dateString}`);
      
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
