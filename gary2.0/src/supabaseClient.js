import { createClient } from '@supabase/supabase-js'
import axios from 'axios';

// Node.js pipeline — env vars from process.env only (no browser/Vite branch)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Prefer service role key for server-side admin operations
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase configuration missing from environment variables');
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.');
}

// Create Supabase client with proper options
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  }
})

// Service-role client for server-side pipeline writes that RLS blocks for the
// anon key (e.g. pick_context — written only by the pipeline, never the app).
// daily_picks already bypasses RLS via the direct-REST storeDailyPicks helper;
// this gives the supabase-js write paths the same admin access. Falls back to
// the anon client when no service key is set (writes will then hit RLS).
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : supabase;

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