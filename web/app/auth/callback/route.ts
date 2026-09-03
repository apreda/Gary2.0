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
  const recovery = url.searchParams.get('flow') === 'recovery';
  const signupMethod = url.searchParams.get('signup_method');

  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = new URL(next, url.origin);
      const createdAt = data.user?.created_at ? Date.parse(data.user.created_at) : Number.NaN;
      const recentAccount = Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt <= 26 * 60 * 60 * 1000;
      const analyticsGranted = request.headers.get('cookie')
        ?.split(';')
        .some(value => value.trim() === 'gary_analytics_consent=granted');
      if (analyticsGranted && recentAccount && (signupMethod === 'email' || signupMethod === 'google')) {
        destination.searchParams.set('_gary_signup', signupMethod);
      }
      return NextResponse.redirect(destination);
    }
  }

  const retry = new URL(recovery ? '/account/reset' : '/account', url.origin);
  retry.searchParams.set('error', recovery ? 'expired' : 'signin');
  if (recovery) {
    const updatePage = new URL(next, url.origin);
    retry.searchParams.set('next', safeNextPath(updatePage.searchParams.get('next')));
  } else {
    retry.searchParams.set('next', next);
  }
  return NextResponse.redirect(retry);
}
