import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Session refresh on every app request (Next 16 proxy — the middleware
 * convention was renamed). Supabase auth tokens expire hourly; getUser()
 * here refreshes them and re-sets the cookies so Server Components always
 * see a live session. No routing logic — pages decide their own gating.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh only when a session cookie exists — anonymous readers (most of
  // the site's traffic) skip the GoTrue round-trip entirely.
  const hasSession = request.cookies.getAll().some(c => c.name.startsWith('sb-'));
  if (hasSession) await supabase.auth.getUser();

  return response;
}

export const config = {
  // Static assets and Next internals never need a session refresh.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|brand/|press/|.*\\.(?:png|jpg|svg|ico|webmanifest)$).*)'],
};
