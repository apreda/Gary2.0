import { createClient } from '@supabase/supabase-js'
import axios from 'axios';

// Properly use environment variables from .env file
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase configuration missing from environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
}

console.log('Initializing Supabase client with:', { url: supabaseUrl, keyLength: supabaseKey?.length });

// Create Supabase client with proper options
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
})

// Helper function to handle database access without requiring authentication
// This is used since anonymous auth is disabled in Supabase
export const ensureAnonymousSession = async () => {
  // Instead of signing in anonymously, we'll just verify the connection works
  try {
    // Test the connection with a simple query to a public table
    const { error } = await supabase
      .from('daily_picks')
      .select('count')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error verifying Supabase connection:', error);
      return false;
    }
    
    console.log('Supabase connection verified successfully');
    return true;
  } catch (error) {
    console.error('Failed to verify Supabase connection:', error);
    return false;
  }
}

/**
 * CRITICAL FIX: Specialized function for directly storing picks in the daily_picks table
 * Implementing direct API approach to bypass PostgreSQL JSON handling issues
 */
export const storeDailyPicks = async (dateString, picksArray) => {
  if (!dateString || !picksArray) {
    console.error('Missing required parameters for storeDailyPicks');
    return { error: 'Missing parameters', success: false };
  }

  // Ensure the picks array is properly sanitized
  let sanitizedPicks;
  try {
    // Remove circular references and functions to ensure clean JSON
    sanitizedPicks = JSON.parse(JSON.stringify(picksArray));
    console.log(`Successfully sanitized ${sanitizedPicks.length} picks`); 
  } catch (jsonError) {
    console.error('Error sanitizing picks:', jsonError);
    sanitizedPicks = picksArray; // Use original as fallback
  }

  // 1. Delete any existing entry for this date
  console.log(`STORAGE FIX: Removing existing daily picks for ${dateString}...`);
  try {
    await axios({
      method: 'DELETE',
      url: `${supabaseUrl}/rest/v1/daily_picks`,
      params: {
        date: `eq.${dateString}`
      },
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Successfully deleted any existing records');
  } catch (deleteError) {
    console.warn('Delete operation warning:', deleteError.message);
    // Continue anyway - the record might not exist yet
  }

  // 2. Add the new picks using direct REST endpoint
  console.log(`STORAGE FIX: Storing ${sanitizedPicks.length} picks via direct API...`);
  try {
    // Create minimal record to avoid PostgreSQL JSON handling issues
    const payload = {
      date: dateString,
      picks: JSON.stringify(sanitizedPicks) // Force string serialization
    };

    // Use axios for more reliable network handling
    const response = await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/daily_picks`,
      data: payload,
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });

    console.log('STORAGE FIX: Successfully stored picks via direct API');
    return { success: true };
  } catch (insertError) {
    console.error('Direct API insert failed:', insertError.message);
    
    // Try one more approach with a completely different payload structure
    try {
      console.log('STORAGE FIX: Trying final fallback approach...');
      
      // Create a very minimal structure that avoids all JSON parsing
      const textRecord = {
        date: dateString,
        picks_text: JSON.stringify(sanitizedPicks),
        picks_count: sanitizedPicks.length,
        created_at: new Date().toISOString()
      };
      
      // Use direct HTTP POST
      await axios({
        method: 'POST',
        url: `${supabaseUrl}/rest/v1/daily_picks`,
        data: textRecord,
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      
      console.log('STORAGE FIX: Fallback storage approach succeeded');
      return { success: true };
    } catch (fallbackError) {
      console.error('All storage approaches failed:', fallbackError.message);
      return { 
        error: 'All storage approaches failed', 
        message: fallbackError.message, 
        success: false 
      };
    }
  }
}