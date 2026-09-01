import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/auth/server';
import { safeNextPath } from '@/lib/auth/redirect';

/**
 * OAuth landing (Google now; Apple when its web service ID is configured).
 * Supabase redirects here with ?code=; we exchange it for a session cookie
 * and bounce to `next` (default: the account page). Errors land back on
 * /account with a message rather than a dead end.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  const retry = new URL('/account', url.origin);
  retry.searchParams.set('error', 'signin');
  retry.searchParams.set('next', next);
  return NextResponse.redirect(retry);
}
