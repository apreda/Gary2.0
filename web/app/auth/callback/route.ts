import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/auth/server';

/**
 * OAuth landing (Google now; Apple when its web service ID is configured).
 * Supabase redirects here with ?code=; we exchange it for a session cookie
 * and bounce to `next` (default: the account page). Errors land back on
 * /account with a message rather than a dead end.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/account';

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL('/account?error=signin', url.origin));
}
