'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createDeletionAwareCookieStore } from './browser-cookies';

/**
 * Browser Supabase client (singleton per tab). Cookie-based storage via
 * @supabase/ssr so the server sees the same session — do NOT use
 * createClient from supabase-js directly here, it stores in localStorage
 * and the server would think you're signed out.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;
let cookieStore: ReturnType<typeof createDeletionAwareCookieStore> | null = null;

export function supabaseBrowser() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    cookieStore = createDeletionAwareCookieStore(`sb-${new URL(url).hostname.split('.')[0]}-auth-token`);
    client = createBrowserClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: cookieStore.cookies },
    );
  }
  return client;
}

/** A verified deletion/revocation must survive this client's pending refresh. */
export function retireBrowserSessionOwner(ownerId: string) {
  supabaseBrowser();
  cookieStore!.retireOwner(ownerId);
}
