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

// TRANSIENT-FAILURE RETRY (Sep 18 2026). Supabase sits behind Cloudflare, and
// a connection timeout there returns an HTML 522 error page — 59 of them in
// one log, alongside bare `TypeError: fetch failed`. Neither is a data answer,
// but with the default fetch both surfaced to callers as a failed read, and
// lanes like the Winners reader and the board coverage check simply died.
//
// READS ONLY, DELIBERATELY. A 522 means the connection timed out, which does
// NOT tell us whether the server already applied the request. Retrying a POST
// or PATCH on that signal risks writing the row twice, so only GET/HEAD are
// replayed here; writes still fail loudly and keep their existing handling.
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);
const RETRYABLE_METHODS = new Set(['GET', 'HEAD']);
const MAX_RETRIES = 3;

const retryDelayMs = (attempt, retryAfterHeader) => {
  // `Retry-After: 0` means retry NOW, so honor an explicit 0 rather than
  // treating the header as falsy and backing off anyway.
  if (retryAfterHeader != null && retryAfterHeader !== '') {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  }
  const base = 250 * Math.pow(2, attempt);      // 250ms, 500ms, 1s
  return base + Math.floor(Math.random() * 250); // jitter so parallel lanes don't resync
};

export async function fetchWithRetry(input, init = {}) {
  const method = String(init?.method || 'GET').toUpperCase();
  const retryable = RETRYABLE_METHODS.has(method);
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const resp = await fetch(input, init);
      if (!retryable || !RETRYABLE_STATUS.has(resp.status) || attempt === MAX_RETRIES) return resp;
      const wait = retryDelayMs(attempt, resp.headers?.get?.('retry-after'));
      console.warn(`[Supabase] ${method} ${resp.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    } catch (error) {
      lastError = error;
      if (!retryable || attempt === MAX_RETRIES) throw error;
      const wait = retryDelayMs(attempt, null);
      console.warn(`[Supabase] ${method} ${error?.message || error} — retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError || new Error('[Supabase] retries exhausted');
}

// Create Supabase client with proper options
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true
  },
  global: { fetch: fetchWithRetry }
})

// Service-role client for server-side pipeline writes that RLS blocks for the
// anon key (pipeline-only tables the app never touches).
// daily_picks already bypasses RLS via the direct-REST storeDailyPicks helper;
// this gives the supabase-js write paths the same admin access. Falls back to
// the anon client when no service key is set (writes will then hit RLS).
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchWithRetry }
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