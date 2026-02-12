import { createClient } from '@supabase/supabase-js'
import axios from 'axios';

// Properly resolve environment variables for both browser (Vite) and Node.js scripts
const supabaseUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
  ? import.meta.env.VITE_SUPABASE_URL
  : process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

const supabaseKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
  ? import.meta.env.VITE_SUPABASE_ANON_KEY
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Prefer service role key for server-side admin operations
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase configuration missing from environment variables');
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY (server), or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (client).');
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

  // Use service role key when available to bypass RLS on server
  const adminKey = supabaseServiceKey || supabaseKey;

  // Atomic upsert — no separate DELETE (prevents data loss if INSERT fails)
  console.log(`STORAGE: Upserting ${sanitizedPicks.length} picks for ${dateString}...`);
  try {
    const payload = {
      date: dateString,
      picks: sanitizedPicks
    };

    const response = await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/daily_picks`,
      data: payload,
      headers: {
        'apikey': adminKey,
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      params: {
        on_conflict: 'date'
      }
    });

    console.log('STORAGE: Successfully upserted picks via direct API');
    return { success: true };
  } catch (insertError) {
    console.error('Direct API insert failed:', insertError.message);
    
    // Final attempt: try upserting using the same JSON shape
    try {
      console.log('STORAGE FIX: Trying upsert fallback...');
      const upsertPayload = [{ date: dateString, picks: sanitizedPicks }];
      await axios({
        method: 'POST',
        url: `${supabaseUrl}/rest/v1/daily_picks`,
        data: upsertPayload,
        headers: {
          'apikey': adminKey,
          'Authorization': `Bearer ${adminKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation,resolution=merge-duplicates'
        }
      });
      console.log('STORAGE FIX: Upsert fallback succeeded');
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