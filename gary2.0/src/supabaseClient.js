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
 * FIXED: Merge picks instead of deleting existing picks
 * This ensures we don't lose NHL/NCAAB picks when NBA runs later
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

  // 1. Fetch existing picks for this date to MERGE instead of deleting
  console.log(`STORAGE FIX: Fetching existing picks for ${dateString} to merge...`);
  let existingPicks = [];
  try {
    const response = await axios({
      method: 'GET',
      url: `${supabaseUrl}/rest/v1/daily_picks`,
      params: {
        date: `eq.${dateString}`,
        select: '*'
      },
      headers: {
        'apikey': adminKey,
        'Authorization': `Bearer ${adminKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.length > 0) {
      const existing = response.data[0];
      existingPicks = Array.isArray(existing.picks) ? existing.picks : 
                     (typeof existing.picks === 'string' ? JSON.parse(existing.picks) : []);
      console.log(`Found ${existingPicks.length} existing picks to merge`);
    } else {
      console.log('No existing picks found, will create new entry');
    }
  } catch (fetchError) {
    console.warn('Could not fetch existing picks, will insert as new:', fetchError.message);
  }

  // 2. MERGE: Dedupe by game (homeTeam + awayTeam + league), prefer new picks
  const gameKey = (p) => {
    if (p?.type === 'prop' || p?.pickType === 'prop') {
      // Props: dedupe by player + prop
      return `prop|${p.league || ''}|${p.player || ''}|${p.prop || p.statType || ''}`;
    }
    // Game picks: ONE per game
    return `game|${p.league || ''}|${p.homeTeam || ''}|${p.awayTeam || ''}`;
  };

  const newKeys = new Set(sanitizedPicks.map(gameKey));
  const filteredExisting = existingPicks.filter(p => !newKeys.has(gameKey(p)));
  const mergedPicks = [...filteredExisting, ...sanitizedPicks];
  
  console.log(`MERGE: ${filteredExisting.length} kept + ${sanitizedPicks.length} new = ${mergedPicks.length} total`);

  // 3. Store merged picks (upsert if exists, insert if new)
  try {
    if (existingPicks.length > 0) {
      // Update existing row
      console.log(`STORAGE FIX: Updating existing row with ${mergedPicks.length} merged picks...`);
      await axios({
        method: 'PATCH',
        url: `${supabaseUrl}/rest/v1/daily_picks`,
        params: {
          date: `eq.${dateString}`
        },
        data: {
          picks: mergedPicks,
          updated_at: new Date().toISOString()
        },
        headers: {
          'apikey': adminKey,
          'Authorization': `Bearer ${adminKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      console.log('STORAGE FIX: Successfully updated merged picks');
    } else {
      // Insert new row
      console.log(`STORAGE FIX: Inserting new row with ${mergedPicks.length} picks...`);
      await axios({
        method: 'POST',
        url: `${supabaseUrl}/rest/v1/daily_picks`,
        data: {
          date: dateString,
          picks: mergedPicks,
          created_at: new Date().toISOString()
        },
        headers: {
          'apikey': adminKey,
          'Authorization': `Bearer ${adminKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      console.log('STORAGE FIX: Successfully inserted new picks');
    }

    return { success: true, merged: mergedPicks.length };
  } catch (storageError) {
    console.error('Storage operation failed:', storageError.message);
    return { 
      error: 'Storage failed', 
      message: storageError.message, 
      success: false 
    };
  }
}