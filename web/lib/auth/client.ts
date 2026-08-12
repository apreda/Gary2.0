'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client (singleton per tab). Cookie-based storage via
 * @supabase/ssr so the server sees the same session — do NOT use
 * createClient from supabase-js directly here, it stores in localStorage
 * and the server would think you're signed out.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
