import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/**
 * Cookie-backed Supabase client for Server Components, Server Actions, and
 * Route Handlers. Same GoTrue project as the iOS app (AuthManager.swift), so a
 * user who signed in on the app IS the same auth.uid() here — user_picks /
 * user_bets rows written from either surface belong to one identity.
 *
 * `setAll` throws inside Server Components (cookies are read-only there);
 * that's fine — proxy.ts owns the session refresh, so the catch is safe.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component render — proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws. */
export async function currentUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
